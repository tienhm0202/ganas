import assert from "node:assert/strict";
import { test } from "node:test";

import { taskBoundary } from "../src/boundary.js";
import { loadGraph } from "../src/graph/load.js";
import { zTask } from "../src/model/index.js";
import { cleanup, design, goal, makeProject } from "./helpers.js";

test("taskBoundary: paths của khối task chạm tới, cộng đường dẫn exit_contract chạy", async () => {
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
      touches: ["M-a", "M-khong-co"],
      exit_contract: [{ kind: "command", run: "true" }],
    });
    const patterns = taskBoundary(task, graph);
    assert.deepEqual(patterns, ["src/a/**"]);
  } finally {
    await cleanup(root);
  }
});
