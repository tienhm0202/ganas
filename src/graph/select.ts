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

/**
 * Chọn task kế tiếp.
 *
 * Thứ tự ưu tiên có chủ đích: task đang dở trước, để một phiên mới nối tiếp
 * việc dở thay vì mở mặt trận mới — đó là nguồn gốc của việc bỏ dở nửa chừng.
 */
export function selectNextTask(graph: Graph): Candidate | null {
  const open = candidates(graph).filter((c) => c.blockers.length === 0);
  if (open.length === 0) return null;

  const rank = (c: Candidate): number => {
    const t = c.task.value;
    const sprint = graph.sprints.get(t.sprint)?.value;
    let score = 0;
    if (t.status === "in_progress") score -= 1000; // việc dở luôn đứng trước
    if (sprint?.status === "active") score -= 100;
    if (sprint?.status === "closed") score += 100; // sprint đã đóng thì để sau
    if (t.estimated_context === "small") score -= 1;
    return score;
  };

  return open.sort((a, b) => rank(a) - rank(b) || a.task.value.id.localeCompare(b.task.value.id))[0]!;
}

/** Task bị chặn, kèm lý do — hiển thị khi không còn việc nào làm được. */
export function blockedTasks(graph: Graph): Candidate[] {
  return candidates(graph)
    .filter((c) => c.blockers.length > 0)
    .sort((a, b) => a.task.value.id.localeCompare(b.task.value.id));
}
