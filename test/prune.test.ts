import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, utimes } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { makeProject, cleanup, goal, sprint, design } from "./helpers.js";
import { loadGraph } from "../src/graph/load.js";
import { writeState, readState } from "../src/state.js";
import { planPrune, applyPrune } from "../src/prune.js";
import { run as ganasPrune } from "../src/commands/prune.js";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-08-15T00:00:00Z");

function daysAgo(n: number): string {
  return new Date(NOW - n * DAY_MS).toISOString();
}

async function touchAt(file: string, msAgo: number): Promise<void> {
  const t = new Date(NOW - msAgo);
  await utimes(file, t, t);
}

/* --- Tầng 1a: runs/*.md của phiên đã kết thúc ------------------------------ */

test("runs/*.md cũ của phiên đã release thì bị đưa vào kế hoạch xoá", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await mkdir(join(root, ".ganas", "runs"), { recursive: true });
    const oldFile = join(root, ".ganas", "runs", "sess-old.md");
    await writeFile(oldFile, "# Handoff — sess-old\n", "utf8");
    await touchAt(oldFile, 10 * DAY_MS);

    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });

    assert.equal(plan.staleRuns.length, 1);
    assert.equal(plan.staleRuns[0]!.sessionId, "sess-old");
    assert.equal(plan.staleRuns[0]!.ageDays, 10);
  } finally {
    await cleanup(root);
  }
});

test("runs/*.md chưa đủ tuổi thì KHÔNG vào kế hoạch", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await mkdir(join(root, ".ganas", "runs"), { recursive: true });
    const file = join(root, ".ganas", "runs", "sess-new.md");
    await writeFile(file, "# Handoff\n", "utf8");
    await touchAt(file, 2 * DAY_MS);

    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.deepEqual(plan.staleRuns, []);
  } finally {
    await cleanup(root);
  }
});

test("runs/*.md của phiên VẪN đang bind trong state.json thì không đụng dù cũ", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await mkdir(join(root, ".ganas", "runs"), { recursive: true });
    const file = join(root, ".ganas", "runs", "sess-active.md");
    await writeFile(file, "# Handoff\n", "utf8");
    await touchAt(file, 30 * DAY_MS);

    await writeState(root, {
      version: 1,
      current_task: "T-001",
      sessions: { "sess-active": { task: "T-001", started_at: daysAgo(30) } },
    });

    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.deepEqual(plan.staleRuns, [], "phiên còn bind thì gate của task khác có thể còn cần file này");
  } finally {
    await cleanup(root);
  }
});

/* --- Tầng 1b: session mồ côi trong state.json ------------------------------ */

test("session mồ côi quá hạn trong state.json bị đưa vào kế hoạch gỡ", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await writeState(root, {
      version: 1,
      current_task: null,
      sessions: { "sess-dead": { task: "T-001", started_at: daysAgo(9) } },
    });
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.equal(plan.deadSessions.length, 1);
    assert.equal(plan.deadSessions[0]!.sessionId, "sess-dead");
  } finally {
    await cleanup(root);
  }
});

/* --- Tầng 2: task done -------------------------------------------------------- */

function doneTask(
  id: string,
  opts: { doneDays?: number; doneAt?: string; blockedBy?: string[]; sprint?: string },
): string {
  const doneAt = opts.doneAt ?? daysAgo(opts.doneDays ?? 0);
  return `id: ${id}
title: "Task đã xong"
serves:
  - G-001
implements: D-001
sprint: ${opts.sprint ?? "S-2026-07"}
status: done
done_at: ${doneAt}
${opts.blockedBy ? `blocked_by:\n${opts.blockedBy.map((b) => `  - ${b}`).join("\n")}\n` : ""}exit_contract:
  - kind: command
    run: "true"
`;
}

/**
 * Sprint closed với `ends_at` neo theo NOW giả lập của test — helper
 * `sprint()` dùng `new Date()` thật, trộn với NOW giả sẽ cho kết quả sai
 * tuỳ lúc chạy test.
 */
function closedSprintYaml(id: string, endedDaysAgo: number): string {
  return `id: ${id}
title: "Sprint đã đóng"
goals:
  - G-001
starts_at: ${daysAgo(endedDaysAgo + 14)}
ends_at: ${daysAgo(endedDaysAgo)}
status: closed
`;
}

test("task done đủ tuổi, không ai blocked_by tới → vào kế hoạch archive", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/sprints/S-2026-07.yaml": closedSprintYaml("S-2026-07", 10),
    ".ganas/tasks/T-001.yaml": doneTask("T-001", { doneDays: 10 }),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.equal(plan.doneTasks.length, 1);
    assert.equal(plan.doneTasks[0]!.id, "T-001");
  } finally {
    await cleanup(root);
  }
});

test("task done nhưng CHƯA đủ tuổi → giữ lại", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/sprints/S-2026-07.yaml": sprint("S-2026-07"),
    ".ganas/tasks/T-001.yaml": doneTask("T-001", { doneDays: 1 }),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.deepEqual(plan.doneTasks, []);
  } finally {
    await cleanup(root);
  }
});

test("task done nhưng còn task khác blocked_by tới nó → KHÔNG archive (tránh treo)", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/sprints/S-2026-07.yaml": sprint("S-2026-07"),
    ".ganas/tasks/T-001.yaml": doneTask("T-001", { doneDays: 10 }),
    ".ganas/tasks/T-002.yaml": `id: T-002
title: "Task khác"
serves:
  - G-001
implements: D-001
sprint: S-2026-07
status: todo
blocked_by:
  - T-001
exit_contract:
  - kind: command
    run: "true"
`,
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.deepEqual(plan.doneTasks, [], "archive T-001 sẽ làm blocked_by của T-002 trỏ vào chỗ trống");
  } finally {
    await cleanup(root);
  }
});

/* --- Tầng 2: sprint closed ----------------------------------------------------- */

test("sprint closed hết task sống trỏ vào (kể cả task cùng bị archive lần này) → archive luôn", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/sprints/S-2026-07.yaml": closedSprintYaml("S-2026-07", 10),
    ".ganas/tasks/T-001.yaml": doneTask("T-001", { doneDays: 10 }),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.equal(plan.doneTasks.length, 1, "T-001 phải được archive trước");
    assert.equal(plan.closedSprints.length, 1, "sau đó sprint không còn ai trỏ vào nên cũng archive được");
    assert.equal(plan.closedSprints[0]!.id, "S-2026-07");
  } finally {
    await cleanup(root);
  }
});

test("sprint closed nhưng còn task KHÔNG bị archive trỏ vào → giữ lại", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/sprints/S-2026-07.yaml": closedSprintYaml("S-2026-07", 10),
    ".ganas/tasks/T-001.yaml": `id: T-001
title: "Vẫn đang làm"
serves:
  - G-001
implements: D-001
sprint: S-2026-07
status: in_progress
exit_contract:
  - kind: command
    run: "true"
`,
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.deepEqual(plan.closedSprints, []);
  } finally {
    await cleanup(root);
  }
});

/* --- applyPrune: thật sự đụng đĩa ---------------------------------------------- */

test("applyPrune: xoá run cũ, gỡ session mồ côi, archive task+sprint — graph sau đó sạch", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/sprints/S-2026-07.yaml": closedSprintYaml("S-2026-07", 10),
    ".ganas/tasks/T-001.yaml": doneTask("T-001", { doneDays: 10 }),
  });
  try {
    await mkdir(join(root, ".ganas", "runs"), { recursive: true });
    const runFile = join(root, ".ganas", "runs", "sess-old.md");
    await writeFile(runFile, "# Handoff\n", "utf8");
    await touchAt(runFile, 10 * DAY_MS);
    await writeState(root, {
      version: 1,
      current_task: null,
      sessions: { "sess-dead": { task: "T-001", started_at: daysAgo(9) } },
    });

    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    await applyPrune(root, plan);

    assert.ok(!existsSync(runFile), "run cũ phải bị xoá thật");
    assert.ok(
      existsSync(join(root, ".ganas", "tasks", "done", "T-001.yaml")),
      "task done phải dời sang tasks/done/",
    );
    assert.ok(
      existsSync(join(root, ".ganas", "sprints", "closed", "S-2026-07.yaml")),
      "sprint closed phải dời sang sprints/closed/",
    );

    const state = await readState(root);
    assert.deepEqual(state.sessions, {}, "session mồ côi phải bị gỡ khỏi state.json");

    const after = await loadGraph(root);
    assert.equal(after.tasks.size, 0, "task đã archive không còn xuất hiện trong graph");
    assert.equal(after.sprints.size, 0, "sprint đã archive không còn xuất hiện trong graph");
  } finally {
    await cleanup(root);
  }
});

/* --- CLI: dry-run mặc định, --yes mới thực thi --------------------------------- */

// CLI không nhận `now` override (đúng như dùng thật) nên phải neo theo đồng
// hồ THẬT, không phải NOW giả lập ở trên — trộn hai đồng hồ sẽ ra ngày trong
// tương lai so với lúc planPrune() thật sự chạy.
function realDaysAgo(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toISOString();
}

test("ganas prune: mặc định dry-run, KHÔNG đụng đĩa", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/sprints/S-2026-07.yaml": sprint("S-2026-07"),
    ".ganas/tasks/T-001.yaml": doneTask("T-001", { doneAt: realDaysAgo(10) }),
  });
  try {
    const code = await ganasPrune({
      positional: [],
      options: { root, "older-than": "7" },
      flags: {},
      passthrough: [],
    });
    assert.equal(code, 0);
    assert.ok(existsSync(join(root, ".ganas", "tasks", "T-001.yaml")), "dry-run không được dời file");
    assert.ok(!existsSync(join(root, ".ganas", "tasks", "done")));
  } finally {
    await cleanup(root);
  }
});

test("ganas prune --yes: thực thi thật", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/sprints/S-2026-07.yaml": sprint("S-2026-07"),
    ".ganas/tasks/T-001.yaml": doneTask("T-001", { doneAt: realDaysAgo(10) }),
  });
  try {
    const code = await ganasPrune({
      positional: [],
      options: { root, "older-than": "7" },
      flags: { yes: true },
      passthrough: [],
    });
    assert.equal(code, 0);
    assert.ok(existsSync(join(root, ".ganas", "tasks", "done", "T-001.yaml")));
  } finally {
    await cleanup(root);
  }
});
