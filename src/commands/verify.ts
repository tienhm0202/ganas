import type { Graph } from "../graph/types.js";
import { type Argv, flag, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import type { LedgerResult } from "../verify/ledger.js";
import { lastFor } from "../verify/ledger.js";
import {
  allTargets,
  type RunOutcome,
  runTarget,
  scopeOfTarget,
  type Target,
} from "../verify/run.js";
import { openProject } from "./_common.js";

const MARK: Record<LedgerResult, string> = {
  pass: "✓",
  fail: "✗",
  marginal: "≈",
  unavailable: "…",
  unprovable: "⚠",
};

const LABEL: Record<LedgerResult, string> = {
  pass: "đạt",
  fail: "TRƯỢT",
  marginal: "sát ngưỡng",
  unavailable: "không kiểm được ở đây",
  unprovable: "chưa chứng minh được",
};

/**
 * Target có cần chạy lại không.
 *
 * Dùng ĐÚNG `computeFreshness` mà brief dùng, không tự tính lại một nửa. Trước
 * P2 N24 hàm này chỉ soi sổ cái (chưa chạy / định nghĩa đổi / lần trước trượt)
 * và bỏ qua hoàn toàn file phụ thuộc — comment cũ ghi "N5 sẽ bổ sung" rồi không
 * ai làm. Hậu quả: sửa code xong, brief báo "CẦN VERIFY LẠI" trong khi
 * `ganas verify` báo "không có gì cần chạy". Hai đầu ra mâu thuẫn từ cùng một
 * công cụ là cách nhanh nhất để người dùng thôi tin cả hai.
 */
export function needsRunFor(
  target: Target,
  graph: Graph,
  freshness: Map<string, { freshness: string; reason: string }>,
): string | null {
  const state = freshness.get(target.id);
  if (state && state.freshness !== "fresh") return state.reason;

  const last = lastFor(graph.ledger, target.id);
  if (!last) return "chưa chạy lần nào";

  // `pass` mà KHÔNG có `proof` = lần trước chạy với `--no-mutation`. Trước P2
  // N22 dòng đó không phân biệt được với dòng đã qua bóp méo, nên một probe
  // rỗng ruột chạy tắt một lần là `pass` VĨNH VIỄN — `needsRun` thấy pass là
  // bỏ qua mãi mãi. Chỉ chạy lại đúng những lần đã bỏ qua bóp méo, không phạt
  // các probe mà ganas không nhận ra dạng để bóp méo (`proof: "unproven"`).
  if (target.kind === "probe" && last.proof === undefined) {
    return "lần trước bỏ qua mutation test — chưa chứng minh được probe có thể fail";
  }

  const ttl = target.ttlDays;
  if (ttl > 0 && Date.now() - Date.parse(last.at) > ttl * 86_400_000) {
    return `quá hạn ${ttl} ngày`;
  }
  return null;
}

function tierOf(target: Target): "smoke" | "full" {
  return (target.definition as { tier?: "smoke" | "full" }).tier ?? "smoke";
}

/**
 * Ước tính chi phí từ lần chạy gần nhất trong sổ cái.
 *
 * Phải chặn TRƯỚC khi chạy, không phải sau: một bộ eval $2 chạy xong rồi mới báo
 * "đã vượt hạn mức $0.5" thì hạn mức chẳng bảo vệ được gì. Chưa có lịch sử thì
 * không đoán được — trường hợp đó nói thẳng ra thay vì im lặng tiêu tiền.
 */
function estimateCost(target: Target, graph: Graph): number | undefined {
  for (const e of [...(graph.ledger.get(target.id) ?? [])].reverse()) {
    if (e.cost_usd !== undefined) return e.cost_usd;
  }
  return undefined;
}

/** Khớp id người gõ với target: chấp nhận `F-A-001`, `M-intent`, `M-intent/V-smoke`, `P-chat`. */
function matches(target: Target, wanted: string): boolean {
  return target.id === wanted || target.id.startsWith(`${wanted}/`);
}

export async function run(argv: Argv): Promise<number> {
  const { root, graph, freshness } = await openProject(argv);

  const wanted = argv.positional;
  const tier = option(argv, "tier") ?? "smoke";
  const dryRun = flag(argv, "dry-run");
  const skipMutation = argv.flags["mutation"] === false;
  const maxCost = option(argv, "max-cost-usd");
  const budget = maxCost === undefined ? Infinity : Number(maxCost);
  if (Number.isNaN(budget)) throw new GanasError(`--max-cost-usd không phải số: ${maxCost}`);

  const scopeFilter = option(argv, "scope");
  if (scopeFilter !== undefined && !graph.scopes.has(scopeFilter)) {
    throw new GanasError(`không có phạm vi nào tên "${scopeFilter}" — xem \`ganas validate\``);
  }

  const all = allTargets(graph).filter(
    (t) => scopeFilter === undefined || scopeOfTarget(t, graph) === scopeFilter,
  );
  if (all.length === 0) {
    process.stdout.write(
      scopeFilter !== undefined
        ? `Phạm vi ${scopeFilter} chưa có bằng chứng nào để verify.\n`
        : `Chưa có gì để verify.\n\n` +
            `Thêm \`verify:\` vào khối trong .ganas/modules/, hoặc fact trong .ganas/facts/.\n`,
    );
    return 0;
  }

  /* --- Chọn target ------------------------------------------------------ */

  let selected: Array<{ target: Target; why: string }>;

  if (wanted.length > 0) {
    // Người gõ tên cụ thể thì chạy bất kể tươi hay cũ — họ đang muốn kiểm lại.
    selected = [];
    for (const w of wanted) {
      const hits = all.filter((t) => matches(t, w));
      if (hits.length === 0) throw new GanasError(`không có target nào khớp "${w}"`);
      for (const target of hits) selected.push({ target, why: "được chỉ định" });
    }
  } else {
    const wantAll = flag(argv, "all");
    selected = all
      .filter(
        (t) => tier === "all" || tierOf(t) === tier || (tier === "full" && tierOf(t) === "smoke"),
      )
      .map((target) => ({ target, why: needsRunFor(target, graph, freshness) ?? "" }))
      .filter((s) => wantAll || s.why !== "")
      .map((s) => ({ target: s.target, why: s.why || "chạy lại theo yêu cầu" }));
  }

  if (selected.length === 0) {
    process.stdout.write(
      `Không có gì cần chạy — mọi bằng chứng tier "${tier}" đều còn tươi.\n` +
        `  Chạy lại tất cả: ganas verify --all\n` +
        `  Gồm cả tier full: ganas verify --tier full\n`,
    );
    return 0;
  }

  /* --- Chạy ------------------------------------------------------------- */

  const by = option(argv, "session") ? `session:${option(argv, "session")}` : "cli";
  const outcomes: RunOutcome[] = [];
  let spent = 0;
  let stoppedForBudget: string | null = null;

  const unknownCost: string[] = [];

  for (const { target, why } of selected) {
    const estimate = estimateCost(target, graph);
    if (spent + (estimate ?? 0) > budget) {
      stoppedForBudget = target.label;
      break;
    }
    if (budget < Infinity && estimate === undefined && target.kind === "eval") {
      unknownCost.push(target.label);
    }

    const outcome = await runTarget(target, { root, by, skipMutation, dryRun });
    outcomes.push(outcome);
    spent += outcome.costUsd ?? 0;

    if (!flag(argv, "json")) {
      // Dry-run chưa chạy gì nên không được hiện dấu kết quả — nếu không người
      // đọc sẽ tưởng đó là kết luận thật.
      const mark = dryRun ? "→" : MARK[outcome.result];
      const label = dryRun ? "sẽ chạy" : LABEL[outcome.result];
      const est = estimateCost(target, graph);
      const detail = dryRun
        ? why + (est !== undefined ? ` · ước tính $${est.toFixed(4)}` : "")
        : (outcome.reason ?? "");
      process.stdout.write(
        `${mark} ${target.label.padEnd(28)} ${label}` +
          (detail ? `\n    ${detail.split("\n").join("\n    ")}` : "") +
          "\n",
      );
    }
  }

  /* --- Tổng kết --------------------------------------------------------- */

  const count = (r: LedgerResult) => outcomes.filter((o) => o.result === r).length;
  // `marginal` không phải đạt: ngưỡng đặt quá sát năng lực thật là thông tin
  // cần thấy, không phải thứ để CI cho qua.
  const failed = count("fail") + count("marginal");
  // Probe rỗng ruột và probe nguy hiểm cũng là hỏng, chỉ khác kiểu: chúng khiến
  // "đã kiểm chứng" trở thành lời nói suông.
  const broken = outcomes.filter((o) => o.result === "unprovable" && !dryRun).length;

  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          ran: outcomes.length,
          cost_usd: spent,
          stopped_for_budget: stoppedForBudget,
          results: outcomes.map((o) => ({
            target: o.target.id,
            result: o.result,
            score: o.score,
            proof: o.proof,
            reason: o.reason,
          })),
        },
        null,
        2,
      ) + "\n",
    );
    return failed > 0 || broken > 0 ? 1 : 0;
  }

  const parts = [
    `${outcomes.length} target`,
    count("pass") ? `${count("pass")} đạt` : "",
    count("fail") ? `${count("fail")} trượt` : "",
    count("marginal") ? `${count("marginal")} sát ngưỡng` : "",
    count("unavailable") ? `${count("unavailable")} không kiểm được` : "",
    broken ? `${broken} chưa chứng minh được` : "",
  ].filter(Boolean);

  process.stdout.write(`\n${parts.join(" · ")}\n`);
  if (spent > 0) process.stdout.write(`chi phí: $${spent.toFixed(4)}\n`);

  if (stoppedForBudget) {
    process.stdout.write(
      `\n⚠ Dừng trước "${stoppedForBudget}" vì đã chạm hạn mức $${budget}. ` +
        `Còn ${selected.length - outcomes.length} target chưa chạy.\n`,
    );
  }

  if (unknownCost.length > 0) {
    process.stdout.write(
      `\n⚠ Chưa có lịch sử chi phí cho: ${unknownCost.join(", ")}.\n` +
        `  Hạn mức không chặn được lần chạy đầu của chúng — lần sau sẽ ước tính được.\n`,
    );
  }

  const unproven = outcomes.filter((o) => o.proof === "unproven").length;
  if (unproven > 0 && !dryRun) {
    process.stdout.write(
      `\n${unproven} probe chưa chứng minh được là có thể fail (ganas không nhận ra dạng để bóp méo).\n` +
        `Chúng vẫn được tính là đạt, nhưng "đạt" ở đây yếu hơn phần còn lại.\n`,
    );
  }

  return failed > 0 || broken > 0 ? 1 : 0;
}
