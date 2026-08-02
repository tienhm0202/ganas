import { applyPrune, planPrune, type PrunePlan } from "../prune.js";
import { type Argv, flag, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { openProject } from "./_common.js";

const DEFAULT_OLDER_THAN_DAYS = 7;

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
  if (plan.doneTasks.length > 0) {
    lines.push(`${plan.doneTasks.length} task done sẽ chuyển sang tasks/done/:`);
    for (const t of plan.doneTasks) lines.push(`  - ${t.id} (${t.file})`);
  }

  return lines.join("\n");
}

export async function run(argv: Argv): Promise<number> {
  const { root, graph } = await openProject(argv);

  const olderThanRaw = option(argv, "older-than");
  const olderThanDays = olderThanRaw === undefined ? DEFAULT_OLDER_THAN_DAYS : Number(olderThanRaw);
  if (Number.isNaN(olderThanDays) || olderThanDays < 0) {
    throw new GanasError(`--older-than không phải số ngày hợp lệ: ${olderThanRaw}`);
  }

  const plan = await planPrune(root, graph, { olderThanDays });
  const total = plan.staleRuns.length + plan.deadSessions.length + plan.doneTasks.length;

  const apply = flag(argv, "yes", "y");

  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify({ ...plan, applied: apply && total > 0 }, null, 2) + "\n");
  } else if (total === 0) {
    process.stdout.write(`Không có gì cần dọn (ngưỡng ${olderThanDays} ngày).\n`);
  } else {
    process.stdout.write(`${summarize(plan)}\n`);
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
