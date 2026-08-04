import type { Task } from "../model/index.js";
import type { Graph, Sourced } from "./types.js";

/** Blocker chưa xong của một task. */
export function openBlockers(graph: Graph, task: Task): string[] {
  return task.blocked_by.filter((id) => {
    const blocker = graph.tasks.get(id);
    return !blocker || blocker.value.status !== "done";
  });
}

export interface Candidate {
  task: Sourced<Task>;
  blockers: string[];
}

/** Task còn phải làm, kèm blocker đang mở. */
export function candidates(graph: Graph): Candidate[] {
  return [...graph.tasks.values()]
    .filter((t) => t.value.status !== "done")
    .map((task) => ({ task, blockers: openBlockers(graph, task.value) }));
}

export interface SelectOptions {
  /**
   * Phạm vi mà phiên trước đang làm. Task cùng phạm vi được ưu tiên — brief đã
   * nạp ranh giới code, fact và quyết định của phạm vi đó, nên ở lại là tái
   * dùng được toàn bộ; nhảy sang phạm vi khác là dựng lại ngữ cảnh từ đầu.
   */
  preferScope?: string | undefined;
}

/**
 * Xếp hạng task còn làm được, tốt nhất trước.
 *
 * Thứ tự ưu tiên có chủ đích: task đang dở trước, để một phiên mới nối tiếp
 * việc dở thay vì mở mặt trận mới — đó là nguồn gốc của việc bỏ dở nửa chừng.
 * Kế đó là liên tục phạm vi, vì cùng lý do ở quy mô lớn hơn một task.
 *
 * Trả về danh sách xếp hạng (không chỉ 1 kết quả) để chỗ gọi có thể bỏ qua
 * ứng viên đầu nếu nó đang bị phiên khác giữ (xem `graph/claim.ts`) — hàm này
 * thuần, không biết gì về claim.
 */
export function rankedCandidates(graph: Graph, opts: SelectOptions = {}): Candidate[] {
  const open = candidates(graph).filter((c) => c.blockers.length === 0);
  if (open.length === 0) return [];

  const rank = (c: Candidate): number => {
    const t = c.task.value;
    const scope = graph.scopes.get(t.scope)?.value;
    let score = 0;
    if (t.status === "in_progress") score -= 1000; // việc dở luôn đứng trước
    if (scope?.status === "active") score -= 100;
    if (scope?.status === "delivered") score += 100; // phạm vi đã bàn giao thì để sau
    if (opts.preferScope !== undefined && t.scope === opts.preferScope) score -= 50;
    if (t.estimated_context === "small") score -= 1;
    return score;
  };

  return open.sort((a, b) => rank(a) - rank(b) || a.task.value.id.localeCompare(b.task.value.id));
}

/** Chọn task kế tiếp — ứng viên đứng đầu `rankedCandidates`. */
export function selectNextTask(graph: Graph, opts: SelectOptions = {}): Candidate | null {
  return rankedCandidates(graph, opts)[0] ?? null;
}

/** Task bị chặn, kèm lý do — hiển thị khi không còn việc nào làm được. */
export function blockedTasks(graph: Graph): Candidate[] {
  return candidates(graph)
    .filter((c) => c.blockers.length > 0)
    .sort((a, b) => a.task.value.id.localeCompare(b.task.value.id));
}
