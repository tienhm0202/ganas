import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import * as handlers from "../src/hooks/io/handlers.js";
import { notePath } from "../src/prune.js";
import { REPORT_SECTIONS } from "../src/render/brief.js";
import { autoLoopHaltedFor, bindSession } from "../src/state.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

/**
 * Đây là tiêu chí nghiệm thu của G-003 (xem `.ganas/goals/G-003.yaml`): file
 * này phải ĐO THẬT hành vi của `subagentStop`, không phải diễn lại lời khai
 * của task. Ba mục "Lệch so với đặc tả" / "Quyết định tự ý" / "Phát hiện /
 * nghi ngờ" dùng nguyên `REPORT_SECTIONS` — không chép tay ba chuỗi ở đây,
 * vì đó đúng là chỗ hai bản danh sách lệch nhau âm thầm mà task T-089 dặn
 * tránh.
 */

const REPORT_OK = `Đã sửa xong hàm X.

## ${REPORT_SECTIONS[0]}
Không có gì lệch so với đặc tả.

## ${REPORT_SECTIONS[1]}
Không có quyết định tự ý nào.

## ${REPORT_SECTIONS[2]}
(không có)

Kết luận: XONG
`;

const REPORT_MISSING = `Đã sửa xong hàm X.

## ${REPORT_SECTIONS[0]}
Không có gì lệch.

Kết luận: XONG
`;

const REPORT_HALT = `Không làm được vì thiếu quyền ghi.

## ${REPORT_SECTIONS[0]}
Không có gì lệch.

## ${REPORT_SECTIONS[1]}
Không có.

## ${REPORT_SECTIONS[2]}
(không có)

Kết luận: CHẶN: thiếu quyền ghi vào src/foo.ts
`;

async function project(config?: string): Promise<string> {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task("T-001"),
  });
  if (config) {
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await writeFile(join(root, ".ganas", "config.yaml"), config, "utf8");
  }
  return root;
}

const ENFORCE_CONFIG = `version: 1\nproject: "t"\nenforcement: enforce\n`;
const WARN_CONFIG =
  `version: 1\nproject: "t"\nenforcement: enforce\n` +
  `enforcement_rules:\n  subagent_report: warn\n`;

test("dự án không dùng ganas ⇒ ALLOW", async () => {
  const out = await handlers.subagentStop({ cwd: "/tmp", agent_id: "a1" });
  assert.deepEqual(out, {});
});

test("agent_id vắng ⇒ ALLOW, không ghi note", async () => {
  const root = await project(ENFORCE_CONFIG);
  try {
    const out = await handlers.subagentStop({
      cwd: root,
      session_id: "s1",
      last_assistant_message: REPORT_OK,
    });
    assert.deepEqual(out, {});
  } finally {
    await cleanup(root);
  }
});

test("đủ ba tiêu đề ⇒ ALLOW, và báo cáo vẫn được ghi ra runs/notes/", async () => {
  const root = await project(ENFORCE_CONFIG);
  try {
    await bindSession(root, "s1", "T-001");
    const out = await handlers.subagentStop({
      cwd: root,
      session_id: "s1",
      agent_id: "sub-1",
      agent_type: "general-purpose",
      last_assistant_message: REPORT_OK,
    });
    assert.deepEqual(out, {}, "đủ tiêu đề thì không có gì để nói với người dùng");

    const note = await readFile(notePath(root, "s1"), "utf8");
    assert.match(note, /agent_type.*general-purpose/);
    assert.match(note, /agent_id.*sub-1/);
    assert.match(note, /task.*T-001/);
    assert.match(note, new RegExp(REPORT_SECTIONS[0]));
  } finally {
    await cleanup(root);
  }
});

test("thiếu tiêu đề ⇒ block khi enforcement: enforce", async () => {
  const root = await project(ENFORCE_CONFIG);
  try {
    await bindSession(root, "s1", "T-001");
    const out = await handlers.subagentStop({
      cwd: root,
      session_id: "s1",
      agent_id: "sub-1",
      last_assistant_message: REPORT_MISSING,
    });
    assert.equal(out.decision, "block");
    assert.match(out.reason!, new RegExp(REPORT_SECTIONS[1]));
    assert.match(out.reason!, new RegExp(REPORT_SECTIONS[2]));
  } finally {
    await cleanup(root);
  }
});

test("thiếu tiêu đề ⇒ chỉ systemMessage khi enforcement: warn, không chặn", async () => {
  const root = await project(WARN_CONFIG);
  try {
    await bindSession(root, "s1", "T-001");
    const out = await handlers.subagentStop({
      cwd: root,
      session_id: "s1",
      agent_id: "sub-1",
      last_assistant_message: REPORT_MISSING,
    });
    assert.equal(out.decision, undefined);
    assert.match(out.systemMessage!, /chế độ warn/);
  } finally {
    await cleanup(root);
  }
});

test("báo cáo thiếu tiêu đề vẫn được ghi ra runs/notes/ dù bị chặn", async () => {
  const root = await project(ENFORCE_CONFIG);
  try {
    await bindSession(root, "s1", "T-001");
    const out = await handlers.subagentStop({
      cwd: root,
      session_id: "s1",
      agent_id: "sub-1",
      last_assistant_message: REPORT_MISSING,
    });
    assert.equal(out.decision, "block");

    const note = await readFile(notePath(root, "s1"), "utf8");
    assert.match(note, /Không có gì lệch\./, "nội dung báo cáo (dù thiếu tiêu đề) vẫn phải nằm trong note");
  } finally {
    await cleanup(root);
  }
});

test("chặn ĐÚNG MỘT LẦN cho cùng agent_id — lần hai không bị đòi lại", async () => {
  const root = await project(ENFORCE_CONFIG);
  try {
    await bindSession(root, "s1", "T-001");
    const first = await handlers.subagentStop({
      cwd: root,
      session_id: "s1",
      agent_id: "sub-1",
      last_assistant_message: REPORT_MISSING,
    });
    assert.equal(first.decision, "block", "lần đầu phải bị đòi báo cáo");

    const second = await handlers.subagentStop({
      cwd: root,
      session_id: "s1",
      agent_id: "sub-1",
      last_assistant_message: REPORT_MISSING,
    });
    assert.deepEqual(second, {}, "cùng agent_id, đã đòi một lần rồi thì không đòi lại");
  } finally {
    await cleanup(root);
  }
});

test("agent_id KHÁC vẫn bị đòi báo cáo dù cùng phiên/task", async () => {
  const root = await project(ENFORCE_CONFIG);
  try {
    await bindSession(root, "s1", "T-001");
    await handlers.subagentStop({
      cwd: root,
      session_id: "s1",
      agent_id: "sub-1",
      last_assistant_message: REPORT_MISSING,
    });
    const other = await handlers.subagentStop({
      cwd: root,
      session_id: "s1",
      agent_id: "sub-2",
      last_assistant_message: REPORT_MISSING,
    });
    assert.equal(other.decision, "block");
  } finally {
    await cleanup(root);
  }
});

test('báo cáo tự khai "CHẶN:" ⇒ không chặn, dừng auto-loop và báo systemMessage', async () => {
  const root = await project(ENFORCE_CONFIG);
  try {
    await bindSession(root, "s1", "T-001");
    const out = await handlers.subagentStop({
      cwd: root,
      session_id: "s1",
      agent_id: "sub-1",
      last_assistant_message: REPORT_HALT,
    });
    assert.equal(out.decision, undefined, '"CHẶN:" không phải lỗi định dạng — không được biến thành block');
    assert.match(out.systemMessage!, /CHẶN/);
    assert.equal(await autoLoopHaltedFor(root, "s1"), true);
  } finally {
    await cleanup(root);
  }
});

test("báo cáo dài bị cắt ở runs/notes/, kèm số dòng đã bỏ", async () => {
  const root = await project(ENFORCE_CONFIG);
  try {
    await bindSession(root, "s1", "T-001");
    const longTail = Array.from({ length: 500 }, (_, i) => `dòng thừa số ${i}`).join("\n");
    const longReport = `${REPORT_OK}\n${longTail}`;
    await handlers.subagentStop({
      cwd: root,
      session_id: "s1",
      agent_id: "sub-1",
      last_assistant_message: longReport,
    });

    const note = await readFile(notePath(root, "s1"), "utf8");
    assert.match(note, /đã cắt bớt \d+ dòng còn lại/);
    assert.equal(note.includes("dòng thừa số 499"), false, "phần bị cắt không được xuất hiện trong note");
  } finally {
    await cleanup(root);
  }
});
