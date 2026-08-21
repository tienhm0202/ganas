import assert from "node:assert/strict";
import { test } from "node:test";

import { loadGraph } from "../src/graph/load.js";
import { validateGraph } from "../src/graph/validate.js";
import { zProposal } from "../src/model/index.js";
import { cleanup, makeProject, validSpine } from "./helpers.js";

/**
 * Proposal — chỗ lệch CHƯA ai quyết (`src/model/proposal.ts`).
 *
 * Hai tầng, test cả hai: schema (trạng thái bất khả thi bị chặn ngay lúc
 * parse) và validate (liên kết treo, đề nghị lại thứ đã bị từ chối).
 */

const FOUND_AT = "2026-01-01T00:00:00Z";
const NOW = Date.parse(FOUND_AT);

interface Opts {
  status?: string;
  scope?: string;
  problem?: string;
  change?: string;
  extra?: string[];
}

function proposalYaml(id: string, o: Opts = {}): string {
  const lines = [
    `id: ${id}`,
    `title: "Đề xuất ${id}"`,
    `scope: ${o.scope ?? "P-thu"}`,
    `problem: "${o.problem ?? `hai khối cùng trỏ src/a.ts`}"`,
    `proposed_change: "${o.change ?? "tách src/a.ts ra khối riêng"}"`,
    `anchors:`,
    `  - "src/a.ts#L1"`,
    `weight: 3`,
    `ease: 4`,
    `found_at: "${FOUND_AT}"`,
    `status: ${o.status ?? "pending"}`,
  ];
  return [...lines, ...(o.extra ?? [])].join("\n") + "\n";
}

/* --- Tầng schema ---------------------------------------------------------- */

test("pending hợp lệ, và mặc định status là pending", () => {
  const parsed = zProposal.parse({
    id: "PR-001",
    title: "Tách khối",
    scope: "P-thu",
    problem: "hai khối cùng trỏ một file",
    proposed_change: "tách ra khối riêng",
    anchors: ["src/a.ts#L1"],
    weight: 3,
    ease: 4,
    found_at: FOUND_AT,
  });
  assert.equal(parsed.status, "pending");
  assert.deepEqual(parsed.supersedes, []);
});

test("duyệt mà không ghi người duyệt → schema chặn", () => {
  const r = zProposal.safeParse({
    id: "PR-002",
    title: "Tách khối",
    scope: "P-thu",
    problem: "x",
    proposed_change: "y",
    anchors: ["src/a.ts#L1"],
    weight: 3,
    ease: 4,
    found_at: FOUND_AT,
    status: "approved",
  });
  assert.equal(r.success, false);
  const paths = r.error.issues.map((i) => i.path.join("."));
  assert.ok(paths.includes("decided_by"), JSON.stringify(paths));
  assert.ok(paths.includes("decided_at"), JSON.stringify(paths));
});

test("từ chối mà không nói vì sao → schema chặn", () => {
  const r = zProposal.safeParse({
    id: "PR-003",
    title: "Tách khối",
    scope: "P-thu",
    problem: "x",
    proposed_change: "y",
    anchors: ["src/a.ts#L1"],
    weight: 3,
    ease: 4,
    found_at: FOUND_AT,
    status: "rejected",
    decided_by: "@nguoi-duyet",
    decided_at: FOUND_AT,
  });
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "why_rejected"));
});

test("còn pending mà đã có dấu vết đã quyết → schema chặn", () => {
  const r = zProposal.safeParse({
    id: "PR-004",
    title: "Tách khối",
    scope: "P-thu",
    problem: "x",
    proposed_change: "y",
    anchors: ["src/a.ts#L1"],
    weight: 3,
    ease: 4,
    found_at: FOUND_AT,
    decided_by: "@nguoi-duyet",
  });
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "decided_by"));
});

test("promoted_to chỉ được có khi đã duyệt", () => {
  const r = zProposal.safeParse({
    id: "PR-005",
    title: "Tách khối",
    scope: "P-thu",
    problem: "x",
    proposed_change: "y",
    anchors: ["src/a.ts#L1"],
    weight: 3,
    ease: 4,
    found_at: FOUND_AT,
    promoted_to: "T-001",
  });
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "promoted_to"));
});

test("đề xuất KHÔNG có anchor thì không phải phát hiện, chỉ là ý kiến", () => {
  const r = zProposal.safeParse({
    id: "PR-006",
    title: "Tách khối",
    scope: "P-thu",
    problem: "x",
    proposed_change: "y",
    anchors: [],
    weight: 3,
    ease: 4,
    found_at: FOUND_AT,
  });
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "anchors"));
});

/* --- Tầng graph ----------------------------------------------------------- */

async function codesFor(files: Record<string, string>): Promise<string[]> {
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    return validateGraph(graph, { now: NOW }).map((d) => d.code);
  } finally {
    await cleanup(root);
  }
}

test("proposal hợp lệ được nạp vào graph và không sinh diagnostic nào của riêng nó", async () => {
  const files = validSpine();
  files[".ganas/proposals/PR-001.yaml"] = proposalYaml("PR-001");
  const codes = await codesFor(files);
  assert.deepEqual(codes.filter((c) => c.includes("proposal")), []);
});

test("phạm vi ma → scope/proposal-scope-not-found", async () => {
  const files = validSpine();
  files[".ganas/proposals/PR-001.yaml"] = proposalYaml("PR-001", { scope: "P-khong-co" });
  const codes = await codesFor(files);
  assert.ok(codes.includes("scope/proposal-scope-not-found"), JSON.stringify(codes));
});

test("promoted_to trỏ thực thể ma → spine/proposal-missing-target", async () => {
  const files = validSpine();
  files[".ganas/proposals/PR-001.yaml"] = proposalYaml("PR-001", {
    status: "approved",
    extra: [
      `decided_by: "@nguoi-duyet"`,
      `decided_at: "${FOUND_AT}"`,
      `promoted_to: T-999`,
    ],
  });
  const codes = await codesFor(files);
  assert.ok(codes.includes("spine/proposal-missing-target"), JSON.stringify(codes));
});

test("promoted_to trỏ task có thật → không báo gì", async () => {
  const files = validSpine();
  files[".ganas/proposals/PR-001.yaml"] = proposalYaml("PR-001", {
    status: "approved",
    extra: [`decided_by: "@nguoi-duyet"`, `decided_at: "${FOUND_AT}"`, `promoted_to: T-001`],
  });
  const codes = await codesFor(files);
  assert.ok(!codes.includes("spine/proposal-missing-target"), JSON.stringify(codes));
});

test("hai đề xuất cùng đích → spine/proposal-duplicate-target", async () => {
  const files = validSpine();
  const decided = [`decided_by: "@nguoi-duyet"`, `decided_at: "${FOUND_AT}"`, `promoted_to: T-001`];
  files[".ganas/proposals/PR-001.yaml"] = proposalYaml("PR-001", {
    status: "approved",
    extra: decided,
  });
  files[".ganas/proposals/PR-002.yaml"] = proposalYaml("PR-002", {
    status: "approved",
    change: "tách src/b.ts ra khối riêng",
    extra: decided,
  });
  const codes = await codesFor(files);
  assert.ok(codes.includes("spine/proposal-duplicate-target"), JSON.stringify(codes));
});

test("đề nghị lại đúng thay đổi đã bị từ chối → knowledge/proposal-repeats-rejected", async () => {
  const files = validSpine();
  files[".ganas/proposals/PR-001.yaml"] = proposalYaml("PR-001", {
    status: "rejected",
    extra: [
      `decided_by: "@nguoi-duyet"`,
      `decided_at: "${FOUND_AT}"`,
      `why_rejected: "hệ cũ đang chạy, chưa đụng"`,
    ],
  });
  // Cùng `proposed_change`, khác tiêu đề — đúng cách một đề xuất bị loại quay lại.
  files[".ganas/proposals/PR-002.yaml"] = proposalYaml("PR-002", {
    problem: "khối trùng vùng code",
  });
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    const diag = validateGraph(graph, { now: NOW }).find(
      (d) => d.code === "knowledge/proposal-repeats-rejected",
    );
    assert.ok(diag, "phải bắt được đề xuất lặp lại");
    assert.match(diag.hint ?? "", /hệ cũ đang chạy/, "hint phải trả lại đúng lý do từ chối cũ");
  } finally {
    await cleanup(root);
  }
});

test("problem chép y hệt proposed_change → knowledge/proposal-problem-equals-change", async () => {
  const files = validSpine();
  files[".ganas/proposals/PR-001.yaml"] = proposalYaml("PR-001", {
    problem: "tách src/a.ts ra khối riêng",
    change: "Tách  src/a.ts   ra khối riêng",
  });
  const codes = await codesFor(files);
  assert.ok(codes.includes("knowledge/proposal-problem-equals-change"), JSON.stringify(codes));
});

test("supersedes trỏ đề xuất ma → spine/proposal-missing-supersede", async () => {
  const files = validSpine();
  files[".ganas/proposals/PR-001.yaml"] = proposalYaml("PR-001", {
    extra: [`supersedes:`, `  - PR-999`],
  });
  const codes = await codesFor(files);
  assert.ok(codes.includes("spine/proposal-missing-supersede"), JSON.stringify(codes));
});
