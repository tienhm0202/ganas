import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { ganasPath, STATE_FILE } from "./graph/paths.js";

/**
 * Trạng thái phiên. Không commit (đã có trong .gitignore) — đây là thứ thuộc về
 * một máy, một lúc.
 *
 * `sessions` là map chứ không phải một con trỏ duy nhất: nhiều phiên Claude Code
 * có thể chạy song song trên cùng repo, và Stop hook cần biết CHÍNH phiên đó
 * đang làm task nào.
 */
export interface SessionRecord {
  task: string;
  started_at: string;
  /**
   * Lần ghi file gần nhất của phiên này mà Stop hook CHƯA chấm.
   *
   * Có field này vì Stop hook chạy ở cuối MỌI lượt trả lời, kể cả lượt người
   * dùng chỉ hỏi một câu. Chấm exit_contract ở lượt đó là sai hai đường: nó
   * chặn một lượt không có gì để chặn, và nó chạy thật các lệnh trong
   * `exit_contract` (`npm test`, `tsc`…) cho một lượt không đụng tới code.
   *
   * Nên: đặt khi có ghi file, xoá ngay sau khi chấm. Vắng mặt ⇒ chưa làm gì
   * kể từ lần chấm trước ⇒ không có gì để chấm.
   */
  touched_at?: string;
  /**
   * Kết quả chấm `exit_contract` NGAY LÚC nhận task, theo `criterionKey`.
   *
   * Tiêu chí đã `true` ở đây mà lúc commit vẫn `true` thì nó không gác gì —
   * nó xanh từ trước khi có một dòng code nào. Vắng mặt ⇒ chưa đo (phiên khác,
   * hoặc chạy `ganas next --no-baseline`) ⇒ không kết luận gì.
   */
  baseline?: Record<string, boolean>;
}

export interface State {
  version: 1;
  /** Task được chọn gần nhất — dùng khi không biết session id. */
  current_task: string | null;
  sessions: Record<string, SessionRecord>;
}

const EMPTY: State = { version: 1, current_task: null, sessions: {} };

export async function readState(root: string): Promise<State> {
  const file = ganasPath(root, STATE_FILE);
  if (!existsSync(file)) return { ...EMPTY };
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<State>;
    return {
      version: 1,
      current_task: parsed.current_task ?? null,
      sessions: parsed.sessions ?? {},
    };
  } catch {
    // State hỏng không được làm sập phiên — coi như chưa có gì.
    return { ...EMPTY };
  }
}

/** Ghi nguyên tử: ghi file tạm rồi rename, tránh phiên khác đọc phải file dở. */
export async function writeState(root: string, state: State): Promise<void> {
  const file = ganasPath(root, STATE_FILE);
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  await rename(tmp, file);
}

/** Đọc–sửa–ghi. Đủ cho mức song song thực tế (vài phiên trên một máy). */
export async function updateState(root: string, mutate: (state: State) => void): Promise<State> {
  const state = await readState(root);
  mutate(state);
  await writeState(root, state);
  return state;
}

export async function bindSession(root: string, sessionId: string, taskId: string): Promise<void> {
  await updateState(root, (s) => {
    s.sessions[sessionId] = { task: taskId, started_at: new Date().toISOString() };
    s.current_task = taskId;
  });
}

export async function releaseSession(root: string, sessionId: string): Promise<void> {
  await updateState(root, (s) => {
    delete s.sessions[sessionId];
  });
}

/** Ghi baseline cho phiên. Phiên chưa bind thì không có gì để gắn vào. */
export async function setBaseline(
  root: string,
  sessionId: string,
  baseline: Record<string, boolean>,
): Promise<void> {
  await updateState(root, (s) => {
    const rec = s.sessions[sessionId];
    if (rec) rec.baseline = baseline;
  });
}

/** Baseline của ĐÚNG phiên này. Không rơi về phiên khác: baseline của việc khác thì vô nghĩa. */
export async function baselineFor(
  root: string,
  sessionId: string | undefined,
  taskId: string,
): Promise<Record<string, boolean> | undefined> {
  if (!sessionId) return undefined;
  const rec = (await readState(root)).sessions[sessionId];
  if (!rec || rec.task !== taskId) return undefined;
  return rec.baseline;
}

/** Task của một phiên; rơi về current_task khi không có session id. */
export async function taskForSession(root: string, sessionId?: string): Promise<string | null> {
  const state = await readState(root);
  if (sessionId && state.sessions[sessionId]) return state.sessions[sessionId].task;
  return state.current_task;
}

/**
 * Bản ghi của ĐÚNG phiên này, không rơi về `current_task`.
 *
 * `taskForSession` rơi về `current_task` để CLI/MCP — nơi không có session id —
 * vẫn biết đang làm gì. Với hook thì cú rơi đó là sai: một phiên mở lên chỉ để
 * hỏi (chưa bind, hoặc bind vào task khác) sẽ thừa hưởng task của phiên gần
 * nhất và bị chấm theo exit_contract của việc mà nó không hề làm.
 */
export async function sessionRecord(
  root: string,
  sessionId: string,
): Promise<SessionRecord | null> {
  const state = await readState(root);
  return state.sessions[sessionId] ?? null;
}

/** Đánh dấu phiên vừa ghi file. Không tạo bản ghi mới: phiên chưa bind thì không có gì để chấm. */
export async function markTouched(root: string, sessionId: string): Promise<void> {
  const state = await readState(root);
  const rec = state.sessions[sessionId];
  if (!rec || rec.touched_at) return; // đã có cờ rồi thì khỏi ghi lại đĩa mỗi lần Edit
  rec.touched_at = new Date().toISOString();
  await writeState(root, state);
}

/** Hạ cờ sau khi đã chấm — lượt hỏi đáp tiếp theo lại đi qua Stop hook mà không tốn gì. */
export async function clearTouched(root: string, sessionId: string): Promise<void> {
  await updateState(root, (s) => {
    delete s.sessions[sessionId]?.touched_at;
  });
}
