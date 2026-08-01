import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { evaluateGate } from "../src/gate.js";
import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import * as handlers from "../src/hooks/handlers.js";
import { renderBrief } from "../src/render/brief.js";
import { moduleTargets, runTarget } from "../src/verify/run.js";
import { cleanup, design, goal, makeProject, sprint, task } from "./helpers.js";

/** Dự án đủ để hook chạy: spine hợp lệ + exit_contract mà ta điều khiển được. */
async function project(over: Record<string, string> = {}, config?: string): Promise<string> {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/sprints/S-2026-08.yaml": sprint(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task("T-001", {
      extra: "", // exit_contract mặc định là `true` ⇒ luôn đạt
    }),
    ...over,
  });
  if (config) await writeFile(join(root, ".ganas", "config.yaml"), config, "utf8");
  return root;
}

/* --- SessionStart --------------------------------------------------------- */

test("SessionStart bơm brief của task và đặt tên phiên", async () => {
  const root = await project();
  try {
    const out = await handlers.sessionStart({ cwd: root, session_id: "s1", source: "startup" });
    const h = out.hookSpecificOutput as Record<string, string>;
    assert.match(h["additionalContext"]!, /^# T-001 — /);
    assert.match(h["sessionTitle"]!, /^T-001 — /);
  } finally {
    await cleanup(root);
  }
});

test("SessionStart KHÔNG tự gửi câu mở đầu khi chưa bật auto_begin", async () => {
  const root = await project();
  try {
    const out = await handlers.sessionStart({ cwd: root, session_id: "s1", source: "startup" });
    const h = out.hookSpecificOutput as Record<string, unknown>;
    assert.equal("initialUserMessage" in h, false, "mặc định không được cướp lời người dùng");
  } finally {
    await cleanup(root);
  }
});

test("SessionStart gửi câu mở đầu khi bật auto_begin", async () => {
  const root = await project(
    {},
    `version: 1\nproject: "t"\nenforcement: enforce\nsession_start:\n  auto_begin: true\n`,
  );
  try {
    const out = await handlers.sessionStart({ cwd: root, session_id: "s1", source: "startup" });
    const h = out.hookSpecificOutput as Record<string, string>;
    assert.match(h["initialUserMessage"]!, /T-001/);
  } finally {
    await cleanup(root);
  }
});

test("dự án không dùng ganas thì hook im lặng đi tiếp", async () => {
  const out = await handlers.sessionStart({ cwd: "/tmp" });
  assert.deepEqual(out, {});
});

/* --- PostToolUse ---------------------------------------------------------- */

const BAD_CLAIM = `- id: C-001
  statement: "Hệ thống dùng Redis"
  provenance: session
`;

const GOOD_CLAIM = `- id: C-001
  statement: "Hệ thống dùng Redis"
  anchors: ["src/cache.ts#L10"]
  provenance: session
`;

function writeEvent(root: string, file: string) {
  return {
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: file },
  };
}

test("ghi claim không có bằng chứng bị chặn ở chế độ enforce", async () => {
  const root = await project({ ".ganas/claims/a.yaml": BAD_CLAIM });
  try {
    const out = await handlers.postToolUse(writeEvent(root, ".ganas/claims/a.yaml"));
    assert.equal(out.decision, "block");
    assert.match(out.reason!, /anchors/);
    assert.match(out.reason!, /open_questions/, "thông điệp phải nói rõ nên làm gì thay thế");
  } finally {
    await cleanup(root);
  }
});

test("cùng thao tác ở chế độ warn chỉ cảnh báo, không chặn", async () => {
  const root = await project(
    { ".ganas/claims/a.yaml": BAD_CLAIM },
    `version: 1\nproject: "t"\nenforcement: warn\n`,
  );
  try {
    const out = await handlers.postToolUse(writeEvent(root, ".ganas/claims/a.yaml"));
    assert.equal(out.decision, undefined, "chế độ warn không được chặn");
    assert.match(out.systemMessage!, /warn/);
    assert.match(out.systemMessage!, /anchors/);
  } finally {
    await cleanup(root);
  }
});

test("bật enforce riêng cho luật anchor trong khi mặc định là warn", async () => {
  const root = await project(
    { ".ganas/claims/a.yaml": BAD_CLAIM },
    `version: 1\nproject: "t"\nenforcement: warn\nenforcement_rules:\n  knowledge_anchor: enforce\n`,
  );
  try {
    const out = await handlers.postToolUse(writeEvent(root, ".ganas/claims/a.yaml"));
    assert.equal(out.decision, "block", "luật bật riêng phải thắng mức mặc định");
  } finally {
    await cleanup(root);
  }
});

test("claim có bằng chứng thì đi qua", async () => {
  const root = await project({ ".ganas/claims/a.yaml": GOOD_CLAIM });
  try {
    const out = await handlers.postToolUse(writeEvent(root, ".ganas/claims/a.yaml"));
    assert.deepEqual(out, {});
  } finally {
    await cleanup(root);
  }
});

test("file ngoài .ganas/ không bị đụng tới", async () => {
  const root = await project({ ".ganas/claims/a.yaml": BAD_CLAIM });
  try {
    const out = await handlers.postToolUse(writeEvent(root, "src/index.ts"));
    assert.deepEqual(out, {}, "ganas chỉ gác kho tri thức, không gác code");
  } finally {
    await cleanup(root);
  }
});

test("lỗi sẵn có ở file KHÁC không làm Claude bị chặn khi ghi file này", async () => {
  const root = await project({
    ".ganas/claims/a.yaml": GOOD_CLAIM,
    ".ganas/claims/co-san-loi.yaml": BAD_CLAIM.replace("C-001", "C-002"),
  });
  try {
    const out = await handlers.postToolUse(writeEvent(root, ".ganas/claims/a.yaml"));
    assert.deepEqual(
      out,
      {},
      "bắt chịu trách nhiệm cho lỗi có sẵn trong repo thì không ghi xong được file nào",
    );
  } finally {
    await cleanup(root);
  }
});

/* --- Stop ----------------------------------------------------------------- */

const FAILING_TASK = `id: T-001
title: "Task chưa xong"
serves:
  - G-001
implements: D-001
sprint: S-2026-08
status: todo
exit_contract:
  - kind: command
    run: "exit 1"
`;

test("Stop chặn khi exit_contract chưa thoả", async () => {
  const root = await project({ ".ganas/tasks/T-001.yaml": FAILING_TASK });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    const out = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.equal(out.decision, "block");
    assert.match(out.reason!, /chưa thoả điều kiện hoàn thành/);
  } finally {
    await cleanup(root);
  }
});

test("Stop KHÔNG chặn lần hai — stop_hook_active chống nhốt người dùng", async () => {
  const root = await project({ ".ganas/tasks/T-001.yaml": FAILING_TASK });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    const out = await handlers.stop({ cwd: root, session_id: "s1", stop_hook_active: true });
    assert.deepEqual(out, {}, "chặn liên tục sẽ khiến người dùng không thoát ra được");
  } finally {
    await cleanup(root);
  }
});

test("Stop cho qua khi mọi tiêu chí tự động đã đạt", async () => {
  const root = await project();
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    const out = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.equal(out.decision, undefined);
  } finally {
    await cleanup(root);
  }
});

test("tiêu chí cần người không chặn phiên, nhưng được nói ra", async () => {
  const root = await project({
    ".ganas/tasks/T-001.yaml": `id: T-001
title: "Task chờ người duyệt"
serves:
  - G-001
implements: D-001
sprint: S-2026-08
status: todo
exit_contract:
  - kind: command
    run: "true"
  - kind: manual
    check: "Kế toán trưởng xác nhận"
`,
  });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    const out = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.equal(
      out.decision,
      undefined,
      "tiêu chí thủ công mà chặn Stop thì phiên không kết thúc được",
    );
    assert.match(out.systemMessage!, /Kế toán trưởng/);
  } finally {
    await cleanup(root);
  }
});

/* --- Gate: tiêu chí artifact và handoff ----------------------------------- */

test("gate chấm được tiêu chí artifact có must_contain", async () => {
  const root = await project({
    ".ganas/tasks/T-001.yaml": `id: T-001
title: "t"
serves: [G-001]
implements: D-001
sprint: S-2026-08
exit_contract:
  - kind: artifact
    path: .ganas/facts/accounting.yaml
    must_contain: "F-ACC-013"
`,
  });
  try {
    const graph = await loadGraph(root);
    const t = graph.tasks.get("T-001")!.value;
    const freshness = await computeFreshness(graph);

    let result = await evaluateGate(graph, t, freshness);
    assert.equal(result.ok, false);
    assert.match(result.unmet[0]!.reason!, /chưa tồn tại/);

    await mkdir(join(root, ".ganas", "facts"), { recursive: true });
    await writeFile(join(root, ".ganas", "facts", "accounting.yaml"), "- id: F-ACC-001\n", "utf8");
    result = await evaluateGate(graph, t, freshness);
    assert.match(result.unmet[0]!.reason!, /chưa chứa/);

    await writeFile(join(root, ".ganas", "facts", "accounting.yaml"), "- id: F-ACC-013\n", "utf8");
    result = await evaluateGate(graph, t, freshness);
    assert.equal(result.ok, true);
  } finally {
    await cleanup(root);
  }
});

/* --- Gate: tiêu chí verification ------------------------------------------- */

test("gate: tiêu chí verification — chưa chạy thì fail, verify xong thì pass", async () => {
  const root = await project({
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
sprint: S-2026-08
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

    let graph = await loadGraph(root);
    let freshness = await computeFreshness(graph);
    let result = await evaluateGate(graph, graph.tasks.get("T-001")!.value, freshness);
    assert.equal(result.ok, false);
    assert.match(result.unmet[0]!.reason!, /chưa chạy lần nào/);

    await runTarget(moduleTargets(graph.modules.get("M-a")!)[0]!, { root, by: "test" });

    graph = await loadGraph(root);
    freshness = await computeFreshness(graph);
    result = await evaluateGate(graph, graph.tasks.get("T-001")!.value, freshness);
    assert.equal(result.ok, true, JSON.stringify(result.unmet, null, 2));
  } finally {
    await cleanup(root);
  }
});

test("gate: tiêu chí verification trỏ target không tồn tại → fail rõ ràng", async () => {
  const root = await project({
    ".ganas/tasks/T-001.yaml": `id: T-001
title: "t"
serves: [G-001]
implements: D-001
sprint: S-2026-08
exit_contract:
  - kind: verification
    target: M-khong-co/V-x
`,
  });
  try {
    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const result = await evaluateGate(graph, graph.tasks.get("T-001")!.value, freshness);
    assert.equal(result.ok, false);
    assert.match(result.unmet[0]!.reason!, /không tìm thấy/);
  } finally {
    await cleanup(root);
  }
});

/* --- Brief deterministic -------------------------------------------------- */

test("brief không kèm phần biến động thì lặp lại y hệt", async () => {
  const root = await project();
  try {
    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const t = graph.tasks.get("T-001")!;
    const a = renderBrief({ graph, task: t, freshness });
    await new Promise((r) => setTimeout(r, 20));
    const b = renderBrief({ graph, task: t, freshness });
    assert.equal(a, b, "brief phải xác định được — nếu không, prompt cache miss mọi phiên");
    // Không được có dấu thời gian đầy đủ (giờ:phút:giây) trong phần ổn định.
    // Ngày trần thì được — chúng đến từ dữ liệu (ID sprint, ngày verify), không
    // đổi theo lúc chạy.
    assert.equal(
      /\d{2}:\d{2}:\d{2}/.test(a),
      false,
      "phần ổn định không được chứa mốc thời gian theo lúc chạy",
    );
  } finally {
    await cleanup(root);
  }
});

test("phần biến động nếu có thì nằm ở CUỐI brief", async () => {
  const root = await project();
  try {
    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const t = graph.tasks.get("T-001")!;
    const plain = renderBrief({ graph, task: t, freshness });
    const withTail = renderBrief({ graph, task: t, freshness, volatile: "MOC-THOI-GIAN" });
    assert.ok(
      withTail.startsWith(plain),
      "phần ổn định phải là tiền tố — đó là điều kiện để prompt cache dùng lại được",
    );
    assert.ok(withTail.endsWith("MOC-THOI-GIAN"));
  } finally {
    await cleanup(root);
  }
});
