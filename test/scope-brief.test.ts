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

/* --- Decision: quyết định đã bị thay thế thì không còn hiệu lực ----------- */

/** Dựng dự án với một mảng decision tuỳ ý, một phạm vi + một phạm vi khác. */
async function withDecisionYaml(decisionsYaml: string): Promise<string> {
  return makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/scopes/P-khac.yaml": scope("P-khac", { modules: ["M-b"] }),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", { scope: "P-khac", paths: ["src/b/**"] }),
    ".ganas/decisions/d.yaml": decisionsYaml,
  });
}

test("DEC đã bị supersede thì KHÔNG in, dù cùng phạm vi với task", async () => {
  const root = await withDecisionYaml(`- id: DEC-004
  scope: P-thu
  statement: "Cách cũ: gọi trực tiếp REST"
  decided_by: "@tien"
  decided_at: 2026-01-01T00:00:00Z
- id: DEC-009
  scope: P-thu
  statement: "Cách mới: qua hàng đợi"
  decided_by: "@tien"
  decided_at: 2026-02-01T00:00:00Z
  supersedes: ["DEC-004"]
`);
  try {
    const brief = await briefOf(root);
    assert.match(brief, /DEC-009/, "decision còn hiệu lực phải in");
    assert.doesNotMatch(brief, /DEC-004/, "decision đã bị thay thế không được in như còn hiệu lực");
  } finally {
    await cleanup(root);
  }
});

test("decision không bị ai thay thế thì vẫn in như cũ (chống hồi quy)", async () => {
  const root = await withDecisionYaml(`- id: DEC-001
  scope: P-thu
  statement: "Dùng Postgres, không dùng Mongo"
  decided_by: "@tien"
  decided_at: 2026-01-01T00:00:00Z
`);
  try {
    assert.match(await briefOf(root), /DEC-001/);
  } finally {
    await cleanup(root);
  }
});

test("chuỗi ba đời supersedes: chỉ decision mới nhất còn hiệu lực được in", async () => {
  const root = await withDecisionYaml(`- id: DEC-001
  scope: P-thu
  statement: "Đời 1: đồng bộ"
  decided_by: "@tien"
  decided_at: 2026-01-01T00:00:00Z
- id: DEC-002
  scope: P-thu
  statement: "Đời 2: bất đồng bộ qua callback"
  decided_by: "@tien"
  decided_at: 2026-02-01T00:00:00Z
  supersedes: ["DEC-001"]
- id: DEC-003
  scope: P-thu
  statement: "Đời 3: bất đồng bộ qua hàng đợi"
  decided_by: "@tien"
  decided_at: 2026-03-01T00:00:00Z
  supersedes: ["DEC-002"]
`);
  try {
    const brief = await briefOf(root);
    assert.match(brief, /DEC-003/, "đời mới nhất phải in");
    assert.doesNotMatch(brief, /DEC-002/, "đời giữa đã bị thay thế không được in");
    assert.doesNotMatch(brief, /DEC-001/, "đời đầu đã bị thay thế không được in");
  } finally {
    await cleanup(root);
  }
});

test("⭐ DEC ở phạm vi KHÁC supersede DEC ở phạm vi task: DEC cũ vẫn phải bị loại", async () => {
  // DEC-009 thuộc P-khac nên bản thân nó KHÔNG được in trong brief của task
  // (scope P-thu) — nhưng nó vẫn khai supersedes: [DEC-004], và DEC-004 chết
  // ở mức DỰ ÁN bất kể DEC-009 có lọt vào brief này hay không. Khoá đúng
  // quyết định "lấy tập chết từ toàn bộ graph.decisions", không chỉ từ những
  // decision sắp in.
  const root = await withDecisionYaml(`- id: DEC-004
  scope: P-thu
  statement: "Cách cũ: gọi trực tiếp REST"
  decided_by: "@tien"
  decided_at: 2026-01-01T00:00:00Z
- id: DEC-009
  scope: P-khac
  statement: "Cách mới, quyết ở phạm vi khác"
  decided_by: "@tien"
  decided_at: 2026-02-01T00:00:00Z
  supersedes: ["DEC-004"]
`);
  try {
    const brief = await briefOf(root);
    assert.doesNotMatch(brief, /DEC-009/, "decision phạm vi khác không tự lọt vào brief này");
    assert.doesNotMatch(
      brief,
      /DEC-004/,
      "decision đã bị thay thế thì chết ở mức dự án, dù ai thay thế nó thuộc phạm vi nào",
    );
  } finally {
    await cleanup(root);
  }
});

/* --- exit_contract: verification phải in độ tươi, không phải chuỗi trần --- */

/** Dựng dự án có một fact và một task với `exit_contract` trỏ tới fact đó. */
async function withVerificationExitContract(target: string): Promise<string> {
  return makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": `id: T-001
title: "Task thử"
serves:
  - G-001
implements: D-001
scope: P-thu
status: todo
exit_contract:
  - kind: verification
    target: ${target}
`,
    ".ganas/facts/f.yaml": `- id: F-ACC-001
  scope: P-thu
  statement: "hàng đợi retry tối đa 3 lần"
  depends_on: ["src/a/**"]
  verify:
    run: "test -d .ganas/scopes"
  last_verified_at: 2026-08-01T00:00:00Z
  last_result: pass
`,
  });
}

test("exit_contract verification trỏ target ĐÃ verify → brief in trạng thái độ tươi", async () => {
  const root = await withVerificationExitContract("F-ACC-001");
  try {
    await verifyAllFacts(root);
    const brief = await briefOf(root);
    const section = brief.slice(brief.indexOf("## Điều kiện hoàn thành"));
    assert.match(section, /F-ACC-001/);
    assert.match(section, /fresh — kiểm lần cuối/, "phải in đúng chuỗi mà freshness.decide() sinh ra");
  } finally {
    await cleanup(root);
  }
});

test("exit_contract verification trỏ target CHƯA từng verify → in trạng thái never_verified", async () => {
  const root = await withVerificationExitContract("F-ACC-001");
  try {
    // Không gọi verifyAllFacts: fact chưa có dòng sổ cái nào.
    const brief = await briefOf(root);
    const section = brief.slice(brief.indexOf("## Điều kiện hoàn thành"));
    assert.match(section, /F-ACC-001/);
    assert.match(
      section,
      /never_verified — chưa chạy lần nào — mới chỉ là niềm tin/,
      "phải đúng chuỗi never_verified mà decide() sinh ra, không bịa",
    );
  } finally {
    await cleanup(root);
  }
});

test("exit_contract verification trỏ target KHÔNG tồn tại trong sổ cái → không ném, in như cũ", async () => {
  const root = await withVerificationExitContract("F-KHONG-TON-TAI");
  try {
    const brief = await briefOf(root);
    const section = brief.slice(brief.indexOf("## Điều kiện hoàn thành"));
    assert.match(section, /bằng chứng `F-KHONG-TON-TAI`/, "in nguyên như cũ khi không tra được");
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

/* --- Brief không được chỉ vào chỗ không có thật -------------------------- */

/**
 * `ganas adopt` từng được in vào brief MỌI phiên (`Xem toàn bộ:
 * ganas adopt --audit`) trong khi lệnh đó chưa bao giờ tồn tại trong `cli.ts`.
 * Agent làm theo hướng dẫn của chính công cụ sẽ nhận "không có lệnh".
 *
 * Hai test dưới khoá cả hai dạng của cùng một lỗi: trỏ vào LỆNH không có, và
 * trỏ vào CHỖ không chứa thứ đang nói tới.
 */
async function withLegacyClaim(dir: string): Promise<string> {
  return makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    [`.ganas/${dir}/cu.yaml`]: `- id: LC-001
  scope: P-thu
  statement: "Tài liệu cũ nói vậy"
  anchors: ["CLAUDE.md#L12"]
  provenance: imported
`,
  });
}

test("⭐ brief chỉ nhắc lệnh ganas CÓ THẬT trong cli.ts", async () => {
  const root = await withLegacyClaim("claims");
  try {
    const brief = await briefOf(root);
    const { readFile } = await import("node:fs/promises");
    const cli = await readFile(new URL("../src/cli.ts", import.meta.url), "utf8");
    const known = [...cli.matchAll(/^\s*([a-z-]+):\s*\(\)\s*=>\s*import\(/gm)].map((m) => m[1]!);

    for (const [, name] of brief.matchAll(/`ganas ([a-z-]+)/g)) {
      assert.ok(
        known.includes(name!),
        `brief nhắc \`ganas ${name}\` nhưng cli.ts không có lệnh đó — ` +
          `công cụ chống ảo giác không được tự sinh ảo giác về chính nó`,
      );
    }
  } finally {
    await cleanup(root);
  }
});

test("⭐ brief trỏ đúng chỗ chứa tri thức kế thừa, dù nó nằm ở thư mục nào", async () => {
  // Claim `imported` nạp từ CẢ `claims/` lẫn `legacy/imported/`, và không luật
  // nào ép nó nằm ở đâu — nên nêu một chỗ là chỉ sai chỗ cho một nửa trường hợp.
  for (const dir of ["claims", "legacy/imported"]) {
    const root = await withLegacyClaim(dir);
    try {
      const brief = await briefOf(root);
      assert.match(brief, /phát biểu kế thừa khác/, `phải đếm được claim ở ${dir}`);
      assert.match(brief, /`\.ganas\/claims\/`/);
      assert.match(brief, /`\.ganas\/legacy\/imported\/`/);
    } finally {
      await cleanup(root);
    }
  }
});

/* --- notes của phạm vi ------------------------------------------------------ */

test("⭐ brief in `notes` của phạm vi — bối cảnh là chỗ đáng ghi nhất", async () => {
  const NOTES = "Trong: đăng nhập partner. Ngoài: SSO nội bộ. Đã hỏi @tienhm 2026-08-01.";
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/scopes/P-thu.yaml": scope("P-thu", {
      extra: `notes: ${JSON.stringify(NOTES)}\n`,
    }),
  });
  try {
    const graph = await loadGraph(root);
    // Trước đây `notes` là lỗi schema cứng, nên bối cảnh phạm vi phải nhét vào
    // comment YAML — mà comment thì brief không đọc được.
    assert.deepEqual(
      graph.loadDiagnostics.filter((d) => d.severity === "error"),
      [],
    );
    const picked = selectNextTask(graph)!;
    const brief = renderBrief({ graph, task: picked.task, freshness: await computeFreshness(graph) });
    assert.ok(brief.includes(NOTES), "brief phải in notes của phạm vi");
  } finally {
    await cleanup(root);
  }
});

/* --- Design: status superseded/archived phải cảnh báo -------------------- */

/** Dựng dự án với D-001 mang `status` tuỳ ý, kèm design phụ tuỳ chọn. */
async function withDesignStatus(
  status: string,
  extraDesigns: Record<string, string> = {},
): Promise<string> {
  return makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design().replace("status: active", `status: ${status}`),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ...extraDesigns,
  });
}

test("⭐ design đang hiện thực đã bị supersede → brief cảnh báo rõ ràng", async () => {
  const root = await withDesignStatus("superseded");
  try {
    const brief = await briefOf(root);
    const section = brief.slice(brief.indexOf("## Design đang hiện thực"));
    assert.match(section, /đã bị thay thế/, "phải nói rõ design đã bị thay thế");
    assert.match(
      section,
      /hiện thực một hướng đã bị bỏ/,
      "phải nói VÌ SAO đáng lo, không chỉ nêu trạng thái",
    );
  } finally {
    await cleanup(root);
  }
});

test("design đang hiện thực còn active → KHÔNG có cảnh báo (chống báo nhầm)", async () => {
  const root = await withDesignStatus("active");
  try {
    const brief = await briefOf(root);
    assert.doesNotMatch(brief, /đã bị thay thế/);
    assert.doesNotMatch(brief, /đã lưu kho/);
  } finally {
    await cleanup(root);
  }
});

test("design bị thay thế bởi design khác → cảnh báo nêu đúng tên design mới", async () => {
  const root = await withDesignStatus("superseded", {
    ".ganas/designs/D-009.yaml": design("D-009", ["G-001"], "supersedes:\n  - D-001\n"),
  });
  try {
    const brief = await briefOf(root);
    assert.match(brief, /thay bởi `D-009`/, "phải tra ngược và nêu tên design đã thay thế");
  } finally {
    await cleanup(root);
  }
});

test("design superseded mà không design nào khai thay thế → vẫn cảnh báo, không ném, không bịa tên", async () => {
  const root = await withDesignStatus("superseded");
  try {
    const brief = await briefOf(root);
    assert.match(brief, /đã bị thay thế/, "vẫn phải cảnh báo dù không tra được ai thay thế");
    assert.doesNotMatch(brief, /thay bởi `/, "không được bịa tên design thay thế khi không tra được");
  } finally {
    await cleanup(root);
  }
});

/* --- Gợi ý fact liên quan (BM25, `src/search.ts`) ------------------------- */

/**
 * Statement giàu từ khoá trùng với title task bên dưới ("Sửa lỗi webhook
 * Zalo timeout") — khớp đủ ≥2 từ ("webhook", "zalo", "timeout") để vượt
 * `DEFAULT_MIN_MATCHED_TERMS` của `searchFacts`.
 */
const SUGGEST_STATEMENT = "Webhook Zalo OA bị timeout khi gọi API gửi tin nhắn xác nhận.";
const UNRELATED_STATEMENT = "Không liên quan gì hết, chủ đề hoàn toàn khác.";

function suggestFactYaml(id: string, opts: { scope?: string; statement?: string } = {}): string {
  return `- id: ${id}
  scope: ${opts.scope ?? "P-thu"}
  statement: "${opts.statement ?? SUGGEST_STATEMENT}"
  verify:
    run: "true"
`;
}

/** Task với title khớp `SUGGEST_STATEMENT`, `context_contract.facts` tuỳ chọn. */
function taskYamlForSuggestion(declaredFacts: string[] = []): string {
  const facts = declaredFacts.length
    ? `\n${declaredFacts.map((f) => `    - ${f}`).join("\n")}`
    : " []";
  return `id: T-001
title: "Sửa lỗi webhook Zalo timeout"
serves:
  - G-001
implements: D-001
scope: P-thu
status: todo
exit_contract:
  - kind: command
    run: "true"
context_contract:
  facts:${facts}
  must_read: []
  open_questions: []
`;
}

async function withSuggestionFacts(
  factsYaml: string,
  declaredFacts: string[] = [],
): Promise<string> {
  return makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": taskYamlForSuggestion(declaredFacts),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/scopes/P-khac.yaml": scope("P-khac", { modules: ["M-b"] }),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", { scope: "P-khac", paths: ["src/b/**"] }),
    ".ganas/facts/f.yaml": factsYaml,
  });
}

test("⭐ fact cùng scope, liên quan, KHÔNG khai tay → xuất hiện trong mục gợi ý", async () => {
  const root = await withSuggestionFacts(suggestFactYaml("F-SUG-001"));
  try {
    const brief = await briefOf(root);
    assert.match(brief, /## Có thể liên quan/, "phải có mục gợi ý");
    const section = brief.slice(brief.indexOf("## Có thể liên quan"));
    assert.match(section, /F-SUG-001/, "phải nêu đúng id fact liên quan");
  } finally {
    await cleanup(root);
  }
});

test("fact ĐÃ khai tay trong context_contract.facts → KHÔNG lặp lại trong mục gợi ý", async () => {
  const root = await withSuggestionFacts(
    [suggestFactYaml("F-KNOWN-001"), suggestFactYaml("F-SUG-002")].join("\n"),
    ["F-KNOWN-001"],
  );
  try {
    const brief = await briefOf(root);
    const section = brief.slice(brief.indexOf("## Có thể liên quan"));
    assert.match(section, /F-SUG-002/, "fact chưa khai tay phải xuất hiện");
    assert.doesNotMatch(
      section,
      /F-KNOWN-001/,
      "fact đã khai tay đã in ở mục khác, không được lặp lại ở đây",
    );
  } finally {
    await cleanup(root);
  }
});

test("fact cùng nội dung nhưng KHÁC scope task → không được gợi ý", async () => {
  const root = await withSuggestionFacts(suggestFactYaml("F-SUG-001", { scope: "P-khac" }));
  try {
    const brief = await briefOf(root);
    assert.ok(
      !brief.includes("## Có thể liên quan"),
      "fact ngoài phạm vi task không được gợi ý ở đây — ganas search mới là chỗ tra rộng",
    );
  } finally {
    await cleanup(root);
  }
});

test("không fact nào vượt ngưỡng khớp → brief KHÔNG in tiêu đề mục gợi ý", async () => {
  const root = await withSuggestionFacts(
    suggestFactYaml("F-UNRELATED-001", { statement: UNRELATED_STATEMENT }),
  );
  try {
    const brief = await briefOf(root);
    assert.ok(
      !brief.includes("## Có thể liên quan"),
      "không có gì liên quan thì mục phải biến mất hoàn toàn, không in tiêu đề rỗng",
    );
  } finally {
    await cleanup(root);
  }
});

test("fact được gợi ý mà chưa verify bao giờ → dòng của nó mang nhãn cảnh báo, không in như tri thức tin được", async () => {
  const root = await withSuggestionFacts(suggestFactYaml("F-SUG-001"));
  try {
    const brief = await briefOf(root);
    const section = brief.slice(brief.indexOf("## Có thể liên quan"));
    const line = section.split("\n").find((l) => l.includes("F-SUG-001"));
    assert.ok(line, `không thấy dòng của F-SUG-001 trong:\n${section}`);
    assert.match(
      line,
      /^- ⚠ \[NEVER_VERIFIED\]/,
      `nhãn cảnh báo phải đứng đầu dòng (ngay sau dấu gạch bullet), thực tế: "${line}"`,
    );
  } finally {
    await cleanup(root);
  }
});

test("nhiều hơn 3 fact khớp → chỉ in 3, có ghi chú phần còn lại và gợi ý `ganas search`", async () => {
  const factsYaml = ["001", "002", "003", "004"]
    .map((n) => suggestFactYaml(`F-SUG-${n}`))
    .join("\n");
  const root = await withSuggestionFacts(factsYaml);
  try {
    const brief = await briefOf(root);
    const section = brief.slice(
      brief.indexOf("## Có thể liên quan"),
      brief.indexOf("## Có thể liên quan") +
        brief.slice(brief.indexOf("## Có thể liên quan")).indexOf("\n## ", 3),
    );
    // Tie-break tăng dần theo factId (cùng statement ⇒ cùng điểm BM25) ⇒ ba
    // id đầu bảng chữ cái được in, id thứ tư bị cắt.
    assert.match(section, /F-SUG-001/);
    assert.match(section, /F-SUG-002/);
    assert.match(section, /F-SUG-003/);
    assert.doesNotMatch(section, /F-SUG-004/, "chỉ in tối đa 3, không được in cả 4");
    assert.match(section, /còn 1 fact khác khớp/, "phải nói rõ còn bao nhiêu bị cắt");
    assert.match(section, /ganas search --task T-001/, "phải gợi ý lệnh tra rộng hơn");
  } finally {
    await cleanup(root);
  }
});

/* --- Icebox quá hạn xem lại ------------------------------------------------ */

/** `found_at` dùng chung cho các test dưới đây — `review_after_days` mặc định
 * 30 ⇒ hạn xem lại rơi vào 2026-01-31T00:00:00Z. */
const ICE_FOUND_AT = "2026-01-01T00:00:00Z";

/** Mốc `now` giả lập: 30 ngày SAU hạn xem lại mặc định (2026-01-31 + 30). */
const NOW_OVERDUE = Date.parse("2026-03-02T00:00:00Z");

/** Mốc `now` giả lập: TRƯỚC hạn xem lại mặc định (2026-01-31). */
const NOW_NOT_YET = Date.parse("2026-01-15T00:00:00Z");

/** Bản ghi icebox tối thiểu hợp lệ, các trường bắt buộc theo status khai đủ. */
function iceboxYaml(
  id: string,
  opts: { status?: "open" | "closed" | "promoted"; scope?: string; reviewAfterDays?: number } = {},
): string {
  const status = opts.status ?? "open";
  const scope = opts.scope ?? "P-thu";
  const extra =
    status === "open"
      ? ""
      : status === "closed"
        ? `\n  closed_at: 2026-02-01T00:00:00Z\n  closed_reason: "không còn cần"`
        : `\n  closed_at: 2026-02-01T00:00:00Z\n  promoted_to: T-001`;
  return `- id: ${id}
  title: "Việc đã hoãn ${id}"
  found_at: ${ICE_FOUND_AT}
  review_after_days: ${opts.reviewAfterDays ?? 30}
  weight: 3
  ease: 2
  why_deferred: "chưa ai rảnh, không chặn mục tiêu hiện tại"
  anchors: ["src/a.ts#L1"]
  scope: ${scope}
  status: ${status}${extra}
`;
}

/** Dự án hai phạm vi (P-thu/P-khac) + task T-001 ở P-thu + một block icebox. */
async function withIcebox(iceboxYamlBlock: string): Promise<string> {
  return makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/scopes/P-khac.yaml": scope("P-khac", { modules: ["M-b"] }),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", { scope: "P-khac", paths: ["src/b/**"] }),
    ".ganas/icebox/2026-01.yaml": iceboxYamlBlock,
  });
}

/** `renderBrief` với `now` ghim — brief KHÔNG được phụ thuộc đồng hồ thật. */
async function briefOfAt(root: string, now: number, taskId = "T-001"): Promise<string> {
  const graph = await loadGraph(root);
  const freshness = await computeFreshness(graph);
  return renderBrief({ graph, task: graph.tasks.get(taskId)!, freshness, now });
}

test("⭐ icebox open, quá hạn, cùng scope task → brief có mục, nêu đúng id/ngày quá hạn/tổng điểm", async () => {
  const root = await withIcebox(iceboxYaml("ICE-001"));
  try {
    const brief = await briefOfAt(root, NOW_OVERDUE);
    assert.match(brief, /## Icebox quá hạn xem lại/);
    const section = brief.slice(brief.indexOf("## Icebox quá hạn xem lại"));
    assert.match(section, /ICE-001/, "phải nêu đúng id");
    assert.match(section, /quá hạn xem lại 30 ngày/, "phải nêu đúng số ngày quá hạn");
    assert.match(section, /tổng điểm 5/, "phải nêu tổng điểm weight+ease");
  } finally {
    await cleanup(root);
  }
});

test("icebox open nhưng CHƯA quá hạn → không hiện", async () => {
  const root = await withIcebox(iceboxYaml("ICE-001"));
  try {
    const brief = await briefOfAt(root, NOW_NOT_YET);
    assert.ok(!brief.includes("## Icebox quá hạn xem lại"), "chưa tới hạn thì mục không được hiện");
  } finally {
    await cleanup(root);
  }
});

test("icebox quá hạn nhưng KHÁC scope task → không hiện", async () => {
  const root = await withIcebox(iceboxYaml("ICE-001", { scope: "P-khac" }));
  try {
    const brief = await briefOfAt(root, NOW_OVERDUE);
    assert.ok(!brief.includes("## Icebox quá hạn xem lại"), "khác scope thì không được lọt vào brief");
  } finally {
    await cleanup(root);
  }
});

test("icebox quá hạn nhưng status closed/promoted → không hiện", async () => {
  for (const status of ["closed", "promoted"] as const) {
    const root = await withIcebox(iceboxYaml("ICE-001", { status }));
    try {
      const brief = await briefOfAt(root, NOW_OVERDUE);
      assert.ok(
        !brief.includes("## Icebox quá hạn xem lại"),
        `status="${status}" không còn là nợ đang mở, không được hiện`,
      );
    } finally {
      await cleanup(root);
    }
  }
});

test("không mục icebox nào thoả điều kiện → brief KHÔNG có tiêu đề mục (không tiêu đề rỗng)", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  try {
    const brief = await briefOfAt(root, NOW_OVERDUE);
    assert.ok(!brief.includes("## Icebox quá hạn xem lại"));
  } finally {
    await cleanup(root);
  }
});

test("nhiều hơn 3 mục icebox quá hạn cùng scope → chỉ in 3, có dòng đếm phần còn lại kèm gợi ý lệnh", async () => {
  const block = ["001", "002", "003", "004"].map((n) => iceboxYaml(`ICE-${n}`)).join("\n");
  const root = await withIcebox(block);
  try {
    const brief = await briefOfAt(root, NOW_OVERDUE);
    const start = brief.indexOf("## Icebox quá hạn xem lại");
    const section = brief.slice(start, start + brief.slice(start).indexOf("\n## ", 3));
    // Tie-break tăng dần theo id (cùng found_at/review_after_days ⇒ cùng số
    // ngày quá hạn) ⇒ ba id đầu bảng chữ cái được in, id thứ tư bị cắt.
    assert.match(section, /ICE-001/);
    assert.match(section, /ICE-002/);
    assert.match(section, /ICE-003/);
    assert.doesNotMatch(section, /ICE-004/, "chỉ in tối đa 3, không được in cả 4");
    assert.match(section, /còn 1 mục icebox quá hạn khác/, "phải nói rõ còn bao nhiêu bị cắt");
    assert.match(section, /ganas icebox review/, "phải trỏ sang lệnh để xem hết");
  } finally {
    await cleanup(root);
  }
});

test("mục icebox nằm TRƯỚC phần volatile trong chuỗi kết quả", async () => {
  const root = await withIcebox(iceboxYaml("ICE-001"));
  try {
    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const brief = renderBrief({
      graph,
      task: graph.tasks.get("T-001")!,
      freshness,
      now: NOW_OVERDUE,
      volatile: "MOC-THOI-GIAN",
    });
    assert.ok(
      brief.indexOf("## Icebox quá hạn xem lại") < brief.indexOf("MOC-THOI-GIAN"),
      "mục icebox thuộc phần ổn định, phải đứng trước phần volatile (đặt sau sẽ phá prompt cache)",
    );
  } finally {
    await cleanup(root);
  }
});

test("phạm vi không có notes thì brief không đổi", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/scopes/P-thu.yaml": scope(),
  });
  try {
    const graph = await loadGraph(root);
    const picked = selectNextTask(graph)!;
    const brief = renderBrief({ graph, task: picked.task, freshness: await computeFreshness(graph) });
    assert.match(brief, /nghiệm thu: @nguoi-duyet\n\n\*\*Ranh giới code:\*\*/);
  } finally {
    await cleanup(root);
  }
});
