import type { GateResult } from "./gate.js";
import type { Graph } from "./graph/types.js";
import type { Task } from "./model/index.js";

/**
 * Dựng commit message TỪ dữ liệu đã kiểm chứng, không phải văn xuôi tự bịa.
 *
 * "Làm việc gì" lấy từ chính spine (task/design/goal). "Test thế nào" lấy
 * nguyên kết quả `evaluateGate` — chỉ gọi được hàm này sau khi gate đã `ok`,
 * nên mọi mục hiện ra ở đây đều THẬT SỰ đã chấm qua, không phải khai suông.
 *
 * Không bao giờ có dòng ghi công AI/trợ lý — đây là quy ước cứng của ganas,
 * không phải tuỳ chọn cấu hình.
 */
export function buildCommitMessage(graph: Graph, task: Task, gate: GateResult): string {
  const lines: string[] = [`${task.id}: ${task.title}`, "", "Điều kiện hoàn thành:"];

  for (const r of gate.results) {
    const mark = r.status === "pass" ? "✓" : r.status === "pending_human" ? "…" : "✗";
    lines.push(`  ${mark} ${r.label}`);
  }

  const design = graph.designs.get(task.implements)?.value;
  const context = [
    `phục vụ ${task.serves.join(", ")}`,
    design ? `design ${design.id} — ${design.title}` : `design ${task.implements}`,
    `phạm vi ${task.scope}`,
  ].join(" · ");

  lines.push("", context);

  return lines.join("\n") + "\n";
}
