import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { requireGanasRoot } from "../graph/paths.js";
import { notePath } from "../prune.js";
import { taskForSession, touchedPathsFor } from "../state.js";
import { type Argv, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { runShell } from "../util/exec.js";
import { existsAsync } from "../util/fsprobe.js";

/**
 * `ganas note "..."` — ghi chú thô, RẺ hơn mở `NOTES.md` ra gõ tay.
 *
 * Vì sao lệnh này tồn tại: ganas cưỡng chế rất chặt bên trong `.ganas/` (claim
 * bắt buộc anchor, hook chặn ghi, sổ cái hash-chain). Đúng cưỡng chế đó lại
 * đẩy văn xuôi sang kênh không ai gác — agent bị chặn khi thiếu anchor không
 * đi tìm bằng chứng, nó viết một đoạn vào `NOTES.md`, nơi miễn phí, rồi phiên
 * sau đọc và tin. Mục tiêu ở đây KHÔNG phải rào kỹ hơn, là làm đường đúng RẺ
 * HƠN đường sai: người viết chỉ gõ nội dung, lệnh tự đóng dấu mọi thứ còn lại.
 *
 * ĐỪNG thêm luật validate cho note — thêm luật là làm nó đắt lên, phá đúng lý
 * do nó tồn tại. Note KHÔNG BAO GIỜ được `loadGraph` đọc vào graph: nó sống
 * trong `runs/notes/`, ngoài mọi thư mục mà `graph/load.ts` quét. Không anchor
 * thì không phải tri thức — muốn nâng cấp thì đi đường claim → verify → fact,
 * không có lối tắt.
 *
 * Ghi vào `runs/notes/`, không phải `runs/` (chỗ handoff dùng): xem lý do ở
 * `NOTES_DIRNAME` trong `src/prune.ts` — trùng file với handoff (ghi ĐÈ) sẽ
 * làm mất note đã tích. Và ghi NỐI THÊM (append) — note là nhiều mẩu rời rạc
 * trong một phiên, ghi đè là mất; khác hẳn `handoff.ts` (ghi đè có chủ đích vì
 * là ảnh chụp trạng thái, không phải nhiều mẩu).
 */

/** Nhãn phiên khi gọi tay, không có `--session` — vẫn phải chạy được, không hỏi lại. */
const DEFAULT_SESSION_LABEL = "manual";

async function gitSha(root: string): Promise<string | undefined> {
  const result = await runShell("git rev-parse --short HEAD", { cwd: root, timeoutMs: 5000 });
  return result.code === 0 ? result.stdout.trim() : undefined;
}

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

export async function run(argv: Argv): Promise<number> {
  const content = argv.positional.join(" ").trim();
  if (!content) {
    throw new GanasError(`cần nội dung ghi chú — vd: ganas note "chưa rõ vì sao webhook retry 3 lần"`);
  }

  const root = requireGanasRoot(option(argv, "root") ?? process.cwd());
  const sessionId = option(argv, "session") ?? DEFAULT_SESSION_LABEL;

  const taskId = await taskForSession(root, sessionId);
  const touchedPaths = taskId ? await touchedPathsFor(root, sessionId, taskId) : [];
  const sha = await gitSha(root);
  const at = new Date().toISOString();

  const path = notePath(root, sessionId);
  await mkdir(dirname(path), { recursive: true });

  const entry = renderEntry({ at, taskId, sha, touchedPaths, content });
  if (await existsAsync(path)) {
    await appendFile(path, entry, "utf8");
  } else {
    await writeFile(path, renderHead(sessionId) + entry, "utf8");
  }

  process.stdout.write(`Đã ghi note vào ${path}\n`);
  return 0;
}
