import assert from "node:assert/strict";
import { test } from "node:test";

import { loadGraph } from "../src/graph/load.js";
import { check, cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

/**
 * T-069: `Task.role` tách vai thiết kế (`design`) khỏi vai hiện thực
 * (`build`), cộng hai luật spine đi kèm. Xem `.ganas/designs/D-010.yaml`
 * cho lý lẽ đầy đủ.
 */

test("task không khai `role` → mặc định `build` (vế adopt: 49 task cũ không cần sửa)", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(), // không khai role
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  try {
    const graph = await loadGraph(root);
    const t = graph.tasks.get("T-001");
    assert.ok(t, "task T-001 phải nạp được");
    assert.equal(t.value.role, "build");
  } finally {
    await cleanup(root);
  }
});

test("role: design + touches khác rỗng → spine/design-task-touches-code, severity error", async () => {
  const { diagnostics, codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": task("T-001", {
      extra: "role: design\ntouches:\n  - M-a\n",
    }),
  });
  assert.ok(codes.includes("spine/design-task-touches-code"));
  const diag = diagnostics.find((d) => d.code === "spine/design-task-touches-code");
  assert.equal(diag?.severity, "error");
});

test("role: design + touches: [] + tiêu chí artifact trỏ đúng file design → SẠCH", async () => {
  const { diagnostics, codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": task("T-001", {
      extra:
        '  - kind: artifact\n    path: ".ganas/designs/D-001.yaml"\n' +
        "role: design\ntouches: []\n",
    }),
  });
  assert.ok(!codes.includes("spine/design-task-touches-code"));
  assert.ok(!codes.includes("spine/design-task-without-artifact-criterion"));
  const errors = diagnostics.filter((d) => d.severity === "error");
  assert.deepEqual(errors, [], `không mong đợi lỗi: ${JSON.stringify(errors, null, 2)}`);
});

test("role: design thiếu tiêu chí artifact → spine/design-task-without-artifact-criterion, severity warning", async () => {
  const { diagnostics, codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": task("T-001", {
      extra: "role: design\ntouches: []\n",
    }),
  });
  assert.ok(codes.includes("spine/design-task-without-artifact-criterion"));
  const diag = diagnostics.find((d) => d.code === "spine/design-task-without-artifact-criterion");
  assert.equal(diag?.severity, "warning");
});

test("role: build không bị hai luật design đụng tới, kể cả khi touches khác rỗng", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": task("T-001", {
      extra: "role: build\ntouches:\n  - M-a\n",
    }),
  });
  assert.ok(!codes.includes("spine/design-task-touches-code"));
  assert.ok(!codes.includes("spine/design-task-without-artifact-criterion"));
});
