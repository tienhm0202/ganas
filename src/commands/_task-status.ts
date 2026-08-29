import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parseDocument } from "yaml";

import type { Sourced } from "../graph/types.js";
import type { Task } from "../model/index.js";

export type TaskStatus = Task["status"];

/**
 * Ghi `status` (kèm các trường phụ nếu có) vào file task, GIỮ NGUYÊN comment.
 *
 * Dùng `Document` của `yaml` như `writeBackFact` (src/verify/run.ts): serialize
 * lại từ object JS sẽ xoá sạch chú thích, mà chú thích trong file spine thường
 * là phần giải thích quan trọng nhất.
 *
 * `sourced.index` khác `undefined` nghĩa là file chứa nhiều thực thể trong một
 * mảng — đường ghi phải bắt đầu từ chỉ số đó, không phải từ gốc tài liệu.
 *
 * Trả về nội dung CŨ để người gọi khôi phục được khi bước sau hỏng — đánh dấu
 * một trạng thái cho việc không bao giờ xảy ra là nói dối lịch sử.
 */
export async function setTaskStatus(
  root: string,
  sourced: Sourced<Task>,
  status: TaskStatus,
  extra: Record<string, string> = {},
): Promise<string> {
  const file = join(root, sourced.file);
  const original = await readFile(file, "utf8");
  const doc = parseDocument(original);
  const base = sourced.index === undefined ? [] : [sourced.index];

  doc.setIn([...base, "status"], status);
  for (const [key, value] of Object.entries(extra)) doc.setIn([...base, key], value);

  await writeFile(file, doc.toString(), "utf8");
  return original;
}
