import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import { validateGraph } from "../src/graph/validate.js";
import { readLedger } from "../src/verify/ledger.js";
import { allTargets, runTarget } from "../src/verify/run.js";
import { check, cleanup, design, goal, makeProject, scope, task } from "./helpers.js";

/**
 * Nghiệm thu luồng ghép THẬT của P-graph-core (`V-graph-core-e2e`).
 *
 * `.ganas/scopes/P-graph-core.yaml` từng khai probe của mục này bằng
 * `npm test` — một lệnh chung chung, không nói riêng về P-graph-core. `ganas
 * verify` tự gắn nhãn "chưa chứng minh được là có thể fail" cho nó vì
 * `mutateProbe()` (src/verify/mutate.ts) không nhận ra dạng `npm test` để
 * bóp méo.
 *
 * Test này đi ĐÚNG bốn bước mà P-graph-core hứa làm, trên một project dựng
 * trong thư mục tạm (không đụng `.ganas/` thật của repo):
 *
 *   1. nạp YAML thành graph          — `loadGraph`      (M-load)
 *   2. kiểm tra: schema, liên kết,
 *      luật spine                    — `validateGraph`  (M-validate)
 *   3. chạy bằng chứng, ghi sổ cái   — `runTarget`       (M-verify)
 *   4. đọc lại, tính độ tươi         — `computeFreshness` (M-freshness)
 *
 * Hai chiều bắt buộc: một graph HỢP LỆ đi hết bốn bước (mọi bằng chứng fresh
 * sau khi chạy), và một graph HỎNG bị chặn đúng chỗ — thiếu liên kết ở bước
 * 2, sai schema ngay ở bước 1 — với chẩn đoán có `file`, `line`, thông điệp
 * đọc được.
 */

async function fullProject(): Promise<string> {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task("T-001", { scope: "P-e2e" }),
    ".ganas/scopes/P-e2e.yaml": `id: P-e2e
title: "Phạm vi thử luồng ghép"
version: 0.1.0
owner: "@t"
status: active
modules: [M-e2e-a, M-e2e-b]
entry: M-e2e-a
acceptance:
  - id: V-e2e-smoke
    kind: probe
    run: "test -f src/e2e/a/index.ts"
`,
    ".ganas/modules/M-e2e-a.yaml": `id: M-e2e-a
scope: P-e2e
title: "Khối A của luồng ghép"
nature: code
paths: ["src/e2e/a/**"]
status: implemented
verify:
  - id: V-a-probe
    kind: probe
    run: "test -f src/e2e/a/index.ts"
`,
    ".ganas/modules/M-e2e-b.yaml": `id: M-e2e-b
scope: P-e2e
title: "Khối B của luồng ghép"
nature: code
paths: ["src/e2e/b/**"]
status: implemented
depends_on: [M-e2e-a]
verify:
  - id: V-b-probe
    kind: probe
    run: "test -f src/e2e/b/index.ts"
`,
    ".ganas/facts/f.yaml": `- id: F-E2E-001
  scope: P-e2e
  statement: "khối A của luồng ghép có entrypoint"
  depends_on: ["src/e2e/a/**"]
  verify:
    run: "test -f src/e2e/a/index.ts"
`,
  });
  for (const d of ["a", "b"]) {
    await mkdir(join(root, "src", "e2e", d), { recursive: true });
    await writeFile(join(root, "src", "e2e", d, "index.ts"), `export const ${d} = 1;\n`, "utf8");
  }
  return root;
}

test("⭐ graph hợp lệ đi hết bốn bước: nạp → kiểm tra → chạy bằng chứng → fresh", async () => {
  const root = await fullProject();
  try {
    // 1. Nạp YAML thành graph.
    const graph = await loadGraph(root);
    assert.deepEqual(
      graph.loadDiagnostics.filter((d) => d.severity === "error"),
      [],
      "project dựng cho test này phải nạp sạch, không lỗi schema",
    );

    // 2. Kiểm tra: schema, liên kết, luật spine.
    const diagnostics = validateGraph(graph);
    const errors = diagnostics.filter((d) => d.severity === "error");
    assert.deepEqual(errors, [], `không mong đợi lỗi validate: ${JSON.stringify(errors, null, 2)}`);

    // 3. Chạy bằng chứng thật, ghi sổ cái — cho MỌI target mà P-e2e khai (fact,
    // bằng chứng của khối, nghiệm thu mức phạm vi).
    const targets = allTargets(graph);
    assert.deepEqual(
      targets.map((t) => t.id).sort(),
      ["F-E2E-001", "M-e2e-a/V-a-probe", "M-e2e-b/V-b-probe", "P-e2e/V-e2e-smoke"],
      "fixture phải phơi đủ ba loại target mà allTargets() gom: fact, khối, phạm vi",
    );
    for (const target of targets) {
      const outcome = await runTarget(target, { root, by: "test" });
      assert.equal(
        outcome.result,
        "pass",
        `${target.id} phải pass: ${outcome.reason ?? "(không có lý do)"}`,
      );
    }

    const ledger = await readLedger(root);
    assert.equal(ledger.length, targets.length, "mỗi target chạy một lần phải để lại đúng một dòng sổ cái");

    // 4. Đọc lại, tính độ tươi — vân tay GHI và vân tay ĐỌC phải khớp.
    const after = await loadGraph(root);
    const freshness = await computeFreshness(after);
    const notFresh = targets
      .map((t) => t.id)
      .map((id) => [id, freshness.get(id)] as const)
      .filter(([, s]) => s?.freshness !== "fresh")
      .map(([id, s]) => `${id} → ${s?.freshness} (${s?.reason})`);
    assert.deepEqual(
      notFresh,
      [],
      `vừa verify xong mà đã không fresh:\n${notFresh.join("\n")}`,
    );
  } finally {
    await cleanup(root);
  }
});

test("⭐ graph thiếu liên kết bị chặn ở bước kiểm tra — chẩn đoán trỏ đúng file:line", async () => {
  const { diagnostics } = await check({
    ".ganas/scopes/P-bad.yaml": scope("P-bad", { modules: ["M-bad-a"], entry: "M-bad-a" }),
    ".ganas/modules/M-bad-a.yaml": `id: M-bad-a
scope: P-bad
title: "Khối phụ thuộc khối ma"
nature: code
paths: ["src/x/**"]
status: implemented
depends_on: [M-khong-ton-tai]
verify:
  - id: V-x-probe
    kind: probe
    run: "test -f src/x/index.ts"
`,
  });

  const err = diagnostics.find((d) => d.code === "spine/module-missing-dependency");
  assert.ok(
    err,
    `phải bắt được depends_on treo: ${JSON.stringify(diagnostics.map((d) => d.code))}`,
  );
  assert.match(err.message, /M-bad-a/);
  assert.match(err.message, /M-khong-ton-tai/);
  assert.equal(err.file, ".ganas/modules/M-bad-a.yaml");
  assert.equal(typeof err.line, "number", "chẩn đoán phải trỏ đúng dòng để sửa được ngay");
});

test("⭐ graph sai schema bị chặn NGAY ở bước nạp — khối không được đưa vào graph", async () => {
  const root = await makeProject({
    ".ganas/scopes/P-bad.yaml": scope("P-bad", { modules: ["M-bad-b"], entry: "M-bad-b" }),
    // Thiếu `nature` — trường bắt buộc của zModule, không có default.
    ".ganas/modules/M-bad-b.yaml": `id: M-bad-b
scope: P-bad
title: "Khối thiếu nature"
paths:
  - "src/x/**"
`,
  });
  try {
    const graph = await loadGraph(root);
    assert.equal(
      graph.modules.has("M-bad-b"),
      false,
      "khối sai schema không được nạp vào graph — đó là điều 'chặn' thật sự nói tới",
    );

    const err = graph.loadDiagnostics.find((d) => d.code.startsWith("schema/"));
    assert.ok(
      err,
      `phải bắt được lỗi schema: ${JSON.stringify(graph.loadDiagnostics.map((d) => d.code))}`,
    );
    assert.equal(err.file, ".ganas/modules/M-bad-b.yaml");
    assert.equal(typeof err.line, "number", "chẩn đoán phải trỏ đúng dòng để sửa được ngay");
    assert.match(err.message, /nature/);

    // Cũng phải nổi lên qua đường validateGraph (gộp loadDiagnostics) — chỗ
    // thật sự chặn `ganas validate` trong luồng dùng hàng ngày.
    const codes = validateGraph(graph).map((d) => d.code);
    assert.ok(codes.some((c) => c.startsWith("schema/")));
  } finally {
    await cleanup(root);
  }
});
