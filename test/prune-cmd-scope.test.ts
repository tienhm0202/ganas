import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { run as ganasPrune } from "../src/commands/prune.js";
import { writeState } from "../src/state.js";
import { GanasError } from "../src/util/errors.js";
import { cleanup, goal, makeProject, moduleYaml, scope } from "./helpers.js";

/**
 * `ganas prune --scope P-x` — lọc kế hoạch dọn về đúng MỘT phạm vi. Xem
 * docstring `applyScopeFilter` (src/commands/prune.ts) cho ngữ nghĩa quyết
 * theo schema của từng loại mục.
 *
 * Dựng project TẠM với HAI phạm vi (P-a, P-b), cả hai `delivered` (để task
 * archive được ngay không cần chờ tuổi — tầng 2 của D-012/T-077), cộng một
 * mục ephemeral mỗi loại (lock, run, session mồ côi, file icebox) và một cặp
 * đề xuất đã quyết — một của P-a, một của P-b.
 *
 * CLI không nhận `now` override (đúng như dùng thật, xem cùng cảnh báo ở
 * `test/prune.test.ts`), nên mọi mốc tuổi phải neo theo ĐỒNG HỒ THẬT.
 */

const DAY_MS = 86_400_000;

function realDaysAgo(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toISOString();
}

const LEDGER_LINE =
  JSON.stringify({
    target: "F-THU-001",
    kind: "probe",
    at: "2026-01-01T00:00:00Z",
    def: "abc",
    result: "pass",
    by: "@nguoi-thu",
  }) + "\n";

function ledgerFile(root: string): string {
  return join(root, ".ganas", "verify-ledger.jsonl");
}

function assertLedgerUntouched(root: string): void {
  assert.equal(
    readFileSync(ledgerFile(root), "utf8"),
    LEDGER_LINE,
    "sổ cái là tầng 3 — --scope không được đụng tới, dù lọc hay không lọc",
  );
}

function doneDesign(id = "D-001"): string {
  return `id: ${id}
title: "Design đã đóng"
serves:
  - G-001
summary: "Cách tiếp cận"
status: done
done_at: ${realDaysAgo(1)}
`;
}

function doneTask(id: string, taskScope: string): string {
  return `id: ${id}
title: "Task đã xong"
serves:
  - G-001
implements: D-001
scope: ${taskScope}
status: done
done_at: ${realDaysAgo(0)}
exit_contract:
  - kind: command
    run: "true"
`;
}

function decidedProposal(id: string, propScope: string): string {
  return `id: ${id}
title: "đề xuất thử"
scope: ${propScope}
problem: "vấn đề thử"
proposed_change: "sửa thử"
anchors:
  - "src/a.ts:1"
weight: 3
ease: 3
found_at: "2026-01-01T00:00:00Z"
status: approved
decided_by: "@nguoi-duyet"
decided_at: ${realDaysAgo(10)}
`;
}

function closedIceboxFile(): string {
  return `- id: ICE-001
  title: "phát hiện thử"
  found_at: "2026-01-01T00:00:00Z"
  weight: 3
  ease: 3
  why_deferred: "chưa tới lượt"
  anchors: ["src/a.ts#L1"]
  status: closed
  closed_at: ${realDaysAgo(10)}
  closed_reason: "hết cần"
`;
}

async function writeLock(root: string, name: string, sessionId: string, claimedAt: string): Promise<string> {
  const dir = join(root, ".ganas", ".locks");
  await mkdir(dir, { recursive: true });
  const file = join(dir, name);
  await writeFile(file, JSON.stringify({ session_id: sessionId, claimed_at: claimedAt }), "utf8");
  return file;
}

/** Bắt stdout của một lời gọi command run() — cùng khuôn `test/prune-locks.test.ts`. */
async function captureStdout(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  const original = process.stdout.write.bind(process.stdout);
  let out = "";
  process.stdout.write = (chunk: string) => {
    out += chunk;
    return true;
  };
  try {
    const code = await fn();
    return { code, out };
  } finally {
    process.stdout.write = original;
  }
}

/** Dựng project tạm với hai phạm vi, mỗi loại mục một mẫu — dùng chung cho mọi ca dưới đây. */
async function makeTwoScopeProject(): Promise<string> {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": doneDesign(),
    ".ganas/scopes/P-a.yaml": scope("P-a", { modules: ["M-a"], status: "delivered" }),
    ".ganas/scopes/P-b.yaml": scope("P-b", { modules: ["M-b"], entry: "M-b", status: "delivered" }),
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", { scope: "P-a" }),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", { scope: "P-b", paths: ["src/b/**"] }),
    ".ganas/tasks/T-001.yaml": doneTask("T-001", "P-a"),
    ".ganas/tasks/T-002.yaml": doneTask("T-002", "P-b"),
    ".ganas/proposals/PR-001.yaml": decidedProposal("PR-001", "P-a"),
    ".ganas/proposals/PR-002.yaml": decidedProposal("PR-002", "P-b"),
    ".ganas/icebox/2026-08.yaml": closedIceboxFile(),
    ".ganas/verify-ledger.jsonl": LEDGER_LINE,
  });

  await mkdir(join(root, ".ganas", "runs"), { recursive: true });
  const runFile = join(root, ".ganas", "runs", "sess-old.md");
  await writeFile(runFile, "# Handoff — sess-old\n", "utf8");
  await utimes(runFile, new Date(realDaysAgo(10)), new Date(realDaysAgo(10)));

  await writeLock(root, "T-999.claim", "cli", realDaysAgo(1)); // quá TTL mặc định (4h)

  await writeState(root, {
    version: 1,
    current_task: null,
    sessions: { "sess-dead": { task: "T-999", started_at: realDaysAgo(9) } },
  });

  return root;
}

/* --- `--scope` chỉ dọn đúng một phạm vi ------------------------------------ */

test("ganas prune --scope P-a: chỉ liệt task/đề xuất của P-a, KHÔNG đụng P-b, mặc định vẫn dry-run", async () => {
  const root = await makeTwoScopeProject();
  try {
    const { code, out } = await captureStdout(() =>
      ganasPrune({ positional: [], options: { root, scope: "P-a" }, flags: {}, passthrough: [] }),
    );
    assert.equal(code, 0);
    assert.match(out, /Đang lọc theo phạm vi P-a/, "phải nói RÕ đang lọc theo phạm vi nào");
    assert.match(out, /T-001/, "task của P-a phải xuất hiện trong kế hoạch");
    assert.match(out, /PR-001/, "đề xuất của P-a phải xuất hiện trong kế hoạch");
    assert.doesNotMatch(out, /T-002/, "task của P-b (phạm vi khác) không được xuất hiện");
    assert.doesNotMatch(out, /PR-002/, "đề xuất của P-b (phạm vi khác) không được xuất hiện");

    // Bốn loại mục không suy được phạm vi (lock, run, session mồ côi, icebox)
    // phải bị loại và ĐƯỢC NÓI RÕ, không im lặng — bất biến "cắt bớt thì phải
    // in số dòng đã bỏ" (src/commands/CLAUDE.md) áp cho --scope y hệt limit.
    assert.match(out, /không suy được phạm vi/, "phải nói rõ có mục bị loại vì không suy được phạm vi");
    assert.match(out, /4 không suy được phạm vi/, "đúng 4 mục: lock + run + session mồ côi + file icebox");
    assert.match(out, /2 thuộc phạm vi khác/, "T-002 và PR-002 đều khai thẳng phạm vi P-b — hai mục bị loại vì khác phạm vi, không phải không suy được");

    // dry-run mặc định — KHÔNG file nào đổi, kể cả mục thuộc P-a lẫn P-b.
    assert.ok(existsSync(join(root, ".ganas", "tasks", "T-001.yaml")));
    assert.ok(existsSync(join(root, ".ganas", "tasks", "T-002.yaml")));
    assert.ok(!existsSync(join(root, ".ganas", "tasks", "done")));
    assert.ok(existsSync(join(root, ".ganas", "proposals", "PR-001.yaml")));
    assert.ok(existsSync(join(root, ".ganas", "proposals", "PR-002.yaml")));
    assert.ok(!existsSync(join(root, ".ganas", "proposals", "closed")));
    assert.ok(existsSync(join(root, ".ganas", "icebox", "2026-08.yaml")));
    assert.ok(!existsSync(join(root, ".ganas", "icebox", "closed")));
    assert.ok(existsSync(join(root, ".ganas", "runs", "sess-old.md")));
    assert.ok(existsSync(join(root, ".ganas", ".locks", "T-999.claim")));

    assertLedgerUntouched(root);
  } finally {
    await cleanup(root);
  }
});

test("ganas prune --scope P-a --yes: chỉ archive T-001/PR-001, mọi thứ khác nguyên vẹn, sổ cái không đụng", async () => {
  const root = await makeTwoScopeProject();
  try {
    const { code } = await captureStdout(() =>
      ganasPrune({
        positional: [],
        options: { root, scope: "P-a" },
        flags: { yes: true },
        passthrough: [],
      }),
    );
    assert.equal(code, 0);

    assert.ok(existsSync(join(root, ".ganas", "tasks", "done", "T-001.yaml")), "T-001 (P-a) phải archive");
    assert.ok(existsSync(join(root, ".ganas", "tasks", "T-002.yaml")), "T-002 (P-b) KHÔNG được archive");
    assert.ok(
      existsSync(join(root, ".ganas", "proposals", "closed", "PR-001.yaml")),
      "PR-001 (P-a) phải archive",
    );
    assert.ok(
      existsSync(join(root, ".ganas", "proposals", "PR-002.yaml")),
      "PR-002 (P-b) KHÔNG được archive",
    );

    // Không suy được phạm vi ⇒ --scope không đụng, dù --yes.
    assert.ok(existsSync(join(root, ".ganas", "icebox", "2026-08.yaml")), "icebox không suy được phạm vi ⇒ giữ nguyên");
    assert.ok(existsSync(join(root, ".ganas", "runs", "sess-old.md")), "run không suy được phạm vi ⇒ giữ nguyên");
    assert.ok(existsSync(join(root, ".ganas", ".locks", "T-999.claim")), "lock không suy được phạm vi ⇒ giữ nguyên");

    assertLedgerUntouched(root);
  } finally {
    await cleanup(root);
  }
});

/* --- Phạm vi không tồn tại -------------------------------------------------- */

test("ganas prune --scope P-khong-co: GanasError, liệt kê phạm vi có thật", async () => {
  const root = await makeTwoScopeProject();
  try {
    await assert.rejects(
      () =>
        ganasPrune({
          positional: [],
          options: { root, scope: "P-khong-co" },
          flags: {},
          passthrough: [],
        }),
      (err: unknown) => {
        assert.ok(err instanceof GanasError, "lỗi của người dùng phải là GanasError, không phải Error trần");
        assert.match((err as Error).message, /P-khong-co/);
        assert.match((err as Error).message, /P-a/, "phải liệt kê phạm vi có thật (P-a)");
        assert.match((err as Error).message, /P-b/, "phải liệt kê phạm vi có thật (P-b)");
        return true;
      },
    );
    assertLedgerUntouched(root);
  } finally {
    await cleanup(root);
  }
});
