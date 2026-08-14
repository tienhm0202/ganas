import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { evaluateGate } from "../src/gate.js";
import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import * as handlers from "../src/hooks/handlers.js";
import { renderBrief } from "../src/render/brief.js";
import { markTouched, readState, TOUCHED_PATHS_CAP, touchedPathsFor } from "../src/state.js";
import { moduleTargets, runTarget } from "../src/verify/run.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

/** Dự án đủ để hook chạy: spine hợp lệ + exit_contract mà ta điều khiển được. */
async function project(over: Record<string, string> = {}, config?: string): Promise<string> {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
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
  scope: P-thu
  statement: "Hệ thống dùng Redis"
  provenance: session
`;

const GOOD_CLAIM = `- id: C-001
  scope: P-thu
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
scope: P-thu
status: todo
exit_contract:
  - kind: command
    run: "exit 1"
`;

/** Một lượt có sửa code — điều kiện để Stop hook chấm gate. */
function touch(root: string, session = "s1") {
  return handlers.postToolUse({
    cwd: root,
    session_id: session,
    tool_name: "Write",
    tool_input: { file_path: "src/index.ts" },
  });
}

test("Stop chặn khi exit_contract chưa thoả", async () => {
  const root = await project({ ".ganas/tasks/T-001.yaml": FAILING_TASK });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);
    const out = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.equal(out.decision, "block");
    assert.match(out.reason!, /chưa thoả điều kiện hoàn thành/);
  } finally {
    await cleanup(root);
  }
});

test("Stop im lặng ở lượt hỏi đáp — phiên chưa ghi file nào thì không có gì để chấm", async () => {
  const root = await project({ ".ganas/tasks/T-001.yaml": FAILING_TASK });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    const out = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.deepEqual(out, {}, "hỏi một câu mà bị chặn vì chưa sửa code là chặn sai");
  } finally {
    await cleanup(root);
  }
});

test("Stop chấm MỘT lần cho mỗi đợt sửa, không chấm lại ở lượt hỏi đáp kế tiếp", async () => {
  const root = await project({ ".ganas/tasks/T-001.yaml": FAILING_TASK });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);
    assert.equal((await handlers.stop({ cwd: root, session_id: "s1" })).decision, "block");

    // Lượt sau chỉ hỏi đáp: cờ đã hạ, không chấm nữa.
    assert.deepEqual(await handlers.stop({ cwd: root, session_id: "s1" }), {});

    // Sửa tiếp thì cờ dựng lại và gate lại có hiệu lực.
    await touch(root);
    assert.equal((await handlers.stop({ cwd: root, session_id: "s1" })).decision, "block");
  } finally {
    await cleanup(root);
  }
});

test("Stop bỏ qua phiên chưa bind — không mượn task của phiên khác qua current_task", async () => {
  const root = await project({ ".ganas/tasks/T-001.yaml": FAILING_TASK });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" }); // s1 bind T-001
    await touch(root, "s2");
    const out = await handlers.stop({ cwd: root, session_id: "s2" });
    assert.deepEqual(out, {}, "phiên mở ra để hỏi không chịu exit_contract của việc nó không làm");
  } finally {
    await cleanup(root);
  }
});

test("Stop chặn cả khi sửa file bằng Bash (`sed -i`), không chỉ Write/Edit", async () => {
  const root = await project({ ".ganas/tasks/T-001.yaml": FAILING_TASK });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await handlers.preToolUse({
      cwd: root,
      session_id: "s1",
      tool_name: "Bash",
      tool_input: { command: "sed -i 's/a/b/' src/index.ts" },
    });
    const out = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.equal(out.decision, "block", "sửa file qua shell vẫn là sửa file");
  } finally {
    await cleanup(root);
  }
});

test("sub-agent sửa code vẫn tính cho phiên cha — gate không im lặng biến mất", async () => {
  const root = await project({ ".ganas/tasks/T-001.yaml": FAILING_TASK });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    // Hook trong sub-agent nhận session_id của phiên cha kèm agent_id. Đây là
    // cách giao việc mà chính ganas khuyến nghị (brief mục "Giao việc"), nên nếu
    // chỗ này không tính thì gate tắt lặng lẽ ở đúng luồng chuẩn.
    await handlers.postToolUse({
      cwd: root,
      session_id: "s1",
      agent_id: "a1",
      agent_type: "general-purpose",
      tool_name: "Edit",
      tool_input: { file_path: "src/index.ts" },
    });
    const out = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.equal(out.decision, "block");
  } finally {
    await cleanup(root);
  }
});

test("Bash chỉ đọc không tính là đã làm việc", async () => {
  const root = await project({ ".ganas/tasks/T-001.yaml": FAILING_TASK });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await handlers.preToolUse({
      cwd: root,
      session_id: "s1",
      tool_name: "Bash",
      tool_input: { command: "git log --oneline | head -20" },
    });
    assert.deepEqual(await handlers.stop({ cwd: root, session_id: "s1" }), {});
  } finally {
    await cleanup(root);
  }
});

test("Stop KHÔNG chặn lần hai — stop_hook_active chống nhốt người dùng", async () => {
  const root = await project({ ".ganas/tasks/T-001.yaml": FAILING_TASK });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);
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
    await touch(root);
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
scope: P-thu
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
    await touch(root);
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
scope: P-thu
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
scope: P-thu
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
    // Ngày trần thì được — chúng đến từ dữ liệu (ID phạm vi, ngày verify), không
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

/* --- touched_paths: đường dẫn phiên đã sửa -------------------------------- */

async function pathsOf(root: string, session = "s1"): Promise<string[] | undefined> {
  return (await readState(root)).sessions[session]?.touched_paths;
}

test("postToolUse ghi đường dẫn tương đối gốc repo, khử trùng lặp", async () => {
  const root = await project();
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root); // src/index.ts
    await touch(root); // sửa lại đúng file đó
    assert.deepEqual(await pathsOf(root), ["src/index.ts"]);
  } finally {
    await cleanup(root);
  }
});

test("file ngoài cây repo không được ghi vào touched_paths", async () => {
  const root = await project();
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await handlers.postToolUse({
      cwd: root,
      session_id: "s1",
      tool_name: "Write",
      tool_input: { file_path: "/etc/hosts" },
    });
    const rec = (await readState(root)).sessions["s1"];
    assert.ok(rec?.touched_at, "vẫn phải tính là đã làm việc");
    assert.deepEqual(rec?.touched_paths, undefined, "đường dẫn ngoài cây repo không đối chiếu được");
  } finally {
    await cleanup(root);
  }
});

test("sửa qua Bash dựng cờ nhưng KHÔNG góp đường dẫn — giới hạn đã biết", async () => {
  const root = await project();
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await handlers.preToolUse({
      cwd: root,
      session_id: "s1",
      tool_name: "Bash",
      tool_input: { command: "sed -i 's/a/b/' src/index.ts" },
    });
    const rec = (await readState(root)).sessions["s1"];
    assert.ok(rec?.touched_at, "sửa qua shell vẫn là sửa file");
    assert.deepEqual(rec?.touched_paths, undefined, "ganas không parse shell để đoán đường dẫn");
  } finally {
    await cleanup(root);
  }
});

test("⭐ Stop hạ touched_at nhưng GIỮ touched_paths", async () => {
  const root = await project();
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);
    await handlers.stop({ cwd: root, session_id: "s1" });

    const rec = (await readState(root)).sessions["s1"];
    assert.equal(rec?.touched_at, undefined, "cờ của MỘT lượt phải hạ sau khi chấm");
    assert.deepEqual(
      rec?.touched_paths,
      ["src/index.ts"],
      "danh sách là của CẢ task: xoá theo lượt thì nó rỗng đúng lúc có người chạy `ganas gate`",
    );
  } finally {
    await cleanup(root);
  }
});

test("bind lại phiên vào task thì touched_paths trở về rỗng", async () => {
  const root = await project();
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);
    assert.deepEqual(await pathsOf(root), ["src/index.ts"]);

    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    assert.deepEqual(await pathsOf(root), undefined, "bindSession thay cả bản ghi — như baseline");
  } finally {
    await cleanup(root);
  }
});

test("touched_paths có trần: đầy thì giữ phần cũ, bỏ đường dẫn mới", async () => {
  const root = await project();
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    for (let i = 0; i < TOUCHED_PATHS_CAP + 5; i++) {
      await markTouched(root, "s1", `src/f${i}.ts`);
    }
    const paths = (await pathsOf(root))!;
    assert.equal(paths.length, TOUCHED_PATHS_CAP);
    assert.equal(paths[0], "src/f0.ts", "giữ đoạn đi lạc SỚM nhất, không phải FIFO");
    assert.ok(!paths.includes(`src/f${TOUCHED_PATHS_CAP + 4}.ts`));
  } finally {
    await cleanup(root);
  }
});

test("touchedPathsFor chỉ trả khi phiên còn bind đúng task đó", async () => {
  const root = await project();
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);

    assert.deepEqual(await touchedPathsFor(root, "s1", "T-001"), ["src/index.ts"]);
    assert.deepEqual(await touchedPathsFor(root, "s1", "T-999"), [], "task khác thì vô nghĩa");
    assert.deepEqual(await touchedPathsFor(root, undefined, "T-001"), []);
    assert.deepEqual(await touchedPathsFor(root, "s2", "T-001"), [], "không rơi về current_task");
  } finally {
    await cleanup(root);
  }
});

/* --- gate: cảnh báo ranh giới code ----------------------------------------- */

/** Task có `touches: [M-a]` — ranh giới code là `src/a/**`. */
const TASK_WITH_BOUNDARY = `id: T-001
title: "t"
serves: [G-001]
implements: D-001
scope: P-thu
status: todo
touches:
  - M-a
exit_contract:
  - kind: command
    run: "true"
`;

test("⭐ gate cảnh báo file NGOÀI ranh giới code nhưng không đổi mã thoát", async () => {
  const root = await project({ ".ganas/tasks/T-001.yaml": TASK_WITH_BOUNDARY });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await handlers.postToolUse({
      cwd: root,
      session_id: "s1",
      tool_name: "Write",
      tool_input: { file_path: "scripts/lac.sh" },
    });

    const out: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      out.push(String(chunk));
      return true;
    });
    let code: number;
    try {
      const gate = await import("../src/commands/gate.js");
      code = await gate.run({
        positional: ["T-001"],
        options: { root, session: "s1" },
        flags: {},
        passthrough: [],
      });
    } finally {
      process.stdout.write = write;
    }

    const text = out.join("");
    assert.match(text, /NGOÀI ranh giới code/);
    assert.match(text, /scripts\/lac\.sh/);
    assert.equal(code, 0, "cảnh báo ranh giới không được đổi mã thoát");
  } finally {
    await cleanup(root);
  }
});

test("gate im lặng khi file đã sửa nằm TRONG ranh giới code", async () => {
  const root = await project({ ".ganas/tasks/T-001.yaml": TASK_WITH_BOUNDARY });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await handlers.postToolUse({
      cwd: root,
      session_id: "s1",
      tool_name: "Write",
      tool_input: { file_path: "src/a/x.ts" },
    });

    const out: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      out.push(String(chunk));
      return true;
    });
    try {
      const gate = await import("../src/commands/gate.js");
      await gate.run({
        positional: ["T-001"],
        options: { root, session: "s1" },
        flags: {},
        passthrough: [],
      });
    } finally {
      process.stdout.write = write;
    }

    assert.doesNotMatch(out.join(""), /NGOÀI ranh giới code/);
  } finally {
    await cleanup(root);
  }
});

test("gate không có phiên thì không đoán bừa về ranh giới", async () => {
  const root = await project({ ".ganas/tasks/T-001.yaml": TASK_WITH_BOUNDARY });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await handlers.postToolUse({
      cwd: root,
      session_id: "s1",
      tool_name: "Write",
      tool_input: { file_path: "scripts/lac.sh" },
    });

    const out: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      out.push(String(chunk));
      return true;
    });
    try {
      const gate = await import("../src/commands/gate.js");
      // Không truyền `session` ⇒ touchedPathsFor trả [] ⇒ không có gì để đối chiếu.
      await gate.run({ positional: ["T-001"], options: { root }, flags: {}, passthrough: [] });
    } finally {
      process.stdout.write = write;
    }

    assert.doesNotMatch(out.join(""), /NGOÀI ranh giới code/);
  } finally {
    await cleanup(root);
  }
});
