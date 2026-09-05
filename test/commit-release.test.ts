import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { run as runCommit } from "../src/commands/commit.js";
import { bindSession, readState, releaseSession } from "../src/state.js";
import type { Argv } from "../src/util/args.js";
import { runShell } from "../src/util/exec.js";
import { cleanup, design, goal, makeProject, scope } from "./helpers.js";

/**
 * T-092 — hai lỗi thật đã quan sát ở phiên 2026-09-05, cả hai trong
 * `src/commands/commit.ts`:
 *
 * - ICE-034: `ganas commit` đóng task nhưng không nhả bind trong
 *   `.ganas/state.json` — Stop hook đọc `session.task` rồi chấm gate của một
 *   task đã done, chặn phiên vì lý do chẳng liên quan.
 * - ICE-036: vòng `git add` chạy TRƯỚC recheck cây sắp commit; recheck đỏ thì
 *   trả về mã 1 mà KHÔNG dọn những đường dẫn vừa add — lệnh `ganas commit` kế
 *   tiếp commit cả index bẩn đó (`commit:abb3cf8`).
 */

async function gitProject(files: Record<string, string>): Promise<string> {
  const root = await makeProject(files);
  await runShell("git init -q", { cwd: root });
  await runShell('git config user.email "test@ganas.local"', { cwd: root });
  await runShell('git config user.name "ganas test"', { cwd: root });
  await runShell("git config commit.gpgsign false", { cwd: root });
  return root;
}

const BASE = {
  ".ganas/goals/G-001.yaml": goal(),
  ".ganas/designs/D-001.yaml": design(),
  ".ganas/scopes/P-thu.yaml": scope(),
  ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối A"
scope: P-thu
nature: code
paths: ["src/a/**"]
`,
};

function argv(root: string, sessionId: string, flags: Record<string, boolean> = {}): Argv {
  return {
    positional: ["T-001"],
    options: { root, session: sessionId },
    multi: {},
    flags: { ...flags },
    passthrough: [],
  };
}

async function captureStdout<T>(fn: () => Promise<T>): Promise<{ result: T; out: string }> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: unknown }).write = (chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  };
  try {
    return { result: await fn(), out: chunks.join("") };
  } finally {
    (process.stdout as { write: unknown }).write = original;
  }
}

/* --- ICE-034: nhả bind khi đóng task --------------------------------------- */

const TASK_SIMPLE = `id: T-001
title: "Sửa lõi A"
serves: [G-001]
implements: D-001
scope: P-thu
touches:
  - M-a
exit_contract:
  - kind: command
    run: "true"
`;

test("⭐ ganas commit đóng task ⇒ nhả bind session khỏi state.json (ICE-034)", async () => {
  const root = await gitProject({ ...BASE, ".ganas/tasks/T-001.yaml": TASK_SIMPLE });
  try {
    await mkdir(join(root, "src", "a"), { recursive: true });
    await writeFile(join(root, "src", "a", "index.ts"), "export {};\n", "utf8");

    await bindSession(root, "s1", "T-001");

    const before = await readState(root);
    assert.equal(before.sessions["s1"]?.task, "T-001", "phải bind trước khi commit");

    assert.equal(await runCommit(argv(root, "s1")), 0);

    const after = await readState(root);
    assert.equal(
      after.sessions["s1"],
      undefined,
      "commit đóng task xong thì session KHÔNG còn trỏ vào task đó nữa — " +
        "Stop hook mới không chấm gate của một task đã done",
    );
  } finally {
    await cleanup(root);
  }
});

test("ganas commit --no-close: session VẪN còn bind (task chưa đóng thì không có gì để nhả)", async () => {
  const root = await gitProject({ ...BASE, ".ganas/tasks/T-001.yaml": TASK_SIMPLE });
  try {
    await mkdir(join(root, "src", "a"), { recursive: true });
    await writeFile(join(root, "src", "a", "index.ts"), "export {};\n", "utf8");

    await bindSession(root, "s1", "T-001");

    assert.equal(await runCommit(argv(root, "s1", { close: false })), 0);

    const after = await readState(root);
    assert.equal(after.sessions["s1"]?.task, "T-001", "task chưa đóng thì session vẫn phải còn bind");
  } finally {
    await cleanup(root);
    await releaseSession(root, "s1").catch(() => undefined);
  }
});

/* --- ICE-036: dọn index khi recheck từ chối -------------------------------- */

/**
 * Ca ĐỎ THẬT, không mock — y hệt fixture của `test/commit-staged-tree.test.ts`
 * (đã dựng lại đúng T-010/`commit:fc99e87`): task chỉ chạm `src/a/**`, nhưng
 * tiêu chí phụ thuộc NGẦM vào `src/b/dep.ts` — file NGOÀI ranh giới, đang sửa
 * dở. Working tree có đủ cả hai nên gate xanh; cây sắp commit chỉ có nửa
 * `src/a/` nên recheck đỏ.
 */
const TASK_SPLIT = `id: T-001
title: "Sửa lõi A"
serves: [G-001]
implements: D-001
scope: P-thu
touches:
  - M-a
exit_contract:
  - kind: command
    run: "sh check.sh"
`;

async function setupSplitTree(root: string, depContent: string): Promise<void> {
  await mkdir(join(root, "src", "a"), { recursive: true });
  await writeFile(join(root, "src", "a", "index.ts"), "export {};\n", "utf8");
  await mkdir(join(root, "src", "b"), { recursive: true });
  await writeFile(join(root, "src", "b", "dep.ts"), depContent, "utf8");
  await writeFile(join(root, "check.sh"), "grep -q DUNG_ROI src/b/dep.ts\n", "utf8");
}

test("⭐ recheck đỏ ⇒ trả mã khác 0 VÀ index sạch, không còn gì staged (ICE-036)", async () => {
  const root = await gitProject({ ...BASE, ".ganas/tasks/T-001.yaml": TASK_SPLIT });
  try {
    await setupSplitTree(root, "// chua co gi\n");
    await runShell("git add -A && git commit -q -m base", { cwd: root });

    // src/a/ TRONG ranh giới, src/b/ NGOÀI ranh giới — cả hai đang sửa dở.
    await writeFile(join(root, "src", "a", "index.ts"), "export const x = 1;\n", "utf8");
    await writeFile(join(root, "src", "b", "dep.ts"), "// DUNG_ROI\n", "utf8");

    assert.equal(
      (await runShell("sh check.sh", { cwd: root })).code,
      0,
      "working tree phải xanh, nếu không thì test đang kiểm nhầm thứ",
    );

    await bindSession(root, "s1", "T-001");

    let threw = false;
    try {
      await captureStdout(() => runCommit(argv(root, "s1")));
    } catch {
      threw = true;
    }
    assert.ok(threw, "recheck đỏ phải làm lệnh ném lỗi (mã khác 0 ở CLI thật)");

    const staged = await runShell("git diff --cached --name-only", { cwd: root });
    assert.equal(
      staged.stdout.trim(),
      "",
      `index phải sạch sau khi recheck từ chối — còn sót: ${staged.stdout}`,
    );

    // Task chưa đóng ⇒ session PHẢI còn bind, để phiên biết vẫn đang làm dở.
    const after = await readState(root);
    assert.equal(after.sessions["s1"]?.task, "T-001");
  } finally {
    await cleanup(root);
  }
});

test("recheck xanh: commit vẫn chạy bình thường (không đổi hành vi đường xanh)", async () => {
  const root = await gitProject({ ...BASE, ".ganas/tasks/T-001.yaml": TASK_SPLIT });
  try {
    // src/b/dep.ts đã DUNG_ROI từ trước và đã commit — chỉ src/a/ (trong ranh
    // giới) còn sửa dở, nên cây sắp commit đủ để check.sh chạy qua.
    await setupSplitTree(root, "// DUNG_ROI\n");
    await runShell("git add -A && git commit -q -m base", { cwd: root });
    await writeFile(join(root, "src", "a", "index.ts"), "export const x = 1;\n", "utf8");

    assert.equal(
      await runCommit({ positional: ["T-001"], options: { root }, flags: {}, passthrough: [] }),
      0,
    );

    const log = await runShell("git log --oneline", { cwd: root });
    assert.equal(log.stdout.trim().split("\n").length, 2, "phải có base + đúng một commit mới");
  } finally {
    await cleanup(root);
  }
});
