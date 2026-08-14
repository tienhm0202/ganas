import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import { DIRS, ganasPath } from "./graph/paths.js";
import type { Graph } from "./graph/types.js";
import { readState, type State, writeState } from "./state.js";
import { runShell } from "./util/exec.js";

/**
 * Sub-thư mục trong `runs/` chứa ghi chú thô của `ganas note` — TÁCH khỏi
 * handoff (`runs/<sessionId>.md`, ghi ĐÈ mỗi lần gọi). Note là nhiều mẩu rời
 * rạc ghi NỐI THÊM trong một phiên; nếu note và handoff dùng chung một file,
 * lần handoff kế tiếp sẽ ghi đè mất sạch note đã tích.
 *
 * Vẫn giữ ĐÚNG quy ước đặt tên `<sessionId>.md` — chỉ đổi thư mục, không đổi
 * tên — để phép suy sessionId-từ-tên-file trong `collectStaleIn()` dùng lại
 * được nguyên vẹn cho cả hai thư mục. Đặt tên kiểu `notes-<sessionId>.md` sẽ
 * làm phép suy đó ra sai và file note không bao giờ được dọn — xem cảnh báo ở
 * `src/commands/note.ts`.
 */
export const NOTES_DIRNAME = "notes";

/** Đường dẫn file note của một phiên — dùng chung giữa `note.ts` và `prune.ts`. */
export function notePath(root: string, sessionId: string): string {
  return join(ganasPath(root, DIRS.runs), NOTES_DIRNAME, `${sessionId}.md`);
}

/**
 * Dọn dẹp — ba tầng, không được trộn lẫn:
 *
 *  1. Ephemeral, local (`runs/*.md` của phiên đã kết thúc — kể cả
 *     `runs/notes/*.md` của `ganas note` —, session mồ côi trong
 *     `state.json`) — xoá thẳng. Không chia sẻ, không phải bằng chứng.
 *  2. Shared nhưng đã đóng (task `done`) — ARCHIVE (dời vào
 *     thư mục con `done/`/`closed/`), không xoá. `listYaml()` không đệ quy
 *     nên tự động biến mất khỏi graph mà không cần sửa `load.ts`. Giữ trong
 *     git history.
 *  3. Vĩnh viễn, không đụng (`verify-ledger.jsonl`, `claims/`, `decisions/`,
 *     `facts/`) — module này không có đường dẫn code nào chạm vào chúng.
 *
 * Đề xuất "proposals đã duyệt/từ chối" trong tầng 2 CHƯA làm được: chưa có
 * model `Proposal` nào được nạp vào graph để biết trạng thái mà quyết định.
 */

const DAY_MS = 86_400_000;

export interface StaleRun {
  sessionId: string;
  file: string;
  ageDays: number;
}

export interface DeadSession {
  sessionId: string;
  ageDays: number;
}

export interface ArchivableRecord {
  id: string;
  /** Đường dẫn tương đối tới root, giống `Sourced.file`. */
  file: string;
}

export interface PrunePlan {
  staleRuns: StaleRun[];
  deadSessions: DeadSession[];
  doneTasks: ArchivableRecord[];
}

export interface PlanPruneOptions {
  olderThanDays: number;
  now?: number;
}

/**
 * Tính kế hoạch dọn, KHÔNG đụng gì tới đĩa.
 *
 * Task chỉ được đưa vào kế hoạch nếu archive nó không làm treo tham
 * chiếu nào còn sống: task còn bị `blocked_by` chặn tới thì giữ lại (archive
 * xong `blocked_by` trỏ vào chỗ không còn tồn tại, `openBlockers` sẽ coi là
 * CHẶN VĨNH VIỄN — tệ hơn nhiều so với việc chưa dọn).
 *
 * Phạm vi công việc KHÔNG bao giờ được archive, kể cả khi đã `delivered`: khối
 * vẫn khai `scope:` trỏ vào nó và fact vẫn còn hiệu lực trong nó. Phạm vi là
 * ranh giới của tri thức, mà tri thức sống lâu hơn đợt bàn giao.
 */
export async function planPrune(
  root: string,
  graph: Graph,
  opts: PlanPruneOptions,
): Promise<PrunePlan> {
  const now = opts.now ?? Date.now();
  const cutoff = now - opts.olderThanDays * DAY_MS;

  const state = await readState(root);

  /* --- tầng 1: runs/*.md và runs/notes/*.md của phiên đã kết thúc --------- */

  const runsDir = ganasPath(root, DIRS.runs);
  const notesDir = join(runsDir, NOTES_DIRNAME);
  const staleRuns: StaleRun[] = [
    ...(await collectStaleIn(runsDir, state, cutoff, now)),
    ...(await collectStaleIn(notesDir, state, cutoff, now)),
  ];

  /* --- tầng 1: session mồ côi trong state.json ---------------------------- */

  const deadSessions: DeadSession[] = [];
  for (const [sessionId, rec] of Object.entries(state.sessions)) {
    const startedAt = Date.parse(rec.started_at);
    if (Number.isNaN(startedAt) || startedAt > cutoff) continue;
    deadSessions.push({ sessionId, ageDays: Math.floor((now - startedAt) / DAY_MS) });
  }

  /* --- tầng 2: task done, không còn ai blocked_by tới nó ------------------ */

  const blockedByTargets = new Set<string>();
  for (const t of graph.tasks.values()) {
    for (const dep of t.value.blocked_by) blockedByTargets.add(dep);
  }

  const doneTasks: ArchivableRecord[] = [];
  const archivingTaskIds = new Set<string>();
  for (const t of graph.tasks.values()) {
    if (t.value.status !== "done") continue;
    if (!t.value.done_at) continue; // không nên xảy ra (schema đòi), nhưng đừng đoán tuổi nếu thiếu
    if (Date.parse(t.value.done_at) > cutoff) continue;
    if (blockedByTargets.has(t.value.id)) continue; // còn task khác đang chờ nó
    doneTasks.push({ id: t.value.id, file: t.file });
    archivingTaskIds.add(t.value.id);
  }

  // Phạm vi KHÔNG được archive dù đã `delivered`: khối vẫn khai `scope` trỏ vào
  // nó và fact vẫn còn hiệu lực trong nó. Dọn đi là tạo tham chiếu treo — đúng
  // vết xe mà `blocked_by` ở tầng trên đã phải né.

  return { staleRuns, deadSessions, doneTasks };
}

/**
 * Quét MỘT thư mục kiểu `runs/`: mỗi `*.md` tên đúng bằng `<sessionId>.md`,
 * suy sessionId từ tên file. Dùng chung cho `runs/` (handoff) và
 * `runs/notes/` (`ganas note`) — cùng quy ước đặt tên, xem `NOTES_DIRNAME`.
 */
async function collectStaleIn(
  dir: string,
  state: State,
  cutoff: number,
  now: number,
): Promise<StaleRun[]> {
  const out: StaleRun[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const sessionId = entry.name.slice(0, -3);
    if (state.sessions[sessionId]) continue; // phiên còn đang bind — không đụng
    const file = join(dir, entry.name);
    const mtimeMs = (await stat(file)).mtimeMs;
    if (mtimeMs > cutoff) continue;
    out.push({ sessionId, file, ageDays: Math.floor((now - mtimeMs) / DAY_MS) });
  }
  return out;
}

/** Bọc pathspec cho shell — dùng chung kiểu với `commit.ts`. */
function quote(p: string): string {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

/**
 * Dời file vào thư mục con `archiveDirName/` cùng cấp. `git mv` nếu có git
 * (giữ history đổi tên), rơi về `rename()` thường nếu không phải git repo
 * hoặc file chưa được track.
 */
async function archive(root: string, relFile: string, archiveDirName: string): Promise<string> {
  const src = join(root, relFile);
  const dstRel = join(dirname(relFile), archiveDirName, basename(relFile));
  const dst = join(root, dstRel);
  await mkdir(dirname(dst), { recursive: true });

  if (existsSync(join(root, ".git"))) {
    const result = await runShell(
      `git mv -- ${quote(relative(root, src))} ${quote(relative(root, dst))}`,
      { cwd: root, timeoutMs: 15_000 },
    );
    if (result.code === 0) return dstRel;
  }

  await rename(src, dst);
  return dstRel;
}

/** Thực thi kế hoạch. Gọi sau khi người dùng đã xem qua `planPrune()`. */
export async function applyPrune(root: string, plan: PrunePlan): Promise<void> {
  for (const r of plan.staleRuns) {
    await rm(r.file, { force: true });
  }

  if (plan.deadSessions.length > 0) {
    const state: State = await readState(root);
    for (const d of plan.deadSessions) delete state.sessions[d.sessionId];
    await writeState(root, state);
  }

  for (const t of plan.doneTasks) await archive(root, t.file, "done");
}
