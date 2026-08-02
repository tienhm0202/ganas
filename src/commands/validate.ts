import { loadGraph } from "../graph/load.js";
import { requireGanasRoot } from "../graph/paths.js";
import { countBySeverity, type Diagnostic, type Severity } from "../graph/types.js";
import { validateGraph } from "../graph/validate.js";
import { type Argv, flag, option } from "../util/args.js";

const COLORS = {
  error: "[31m",
  warning: "[33m",
  info: "[36m",
  dim: "[2m",
  reset: "[0m",
} as const;

const LABEL: Record<Severity, string> = { error: "lỗi", warning: "cảnh báo", info: "ghi chú" };

function useColor(): boolean {
  return process.stdout.isTTY === true && !process.env["NO_COLOR"];
}

function paint(text: string, color: keyof typeof COLORS): string {
  return useColor() ? `${COLORS[color]}${text}${COLORS.reset}` : text;
}

function formatDiagnostic(d: Diagnostic): string {
  const where = d.line === undefined ? d.file : `${d.file}:${d.line}`;
  const head = `${where}  ${paint(LABEL[d.severity], d.severity)}  ${paint(d.code, "dim")}`;
  const lines = [head, `  ${d.message}`];
  if (d.hint) lines.push(paint(`  → ${d.hint}`, "dim"));
  return lines.join("\n");
}

/** Thứ tự đọc: theo file, rồi theo dòng — trùng với thứ tự người mở file ra sửa. */
function sortDiagnostics(diags: Diagnostic[]): Diagnostic[] {
  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return [...diags].sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
}

export async function run(argv: Argv): Promise<number> {
  const root = requireGanasRoot(option(argv, "root") ?? process.cwd());
  const graph = await loadGraph(root);
  const diags = sortDiagnostics(validateGraph(graph));
  const counts = countBySeverity(diags);

  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify({ root, counts, diagnostics: diags }, null, 2) + "\n");
    return counts.error > 0 || (flag(argv, "strict") && counts.warning > 0) ? 1 : 0;
  }

  const quiet = flag(argv, "quiet", "q");
  const visible = quiet ? diags.filter((d) => d.severity === "error") : diags;

  for (const d of visible) process.stdout.write(formatDiagnostic(d) + "\n\n");

  const parts: string[] = [];
  if (counts.error) parts.push(`${counts.error} lỗi`);
  if (counts.warning) parts.push(`${counts.warning} cảnh báo`);
  if (counts.info) parts.push(`${counts.info} ghi chú`);

  const size =
    `${graph.goals.size} goal · ${graph.designs.size} design · ${graph.tasks.size} task · ` +
    `${graph.scopes.size} phạm vi · ${graph.modules.size} khối · ` +
    `${graph.facts.size} fact · ${graph.claims.size} claim`;

  if (parts.length === 0) {
    process.stdout.write(`${paint("✓", "info")} graph hợp lệ — ${size}\n`);
    return 0;
  }

  process.stdout.write(`${parts.join(", ")} — ${size}\n`);

  if (counts.error > 0) return 1;
  if (flag(argv, "strict") && counts.warning > 0) return 1;
  return 0;
}
