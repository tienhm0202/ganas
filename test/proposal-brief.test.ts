import assert from "node:assert/strict";
import { test } from "node:test";

import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import { renderBrief } from "../src/render/brief.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

/**
 * T-009 / D-004 ràng buộc (1): brief chỉ được in ĐÚNG MỘT DÒNG ĐẾM cho
 * proposal `pending` CÙNG PHẠM VI với task, kèm lệnh tra chi tiết — không bao
 * giờ in `problem`/`proposed_change`/`title`. Chặn cả hai chiều: có proposal
 * pending cùng scope → đúng một dòng có số đếm và lệnh tra; proposal khác
 * scope hoặc đã quyết (approved/rejected) → brief không nhắc một chữ nào.
 */

const FOUND_AT = "2026-01-01T00:00:00Z";

interface ProposalOpts {
  status?: "pending" | "approved" | "rejected" | "superseded";
  scope?: string;
  problem?: string;
  change?: string;
  title?: string;
  extra?: string[];
}

/** Bản ghi proposal tối thiểu hợp lệ — một file, một object (collectSingle). */
function proposalYaml(id: string, o: ProposalOpts = {}): string {
  const status = o.status ?? "pending";
  const decided =
    status === "approved" || status === "rejected"
      ? [`decided_by: "@nguoi-duyet"`, `decided_at: "${FOUND_AT}"`]
      : [];
  const whyRejected = status === "rejected" ? [`why_rejected: "không đáng làm bây giờ"`] : [];
  const lines = [
    `id: ${id}`,
    `title: "${o.title ?? `Nội dung riêng tư của ${id} không được lộ vào brief`}"`,
    `scope: ${o.scope ?? "P-thu"}`,
    `problem: "${o.problem ?? "vấn đề bí mật của proposal, brief không được in"}"`,
    `proposed_change: "${o.change ?? "giải pháp bí mật của proposal, brief không được in"}"`,
    `anchors:`,
    `  - "src/a.ts#L1"`,
    `weight: 3`,
    `ease: 4`,
    `found_at: "${FOUND_AT}"`,
    `status: ${status}`,
    ...decided,
    ...whyRejected,
  ];
  return [...lines, ...(o.extra ?? [])].join("\n") + "\n";
}

/** Dự án hai phạm vi (P-thu/P-khac) + task T-001 ở P-thu + một proposal. */
async function withProposal(id: string, o: ProposalOpts = {}): Promise<string> {
  return makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/scopes/P-khac.yaml": scope("P-khac", { modules: ["M-b"] }),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", { scope: "P-khac", paths: ["src/b/**"] }),
    [`.ganas/proposals/${id}.yaml`]: proposalYaml(id, o),
  });
}

async function briefOf(root: string, taskId = "T-001"): Promise<string> {
  const graph = await loadGraph(root);
  const freshness = await computeFreshness(graph);
  return renderBrief({ graph, task: graph.tasks.get(taskId)!, freshness });
}

test("⭐ proposal pending cùng scope → đúng MỘT dòng đếm, có số đếm và lệnh tra, KHÔNG in nội dung", async () => {
  const root = await withProposal("PR-001");
  try {
    const brief = await briefOf(root);
    assert.match(brief, /## Đề xuất đang chờ duyệt/);

    const start = brief.indexOf("## Đề xuất đang chờ duyệt");
    const rest = brief.slice(start);
    const end = rest.indexOf("\n## ", 3);
    const section = end === -1 ? rest : rest.slice(0, end);

    // Đúng một dòng nội dung dưới tiêu đề (bỏ dòng tiêu đề và dòng trắng).
    const bodyLines = section
      .split("\n")
      .slice(1)
      .filter((l) => l.trim().length > 0);
    assert.equal(bodyLines.length, 1, "phải đúng một dòng đếm, không hơn");

    assert.match(section, /\b1\b/, "phải nêu số đếm");
    assert.match(section, /ganas proposal list/, "phải trỏ sang lệnh tra chi tiết");

    // Không được lộ nội dung riêng tư của proposal.
    assert.doesNotMatch(brief, /vấn đề bí mật/, "KHÔNG được in problem");
    assert.doesNotMatch(brief, /giải pháp bí mật/, "KHÔNG được in proposed_change");
    assert.doesNotMatch(
      brief,
      /Nội dung riêng tư của PR-001/,
      "KHÔNG được in title của proposal",
    );
  } finally {
    await cleanup(root);
  }
});

test("nhiều proposal pending cùng scope → đếm đúng tổng số, vẫn một dòng", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/proposals/PR-001.yaml": proposalYaml("PR-001"),
    ".ganas/proposals/PR-002.yaml": proposalYaml("PR-002"),
    ".ganas/proposals/PR-003.yaml": proposalYaml("PR-003"),
  });
  try {
    const brief = await briefOf(root);
    const start = brief.indexOf("## Đề xuất đang chờ duyệt");
    const rest = brief.slice(start);
    const end = rest.indexOf("\n## ", 3);
    const section = end === -1 ? rest : rest.slice(0, end);
    assert.match(section, /\b3\b/, "phải đếm đúng cả ba proposal");
  } finally {
    await cleanup(root);
  }
});

test("proposal pending nhưng KHÁC scope task → brief không nhắc một chữ nào", async () => {
  const root = await withProposal("PR-001", { scope: "P-khac" });
  try {
    const brief = await briefOf(root);
    assert.ok(!brief.includes("## Đề xuất đang chờ duyệt"));
    assert.ok(!brief.includes("PR-001"));
  } finally {
    await cleanup(root);
  }
});

test("proposal đã approved/rejected/superseded cùng scope → brief không nhắc một chữ nào", async () => {
  for (const status of ["approved", "rejected", "superseded"] as const) {
    const root = await withProposal("PR-001", { status });
    try {
      const brief = await briefOf(root);
      assert.ok(
        !brief.includes("## Đề xuất đang chờ duyệt"),
        `status="${status}" đã có người quyết, không còn là "đang chờ duyệt"`,
      );
      assert.ok(!brief.includes("PR-001"));
    } finally {
      await cleanup(root);
    }
  }
});

test("không có proposal pending nào cùng scope → brief KHÔNG có tiêu đề mục (không tiêu đề rỗng)", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  try {
    const brief = await briefOf(root);
    assert.ok(!brief.includes("## Đề xuất đang chờ duyệt"));
  } finally {
    await cleanup(root);
  }
});

test("mục đề xuất nằm TRƯỚC phần volatile trong chuỗi kết quả", async () => {
  const root = await withProposal("PR-001");
  try {
    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const brief = renderBrief({
      graph,
      task: graph.tasks.get("T-001")!,
      freshness,
      volatile: "MOC-THOI-GIAN",
    });
    assert.ok(
      brief.indexOf("## Đề xuất đang chờ duyệt") < brief.indexOf("MOC-THOI-GIAN"),
      "mục đề xuất thuộc phần ổn định, phải đứng trước phần volatile (đặt sau sẽ phá prompt cache)",
    );
  } finally {
    await cleanup(root);
  }
});
