import type { Graph } from "../graph/types.js";
import { applyPrune, planPrune, type PrunePlan } from "../prune.js";
import { type Argv, flag, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { openProject } from "./_common.js";

const DEFAULT_OLDER_THAN_DAYS = 7;

/** Phần ngày, bỏ giờ/phút — đủ cho người đọc quyết định, khỏi bận tâm múi giờ. */
function cutoffDate(cutoffAt: string): string {
  return cutoffAt.slice(0, 10);
}

function summarize(plan: PrunePlan): string {
  const lines: string[] = [];

  if (plan.staleRuns.length > 0) {
    lines.push(`${plan.staleRuns.length} handoff cũ (phiên đã kết thúc) sẽ bị XOÁ:`);
    for (const r of plan.staleRuns)
      lines.push(`  - ${r.file} (${r.ageDays} ngày, session ${r.sessionId})`);
  }
  if (plan.deadSessions.length > 0) {
    lines.push(`${plan.deadSessions.length} session mồ côi trong state.json sẽ bị gỡ:`);
    for (const d of plan.deadSessions)
      lines.push(`  - ${d.sessionId} (${d.ageDays} ngày, chưa từng release)`);
  }
  if (plan.staleLocks.length > 0) {
    lines.push(`${plan.staleLocks.length} lock mồ côi trong .locks/ sẽ bị XOÁ:`);
    for (const l of plan.staleLocks)
      lines.push(`  - ${l.file} (${l.ageDays} ngày, session ${l.sessionId}, lý do: ${l.reason})`);
  }
  if (plan.doneTasks.length > 0) {
    lines.push(`${plan.doneTasks.length} task done sẽ chuyển sang tasks/done/:`);
    for (const t of plan.doneTasks) lines.push(`  - ${t.id} (${t.file})`);
  }
  if (plan.iceboxFiles.length > 0) {
    lines.push(`${plan.iceboxFiles.length} file icebox đã đóng hết sẽ chuyển sang icebox/closed/:`);
    for (const f of plan.iceboxFiles) lines.push(`  - ${f.month} (${f.ageDays} ngày, ${f.file})`);
  }
  if (plan.closedProposals.length > 0) {
    lines.push(`${plan.closedProposals.length} đề xuất đã quyết sẽ chuyển sang proposals/closed/:`);
    for (const p of plan.closedProposals) lines.push(`  - ${p.id} (${p.file})`);
  }

  const archivable =
    plan.doneTasks.length + plan.iceboxFiles.length + plan.closedProposals.length;
  if (archivable > 0) {
    lines.push(
      `\n${archivable} mục sẽ ARCHIVE — đủ tuổi tính tới mốc ${cutoffDate(plan.cutoffAt)} ` +
        `(ngưỡng --older-than). Mục trẻ hơn mốc này chưa hiện ở trên, không phải bị bỏ sót.`,
    );
  }

  return lines.join("\n");
}

/**
 * Kết quả lọc `PrunePlan` về một phạm vi — xem docstring `applyScopeFilter`
 * cho ngữ nghĩa quyết định trên TỪNG loại mục.
 */
interface ScopeFilterResult {
  plan: PrunePlan;
  /** Task/đề xuất bị loại vì khai THẲNG một phạm vi KHÁC — so trực tiếp, không phải đoán. */
  otherScope: number;
  /** Mục bị loại vì KHÔNG SUY ĐƯỢC phạm vi ở mức mục — xem docstring dưới. */
  unknownScope: number;
}

/**
 * `--scope P-x` — lọc kế hoạch dọn về đúng MỘT phạm vi, để sau khi bàn giao
 * một phạm vi thì quét đúng nó thay vì cả dự án. Ngữ nghĩa quyết theo SCHEMA
 * của từng loại mục trong `PrunePlan` (`src/prune.ts`), không đoán:
 *
 *  - `doneTasks`      — `Task.scope` BẮT BUỘC (không optional, xem
 *    `src/model/task.ts`) → lọc trực tiếp bằng `graph.tasks.get(id).scope`.
 *  - `closedProposals` — `Proposal.scope` CŨNG bắt buộc, cùng lý do "chỉ tới
 *    tay phiên nào tra bằng đúng phạm vi đó" (docstring "Vì sao `scope` BẮT
 *    BUỘC" ở `src/model/proposal.ts`) → lọc trực tiếp y hệt task. `ArchivableRecord`
 *    (hình dạng trong `PrunePlan`) không mang sẵn `scope` — tra lại qua
 *    `graph.proposals`, không phải vì proposal "không suy được phạm vi".
 *  - `iceboxFiles`     — đơn vị archive là CẢ FILE THEO THÁNG, gộp nhiều bản
 *    ghi mà `Icebox.scope` là trường TUỲ CHỌN từng bản ghi (khác `Proposal`
 *    — xem docstring `zIcebox`). Một file có thể chứa bản ghi thuộc nhiều
 *    phạm vi khác nhau hoặc không khai phạm vi nào — không có "phạm vi của
 *    cả file" để so. Loại HẲN khỏi kế hoạch khi có `--scope`.
 *  - `staleRuns`/`deadSessions`/`staleLocks` — ephemeral: `Claim`
 *    (`graph/claim.ts`) chỉ mang `session_id`/`claimed_at`, `SessionRecord`
 *    (`state.ts`) không mang `scope`, và file `runs/*.md` được liệt vào diện
 *    xoá ĐÚNG LÚC session của nó đã rời `state.json` (`collectStaleIn`) — nên
 *    không còn đường nào tra ngược ra một phạm vi. Loại HẲN, cùng lý do icebox.
 *
 * Mục loại vì "khác phạm vi" (task/proposal) và mục loại vì "không suy được
 * phạm vi" (ba nhóm còn lại) là HAI LÝ DO KHÁC NHAU — đếm riêng để người gọi
 * in đúng câu, không gộp thành một con số mơ hồ.
 */
function applyScopeFilter(plan: PrunePlan, graph: Graph, scopeId: string): ScopeFilterResult {
  const doneTasks = plan.doneTasks.filter((t) => graph.tasks.get(t.id)?.value.scope === scopeId);
  const closedProposals = plan.closedProposals.filter(
    (p) => graph.proposals.get(p.id)?.value.scope === scopeId,
  );

  const otherScope =
    plan.doneTasks.length - doneTasks.length + (plan.closedProposals.length - closedProposals.length);
  const unknownScope =
    plan.staleRuns.length + plan.deadSessions.length + plan.staleLocks.length + plan.iceboxFiles.length;

  return {
    plan: {
      ...plan,
      doneTasks,
      closedProposals,
      staleRuns: [],
      deadSessions: [],
      staleLocks: [],
      iceboxFiles: [],
    },
    otherScope,
    unknownScope,
  };
}

/**
 * Dòng thông báo cho `--scope` — luôn in khi cờ này có mặt, kể cả không bỏ
 * qua mục nào. Cắt bớt danh sách (đây là một dạng cắt) mà im lặng là đúng
 * bệnh mà bất biến "cắt bớt thì phải in số dòng đã bỏ" (`src/commands/CLAUDE.md`)
 * sinh ra để chống.
 */
function scopeFilterNote(scopeId: string, r: ScopeFilterResult): string {
  const parts: string[] = [];
  if (r.otherScope > 0) parts.push(`${r.otherScope} thuộc phạm vi khác`);
  if (r.unknownScope > 0)
    parts.push(`${r.unknownScope} không suy được phạm vi (session/run/lock mồ côi, file icebox theo tháng)`);
  const tail = parts.length > 0 ? ` — bỏ qua ${r.otherScope + r.unknownScope} mục (${parts.join(", ")})` : "";
  return `Đang lọc theo phạm vi ${scopeId}${tail}.\n`;
}

export async function run(argv: Argv): Promise<number> {
  const { root, graph } = await openProject(argv);

  const olderThanRaw = option(argv, "older-than");
  const olderThanDays = olderThanRaw === undefined ? DEFAULT_OLDER_THAN_DAYS : Number(olderThanRaw);
  if (Number.isNaN(olderThanDays) || olderThanDays < 0) {
    throw new GanasError(`--older-than không phải số ngày hợp lệ: ${olderThanRaw}`);
  }

  const scopeId = option(argv, "scope");
  if (scopeId !== undefined && !graph.scopes.has(scopeId)) {
    const known = [...graph.scopes.keys()].sort();
    throw new GanasError(
      `phạm vi "${scopeId}" không tồn tại — ` +
        (known.length > 0 ? `có: ${known.join(", ")}` : "dự án chưa khai phạm vi nào"),
    );
  }

  let plan = await planPrune(root, graph, { olderThanDays });
  let scopeNote = "";
  if (scopeId !== undefined) {
    const filtered = applyScopeFilter(plan, graph, scopeId);
    plan = filtered.plan;
    scopeNote = scopeFilterNote(scopeId, filtered);
  }

  const total =
    plan.staleRuns.length +
    plan.deadSessions.length +
    plan.staleLocks.length +
    plan.doneTasks.length +
    plan.iceboxFiles.length +
    plan.closedProposals.length;

  const apply = flag(argv, "yes", "y");

  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify({ ...plan, scope: scopeId ?? null, applied: apply && total > 0 }, null, 2) + "\n",
    );
  } else if (total === 0) {
    process.stdout.write(
      scopeNote +
        `Không có gì cần dọn (ngưỡng --older-than ${olderThanDays} ngày, mốc ${cutoffDate(plan.cutoffAt)}).\n`,
    );
  } else {
    process.stdout.write(`${scopeNote}${summarize(plan)}\n`);
  }

  if (total === 0) return 0;

  if (!apply) {
    if (!flag(argv, "json")) {
      process.stdout.write(
        `\nĐây là dry-run — chưa đụng gì tới đĩa. Chạy lại với --yes để thực thi.\n`,
      );
    }
    return 0;
  }

  await applyPrune(root, plan);
  if (!flag(argv, "json")) process.stdout.write(`\n✓ Đã dọn xong.\n`);
  return 0;
}
