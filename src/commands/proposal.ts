import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { parseDocument } from "yaml";

import { reserveId, withFileLock } from "../graph/claim.js";
import { DIRS, GANAS_DIR, ganasPath } from "../graph/paths.js";
import type { Graph, Sourced } from "../graph/types.js";
import { formatAnchor, ID_PATTERNS, type Proposal, type ScoreValue } from "../model/index.js";
import { type Argv, flag, multiOption, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { openProject } from "./_common.js";
import { scopeFromClaimedTask } from "./debt.js";

/**
 * `ganas proposal` — chỗ lệch CHƯA ai quyết (xem docstring `src/model/proposal.ts`).
 *
 * Năm lệnh con, và ranh giới giữa chúng là ranh giới giữa MÁY và NGƯỜI:
 * `new`/`list`/`show` là việc của phiên làm việc; `approve`/`reject` là câu trả
 * lời của người, nên cả hai đều đòi `--by @ai-đó` và không có mặc định.
 *
 * ## Vì sao `list` sắp theo `weight + ease`
 *
 * PR-001 (bị từ chối 2026-08-21) chốt rằng đề xuất KHÔNG vào bảng `ganas debt`
 * — nên đây là chỗ DUY NHẤT hai điểm đó được đọc. Bỏ phép sắp này đi là biến
 * `weight`/`ease` thành hai trường người dùng phải điền mà không có tác dụng
 * gì, đúng thứ guard "trường schema không ai đọc" của repo đang cấm.
 */

/** TTL khoá file khi sửa tại chỗ — mili giây, chỉ sống qua một lượt đọc-sửa-ghi. Cùng khuôn `ganas icebox`. */
const PROPOSAL_LOCK_TTL_MS = 5000;

function relFileOf(id: string): string {
  return `${GANAS_DIR}/${DIRS.proposals}/${id}.yaml`;
}

function lockFileOf(root: string, id: string): string {
  return ganasPath(root, DIRS.locks, `proposal-${id}.lock`);
}

/** Đặt chỗ id PR-xxx kế tiếp — cùng cơ chế `reserveId` mà `ganas icebox add` dùng. */
async function nextProposalId(
  graph: Graph,
  root: string,
  sessionId: string,
  ttlMinutes: number,
): Promise<string> {
  let max = 0;
  for (const id of graph.proposals.keys()) {
    if (!ID_PATTERNS.proposal.test(id)) continue;
    const n = Number(id.slice("PR-".length));
    if (Number.isFinite(n) && n > max) max = n;
  }

  const maxAttempts = 1000;
  let n = max + 1;
  for (let attempts = 0; attempts < maxAttempts; attempts++, n++) {
    const candidate = `PR-${String(n).padStart(3, "0")}`;
    if (await reserveId(root, candidate, sessionId, ttlMinutes)) return candidate;
  }

  throw new GanasError(
    `không đặt chỗ được id PR sau ${maxAttempts} lần thử — quá nhiều id đang bị giữ trong .ganas/.locks/.`,
  );
}

function requireProposal(graph: Graph, id: string | undefined): Sourced<Proposal> {
  if (!id) throw new GanasError("thiếu id đề xuất (vd `ganas proposal show PR-001`).");
  const found = graph.proposals.get(id);
  if (!found) throw new GanasError(`không có đề xuất ${id} trong graph.`);
  return found;
}

/** Sửa TẠI CHỖ, giữ nguyên comment — cùng kỹ thuật `writeIceboxUpdate`/`writeBackFact`. */
async function writeUpdate(
  root: string,
  sourced: Sourced<Proposal>,
  updates: Record<string, unknown>,
): Promise<void> {
  const file = join(root, sourced.file);
  await withFileLock(lockFileOf(root, sourced.value.id), PROPOSAL_LOCK_TTL_MS, async () => {
    const doc = parseDocument(await readFile(file, "utf8"));
    for (const [k, v] of Object.entries(updates)) doc.setIn([k], v);
    await writeFile(file, doc.toString(), "utf8");
  });
}

/**
 * Người trả lời là AI — bắt buộc, không có mặc định, không suy từ git config.
 *
 * Suy từ `git config user.name` thì mọi lượt agent chạy sẽ mang tên chủ máy,
 * và bản ghi "ai duyệt" trở thành vô nghĩa đúng lúc nó cần có nghĩa nhất.
 */
function requireDecider(argv: Argv): string {
  const by = option(argv, "by");
  if (!by) {
    throw new GanasError(
      "thiếu --by @ai-đó — duyệt hay từ chối đều là câu trả lời của NGƯỜI, phải ghi tên người đó.",
    );
  }
  if (!/^@[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(by)) {
    throw new GanasError(`--by phải dạng "@ten", nhận được "${by}"`);
  }
  return by;
}

function parseScoreValue(raw: string, flagLabel: string): ScoreValue {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new GanasError(`${flagLabel} phải là số nguyên trong thang 1-5, nhận được "${raw}"`);
  }
  return n as ScoreValue;
}

/* ------------------------------------------------------------------------- *
 * new
 * ------------------------------------------------------------------------- */

/** Trích dẫn một chuỗi cho YAML dạng block — an toàn với xuống dòng và dấu nháy. */
function yamlBlock(key: string, value: string): string {
  const body = value
    .trim()
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
  return `${key}: >-\n${body}\n`;
}

function proposalYaml(p: {
  id: string;
  title: string;
  scope: string;
  problem: string;
  change: string;
  anchors: string[];
  weight: ScoreValue;
  ease: ScoreValue;
  foundAt: string;
}): string {
  return (
    `id: ${p.id}\n` +
    `title: ${JSON.stringify(p.title)}\n` +
    `scope: ${p.scope}\n` +
    yamlBlock("problem", p.problem) +
    yamlBlock("proposed_change", p.change) +
    `anchors:\n${p.anchors.map((a) => `  - ${JSON.stringify(a)}`).join("\n")}\n` +
    `weight: ${p.weight}\n` +
    `ease: ${p.ease}\n` +
    `found_at: "${p.foundAt}"\n` +
    `status: pending\n`
  );
}

async function runNew(argv: Argv, root: string, graph: Graph): Promise<number> {
  const title = option(argv, "title");
  if (!title) throw new GanasError("thiếu --title — đề xuất phải có tiêu đề.");

  const problem = option(argv, "problem");
  if (!problem) {
    throw new GanasError(
      "thiếu --problem — chỗ LỆCH là gì? Nêu giải pháp mà không nêu vấn đề thì người duyệt " +
        "chỉ còn cách tin lời người đề xuất.",
    );
  }

  const change = option(argv, "change");
  if (!change) throw new GanasError("thiếu --change — đề nghị làm gì?");

  const anchors = multiOption(argv, "anchor");
  if (anchors.length === 0) {
    throw new GanasError(
      "thiếu --anchor — đề xuất không có bằng chứng thì không phải phát hiện, chỉ là ý kiến " +
        "(vd `--anchor src/a.ts:12`). Lặp lại cờ này để khai nhiều anchor.",
    );
  }

  const weightRaw = option(argv, "weight");
  if (weightRaw === undefined) throw new GanasError("thiếu --weight (1-5) — bỏ qua thì hại đến đâu?");
  const easeRaw = option(argv, "ease");
  if (easeRaw === undefined) throw new GanasError("thiếu --ease (1-5) — sửa dễ đến đâu?");

  // `scope` BẮT BUỘC, khác icebox: đề xuất sống bằng đường brief, và brief chỉ
  // nhắc đề xuất cùng phạm vi. Không khai thì không bao giờ tới tay phiên nào.
  const scope = option(argv, "scope") ?? (await scopeFromClaimedTask(argv, root, graph));
  if (!scope) throw new GanasError("thiếu --scope — đề xuất phải thuộc một phạm vi.");
  if (!graph.scopes.has(scope)) throw new GanasError(`phạm vi ${scope} không tồn tại.`);

  const sessionId = option(argv, "session") ?? "cli";
  const id = await nextProposalId(graph, root, sessionId, graph.config.claim.ttl_minutes);

  const file = ganasPath(root, DIRS.proposals, `${id}.yaml`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(
    file,
    proposalYaml({
      id,
      title,
      scope,
      problem,
      change,
      anchors,
      weight: parseScoreValue(weightRaw, "--weight"),
      ease: parseScoreValue(easeRaw, "--ease"),
      foundAt: new Date().toISOString(),
    }),
    { encoding: "utf8", flag: "wx" },
  );

  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify({ id, file: relFileOf(id) }, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(
    `Đã ghi ${id} vào ${relative(root, file)}\n` +
      `Chưa ai duyệt — người quyết chạy \`ganas proposal approve ${id} --by @ten\` ` +
      `hoặc \`ganas proposal reject ${id} --by @ten --why "..."\`.\n`,
  );
  return 0;
}

/* ------------------------------------------------------------------------- *
 * list
 * ------------------------------------------------------------------------- */

/**
 * Sắp giảm dần theo `weight + ease`, tie-break theo id.
 *
 * Hàm THUẦN, tách khỏi `run()` để test ghim được thứ tự mà không cần dựng dự
 * án giả — cùng khuôn `overdueIceboxItems`.
 */
export function rankProposals(items: readonly Proposal[]): Proposal[] {
  return [...items].sort(
    (a, b) => b.weight + b.ease - (a.weight + a.ease) || a.id.localeCompare(b.id),
  );
}

async function runList(argv: Argv, root: string, graph: Graph): Promise<number> {
  const scopeId = await scopeFromClaimedTask(argv, root, graph);
  const showAllStatus = flag(argv, "all-status");

  const rows = rankProposals(
    [...graph.proposals.values()]
      .map((s) => s.value)
      .filter((p) => scopeId === undefined || p.scope === scopeId)
      .filter((p) => showAllStatus || p.status === "pending"),
  );

  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify({ scope: scopeId ?? null, total: rows.length, rows }, null, 2) + "\n",
    );
    return 0;
  }

  if (rows.length === 0) {
    process.stdout.write(
      scopeId
        ? `Không có đề xuất nào đang chờ trong phạm vi ${scopeId}.\n`
        : `Không có đề xuất nào đang chờ.\n`,
    );
    return 0;
  }

  const lines = rows.map((p) => {
    const status = p.status === "pending" ? "" : ` · ${p.status.toUpperCase()}`;
    return (
      `${p.id} — ${p.title}\n` +
      `  weight ${p.weight} + ease ${p.ease} = ${p.weight + p.ease} · phạm vi ${p.scope}${status}\n` +
      `  ${p.problem.trim().split("\n")[0]}`
    );
  });

  process.stdout.write(
    lines.join("\n\n") + `\n\nChi tiết: \`ganas proposal show <id>\`\n`,
  );
  return 0;
}

/* ------------------------------------------------------------------------- *
 * show
 * ------------------------------------------------------------------------- */

function runShow(argv: Argv, graph: Graph): number {
  const sourced = requireProposal(graph, argv.positional[1]);
  const p = sourced.value;

  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify(p, null, 2) + "\n");
    return 0;
  }

  const parts = [
    `# ${p.id} — ${p.title}`,
    `phạm vi \`${p.scope}\` · weight ${p.weight} + ease ${p.ease} = ${p.weight + p.ease} · trạng thái \`${p.status}\``,
    `## Vấn đề\n\n${p.problem.trim()}`,
    `## Đề nghị\n\n${p.proposed_change.trim()}`,
    `## Bằng chứng\n\n${p.anchors.map((a) => `- ${formatAnchor(a)}`).join("\n")}`,
  ];

  if (p.status === "pending") {
    parts.push(
      `> Chưa ai trả lời. Người quyết chạy \`ganas proposal approve ${p.id} --by @ten\` ` +
        `hoặc \`ganas proposal reject ${p.id} --by @ten --why "..."\`.`,
    );
  } else {
    parts.push(
      `## Đã quyết\n\n` +
        `${p.status} bởi ${p.decided_by ?? "?"} lúc ${p.decided_at ?? "?"}` +
        (p.why_rejected ? `\n\nLý do từ chối: ${p.why_rejected.trim()}` : "") +
        (p.promoted_to ? `\n\nĐã thành: ${p.promoted_to}` : ""),
    );
  }

  if (p.supersedes.length > 0) parts.push(`Thay thế: ${p.supersedes.join(", ")}`);
  if (p.notes) parts.push(`## Ghi chú\n\n${p.notes.trim()}`);

  process.stdout.write(parts.join("\n\n") + "\n");
  return 0;
}

/* ------------------------------------------------------------------------- *
 * approve / reject
 * ------------------------------------------------------------------------- */

/** Đã quyết rồi thì không quyết lại — đổi ý là một đề xuất MỚI, có `supersedes`. */
function requirePending(p: Proposal): void {
  if (p.status !== "pending") {
    throw new GanasError(
      `đề xuất ${p.id} đã ở trạng thái "${p.status}" — không quyết lại được. ` +
        `Đổi ý thì ghi đề xuất mới với \`supersedes: [${p.id}]\`, để lịch sử giữ đủ hai lần quyết.`,
    );
  }
}

/**
 * Điền `promoted_to` còn trống cho một đề xuất ĐÃ duyệt.
 *
 * Đây là nửa sau của một việc vốn không làm một lần được: lúc duyệt thì
 * design/task chưa tồn tại, mà `--promoted-to` lại đòi thực thể có thật. Chính
 * `runApprove` in ra "tạo design/task rồi chạy lại với --promoted-to" — trước
 * bản này, chạy lại thì `requirePending` từ chối, tức là lệnh hứa một đường
 * rồi chặn đúng đường đó.
 *
 * Hẹp có chủ đích: KHÔNG đụng `decided_by`/`decided_at` (quyết định cũ là của
 * người khác, ở thời điểm khác — ghi đè là sửa lịch sử), và KHÔNG cho đổi một
 * `promoted_to` đã có. Trỏ lại đích khác là một quyết định mới, phải đi đường
 * đề xuất mới kèm `supersedes`.
 */
async function fillPromotedTo(
  root: string,
  sourced: Sourced<Proposal>,
  promotedTo: string,
): Promise<number> {
  const p = sourced.value;
  if (p.promoted_to !== undefined) {
    throw new GanasError(
      `đề xuất ${p.id} đã trỏ tới ${p.promoted_to} — không đổi đích được. ` +
        `Trỏ lại chỗ khác là một quyết định mới: ghi đề xuất mới với \`supersedes: [${p.id}]\`.`,
    );
  }

  await writeUpdate(root, sourced, { promoted_to: promotedTo });
  process.stdout.write(`${p.id} (đã duyệt trước đó) nay trỏ tới ${promotedTo}.\n`);
  return 0;
}

async function runApprove(argv: Argv, root: string, graph: Graph): Promise<number> {
  const sourced = requireProposal(graph, argv.positional[1]);

  const promotedTo = option(argv, "promoted-to");
  if (promotedTo !== undefined) {
    const exists =
      graph.designs.has(promotedTo) || graph.tasks.has(promotedTo) || graph.icebox.has(promotedTo);
    if (!exists) {
      throw new GanasError(
        `--promoted-to ${promotedTo} không có trong graph — thực thể phải TỒN TẠI THẬT trước khi trỏ tới.`,
      );
    }
  }

  // Đã duyệt + chỉ đưa thêm `--promoted-to` ⇒ đây là nửa sau của lượt duyệt
  // trước, không phải một lượt quyết mới. Không đòi `--by` lại: người quyết đã
  // ghi rồi, hỏi lại chỉ tạo cơ hội ghi đè bằng một cái tên khác.
  if (sourced.value.status === "approved" && promotedTo !== undefined) {
    return fillPromotedTo(root, sourced, promotedTo);
  }

  requirePending(sourced.value);
  const by = requireDecider(argv);

  await writeUpdate(root, sourced, {
    status: "approved",
    decided_by: by,
    decided_at: new Date().toISOString(),
    ...(promotedTo ? { promoted_to: promotedTo } : {}),
  });

  process.stdout.write(
    `${sourced.value.id} đã được ${by} duyệt.\n` +
      (promotedTo
        ? `Đã trỏ tới ${promotedTo}.\n`
        : `Chưa trỏ tới thực thể nào — tạo design/task rồi chạy lại với \`--promoted-to <id>\`.\n`),
  );
  return 0;
}

async function runReject(argv: Argv, root: string, graph: Graph): Promise<number> {
  const sourced = requireProposal(graph, argv.positional[1]);
  requirePending(sourced.value);
  const by = requireDecider(argv);

  const why = option(argv, "why");
  if (!why) {
    throw new GanasError(
      "thiếu --why — từ chối mà không nói vì sao thì phiên sau đề xuất lại đúng thứ vừa bị loại, " +
        "và người quyết phải trả lời hai lần.",
    );
  }

  await writeUpdate(root, sourced, {
    status: "rejected",
    decided_by: by,
    decided_at: new Date().toISOString(),
    why_rejected: why,
  });

  process.stdout.write(
    `${sourced.value.id} đã bị ${by} từ chối.\n` +
      `Muốn giữ lại để xem xét sau thì ghi vào sổ gác: \`ganas icebox add --title "..."\` — ` +
      `từ chối không phải xoá.\n`,
  );
  return 0;
}

/* ------------------------------------------------------------------------- *
 * Router
 * ------------------------------------------------------------------------- */

export async function run(argv: Argv): Promise<number> {
  const sub = argv.positional[0];
  const { root, graph } = await openProject(argv);

  switch (sub) {
    case "new":
      return runNew(argv, root, graph);
    case undefined:
    case "list":
      return runList(argv, root, graph);
    case "show":
      return runShow(argv, graph);
    case "approve":
      return runApprove(argv, root, graph);
    case "reject":
      return runReject(argv, root, graph);
    default:
      throw new GanasError(
        `lệnh con không biết: "${sub}" — có: new, list, show, approve, reject`,
      );
  }
}
