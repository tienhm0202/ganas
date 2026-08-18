import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parseDocument } from "yaml";

import { reserveId, withFileLock } from "../graph/claim.js";
import { DIRS, GANAS_DIR, ganasPath } from "../graph/paths.js";
import type { Graph, Sourced } from "../graph/types.js";
import { formatAnchor, type Icebox, ID_PATTERNS, type ScoreValue } from "../model/index.js";
import { type Argv, flag, multiOption, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { openProject } from "./_common.js";
import { scopeFromClaimedTask } from "./debt.js";

/**
 * `ganas icebox` — việc đã quyết CHƯA làm (xem docstring đầu `src/model/icebox.ts`).
 *
 * Năm lệnh con: `add` ghi một bản ghi mới, `list`/`review` đọc, `close`/
 * `promote` đóng sổ theo hai cách khác nhau (bỏ hẳn / lên thành task). Không
 * lệnh con nào TỰ NHẢY sang lệnh con khác — mỗi cái là một hành động của
 * NGƯỜI, ganas chỉ ghi lại đúng thứ được yêu cầu.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** TTL của khoá file icebox — mili giây, không phải phút: chỉ sống trong một lượt đọc-sửa-ghi. Xem `withFileLock` (graph/claim.ts). */
const ICEBOX_LOCK_TTL_MS = 5000;

function monthOf(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** Đường dẫn TƯƠNG ĐỐI (so với root) của file icebox một tháng — cùng dạng `Sourced.file` mà `graph/load.ts` sinh ra. */
function iceboxRelFile(month: string): string {
  return `${GANAS_DIR}/${DIRS.icebox}/${month}.yaml`;
}

/** Khoá mutex cho một file icebox — tên khoá suy từ đường dẫn tương đối, không đụng độ giữa các tháng. */
function iceboxLockFile(root: string, relFile: string): string {
  return ganasPath(root, DIRS.locks, `icebox-${relFile.replace(/[\\/]/g, "_")}.lock`);
}

/**
 * Đặt chỗ id ICE-xxx kế tiếp — cùng cơ chế `reserveId` mà `src/commands/id.ts`
 * dùng cho các loại đánh số khác, thu gọn cho một loại duy nhất (không cần
 * `--count`/`--group`, `ganas icebox add` luôn xin đúng một id).
 */
async function nextIceboxId(graph: Graph, root: string, sessionId: string, ttlMinutes: number): Promise<string> {
  let max = 0;
  for (const id of graph.icebox.keys()) {
    if (!ID_PATTERNS.icebox.test(id)) continue;
    const n = Number(id.slice("ICE-".length));
    if (Number.isFinite(n) && n > max) max = n;
  }

  const maxAttempts = 1000;
  let n = max + 1;
  for (let attempts = 0; attempts < maxAttempts; attempts++, n++) {
    const candidate = `ICE-${String(n).padStart(3, "0")}`;
    if (await reserveId(root, candidate, sessionId, ttlMinutes)) return candidate;
  }

  throw new GanasError(
    `không đặt chỗ được id ICE sau ${maxAttempts} lần thử — quá nhiều id đang bị giữ trong .ganas/.locks/. ` +
      `Thử lại sau, hoặc kiểm tra có phiên nào đang treo giữ chỗ hàng loạt không.`,
  );
}

/**
 * Ghi một bản ghi MỚI vào cuối file icebox của tháng, giữ nguyên comment sẵn
 * có (`parseDocument` + `addIn`, cùng kỹ thuật `closeTaskFile`/`writeBackFact`
 * dùng để sửa tại chỗ) — khác chỗ này là THÊM phần tử, không SỬA phần tử có
 * sẵn.
 *
 * Bọc trong `withFileLock`: `reserveId` chỉ bảo vệ CON SỐ (id), không bảo vệ
 * FILE — hai lượt `add` gần như đồng thời (khác id, cùng tháng) vẫn cùng đọc
 * một nội dung file rồi cùng ghi đè, một trong hai mục biến mất không tiếng
 * động. TTL ngắn (`ICEBOX_LOCK_TTL_MS`, mili giây): khoá này chỉ cần sống qua
 * đúng một lượt đọc-sửa-ghi.
 */
async function appendIceboxRecord(root: string, month: string, record: Record<string, unknown>): Promise<void> {
  const relFile = iceboxRelFile(month);
  const file = join(root, relFile);
  await mkdir(dirname(file), { recursive: true });

  await withFileLock(iceboxLockFile(root, relFile), ICEBOX_LOCK_TTL_MS, async () => {
    const raw = existsSync(file) ? await readFile(file, "utf8") : "";
    const doc = parseDocument(raw);
    // File chưa có hoặc rỗng: `contents` là `null`. `createNode([])` trả một
    // node CHƯA gắn vị trí trong nguồn (không phải "Parsed") — ép kiểu về
    // đúng kiểu thuộc tính (lấy TRƯỚC khi bị hẹp bởi nhánh `=== null`, không
    // thì `typeof doc.contents` chỉ còn là `null`) thay vì nới sang `any`, vì
    // đây là gán hợp lệ về MẶT DỮ LIỆU (mảng rỗng làm gốc mới), chỉ lệch ở
    // kiểu "đã parse từ đâu".
    type DocContents = typeof doc.contents;
    if (doc.contents === null) doc.contents = doc.createNode([]) as DocContents;
    doc.addIn([], record);
    await writeFile(file, doc.toString(), "utf8");
  });
}

/**
 * Sửa TẠI CHỖ một bản ghi đã có (`close`/`promote`) — giữ comment, cùng kỹ
 * thuật `closeTaskFile`/`writeBackFact`. Cũng bọc `withFileLock`: tuy hai lệnh
 * này đụng ĐÚNG MỘT id do người gõ (rủi ro thấp hơn `add`), hai bản ghi khác
 * nhau trong CÙNG một file tháng vẫn có thể bị đóng gần như đồng thời — cùng
 * khoá, cùng lý lẽ.
 */
async function writeIceboxUpdate(
  root: string,
  sourced: Sourced<Icebox>,
  updates: Record<string, unknown>,
  deleteKeys: string[] = [],
): Promise<void> {
  const file = join(root, sourced.file);
  const base = sourced.index === undefined ? [] : [sourced.index];

  await withFileLock(iceboxLockFile(root, sourced.file), ICEBOX_LOCK_TTL_MS, async () => {
    const doc = parseDocument(await readFile(file, "utf8"));
    for (const [k, v] of Object.entries(updates)) doc.setIn([...base, k], v);
    for (const k of deleteKeys) doc.deleteIn([...base, k]);
    await writeFile(file, doc.toString(), "utf8");
  });
}

/* ------------------------------------------------------------------------- *
 * add
 * ------------------------------------------------------------------------- */

function parseScoreValue(raw: string, flagLabel: string): ScoreValue {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new GanasError(`${flagLabel} phải là số nguyên trong thang 1-5, nhận được "${raw}"`);
  }
  return n as ScoreValue;
}

async function runAdd(argv: Argv, root: string, graph: Graph): Promise<number> {
  const title = option(argv, "title");
  if (!title) throw new GanasError("thiếu --title — icebox phải có tiêu đề.");

  const weightRaw = option(argv, "weight");
  if (weightRaw === undefined) {
    throw new GanasError("thiếu --weight (1-5) — quan trọng đến đâu nếu bỏ qua?");
  }
  const easeRaw = option(argv, "ease");
  if (easeRaw === undefined) {
    throw new GanasError("thiếu --ease (1-5) — dễ sửa đến đâu?");
  }
  const weight = parseScoreValue(weightRaw, "--weight");
  const ease = parseScoreValue(easeRaw, "--ease");

  const why = option(argv, "why");
  if (!why) {
    throw new GanasError(
      "thiếu --why — vì sao hoãn? Ghi vào sổ này mà không nói vì sao thì quay lại đúng bệnh " +
        '"nằm trong đoạn chat mà không ai tìm được" mà icebox sinh ra để chống.',
    );
  }

  const anchors = multiOption(argv, "anchor");
  if (anchors.length === 0) {
    throw new GanasError(
      "thiếu --anchor — icebox phải có ít nhất một bằng chứng (vd `--anchor src/a.ts:12`). " +
        "Lặp lại cờ này để khai nhiều anchor: `--anchor A --anchor B`.",
    );
  }

  const scope = option(argv, "scope");

  const reviewAfterRaw = option(argv, "review-after");
  const reviewAfterDays = reviewAfterRaw === undefined ? 30 : Number(reviewAfterRaw);
  if (!Number.isInteger(reviewAfterDays) || reviewAfterDays < 1) {
    throw new GanasError(`--review-after phải là số nguyên ngày ≥1, nhận được "${reviewAfterRaw}"`);
  }

  const sessionId = option(argv, "session") ?? "cli";
  const ttlMinutes = graph.config.claim.ttl_minutes;
  const id = await nextIceboxId(graph, root, sessionId, ttlMinutes);

  const now = new Date();
  const month = monthOf(now);

  const record: Record<string, unknown> = {
    id,
    title,
    found_at: now.toISOString(),
    review_after_days: reviewAfterDays,
    weight,
    ease,
    why_deferred: why,
    anchors,
    ...(scope ? { scope } : {}),
    status: "open",
  };

  await appendIceboxRecord(root, month, record);

  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify({ id, file: iceboxRelFile(month) }, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(`Đã ghi ${id} vào ${iceboxRelFile(month)}\n`);
  return 0;
}

/* ------------------------------------------------------------------------- *
 * list
 * ------------------------------------------------------------------------- */

async function runList(argv: Argv, root: string, graph: Graph): Promise<number> {
  const scopeId = await scopeFromClaimedTask(argv, root, graph);
  const showClosed = flag(argv, "closed");

  const rows = [...graph.icebox.values()]
    .map((s) => s.value)
    .filter((i) => scopeId === undefined || i.scope === scopeId)
    .filter((i) => showClosed || i.status === "open")
    .sort((a, b) => a.id.localeCompare(b.id));

  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify({ scope: scopeId ?? null, closed: showClosed, total: rows.length, rows }, null, 2) + "\n",
    );
    return 0;
  }

  if (rows.length === 0) {
    process.stdout.write(
      scopeId ? `Không có mục icebox nào trong phạm vi ${scopeId}.\n` : `Không có mục icebox nào.\n`,
    );
    return 0;
  }

  const lines = rows.map((i) => {
    const scopeLabel = i.scope ? ` · phạm vi ${i.scope}` : " · ⚠ chưa khai scope";
    const statusLabel =
      i.status === "open"
        ? ""
        : i.status === "closed"
          ? ` · CLOSED — ${i.closed_reason ?? "(thiếu closed_reason?!)"}`
          : ` · PROMOTED → ${i.promoted_to ?? "?"}`;
    return `${i.id} — ${i.title}\n  weight ${i.weight} + ease ${i.ease} = ${i.weight + i.ease}${scopeLabel}${statusLabel}`;
  });

  process.stdout.write(lines.join("\n\n") + "\n");
  return 0;
}

/* ------------------------------------------------------------------------- *
 * review
 * ------------------------------------------------------------------------- */

export interface OverdueIcebox {
  item: Icebox;
  overdueDays: number;
}

/**
 * Mục `open` đã quá hạn xem lại — hàm THUẦN, tách khỏi `run()` để test ghim
 * `now` mà không phải giả lập đồng hồ hệ thống (cùng khuôn `validateGraph(graph,
 * { now })` và `renderBrief({ ..., now })` đã dùng ở nơi khác trong repo).
 *
 * `overrideDays`, nếu có, thay `review_after_days` của TỪNG bản ghi bằng một
 * ngưỡng chung — cùng tên và cùng nghĩa cờ `--older-than` với `ganas prune`.
 */
export function overdueIceboxItems(items: Icebox[], now: number, overrideDays?: number): OverdueIcebox[] {
  return items
    .filter((i) => i.status === "open")
    .map((i) => {
      const days = overrideDays ?? i.review_after_days;
      const dueAt = Date.parse(i.found_at) + days * DAY_MS;
      return { item: i, overdueDays: Math.floor((now - dueAt) / DAY_MS) };
    })
    .filter((x) => x.overdueDays > 0)
    .sort((a, b) => b.overdueDays - a.overdueDays || a.item.id.localeCompare(b.item.id));
}

function runReview(argv: Argv, root: string, graph: Graph): number {
  const olderThanRaw = option(argv, "older-than");
  const overrideDays = olderThanRaw === undefined ? undefined : Number(olderThanRaw);
  if (overrideDays !== undefined && (!Number.isFinite(overrideDays) || overrideDays < 0)) {
    throw new GanasError(`--older-than không phải số ngày hợp lệ: ${olderThanRaw}`);
  }

  const items = [...graph.icebox.values()].map((s) => s.value);
  const overdue = overdueIceboxItems(items, Date.now(), overrideDays);

  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          olderThan: overrideDays ?? null,
          total: overdue.length,
          rows: overdue.map(({ item, overdueDays }) => ({ ...item, overdue_days: overdueDays })),
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  if (overdue.length === 0) {
    process.stdout.write("Không có mục icebox nào quá hạn xem lại.\n");
    return 0;
  }

  const lines = overdue.map(({ item: i, overdueDays }) => {
    const anchors = i.anchors.map(formatAnchor).join(", ");
    return (
      `${i.id} — ${i.title}\n` +
      `  quá hạn ${overdueDays} ngày · weight ${i.weight} + ease ${i.ease} = ${i.weight + i.ease}\n` +
      `  vì sao hoãn: ${i.why_deferred}\n` +
      `  anchors: ${anchors}\n` +
      `  ganas icebox close ${i.id} --reason "..."   |   ganas icebox promote ${i.id} --task T-xxx`
    );
  });

  process.stdout.write(lines.join("\n\n") + "\n");
  return 0;
}

/* ------------------------------------------------------------------------- *
 * close
 * ------------------------------------------------------------------------- */

async function runClose(argv: Argv, root: string, graph: Graph): Promise<number> {
  const id = argv.positional[1];
  if (!id) throw new GanasError('thiếu <ICE-id> — dùng: ganas icebox close <ICE-id> --reason "..."');

  const sourced = graph.icebox.get(id);
  if (!sourced) throw new GanasError(`không có icebox ${id}`);

  const reason = option(argv, "reason");
  if (!reason) {
    throw new GanasError(
      "thiếu --reason — đóng mà không nói vì sao thì phiên sau đề xuất lại đúng thứ vừa bị loại. " +
        "Khác `ganas prune` (mặc định dry-run vì nó đụng NHIỀU thứ do máy chọn): " +
        "`close` đụng ĐÚNG MỘT id do người gõ kèm lý do bắt buộc, nên không cần dry-run.",
    );
  }

  const deleteKeys = sourced.value.promoted_to !== undefined ? ["promoted_to"] : [];
  await writeIceboxUpdate(
    root,
    sourced,
    { status: "closed", closed_at: new Date().toISOString(), closed_reason: reason },
    deleteKeys,
  );

  process.stdout.write(`Đã đóng ${id}: ${reason}\n`);
  return 0;
}

/* ------------------------------------------------------------------------- *
 * promote
 * ------------------------------------------------------------------------- */

/**
 * Khung YAML dán được cho task mới — KHÔNG tạo task hộ. `serves`/`implements`/
 * `exit_contract` để trống kèm chú thích: đó là thứ chỉ người quyết được,
 * icebox không biết task này phục vụ goal nào hay "xong" nghĩa là gì. Cùng
 * tinh thần hàm `template()` của từng chặng trong `src/flow.ts`.
 */
function promoteTemplate(item: Icebox): string {
  const mustRead = item.anchors
    .map(
      (a) =>
        `    - path: ${JSON.stringify(formatAnchor(a))}\n` +
        `      why: "phát hiện lúc gác lại ${item.id} — xem lý do hoãn trong .ganas/icebox/"`,
    )
    .join("\n");

  return (
    `Chưa gán --task. Chạy \`ganas id task\` để lấy id thật, rồi dán khung dưới đây ` +
    `thành \`.ganas/tasks/<id>.yaml\`:\n\n` +
    `# .ganas/tasks/T-xxx.yaml\n` +
    `id: T-xxx\n` +
    `title: ${JSON.stringify(item.title)}\n` +
    `serves: []          # BẮT BUỘC — goal nào? icebox không biết, người quyết.\n` +
    `implements: ""      # BẮT BUỘC — design nào? người quyết.\n` +
    `scope: ${item.scope ?? "P-x"}${item.scope ? "" : "  # icebox chưa khai scope — tự điền trước khi dùng"}\n` +
    `status: todo\n` +
    `context_contract:\n` +
    `  must_read:\n${mustRead}\n` +
    `exit_contract: []   # BẮT BUỘC — điều kiện hoàn thành, người quyết\n\n` +
    `Sau khi tạo task thật: \`ganas icebox promote ${item.id} --task <id-vừa-tạo>\`.`
  );
}

async function runPromote(argv: Argv, root: string, graph: Graph): Promise<number> {
  const id = argv.positional[1];
  if (!id) throw new GanasError("thiếu <ICE-id> — dùng: ganas icebox promote <ICE-id> [--task T-042]");

  const sourced = graph.icebox.get(id);
  if (!sourced) throw new GanasError(`không có icebox ${id}`);
  const item = sourced.value;

  const taskId = option(argv, "task");
  if (!taskId) {
    process.stdout.write(promoteTemplate(item) + "\n");
    return 1;
  }

  // Task sai schema thì không vào graph — kiểm `graph.tasks.has()` là cưỡng
  // chế miễn phí, không cần validate lại tay ở đây.
  const task = graph.tasks.get(taskId);
  if (!task) {
    throw new GanasError(
      `không có task ${taskId} trong graph — task phải TỒN TẠI THẬT (và hợp lệ schema) trước khi promote.`,
    );
  }

  if (item.scope !== undefined && task.value.scope !== item.scope) {
    throw new GanasError(
      `icebox ${id} khai scope \`${item.scope}\`, nhưng task ${taskId} khai scope \`${task.value.scope}\` ` +
        `— hai phạm vi phải khớp khi cả hai cùng khai.`,
    );
  }

  await writeIceboxUpdate(root, sourced, {
    status: "promoted",
    promoted_to: taskId,
    closed_at: new Date().toISOString(),
  });

  process.stdout.write(`Đã thăng cấp ${id} → ${taskId}.\n`);
  return 0;
}

/* ------------------------------------------------------------------------- *
 * Router
 * ------------------------------------------------------------------------- */

export async function run(argv: Argv): Promise<number> {
  const sub = argv.positional[0];
  const { root, graph } = await openProject(argv);

  switch (sub) {
    case "add":
      return runAdd(argv, root, graph);
    case "list":
      return runList(argv, root, graph);
    case "review":
      return runReview(argv, root, graph);
    case "close":
      return runClose(argv, root, graph);
    case "promote":
      return runPromote(argv, root, graph);
    default:
      throw new GanasError(
        `lệnh con không biết: "${sub ?? ""}" — có: add, list, review, close, promote`,
      );
  }
}
