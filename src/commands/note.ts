import { requireGanasRoot } from "../graph/paths.js";
import { generateNote } from "../note.js";
import { taskForSession, touchedPathsFor } from "../state.js";
import { type Argv, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { runShell } from "../util/exec.js";

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

  const result = await generateNote(root, sessionId, { at, taskId, sha, touchedPaths, content });

  process.stdout.write(`Đã ghi note vào ${result.path}\n`);
  return 0;
}
