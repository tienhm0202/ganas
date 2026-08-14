import { type DebtRow, debtRows, rowsInScope } from "../debt.js";
import { checkAllEdges, computeDebt, type EdgeCheck } from "../graph/trace.js";
import type { Graph } from "../graph/types.js";
import { validateGraph } from "../graph/validate.js";
import { taskForSession } from "../state.js";
import { type Argv, flag, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { openProject } from "./_common.js";

/**
 * `ganas debt` — bảng xếp hạng nợ gộp từ `validateGraph` (spine/scope/tri
 * thức) và `computeDebt` (sơ đồ khối), chấm điểm và sắp theo `src/debt.ts`.
 *
 * Mặc định lọc theo phạm vi của task đang làm — cùng nguyên tắc `postToolUse`
 * đã áp dụng ở nơi khác: chỉ báo nợ của phạm vi đang động vào, không đổ cả
 * nợ tồn kho của dự án lên đầu một task. `--all` bỏ lọc.
 */

/** Số dòng tối đa in ra khi gọi trực tiếp `ganas debt` (đủ để nhìn tổng quan). */
export const TEXT_LIMIT = 20;

/** Số dòng tối đa chèn vào báo cáo `ganas commit` — ngắn hơn, vì đây là phụ lục. */
export const COMMIT_LIMIT = 8;

/** Gộp diagnostic + debt item của sơ đồ thành bảng đã chấm điểm. Có thể NÉM LỖI (xem `scoreOf`). */
export function buildDebtRows(graph: Graph, checks: readonly EdgeCheck[]): DebtRow[] {
  return debtRows(validateGraph(graph), computeDebt(graph, checks), graph);
}

/** Vị trí để in cạnh mỗi hàng: file (+dòng) cho diagnostic, khối/cạnh cho debt item của sơ đồ. */
function rowLocation(row: DebtRow): string {
  if (row.source.origin === "diagnostic") {
    const d = row.source.diagnostic;
    return d.line !== undefined ? `${d.file}:${d.line}` : d.file;
  }
  const item = row.source.item;
  if (item.moduleId !== undefined) return item.moduleId;
  if (item.edge !== undefined) return `${item.edge.from} → ${item.edge.to}`;
  return "";
}

const CODE_WIDTH = 28;

function renderRow(row: DebtRow): string {
  return `  ${String(row.total).padStart(2)}  ${row.code.padEnd(CODE_WIDTH)} ${rowLocation(row)}`;
}

/**
 * In `header` rồi tối đa `limit` hàng đầu (bảng đã sắp giảm dần theo `total`
 * từ `debtRows`, nên "đầu bảng" luôn là phần đáng làm nhất). Cắt bớt PHẢI có
 * ghi chú số dòng đã bỏ — im lặng cắt là đúng bệnh mà bảng này sinh ra để
 * chống (xem module doc của `src/debt.ts`).
 */
export function renderDebtSection(header: string, rows: readonly DebtRow[], limit: number): string {
  if (rows.length === 0) return `${header} không có nợ nào.\n`;
  const shown = rows.slice(0, limit);
  let out = `${header}\n` + shown.map(renderRow).join("\n") + "\n";
  const omitted = rows.length - shown.length;
  if (omitted > 0) {
    out += `  … đã bỏ bớt ${omitted} mục (in ${shown.length}/${rows.length}) — dùng \`ganas debt --json\` để lấy đủ.\n`;
  }
  return out;
}

/**
 * Bảng nợ AN TOÀN để chèn vào báo cáo của `ganas commit` — KHÔNG BAO GIỜ ném
 * lỗi ra ngoài.
 *
 * Hai lý do khác nhau đòi hỏi điều đó:
 *
 * 1. `scoreOf` (qua `buildDebtRows` → `debtRows`) ném lỗi khi gặp mã chưa
 *    chấm điểm. Chấp nhận được khi lỗi đó làm ĐỎ `ganas debt` (chưa gì xảy ra
 *    ngoài in báo cáo) — KHÔNG chấp nhận được khi nó làm hỏng `ganas commit`
 *    SAU KHI `git commit` đã ghi xong: người dùng thấy exception trong khi
 *    commit đã nằm trong lịch sử. Bắt lỗi, báo một dòng ngắn, đi tiếp.
 * 2. Cố tình truyền `checks: []` thay vì gọi lại `checkAllEdges` — mỗi cạnh
 *    `kind: contract` có thể chạy một lệnh shell tới 60s (`checkEdge` trong
 *    `src/graph/trace.ts`). Một commit đã thành công không được trả giá bằng
 *    việc chạy lại toàn bộ probe của sơ đồ chỉ để in thêm một đoạn báo cáo.
 *    Hệ quả: nợ dạng `broken-contract` (loại DUY NHẤT cần kết quả check) sẽ
 *    KHÔNG xuất hiện ở đây — `uncovered-edge` và `unverified-module` không
 *    cần `checks` nên vẫn đầy đủ. Muốn thấy `broken-contract` thì chạy
 *    `ganas trace`.
 */
export function commitDebtSummary(graph: Graph, scopeId: string): string {
  try {
    const rows = buildDebtRows(graph, []);
    const inScope = rowsInScope(rows, scopeId);
    const outside = rows.length - inScope.length;

    if (inScope.length === 0) {
      return outside > 0
        ? `\nKhông có nợ trong phạm vi ${scopeId}. Ngoài phạm vi này: còn ${outside} mục — \`ganas debt --all\`.\n`
        : "";
    }

    return (
      "\n" +
      renderDebtSection(`Nợ trong phạm vi ${scopeId}:`, inScope, COMMIT_LIMIT) +
      (outside > 0 ? `Ngoài phạm vi này: còn ${outside} mục — \`ganas debt --all\`\n` : "")
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return `\n⚠ không dựng được bảng nợ: ${reason} — chạy \`ganas debt\` để xem chi tiết\n`;
  }
}

export async function run(argv: Argv): Promise<number> {
  const { root, graph } = await openProject(argv);

  // Khác `commitDebtSummary`: đây là lệnh người dùng CHỦ ĐỘNG gọi để xem nợ,
  // không phải phần phụ lục sau một hành động đã xong — chạy `checkAllEdges`
  // thật (như `ganas trace`) để `broken-contract` cũng có mặt, và để `scoreOf`
  // ném lỗi thẳng ra nếu có mã chưa chấm điểm (đúng ý guard test: phải ĐỎ).
  const checks = await checkAllEdges(graph, root);
  const rows = buildDebtRows(graph, checks);

  const all = flag(argv, "all");
  let scopeId: string | undefined;

  if (!all) {
    const sessionId = option(argv, "session");
    const taskId = await taskForSession(root, sessionId);
    if (!taskId) {
      throw new GanasError(
        `chưa biết đang làm task nào — không lọc được phạm vi nợ.\n` +
          `Dùng \`ganas debt --all\` để xem toàn dự án, hoặc gắn task trước bằng ` +
          `\`ganas next\` / \`--session <id>\`.`,
      );
    }
    const task = graph.tasks.get(taskId);
    if (!task) throw new GanasError(`không có task ${taskId}`);
    scopeId = task.value.scope;
  }

  const filtered = scopeId === undefined ? rows : rowsInScope(rows, scopeId);
  const outside = rows.length - filtered.length;

  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        { scope: scopeId ?? null, all, total: rows.length, shown: filtered.length, outside, rows: filtered },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  if (all) {
    process.stdout.write(renderDebtSection(`Nợ toàn dự án (${rows.length} mục):`, rows, TEXT_LIMIT));
    return 0;
  }

  process.stdout.write(renderDebtSection(`Nợ trong phạm vi ${scopeId}:`, filtered, TEXT_LIMIT));
  if (outside > 0) {
    process.stdout.write(`\nNgoài phạm vi này: còn ${outside} mục — \`ganas debt --all\`\n`);
  }
  return 0;
}
