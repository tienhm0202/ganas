import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { evaluateGate } from "../src/gate.js";
import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import { generateHandoff, parseTranscript, renderHandoff, runsPath } from "../src/handoff.js";
import * as handlers from "../src/hooks/io/handlers.js";
import { zTask } from "../src/model/index.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope } from "./helpers.js";

/* --- parseTranscript: trích cơ học từ JSONL -------------------------------- */

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

test("parseTranscript trích đúng: user text, file sửa, lệnh chạy — bỏ noise", () => {
  const raw = [
    // wrapper hệ thống — phải bỏ qua dù type là "user"
    line({
      type: "user",
      isMeta: true,
      message: { role: "user", content: "<local-command-caveat>...</local-command-caveat>" },
      timestamp: "2026-08-01T09:00:00.000Z",
    }),
    line({
      type: "user",
      message: { role: "user", content: "<command-name>/clear</command-name>" },
      timestamp: "2026-08-01T09:00:01.000Z",
    }),
    // tin nhắn thật của người dùng
    line({
      type: "user",
      message: { role: "user", content: "sửa lỗi timeout ở module retry\ndòng hai" },
      timestamp: "2026-08-01T09:01:00.000Z",
    }),
    // assistant: text KHÔNG được lấy, chỉ tool_use
    line({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "..." },
          { type: "text", text: "Tôi sẽ sửa file retry.ts" },
          { type: "tool_use", id: "t1", name: "Edit", input: { file_path: "src/retry.ts" } },
          { type: "tool_use", id: "t2", name: "Bash", input: { command: "npm test" } },
        ],
      },
      timestamp: "2026-08-01T09:02:00.000Z",
    }),
    // tool_result quay lại dạng "user" — không phải tin nhắn người gõ
    line({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }],
      },
      timestamp: "2026-08-01T09:02:05.000Z",
    }),
    "not json at all — dòng hỏng",
    line({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t3", name: "Read", input: { file_path: "src/retry.ts" } },
        ],
      },
      timestamp: "2026-08-01T09:03:00.000Z",
    }),
  ].join("\n");

  const s = parseTranscript(raw);

  assert.deepEqual(s.userMessages, ["sửa lỗi timeout ở module retry dòng hai"]);
  assert.deepEqual(s.filesWritten, ["src/retry.ts"]);
  assert.deepEqual(s.filesRead, ["src/retry.ts"]);
  assert.deepEqual(s.commandsRun, ["npm test"]);
  assert.equal(s.toolCounts["Edit"], 1);
  assert.equal(s.toolCounts["Bash"], 1);
  assert.equal(s.toolCounts["Read"], 1);
  assert.equal(s.startedAt, "2026-08-01T09:00:00.000Z");
  assert.equal(s.endedAt, "2026-08-01T09:03:00.000Z");

  // Không nơi nào trong output chứa văn xuôi của assistant.
  assert.ok(!JSON.stringify(s).includes("Tôi sẽ sửa"));
});

test("parseTranscript: transcript rỗng trả về summary rỗng, không lỗi", () => {
  const s = parseTranscript("");
  assert.deepEqual(s.userMessages, []);
  assert.equal(s.turnCount, 0);
  assert.equal(s.startedAt, undefined);
});

/* --- renderHandoff: thuần, không cần file thật ----------------------------- */

async function baseGraph() {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/claims/c.yaml": `- id: C-001
  scope: P-thu
  statement: "Redis dùng port 6380 không phải 6379"
  anchors: ["src/config.ts#L10"]
  provenance: session
  source_session: sess-1`,
    ".ganas/facts/f.yaml": `- id: F-A-001
  scope: P-thu
  statement: "module retry có unit test"
  verify:
    run: "true"
    expect: exit_zero
  last_verified_at: 2026-08-01T09:05:00Z
  last_result: pass
  verified_by: sess-1`,
  });
  return root;
}

test("renderHandoff: chỉ gom claim/fact gắn ĐÚNG session, có mục câu hỏi mở", async () => {
  const root = await baseGraph();
  try {
    const graph = await loadGraph(root);
    const task = zTask.parse({
      id: "T-001",
      title: "Sửa retry",
      serves: ["G-001"],
      implements: "D-001",
      scope: "P-thu",
      context_contract: { open_questions: ["Timeout nên là bao nhiêu giây?"] },
      exit_contract: [{ kind: "command", run: "true" }],
    });
    const gate = await evaluateGate(graph, task, await computeFreshness(graph));

    const md = renderHandoff({
      sessionId: "sess-1",
      task,
      gate,
      graph,
      transcript: {
        startedAt: "2026-08-01T09:00:00Z",
        endedAt: "2026-08-01T09:10:00Z",
        turnCount: 4,
        userMessages: ["sửa lỗi timeout"],
        filesWritten: ["src/retry.ts"],
        filesRead: [],
        commandsRun: ["npm test"],
        toolCounts: {},
      },
    });

    assert.match(md, /# Handoff — sess-1/);
    assert.match(md, /sửa lỗi timeout/);
    assert.match(md, /`src\/retry\.ts`/);
    assert.match(md, /`npm test`/);
    assert.match(md, /C-001.*Redis dùng port 6380/);
    assert.match(md, /F-A-001.*module retry có unit test/);
    assert.match(md, /Timeout nên là bao nhiêu giây/);
    assert.match(md, /Điều kiện hoàn thành của T-001/);
  } finally {
    await cleanup(root);
  }
});

test("renderHandoff: fact/claim của SESSION KHÁC không bị gom nhầm", async () => {
  const root = await baseGraph();
  try {
    const graph = await loadGraph(root);
    const task = zTask.parse({
      id: "T-001",
      title: "t",
      serves: ["G-001"],
      implements: "D-001",
      scope: "P-thu",
      exit_contract: [{ kind: "command", run: "true" }],
    });
    const gate = await evaluateGate(graph, task, await computeFreshness(graph));
    const md = renderHandoff({ sessionId: "sess-KHAC", task, gate, graph, transcript: null });

    assert.doesNotMatch(md, /C-001/);
    assert.doesNotMatch(md, /F-A-001/);
    assert.match(md, /không có fact\/claim nào gắn với phiên này/);
    assert.match(md, /không đọc được transcript/);
  } finally {
    await cleanup(root);
  }
});

/* --- generateHandoff: ghi file thật ----------------------------------------- */

test("generateHandoff ghi đúng .ganas/runs/<session>.md", async () => {
  const root = await baseGraph();
  try {
    const graph = await loadGraph(root);
    const task = zTask.parse({
      id: "T-001",
      title: "t",
      serves: ["G-001"],
      implements: "D-001",
      scope: "P-thu",
      exit_contract: [{ kind: "command", run: "true" }],
    });
    const gate = await evaluateGate(graph, task, await computeFreshness(graph));

    const { path } = await generateHandoff(root, graph, task, gate, { sessionId: "sess-1" });
    assert.equal(path, runsPath(root, "sess-1"));
    const onDisk = await readFile(path, "utf8");
    assert.match(onDisk, /# Handoff — sess-1/);
  } finally {
    await cleanup(root);
  }
});

/* --- Hook: preCompact / sessionEnd tự ghi handoff --------------------------- */

test("sessionEnd tự ghi handoff cho phiên đang bind, rồi mới giải phóng session", async () => {
  const root = await baseGraph();
  const { writeFile, mkdir } = await import("node:fs/promises");
  const path = await import("node:path");
  await mkdir(path.join(root, ".ganas", "tasks"), { recursive: true });
  await writeFile(
    path.join(root, ".ganas", "tasks", "T-001.yaml"),
    `id: T-001
title: "t"
serves: [G-001]
implements: D-001
scope: P-thu
exit_contract:
  - kind: command
    run: "true"
`,
    "utf8",
  );
  try {
    await handlers.sessionStart({ cwd: root, session_id: "sess-1" });
    await handlers.sessionEnd({ cwd: root, session_id: "sess-1" });

    const content = await readFile(runsPath(root, "sess-1"), "utf8");
    assert.match(content, /# Handoff — sess-1/);
  } finally {
    await cleanup(root);
  }
});

test("preCompact báo đã ghi handoff trong systemMessage", async () => {
  const root = await baseGraph();
  const { writeFile, mkdir } = await import("node:fs/promises");
  const path = await import("node:path");
  await mkdir(path.join(root, ".ganas", "tasks"), { recursive: true });
  await writeFile(
    path.join(root, ".ganas", "tasks", "T-001.yaml"),
    `id: T-001
title: "t"
serves: [G-001]
implements: D-001
scope: P-thu
exit_contract:
  - kind: command
    run: "true"
`,
    "utf8",
  );
  try {
    await handlers.sessionStart({ cwd: root, session_id: "sess-1" });
    const out = await handlers.preCompact({ cwd: root, session_id: "sess-1" });
    assert.match(out.systemMessage!, /Đã ghi handoff/);
    const content = await readFile(runsPath(root, "sess-1"), "utf8");
    assert.match(content, /# Handoff — sess-1/);
  } finally {
    await cleanup(root);
  }
});

/* --- CLI: ganas handoff ------------------------------------------------------ */

test("ganas handoff: thiếu --session bị từ chối rõ ràng", async () => {
  const root = await baseGraph();
  try {
    const { run } = await import("../src/commands/handoff.js");
    await assert.rejects(
      run({ positional: [], options: { root }, flags: {}, passthrough: [] }),
      /--session/,
    );
  } finally {
    await cleanup(root);
  }
});

test("ganas handoff --session --task: sinh file, --json trả path", async () => {
  const root = await baseGraph();
  const { writeFile, mkdir } = await import("node:fs/promises");
  const path = await import("node:path");
  await mkdir(path.join(root, ".ganas", "tasks"), { recursive: true });
  await writeFile(
    path.join(root, ".ganas", "tasks", "T-001.yaml"),
    `id: T-001
title: "t"
serves: [G-001]
implements: D-001
scope: P-thu
exit_contract:
  - kind: command
    run: "true"
`,
    "utf8",
  );
  try {
    const { run } = await import("../src/commands/handoff.js");
    const code = await run({
      positional: [],
      options: { root, session: "sess-1", task: "T-001" },
      flags: { json: true },
      passthrough: [],
    });
    assert.equal(code, 0);
    const content = await readFile(runsPath(root, "sess-1"), "utf8");
    assert.match(content, /# Handoff — sess-1/);
  } finally {
    await cleanup(root);
  }
});
