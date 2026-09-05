import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import * as handlers from "../src/hooks/io/handlers.js";
import { haltAutoLoop } from "../src/state.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

/**
 * T-001 với `exit_contract` TỰ VIẾT TRỌN VẸN — không dùng `task({ extra })`
 * cho việc này, vì template của `task()` (`test/helpers.ts`) đã hardcode sẵn
 * MỘT khối `exit_contract:`; nối thêm một khối `exit_contract:` khác qua
 * `extra` sinh YAML có khoá trùng (đè ngầm, không lỗi rõ ràng) — đúng cạm bẫy
 * `hooks.test.ts` né bằng cách viết `FAILING_TASK` dạng YAML đầy đủ.
 */
function taskWithExitContract(id: string, exitContractYaml: string): string {
  return `id: ${id}
title: "Task thử"
serves:
  - G-001
implements: D-001
scope: P-thu
status: todo
${exitContractYaml}`;
}

/**
 * Dự án đủ để hook auto-loop chạy: một chặng (`D-001`) với HAI task —
 * `T-001` (task đang làm, exit_contract điều khiển được) và `T-002` (task
 * khác CÙNG chặng, còn `todo`) — để mô phỏng "chặng còn việc". `oneTaskOnly`
 * bỏ `T-002` để mô phỏng "hết task cùng chặng".
 */
async function project(opts: {
  autoLoop?: string; // đoạn YAML `auto_loop:` chèn vào config, rỗng = mặc định (tắt)
  oneTaskOnly?: boolean;
  exitContract?: string; // đè `exit_contract` của T-001 — YAML TRỌN VẸN (xem taskWithExitContract)
} = {}): Promise<string> {
  const files: Record<string, string> = {
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": opts.exitContract
      ? taskWithExitContract("T-001", opts.exitContract)
      : task("T-001", { extra: "" }),
  };
  if (!opts.oneTaskOnly) {
    files[".ganas/tasks/T-002.yaml"] = task("T-002", { extra: "" });
  }
  const root = await makeProject(files);

  const config = `version: 1
project: "test"
enforcement: enforce
${opts.autoLoop ?? ""}`;
  await writeFile(join(root, ".ganas", "config.yaml"), config, "utf8");
  return root;
}

const ENABLED = `auto_loop:
  enabled: true
  max_iterations: 3
`;

const ENABLED_MAX_1 = `auto_loop:
  enabled: true
  max_iterations: 1
`;

const FAILING_EXIT = `exit_contract:
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

/* --- 1. enabled: false ⇒ y hệt hôm nay ------------------------------------ */

test("auto_loop tắt (mặc định) — Stop cho qua y hệt hành vi trước T-091, dù chặng còn việc", async () => {
  const root = await project();
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);
    const out = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.deepEqual(out, {}, "enabled:false phải trả ALLOW nguyên vẹn, không thêm systemMessage/decision nào");
  } finally {
    await cleanup(root);
  }
});

/* --- 2. bật + gate xanh + còn task cùng chặng ⇒ block, đếm tăng ----------- */

test("auto_loop bật, gate xanh, chặng còn việc ⇒ block với lệnh commit+next, đếm vòng tăng dần", async () => {
  const root = await project({ autoLoop: ENABLED });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);
    const first = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.equal(first.decision, "block");
    assert.match(first.reason!, /ganas commit T-001/);
    assert.match(first.reason!, /ganas next --session s1/);
    assert.match(first.reason!, /vòng 1\/3/);

    await touch(root);
    const second = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.equal(second.decision, "block");
    assert.match(second.reason!, /vòng 2\/3/, "đếm phải cộng dồn qua nhiều lượt, không reset");
  } finally {
    await cleanup(root);
  }
});

/* --- 3. chạm trần max_iterations ⇒ ALLOW ---------------------------------- */

test("auto_loop chạm trần max_iterations ⇒ ALLOW kèm lý do, không block nữa", async () => {
  const root = await project({ autoLoop: ENABLED_MAX_1 });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);
    const first = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.equal(first.decision, "block", "vòng đầu tiên (0 < 1) vẫn còn hạn mức");

    await touch(root);
    const second = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.equal(second.decision, undefined, "chạm trần thì phải ALLOW, không được block nữa");
    assert.match(second.systemMessage!, /trần/);
  } finally {
    await cleanup(root);
  }
});

/* --- 4. cờ halt ⇒ ALLOW ---------------------------------------------------- */

test("auto_loop đã bị halt (subagentStop báo CHẶN:) ⇒ ALLOW kèm lý do", async () => {
  const root = await project({ autoLoop: ENABLED });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);
    await haltAutoLoop(root, "s1");
    const out = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.equal(out.decision, undefined, "đã halt thì không được block nữa");
    assert.match(out.systemMessage!, /CHẶN|halt|dừng/i);
  } finally {
    await cleanup(root);
  }
});

/* --- 5. hết task chưa done cùng chặng ⇒ ALLOW ------------------------------ */

test("auto_loop bật nhưng chặng hết việc (không còn task todo khác) ⇒ ALLOW", async () => {
  const root = await project({ autoLoop: ENABLED, oneTaskOnly: true });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);
    const out = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.equal(out.decision, undefined, "hết task cùng chặng thì loop phải dừng, không tự mồi vô hạn");
    assert.match(out.systemMessage!, /hết task/);
  } finally {
    await cleanup(root);
  }
});

test("task còn lại cùng chặng nhưng bị blocked_by chặn ⇒ coi như hết việc, ALLOW", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task("T-001", { extra: "" }),
    ".ganas/tasks/T-002.yaml": task("T-002", { extra: "blocked_by:\n  - T-003\n" }),
    ".ganas/tasks/T-003.yaml": task("T-003", { extra: "" }),
  });
  try {
    await writeFile(
      join(root, ".ganas", "config.yaml"),
      `version: 1\nproject: "test"\nenforcement: enforce\n${ENABLED}`,
      "utf8",
    );
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);
    const out = await handlers.stop({ cwd: root, session_id: "s1" });
    // T-003 (chưa done, không blocker) vẫn còn việc thật — loop phải tiếp tục.
    assert.equal(out.decision, "block", "T-003 chưa done và không bị chặn — chặng vẫn còn việc");
  } finally {
    await cleanup(root);
  }
});

/* --- 6. stop_hook_active true ⇒ ALLOW vô điều kiện ------------------------- */

test("stop_hook_active true ⇒ ALLOW vô điều kiện, kể cả khi auto_loop bật và gate xanh", async () => {
  const root = await project({ autoLoop: ENABLED });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);
    const out = await handlers.stop({ cwd: root, session_id: "s1", stop_hook_active: true });
    assert.deepEqual(out, {}, "stop_hook_active là phanh ngoài cùng, auto-loop không được nới nó");
  } finally {
    await cleanup(root);
  }
});

/* --- 7. pendingHuman khác rỗng ⇒ ALLOW ------------------------------------- */

test("còn tiêu chí manual chờ người ⇒ auto-loop không can thiệp, ALLOW như trước T-091", async () => {
  const root = await project({
    autoLoop: ENABLED,
    exitContract: `exit_contract:\n  - kind: command\n    run: "true"\n  - kind: manual\n    check: "Người xác nhận"\n`,
  });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);
    const out = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.equal(out.decision, undefined, "pendingHuman khác rỗng tuyệt đối không được auto-loop nới");
    assert.match(out.systemMessage!, /Người xác nhận/);
  } finally {
    await cleanup(root);
  }
});

/* --- bổ sung: task đỏ hai lượt liên tiếp (điều kiện dừng #2) --------------- */

test("auto_loop bật, task đỏ hai lượt liên tiếp không tiến triển ⇒ ALLOW, không block mãi", async () => {
  const root = await project({ autoLoop: ENABLED, exitContract: FAILING_EXIT });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);
    const first = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.equal(first.decision, "block", "lượt đỏ đầu tiên vẫn chặn bình thường");

    await touch(root);
    const second = await handlers.stop({ cwd: root, session_id: "s1" });
    assert.equal(second.decision, undefined, "đỏ hai lượt liên tiếp cùng task thì loop phải nhả ra");
    assert.match(second.systemMessage!, /đỏ/);
  } finally {
    await cleanup(root);
  }
});

test("auto_loop tắt: task đỏ nhiều lượt liên tiếp vẫn cứ block y hệt hôm nay", async () => {
  const root = await project({ exitContract: FAILING_EXIT });
  try {
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    await touch(root);
    assert.equal((await handlers.stop({ cwd: root, session_id: "s1" })).decision, "block");
    await touch(root);
    assert.equal(
      (await handlers.stop({ cwd: root, session_id: "s1" })).decision,
      "block",
      "không có auto_loop thì không có trần đỏ-liên-tiếp nào cả",
    );
  } finally {
    await cleanup(root);
  }
});
