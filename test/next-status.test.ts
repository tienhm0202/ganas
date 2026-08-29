import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { run as runNext } from "../src/commands/next.js";
import { parseArgs } from "../src/util/args.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

/**
 * `status: in_progress` là enum CHẾT trước T-061: `select.ts` cho nó ưu tiên
 * -1000 và `brief.ts` in "việc đang dở", nhưng không dòng code nào GHI giá trị
 * đó. Test này khoá cả hai vế của việc làm nó sống: file YAML (thứ ĐI VÀO GIT)
 * phải đổi, và `ganas next` phải từ chối mở luồng thứ hai khi luồng cũ còn dở.
 *
 * Kiểm FILE, không kiểm `state.json`: state.json là LOCAL_ONLY (paths.ts), nên
 * máy thứ hai và clone mới không thấy gì trong đó.
 */

const TASK_COMMENT = "# chú thích phải sống sót qua lần ghi status";

function twoTasks(): Record<string, string> {
  return {
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": `${TASK_COMMENT}\n${task("T-001")}`,
    ".ganas/tasks/T-002.yaml": task("T-002"),
  };
}

async function callNext(
  root: string,
  extra: string[] = [],
): Promise<{ code: number; out: string }> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: unknown }).write = (c: string | Uint8Array): boolean => {
    chunks.push(typeof c === "string" ? c : Buffer.from(c).toString("utf8"));
    return true;
  };
  try {
    const code = await runNext(parseArgs(["--root", root, "--no-volatile", ...extra]));
    return { code, out: chunks.join("") };
  } finally {
    (process.stdout as { write: unknown }).write = original;
  }
}

/**
 * Mỗi test một session id RIÊNG — cố ý, không phải cho đẹp.
 *
 * `readState` (src/state.ts) trả `{ ...EMPTY }` khi chưa có `state.json`, mà
 * bản sao nông đó DÙNG CHUNG đúng object `EMPTY.sessions`. Ghi vào nó là ghi
 * vào hằng số của module, nên một test dùng lại `sess-1` sẽ thấy binding mà
 * test trước để lại, trên một dự án tạm hoàn toàn khác.
 */
async function taskFile(root: string, id: string): Promise<string> {
  return readFile(join(root, ".ganas", "tasks", `${id}.yaml`), "utf8");
}

test("⭐ `ganas next` ghi `status: in_progress` vào chính FILE YAML của task", async () => {
  const root = await makeProject(twoTasks());
  try {
    const { code, out } = await callNext(root, ["--session", "sess-mark"]);
    assert.equal(code, 0, `next thất bại:\n${out}`);

    const yaml = await taskFile(root, "T-001");
    assert.match(
      yaml,
      /^status: in_progress$/m,
      `file task phải mang status: in_progress (state.json là LOCAL_ONLY, không đủ):\n${yaml}`,
    );
    assert.ok(
      yaml.includes(TASK_COMMENT),
      `ghi status không được xoá chú thích trong file:\n${yaml}`,
    );
    assert.match(await taskFile(root, "T-002"), /^status: todo$/m, "chỉ task được chọn mới đổi");
  } finally {
    await cleanup(root);
  }
});

test("⭐ `ganas next` từ chối nhảy sang task khác khi task đang bind chưa done", async () => {
  const root = await makeProject(twoTasks());
  try {
    assert.equal((await callNext(root, ["--session", "sess-refuse"])).code, 0);

    const { code, out } = await callNext(root, ["--session", "sess-refuse"]);
    assert.equal(code, 1, `phải thoát khác 0 khi luồng cũ còn dở:\n${out}`);
    assert.match(out, /T-001/, "phải in task đang dở");
    assert.match(out, /--switch/, "phải chỉ đường thoát ra");
    assert.match(out, /✓|✗|…/, "phải kèm kết quả gate của task đang dở");

    assert.match(
      await taskFile(root, "T-002"),
      /^status: todo$/m,
      "bị từ chối thì không được bind sang task khác",
    );
  } finally {
    await cleanup(root);
  }
});

test("⭐ `--switch` mở được task khác, task cũ vẫn giữ dấu việc dở", async () => {
  const root = await makeProject(twoTasks());
  try {
    assert.equal((await callNext(root, ["--session", "sess-switch"])).code, 0);

    const { code, out } = await callNext(root, ["--session", "sess-switch", "--switch"]);
    assert.equal(code, 0, `--switch phải cho qua:\n${out}`);
    assert.match(out, /T-002/, "phải chuyển sang task khác, không trả lại task cũ");

    assert.match(await taskFile(root, "T-002"), /^status: in_progress$/m);
    assert.match(
      await taskFile(root, "T-001"),
      /^status: in_progress$/m,
      "bỏ dở không phải là chưa bắt đầu — dấu việc dở phải ở lại",
    );
  } finally {
    await cleanup(root);
  }
});
