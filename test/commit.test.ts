import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { run as ganasCommit } from "../src/commands/commit.js";
import { buildCommitMessage, pathsToStage } from "../src/commit.js";
import { evaluateGate } from "../src/gate.js";
import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import { zTask } from "../src/model/index.js";
import { runShell } from "../src/util/exec.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope } from "./helpers.js";

/* --- buildCommitMessage: thuần, không cần git thật ------------------------ */

test("buildCommitMessage: không bao giờ nhắc AI/trợ lý, lấy đúng dữ liệu spine", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
  });
  try {
    const graph = await loadGraph(root);
    const task = zTask.parse({
      id: "T-001",
      title: "Sửa nhận diện ý định",
      serves: ["G-001"],
      implements: "D-001",
      scope: "P-thu",
      exit_contract: [{ kind: "command", run: "true" }],
    });
    const gate = await evaluateGate(graph, task, await computeFreshness(graph));
    const message = buildCommitMessage(graph, task, gate);

    assert.match(message, /^T-001: Sửa nhận diện ý định/);
    assert.match(message, /✓ lệnh `true`/);
    assert.match(message, /design D-001 — Design thử/);
    assert.doesNotMatch(message, /claude/i);
    assert.doesNotMatch(message, /co-authored/i);
    assert.doesNotMatch(message, /anthropic/i);
  } finally {
    await cleanup(root);
  }
});

test("pathsToStage: paths của khối task chạm tới, cộng đường dẫn exit_contract chạy", async () => {
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
    const patterns = pathsToStage(task, graph);
    assert.deepEqual(patterns, ["src/a/**"]);
  } finally {
    await cleanup(root);
  }
});

/* --- Tích hợp: git thật ----------------------------------------------------- */

async function gitProject(files: Record<string, string>): Promise<string> {
  const root = await makeProject(files);
  await runShell("git init -q", { cwd: root });
  await runShell('git config user.email "test@ganas.local"', { cwd: root });
  await runShell('git config user.name "ganas test"', { cwd: root });
  return root;
}

test("ganas commit: gate chưa đạt thì KHÔNG commit gì cả", async () => {
  const root = await gitProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": `id: T-001
title: "t"
serves: [G-001]
implements: D-001
scope: P-thu
exit_contract:
  - kind: command
    run: "false"
`,
  });
  try {
    const code = await ganasCommit({
      positional: ["T-001"],
      options: { root },
      flags: {},
      passthrough: [],
    });
    assert.equal(code, 1);
    const log = await runShell("git log --oneline", { cwd: root });
    assert.equal(log.stdout.trim(), "", "gate trượt thì tuyệt đối không được có commit nào");
  } finally {
    await cleanup(root);
  }
});

test("ganas commit: gate đạt thì commit thật, message không nhắc AI", async () => {
  const root = await gitProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": `id: T-001
title: "Sửa gì đó"
serves: [G-001]
implements: D-001
scope: P-thu
exit_contract:
  - kind: command
    run: "true"
`,
  });
  try {
    const code = await ganasCommit({
      positional: ["T-001"],
      options: { root },
      flags: {},
      passthrough: [],
    });
    assert.equal(code, 0);

    const log = await runShell("git log -1 --pretty=%B", { cwd: root });
    assert.match(log.stdout, /^T-001: Sửa gì đó/);
    assert.doesNotMatch(log.stdout, /claude/i);
    assert.doesNotMatch(log.stdout, /co-authored/i);

    // Idempotent: gọi lại lần hai không có gì mới để commit.
    const again = await ganasCommit({
      positional: ["T-001"],
      options: { root },
      flags: {},
      passthrough: [],
    });
    assert.equal(again, 0);
    const count = await runShell("git rev-list --count HEAD", { cwd: root });
    assert.equal(count.stdout.trim(), "1", "lần gọi thứ hai không được tạo thêm commit rỗng");
  } finally {
    await cleanup(root);
  }
});

test("ganas commit --dry-run: in message, không tạo commit", async () => {
  const root = await gitProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": `id: T-001
title: "t"
serves: [G-001]
implements: D-001
scope: P-thu
exit_contract:
  - kind: command
    run: "true"
`,
  });
  try {
    const code = await ganasCommit({
      positional: ["T-001"],
      options: { root },
      flags: { "dry-run": true },
      passthrough: [],
    });
    assert.equal(code, 0);
    const log = await runShell("git log --oneline", { cwd: root });
    assert.equal(log.stdout.trim(), "", "dry-run không được tạo commit");
  } finally {
    await cleanup(root);
  }
});

test("ganas commit: khối chạm tới có code thật cũng được add cùng .ganas/", async () => {
  const root = await gitProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối A"
nature: code
paths: ["src/a/**"]
status: implemented
verify:
  - id: V-a-probe
    kind: probe
    run: "test -f src/a/index.ts"
`,
    ".ganas/tasks/T-001.yaml": `id: T-001
title: "t"
serves: [G-001]
implements: D-001
scope: P-thu
touches:
  - M-a
exit_contract:
  - kind: verification
    target: M-a/V-a-probe
`,
  });
  try {
    await mkdir(join(root, "src", "a"), { recursive: true });
    await writeFile(join(root, "src", "a", "index.ts"), "export {};\n", "utf8");

    const { runTarget, moduleTargets } = await import("../src/verify/run.js");
    const graph0 = await loadGraph(root);
    await runTarget(moduleTargets(graph0.modules.get("M-a")!)[0]!, { root, by: "test" });

    const code = await ganasCommit({
      positional: ["T-001"],
      options: { root },
      flags: {},
      passthrough: [],
    });
    assert.equal(code, 0);

    const show = await runShell("git show --stat -1", { cwd: root });
    assert.match(show.stdout, /src\/a\/index\.ts/);
  } finally {
    await cleanup(root);
  }
});
