import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import { agentDispatchLines, zTask } from "../src/model/index.js";
import { artifactTargets, runTarget, scopeOfTarget } from "../src/verify/run.js";
import { check, cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

/**
 * Bản giao việc ở tầng dữ liệu: `consumes`/`produces` (hợp đồng vào-ra của một
 * bước), khối `agent`, và bản vẽ `kind: doc`.
 *
 * Vế bị kiểm gắt nhất ở đây là ADOPT: 56 task đã có không khai trường nào trong
 * ba trường mới, và luật mới mọc lỗi trên chúng là hỏng — không phải "cần dọn".
 */

const PROBE = `    probe:
      run: "grep -q lastLogin src/a/x.ts"
      expect: exit_zero`;

/** Design có đúng một bản vẽ code, để task trỏ `produces` vào. */
function designWithArtifact(status = "active"): string {
  return `id: D-001
title: "Design thử"
serves:
  - G-001
summary: "Cách tiếp cận"
status: ${status}
artifacts:
  - id: A-last-login
    kind: function
    module: M-a
    shape: "(userId: string) => Date | null"
${PROBE}`;
}

/* --- Vế adopt: không khai gì thì không đổi gì ----------------------------- */

test("task không khai gì: consumes/produces mặc định rỗng, agent vắng mặt", () => {
  const t = zTask.parse({
    id: "T-001",
    title: "Task thử",
    serves: ["G-001"],
    implements: "D-001",
    scope: "P-thu",
    exit_contract: [{ kind: "command", run: "true", expect: "exit_zero" }],
  });
  assert.deepEqual(t.consumes, []);
  assert.deepEqual(t.produces, []);
  // `undefined`, KHÔNG phải một object rỗng: khai `agent` cho đủ lệ là đưa văn
  // xuôi chết vào đường nóng của loadGraph.
  assert.equal(t.agent, undefined);
});

test("địa chỉ bản vẽ sai khuôn ⇒ lỗi PARSE, không phải cảnh báo đọc sau", () => {
  const base = {
    id: "T-001",
    title: "Task thử",
    serves: ["G-001"],
    implements: "D-001",
    scope: "P-thu",
    exit_contract: [{ kind: "command", run: "true", expect: "exit_zero" }],
  };
  for (const bad of ["A-last-login", "D-010", "D-010/V-smoke", "M-a/A-x"]) {
    assert.equal(
      zTask.safeParse({ ...base, produces: [bad] }).success,
      false,
      `"${bad}" đáng lẽ không phải địa chỉ bản vẽ hợp lệ`,
    );
  }
  assert.equal(zTask.safeParse({ ...base, produces: ["D-010/A-last-login"] }).success, true);
});

/* --- Luật: produces/consumes phải trỏ vào bản vẽ CÓ THẬT ------------------ */

test("produces trỏ bản vẽ không tồn tại ⇒ error", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designWithArtifact(),
    ".ganas/tasks/T-001.yaml": task("T-001", {
      extra: `produces:\n  - D-001/A-khong-co\n`,
    }),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  assert.ok(codes.includes("spine/task-produces-unknown-artifact"));
});

test("consumes trỏ bản vẽ không tồn tại ⇒ cùng error đó (một phép giải địa chỉ, không hai)", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designWithArtifact(),
    ".ganas/tasks/T-001.yaml": task("T-001", {
      extra: `consumes:\n  - D-002/A-x\n`,
    }),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  assert.ok(codes.includes("spine/task-produces-unknown-artifact"));
});

/* --- Luật: produces phải để lại bằng chứng cho chính bản vẽ đó ------------ */

test("produces mà exit_contract thiếu tiêu chí verification tương ứng ⇒ warning", async () => {
  const { codes, diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designWithArtifact(),
    ".ganas/tasks/T-001.yaml": task("T-001", {
      extra: `produces:\n  - D-001/A-last-login\n`,
    }),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  assert.ok(codes.includes("spine/task-produces-without-verification"));
  assert.equal(
    diagnostics.find((d) => d.code === "spine/task-produces-without-verification")?.severity,
    "warning",
  );
});

test("produces kèm đúng tiêu chí verification ⇒ hết cảnh báo, và bản vẽ có người dựng", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designWithArtifact(),
    ".ganas/tasks/T-001.yaml": task("T-001", {
      extra: `  - kind: verification
    target: "D-001/A-last-login"
produces:
  - D-001/A-last-login
`,
    }),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  assert.ok(!codes.includes("spine/task-produces-without-verification"));
  assert.ok(!codes.includes("spine/artifact-unproduced"));
  assert.ok(!codes.includes("spine/task-produces-unknown-artifact"));
});

/* --- Luật: bản vẽ không ai nhận dựng -------------------------------------- */

test("bản vẽ mà không task nào produces ⇒ warning", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designWithArtifact(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  assert.ok(codes.includes("spine/artifact-unproduced"));
});

test("chặng đã đóng thì bản vẽ mồ côi KHÔNG còn báo — cảnh báo không ai làm gì được là tiếng ồn", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designWithArtifact("done") + "\ndone_at: 2026-01-01T00:00:00Z\n",
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  assert.ok(!codes.includes("spine/artifact-unproduced"));
});

/* --- Khối agent ----------------------------------------------------------- */

test("agentDispatchLines: đọc cả sáu trường, và tự khai `tools` không cưỡng chế được", () => {
  const t = zTask.parse({
    id: "T-001",
    title: "Task thử",
    serves: ["G-001"],
    implements: "D-001",
    scope: "P-thu",
    exit_contract: [{ kind: "command", run: "true", expect: "exit_zero" }],
    agent: {
      persona: "người sửa schema",
      objective: "thêm hai trường vào Task",
      steps: ["sửa zTask", "viết test"],
      self_check: ["chạy npm test"],
      guardrails: ["không đụng src/render"],
      tools: ["Read", "Edit"],
    },
  });
  const lines = agentDispatchLines(t.agent!);
  const joined = lines.join("\n");
  for (const needle of [
    "người sửa schema",
    "thêm hai trường vào Task",
    "sửa zTask",
    "viết test",
    "chạy npm test",
    "không đụng src/render",
    "Read, Edit",
  ]) {
    assert.ok(joined.includes(needle), `bản giao việc thiếu "${needle}":\n${joined}`);
  }
  // ganas không nhận allowlist công cụ từ đâu cả, nên dòng in ra phải nói thẳng.
  assert.ok(/không chặn được/.test(joined));
});

test("agent khai mà rỗng ruột ⇒ spine/agent-empty", async () => {
  const { codes, diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task("T-001", { extra: `agent:\n  steps: []\n` }),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  assert.ok(codes.includes("spine/agent-empty"));
  assert.equal(diagnostics.find((d) => d.code === "spine/agent-empty")?.severity, "warning");
});

test("agent có nội dung ⇒ không báo gì; task không khai agent cũng không báo", async () => {
  const withAgent = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task("T-001", {
      extra: `agent:\n  objective: "xong là zTask có thêm hai trường"\n`,
    }),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  assert.ok(!withAgent.codes.includes("spine/agent-empty"));

  const without = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  assert.ok(!without.codes.includes("spine/agent-empty"));
});

/* --- Bản vẽ kind: doc ----------------------------------------------------- */

const DOC_TEXT = "# Khái niệm\n\nMột dòng tài liệu.\n";

function designWithDoc(path = "docs/CONCEPTS.md"): string {
  return `id: D-001
title: "Design thử"
serves:
  - G-001
summary: "Cách tiếp cận"
status: active
artifacts:
  - id: A-concepts
    kind: doc
    path: "${path}"
    shape: "mục 'Bản vẽ' giải thích kind: doc"
    probe:
      run: "grep -q 'Khái niệm' ${path}"
      expect: exit_zero`;
}

async function docProject(path = "docs/CONCEPTS.md"): Promise<string> {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designWithDoc(path),
    ".ganas/tasks/T-001.yaml": task("T-001", {
      extra: `  - kind: verification
    target: "D-001/A-concepts"
produces:
  - D-001/A-concepts
`,
    }),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  const file = join(root, path);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, DOC_TEXT, "utf8");
  return root;
}

test("bản vẽ kind: doc có path ⇒ hợp lệ, và artifactTargets lấy context là [path]", async () => {
  const root = await docProject();
  try {
    const graph = await loadGraph(root);
    assert.deepEqual(
      graph.loadDiagnostics.map((d) => d.code),
      [],
    );
    const target = artifactTargets(graph.designs.get("D-001")!, graph)[0]!;
    // Context sai thì `globsOf()` trả rỗng và bản vẽ XANH VĨNH VIỄN — đúng cái
    // bẫy mà docstring `scopeTargets()` đã trả giá một lần.
    assert.deepEqual(target.context, ["docs/CONCEPTS.md"]);
    assert.equal(
      (target.definition as { run: string }).run,
      "grep -q 'Khái niệm' docs/CONCEPTS.md",
    );
    // `module` vắng mặt nên không suy được phạm vi — "không xác định được",
    // không phải một phạm vi đoán bừa.
    assert.equal(scopeOfTarget(target, graph), undefined);
  } finally {
    await cleanup(root);
  }
});

test("bản vẽ doc: sửa FILE TÀI LIỆU ⇒ stale (bằng chứng context [path] thật sự có tác dụng)", async () => {
  const root = await docProject();
  try {
    const before = await loadGraph(root);
    const target = artifactTargets(before.designs.get("D-001")!, before)[0]!;
    assert.equal((await runTarget(target, { root, by: "test" })).result, "pass");

    const fresh = await computeFreshness(await loadGraph(root));
    assert.equal(fresh.get("D-001/A-concepts")!.freshness, "fresh");

    await writeFile(join(root, "docs/CONCEPTS.md"), `${DOC_TEXT}\nthêm một dòng\n`, "utf8");
    const after = await computeFreshness(await loadGraph(root));
    assert.equal(after.get("D-001/A-concepts")!.freshness, "stale");
  } finally {
    await cleanup(root);
  }
});

test("path là tên file TRẦN ⇒ lỗi PARSE, không để lại bản vẽ xanh vĩnh viễn", async () => {
  // `globsOf()` (`src/graph/freshness.ts`) chỉ giữ context có `*` hoặc `/` — nó
  // sinh ra để loại `entrypoints` (tên symbol). Một `path` trần rơi đúng bộ lọc
  // đó, nên nếu cho ghi thì bản vẽ sẽ KHÔNG BAO GIỜ stale. Chặn ở tầng schema
  // để lỗi nổi lên lúc ghi, không phải sáu tháng sau.
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designWithDoc("CONCEPTS.md"),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  assert.ok(
    codes.some((c) => c.startsWith("schema/")),
    `phải là lỗi parse, nhận được: ${JSON.stringify(codes)}`,
  );
});

test("kind: doc mà khai module ⇒ lỗi PARSE", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": `id: D-001
title: "Design thử"
serves:
  - G-001
summary: "Cách tiếp cận"
status: active
artifacts:
  - id: A-concepts
    kind: doc
    path: "docs/CONCEPTS.md"
    module: M-a
    shape: "một mục tài liệu"
`,
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  assert.ok(codes.includes("schema/custom"));
});

test("kind mô tả CODE mà thiếu module ⇒ lỗi PARSE", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": `id: D-001
title: "Design thử"
serves:
  - G-001
summary: "Cách tiếp cận"
status: active
artifacts:
  - id: A-x
    kind: schema
    shape: "users(id uuid pk)"
`,
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  assert.ok(codes.includes("schema/custom"));
});

test("kind mô tả CODE mà khai path ⇒ lỗi PARSE (không neo hai chỗ)", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": `id: D-001
title: "Design thử"
serves:
  - G-001
summary: "Cách tiếp cận"
status: active
artifacts:
  - id: A-x
    kind: schema
    module: M-a
    path: "docs/CONCEPTS.md"
    shape: "users(id uuid pk)"
`,
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  assert.ok(codes.includes("schema/custom"));
});
