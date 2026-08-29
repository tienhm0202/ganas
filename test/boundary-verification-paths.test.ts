import assert from "node:assert/strict";
import { test } from "node:test";

import { taskBoundary } from "../src/boundary.js";
import { loadGraph } from "../src/graph/load.js";
import { zTask } from "../src/model/index.js";
import { cleanup, design, goal, makeProject } from "./helpers.js";

/*
 * ICE-017 / T-067: `taskBoundary()` phải quét cả đường dẫn mà PROBE của
 * verification chạy, không chỉ đường dẫn nằm thẳng trong `exit_contract`.
 * Ba lần vấp thật (T-065, T-061, T-062) đều là dạng: tiêu chí
 * `kind: verification` trỏ một bằng chứng của khối, bằng chứng đó chạy một
 * lệnh chạm file NGOÀI `module.paths`, và `taskBoundary` không biết file đó
 * tồn tại vì nó chưa từng đọc `verify.run`.
 */

test("taskBoundary: target M-x/V-y — probe chạy file ngoài module.paths phải vào ranh giới", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối A"
nature: code
paths: ["src/a/**"]
status: implemented
verify:
  - id: V-a-probe
    kind: probe
    run: "npx tsx --test test/e2e/outside-a.test.ts"
`,
  });
  try {
    const graph = await loadGraph(root);
    const task = zTask.parse({
      id: "T-001",
      title: "t",
      serves: ["G-001"],
      implements: "D-001",
      scope: "P-thu",
      touches: ["M-a"],
      exit_contract: [{ kind: "verification", target: "M-a/V-a-probe" }],
    });
    const boundary = taskBoundary(task, graph);
    assert.ok(
      boundary.includes("test/e2e/outside-a.test.ts"),
      `boundary phải chứa file probe chạy, thực tế: ${JSON.stringify(boundary)}`,
    );
    assert.ok(boundary.includes("src/a/**"));
  } finally {
    await cleanup(root);
  }
});

test("taskBoundary: target M-x trần — gộp probe của MỌI verification của khối", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/modules/M-b.yaml": `id: M-b
title: "Khối B"
nature: code
paths: ["src/b/**"]
status: implemented
verify:
  - id: V-b-smoke
    kind: probe
    run: "true"
  - id: V-b-probe
    kind: probe
    run: "npx tsx --test test/e2e/outside-b.test.ts"
`,
  });
  try {
    const graph = await loadGraph(root);
    const task = zTask.parse({
      id: "T-001",
      title: "t",
      serves: ["G-001"],
      implements: "D-001",
      scope: "P-thu",
      touches: ["M-b"],
      exit_contract: [{ kind: "verification", target: "M-b" }],
    });
    const boundary = taskBoundary(task, graph);
    assert.ok(
      boundary.includes("test/e2e/outside-b.test.ts"),
      `boundary phải chứa file probe của MỘT TRONG các verification, thực tế: ${JSON.stringify(boundary)}`,
    );
  } finally {
    await cleanup(root);
  }
});

test("taskBoundary: target F-xxx — probe của fact cũng được gộp", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối A"
nature: code
paths: ["src/a/**"]
status: implemented
`,
    ".ganas/facts/F-ACC-001.yaml": `- id: F-ACC-001
  statement: "phát biểu thử"
  scope: P-thu
  verify:
    run: "npx tsx --test test/e2e/outside-fact.test.ts"
    expect: exit_zero
  anchors:
    - "src/a/index.ts#L1"
`,
  });
  try {
    const graph = await loadGraph(root);
    const task = zTask.parse({
      id: "T-001",
      title: "t",
      serves: ["G-001"],
      implements: "D-001",
      scope: "P-thu",
      touches: [],
      exit_contract: [{ kind: "verification", target: "F-ACC-001" }],
    });
    const boundary = taskBoundary(task, graph);
    assert.ok(
      boundary.includes("test/e2e/outside-fact.test.ts"),
      `boundary phải chứa file probe của fact, thực tế: ${JSON.stringify(boundary)}`,
    );
  } finally {
    await cleanup(root);
  }
});

test("taskBoundary: target M-x/V-y không tồn tại — không throw, không thêm gì", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối A"
nature: code
paths: ["src/a/**"]
status: implemented
verify:
  - id: V-a-probe
    kind: probe
    run: "true"
`,
  });
  try {
    const graph = await loadGraph(root);
    const task = zTask.parse({
      id: "T-001",
      title: "t",
      serves: ["G-001"],
      implements: "D-001",
      scope: "P-thu",
      touches: ["M-a"],
      exit_contract: [{ kind: "verification", target: "M-a/V-khong-ton-tai" }],
    });
    const boundary = taskBoundary(task, graph);
    assert.deepEqual(boundary, ["src/a/**"]);
  } finally {
    await cleanup(root);
  }
});
