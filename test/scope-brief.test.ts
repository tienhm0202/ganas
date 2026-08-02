import assert from "node:assert/strict";
import { test } from "node:test";

import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import { selectNextTask } from "../src/graph/select.js";
import { renderBrief } from "../src/render/brief.js";
import { factTarget, runTarget } from "../src/verify/run.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

/**
 * Phạm vi là ranh giới của tri thức. Brief phải thể hiện đúng ranh giới đó —
 * và đúng MỘT cách: hạ cấp độ tin, không bao giờ giấu.
 */

/** Dựng dự án hai phạm vi, fact nằm ở cả hai. */
async function twoScopes(): Promise<string> {
  return makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task("T-001", {
      extra: "context_contract:\n  facts:\n    - F-TRONG-001\n    - F-NGOAI-001",
    }),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/scopes/P-khac.yaml": scope("P-khac", { modules: ["M-b"] }),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", { scope: "P-khac", paths: ["src/b/**"] }),
    ".ganas/facts/f.yaml": `- id: F-TRONG-001
  scope: P-thu
  statement: "trong phạm vi: hàng đợi retry tối đa 3 lần"
  depends_on: ["src/a/**"]
  verify:
    run: "test -d .ganas/scopes"
  last_verified_at: 2026-08-01T00:00:00Z
  last_result: pass
- id: F-NGOAI-001
  scope: P-khac
  statement: "ngoài phạm vi: token hết hạn sau 15 phút"
  depends_on: ["src/b/**"]
  verify:
    run: "test -d .ganas/modules"
  last_verified_at: 2026-08-01T00:00:00Z
  last_result: pass
`,
  });
}

/**
 * Verify THẬT cả hai fact để chúng cùng `fresh`. Có chủ đích: nếu chỉ dựa vào
 * `last_result: pass` khai tay thì cả hai đều `never_verified`, và test sẽ pass
 * vì lý do sai — fact ngoài phạm vi vắng mặt do CŨ, không phải do ngoài phạm vi.
 */
async function verifyAllFacts(root: string): Promise<void> {
  const graph = await loadGraph(root);
  for (const f of graph.facts.values()) {
    await runTarget(factTarget(f), { root, by: "test", skipMutation: true });
  }
}

async function briefOf(root: string, taskId = "T-001"): Promise<string> {
  const graph = await loadGraph(root);
  const freshness = await computeFreshness(graph);
  return renderBrief({ graph, task: graph.tasks.get(taskId)!, freshness });
}

test("⭐ fact ngoài phạm vi KHÔNG vào 'Tri thức dùng được' nhưng LUÔN hiện ở 'Ngoài phạm vi'", async () => {
  const root = await twoScopes();
  try {
    await verifyAllFacts(root);
    const brief = await briefOf(root);

    const usable = brief.slice(brief.indexOf("## Tri thức dùng được"));
    const usableSection = usable.slice(0, usable.indexOf("\n## ", 3));
    assert.match(usableSection, /F-TRONG-001/, "fact cùng phạm vi phải dùng được");
    assert.doesNotMatch(
      usableSection,
      /F-NGOAI-001/,
      "fact phạm vi khác KHÔNG được trình như sự thật dùng được ở đây",
    );

    // Nửa còn lại của bất biến, và là nửa dễ bị bỏ quên: nó vẫn phải HIỆN.
    // Giấu đi là đổi 'ảo giác' lấy 'quên' — cùng tổn thất, khó phát hiện hơn.
    assert.match(brief, /## ⚠ NGOÀI PHẠM VI/, "phải có mục riêng cho tri thức ngoài phạm vi");
    const out = brief.slice(brief.indexOf("## ⚠ NGOÀI PHẠM VI"));
    assert.match(out, /F-NGOAI-001/);
    assert.match(out, /token hết hạn sau 15 phút/, "phải in cả nội dung, không chỉ id");
    assert.match(out, /phạm vi `P-khac` ≠ `P-thu`/, "phải nói ĐÚNG lý do");
    assert.match(out, /ganas verify F-NGOAI-001/, "phải nói việc cần làm để dùng được nó");
  } finally {
    await cleanup(root);
  }
});

test("brief mở đầu bằng mục phạm vi: ranh giới code, người ký, nghiệm thu", async () => {
  const root = await twoScopes();
  try {
    const brief = await briefOf(root);
    assert.match(brief, /## Phạm vi công việc/);
    assert.match(brief, /P-thu — Phạm vi thử/);
    assert.match(brief, /nghiệm thu: @nguoi-duyet/);
    assert.match(brief, /`src\/a\/\*\*`/, "ranh giới code suy từ module.paths");
    assert.match(brief, /Ra ngoài là \*\*chưa biết\*\*/, "câu ranh giới phải có mặt");

    // Mục phạm vi phải đứng TRƯỚC mục tiêu: nó là khung để đọc mọi thứ sau đó.
    assert.ok(
      brief.indexOf("## Phạm vi công việc") < brief.indexOf("## Mục tiêu đang phục vụ"),
      "phạm vi là khung đọc, phải đến trước",
    );
  } finally {
    await cleanup(root);
  }
});

test("phạm vi thiếu người ký thì brief nói thẳng, không im lặng bỏ qua", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope("P-thu", { extra: "" }).replace(
      'owner: "@nguoi-duyet"\n',
      "",
    ),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  try {
    assert.match(await briefOf(root), /⚠ chưa ai ký nghiệm thu/);
  } finally {
    await cleanup(root);
  }
});

/* --- Decision: hai đường vào, hợp lại ------------------------------------- */

async function withDecisions(): Promise<string> {
  return makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/scopes/P-khac.yaml": scope("P-khac", { modules: ["M-b"] }),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", { scope: "P-khac", paths: ["src/b/**"] }),
    ".ganas/decisions/d.yaml": `- id: DEC-001
  scope: P-thu
  statement: "Dùng Postgres, không dùng Mongo"
  decided_by: "@tien"
  decided_at: 2026-01-01T00:00:00Z
- id: DEC-002
  statement: "Mọi log phải có request id"
  decided_by: "@tien"
  decided_at: 2026-01-01T00:00:00Z
- id: DEC-003
  scope: P-khac
  statement: "Token ký bằng RS256"
  decided_by: "@tien"
  decided_at: 2026-01-01T00:00:00Z
`,
  });
}

test("decision cùng phạm vi vào brief DÙ design không dẫn nó", async () => {
  const root = await withDecisions();
  try {
    const brief = await briefOf(root);
    // Trước N15, `design.decisions` là đường DUY NHẤT — design quên dẫn thì một
    // ràng buộc người đã chốt không bao giờ tới được phiên làm việc.
    assert.match(brief, /DEC-001/, "decision cùng phạm vi phải tới được phiên");
    assert.match(brief, /Dùng Postgres/);
  } finally {
    await cleanup(root);
  }
});

test("decision KHÔNG khai scope = áp toàn dự án, luôn vào brief", async () => {
  const root = await withDecisions();
  try {
    const brief = await briefOf(root);
    assert.match(brief, /DEC-002/);
    assert.match(brief, /toàn dự án/, "phải nói rõ vì sao nó có mặt");
  } finally {
    await cleanup(root);
  }
});

test("decision của phạm vi KHÁC không lọt vào brief", async () => {
  const root = await withDecisions();
  try {
    // Đây là chiều ngược với fact: decision bị thu hẹp nhầm thì model vi phạm
    // ràng buộc người đã chốt, nên mặc định của nó là "áp cho tất cả" — nhưng
    // khi đã khai scope tường minh thì phải tôn trọng đúng scope đó.
    assert.doesNotMatch(await briefOf(root), /DEC-003/);
  } finally {
    await cleanup(root);
  }
});

/* --- Liên tục phạm vi khi chọn task --------------------------------------- */

test("⭐ hai task ngang hạng: task cùng phạm vi với phiên trước được chọn", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/scopes/P-khac.yaml": scope("P-khac", { modules: ["M-b"] }),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", { scope: "P-khac", paths: ["src/b/**"] }),
    // T-001 đứng trước theo alphabet, nên nếu KHÔNG có liên tục phạm vi thì nó thắng.
    ".ganas/tasks/T-001.yaml": task("T-001", { scope: "P-khac" }),
    ".ganas/tasks/T-002.yaml": task("T-002", { scope: "P-thu" }),
  });
  try {
    const graph = await loadGraph(root);

    assert.equal(
      selectNextTask(graph)!.task.value.id,
      "T-001",
      "không có gợi ý thì theo thứ tự id",
    );
    assert.equal(
      selectNextTask(graph, { preferScope: "P-thu" })!.task.value.id,
      "T-002",
      "ở lại phạm vi cũ là tái dùng brief đã nạp, thay vì dựng lại ngữ cảnh từ đầu",
    );
  } finally {
    await cleanup(root);
  }
});

test("liên tục phạm vi KHÔNG thắng được việc đang dở", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/scopes/P-khac.yaml": scope("P-khac", { modules: ["M-b"] }),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", { scope: "P-khac", paths: ["src/b/**"] }),
    ".ganas/tasks/T-001.yaml": task("T-001", {
      scope: "P-khac",
      extra: "status: in_progress",
    }).replace("status: todo\n", ""),
    ".ganas/tasks/T-002.yaml": task("T-002", { scope: "P-thu" }),
  });
  try {
    const graph = await loadGraph(root);
    assert.equal(
      selectNextTask(graph, { preferScope: "P-thu" })!.task.value.id,
      "T-001",
      "việc dở (−1000) phải áp đảo liên tục phạm vi (−50)",
    );
  } finally {
    await cleanup(root);
  }
});
