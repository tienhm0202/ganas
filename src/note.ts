import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { notePath } from "./prune.js";
import { existsAsync } from "./util/fsprobe.js";

/**
 * Lõi ghi note — rút từ `src/commands/note.ts` để hook `src/hooks/io/handlers.ts` có thể gọi.
 *
 * Tham khảo: `src/handoff.ts` là lõi dùng chung bởi CLI lẫn hook. Khác hẳn
 * `src/commands/note.ts` (mục đích ghi chú thô, CHƯA KIỂM), nhưng cấu trúc
 * ranh giới giữa render/append và I/O vẫn áp dụng: hàm tính toán (render)
 * là lõi thuần, hàm ghi file là lõi chạm đĩa.
 *
 * Luật: ĐỪNG thêm validate — tham khảo docstring trong `src/commands/note.ts`.
 */

function renderHead(sessionId: string): string {
  return (
    `# Ghi chép thô của phiên \`${sessionId}\` — CHƯA KIỂM, KHÔNG PHẢI tri thức dự án\n\n` +
    `Mỗi mục dưới đây là một ghi chú rời, không có anchor, không đi qua verify.\n` +
    `KHÔNG được coi là fact hay trích dẫn như tri thức đã kiểm chứng. Muốn nâng cấp\n` +
    `một điều ở đây thành tri thức thì đi đường claim → verify → fact.\n`
  );
}

function renderEntry(opts: {
  at: string;
  taskId: string | null;
  sha: string | undefined;
  touchedPaths: string[];
  content: string;
}): string {
  const lines = [
    "",
    "---",
    "",
    `## ${opts.at}`,
    "",
    `- task: \`${opts.taskId ?? "(không rõ)"}\``,
  ];
  if (opts.sha) lines.push(`- sha: \`${opts.sha}\``);
  lines.push(
    `- file đã đụng: ${
      opts.touchedPaths.length ? opts.touchedPaths.map((p) => `\`${p}\``).join(", ") : "(chưa đụng file nào)"
    }`,
    "",
    opts.content,
  );
  return lines.join("\n") + "\n";
}

export interface NoteEntry {
  at: string;
  taskId: string | null;
  sha: string | undefined;
  touchedPaths: string[];
  content: string;
}

export interface NoteResult {
  path: string;
  appended: boolean;
}

/**
 * Sinh và ghi note. Ghi nối thêm (append) nếu file đã tồn tại, ghi đè với header
 * nếu là lần đầu. Luôn ghi vào `runs/notes/<sessionId>.md`.
 */
export async function generateNote(root: string, sessionId: string, entry: NoteEntry): Promise<NoteResult> {
  const path = notePath(root, sessionId);
  await mkdir(dirname(path), { recursive: true });

  const entryContent = renderEntry(entry);
  let appended = false;
  if (await existsAsync(path)) {
    await appendFile(path, entryContent, "utf8");
    appended = true;
  } else {
    await writeFile(path, renderHead(sessionId) + entryContent, "utf8");
  }

  return { path, appended };
}
