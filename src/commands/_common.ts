import { computeFreshness, type FactFreshness } from "../graph/freshness.js";
import { loadGraph } from "../graph/load.js";
import { requireGanasRoot } from "../graph/paths.js";
import type { Graph } from "../graph/types.js";
import { type Argv, option } from "../util/args.js";
import { runShell } from "../util/exec.js";

export interface OpenedProject {
  root: string;
  graph: Graph;
  freshness: Map<string, FactFreshness>;
}

export async function openProject(argv: Argv): Promise<OpenedProject> {
  const root = requireGanasRoot(option(argv, "root") ?? process.cwd());
  const graph = await loadGraph(root);
  const freshness = await computeFreshness(graph);
  return { root, graph, freshness };
}

/**
 * Phần trạng thái biến động của brief.
 *
 * Luôn nằm ở CUỐI brief: prompt cache khớp theo tiền tố, nên mọi thứ đổi theo
 * từng lần chạy phải đứng sau phần ổn định.
 */
export async function volatileStatus(root: string): Promise<string> {
  const [branch, status] = await Promise.all([
    runShell("git rev-parse --abbrev-ref HEAD", { cwd: root, timeoutMs: 5000 }),
    runShell("git status --porcelain", { cwd: root, timeoutMs: 5000 }),
  ]);

  const lines: string[] = ["*Trạng thái lúc mở phiên (phần này đổi mỗi lần chạy):*", ""];

  if (branch.code === 0) {
    const dirty = status.stdout.split("\n").filter((l) => l.trim()).length;
    lines.push(
      `- nhánh \`${branch.stdout.trim()}\`` +
        (dirty > 0 ? ` · ${dirty} file đang sửa dở` : " · cây làm việc sạch"),
    );
  }
  lines.push(`- thời điểm: ${new Date().toISOString()}`);

  return lines.join("\n");
}
