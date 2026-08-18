import assert from "node:assert/strict";
import { test } from "node:test";

import { loadGraph } from "../src/graph/load.js";
import { zIcebox } from "../src/model/index.js";
import { cleanup, makeProject } from "./helpers.js";

/* --------------------------------------------------------------------------
 * Bản ghi tối thiểu hợp lệ
 * ---------------------------------------------------------------------- */

function minimalIcebox(overrides: Record<string, unknown> = {}) {
  return {
    id: "ICE-001",
    title: "ganas search không index claim/decision",
    found_at: "2026-01-01T00:00:00Z",
    weight: 3,
    ease: 3,
    why_deferred: "chưa ai rảnh, không chặn mục tiêu hiện tại",
    anchors: ["src/search.ts#L18-L21"],
    ...overrides,
  };
}

test("bản ghi icebox tối thiểu hợp lệ parse được", () => {
  const parsed = zIcebox.parse(minimalIcebox());
  assert.equal(parsed.id, "ICE-001");
  assert.equal(parsed.status, "open");
  assert.equal(parsed.review_after_days, 30);
  assert.equal(parsed.scope, undefined);
});

test("bản ghi icebox có scope hợp lệ parse được", () => {
  const parsed = zIcebox.parse(minimalIcebox({ scope: "P-graph-core" }));
  assert.equal(parsed.scope, "P-graph-core");
});

/* --------------------------------------------------------------------------
 * Từng trường bắt buộc, thiếu → lỗi
 * ---------------------------------------------------------------------- */

const REQUIRED_FIELDS = ["id", "title", "found_at", "weight", "ease", "why_deferred", "anchors"];

for (const field of REQUIRED_FIELDS) {
  test(`icebox thiếu trường bắt buộc "${field}" bị từ chối`, () => {
    const record = minimalIcebox();
    delete (record as Record<string, unknown>)[field];
    const parsed = zIcebox.safeParse(record);
    assert.equal(parsed.success, false, `thiếu ${field} phải bị từ chối`);
  });
}

/* --------------------------------------------------------------------------
 * Sáu nhánh superRefine
 * ---------------------------------------------------------------------- */

test("superRefine 1: status khác open mà thiếu closed_at → lỗi", () => {
  const parsed = zIcebox.safeParse(minimalIcebox({ status: "closed", closed_reason: "hết cần" }));
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(parsed.error.issues.some((i) => i.path.join(".") === "closed_at"));
  }
});

test("superRefine 2: status closed mà thiếu closed_reason → lỗi", () => {
  const parsed = zIcebox.safeParse(
    minimalIcebox({ status: "closed", closed_at: "2026-09-01T00:00:00Z" }),
  );
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(parsed.error.issues.some((i) => i.path.join(".") === "closed_reason"));
  }
});

test("superRefine 3: status promoted mà thiếu promoted_to → lỗi", () => {
  const parsed = zIcebox.safeParse(
    minimalIcebox({ status: "promoted", closed_at: "2026-09-01T00:00:00Z" }),
  );
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(parsed.error.issues.some((i) => i.path.join(".") === "promoted_to"));
  }
});

test("superRefine 4: có promoted_to mà status khác promoted → lỗi", () => {
  const parsed = zIcebox.safeParse(
    minimalIcebox({
      status: "closed",
      closed_at: "2026-09-01T00:00:00Z",
      closed_reason: "đã thăng cấp",
      promoted_to: "T-001",
    }),
  );
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(parsed.error.issues.some((i) => i.path.join(".") === "promoted_to"));
  }
});

test("superRefine 5: status open mà có closed_at/closed_reason → lỗi", () => {
  const parsed = zIcebox.safeParse(
    minimalIcebox({ status: "open", closed_at: "2026-09-01T00:00:00Z" }),
  );
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(parsed.error.issues.some((i) => i.path.join(".") === "status"));
  }
});

test("superRefine 6: found_at ở tương lai quá ngưỡng lệch đồng hồ → lỗi", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const parsed = zIcebox.safeParse(minimalIcebox({ found_at: future }));
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(parsed.error.issues.some((i) => i.path.join(".") === "found_at"));
  }
});

test("bản ghi promoted đầy đủ (status + closed_at + promoted_to) hợp lệ", () => {
  const parsed = zIcebox.parse(
    minimalIcebox({
      status: "promoted",
      closed_at: "2026-09-01T00:00:00Z",
      promoted_to: "T-042",
    }),
  );
  assert.equal(parsed.status, "promoted");
  assert.equal(parsed.promoted_to, "T-042");
});

test("bản ghi closed đầy đủ (status + closed_at + closed_reason) hợp lệ", () => {
  const parsed = zIcebox.parse(
    minimalIcebox({
      status: "closed",
      closed_at: "2026-09-01T00:00:00Z",
      closed_reason: "không còn liên quan sau khi đổi kiến trúc",
    }),
  );
  assert.equal(parsed.status, "closed");
});

/* --------------------------------------------------------------------------
 * Ràng buộc khoảng giá trị
 * ---------------------------------------------------------------------- */

test("weight: 0 bị từ chối", () => {
  assert.equal(zIcebox.safeParse(minimalIcebox({ weight: 0 })).success, false);
});

test("weight: 6 bị từ chối", () => {
  assert.equal(zIcebox.safeParse(minimalIcebox({ weight: 6 })).success, false);
});

test("ease: 0 bị từ chối", () => {
  assert.equal(zIcebox.safeParse(minimalIcebox({ ease: 0 })).success, false);
});

test("ease: 6 bị từ chối", () => {
  assert.equal(zIcebox.safeParse(minimalIcebox({ ease: 6 })).success, false);
});

test("review_after_days: 0 bị từ chối", () => {
  assert.equal(zIcebox.safeParse(minimalIcebox({ review_after_days: 0 })).success, false);
});

test("review_after_days không khai dùng mặc định 30", () => {
  const parsed = zIcebox.parse(minimalIcebox());
  assert.equal(parsed.review_after_days, 30);
});

/* --------------------------------------------------------------------------
 * .strict() — trường lạ là LỖI
 * ---------------------------------------------------------------------- */

test("⭐ trường gõ sai (why_defered) bị TỪ CHỐI, không bị nuốt im lặng", () => {
  // Giống test tương ứng cho zDecision: giữ mọi trường bắt buộc hợp lệ, chỉ
  // thêm một trường gõ sai tên bên cạnh — cô lập đúng lỗi "khoá lạ", không
  // trộn với lỗi "thiếu trường bắt buộc".
  const parsed = zIcebox.safeParse({ ...minimalIcebox(), why_defered: "gõ sai tên trường" });
  assert.equal(parsed.success, false, "trường lạ phải là lỗi, không phải bị bỏ qua");
  if (!parsed.success) {
    assert.match(parsed.error.issues[0]!.code, /unrecognized_keys/);
  }
});

/* --------------------------------------------------------------------------
 * Qua loadGraph thật
 * ---------------------------------------------------------------------- */

test("loadGraph: hai bản ghi icebox trong một file đều vào graph.icebox", async () => {
  const root = await makeProject({
    ".ganas/icebox/2026-08.yaml": `- id: ICE-001
  title: "phát hiện một"
  found_at: "2026-01-01T00:00:00Z"
  weight: 3
  ease: 3
  why_deferred: "chưa tới lượt"
  anchors: ["src/a.ts#L1"]
- id: ICE-002
  title: "phát hiện hai"
  found_at: "2026-01-01T00:00:00Z"
  weight: 2
  ease: 4
  why_deferred: "ưu tiên thấp hơn"
  anchors: ["src/b.ts#L1"]
`,
  });
  try {
    const graph = await loadGraph(root);
    assert.ok(graph.icebox.has("ICE-001"));
    assert.ok(graph.icebox.has("ICE-002"));
    assert.equal(graph.icebox.size, 2);
  } finally {
    await cleanup(root);
  }
});

test("loadGraph: một bản ghi icebox hỏng schema không làm rụng bản ghi hợp lệ khác cùng file", async () => {
  const root = await makeProject({
    ".ganas/icebox/2026-08.yaml": `- id: ICE-001
  title: "phát hiện hợp lệ trước"
  found_at: "2026-01-01T00:00:00Z"
  weight: 3
  ease: 3
  why_deferred: "chưa tới lượt"
  anchors: ["src/a.ts#L1"]
- id: ICE-002
  title: "phát hiện hỏng, thiếu why_deferred"
  found_at: "2026-01-01T00:00:00Z"
  weight: 3
  ease: 3
  anchors: ["src/b.ts#L1"]
- id: ICE-003
  title: "phát hiện hợp lệ sau"
  found_at: "2026-01-01T00:00:00Z"
  weight: 1
  ease: 5
  why_deferred: "chưa tới lượt"
  anchors: ["src/c.ts#L1"]
`,
  });
  try {
    const graph = await loadGraph(root);
    assert.ok(graph.icebox.has("ICE-001"), "bản ghi hợp lệ trước phần tử hỏng phải còn");
    assert.ok(graph.icebox.has("ICE-003"), "bản ghi hợp lệ sau phần tử hỏng phải còn");
    assert.ok(!graph.icebox.has("ICE-002"), "bản ghi hỏng (thiếu why_deferred) không được lọt vào graph");
    assert.equal(graph.icebox.size, 2);

    const schemaDiags = graph.loadDiagnostics.filter((d) => d.code.startsWith("schema/"));
    assert.equal(
      schemaDiags.length,
      1,
      `phải đúng một nhóm diagnostic schema/* cho riêng phần tử hỏng: ${JSON.stringify(schemaDiags)}`,
    );
  } finally {
    await cleanup(root);
  }
});

test("loadGraph: id icebox trùng trong cùng file báo load/duplicate-id", async () => {
  const root = await makeProject({
    ".ganas/icebox/2026-08.yaml": `- id: ICE-001
  title: "bản đầu"
  found_at: "2026-01-01T00:00:00Z"
  weight: 3
  ease: 3
  why_deferred: "chưa tới lượt"
  anchors: ["src/a.ts#L1"]
- id: ICE-001
  title: "bản trùng"
  found_at: "2026-01-01T00:00:00Z"
  weight: 2
  ease: 2
  why_deferred: "chưa tới lượt"
  anchors: ["src/b.ts#L1"]
`,
  });
  try {
    const graph = await loadGraph(root);
    assert.equal(graph.icebox.size, 1);
    assert.equal(graph.icebox.get("ICE-001")!.value.title, "bản đầu");
    assert.ok(graph.loadDiagnostics.some((d) => d.code === "load/duplicate-id"));
  } finally {
    await cleanup(root);
  }
});
