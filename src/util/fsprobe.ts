import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";

/**
 * Chỗ DUY NHẤT tra trạng thái filesystem — có tồn tại không, thư mục này có gì.
 *
 * ## Vì sao khối này tồn tại, và vì sao nó KHÔNG kéo theo ai
 *
 * `.claude/rules/architecture.md` (mục "Công cụ io dùng chung") chia I/O làm
 * hai vế: TRA TRẠNG THÁI là công cụ, ĐỌC/GHI NỘI DUNG mới là chạm ra ngoài
 * thật. Hàm nghiệp vụ gọi công cụ vẫn là hàm nghiệp vụ — khối chứa nó không vì
 * thế mà phải khai `nature: io`.
 *
 * Nhưng luật đó chỉ đứng được khi công cụ nằm MỘT chỗ. Mỗi nơi tự
 * `import { existsSync } from "node:fs"` thì không còn gì để thay khi đổi nền
 * tảng, và "công cụ" chỉ là tên gọi khác của "gọi thẳng". Đây là cái một chỗ
 * đó, cùng khuôn `src/util/exec.ts` đang giữ cho việc sinh tiến trình con.
 *
 * ## Cái gì KHÔNG được vào đây
 *
 * Đọc/ghi nội dung file, sinh tiến trình, gọi mạng, nói chuyện qua stdin/stdout.
 * Thêm `readFile` vào đây là biến một công cụ tra thành cửa hậu cho mọi thứ,
 * và luật ở trên mất nghĩa ngay hôm đó.
 */

/**
 * Hình dạng tối thiểu của một mục trong thư mục.
 *
 * Khai lại thay vì tái xuất `Dirent` để nơi gọi KHÔNG phải `import` gì từ
 * `node:fs` — nếu còn phải import thì việc gom về một chỗ chẳng đạt được gì.
 * `Dirent` thoả cấu trúc này nên `listDir` trả thẳng nó về được.
 */
export interface DirEntry {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

/** Đường dẫn này có tồn tại không. Bản đồng bộ — dùng trong vòng lặp đi ngược lên cây thư mục. */
export function exists(path: string): boolean {
  return existsSync(path);
}

/**
 * Bản bất đồng bộ của `exists`.
 *
 * Dùng `stat` chứ không `existsSync`: nơi gọi đã ở trong ngữ cảnh async thì
 * chặn vòng lặp sự kiện cho một câu hỏi có/không là phí, và `stat` ném lỗi khi
 * không có — bắt lại thành `false` là đúng ngữ nghĩa "không tồn tại".
 */
export async function existsAsync(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Liệt kê một thư mục. Thư mục không tồn tại hoặc không đọc được thì trả mảng
 * RỖNG, không ném.
 *
 * Cố ý nuốt lỗi, vì mọi nơi gọi trong ganas đều đang DUYỆT cây: gặp một thư mục
 * không vào được thì bỏ qua nhánh đó rồi đi tiếp, chứ không huỷ cả lượt duyệt.
 * Nơi nào cần phân biệt "rỗng" với "không đọc được" thì phải hỏi `exists()`
 * trước — và nếu có nơi như thế thì nó nên nói ra ở chỗ gọi, không phải bắt
 * hàm này gánh hai ngữ nghĩa.
 */
export async function listDir(dir: string): Promise<DirEntry[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Thời điểm sửa đổi gần nhất (mtime) của một đường dẫn, mili giây kể từ epoch.
 *
 * Trả `undefined` khi đường dẫn không tồn tại hoặc không đọc được — cùng tinh
 * thần "không ném" của `listDir`: nơi gọi đang TRA trạng thái ("file này đổi
 * chưa"), không phải khẳng định file luôn ở đó. Chỉ đọc mtime, không đọc nội
 * dung — vế "không ném" không mở đường cho `readFile` vào đây.
 */
export async function mtimeMs(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return undefined;
  }
}
