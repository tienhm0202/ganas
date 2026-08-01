import assert from "node:assert/strict";
import { test } from "node:test";

import { freshnessOf, zFact } from "../src/model/index.js";
import { check, goal, task, validSpine } from "./helpers.js";

/* --- Anchor bắt buộc ------------------------------------------------------ */

test("claim không có anchor bị từ chối — không bằng chứng thì không phải tri thức", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/claims/linh-tinh.yaml": `- id: C-001
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
    statement: "s",
    verify: { run: "true" },
    last_result: "pass",
  });
  assert.equal(parsed.success, false, "không thể 'đã kiểm' mà không có thời điểm kiểm");
});
