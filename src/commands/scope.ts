import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { parseDocument } from "yaml";

import { DIRS, ganasPath } from "../graph/paths.js";
import { computeDebt } from "../graph/trace.js";
import type { Graph } from "../graph/types.js";
import { guideFileName, ID_PATTERNS, moduleGuideDir } from "../model/index.js";
import { moduleGuideMd } from "../templates/project.js";
import { type Argv, flag, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { exists, listDir } from "../util/fsprobe.js";
import { matchesAny } from "../util/glob.js";
import { openProject } from "./_common.js";

/**
 * Ghi một bản ghi MỚI — `flag: "wx"` từ chối ghi đè nếu file đã tồn tại
 * (nguyên tử ở tầng filesystem). Bảo vệ trường hợp hai phiên chọn trùng ID
 * gần như đồng thời: kiểm `graph.scopes.has(id)` ở trên chỉ soi graph đã nạp
 * lúc lệnh bắt đầu, không thấy được file phiên kia vừa tạo xong.
 */
async function writeNewYaml(file: string, content: string, describe: string): Promise<void> {
  try {
    await writeFile(file, content, { encoding: "utf8", flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new GanasError(
        `${describe} đã tồn tại (${relative(process.cwd(), file)}) — ` +
          `một phiên khác vừa tạo cùng ID, chọn ID khác.`,
      );
    }
    throw err;
  }
}

/**
 * `ganas scope` — phạm vi công việc là đơn vị mà một câu nói của người dùng
 * được dịch sang. Ba lệnh con, ba vai trò khác nhau:
 *
 *  - `scope`         nhìn: dự án đang có những phạm vi nào, còn nợ gì
 *  - `scope new`     dịch: phỏng vấn 4 câu → một phạm vi có ranh giới thật
 *  - `scope assign`  vá:   tìm fact/claim/task quên khai phạm vi, gợi ý cái đúng
 *
 * Bốn câu của `scope new` chính LÀ phép dịch, ở quy mô một khái niệm: người
 * dùng nói "tôi muốn khách đặt lịch qua Zalo", quản lý dự án hỏi lại bàn giao
 * cái gì / code ở đâu / sao biết là xong / ai ký. Không có bước này thì `scope`
 * chỉ là một trường YAML nữa phải gõ tay, tức là làm chi phí khởi động tệ đi.
 */

/* ------------------------------------------------------------------------- *
 * Liệt kê
 * ------------------------------------------------------------------------- */

interface ScopeRow {
  id: string;
  title: string;
  status: string;
  owner: string | undefined;
  modules: number;
  tasks: number;
  openTasks: number;
  facts: number;
  claims: number;
  acceptance: Array<{ id: string; freshness: string }>;
  debt: number;
}

function rowsOf(graph: Graph, freshness: Map<string, { freshness: string }>): ScopeRow[] {
  const debtByScope = new Map<string, number>();
  for (const item of computeDebt(graph, [])) {
    const sc = item.moduleId ? graph.modules.get(item.moduleId)?.value.scope : undefined;
    if (sc) debtByScope.set(sc, (debtByScope.get(sc) ?? 0) + 1);
  }

  const rows: ScopeRow[] = [];
  for (const [id, sourced] of graph.scopes) {
    const sc = sourced.value;
    const tasks = [...graph.tasks.values()].filter((t) => t.value.scope === id);
    rows.push({
      id,
      title: sc.title,
      status: sc.status,
      owner: sc.owner,
      modules: sc.modules.length,
      tasks: tasks.length,
      openTasks: tasks.filter((t) => t.value.status !== "done").length,
      facts: [...graph.facts.values()].filter((f) => f.value.scope === id).length,
      claims: [...graph.claims.values()].filter((c) => c.value.scope === id).length,
      acceptance: sc.acceptance.map((a) => ({
        id: a.id,
        freshness: freshness.get(`${id}/${a.id}`)?.freshness ?? "never_verified",
      })),
      debt: debtByScope.get(id) ?? 0,
    });
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

function formatRows(rows: ScopeRow[]): string {
  if (rows.length === 0) {
    return (
      `Chưa có phạm vi công việc nào.\n\n` +
      `Phạm vi là ranh giới của cả việc lẫn tri thức — task, fact, claim đều phải\n` +
      `thuộc về một cái. Tạo cái đầu tiên:\n\n  ganas scope new\n`
    );
  }

  const lines: string[] = [];
  for (const r of rows) {
    const notReady = r.acceptance.filter((a) => a.freshness !== "fresh");
    lines.push(
      `${r.id} — ${r.title}\n` +
        `  ${r.status}` +
        (r.owner ? ` · nghiệm thu ${r.owner}` : ` · ⚠ chưa ai ký`) +
        ` · ${r.modules} khối · ${r.openTasks}/${r.tasks} task chưa xong` +
        ` · ${r.facts} fact · ${r.claims} claim`,
    );

    if (r.acceptance.length === 0) {
      lines.push(`  ⚠ chưa có tiêu chí nghiệm thu — "bàn giao xong" sẽ là ý kiến`);
    } else if (notReady.length === 0) {
      lines.push(`  ✓ nghiệm thu: ${r.acceptance.length}/${r.acceptance.length} còn tươi`);
    } else {
      lines.push(
        `  ⚠ nghiệm thu: ${notReady.map((a) => `${a.id} (${a.freshness})`).join(", ")}` +
          ` — chạy \`ganas verify --scope ${r.id}\``,
      );
    }
    if (r.debt > 0)
      lines.push(`  ⚠ ${r.debt} mục nợ kiểm chứng — xem \`ganas trace --scope ${r.id}\``);
    lines.push("");
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------------- *
 * scope new — bước dịch
 * ------------------------------------------------------------------------- */

async function prompt(question: string, fallback = ""): Promise<string> {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = fallback ? ` [${fallback}]` : "";
    return (await rl.question(`${question}${suffix}: `)).trim() || fallback;
  } finally {
    rl.close();
  }
}

const SLUG_MAX = 40;

/**
 * Tiếng Việt có dấu → slug ASCII hợp `^[a-z0-9][a-z0-9-]*$`.
 *
 * Cắt ở BIÊN TỪ, không cắt cứng ở ký tự thứ 40. Id xuất hiện trong mọi brief,
 * mọi commit message, mọi `depends_on` — một id kết thúc bằng `...-va-ch` (cắt
 * giữa "và chỉ") làm hỏng khả năng đọc của tất cả những chỗ đó. Một từ dài hơn
 * cả giới hạn thì đành cắt cứng, vì không còn biên nào để cắt.
 */
export function slugify(text: string): string {
  const full = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  let base = full;
  if (base.length > SLUG_MAX) {
    const cut = base.slice(0, SLUG_MAX);
    const lastBoundary = cut.lastIndexOf("-");
    base = (lastBoundary > 0 ? cut.slice(0, lastBoundary) : cut).replace(/-+$/, "");
  }
  return /^[a-z0-9]/.test(base) ? base : `x-${base}`;
}

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function scopeYaml(a: {
  id: string;
  title: string;
  owner: string;
  moduleIds: string[];
  accept: string;
}): string {
  return `id: ${a.id}
title: ${JSON.stringify(a.title)}
version: 0.1.0
${a.owner ? `owner: "${a.owner}"` : `# owner: "@ten" — không ai ký thì không ai nghiệm thu được`}
status: active

# Ranh giới code của phạm vi. Fact/claim chỉ được coi là đúng BÊN TRONG đây.
modules:
${a.moduleIds.map((m) => `  - ${m}`).join("\n")}
entry: ${a.moduleIds[0]}

# Nghiệm thu chạy trên LUỒNG ĐÃ GHÉP, không phải tổng nghiệm thu từng khối —
# một luồng có thể đúng ở từng khối mà vẫn sai khi ghép.
acceptance:
  - id: V-${a.id.replace(/^P-/, "")}-e2e
    kind: probe
    run: ${JSON.stringify(a.accept)}
`;
}

function moduleYaml(a: {
  id: string;
  scopeId: string;
  title: string;
  paths: string[];
  nature?: string;
  dependsOn?: string[];
}): string {
  return `id: ${a.id}
scope: ${a.scopeId}
title: ${JSON.stringify(a.title)}
# code | data | io | llm — khối \`llm\` BẮT BUỘC có eval, probe không kiểm được
# hành vi của LLM. Khối \`io\` là nơi CHẠM I/O thật; lõi không tự mở file, tự gọi
# network hay tự query DB — xem .claude/rules/architecture.md.
nature: ${a.nature ?? "code"}
paths:
${a.paths.map((p) => `  - ${JSON.stringify(p)}`).join("\n")}
${a.dependsOn?.length ? `depends_on:\n${a.dependsOn.map((d) => `  - ${d}`).join("\n")}\n` : ""}status: surveyed
verify: []
`;
}

/**
 * Glob này trỏ vào vùng CHẠM I/O hay vùng lõi?
 *
 * Nhận theo tên đoạn đường dẫn, vì đó là quy ước mà chính
 * `.claude/rules/architecture.md` phát cho dự án. Đoán sai chỉ tốn một lần sửa
 * `nature` bằng tay; gộp tất cả vào một khối `code` thì sinh ra một khối vi
 * phạm luật kiến trúc ngay từ lúc tạo, và không ai được báo.
 */
const IO_SEGMENT =
  /(^|\/)(io|store|stores|adapter|adapters|infra|infrastructure|repo|repository|repositories|gateway|client|clients)(\/|$)/;

export function looksLikeIoGlob(glob: string): boolean {
  return IO_SEGMENT.test(glob.replace(/\*+/g, ""));
}


/**
 * Sinh khung file hướng dẫn ở thư mục gốc của khối vừa tạo.
 *
 * Ba lần KHÔNG ghi, mỗi lần một lý do:
 *
 *  - Khối không nhận cả một thư mục (`moduleGuideDir` trả `undefined`) — không
 *    có chỗ nào đúng để đặt, xem docstring của hàm đó.
 *  - Thư mục chưa tồn tại — khối vừa khai một vùng code CHƯA có code. Tạo cây
 *    thư mục rỗng chỉ để chứa một file TODO là bày rác trước khi có việc.
 *  - File đã có — không bao giờ đè. Một file hướng dẫn viết tay bị khung TODO
 *    ghi đè là mất chữ không lấy lại được, và đây là lệnh người ta chạy lại
 *    nhiều lần.
 *
 * Lỗi ghi file KHÔNG được làm hỏng `scope new`: phạm vi và khối đã vào đĩa rồi,
 * ném ở đây thì người dùng thấy lệnh "thất bại" trong khi phần quan trọng đã
 * xong. Báo ra stdout rồi đi tiếp.
 */
async function writeModuleGuide(
  root: string,
  graph: Graph,
  mod: Parameters<typeof moduleYaml>[0],
): Promise<void> {
  const dir = moduleGuideDir(mod.paths);
  if (dir === undefined) return;

  const absDir = join(root, dir);
  if (!exists(absDir)) return;

  const file = join(absDir, guideFileName(graph.config.harness));
  if (exists(file)) return;

  const body = moduleGuideMd({
    id: mod.id,
    title: mod.title,
    dir,
    nature: mod.nature ?? "code",
    probes: [],
  });

  try {
    await writeFile(file, body, { encoding: "utf8", flag: "wx" });
    process.stdout.write(`  ${relative(root, file)} (khung file hướng dẫn của vùng)\n`);
  } catch {
    process.stdout.write(
      `  ⚠ không ghi được ${relative(root, file)} — tạo tay, hoặc \`ganas validate\` sẽ nhắc.\n`,
    );
  }
}

async function runNew(argv: Argv, root: string, graph: Graph): Promise<number> {
  const interactive = process.stdin.isTTY && !flag(argv, "yes", "y");

  const title = option(argv, "title") ?? (interactive ? await prompt("Bàn giao cái gì?") : "");
  if (!title) throw new GanasError(`thiếu --title (bàn giao cái gì?)`);

  const pathsRaw =
    option(argv, "paths") ??
    (interactive ? await prompt("Code nằm ở đâu? (glob, cách nhau bởi dấu phẩy)") : "");
  const paths = splitList(pathsRaw);
  if (paths.length === 0) throw new GanasError(`thiếu --paths (code nằm ở đâu?)`);

  const accept =
    option(argv, "accept") ?? (interactive ? await prompt("Làm sao biết là xong? (lệnh)") : "");
  if (!accept) throw new GanasError(`thiếu --accept (làm sao biết là xong?)`);

  const owner = option(argv, "owner") ?? (interactive ? await prompt("Ai ký nghiệm thu?") : "");
  if (owner && !/^@[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(owner)) {
    throw new GanasError(`owner phải dạng "@ten", nhận được "${owner}"`);
  }

  // Hỏi id là câu thứ 5. Trước đây phỏng vấn chỉ hỏi 4 câu và id luôn suy từ
  // tiêu đề, nên người dùng TTY không có đường đặt id trừ khi biết cờ `--id` —
  // mà id là thứ xuất hiện trong mọi brief, mọi commit, mọi `depends_on`.
  const suggested = `P-${slugify(title)}`;
  const id = option(argv, "id") ?? (interactive ? await prompt("Id phạm vi?", suggested) : suggested);
  if (!ID_PATTERNS.scope.test(id)) {
    throw new GanasError(`id phạm vi phải dạng "P-ten-ngan", nhận được "${id}"`);
  }
  if (graph.scopes.has(id)) throw new GanasError(`phạm vi ${id} đã tồn tại`);

  // Khối đã có mà paths giao với glob vừa khai thì dùng lại — đừng đẻ khối trùng
  // vùng code, vì hai khối cùng trỏ một chỗ là hai bản đồ lệch nhau.
  const reused = [...graph.modules.values()]
    .filter((m) => m.value.paths.some((p) => paths.some((q) => p === q || matchesAny(p, [q]))))
    .map((m) => m.value.id);

  // Khối mới bám theo ID PHẠM VI, không phải tiêu đề: người gõ `--id P-thanh-toan`
  // mà nhận về `M-xu-ly-webhook-thanh-toan` là hai cách đặt tên lệch nhau ngay
  // trong một lệnh. `acceptance.id` cũng suy từ id phạm vi, giữ cho nhất quán.
  const created: string[] = [];
  const stem = id.replace(/^P-/, "");

  // Tách lõi khỏi I/O ngay lúc tạo. Gộp cả hai vào một khối `nature: code` là
  // sinh ra một khối vi phạm đúng luật kiến trúc mà ganas vừa phát cho dự án
  // (.claude/rules/architecture.md): khối `code` là LÕI, không tự chạm ra ngoài.
  const ioPaths = paths.filter(looksLikeIoGlob);
  const corePaths = paths.filter((p) => !looksLikeIoGlob(p));
  const split = reused.length === 0 && ioPaths.length > 0 && corePaths.length > 0;

  const moduleIds =
    reused.length > 0 ? reused : split ? [`M-${stem}`, `M-${stem}-io`] : [`M-${stem}`];

  if (reused.length === 0) {
    const write = async (mod: Parameters<typeof moduleYaml>[0]): Promise<void> => {
      const file = ganasPath(root, DIRS.modules, `${mod.id}.yaml`);
      await mkdir(dirname(file), { recursive: true });
      await writeNewYaml(file, moduleYaml(mod), `khối ${mod.id}`);
      created.push(relative(root, file));
      await writeModuleGuide(root, graph, mod);
    };

    if (split) {
      await write({ id: `M-${stem}`, scopeId: id, title, paths: corePaths });
      // Adapter cài đặt port do lõi định nghĩa ⇒ io phụ thuộc lõi, không ngược lại.
      await write({
        id: `M-${stem}-io`,
        scopeId: id,
        title: `${title} — I/O`,
        paths: ioPaths,
        nature: "io",
        dependsOn: [`M-${stem}`],
      });
    } else {
      await write({ id: moduleIds[0]!, scopeId: id, title, paths });
    }
  }

  const scopeFile = ganasPath(root, DIRS.scopes, `${id}.yaml`);
  await mkdir(dirname(scopeFile), { recursive: true });
  await writeNewYaml(
    scopeFile,
    scopeYaml({ id, title, owner, moduleIds, accept }),
    `phạm vi ${id}`,
  );
  created.unshift(relative(root, scopeFile));

  process.stdout.write(
    `Đã tạo phạm vi ${id} — ${title}\n\n` +
      created.map((f) => `  ${f}\n`).join("") +
      (reused.length > 0
        ? `\nDùng lại khối đã có: ${reused.join(", ")} (paths giao với glob vừa khai).\n` +
          `  ⚠ Khối đó đang khai \`scope\` khác thì phải sửa tay — hai chiều phải khớp.\n`
        : split
          ? `\nTách thành HAI khối theo luật kiến trúc (.claude/rules/architecture.md):\n` +
            `  \`M-${stem}\`    — lõi (\`nature: code\`), không tự chạm I/O\n` +
            `  \`M-${stem}-io\` — nơi chạm I/O thật, \`depends_on: [M-${stem}]\`\n` +
            `Chia sai thì đổi \`paths\`/\`nature\` bằng tay — ganas đoán theo tên thư mục.\n`
          : `\nKhối \`${moduleIds[0]}\` được tạo với \`nature: code\` (LÕI — không tự mở file,\n` +
            `tự gọi network hay tự query DB). Vùng chạm I/O phải là khối \`nature: io\`\n` +
            `riêng; vùng có GỌI LLM thì \`nature: llm\`, và khi đó bắt buộc phải có eval\n` +
            `vì probe kiểm được cấu trúc nhưng không kiểm được hành vi của LLM.\n`) +
      `\nTiếp theo: \`ganas validate\`, rồi tạo task trong .ganas/tasks/ khai \`scope: ${id}\`.\n`,
  );
  return 0;
}

/* ------------------------------------------------------------------------- *
 * scope assign — vá chỗ quên khai
 * ------------------------------------------------------------------------- */

interface Missing {
  file: string;
  id: string;
  kind: "fact" | "claim" | "task";
  hints: string[];
}

/**
 * Quét YAML THÔ, không qua graph: `scope` là trường bắt buộc, nên bản ghi thiếu
 * nó không bao giờ nạp được vào graph — chính là lúc người ta cần lệnh này nhất.
 */
async function scanMissing(root: string, graph: Graph): Promise<Missing[]> {
  const out: Missing[] = [];
  const pathsOf = new Map<string, string[]>();
  for (const [, m] of graph.modules) {
    if (m.value.scope) pathsOf.set(m.value.id, m.value.paths);
  }
  const scopeOfModule = (moduleId: string): string | undefined =>
    graph.modules.get(moduleId)?.value.scope;

  const guessByPath = (candidates: string[]): string[] => {
    const hits = new Set<string>();
    for (const [moduleId, globs] of pathsOf) {
      if (candidates.some((p) => matchesAny(p, globs))) {
        const sc = scopeOfModule(moduleId);
        if (sc) hits.add(sc);
      }
    }
    return [...hits].sort();
  };

  for (const [dir, kind] of [
    [DIRS.facts, "fact"],
    [DIRS.claims, "claim"],
    [DIRS.tasks, "task"],
  ] as const) {
    const abs = ganasPath(root, dir);
    if (!exists(abs)) continue;
    for (const entry of await listDir(abs)) {
      if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
      const file = join(abs, entry.name);
      const doc = parseDocument(await readFile(file, "utf8"));
      const value = doc.toJS() as unknown;
      const items = Array.isArray(value) ? value : [value];

      for (const item of items) {
        if (typeof item !== "object" || item === null) continue;
        const rec = item as Record<string, unknown>;
        if (typeof rec["id"] !== "string" || rec["scope"] !== undefined) continue;

        const candidates: string[] = [];
        if (Array.isArray(rec["depends_on"])) {
          for (const g of rec["depends_on"]) if (typeof g === "string") candidates.push(g);
        }
        if (Array.isArray(rec["anchors"])) {
          for (const a of rec["anchors"]) {
            if (typeof a === "string") candidates.push(a.split("#")[0]!.split(":")[0]!);
            else if (typeof a === "object" && a !== null) {
              const p = (a as Record<string, unknown>)["path"];
              if (typeof p === "string") candidates.push(p);
            }
          }
        }

        let hints = guessByPath(candidates);
        // Task có đường suy chắc chắn hơn nhiều: khối nó chạm đã khai phạm vi rồi.
        if (Array.isArray(rec["touches"])) {
          const viaTouches = new Set<string>();
          for (const m of rec["touches"]) {
            if (typeof m === "string") {
              const sc = scopeOfModule(m);
              if (sc) viaTouches.add(sc);
            }
          }
          if (viaTouches.size > 0) hints = [...viaTouches].sort();
        }

        out.push({ file: relative(root, file), id: rec["id"], kind, hints });
      }
    }
  }
  return out;
}

async function fillScope(root: string, m: Missing, scopeId: string): Promise<void> {
  const abs = join(root, m.file);
  const doc = parseDocument(await readFile(abs, "utf8"));
  const value = doc.toJS() as unknown;

  if (Array.isArray(value)) {
    const idx = value.findIndex(
      (v) => typeof v === "object" && v !== null && (v as Record<string, unknown>)["id"] === m.id,
    );
    if (idx === -1) return;
    doc.setIn([idx, "scope"], scopeId);
  } else {
    doc.setIn(["scope"], scopeId);
  }
  // Ghi qua Document để giữ nguyên comment — chính là kỹ thuật `writeBackFact()`
  // dùng cho fact sau khi verify.
  await writeFile(abs, doc.toString(), "utf8");
}

async function runAssign(argv: Argv, root: string, graph: Graph): Promise<number> {
  const missing = await scanMissing(root, graph);
  const write = flag(argv, "write");

  if (missing.length === 0) {
    process.stdout.write(`Mọi fact/claim/task đều đã khai phạm vi.\n`);
    return 0;
  }

  const resolved = missing.filter((m) => m.hints.length === 1);
  const ambiguous = missing.filter((m) => m.hints.length !== 1);

  const lines: string[] = [];
  if (resolved.length > 0) {
    lines.push(`${resolved.length} bản ghi suy được phạm vi:`);
    for (const m of resolved) lines.push(`  ${m.id} (${m.kind}) → ${m.hints[0]}   ${m.file}`);
    lines.push("");
  }
  if (ambiguous.length > 0) {
    // Không đoán: khớp 0 hoặc ≥2 phạm vi thì người quyết. Gán bừa một phạm vi
    // sai còn tệ hơn để trống, vì nó im lặng và trông như đã xong.
    lines.push(`${ambiguous.length} bản ghi KHÔNG suy được — phải tự quyết:`);
    for (const m of ambiguous) {
      lines.push(
        `  ${m.id} (${m.kind}) — ${m.hints.length === 0 ? "không khớp phạm vi nào" : `khớp nhiều: ${m.hints.join(", ")}`}   ${m.file}`,
      );
    }
    lines.push("");
  }

  if (!write) {
    lines.push(`Đây là dry-run. Ghi thật: \`ganas scope assign --write\``);
    lines.push(`  (chỉ ghi ${resolved.length} bản ghi suy được; phần mơ hồ giữ nguyên)`);
    process.stdout.write(lines.join("\n") + "\n");
    return 0;
  }

  for (const m of resolved) await fillScope(root, m, m.hints[0]!);
  lines.push(`Đã ghi ${resolved.length} bản ghi. Chạy \`ganas validate\` để kiểm lại.`);
  process.stdout.write(lines.join("\n") + "\n");
  return ambiguous.length > 0 ? 1 : 0;
}

/* ------------------------------------------------------------------------- *
 * Router
 * ------------------------------------------------------------------------- */

export async function run(argv: Argv): Promise<number> {
  const sub = argv.positional[0];
  const { root, graph, freshness } = await openProject(argv);

  if (sub === "new") return runNew(argv, root, graph);
  if (sub === "assign") return runAssign(argv, root, graph);
  if (sub !== undefined) {
    throw new GanasError(`lệnh con không biết: "${sub}" — có: new, assign`);
  }

  const rows = rowsOf(graph, freshness);
  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    return 0;
  }
  process.stdout.write(formatRows(rows));
  return 0;
}
