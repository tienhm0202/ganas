import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { run as ganasPrune } from "../src/commands/prune.js";
import { loadGraph } from "../src/graph/load.js";
import { applyPrune, planPrune } from "../src/prune.js";
import { cleanup, goal, makeProject, moduleYaml, scope } from "./helpers.js";

/**
 * Vòng đời tầng 2: archive theo BÀN GIAO (task của phạm vi `delivered` không
 * phải chờ đủ tuổi) và hàng rào chặn archive design CÒN CANH CODE.
 *
 * Tách khỏi `test/prune.test.ts` (tầng 1 + khuôn archive theo tuổi) vì đây là
 * hai câu hỏi khác nhau: ở kia "đã đủ cũ chưa", ở đây "còn ai dùng không".
 */

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-08-15T00:00:00Z");

function daysAgo(n: number): string {
  return new Date(NOW - n * DAY_MS).toISOString();
}

/**
 * Sổ cái xác minh — tầng 3, KHÔNG lệnh dọn nào được đụng. Mọi ca dưới đây dựng
 * sẵn file này rồi so lại nguyên văn sau khi chạy: đó là phép kiểm ranh giới
 * giữa tầng 2 và tầng 3, không phải chi tiết trang trí.
 */
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
    "sổ cái là tầng 3 — hash-chain gãy thì mọi bằng chứng sau đó mất giá trị",
  );
}

/** Design đã đóng chặng — task chỉ được archive khi design nó `implements` đã đóng. */
function doneDesign(id = "D-001", doneAt = daysAgo(1)): string {
  return `id: ${id}
title: "Design đã đóng"
serves:
  - G-001
summary: "Cách tiếp cận"
status: done
done_at: ${doneAt}
`;
}

/** Design bị chặng khác thay — ứng viên archive của tầng 2. */
function supersededDesign(id = "D-002", artifacts = ""): string {
  return `id: ${id}
title: "Chặng đã bị thay"
serves:
  - G-001
summary: "Cách tiếp cận cũ"
status: superseded
${artifacts}`;
}

/** Bản vẽ neo vào KHỐI — vế "còn file để tính độ tươi" của `designStillGuards`. */
function moduleArtifact(id = "A-thu", module = "M-a"): string {
  return `artifacts:
  - id: ${id}
    kind: function
    module: ${module}
    shape: "(x: string) => void"
    probe:
      run: "true"
      expect: exit_zero
`;
}

/**
 * Bản vẽ neo vào TÀI LIỆU (`kind: doc`) — cố ý: nó KHÔNG khai `module` nên vế
 * thứ hai của `designStillGuards` không bao giờ bật, và ca kiểm còn lại đo đúng
 * một vế "có task đang mở trỏ tới".
 */
function docArtifact(id = "A-doc"): string {
  return `artifacts:
  - id: ${id}
    kind: doc
    path: docs/CONCEPTS.md
    shape: "tài liệu khái niệm"
    probe:
      run: "true"
      expect: exit_zero
`;
}

function doneTask(id: string, opts: { doneDays?: number; scope?: string; implements?: string }): string {
  return `id: ${id}
title: "Task đã xong"
serves:
  - G-001
implements: ${opts.implements ?? "D-001"}
scope: ${opts.scope ?? "P-thu"}
status: done
done_at: ${daysAgo(opts.doneDays ?? 0)}
exit_contract:
  - kind: command
    run: "true"
`;
}


/** Bộ file nền dùng chung: goal + phạm vi + khối + sổ cái. */
function base(scopeStatus = "active"): Record<string, string> {
  return {
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/scopes/P-thu.yaml": scope("P-thu", { status: scopeStatus }),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/verify-ledger.jsonl": LEDGER_LINE,
  };
}

/* --- Chiều 1: archive theo BÀN GIAO ---------------------------------------- */

test("phạm vi delivered: task done của nó archive được dù CHƯA đủ tuổi", async () => {
  const root = await makeProject({
    ...base("delivered"),
    ".ganas/designs/D-001.yaml": doneDesign(),
    ".ganas/tasks/T-001.yaml": doneTask("T-001", { doneDays: 0 }),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.equal(plan.doneTasks.length, 1, "bàn giao xong thì task là dàn giáo, không phải chờ thêm");
    assert.equal(plan.doneTasks[0]!.id, "T-001");

    await applyPrune(root, plan);
    assert.ok(existsSync(join(root, ".ganas", "tasks", "done", "T-001.yaml")));
    assertLedgerUntouched(root);
  } finally {
    await cleanup(root);
  }
});

test("phạm vi active: task done chưa đủ tuổi thì KHÔNG archive sớm", async () => {
  const root = await makeProject({
    ...base("active"),
    ".ganas/designs/D-001.yaml": doneDesign(),
    ".ganas/tasks/T-001.yaml": doneTask("T-001", { doneDays: 0 }),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.deepEqual(
      plan.doneTasks,
      [],
      "chưa bàn giao thì ngưỡng --older-than vẫn là ngưỡng — nới quá tay là dọn mất việc còn nóng",
    );
    assertLedgerUntouched(root);
  } finally {
    await cleanup(root);
  }
});

/* --- Dry-run: mặc định không ghi gì ---------------------------------------- */

test("ganas prune: mặc định dry-run — không dời file nào, sổ cái nguyên vẹn", async () => {
  const root = await makeProject({
    ...base("delivered"),
    ".ganas/designs/D-002.yaml": supersededDesign("D-002", docArtifact()),
    ".ganas/designs/D-001.yaml": doneDesign("D-001", new Date(Date.now() - DAY_MS).toISOString()),
    ".ganas/tasks/T-001.yaml": `id: T-001
title: "Task đã xong"
serves:
  - G-001
implements: D-001
scope: P-thu
status: done
done_at: ${new Date(Date.now() - DAY_MS).toISOString()}
exit_contract:
  - kind: command
    run: "true"
`,
  });
  try {
    const code = await ganasPrune({
      positional: [],
      options: { root, "older-than": "7" },
      flags: {},
      passthrough: [],
    });
    assert.equal(code, 0);
    assert.ok(existsSync(join(root, ".ganas", "designs", "D-002.yaml")));
    assert.ok(existsSync(join(root, ".ganas", "tasks", "T-001.yaml")), "dry-run không được dời task");
    assert.ok(!existsSync(join(root, ".ganas", "tasks", "done")));
    assertLedgerUntouched(root);
  } finally {
    await cleanup(root);
  }
});

/* --- Bất biến: design không bao giờ bị archive ----------------------------- */

test("⭐ design KHÔNG BAO GIỜ bị archive — kể cả `superseded`, kể cả khi phạm vi đã delivered", async () => {
  // Bản vẽ của một chặng đã đóng vẫn đang canh code ĐANG CHẠY, và probe của nó
  // là hàng rào chống hồi quy duy nhất cho hợp đồng đó. Cùng lý do phạm vi
  // không bao giờ bị archive. Ghim thành test vì đây là thứ dễ bị "tối ưu" lại
  // sau này bằng lý lẽ "designs/ đang phình".
  const root = await makeProject({
    ...base("delivered"),
    ".ganas/designs/D-002.yaml": supersededDesign("D-002", moduleArtifact()),
    ".ganas/designs/D-001.yaml": doneDesign("D-001", daysAgo(400)),
    ".ganas/tasks/T-001.yaml": doneTask("T-001", { doneDays: 400 }),
  });
  try {
    const plan = await planPrune(root, await loadGraph(root), { olderThanDays: 0, now: Date.now() });
    assert.equal(
      JSON.stringify(plan).includes("designs/"),
      false,
      `kế hoạch dọn không được nhắc tới designs/: ${JSON.stringify(plan)}`,
    );
    await applyPrune(root, plan);
    assert.ok(existsSync(join(root, ".ganas", "designs", "D-002.yaml")));
    assert.ok(existsSync(join(root, ".ganas", "designs", "D-001.yaml")));
    assert.ok(!existsSync(join(root, ".ganas", "designs", "archived")));
    assertLedgerUntouched(root);
  } finally {
    await cleanup(root);
  }
});

