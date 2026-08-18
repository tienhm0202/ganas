import assert from "node:assert/strict";
import { test } from "node:test";

import { loadGraph } from "../src/graph/load.js";
import { freshnessOf, zDecision, zFact } from "../src/model/index.js";
import { check, cleanup, goal, makeProject, task, validSpine } from "./helpers.js";

/* --- Anchor bắt buộc ------------------------------------------------------ */

test("claim không có anchor bị từ chối — không bằng chứng thì không phải tri thức", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/claims/linh-tinh.yaml": `- id: C-001
  scope: P-thu
  statement: "Hệ thống dùng Redis làm cache"
  provenance: session`,
  });
  const err = diagnostics.find((d) => d.severity === "error" && d.message.includes("anchor"));
  assert.ok(err, `phải chặn claim thiếu anchor: ${JSON.stringify(diagnostics)}`);
  assert.equal(err.file, ".ganas/claims/linh-tinh.yaml");
});

test("claim có anchors rỗng cũng bị từ chối", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/claims/a.yaml": `- id: C-001
  scope: P-thu
  statement: "..."
  anchors: []
  provenance: session`,
  });
  assert.ok(diagnostics.some((d) => d.severity === "error" && d.message.includes("anchor")));
});

test("claim có anchor hợp lệ thì qua", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/claims/a.yaml": `- id: C-001
  scope: P-thu
  statement: "API handler nằm ở src/api/handlers/"
  anchors:
    - "src/api/handlers/index.ts#L1"
  provenance: session`,
  });
  assert.deepEqual(
    diagnostics.filter((d) => d.severity === "error"),
    [],
  );
});

/* --- Không được đổi mức tin cậy trần --------------------------------------- */

test("claim đổi trust mà không kèm verdict bị từ chối", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/claims/a.yaml": `- id: C-001
  scope: P-thu
  statement: "..."
  anchors: ["src/a.ts#L1"]
  provenance: session
  trust: confirmed`,
  });
  const err = diagnostics.find((d) => d.message.includes("verdict"));
  assert.ok(err, "nâng mức tin cậy phải kèm bằng chứng, không được đổi trần");
});

test("claim thăng cấp thành fact không tồn tại bị bắt", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/claims/a.yaml": `- id: C-001
  scope: P-thu
  statement: "..."
  anchors: ["src/a.ts#L1"]
  provenance: session
  trust: confirmed
  verdict:
    at: 2026-08-01T00:00:00Z
    evidence: "chạy probe thấy đúng — src/a.ts#L1"
    promoted_to: F-API-001`,
  });
  assert.ok(codes.includes("knowledge/claim-missing-promoted-fact"));
});

/* --- Legacy claim phải lộ diện là legacy ----------------------------------- */

test("claim import từ tài liệu cũ phải dùng tiền tố LC-", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/legacy/imported/claude-md.yaml": `- id: C-001
  scope: P-thu
  statement: "từ CLAUDE.md cũ"
  anchors: ["CLAUDE.md#L34"]
  provenance: imported`,
  });
  assert.ok(
    diagnostics.some((d) => d.severity === "error" && d.message.includes("LC-")),
    "tri thức kế thừa phải nhìn là biết, không được trộn với claim của phiên",
  );
});

test("LC- mà khai provenance khác imported bị từ chối", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/legacy/imported/a.yaml": `- id: LC-007
  scope: P-thu
  statement: "..."
  anchors: ["CLAUDE.md#L34"]
  provenance: session`,
  });
  assert.ok(diagnostics.some((d) => d.severity === "error" && d.message.includes("imported")));
});

test("legacy claim bị bác bỏ được nêu ra — đó là ảo giác đang tồn tại trong dự án", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/legacy/imported/a.yaml": `- id: LC-007
  scope: P-thu
  statement: "API handler nằm ở src/api/handlers/"
  anchors: ["CLAUDE.md#L34"]
  provenance: imported
  trust: refuted
  verdict:
    at: 2026-08-01T00:00:00Z
    evidence: "thực tế nằm ở src/routes/ — src/routes/index.ts#L1"`,
  });
  const found = diagnostics.find((d) => d.code === "knowledge/claim-refuted");
  assert.ok(found, "claim bị bác bỏ phải hiện ra trong báo cáo");
  assert.match(found.message, /API handler/);
});

/* --- Fact ----------------------------------------------------------------- */

test("fact chưa verify lần nào bị cảnh báo — nó vẫn chỉ là niềm tin", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/facts/a.yaml": `- id: F-API-001
  scope: P-thu
  statement: "handler nằm ở src/api/handlers/"
  verify:
    run: "test -d src/api/handlers"`,
  });
  assert.ok(codes.includes("knowledge/fact-never-verified"));
});

test("fact có probe fail là LỖI — phát biểu đang sai", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/facts/a.yaml": `- id: F-API-001
  scope: P-thu
  statement: "handler nằm ở src/api/handlers/"
  verify:
    run: "test -d src/api/handlers"
  last_verified_at: 2026-08-01T00:00:00Z
  last_result: fail`,
  });
  assert.ok(codes.includes("knowledge/fact-failing"));
});

test("task đòi fact không tồn tại bị bắt", async () => {
  const files = validSpine();
  files[".ganas/tasks/T-001.yaml"] = task("T-001", {
    extra: "context_contract:\n  facts:\n    - F-API-999",
  });
  const { codes } = await check(files);
  assert.ok(codes.includes("knowledge/task-missing-fact"));
});

/* --- Độ tươi của fact: cơ chế chặn ảo giác lan truyền ---------------------- */

function makeFact(overrides: Record<string, unknown> = {}) {
  return zFact.parse({
    id: "F-X-001",
    scope: "P-thu",
    statement: "s",
    verify: { run: "true" },
    ...overrides,
  });
}

test("fact chưa verify → never_verified", () => {
  assert.equal(freshnessOf({ fact: makeFact() }), "never_verified");
});

// Mốc thời gian cố định trong quá khứ: test độ tươi không được phụ thuộc vào
// lúc chạy (và schema cấm last_verified_at ở tương lai).
const T0 = "2025-06-01T00:00:00Z";
const T1 = "2025-06-02T00:00:00Z";
const T2 = "2025-06-03T00:00:00Z";

test("fact có dep đổi sau lần verify → stale, không còn được tin", () => {
  const fact = makeFact({ depends_on: ["src/**"], last_verified_at: T0, last_result: "pass" });
  assert.equal(freshnessOf({ fact, depsChangedAt: Date.parse(T1) }), "stale");
});

test("dep đổi TRƯỚC lần verify thì fact vẫn fresh", () => {
  const fact = makeFact({ depends_on: ["src/**"], last_verified_at: T2, last_result: "pass" });
  assert.equal(freshnessOf({ fact, depsChangedAt: Date.parse(T1) }), "fresh");
});

test("fact quá ttl → stale kể cả khi không file nào đổi", () => {
  const fact = makeFact({ ttl_days: 30, last_verified_at: T0, last_result: "pass" });
  const now = Date.parse("2025-12-01T00:00:00Z");
  assert.equal(freshnessOf({ fact, now }), "stale");
});

test("ttl_days = 0 nghĩa là không hết hạn theo thời gian", () => {
  const fact = makeFact({
    ttl_days: 0,
    last_verified_at: "2020-01-01T00:00:00Z",
    last_result: "pass",
  });
  const now = Date.parse("2025-12-01T00:00:00Z");
  assert.equal(freshnessOf({ fact, now }), "fresh");
});

test("probe fail thắng mọi thứ khác", () => {
  const fact = makeFact({ last_verified_at: T0, last_result: "fail" });
  assert.equal(freshnessOf({ fact }), "failing");
});

test("last_verified_at ở tương lai bị từ chối — đây là đường tắt để lách STALE", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const parsed = zFact.safeParse({
    id: "F-X-001",
    scope: "P-thu",
    statement: "s",
    verify: { run: "true" },
    last_verified_at: future,
    last_result: "pass",
  });
  assert.equal(parsed.success, false);
});

test("khai last_result mà không có last_verified_at bị từ chối", () => {
  const parsed = zFact.safeParse({
    id: "F-X-001",
    scope: "P-thu",
    statement: "s",
    verify: { run: "true" },
    last_result: "pass",
  });
  assert.equal(parsed.success, false, "không thể 'đã kiểm' mà không có thời điểm kiểm");
});

/* --- Schema của Decision: context/consequence thay cho rationale (N12) ----- */

const baseDecision = {
  id: "DEC-001",
  statement: "Dùng Postgres thay vì Mongo",
  decided_by: "@alice",
  decided_at: "2025-01-01T00:00:00Z",
};

test("decision có cả context lẫn consequence parse được", () => {
  const parsed = zDecision.parse({
    ...baseDecision,
    context: "Cần transaction đa bảng, Mongo không đáp ứng",
    consequence: "Phải vận hành thêm một hệ quản trị quan hệ",
  });
  assert.equal(parsed.context, "Cần transaction đa bảng, Mongo không đáp ứng");
  assert.equal(parsed.consequence, "Phải vận hành thêm một hệ quản trị quan hệ");
});

test("decision không khai context lẫn consequence vẫn parse được", () => {
  const parsed = zDecision.parse(baseDecision);
  assert.equal(parsed.context, undefined);
  assert.equal(parsed.consequence, undefined);
});

test("⭐ trường lạ trong decision bị TỪ CHỐI, không bị nuốt im lặng", () => {
  // Trước M0 zDecision thiếu `.strict()` nên `rationale` (trường đã bỏ ở N12)
  // bị vứt đi không một tiếng động — người viết tưởng đã khai, thực ra chưa.
  const parsed = zDecision.safeParse({ ...baseDecision, rationale: "lý do cũ" });
  assert.ok(!parsed.success, "trường lạ phải là lỗi, không phải bị bỏ qua");
  assert.match(parsed.error.issues[0]!.code, /unrecognized_keys/);
});

test("decision khai sai tên trường phạm vi báo lỗi thay vì im lặng bỏ qua", () => {
  const parsed = zDecision.safeParse({ ...baseDecision, scop: "P-x" });
  assert.equal(parsed.success, false);
});

/* --------------------------------------------------------------------------
 * collectArray: một bản ghi hỏng không được làm rụng CẢ FILE khỏi graph.
 *
 * Bug đã kiểm chứng: `collectArray` từng parse cả mảng bằng một lời gọi
 * `schema.safeParse` cấp file (`zFactFile`/`zClaimFile`/`zDecisionFile`). Một
 * phần tử hỏng ⇒ `parsed.success === false` ⇒ `continue` ⇒ toàn bộ bản ghi
 * trong file đó biến mất khỏi graph — tri thức đã kiểm chứng biến mất im
 * lặng khỏi brief/search. Nhóm test dưới đây khoá lại: chỉ phần tử hỏng bị
 * loại, phần còn lại của file vẫn vào graph bình thường.
 * ---------------------------------------------------------------------- */

test("fact hỏng ở giữa file KHÔNG kéo các fact hợp lệ khác cùng file ra khỏi graph", async () => {
  const root = await makeProject({
    ".ganas/facts/f.yaml": `- id: F-ACC-001
  scope: P-thu
  statement: "fact một"
  verify:
    run: "true"
- id: F-ACC-002
  statement: "fact hai, thiếu scope"
  verify:
    run: "true"
- id: F-ACC-003
  scope: P-thu
  statement: "fact ba"
  verify:
    run: "true"
`,
  });
  try {
    const graph = await loadGraph(root);

    assert.ok(
      graph.facts.has("F-ACC-001"),
      "fact hợp lệ đứng TRƯỚC phần tử hỏng phải còn trong graph",
    );
    assert.ok(
      graph.facts.has("F-ACC-003"),
      "fact hợp lệ đứng SAU phần tử hỏng phải còn trong graph",
    );
    assert.ok(!graph.facts.has("F-ACC-002"), "fact hỏng (thiếu scope) không được lọt vào graph");
    assert.equal(graph.facts.size, 2, "chỉ đúng phần tử hỏng bị loại, không phải cả file");

    const schemaDiags = graph.loadDiagnostics.filter((d) => d.code.startsWith("schema/"));
    assert.equal(
      schemaDiags.length,
      1,
      `phải đúng một nhóm diagnostic schema/* cho riêng phần tử hỏng: ${JSON.stringify(schemaDiags)}`,
    );
    // Dòng phải trỏ vào vùng của F-ACC-002 (phần tử thứ hai, dòng 6 trong
    // fixture trên) — KHÔNG phải dòng 1 (đầu file). Khoá lại việc gắn tiền tố
    // chỉ số [index, ...issue.path] trước khi tính lineOfPath.
    assert.equal(
      schemaDiags[0]!.line,
      6,
      `line phải trỏ đúng vùng phần tử hỏng (dòng 6), nhận: ${schemaDiags[0]!.line}`,
    );
  } finally {
    await cleanup(root);
  }
});

test("claim hỏng ở giữa file KHÔNG kéo các claim hợp lệ khác cùng file ra khỏi graph", async () => {
  const root = await makeProject({
    ".ganas/claims/c.yaml": `- id: C-001
  scope: P-thu
  statement: "claim một"
  anchors: ["src/a.ts#L1"]
  provenance: session
- id: C-002
  scope: P-thu
  statement: "claim hai, thiếu anchors"
  provenance: session
- id: C-003
  scope: P-thu
  statement: "claim ba"
  anchors: ["src/c.ts#L1"]
  provenance: session
`,
  });
  try {
    const graph = await loadGraph(root);

    assert.ok(graph.claims.has("C-001"));
    assert.ok(graph.claims.has("C-003"));
    assert.ok(!graph.claims.has("C-002"), "claim hỏng (thiếu anchors) không được lọt vào graph");
    assert.equal(graph.claims.size, 2);

    const schemaDiags = graph.loadDiagnostics.filter((d) => d.code.startsWith("schema/"));
    assert.equal(schemaDiags.length, 1, JSON.stringify(schemaDiags));
  } finally {
    await cleanup(root);
  }
});

test("decision hỏng ở giữa file KHÔNG kéo các decision hợp lệ khác cùng file ra khỏi graph", async () => {
  const root = await makeProject({
    ".ganas/decisions/d.yaml": `- id: DEC-001
  statement: "quyết định một"
  decided_by: "@alice"
  decided_at: 2025-01-01T00:00:00Z
- id: DEC-002
  statement: "quyết định hai, thiếu decided_by"
  decided_at: 2025-01-02T00:00:00Z
- id: DEC-003
  statement: "quyết định ba"
  decided_by: "@bob"
  decided_at: 2025-01-03T00:00:00Z
`,
  });
  try {
    const graph = await loadGraph(root);

    assert.ok(graph.decisions.has("DEC-001"));
    assert.ok(graph.decisions.has("DEC-003"));
    assert.ok(
      !graph.decisions.has("DEC-002"),
      "decision hỏng (thiếu decided_by) không được lọt vào graph",
    );
    assert.equal(graph.decisions.size, 2);

    const schemaDiags = graph.loadDiagnostics.filter((d) => d.code.startsWith("schema/"));
    assert.equal(schemaDiags.length, 1, JSON.stringify(schemaDiags));
  } finally {
    await cleanup(root);
  }
});

test("file fact không phải mảng vẫn báo schema/invalid_type, không ném lỗi", async () => {
  const root = await makeProject({
    ".ganas/facts/f.yaml": `id: F-ACC-001
scope: P-thu
`,
  });
  try {
    const graph = await loadGraph(root);
    assert.equal(graph.facts.size, 0);
    assert.ok(graph.loadDiagnostics.some((d) => d.code === "schema/invalid_type"));
  } finally {
    await cleanup(root);
  }
});

test("file fact rỗng không sinh diagnostic nào", async () => {
  const root = await makeProject({
    ".ganas/facts/f.yaml": "",
  });
  try {
    const graph = await loadGraph(root);
    assert.equal(graph.facts.size, 0);
    assert.deepEqual(graph.loadDiagnostics, []);
  } finally {
    await cleanup(root);
  }
});

test("load/duplicate-id vẫn báo đúng khi trùng id trong CÙNG một file fact", async () => {
  const root = await makeProject({
    ".ganas/facts/f.yaml": `- id: F-ACC-001
  scope: P-thu
  statement: "bản đầu"
  verify:
    run: "true"
- id: F-ACC-001
  scope: P-thu
  statement: "bản trùng"
  verify:
    run: "true"
`,
  });
  try {
    const graph = await loadGraph(root);
    assert.equal(graph.facts.size, 1);
    assert.equal(graph.facts.get("F-ACC-001")!.value.statement, "bản đầu");
    assert.ok(graph.loadDiagnostics.some((d) => d.code === "load/duplicate-id"));
  } finally {
    await cleanup(root);
  }
});

test("load/duplicate-id vẫn báo đúng khi trùng id giữa HAI file fact", async () => {
  const root = await makeProject({
    ".ganas/facts/a.yaml": `- id: F-ACC-001
  scope: P-thu
  statement: "file a"
  verify:
    run: "true"
`,
    ".ganas/facts/b.yaml": `- id: F-ACC-001
  scope: P-thu
  statement: "file b"
  verify:
    run: "true"
`,
  });
  try {
    const graph = await loadGraph(root);
    assert.equal(graph.facts.size, 1);
    assert.ok(graph.loadDiagnostics.some((d) => d.code === "load/duplicate-id"));
  } finally {
    await cleanup(root);
  }
});

test("file fact toàn bộ hợp lệ thì không đổi gì — không diagnostic thừa", async () => {
  const root = await makeProject({
    ".ganas/facts/f.yaml": `- id: F-ACC-001
  scope: P-thu
  statement: "fact một"
  verify:
    run: "true"
- id: F-ACC-002
  scope: P-thu
  statement: "fact hai"
  verify:
    run: "true"
`,
  });
  try {
    const graph = await loadGraph(root);
    assert.equal(graph.facts.size, 2);
    assert.deepEqual(graph.loadDiagnostics, []);
  } finally {
    await cleanup(root);
  }
});
