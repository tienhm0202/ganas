import { mkdir } from "node:fs/promises";
import { dirname, relative } from "node:path";

import type { VerificationState } from "../graph/freshness.js";
import { freshnessMark } from "../graph/freshness.js";
import { DIRS, ganasPath } from "../graph/paths.js";
import type { Graph, Sourced } from "../graph/types.js";
import {
  type ArtifactIssue,
  artifactIssues,
  type Design,
  ID_PATTERNS,
} from "../model/index.js";
import { type Argv, flag, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { artifactTargets, runTarget } from "../verify/run.js";
import { openProject } from "./_common.js";
import { prompt, writeNewYaml } from "./scope.js";

/**
 * `ganas design` — bốn lệnh con cho design (chặng): xem sơ đồ chặng đang ở
 * đâu, phỏng vấn tạo một chặng mới, xem chi tiết một chặng, và chấm bản vẽ
 * của nó với code thật.
 *
 * `list`/`show` CHỈ ĐỌC — không được ghi đĩa, xem bất biến ở
 * `src/commands/CLAUDE.md`. `check` là khuôn của `ganas trace`: chạy
 * `runTarget()` trên `artifactTargets()`, ghi sổ cái (trừ `--dry-run`), và
 * dịch `artifactIssues()` (nguồn quyết DUY NHẤT cho lệch cấu trúc — xem
 * docstring của nó ở `src/model/design.ts`) sang chữ cho người đọc.
 */

function requireDesign(graph: Graph, id: string | undefined): Sourced<Design> {
  if (!id) {
    throw new GanasError(
      `thiếu id design (vd \`ganas design show D-010\`) — xem \`ganas design\` để liệt kê.`,
    );
  }
  const found = graph.designs.get(id);
  if (!found) throw new GanasError(`không có design ${id} trong graph — xem \`ganas design\`.`);
  return found;
}

function issuesOf(graph: Graph, d: Design): ArtifactIssue[] {
  return artifactIssues(d, (id) => graph.modules.get(id)?.value);
}

/* ------------------------------------------------------------------------- *
 * list — bảng chặng
 * ------------------------------------------------------------------------- */

interface DesignRow {
  id: string;
  title: string;
  status: string;
  artifacts: number;
  fresh: number;
}

/** Số dòng tối đa in ra khi gọi trực tiếp `ganas design` — quy ước của `debt`/`search`. */
const LIST_LIMIT = 30;

function rowsOf(graph: Graph, freshness: Map<string, VerificationState>): DesignRow[] {
  const rows: DesignRow[] = [];
  for (const [id, sourced] of graph.designs) {
    const d = sourced.value;
    const fresh = d.artifacts.filter(
      (a) => a.probe && freshness.get(`${id}/${a.id}`)?.freshness === "fresh",
    ).length;
    rows.push({ id, title: d.title, status: d.status, artifacts: d.artifacts.length, fresh });
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

function formatRows(rows: DesignRow[]): string {
  if (rows.length === 0) {
    return (
      `Chưa có chặng (design) nào.\n\n` +
      `Design là chặng thiết kế phục vụ một goal. Tạo cái đầu tiên:\n\n  ganas design new\n`
    );
  }

  const shown = rows.slice(0, LIST_LIMIT);
  const lines = shown.map(
    (r) =>
      `${r.id} — ${r.title}\n` +
      `  ${r.status} · ${r.artifacts} bản vẽ` +
      (r.artifacts > 0 ? ` · ${r.fresh}/${r.artifacts} còn tươi` : ""),
  );

  let out = lines.join("\n\n") + "\n";
  const omitted = rows.length - shown.length;
  if (omitted > 0) {
    out += `\n… đã bỏ bớt ${omitted} chặng (in ${shown.length}/${rows.length}) — dùng \`ganas design --json\`.\n`;
  }
  return out;
}

function runList(argv: Argv, graph: Graph, freshness: Map<string, VerificationState>): number {
  const rows = rowsOf(graph, freshness);
  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    return 0;
  }
  process.stdout.write(formatRows(rows));
  return 0;
}

/* ------------------------------------------------------------------------- *
 * show — chi tiết một chặng
 * ------------------------------------------------------------------------- */

function runShow(argv: Argv, graph: Graph, freshness: Map<string, VerificationState>): number {
  const sourced = requireDesign(graph, argv.positional[1]);
  const d = sourced.value;
  const issues = issuesOf(graph, d);

  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          ...d,
          artifacts: d.artifacts.map((a) => ({
            ...a,
            freshness: a.probe ? (freshness.get(`${d.id}/${a.id}`)?.freshness ?? "never_verified") : null,
          })),
          issues,
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  const lines: string[] = [
    `# ${d.id} — ${d.title}`,
    `trạng thái \`${d.status}\` · phục vụ ${d.serves.join(", ")}`,
    d.summary.trim(),
  ];

  if (d.artifacts.length === 0) {
    lines.push(
      `Chưa có bản vẽ nào. Thêm vào \`artifacts:\` của .ganas/designs/${d.id}.yaml, ` +
        `rồi \`ganas design check ${d.id}\`.`,
    );
  } else {
    const rows = d.artifacts.map((a) => {
      const state = a.probe ? freshness.get(`${d.id}/${a.id}`) : undefined;
      return (
        `${freshnessMark(state)} ${a.id} (${a.kind}) — khối ${a.module}\n` +
        `    ${a.shape}` +
        (a.probe ? "" : `\n    ⚠ chưa có \`probe\` — chưa có gì đối chiếu với code thật`)
      );
    });
    lines.push(`## Bản vẽ (${d.artifacts.length})\n\n` + rows.join("\n\n"));
  }

  if (issues.length > 0) {
    lines.push(
      `## Lệch cấu trúc (${issues.length})\n\n` +
        issues.map((i) => `⚠ [${i.code}] ${i.message}\n    ${i.hint}`).join("\n\n"),
    );
  }

  if (d.exit_contract.length === 0) {
    lines.push(
      `⚠ chặng chưa khai \`exit_contract\` — \`ganas gate --design ${d.id}\` sẽ báo thiếu.`,
    );
  }

  process.stdout.write(lines.join("\n\n") + "\n");
  return 0;
}

/* ------------------------------------------------------------------------- *
 * new — phỏng vấn tạo chặng
 * ------------------------------------------------------------------------- */

function splitCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Số D-xxx lớn nhất đang dùng trong graph, để gợi ý id kế tiếp — cùng công thức `maxNumber` của `ganas id`. */
function nextDesignId(graph: Graph): string {
  let max = 0;
  for (const id of graph.designs.keys()) {
    if (!ID_PATTERNS.design.test(id)) continue;
    const n = Number(id.slice("D-".length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `D-${String(max + 1).padStart(3, "0")}`;
}

function designYaml(a: { id: string; title: string; serves: string[]; summary: string }): string {
  return `id: ${a.id}
title: ${JSON.stringify(a.title)}
serves:
${a.serves.map((g) => `  - ${g}`).join("\n")}
summary: ${JSON.stringify(a.summary)}
status: draft

# Bản vẽ của chặng — hình dạng mà code phải khớp. Mỗi bản vẽ cần \`probe\` mới
# chấm được — xem \`.claude/rules/ganas-knowledge.md\` và src/model/design.ts.
artifacts: []

# Hợp đồng ra của chặng — \`ganas gate --design ${a.id}\` chấm mảng này.
exit_contract: []
`;
}

async function runNew(argv: Argv, root: string, graph: Graph): Promise<number> {
  const interactive = process.stdin.isTTY && !flag(argv, "yes", "y");

  const title =
    option(argv, "title") ?? (interactive ? await prompt("Chặng này tên gì?") : "");
  if (!title) throw new GanasError(`thiếu --title (chặng này tên gì?)`);

  const servesRaw =
    option(argv, "serves") ??
    (interactive ? await prompt("Phục vụ goal nào? (id, cách nhau bởi dấu phẩy)") : "");
  const serves = splitCsv(servesRaw);
  if (serves.length === 0) {
    throw new GanasError(`thiếu --serves (chặng này phục vụ goal nào? vd --serves G-001)`);
  }
  for (const g of serves) {
    if (!ID_PATTERNS.goal.test(g)) {
      throw new GanasError(`--serves chứa id không hợp lệ "${g}" — goal phải dạng "G-001"`);
    }
  }

  const summary =
    option(argv, "summary") ?? (interactive ? await prompt("Tóm tắt cách tiếp cận?") : "");
  if (!summary) throw new GanasError(`thiếu --summary (tóm tắt cách tiếp cận?)`);

  const suggested = nextDesignId(graph);
  const id = option(argv, "id") ?? (interactive ? await prompt("Id design?", suggested) : suggested);
  if (!ID_PATTERNS.design.test(id)) {
    throw new GanasError(`id design phải dạng "D-001", nhận được "${id}"`);
  }
  if (graph.designs.has(id)) throw new GanasError(`design ${id} đã tồn tại`);

  const file = ganasPath(root, DIRS.designs, `${id}.yaml`);
  await mkdir(dirname(file), { recursive: true });
  await writeNewYaml(file, designYaml({ id, title, serves, summary }), `design ${id}`);

  process.stdout.write(
    `Đã tạo ${id} — ${title}\n\n  ${relative(root, file)}\n\n` +
      `Tiếp theo: \`ganas validate\`, rồi thêm \`artifacts\` khi hình dạng đã rõ ` +
      `(\`ganas design check ${id}\` chấm chúng với code thật), và \`exit_contract\` khi ` +
      `biết chặng đóng được thế nào.\n`,
  );
  return 0;
}

/* ------------------------------------------------------------------------- *
 * check — chấm bản vẽ với code thật, khuôn của `ganas trace`
 * ------------------------------------------------------------------------- */

async function runCheck(
  argv: Argv,
  root: string,
  graph: Graph,
  freshness: Map<string, VerificationState>,
): Promise<number> {
  const idArg = argv.positional[1];
  const designs: Sourced<Design>[] = idArg
    ? [requireDesign(graph, idArg)]
    : [...graph.designs.values()].filter((d) => d.value.status === "active");

  const dryRun = flag(argv, "dry-run");
  const skipMutation = argv.flags["mutation"] === false;
  const by = option(argv, "session") ? `session:${option(argv, "session")}` : "cli";

  if (designs.length === 0) {
    process.stdout.write(`Không có chặng nào đang \`active\` để chấm.\n`);
    return 0;
  }

  let structuralIssue = false;
  let notClean = false;
  const lines: string[] = [];
  const jsonOut: Array<Record<string, unknown>> = [];

  for (const sourced of designs) {
    const d = sourced.value;
    const issues = issuesOf(graph, d);
    if (issues.length > 0) structuralIssue = true;

    const targets = artifactTargets(sourced, graph);
    const results: Array<{ target: string; result?: string; reason?: string }> = [];

    lines.push(`## ${d.id} — ${d.title}`);

    if (d.artifacts.length === 0) {
      lines.push(`  chưa có bản vẽ nào — không có gì để chấm.`);
    } else if (targets.length === 0) {
      lines.push(
        `  ${d.artifacts.length} bản vẽ, nhưng chưa cái nào có \`probe\` — không có gì chạy được.`,
      );
    }

    for (const target of targets) {
      const outcome = await runTarget(target, { root, by, skipMutation, dryRun });

      if (dryRun) {
        const state = freshness.get(target.id);
        if (state?.freshness !== "fresh") notClean = true;
        lines.push(`  → ${target.label} — sẽ chạy. Hiện tại: ${freshnessMark(state)}`);
        results.push({ target: target.id });
      } else {
        const ok = outcome.result === "pass";
        if (!ok) notClean = true;
        lines.push(
          `  ${ok ? "✓" : "✗"} ${target.label}` + (outcome.reason ? `\n      ${outcome.reason}` : ""),
        );
        results.push({ target: target.id, result: outcome.result, reason: outcome.reason });
      }
    }

    for (const issue of issues) {
      lines.push(`  ⚠ [${issue.code}] ${issue.message}\n      ${issue.hint}`);
    }

    jsonOut.push({ id: d.id, issues, results });
  }

  const exitCode = structuralIssue || notClean ? 1 : 0;

  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify({ dryRun, designs: jsonOut }, null, 2) + "\n");
    return exitCode;
  }

  process.stdout.write(lines.join("\n") + "\n");
  return exitCode;
}

/* ------------------------------------------------------------------------- *
 * Router
 * ------------------------------------------------------------------------- */

export async function run(argv: Argv): Promise<number> {
  const sub = argv.positional[0];
  const { root, graph, freshness } = await openProject(argv);

  switch (sub) {
    case "new":
      return runNew(argv, root, graph);
    case undefined:
    case "list":
      return runList(argv, graph, freshness);
    case "show":
      return runShow(argv, graph, freshness);
    case "check":
      return runCheck(argv, root, graph, freshness);
    default:
      throw new GanasError(`lệnh con không biết: "${sub}" — có: list, new, show, check`);
  }
}
