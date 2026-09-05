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
   * Phiên này đã có lượt sửa nào đến từ sub-agent chưa, kể từ khi bind vào task
   * hiện tại.
   *
   * Phục vụ dòng tổng kết ở `ganas gate` (`formatDispatchWarning` trong
   * boundary.ts): "task khai tier rẻ mà cả phiên không hề giao việc". Khác
   * `touched_paths` ở chỗ đây là MỘT cờ tổng, không phải danh sách — câu hỏi nó
   * trả lời ("có giao việc lần nào không") không cần biết giao ở đâu, chỉ cần
   * biết có giao hay không.
   *
   * Vòng đời giống `touched_paths`: `bindSession` thay cả bản ghi nên đổi task
   * tự reset cờ này, `clearTouched` không đụng tới (nó thuộc về CẢ task, không
   * phải một lượt).
   */
  subagent_touched?: boolean;
  /**
   * Phiên này đã được nhắc — MỘT LẦN — về việc giao task tier `scribe`/`verifier`
   * cho sub-agent chưa, ở lượt sửa file đầu tiên mà phiên chính tự làm.
   *
   * Nhắc quá một lần là lải nhải; nhắc trễ (chỉ ở lúc chạy `ganas gate`) là
   * muộn — việc đã làm xong bằng model đắt rồi. Cờ này giữ đúng "một lần, đúng
   * lúc": xem `checkDispatchNudge` trong hooks/handlers.ts.
   *
   * Vòng đời giống `touched_paths`: `bindSession` thay cả bản ghi nên đổi task
   * tự reset cờ này.
   */
  dispatch_nudged?: boolean;
  /**
   * Kết quả chấm `exit_contract` NGAY LÚC nhận task, theo `criterionKey`.
   *
   * Tiêu chí đã `true` ở đây mà lúc commit vẫn `true` thì nó không gác gì —
   * nó xanh từ trước khi có một dòng code nào. Vắng mặt ⇒ chưa đo (phiên khác,
   * hoặc chạy `ganas next --no-baseline`) ⇒ không kết luận gì.
   */
  baseline?: Record<string, boolean>;
  /**
   * Danh sách `agent_id` đã bị đòi báo cáo (hook `SubagentStop`) một lần, kể
   * từ khi bind vào task hiện tại.
   *
   * Khuôn theo `dispatch_nudged`: cờ "đã đòi một lần cho mỗi agent", và giống
   * `dispatch_nudged`, RESET khi đổi task là ĐÚNG với trường này — báo cáo của
   * sub-agent gắn với TASK đang làm; task khác thì đòi báo cáo lại từ đầu là
   * hợp lý, không phải rò rỉ. Vòng đời theo đúng `bindSession` (:143) như
   * `dispatch_nudged`.
   */
  reported_agents?: string[];
}

/**
 * Bộ đếm vòng auto-loop của một phiên, cộng cờ dừng (halt) và cặp
 * task-đỏ/số-lần-đỏ liên tiếp — xem docstring của `State.auto_loop` để biết vì
 * sao khối này KHÔNG nằm trong `SessionRecord`.
 */
export interface AutoLoopState {
  /** Số vòng auto-loop đã chạy trong phiên này, cộng dồn qua mọi lần đổi task. */
  rounds: number;
  /** Đã bị buộc dừng chưa — true thì auto-loop ngưng hẳn, chỉ người mới mở lại được. */
  halted?: boolean;
  /** Task đỏ (gate không đạt) gần nhất mà auto-loop gặp phải. */
  red_task?: string;
  /** Số lần LIÊN TIẾP gặp lại đúng `red_task` đó — tín hiệu vòng lặp không tiến triển. */
  red_count?: number;
}

export interface State {
  version: 1;
  /** Task được chọn gần nhất — dùng khi không biết session id. */
  current_task: string | null;
  sessions: Record<string, SessionRecord>;
  /**
   * Bộ đếm vòng auto-loop, khoá theo `sessionId` — CỐ Ý nằm NGOÀI
   * `sessions[id]` (`SessionRecord`), đi ngược khuôn của `dispatch_nudged` và
   * `reported_agents` ở trên. Đây không phải sơ suất, mà là chỗ hai trường
   * cùng-kiểu-cờ-một-lần-cho-mỗi-task lại phải sống ở hai cấp khác nhau.
   *
   * Vì sao: `bindSession` (:143) THAY CẢ `SessionRecord` mỗi khi đổi task, nên
   * mọi trường sống trong record đó tự reset theo task — đúng ý cho một cờ
   * "đã nhắc/đã đòi Ở TASK NÀY" (`dispatch_nudged`, `reported_agents`), vì hết
   * task thì cờ đó hết nghĩa. Nhưng auto-loop cần một cái TRẦN chống VÒNG LẶP
   * CHẠY MÃI, và ca xấu nhất của vòng lặp chạy mãi chính là: mỗi vòng lại đẻ
   * ra một task vá mới trong cùng một chặng (gate đỏ → sinh task vá → bind
   * sang task đó → sửa → gate lại đỏ → sinh task vá tiếp...). Nếu đếm nằm
   * trong `SessionRecord` thì mỗi task vá mới là một lần `bindSession`, tức bộ
   * đếm tự về lại 0 — cái trần bị vô hiệu ĐÚNG vào lúc nó cần cản nhất. Một
   * cái trần chỉ có tác dụng khi nó KHÔNG tự xoá mình lúc mọi thứ đang đi sai.
   *
   * Để ở cấp `State`, khoá theo `sessionId` (không theo `task`), bộ đếm sống
   * xuyên suốt phiên bất kể phiên nhảy qua bao nhiêu task — đúng cái cần cản.
   */
  auto_loop?: Record<string, AutoLoopState>;
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
      auto_loop: parsed.auto_loop,
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

/**
 * Phiên này đã từng có lượt sửa nào đến từ sub-agent chưa, CHỈ khi còn bind
 * vào đúng task đó — cùng lý do không rơi về `current_task` với `touchedPathsFor`.
 */
export async function subagentTouchedFor(
  root: string,
  sessionId: string | undefined,
  taskId: string,
): Promise<boolean> {
  if (!sessionId) return false;
  const rec = (await readState(root)).sessions[sessionId];
  if (!rec || rec.task !== taskId) return false;
  return rec.subagent_touched === true;
}

/**
 * Đã nhắc phiên này về việc giao task tier `scribe`/`verifier` cho sub-agent
 * chưa. Chỉ đọc — đặt cờ bằng `markDispatchNudged`.
 */
export async function dispatchNudgedFor(
  root: string,
  sessionId: string | undefined,
  taskId: string,
): Promise<boolean> {
  if (!sessionId) return false;
  const rec = (await readState(root)).sessions[sessionId];
  if (!rec || rec.task !== taskId) return false;
  return rec.dispatch_nudged === true;
}

/** Đặt cờ đã-nhắc — gọi đúng một lần, ngay sau khi trả `systemMessage` nhắc giao việc. */
export async function markDispatchNudged(root: string, sessionId: string): Promise<void> {
  await updateState(root, (s) => {
    const rec = s.sessions[sessionId];
    if (rec) rec.dispatch_nudged = true;
  });
}

/**
 * `agentId` này đã bị đòi báo cáo (hook `SubagentStop`) chưa, CHỈ khi phiên
 * còn bind vào đúng task đó — cùng lý do không rơi về `current_task` với
 * `touchedPathsFor`/`subagentTouchedFor`.
 */
export async function agentReportedFor(
  root: string,
  sessionId: string | undefined,
  taskId: string,
  agentId: string,
): Promise<boolean> {
  if (!sessionId) return false;
  const rec = (await readState(root)).sessions[sessionId];
  if (!rec || rec.task !== taskId) return false;
  return (rec.reported_agents ?? []).includes(agentId);
}

/** Đánh dấu `agentId` đã bị đòi báo cáo — gọi đúng một lần cho mỗi agent, khuôn theo `markDispatchNudged`. */
export async function markAgentReported(root: string, sessionId: string, agentId: string): Promise<void> {
  await updateState(root, (s) => {
    const rec = s.sessions[sessionId];
    if (!rec) return;
    const list = (rec.reported_agents ??= []);
    if (!list.includes(agentId)) list.push(agentId);
  });
}

/**
 * Trạng thái auto-loop của một phiên — khoá theo `sessionId`, KHÔNG theo
 * task; xem docstring của `State.auto_loop` về vì sao. Chưa từng chạy vòng
 * nào thì trả `undefined`.
 */
export async function autoLoopFor(root: string, sessionId: string): Promise<AutoLoopState | undefined> {
  const state = await readState(root);
  return state.auto_loop?.[sessionId];
}

/**
 * Tăng bộ đếm vòng auto-loop của phiên lên 1 và trả về giá trị mới. Sống ở
 * cấp `State`, cố ý KHÔNG reset khi phiên đổi task — xem `State.auto_loop`.
 */
export async function incrementAutoLoopRounds(root: string, sessionId: string): Promise<number> {
  const state = await updateState(root, (s) => {
    const loop = (s.auto_loop ??= {});
    const entry = (loop[sessionId] ??= { rounds: 0 });
    entry.rounds += 1;
  });
  return state.auto_loop?.[sessionId]?.rounds ?? 0;
}

/** Auto-loop của phiên này đã bị dừng (halt) chưa. */
export async function autoLoopHaltedFor(root: string, sessionId: string): Promise<boolean> {
  return (await autoLoopFor(root, sessionId))?.halted === true;
}

/** Bật cờ dừng auto-loop của phiên — ngưng hẳn cho tới khi người can thiệp reset state. */
export async function haltAutoLoop(root: string, sessionId: string): Promise<void> {
  await updateState(root, (s) => {
    const loop = (s.auto_loop ??= {});
    const entry = (loop[sessionId] ??= { rounds: 0 });
    entry.halted = true;
  });
}

/**
 * Ghi nhận một task đỏ (gate không đạt) mà auto-loop vừa gặp, trả về
 * `red_count` sau khi cập nhật. Cùng task với lần trước thì cộng dồn —
 * tín hiệu "vòng lặp không tiến triển" (sinh task vá mới nhưng vẫn đỏ). Khác
 * task thì reset `red_count` về 1.
 */
export async function markRedTask(root: string, sessionId: string, taskId: string): Promise<number> {
  const state = await updateState(root, (s) => {
    const loop = (s.auto_loop ??= {});
    const entry = (loop[sessionId] ??= { rounds: 0 });
    if (entry.red_task === taskId) {
      entry.red_count = (entry.red_count ?? 0) + 1;
    } else {
      entry.red_task = taskId;
      entry.red_count = 1;
    }
  });
  return state.auto_loop?.[sessionId]?.red_count ?? 0;
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
 *
 * `fromSubagent` cũng tuỳ chọn, cùng lý do: `preToolUse` gọi hàm này cho lượt
 * sửa qua Bash mà không biết nguồn gốc. Có giá trị `true` thì góp vào
 * `subagent_touched` — xem doc của field đó trong `SessionRecord`.
 */
export async function markTouched(
  root: string,
  sessionId: string,
  relPath?: string,
  fromSubagent?: boolean,
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

  if (fromSubagent && !rec.subagent_touched) {
    rec.subagent_touched = true;
    dirty = true;
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
