import {
  checkAllEdges,
  computeDebt,
  type EdgeCheck,
  recordEdgeChecks,
  renderDiagram,
} from "../graph/trace.js";
import { type Argv, flag, option } from "../util/args.js";
import type { LedgerResult } from "../verify/ledger.js";
import { openProject } from "./_common.js";

const MARK: Record<LedgerResult, string> = {
  pass: "✓",
  fail: "✗",
  marginal: "≈",
  unavailable: "…",
  unprovable: "⚠",
};

function edgeLine(check: EdgeCheck): string {
  const { edge } = check;
  const head = `${MARK[check.result]} ${edge.from}/${edge.verificationId} → ${edge.to}`;
  return check.reason ? `${head}\n    ${check.reason}` : head;
}

export async function run(argv: Argv): Promise<number> {
  const { root, graph } = await openProject(argv);

  const checks = await checkAllEdges(graph, root);
  const dryRun = flag(argv, "dry-run");
  if (!dryRun) {
    const by = option(argv, "session") ? `session:${option(argv, "session")}` : "cli";
    await recordEdgeChecks(graph, checks, { root, by });
  }

  const debt = computeDebt(graph, checks);

  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          edges: checks.map((c) => ({
            from: c.edge.from,
            to: c.edge.to,
            verification: c.edge.verificationId,
            result: c.result,
            reason: c.reason,
          })),
          debt,
        },
        null,
        2,
      ) + "\n",
    );
    return debt.length > 0 || checks.some((c) => c.result === "fail") ? 1 : 0;
  }

  if (checks.length === 0) {
    process.stdout.write(
      `Chưa có cạnh contract nào. Thêm \`kind: contract\` vào \`verify\` của khối để kiểm tương thích cổng.\n\n`,
    );
  } else {
    for (const c of checks) process.stdout.write(edgeLine(c) + "\n");
    process.stdout.write("\n");
  }

  if (argv.flags["diagram"] !== false) {
    const edgeResults = new Map(
      checks.map((c) => [`${c.edge.from}/${c.edge.verificationId}`, c.result] as const),
    );
    process.stdout.write("```mermaid\n" + renderDiagram(graph, { edgeResults }) + "\n```\n\n");
  }

  if (debt.length === 0) {
    process.stdout.write("Không có nợ kiểm chứng nào trong sơ đồ.\n");
  } else {
    process.stdout.write(`${debt.length} mục nợ kiểm chứng:\n`);
    for (const item of debt) process.stdout.write(`  · ${item.message}\n`);
  }

  return debt.length > 0 || checks.some((c) => c.result === "fail") ? 1 : 0;
}
