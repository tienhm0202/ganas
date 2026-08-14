import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  debtRows,
  isExplicitlyScored,
  knownDebtKinds,
  rowsInScope,
  scopeIndex,
  scoreOf,
} from "../src/debt.js";
import { loadGraph } from "../src/graph/load.js";
import type { DebtItem } from "../src/graph/trace.js";
import type { Diagnostic } from "../src/graph/types.js";
import { cleanup, design, goal, moduleYaml, scope, task } from "./helpers.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Diagnostic tối thiểu — test này chỉ quan tâm `code`/`file`/`message`. */
function diag(code: string, file: string, message = code): Diagnostic {
  return { severity: "error", code, message, file };
}

/**
 * Graph có phạm vi P-thu chứa M-a (khai scope hai chiều), cộng M-b KHÔNG khai
 * `scope`. Dùng chung cho các test lọc theo phạm vi.
 */
async function fixtureGraph() {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(join(tmpdir(), "ganas-debt-test-"));
  const files: Record<string, string> = {
    ".ganas/config.yaml": 'version: 1\nproject: "test"\nenforcement: enforce\n',
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope("P-thu", { modules: ["M-a", "M-b"] }),
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", { scope: "P-thu" }),
    // M-b cố tình KHÔNG khai `scope` — khối này phải rơi vào nhóm "không gắn phạm vi".
    ".ganas/modules/M-b.yaml": `id: M-b
title: "Khối B, không phạm vi"
nature: code
paths:
  - "src/b/**"
`,
  };
  for (const [rel, content] of Object.entries(files)) {
    const file = join(root, rel);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
  }
  const graph = await loadGraph(root);
  return { root, graph };
}

/* --- scoreOf / bảng điểm ---------------------------------------------------- */

test("scoreOf: mã tĩnh có điểm tường minh", () => {
  assert.deepEqual(scoreOf("spine/design-missing-goal"), { weight: 3, ease: 5 });
  assert.deepEqual(scoreOf("knowledge/ledger-corrupt"), { weight: 5, ease: 1 });
  assert.deepEqual(scoreOf("knowledge/claim-refuted"), { weight: 1, ease: 5 });
});

test("scoreOf: mã động khớp fallback theo namespace schema/*, verify/*", () => {
  assert.deepEqual(scoreOf("schema/invalid_type"), scoreOf("schema/custom"));
  assert.deepEqual(scoreOf("verify/dangerous"), scoreOf("verify/probe-unrelated"));
  // Mã tĩnh cùng namespace `verify/` KHÔNG bị fallback che mất — có điểm
  // TƯỜNG MINH riêng trong bảng (dù giá trị điểm hiện trùng số với fallback,
  // đó là trùng hợp — điều test này thật sự khẳng định là bảng tĩnh, không
  // phải fallback, mới là nguồn của điểm).
  assert.ok(isExplicitlyScored("verify/module-unverified"));
  assert.ok(!isExplicitlyScored("verify/dangerous"), "dangerous chỉ tới từ fallback, không nên có mặt tường minh");
});

test("scoreOf: mã lạ không khớp bảng tĩnh lẫn namespace → ném lỗi", () => {
  assert.throws(() => scoreOf("khong-ton-tai/lung-tung"), /không có điểm/);
});

test("cả ba DebtKind của computeDebt đều có điểm", () => {
  for (const kind of knownDebtKinds()) {
    assert.doesNotThrow(() => scoreOf(kind), `${kind} chưa được chấm điểm`);
  }
});

/* --- Sắp xếp theo tổng giảm dần --------------------------------------------- */

test("debtRows: sắp theo tổng giảm dần", async () => {
  const { root, graph } = await fixtureGraph();
  try {
    const diags = [
      diag("scope/module-orphaned", ".ganas/scopes/P-thu.yaml"), // total 2
      diag("spine/task-missing-model", ".ganas/tasks/T-001.yaml"), // total 6
      diag("spine/design-missing-goal", ".ganas/designs/D-001.yaml"), // total 8
    ];
    const rows = debtRows(diags, [], graph);
    assert.deepEqual(
      rows.map((r) => r.code),
      ["spine/design-missing-goal", "spine/task-missing-model", "scope/module-orphaned"],
    );
    assert.deepEqual(
      rows.map((r) => r.total),
      [8, 6, 2],
    );
  } finally {
    await cleanup(root);
  }
});

/* --- Tie-break ổn định ------------------------------------------------------- */

test("debtRows: tie-break theo code rồi message, ổn định qua nhiều lần gọi và bất kể thứ tự đầu vào", async () => {
  const { root, graph } = await fixtureGraph();
  try {
    // Ba dòng CÙNG total = 6: hai mã "knowledge/claim-refuted" (weight1+ease5)
    // với message khác nhau, cộng một "knowledge/ledger-corrupt" (weight5+ease1).
    // Thứ tự mong đợi: code "claim-refuted" < "ledger-corrupt" (bảng chữ cái);
    // trong hai dòng cùng code, message "A..." < "B...".
    const a = diag("knowledge/claim-refuted", ".ganas/tasks/T-001.yaml", "B - claim thứ hai");
    const b = diag("knowledge/claim-refuted", ".ganas/tasks/T-001.yaml", "A - claim thứ nhất");
    const c = diag("knowledge/ledger-corrupt", ".ganas/tasks/T-001.yaml", "sổ cái hỏng");

    const order1 = debtRows([a, b, c], [], graph);
    const order2 = debtRows([c, a, b], [], graph); // đầu vào xáo trộn khác

    const expectedMessages = ["A - claim thứ nhất", "B - claim thứ hai", "sổ cái hỏng"];
    assert.deepEqual(
      order1.map((r) => r.source.origin === "diagnostic" && r.source.diagnostic.message),
      expectedMessages,
    );
    assert.deepEqual(
      order2.map((r) => r.source.origin === "diagnostic" && r.source.diagnostic.message),
      expectedMessages,
      "thứ tự đầu vào khác nhau nhưng cùng graph → phải ra cùng thứ tự",
    );
  } finally {
    await cleanup(root);
  }
});

/* --- Lọc theo phạm vi --------------------------------------------------------- */

test("scopeIndex: task/module có scope → map file→scopeId; module không khai scope thì không có mặt", async () => {
  const { root, graph } = await fixtureGraph();
  try {
    const index = scopeIndex(graph);
    assert.equal(index.get(".ganas/tasks/T-001.yaml"), "P-thu");
    assert.equal(index.get(".ganas/modules/M-a.yaml"), "P-thu");
    assert.equal(index.get(".ganas/modules/M-b.yaml"), undefined);
  } finally {
    await cleanup(root);
  }
});

test("rowsInScope: diagnostic khớp file của task/module → đúng scope; không khớp file nào → nhóm 'không gắn phạm vi'", async () => {
  const { root, graph } = await fixtureGraph();
  try {
    const inScope = diag("spine/task-missing-model", ".ganas/tasks/T-001.yaml");
    const noFileMatch = diag("spine/gitignore-missing-local", ".gitignore");
    const rows = debtRows([inScope, noFileMatch], [], graph);

    assert.deepEqual(
      rowsInScope(rows, "P-thu").map((r) => r.code),
      ["spine/task-missing-model"],
    );
    assert.deepEqual(
      rowsInScope(rows, undefined).map((r) => r.code),
      ["spine/gitignore-missing-local"],
    );
  } finally {
    await cleanup(root);
  }
});

test("rowsInScope: DebtItem có moduleId được tra đúng scope qua module.scope; module không khai scope hoặc không có moduleId → 'không gắn phạm vi'", async () => {
  const { root, graph } = await fixtureGraph();
  try {
    const items: DebtItem[] = [
      { kind: "unverified-module", moduleId: "M-a", message: "khối M-a chưa có bằng chứng nào" },
      { kind: "unverified-module", moduleId: "M-b", message: "khối M-b chưa có bằng chứng nào" },
      {
        kind: "uncovered-edge",
        edge: { from: "M-a", to: "M-b" },
        message: "cạnh M-a → M-b không có bằng chứng contract",
      },
    ];
    const rows = debtRows([], items, graph);

    assert.deepEqual(
      rowsInScope(rows, "P-thu").map((r) => r.code),
      ["unverified-module"],
    );
    const unscoped = rowsInScope(rows, undefined);
    assert.equal(unscoped.length, 2);
    assert.ok(
      unscoped.some((r) => r.source.origin === "debt-item" && r.source.item.moduleId === "M-b"),
      "M-b không khai scope → phải rơi vào nhóm không gắn phạm vi",
    );
    assert.ok(
      unscoped.some((r) => r.source.origin === "debt-item" && r.source.item.kind === "uncovered-edge"),
      "DebtItem không có moduleId (chỉ có edge) → không được đoán scope, phải rơi vào nhóm không gắn phạm vi",
    );
  } finally {
    await cleanup(root);
  }
});

/* --- Guard: mọi mã tĩnh trong validate.ts / load.ts đều có điểm ------------- */

/**
 * Khuôn theo `test/cli-help.test.ts` (đối chiếu `COMMANDS` trong src/cli.ts
 * với `EXPECTED_COMMANDS`): grep NỘI DUNG VĂN BẢN của hai file nguồn tìm mọi
 * literal `code: "..."` (chỉ bắt chuỗi nháy kép — hai nhóm mã ĐỘNG dùng
 * template literal với backtick nên KHÔNG khớp pattern này, đúng ý "mã động
 * khớp fallback thì bỏ qua"), rồi khẳng định mỗi mã tìm được có điểm TƯỜNG
 * MINH trong bảng — không phải chỉ "không ném lỗi" (vốn có thể lọt qua nhờ
 * fallback namespace `verify/*`).
 *
 * Thêm luật mới vào validate.ts/load.ts mà quên chấm điểm ở src/debt.ts thì
 * test NÀY phải đỏ.
 */
test("guard: mọi mã tĩnh (literal `code: \"...\"`) trong validate.ts và load.ts đều có điểm tường minh trong src/debt.ts", async () => {
  const [validateSrc, loadSrc] = await Promise.all([
    readFile(join(ROOT, "src", "graph", "validate.ts"), "utf8"),
    readFile(join(ROOT, "src", "graph", "load.ts"), "utf8"),
  ]);

  const codes = new Set<string>();
  for (const src of [validateSrc, loadSrc]) {
    for (const m of src.matchAll(/code:\s*"([a-zA-Z0-9/_-]+)"/g)) codes.add(m[1]!);
  }

  // Đối chiếu chính con số đã tự grep xác nhận: 43 mã DUY NHẤT trong
  // validate.ts, cộng 3 mã DUY NHẤT trong load.ts (spine/config-unknown-key,
  // load/yaml, load/duplicate-id — hai mã sau xuất hiện hai lần trong file
  // nhưng cùng literal nên `Set` chỉ giữ một) → tổng 46.
  assert.equal(
    codes.size,
    46,
    `đếm được ${codes.size} mã tĩnh duy nhất, kỳ vọng 46 (43 + 3) — kiểm lại pattern grep hoặc số đếm`,
  );

  const missing = [...codes].filter((c) => !isExplicitlyScored(c));
  assert.deepEqual(
    missing,
    [],
    `các mã tĩnh sau chưa có điểm tường minh trong SCORES ở src/debt.ts: ${missing.join(", ")}`,
  );
});
