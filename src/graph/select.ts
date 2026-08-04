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

/**
 * Phần đầu cố định của một glob — `src/a/**` → `src/a/`, `src/*.ts` → `src/`.
 *
 * Dùng để hỏi thô "hai vùng code này có thể chồng nhau không". Cố ý thô theo
 * hướng AN TOÀN: `src/**` và `src/a/**` bị coi là chồng nhau (đúng), và hai
 * glob không cùng nhánh thì chắc chắn rời nhau. Không cần chính xác hơn — kết
 * luận sai theo hướng "rời nhau" mới nguy hiểm, vì nó dẫn tới hai sub-agent
 * sửa cùng file một lúc.
 */
function staticPrefix(glob: string): string {
  const cut = glob.search(/[*?[{]/);
  const head = cut === -1 ? glob : glob.slice(0, cut);
  const slash = head.lastIndexOf("/");
  return slash === -1 ? "" : head.slice(0, slash + 1);
}

/** Hai tập glob có khả năng chạm cùng file không. */
function pathsOverlap(a: readonly string[], b: readonly string[]): boolean {
  for (const x of a.map(staticPrefix)) {
    for (const y of b.map(staticPrefix)) {
      if (x.startsWith(y) || y.startsWith(x)) return true;
    }
  }
  return false;
}

/** Vùng code của một task: gộp `paths` của mọi khối nó chạm. */
function taskPaths(graph: Graph, task: Task): string[] {
  return task.touches.flatMap((id) => graph.modules.get(id)?.value.paths ?? []);
}

/**
 * Task có thể giao SONG SONG với `task` — mỗi cái cho một sub-agent riêng.
 *
 * Điều kiện, tất cả đều bắt buộc:
 *  1. Còn phải làm, không phải chính nó, và không còn blocker đang mở.
 *  2. Không có quan hệ chặn với `task` theo cả hai chiều.
 *  3. **Vùng code rời nhau** — không chung khối nào, và glob của các khối
 *     không chồng nhau. Đây mới là điều kiện quyết định: hai agent sửa cùng
 *     file cùng lúc thì cái sau đè cái trước, và không ai thấy.
 *
 * Task chưa khai `touches` bị loại: không biết nó đụng đâu thì không kết luận
 * được là an toàn. Im lặng cho qua ở đây là đúng kiểu sai đắt nhất.
 */
export function parallelCandidates(graph: Graph, task: Task): Sourced<Task>[] {
  const mine = new Set(task.touches);
  const minePaths = taskPaths(graph, task);
  if (task.touches.length === 0) return [];

  return candidates(graph)
    .filter((c) => {
      const t = c.task.value;
      if (t.id === task.id || c.blockers.length > 0) return false;
      if (t.blocked_by.includes(task.id) || task.blocked_by.includes(t.id)) return false;
      if (t.touches.length === 0) return false;
      if (t.touches.some((m) => mine.has(m))) return false;
      return !pathsOverlap(taskPaths(graph, t), minePaths);
    })
    .map((c) => c.task)
    .sort((a, b) => a.value.id.localeCompare(b.value.id));
}

/** Task bị chặn, kèm lý do — hiển thị khi không còn việc nào làm được. */
export function blockedTasks(graph: Graph): Candidate[] {
  return candidates(graph)
    .filter((c) => c.blockers.length > 0)
    .sort((a, b) => a.task.value.id.localeCompare(b.task.value.id));
}
