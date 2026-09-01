import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import type { Claim } from "./graph/claim.js";
import { DIRS, ganasPath } from "./graph/paths.js";
import type { Graph, Sourced } from "./graph/types.js";
import type { Design } from "./model/design.js";
import type { Icebox } from "./model/icebox.js";
import { ID_PATTERNS } from "./model/index.js";
import { readState, type State, writeState } from "./state.js";
import { runShell } from "./util/exec.js";
import { exists, listDir, mtimeMs } from "./util/fsprobe.js";

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
 *     `state.json`, VÀ lock mồ côi trong `.locks/`: đã quá `claim.ttl_minutes`,
 *     hoặc `session_id` bên trong không còn khớp session nào trong
 *     `state.json` — xem `collectStaleLocks`. Vế thứ hai là chỗ bắt fallback
 *     `"cli"` mà `releaseClaimsForSession` (graph/claim.ts) không bao giờ đụng
 *     tới, vì `"cli"` không phải khoá của một `SessionRecord` thật) — xoá
 *     thẳng. Không chia sẻ, không phải bằng chứng.
 *  2. Shared nhưng đã đóng — ARCHIVE (dời vào thư mục con `done/`/`closed/`),
 *     không xoá. `listYaml()` không đệ quy nên tự động biến mất khỏi graph mà
 *     không cần sửa `load.ts`. Giữ trong git history. Ba thứ nằm ở tầng này:
 *     task `done`, file icebox theo tháng mà MỌI bản ghi trong đó đã
 *     `status !== "open"` (đóng hoặc đã thăng cấp) — xem `Icebox` ở
 *     `src/model/icebox.ts` —, đề xuất (`proposals/PR-00N.yaml`) đã
 *     `approved`/`rejected` đủ tuổi tính từ `decided_at`, xem `zProposal` ở
 *     `src/model/proposal.ts`. Ba thứ, một tiêu chí chung: KHÔNG CÒN AI DÙNG,
 *     và archive nó không làm treo tham chiếu nào còn sống.
 *
 *     DESIGN KHÔNG BAO GIỜ ĐƯỢC ARCHIVE, cùng lý do phạm vi không bao giờ bị
 *     archive: bản vẽ của một chặng đã đóng vẫn đang canh code đang chạy, và
 *     probe của nó là hàng rào chống hồi quy duy nhất cho hợp đồng đó. Đã thử
 *     và bỏ ở D-012 — đường duy nhất để một design thành `superseded` là được
 *     một design khác khai `supersedes`, mà archive nó lại làm chính luật
 *     `spine/design-missing-supersede` đỏ. Muốn chạy được thì loader và ba
 *     validator phải cùng biết về một tập "đã archive" — tức hai bản đồ song
 *     song, đúng thứ repo này tránh.
 *  3. Vĩnh viễn, không đụng (`verify-ledger.jsonl`, `claims/`, `decisions/`,
 *     `facts/`) — module này không có đường dẫn code nào chạm vào chúng.
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

export interface StaleLock {
  /** Đường dẫn tương đối tới root, giống `Sourced.file`. */
  file: string;
  sessionId: string;
  ageDays: number;
  /** Vì sao bị liệt vào diện dọn — hiển thị khác nhau ở summary của lệnh. */
  reason: "ttl" | "orphan-session";
}

export interface ArchivableRecord {
  id: string;
  /** Đường dẫn tương đối tới root, giống `Sourced.file`. */
  file: string;
}

export interface ArchivableIceboxFile {
  /** Suy từ tên file, vd "2026-01" — chỉ để hiển thị, không dùng làm khoá. */
  month: string;
  /** Đường dẫn tương đối tới root, giống `Sourced.file`. */
  file: string;
  /** Tuổi tính từ `closed_at` MỚI NHẤT trong file — xem lý do ở `planPrune`. */
  ageDays: number;
}

export interface PrunePlan {
  staleRuns: StaleRun[];
  deadSessions: DeadSession[];
  staleLocks: StaleLock[];
  doneTasks: ArchivableRecord[];
  iceboxFiles: ArchivableIceboxFile[];
  closedProposals: ArchivableRecord[];
  /**
   * Mốc thời gian (`now - olderThanDays`), ISO — cho lệnh CLI in ra để người
   * dùng biết VÌ SAO một mục chưa xuất hiện ở đây (trẻ hơn mốc này). Không
   * phải để `planPrune` tự đọc lại — tính một lần, trả ra cho nơi gọi.
   */
  cutoffAt: string;
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
 * CHẶN VĨNH VIỄN — tệ hơn nhiều so với việc chưa dọn). Cùng lý lẽ đó áp cho
 * `promoted_to` — TỪ CẢ HAI nguồn có thể khai trường này: bản ghi icebox
 * `status: "promoted"`, và bản ghi proposal `status: "approved"` (xem
 * `zPromotedTarget` ở `src/model/proposal.ts` — nhận cả `D-`/`T-`/`ICE-`, nên
 * lọc lấy riêng id dạng task bằng `ID_PATTERNS.task`). Task nào đang là đích
 * của MỘT TRONG HAI thì giữ lại — archive nó đi, `promoted_to` trỏ vào hư
 * không, và luật validate (`icebox/promoted-missing-task` hoặc
 * `spine/proposal-missing-target`) sẽ réo mãi mà người đọc không hiểu vì sao.
 * Rò rỉ này KHÔNG vĩnh viễn: một khi file icebox/proposal chứa bản ghi đó tự
 * rời graph (tầng dưới, file tháng đã đóng hết và đủ tuổi — hoặc bản thân
 * proposal đã archive ở tầng 2, xem `collectClosedProposals`), lượt
 * `planPrune` kế tiếp không còn ai giữ tham chiếu và task được archive bình
 * thường — chỉ là chậm hơn một vòng prune.
 *
 * Cùng nguyên tắc "đừng archive nếu làm treo tham chiếu", task còn bị giữ lại
 * nếu DESIGN nó `implements` chưa `status: done`: `listYaml()`
 * (graph/load.ts) không đệ quy, nên một task đã archive rời khỏi
 * `graph.tasks` HOÀN TOÀN — không còn cách nào phân biệt "design chưa có task
 * nào" với "design đã xong hết task nhưng chưa ai đóng chặng". Luật
 * `spine/design-stalled` (graph/validate.ts) chỉ bắt được vế sau khi CÒN ít
 * nhất một task trong graph để đếm; archive nốt task cuối cùng của một design
 * còn `active` là tự tay xoá đúng bằng chứng mà luật đó cần để báo lỗi. Ca
 * thật trên HEAD lúc giao việc này: D-003 chỉ có một task (T-005, đã archive
 * TRƯỚC KHI có luật này), nên D-003 mãi mãi không bị `spine/design-stalled`
 * bắt. Một khi người đóng design (`status: done` + `done_at`), lượt
 * `planPrune` kế tiếp archive task đó bình thường — chỉ chậm hơn, không mất.
 *
 * Phạm vi công việc KHÔNG bao giờ được archive, kể cả khi đã `delivered`: khối
 * vẫn khai `scope:` trỏ vào nó và fact vẫn còn hiệu lực trong nó. Phạm vi là
 * ranh giới của tri thức, mà tri thức sống lâu hơn đợt bàn giao.
 *
 * Điều `delivered` ĐỔI là NGƯỠNG TUỔI của task trong phạm vi đó, không phải các
 * hàng rào trên. Task là dàn giáo: bàn giao xong thì nó đã hết việc, không cần
 * chờ thêm `--older-than` ngày nữa mới được dọn. Mọi guard chống treo tham
 * chiếu (`blocked_by`, `promoted_to`, design chưa đóng) vẫn giữ nguyên — nới
 * ngưỡng tuổi là nới thời điểm, nới guard là nới ĐÚNG chỗ hệ sẽ hỏng. Khối
 * `agent` của task đi theo file task nên không có đường dọn riêng: archive task
 * là nó đi cùng.
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

  /* --- tầng 1: lock mồ côi trong .locks/ ----------------------------------- */

  const staleLocks = await collectStaleLocks(root, state, graph.config.claim.ttl_minutes, cutoff, now);

  /* --- tầng 2: task done, không còn ai blocked_by/promoted_to tới nó ------- */

  const blockedByTargets = new Set<string>();
  for (const t of graph.tasks.values()) {
    for (const dep of t.value.blocked_by) blockedByTargets.add(dep);
  }

  // Bản ghi icebox `status: "promoted"` trỏ `promoted_to` vào task đã được
  // tạo từ nó — archive task đó đi thì tham chiếu treo, xem docstring hàm này.
  const promotedTargets = new Set<string>();
  for (const rec of graph.icebox.values()) {
    if (rec.value.promoted_to) promotedTargets.add(rec.value.promoted_to);
  }

  // Cùng lý lẽ đó cho proposal `status: "approved"` — `promoted_to` của nó
  // nhận cả D-/T-/ICE- (`zPromotedTarget`), nên lọc lấy riêng id dạng task:
  // nhét cả D-/ICE- vào tập này vô hại (chúng không khớp `t.value.id` nào ở
  // vòng lặp doneTasks bên dưới) nhưng làm ý đồ khó đọc.
  for (const rec of graph.proposals.values()) {
    const target = rec.value.promoted_to;
    if (target && ID_PATTERNS.task.test(target)) promotedTargets.add(target);
  }

  // Phạm vi đã bàn giao — task trong đó không phải chờ đủ tuổi nữa.
  const deliveredScopes = new Set<string>();
  for (const rec of graph.scopes.values()) {
    if (rec.value.status === "delivered") deliveredScopes.add(rec.value.id);
  }

  const doneTasks: ArchivableRecord[] = [];
  for (const t of graph.tasks.values()) {
    if (t.value.status !== "done") continue;
    if (!deliveredScopes.has(t.value.scope)) {
      if (!t.value.done_at) continue; // không nên xảy ra (schema đòi), nhưng đừng đoán tuổi nếu thiếu
      if (Date.parse(t.value.done_at) > cutoff) continue;
    }
    if (blockedByTargets.has(t.value.id)) continue; // còn task khác đang chờ nó
    if (promotedTargets.has(t.value.id)) continue; // còn mục icebox đang trỏ tới nó
    // Design chưa đóng: archive task này có thể xoá đúng bằng chứng mà
    // spine/design-stalled cần để bắt chặng bỏ dở — xem docstring hàm này.
    if (!isClosedDesign(graph.designs.get(t.value.implements)?.value)) continue;
    doneTasks.push({ id: t.value.id, file: t.file });
  }

  // Phạm vi KHÔNG được archive dù đã `delivered`: khối vẫn khai `scope` trỏ vào
  // nó và fact vẫn còn hiệu lực trong nó. Dọn đi là tạo tham chiếu treo — đúng
  // vết xe mà `blocked_by` ở tầng trên đã phải né.

  /* --- tầng 2: file icebox theo tháng mà mọi bản ghi đã đóng --------------- */

  const iceboxFiles = collectClosedIceboxFiles(graph.icebox, cutoff, now);

  /* --- tầng 2: đề xuất đã quyết (approved/rejected), đủ tuổi --------------- */

  const closedProposals = collectClosedProposals(graph.proposals, cutoff);



  return {
    staleRuns,
    deadSessions,
    staleLocks,
    doneTasks,
    iceboxFiles,
    closedProposals,
    cutoffAt: new Date(cutoff).toISOString(),
  };
}

/**
 * Design đã ĐÓNG — hiểu theo nghĩa "không còn là chặng đang chạy".
 *
 * Guard "design chưa đóng thì giữ task lại" (`planPrune`) sinh ra để không xoá
 * mất bằng chứng mà `spine/design-stalled` (graph/validate.ts) cần, mà luật đó
 * CHỈ chấm design `status: "active"`. Nên ba trạng thái dưới đây đều là "đóng":
 * `done` (xong), `superseded` (người kế nhiệm đã cầm bản vẽ), `archived`. Thiếu
 * hai giá trị sau thì task của một chặng đã bị thay không bao giờ archive được,
 * và vì task còn trong graph nên chính design đó cũng kẹt lại theo — hai thứ
 * giữ chân nhau vĩnh viễn.
 *
 * `draft` KHÔNG nằm ở đây: chặng chưa bắt đầu vẫn có thể chạy tới.
 */
function isClosedDesign(design: Design | undefined): boolean {
  if (!design) return false;
  return design.status === "done" || design.status === "superseded" || design.status === "archived";
}



/**
 * File icebox (`.ganas/icebox/YYYY-MM.yaml`) chứa NHIỀU bản ghi — `Sourced.file`
 * lặp lại cho mọi bản ghi cùng tháng. Một file chỉ được archive khi CẢ file đã
 * đóng: không còn bản ghi `status: "open"` nào (còn một mục đang gác thì cả
 * file vẫn phải ở trong graph để `ganas next`/review còn thấy nó), và đủ tuổi.
 *
 * "Tuổi" của file lấy theo `closed_at` MỚI NHẤT trong các bản ghi của nó, không
 * phải `found_at` hay mtime file: một mục đóng hôm qua giữ cả file "trẻ" dù có
 * mục khác đã đóng từ nửa năm trước — đúng ý ngưỡng `--older-than` (đã ổn định
 * đủ lâu để archive), không phải "được tạo từ lâu".
 */
function collectClosedIceboxFiles(
  icebox: Graph["icebox"],
  cutoff: number,
  now: number,
): ArchivableIceboxFile[] {
  const byFile = new Map<string, Sourced<Icebox>[]>();
  for (const rec of icebox.values()) {
    const list = byFile.get(rec.file);
    if (list) list.push(rec);
    else byFile.set(rec.file, [rec]);
  }

  const out: ArchivableIceboxFile[] = [];
  for (const [file, recs] of byFile) {
    if (recs.some((r) => r.value.status === "open")) continue; // còn mục đang gác

    let latestClosedAt = -Infinity;
    for (const r of recs) {
      const t = r.value.closed_at ? Date.parse(r.value.closed_at) : NaN;
      if (!Number.isNaN(t)) latestClosedAt = Math.max(latestClosedAt, t);
    }
    // Không nên xảy ra (schema đòi closed_at khi status !== "open"), nhưng
    // đừng đoán tuổi nếu thiếu — cùng thận trọng với done_at ở task phía trên.
    if (!Number.isFinite(latestClosedAt)) continue;
    if (latestClosedAt > cutoff) continue;

    out.push({
      month: basename(file, ".yaml"),
      file,
      ageDays: Math.floor((now - latestClosedAt) / DAY_MS),
    });
  }
  return out;
}

/**
 * Đề xuất `approved`/`rejected` đủ tuổi tính từ `decided_at` — cùng khuôn tuổi
 * đã dùng cho `done_at` (task, trên) và `closed_at` (icebox): không đoán tuổi
 * nếu thiếu `decided_at` (không nên xảy ra — schema `zProposal` đòi trường này
 * khi `status` đã quyết).
 *
 * Giữ lại đề xuất còn bị MỘT đề xuất khác `supersedes` trỏ tới — archive nó đi
 * thì tham chiếu đó trỏ vào hư không (`spine/proposal-missing-supersede`),
 * cùng lý lẽ `blocked_by`/`promoted_to` đã áp cho task ở `planPrune`.
 */
function collectClosedProposals(proposals: Graph["proposals"], cutoff: number): ArchivableRecord[] {
  const supersededTargets = new Set<string>();
  for (const rec of proposals.values()) {
    for (const oldId of rec.value.supersedes) supersededTargets.add(oldId);
  }

  const out: ArchivableRecord[] = [];
  for (const rec of proposals.values()) {
    const p = rec.value;
    if (p.status !== "approved" && p.status !== "rejected") continue;
    if (!p.decided_at) continue;
    if (Date.parse(p.decided_at) > cutoff) continue;
    if (supersededTargets.has(p.id)) continue; // còn đề xuất khác supersedes trỏ tới nó
    out.push({ id: p.id, file: rec.file });
  }
  return out;
}

/** Đuôi file khoá trong `.locks/` — cùng giá trị với `LOCK_SUFFIXES` (không export) ở graph/claim.ts, khai lại vì khác phạm vi module (xem ràng buộc đầu file). */
const LOCK_SUFFIXES = [".claim", ".id"] as const;

/**
 * Lock mồ côi trong `.locks/` — hai lý do khác nhau, không gộp làm một:
 *
 *  - `ttl`: đã quá `claim.ttl_minutes` tính từ `claimed_at` — CÙNG ngưỡng mà
 *    `acquireLock` (graph/claim.ts) tự dùng để cho phép giành lại một lock cũ.
 *    Xoá sớm ở đây không đổi kết quả cuối cùng: chỉ làm trước cái việc mà lần
 *    `claimTask`/`reserveId` kế tiếp cho CHÍNH id đó sẽ tự làm.
 *  - `orphan-session`: `session_id` bên trong không khớp session nào còn
 *    trong `state.json`. Đây là cách bắt CHÍNH danh tính `"cli"` — `ganas id`
 *    gọi trần (không `--session`) rơi vào fallback này (xem docstring đầu
 *    `commands/id.ts`), và `"cli"` không bao giờ là khoá của một
 *    `SessionRecord` thật nên `releaseClaimsForSession` (graph/claim.ts)
 *    không bao giờ đụng tới nó. Đợi thêm `cutoff` (ngưỡng `--older-than`,
 *    KHÔNG phải TTL) trước khi xoá theo lý do này: TTL đã đủ nhanh cho ca chết
 *    thật (session crash); tiêu chí này không cần nhanh, và xoá ngay một lock
 *    vừa tạo giữa lúc một tiến trình `ganas id`/`ganas next` khác đang chạy
 *    (chưa kịp ghi entity dùng số đó) là rủi ro thật, không phải giả thuyết.
 *
 * File đọc hỏng (JSON lỗi, hoặc biến mất giữa lúc quét) thì bỏ qua — không
 * đoán ý một file hỏng, để nguyên cho người xem, cùng tinh thần "không ném"
 * của `src/util/fsprobe.ts`.
 */
async function collectStaleLocks(
  root: string,
  state: State,
  ttlMinutes: number,
  cutoff: number,
  now: number,
): Promise<StaleLock[]> {
  const dir = ganasPath(root, DIRS.locks);
  const out: StaleLock[] = [];

  for (const entry of await listDir(dir)) {
    if (!entry.isFile() || !LOCK_SUFFIXES.some((s) => entry.name.endsWith(s))) continue;
    const file = join(dir, entry.name);

    let claim: Claim;
    try {
      claim = JSON.parse(await readFile(file, "utf8")) as Claim;
    } catch {
      continue; // hỏng hoặc biến mất giữa lúc quét — để nguyên, không đoán
    }

    const claimedAt = Date.parse(claim.claimed_at);
    const relFile = relative(root, file);

    if (Number.isNaN(claimedAt) || now - claimedAt > ttlMinutes * 60_000) {
      const ageDays = Number.isNaN(claimedAt) ? 0 : Math.floor((now - claimedAt) / DAY_MS);
      out.push({ file: relFile, sessionId: claim.session_id, ageDays, reason: "ttl" });
      continue;
    }

    if (!state.sessions[claim.session_id] && claimedAt <= cutoff) {
      out.push({
        file: relFile,
        sessionId: claim.session_id,
        ageDays: Math.floor((now - claimedAt) / DAY_MS),
        reason: "orphan-session",
      });
    }
  }

  return out;
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
  if (!exists(dir)) return out;
  for (const entry of await listDir(dir)) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const sessionId = entry.name.slice(0, -3);
    if (state.sessions[sessionId]) continue; // phiên còn đang bind — không đụng
    const file = join(dir, entry.name);
    // file biến mất giữa chừng (undefined): coi như đã cũ (0) — cùng cách xử
    // của src/graph/freshness.ts, không tự nghĩ ra ngữ nghĩa thứ hai. Ở đây hệ
    // quả là được liệt vào "stale" nên `applyPrune` sẽ `rm --force` nó — dọn
    // một file vốn đã không còn cũng vô hại.
    const mtime = (await mtimeMs(file)) ?? 0;
    if (mtime > cutoff) continue;
    out.push({ sessionId, file, ageDays: Math.floor((now - mtime) / DAY_MS) });
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

  if (exists(join(root, ".git"))) {
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

  for (const l of plan.staleLocks) {
    await rm(join(root, l.file), { force: true });
  }

  if (plan.deadSessions.length > 0) {
    const state: State = await readState(root);
    for (const d of plan.deadSessions) delete state.sessions[d.sessionId];
    await writeState(root, state);
  }

  for (const t of plan.doneTasks) await archive(root, t.file, "done");
  for (const f of plan.iceboxFiles) await archive(root, f.file, "closed");
  for (const p of plan.closedProposals) await archive(root, p.file, "closed");
}
