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
   * Đường dẫn (tương đối gốc repo, dấu `/`) mà phiên này đã ghi kể từ khi bind
   * vào task hiện tại.
   *
   * KHÁC `touched_at` về vòng đời, và khác có chủ ý: `touched_at` là cờ của MỘT
   * lượt — Stop hook hạ nó xuống ngay sau khi chấm. Còn danh sách này là của CẢ
   * task, vì câu hỏi nó phục vụ ("phiên có sửa ra ngoài ranh giới code của task
   * không") hỏi về toàn bộ việc đã làm, không phải về lượt cuối. Người ta chạy
   * `ganas gate` sau NHIỀU lượt có sửa; xoá theo lượt thì danh sách rỗng đúng
   * lúc có người nhìn. Nên `clearTouched` cố ý KHÔNG đụng tới nó.
   *
   * Vòng đời đúng — "còn bind vào task này" — đã sẵn miễn phí: `bindSession`
   * thay cả `SessionRecord`, `releaseSession` xoá hẳn. Y hệt `baseline`.
   *
   * Chỉ Write/Edit mới góp được vào đây: sửa qua Bash (`sed -i`, `>`) chỉ dựng
   * `touched_at` — xem `preToolUse`, ganas không parse shell để đoán đường dẫn.
   *
   * `.ganas/state.json` là file local, không commit (`LOCAL_ONLY` trong
   * graph/paths.ts). Nên clone mới, máy thứ hai, hay phiên mở trước khi có
   * field này đều KHÔNG có lịch sử ở đây, và mọi kiểm dựa vào nó sẽ im lặng.
   * VẮNG CẢNH BÁO KHÔNG PHẢI BẰNG CHỨNG ĐÃ Ở TRONG RANH GIỚI.
   */
  touched_paths?: string[];
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

/**
 * Trần số đường dẫn ghi lại cho một phiên — state.json là file trạng thái nhỏ,
 * không phải log.
 *
 * Đầy thì BỎ đường dẫn mới, giữ nguyên phần đã có — cố ý không phải FIFO: FIFO
 * vứt đi đúng đoạn đi lạc SỚM nhất, thứ đáng báo nhất. Và 200 file khác nhau
 * trong một task tự nó đã là tín hiệu, nên không cần thêm cờ "đã tràn": chỗ nào
 * cần biết thì so `length === TOUCHED_PATHS_CAP`.
 */
export const TOUCHED_PATHS_CAP = 200;

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

/**
 * Đường dẫn phiên này đã ghi, CHỈ khi nó còn đang bind vào đúng task đó.
 *
 * Không rơi về `current_task`, cùng lý do với `baselineFor`: file mà phiên khác
 * sửa cho việc khác đem ra chấm ranh giới của task này là kết luận sai.
 */
export async function touchedPathsFor(
  root: string,
  sessionId: string | undefined,
  taskId: string,
): Promise<string[]> {
  if (!sessionId) return [];
  const rec = (await readState(root)).sessions[sessionId];
  if (!rec || rec.task !== taskId) return [];
  return rec.touched_paths ?? [];
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

/**
 * Đánh dấu phiên vừa ghi file. Không tạo bản ghi mới: phiên chưa bind thì không
 * có gì để chấm.
 *
 * `relPath` là tuỳ chọn vì không phải lượt ghi nào cũng cho biết đường dẫn:
 * NotebookEdit gửi `notebook_path`, còn Bash thì chỉ có chuỗi lệnh thô. Những
 * lượt đó vẫn PHẢI dựng được `touched_at` — thiếu nó thì Stop hook hết phân
 * biệt được lượt sửa với lượt hỏi đáp.
 */
export async function markTouched(
  root: string,
  sessionId: string,
  relPath?: string,
): Promise<void> {
  const state = await readState(root);
  const rec = state.sessions[sessionId];
  if (!rec) return;

  // Hàm này chạy ở MỌI lần Edit, nên chỉ chạm đĩa khi thật sự có gì mới —
  // sửa đi sửa lại cùng một file không được biến thành một chuỗi ghi state.
  let dirty = false;

  if (!rec.touched_at) {
    rec.touched_at = new Date().toISOString();
    dirty = true;
  }

  if (relPath) {
    const list = (rec.touched_paths ??= []);
    if (!list.includes(relPath) && list.length < TOUCHED_PATHS_CAP) {
      list.push(relPath);
      dirty = true;
    }
  }

  if (!dirty) return;
  await writeState(root, state);
}

/**
 * Hạ cờ sau khi đã chấm — lượt hỏi đáp tiếp theo lại đi qua Stop hook mà không
 * tốn gì.
 *
 * Cố ý CHỈ hạ `touched_at`, không đụng `touched_paths`: hai thứ đó trả lời hai
 * câu hỏi khác nhau, ở hai nhịp khác nhau. Xem doc của `touched_paths`.
 */
export async function clearTouched(root: string, sessionId: string): Promise<void> {
  await updateState(root, (s) => {
    delete s.sessions[sessionId]?.touched_at;
  });
}
