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

/** Task của một phiên; rơi về current_task khi không có session id. */
export async function taskForSession(root: string, sessionId?: string): Promise<string | null> {
  const state = await readState(root);
  if (sessionId && state.sessions[sessionId]) return state.sessions[sessionId].task;
  return state.current_task;
}
