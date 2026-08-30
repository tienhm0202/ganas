import assert from "node:assert/strict";
import { test } from "node:test";

import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import { renderBrief } from "../src/render/brief.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

/**
 * T-074: mục "Giao việc" mở rộng thành bản giao việc đầy đủ — `agent`
 * (qua `agentDispatchLines()`, không tự dựng chữ lần hai), `consumes` (bơm
 * đúng `shape` cần, không bơm cả design), và `produces` + bước kế suy được.
 */

async function briefOf(root: string, taskId = "T-001"): Promise<string> {
  const graph = await loadGraph(root);
  const freshness = await computeFreshness(graph);
  return renderBrief({ graph, task: graph.tasks.get(taskId)!, freshness });
}

/* --- agent: đầy đủ trường ⇒ brief chứa nguyên bản giao việc --------------- */

const AGENT_YAML = `agent:
  persona: "người sửa schema Task"
  objective: "thêm consumes/produces vào brief"
  steps:
    - "đọc agentDispatchLines"
    - "gọi nó từ brief"
  self_check:
    - "chạy npx tsc --noEmit"
  guardrails:
    - "không tự dựng lại các dòng của agentDispatchLines"
  tools:
    - "Read"
    - "Edit"
`;

test("⭐ agent đầy đủ ⇒ brief chứa persona, objective, các bước, guardrail, self-check", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task("T-001", { extra: AGENT_YAML }),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  try {
    const brief = await briefOf(root);
    assert.match(brief, /## Giao việc/);
    assert.match(brief, /người sửa schema Task/, "persona phải in ra");
    assert.match(brief, /thêm consumes\/produces vào brief/, "objective phải in ra");
    assert.match(brief, /đọc agentDispatchLines/, "bước 1 phải in ra");
    assert.match(brief, /gọi nó từ brief/, "bước 2 phải in ra");
    assert.match(brief, /không tự dựng lại các dòng của agentDispatchLines/, "guardrail phải in ra");
    assert.match(brief, /chạy npx tsc --noEmit/, "self-check phải in ra");
    assert.match(brief, /Read, Edit/, "tools phải in ra");
  } finally {
    await cleanup(root);
  }
});

/* --- agent vắng mặt: không khung rỗng ------------------------------------- */

test("⭐ không có agent ⇒ mục Giao việc không có khung rỗng nào", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  try {
    const brief = await briefOf(root);
    assert.match(brief, /## Giao việc/, "mục Giao việc vẫn phải có (dựng từ model/harness)");
    assert.doesNotMatch(
      brief,
      /Bản giao việc chi tiết/,
      "không có task.agent thì không được in tiêu đề khối agent",
    );
    assert.doesNotMatch(brief, /^Vai:/m, "không được in dòng 'Vai:' khi agent vắng mặt");
    assert.doesNotMatch(brief, /Xong nghĩa là:/, "không được in dòng objective khi agent vắng mặt");
  } finally {
    await cleanup(root);
  }
});

/* --- consumes: bơm ĐÚNG shape cần, không bơm cả design -------------------- */

/** Design có hai bản vẽ code, để kiểm "chỉ bơm đúng bản vẽ trong consumes". */
function designWithTwoArtifacts(): string {
  return design(
    "D-001",
    ["G-001"],
    `artifacts:
  - id: A-one
    kind: function
    module: M-a
    shape: "(x: number) => number"
    probe:
      run: "test -d .ganas/scopes"
      expect: exit_zero
  - id: A-two
    kind: function
    module: M-a
    shape: "(y: string) => boolean"
    probe:
      run: "test -d .ganas/scopes"
      expect: exit_zero
`,
  );
}

test("⭐ consumes ⇒ brief chứa shape của ĐÚNG bản vẽ đó, KHÔNG chứa shape bản vẽ khác cùng design", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designWithTwoArtifacts(),
    ".ganas/tasks/T-001.yaml": task("T-001", { extra: "consumes:\n  - D-001/A-one\n" }),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  try {
    const brief = await briefOf(root);
    assert.match(brief, /D-001\/A-one/);
    assert.match(brief, /\(x: number\) => number/, "phải bơm đúng shape của bản vẽ được consume");
    assert.doesNotMatch(
      brief,
      /\(y: string\) => boolean/,
      "KHÔNG được bơm shape của bản vẽ khác cùng design — chỉ khai trong consumes mới được bơm",
    );
    assert.doesNotMatch(brief, /D-001\/A-two/, "artifact không được consume thì không được nêu tên");
  } finally {
    await cleanup(root);
  }
});

test("consumes trỏ bản vẽ không tồn tại ⇒ brief nói rõ, không im lặng bỏ qua", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designWithTwoArtifacts(),
    ".ganas/tasks/T-001.yaml": task("T-001", { extra: "consumes:\n  - D-001/A-khong-co\n" }),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  try {
    const brief = await briefOf(root);
    assert.match(brief, /D-001\/A-khong-co/);
    assert.match(brief, /KHÔNG TÌM THẤY/, "bản vẽ không tra được thì phải nói thẳng");
  } finally {
    await cleanup(root);
  }
});

/* --- tools: khuyến nghị, không cưỡng chế được ------------------------------ */

test("⭐ tools ⇒ brief nói rõ là khuyến nghị, không cưỡng chế được", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task("T-001", {
      extra: `agent:\n  tools:\n    - "Bash"\n    - "Read"\n`,
    }),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  try {
    const brief = await briefOf(root);
    assert.match(brief, /Bash, Read/);
    assert.match(brief, /khuyến nghị/, "phải tự khai là khuyến nghị");
    assert.match(brief, /không chặn được/, "phải tự khai là không cưỡng chế được");
  } finally {
    await cleanup(root);
  }
});

/* --- produces + bước kế suy được ------------------------------------------ */

/** Design mà T-001 produces một bản vẽ, T-002 consumes đúng bản vẽ đó. */
function designForHandoff(): string {
  return design(
    "D-001",
    ["G-001"],
    `artifacts:
  - id: A-shape
    kind: function
    module: M-a
    shape: "(id: string) => void"
    probe:
      run: "test -d .ganas/scopes"
      expect: exit_zero
`,
  );
}

/**
 * Nối tiếp `exit_contract` mặc định của `task()` (một item `kind: command`)
 * bằng một item `kind: verification` — đúng khuôn `task-agent.test.ts` đã
 * dùng để khai `produces` hợp lệ (spine đòi verification tương ứng).
 */
function producesExtra(ref: string): string {
  return `  - kind: verification\n    target: ${ref}\nproduces:\n  - ${ref}\n`;
}

test("⭐ produces in ra, và task khác consumes nó được nêu là bước kế", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designForHandoff(),
    ".ganas/tasks/T-001.yaml": task("T-001", { extra: producesExtra("D-001/A-shape") }),
    ".ganas/tasks/T-002.yaml": task("T-002", { extra: "consumes:\n  - D-001/A-shape\n" }),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  try {
    const brief = await briefOf(root, "T-001");
    assert.match(brief, /D-001\/A-shape/, "produces phải in ra");
    assert.match(brief, /Bước kế/, "phải suy ra mục bước kế");
    assert.match(brief, /T-002/, "task consumes bản vẽ này phải được nêu");
  } finally {
    await cleanup(root);
  }
});

test("produces mà KHÔNG task nào consumes nó ⇒ in produces, KHÔNG bịa bước kế", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designForHandoff(),
    ".ganas/tasks/T-001.yaml": task("T-001", { extra: producesExtra("D-001/A-shape") }),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  try {
    const brief = await briefOf(root, "T-001");
    assert.match(brief, /D-001\/A-shape/, "produces phải in ra");
    assert.doesNotMatch(brief, /Bước kế/, "không có task nào consumes thì không được bịa bước kế");
  } finally {
    await cleanup(root);
  }
});
