import type { Graph } from "../graph/types.js";
import { ID_PATTERNS } from "../model/index.js";
import { type Argv, flag, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { openProject } from "./_common.js";

/**
 * `ganas id <loại>` — cấp số ID kế tiếp cho một loại đánh số, để agent không
 * còn lý do đi bịa nhãn tạm ("Lô 3", "T4a") vì tự liệt kê `.ganas/tasks/` rồi
 * đoán số kế tiếp quá đắt.
 *
 * Chỉ nhận loại ĐÁNH SỐ: goal, design, task, claim, decision, fact — mỗi loại
 * có tiền tố cố định + số tăng dần (xem `ID_PATTERNS` ở `src/model/common.ts`,
 * dùng lại nguyên văn ở đây để trích số, không viết regex hình dạng ID mới).
 * Loại đặt tên theo NGHĨA (`module`, `scope`, `verification`) không có "số kế
 * tiếp" nào để cấp — lệnh từ chối và trỏ sang `ganas scope new`.
 *
 * ⚠ CHƯA CHỐNG ĐƯỢC ĐUA (race condition), đây là gợi ý chứ không phải khoá:
 * `ganas scope new` chống trùng ID bằng cách tự ghi file với `flag: "wx"`
 * (từ chối ghi đè nếu file đã tồn tại — xem `writeNewYaml()` ở
 * `src/commands/scope.ts:19-33`). Lệnh này KHÔNG ghi file nào cả — nó chỉ tính
 * số rồi in ra, còn việc ghi file task/fact/... do agent tự làm bằng công cụ
 * Write. Vì vậy hai phiên gọi `ganas id task` gần như đồng thời sẽ nhận CÙNG
 * một số, phiên ghi file sau sẽ GHI ĐÈ ÂM THẦM lên file của phiên trước — và
 * luật `load/duplicate-id` không bắt được, vì rốt cuộc trên đĩa chỉ còn một
 * file. Đây là lỗ đã biết, chưa vá.
 */

const NUMBERED_KINDS = ["goal", "design", "task", "claim", "decision", "fact"] as const;
type NumberedKind = (typeof NUMBERED_KINDS)[number];

function isNumberedKind(s: string): s is NumberedKind {
  return (NUMBERED_KINDS as readonly string[]).includes(s);
}

/** Loại slug — đặt tên theo nghĩa, không theo số. Không có "id kế tiếp". */
const SLUG_KINDS = new Set(["module", "scope", "verification"]);

/** Tiền tố ĐẦY ĐỦ (kèm dấu gạch) của các loại đánh số phẳng, không có nhóm con. */
const PREFIX: Record<Exclude<NumberedKind, "fact">, string> = {
  goal: "G-",
  design: "D-",
  task: "T-",
  claim: "C-",
  decision: "DEC-",
};

function idsOf(graph: Graph, kind: NumberedKind): Iterable<string> {
  switch (kind) {
    case "goal":
      return graph.goals.keys();
    case "design":
      return graph.designs.keys();
    case "task":
      return graph.tasks.keys();
    case "claim":
      return graph.claims.keys();
    case "decision":
      return graph.decisions.keys();
    case "fact":
      return graph.facts.keys();
  }
}

/**
 * Giữ tối thiểu 3 chữ số (`8` → `"008"`), nhưng số ≥ 1000 không bị cắt —
 * `padStart` chỉ THÊM ký tự khi chuỗi ngắn hơn độ dài đích, không bao giờ cắt.
 */
function pad(n: number): string {
  return String(n).padStart(3, "0");
}

/**
 * Số lớn nhất ĐANG DÙNG của một loại đánh số phẳng, không phải số lượng bản
 * ghi — kho có T-001 và T-007 thì trả 7, để người gọi +1 ra T-008.
 *
 * Lọc bằng `pattern` (từ `ID_PATTERNS`) trước, rồi mới cắt tiền tố để lấy phần
 * số — id lạ hình dạng (nếu có) bị bỏ qua thay vì làm hỏng phép tính max.
 */
function maxNumber(ids: Iterable<string>, pattern: RegExp, prefix: string): number {
  let max = 0;
  for (const id of ids) {
    if (!pattern.test(id)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/** Như `maxNumber`, nhưng cho fact — id có thêm đoạn nhóm ở giữa (F-<NHÓM>-003). */
function maxFactNumber(graph: Graph, group: string): number {
  const prefix = `F-${group}-`;
  let max = 0;
  for (const id of graph.facts.keys()) {
    if (!ID_PATTERNS.fact.test(id) || !id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export async function run(argv: Argv): Promise<number> {
  const kindRaw = argv.positional[0];
  if (!kindRaw) {
    throw new GanasError(
      `thiếu loại ID — dùng: ganas id <goal|design|task|claim|decision|fact> ` +
        `[--count n] [--group nhóm]`,
    );
  }

  if (SLUG_KINDS.has(kindRaw)) {
    throw new GanasError(
      `"${kindRaw}" đặt tên theo Ý NGHĨA (slug), không theo số — không có "id kế tiếp" nào để cấp.\n` +
        `  Dùng \`ganas scope new\` — nó tự sinh slug qua slugify() (src/commands/scope.ts:161).`,
    );
  }

  if (!isNumberedKind(kindRaw)) {
    throw new GanasError(
      `không có loại "${kindRaw}" — nhận: goal, design, task, claim, decision, fact`,
    );
  }
  const kind = kindRaw;

  let group: string | undefined;
  if (kind === "fact") {
    group = option(argv, "group");
    if (!group) {
      throw new GanasError(
        `fact bắt buộc --group (id fact dạng F-<NHÓM>-003, xem ID_PATTERNS.fact) — ` +
          `vd: ganas id fact --group ACC`,
      );
    }
    if (!/^[A-Z0-9]+$/.test(group)) {
      throw new GanasError(`--group phải khớp ^[A-Z0-9]+$, nhận được "${group}"`);
    }
  }

  const countRaw = option(argv, "count");
  const count = countRaw === undefined ? 1 : Number(countRaw);
  if (!Number.isInteger(count) || count < 1) {
    throw new GanasError(`--count phải là số nguyên dương, nhận được "${countRaw}"`);
  }

  const { graph } = await openProject(argv);

  const start =
    kind === "fact"
      ? maxFactNumber(graph, group!) + 1
      : maxNumber(idsOf(graph, kind), ID_PATTERNS[kind], PREFIX[kind]) + 1;

  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const n = start + i;
    ids.push(kind === "fact" ? `F-${group}-${pad(n)}` : `${PREFIX[kind]}${pad(n)}`);
  }

  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify({ kind, ...(group ? { group } : {}), ids }, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(ids.join("\n") + "\n");
  return 0;
}
