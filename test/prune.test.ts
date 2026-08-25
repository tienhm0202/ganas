import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { run as ganasPrune } from "../src/commands/prune.js";
import { loadGraph } from "../src/graph/load.js";
import { applyPrune, planPrune } from "../src/prune.js";
import { readState, writeState } from "../src/state.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope } from "./helpers.js";

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
    assert.deepEqual(
      plan.staleRuns,
      [],
      "phiên còn bind thì gate của task khác có thể còn cần file này",
    );
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
  opts: { doneDays?: number; doneAt?: string; blockedBy?: string[]; scope?: string },
): string {
  const doneAt = opts.doneAt ?? daysAgo(opts.doneDays ?? 0);
  return `id: ${id}
title: "Task đã xong"
serves:
  - G-001
implements: D-001
scope: ${opts.scope ?? "P-thu"}
status: done
done_at: ${doneAt}
${opts.blockedBy ? `blocked_by:\n${opts.blockedBy.map((b) => `  - ${b}`).join("\n")}\n` : ""}exit_contract:
  - kind: command
    run: "true"
`;
}

test("task done đủ tuổi, không ai blocked_by tới → vào kế hoạch archive", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
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
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
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
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": doneTask("T-001", { doneDays: 10 }),
    ".ganas/tasks/T-002.yaml": `id: T-002
title: "Task khác"
serves:
  - G-001
implements: D-001
scope: P-thu
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
    assert.deepEqual(
      plan.doneTasks,
      [],
      "archive T-001 sẽ làm blocked_by của T-002 trỏ vào chỗ trống",
    );
  } finally {
    await cleanup(root);
  }
});

/* --- Tầng 2: task done trỏ tới bởi icebox.promoted_to ------------------------- */

function iceboxYaml(
  records: Array<{
    id: string;
    status?: "open" | "closed" | "promoted";
    closedAt?: string;
    closedReason?: string;
    promotedTo?: string;
  }>,
): string {
  return records
    .map((r) => {
      const status = r.status ?? "open";
      const lines = [
        `- id: ${r.id}`,
        `  title: "phát hiện thử"`,
        `  found_at: "2026-01-01T00:00:00Z"`,
        `  weight: 3`,
        `  ease: 3`,
        `  why_deferred: "chưa tới lượt"`,
        `  anchors: ["src/a.ts#L1"]`,
        `  status: ${status}`,
      ];
      if (r.closedAt) lines.push(`  closed_at: ${r.closedAt}`);
      if (status === "closed") lines.push(`  closed_reason: "${r.closedReason ?? "hết cần"}"`);
      if (r.promotedTo) lines.push(`  promoted_to: ${r.promotedTo}`);
      return lines.join("\n");
    })
    .join("\n");
}

test("task done đủ tuổi mà là promoted_to của một mục icebox → KHÔNG archive", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": doneTask("T-001", { doneDays: 10 }),
    ".ganas/icebox/2026-08.yaml": iceboxYaml([
      { id: "ICE-001", status: "promoted", closedAt: daysAgo(1), promotedTo: "T-001" },
    ]),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.deepEqual(
      plan.doneTasks,
      [],
      "archive T-001 sẽ làm promoted_to của ICE-001 trỏ vào chỗ trống",
    );
  } finally {
    await cleanup(root);
  }
});

test("cùng task đó, khi không còn mục icebox nào trỏ tới → archive bình thường", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
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

/* --- Tầng 2: task done trỏ tới bởi proposal.promoted_to ------------------------ */

function proposalYaml(opts: { id: string; promotedTo: string }): string {
  return `id: ${opts.id}
title: "đề xuất thử"
scope: P-thu
problem: "vấn đề thử"
proposed_change: "sửa thử"
anchors:
  - "src/a.ts:1"
weight: 3
ease: 3
found_at: "2026-01-01T00:00:00Z"
status: approved
decided_by: "@nguoi-duyet"
decided_at: "2026-01-02T00:00:00Z"
promoted_to: ${opts.promotedTo}
`;
}

test("task done đủ tuổi mà là promoted_to của một đề xuất approved → KHÔNG archive", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": doneTask("T-001", { doneDays: 10 }),
    ".ganas/proposals/PR-001.yaml": proposalYaml({ id: "PR-001", promotedTo: "T-001" }),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.deepEqual(
      plan.doneTasks,
      [],
      "archive T-001 sẽ làm promoted_to của PR-001 trỏ vào chỗ trống (spine/proposal-missing-target)",
    );
  } finally {
    await cleanup(root);
  }
});

/* --- Tầng 2: file icebox theo tháng đã đóng hết -------------------------------- */

test("file icebox: mọi bản ghi closed/promoted, closed_at mới nhất đủ tuổi → vào kế hoạch archive", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/icebox/2026-08.yaml": iceboxYaml([
      { id: "ICE-001", status: "closed", closedAt: daysAgo(10) },
      { id: "ICE-002", status: "promoted", closedAt: daysAgo(15), promotedTo: "T-999" },
    ]),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.equal(plan.iceboxFiles.length, 1);
    assert.equal(plan.iceboxFiles[0]!.month, "2026-08");
    assert.equal(plan.iceboxFiles[0]!.ageDays, 10, "tuổi phải neo theo closed_at MỚI NHẤT, không phải cũ nhất");
  } finally {
    await cleanup(root);
  }
});

test("file icebox: còn ít nhất một bản ghi open → KHÔNG đụng, dù bản ghi khác đã đóng lâu", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/icebox/2026-08.yaml": iceboxYaml([
      { id: "ICE-001", status: "closed", closedAt: daysAgo(30) },
      { id: "ICE-002", status: "open" },
    ]),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.deepEqual(plan.iceboxFiles, []);
  } finally {
    await cleanup(root);
  }
});

test("file icebox: đóng hết nhưng closed_at CHƯA đủ tuổi → không đụng", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/icebox/2026-08.yaml": iceboxYaml([
      { id: "ICE-001", status: "closed", closedAt: daysAgo(1) },
      { id: "ICE-002", status: "promoted", closedAt: daysAgo(2), promotedTo: "T-999" },
    ]),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.deepEqual(plan.iceboxFiles, []);
  } finally {
    await cleanup(root);
  }
});

test("applyPrune: file icebox đóng hết đủ tuổi được dời sang icebox/closed/", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/icebox/2026-08.yaml": iceboxYaml([
      { id: "ICE-001", status: "closed", closedAt: daysAgo(10) },
    ]),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    await applyPrune(root, plan);

    assert.ok(!existsSync(join(root, ".ganas", "icebox", "2026-08.yaml")));
    assert.ok(existsSync(join(root, ".ganas", "icebox", "closed", "2026-08.yaml")));

    const after = await loadGraph(root);
    assert.equal(after.icebox.size, 0, "file đã archive không còn xuất hiện trong graph");
  } finally {
    await cleanup(root);
  }
});

/* --- applyPrune: thật sự đụng đĩa ---------------------------------------------- */

test("applyPrune: xoá run cũ, gỡ session mồ côi, archive task — graph sau đó sạch", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
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

    const state = await readState(root);
    assert.deepEqual(state.sessions, {}, "session mồ côi phải bị gỡ khỏi state.json");

    const after = await loadGraph(root);
    assert.equal(after.tasks.size, 0, "task đã archive không còn xuất hiện trong graph");
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
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
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
    assert.ok(
      existsSync(join(root, ".ganas", "tasks", "T-001.yaml")),
      "dry-run không được dời file",
    );
    assert.ok(!existsSync(join(root, ".ganas", "tasks", "done")));
  } finally {
    await cleanup(root);
  }
});

test("ganas prune --yes: thực thi thật", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
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

test("ganas prune: mặc định dry-run, file icebox đóng hết đủ tuổi cũng KHÔNG bị dời", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/icebox/2026-08.yaml": iceboxYaml([
      { id: "ICE-001", status: "closed", closedAt: realDaysAgo(10) },
    ]),
  });
  try {
    const code = await ganasPrune({
      positional: [],
      options: { root, "older-than": "7" },
      flags: {},
      passthrough: [],
    });
    assert.equal(code, 0);
    assert.ok(
      existsSync(join(root, ".ganas", "icebox", "2026-08.yaml")),
      "dry-run không được dời file icebox",
    );
    assert.ok(!existsSync(join(root, ".ganas", "icebox", "closed")));
  } finally {
    await cleanup(root);
  }
});
