import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { run as ganasPrune } from "../src/commands/prune.js";
import { loadGraph } from "../src/graph/load.js";
import { applyPrune, planPrune } from "../src/prune.js";
import { writeState } from "../src/state.js";
import { cleanup, design, goal, makeProject } from "./helpers.js";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-08-29T00:00:00Z");

function daysAgo(n: number): string {
  return new Date(NOW - n * DAY_MS).toISOString();
}

/** Ghi trực tiếp một file khoá `.ganas/.locks/<name>` — cùng khuôn dữ liệu mà `graph/claim.ts` tự ghi. */
async function writeLock(root: string, name: string, sessionId: string, claimedAt: string): Promise<string> {
  const dir = join(root, ".ganas", ".locks");
  await mkdir(dir, { recursive: true });
  const file = join(dir, name);
  await writeFile(file, JSON.stringify({ session_id: sessionId, claimed_at: claimedAt }), "utf8");
  return file;
}

/** Design đã đóng chặng — `design()` ở helpers.ts hardcode `status: active`, nên viết tay khi cần `done`. */
function doneDesign(id = "D-001", doneAt = daysAgo(1)): string {
  return `id: ${id}
title: "Design đã đóng"
serves:
  - G-001
summary: "Cách tiếp cận"
status: done
done_at: ${doneAt}
`;
}

function doneTaskFor(id: string, implementsId: string, doneAt = daysAgo(10)): string {
  return `id: ${id}
title: "Task đã xong"
serves:
  - G-001
implements: ${implementsId}
scope: P-thu
status: done
done_at: ${doneAt}
exit_contract:
  - kind: command
    run: "true"
`;
}

function proposalYaml(opts: {
  id: string;
  status?: "pending" | "approved" | "rejected";
  decidedAt?: string;
  whyRejected?: string;
  supersedes?: string[];
}): string {
  const status = opts.status ?? "approved";
  const lines = [
    `id: ${opts.id}`,
    `title: "đề xuất thử"`,
    `scope: P-thu`,
    `problem: "vấn đề thử"`,
    `proposed_change: "sửa thử"`,
    `anchors:`,
    `  - "src/a.ts:1"`,
    `weight: 3`,
    `ease: 3`,
    `found_at: "2026-01-01T00:00:00Z"`,
    `status: ${status}`,
  ];
  if (status !== "pending") {
    lines.push(`decided_by: "@nguoi-duyet"`);
    lines.push(`decided_at: ${opts.decidedAt ?? daysAgo(10)}`);
  }
  if (status === "rejected") lines.push(`why_rejected: "${opts.whyRejected ?? "không cần"}"`);
  if (opts.supersedes && opts.supersedes.length > 0) {
    lines.push(`supersedes:`);
    for (const s of opts.supersedes) lines.push(`  - ${s}`);
  }
  return lines.join("\n") + "\n";
}

/** Bắt stdout của một lời gọi command run() — cùng khuôn `test/trace.test.ts`. */
async function captureStdout(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  const original = process.stdout.write.bind(process.stdout);
  let out = "";
  process.stdout.write = (chunk: string) => {
    out += chunk;
    return true;
  };
  try {
    const code = await fn();
    return { code, out };
  } finally {
    process.stdout.write = original;
  }
}

/* --- VIỆC (1): lock mồ côi trong .locks/ ----------------------------------- */

test("lock 'cli' quá TTL bị planPrune liệt kê rồi applyPrune xoá thật", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    // ttl_minutes mặc định 240 (4h) — 1 ngày trước là quá hạn xa.
    const file = await writeLock(root, "T-099.claim", "cli", daysAgo(1));

    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });

    assert.equal(plan.staleLocks.length, 1);
    assert.equal(plan.staleLocks[0]!.sessionId, "cli");
    assert.equal(plan.staleLocks[0]!.reason, "ttl");

    await applyPrune(root, plan);
    assert.ok(!existsSync(file), "lock quá TTL phải bị xoá thật");
  } finally {
    await cleanup(root);
  }
});

test("lock còn trong TTL nhưng session không còn trong state.json (TTL cấu hình dài) → bắt bằng lý do orphan-session", async () => {
  const root = await makeProject({
    // ttl_minutes 20160 (14 ngày) > ngưỡng --older-than 7 ngày, để tách hai
    // tiêu chí: một lock 10 ngày tuổi vẫn CHƯA quá TTL nhưng đã quá cutoff.
    ".ganas/config.yaml": 'version: 1\nproject: "test"\nenforcement: enforce\nclaim:\n  ttl_minutes: 20160\n',
    ".ganas/goals/G-001.yaml": goal(),
  });
  try {
    const file = await writeLock(root, "T-100.id", "cli", daysAgo(10));

    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });

    assert.equal(plan.staleLocks.length, 1);
    assert.equal(plan.staleLocks[0]!.reason, "orphan-session");

    await applyPrune(root, plan);
    assert.ok(!existsSync(file));
  } finally {
    await cleanup(root);
  }
});

test("lock của session còn bind trong state.json (dù cũ, TTL dài) → KHÔNG đụng", async () => {
  const root = await makeProject({
    ".ganas/config.yaml": 'version: 1\nproject: "test"\nenforcement: enforce\nclaim:\n  ttl_minutes: 20160\n',
    ".ganas/goals/G-001.yaml": goal(),
  });
  try {
    await writeLock(root, "T-101.claim", "sess-active", daysAgo(10));
    await writeState(root, {
      version: 1,
      current_task: "T-101",
      sessions: { "sess-active": { task: "T-101", started_at: daysAgo(10) } },
    });

    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });

    assert.deepEqual(plan.staleLocks, [], "phiên còn sống trong state.json thì không phải mồ côi");
  } finally {
    await cleanup(root);
  }
});

/* --- VIỆC (2): proposal đã quyết ------------------------------------------- */

test("proposal approved đủ tuổi chuyển sang proposals/closed/, loadGraph sau đó không thấy nó", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/proposals/PR-001.yaml": proposalYaml({ id: "PR-001", decidedAt: daysAgo(10) }),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });

    assert.equal(plan.closedProposals.length, 1);
    assert.equal(plan.closedProposals[0]!.id, "PR-001");

    await applyPrune(root, plan);
    assert.ok(!existsSync(join(root, ".ganas", "proposals", "PR-001.yaml")));
    assert.ok(existsSync(join(root, ".ganas", "proposals", "closed", "PR-001.yaml")));

    const after = await loadGraph(root);
    assert.equal(after.proposals.size, 0, "proposal đã archive không còn xuất hiện trong graph");
  } finally {
    await cleanup(root);
  }
});

test("proposal rejected nhưng CHƯA đủ tuổi → giữ lại", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/proposals/PR-001.yaml": proposalYaml({
      id: "PR-001",
      status: "rejected",
      decidedAt: daysAgo(1),
    }),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.deepEqual(plan.closedProposals, []);
  } finally {
    await cleanup(root);
  }
});

test("proposal đã quyết, đủ tuổi, nhưng còn bị đề xuất khác `supersedes` trỏ tới → KHÔNG archive", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/proposals/PR-001.yaml": proposalYaml({ id: "PR-001", decidedAt: daysAgo(10) }),
    ".ganas/proposals/PR-002.yaml": proposalYaml({
      id: "PR-002",
      decidedAt: daysAgo(1),
      supersedes: ["PR-001"],
    }),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.deepEqual(
      plan.closedProposals,
      [],
      "archive PR-001 sẽ làm supersedes của PR-002 trỏ vào chỗ trống",
    );
  } finally {
    await cleanup(root);
  }
});

/* --- VIỆC (4): design chưa done thì task của nó không được archive --------- */

test("task done đủ tuổi mà design (implements) CHƯA done → KHÔNG archive (ca D-003/T-005)", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design("D-001"), // status: active (mặc định)
    ".ganas/tasks/T-005.yaml": doneTaskFor("T-005", "D-001"),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.deepEqual(
      plan.doneTasks,
      [],
      "archive T-005 khi D-001 còn active sẽ làm spine/design-stalled không bao giờ bắt được D-001",
    );
  } finally {
    await cleanup(root);
  }
});

test("task done đủ tuổi mà design (implements) đã done → archive bình thường", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": doneDesign("D-001"),
    ".ganas/tasks/T-005.yaml": doneTaskFor("T-005", "D-001"),
  });
  try {
    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7, now: NOW });
    assert.equal(plan.doneTasks.length, 1);
    assert.equal(plan.doneTasks[0]!.id, "T-005");

    await applyPrune(root, plan);
    assert.ok(existsSync(join(root, ".ganas", "tasks", "done", "T-005.yaml")));
  } finally {
    await cleanup(root);
  }
});

/* --- VIỆC (3): `ganas prune --dry-run` in rõ số file SẼ archive + ngày đủ tuổi */

test("ganas prune --dry-run: in rõ số mục SẼ archive và mốc ngày đủ tuổi", async () => {
  const realDaysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": doneDesign("D-001", realDaysAgo(10)),
    ".ganas/tasks/T-005.yaml": doneTaskFor("T-005", "D-001", realDaysAgo(10)),
  });
  try {
    const { code, out } = await captureStdout(() =>
      ganasPrune({
        positional: [],
        options: { root, "older-than": "7" },
        flags: {},
        passthrough: [],
      }),
    );
    assert.equal(code, 0);
    assert.match(out, /1 mục sẽ ARCHIVE/, "phải nói rõ SỐ mục sẽ archive");
    assert.match(out, /mốc \d{4}-\d{2}-\d{2}/, "phải in ra ngày đủ tuổi (mốc cutoff) cụ thể");
    assert.ok(
      existsSync(join(root, ".ganas", "tasks", "T-005.yaml")),
      "dry-run không được dời file",
    );
  } finally {
    await cleanup(root);
  }
});
