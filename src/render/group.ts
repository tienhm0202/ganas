import type { Graph } from "../graph/types.js";
import type { Task } from "../model/index.js";

/**
 * In một danh sách task đã sắp xếp sẵn (thứ tự ưu tiên do chỗ gọi quyết định —
 * hàm này KHÔNG sắp lại) thành cây `Scope → Design → Task`.
 *
 * Dữ liệu nhóm (`task.scope`, `task.implements`) đã có sẵn trên mọi task từ
 * trước — đây chỉ là cách trình bày lại CÙNG một danh sách, không phải nguồn
 * dữ liệu mới và không phải chỗ quyết định thứ tự.
 *
 * Scope/design treo (không có trong graph) thì in id trần rồi đi tiếp: đây là
 * đường hiển thị, không phải đường validate — `ganas validate` đã có luật
 * riêng bắt id treo.
 *
 * `taskOf` lấy `Task` ra khỏi từng phần tử — mỗi chỗ gọi giữ item ở dạng khác
 * nhau (`Candidate` ở `commands/next.ts`, `Sourced<Task>` ở `render/brief.ts`).
 * `renderTask` in nội dung của một mục; dòng đầu thường là `id — title`, có
 * thể kèm thêm dòng riêng của chỗ gọi (vd `chờ: ...`) tự thụt so với dòng đầu
 * bên trong chuỗi trả về — hàm này chỉ thụt LẠI TOÀN BỘ khối đó theo đúng độ
 * sâu của một task trong cây, không đụng vào nội dung bên trong.
 */
export function renderGroupedByScope<T>(
  graph: Graph,
  items: readonly T[],
  taskOf: (item: T) => Task,
  renderTask: (item: T) => string,
): string {
  // scope id -> (design id -> item[]); thứ tự chèn của cả hai Map là thứ tự
  // LẦN ĐẦU gặp trong `items` — giữ nguyên thứ tự ưu tiên bên trong từng
  // nhóm, và nhóm nào chứa task hạng cao nhất thì hiện trước.
  const byScope = new Map<string, Map<string, T[]>>();

  for (const item of items) {
    const t = taskOf(item);
    let byDesign = byScope.get(t.scope);
    if (!byDesign) {
      byDesign = new Map();
      byScope.set(t.scope, byDesign);
    }
    let group = byDesign.get(t.implements);
    if (!group) {
      group = [];
      byDesign.set(t.implements, group);
    }
    group.push(item);
  }

  const lines: string[] = [];
  for (const [scopeId, byDesign] of byScope) {
    const scope = graph.scopes.get(scopeId)?.value;
    lines.push(scope ? `${scopeId} — ${scope.title}` : scopeId);

    for (const [designId, group] of byDesign) {
      const design = graph.designs.get(designId)?.value;
      lines.push(`  ${design ? `${designId} — ${design.title}` : designId}`);

      for (const item of group) {
        for (const line of renderTask(item).split("\n")) lines.push(`    ${line}`);
      }
    }
  }

  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}
