import { mkdir, open, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Khoá mutex ngắn hạn quanh một lượt ĐỌC-SỬA-GHI vào một file dùng chung.
 *
 * Khối này là chỗ DUY NHẤT cài phép khoá đó. Nó nằm ở `src/util/` chứ không ở
 * `src/graph/` vì người dùng nó không chỉ có graph: `verify/ledger.ts` cần
 * đúng cơ chế này để `appendEntry` không đứt chuỗi hash khi hai `ganas verify`
 * chạy chồng nhau (ICE-014), còn `commands/icebox.ts` và `commands/proposal.ts`
 * đã dùng nó từ trước qua `graph/claim.ts`.
 *
 * Bản ở `graph/claim.ts` vẫn còn, CÓ CHỦ Ý: file đó thuộc phạm vi P-hook, dời
 * nó là một task riêng (T-059). Tới lúc đó `claim.ts` tái xuất/nhập từ đây và
 * bản sao này biến mất.
 */

const LOCK_POLL_MS = 20;

/**
 * Khoá MUTEX ngắn hạn quanh một đoạn code — khác hẳn `reserveId`/`claimTask`
 * (`graph/claim.ts`) ở BẢN CHẤT thứ được bảo vệ: hai hàm đó bảo vệ một CON
 * SỐ/một TASK (quyền sở hữu một thực thể), còn `withFileLock` bảo vệ một LƯỢT
 * ĐỌC-SỬA-GHI vào một FILE dùng chung. `ganas icebox add` cần đúng cái này:
 * `reserveId` chỉ đảm bảo hai lời gọi không nhận trùng ID, nó không đảm bảo gì
 * về việc hai tiến trình cùng đọc → sửa → ghi file tháng
 * `.ganas/icebox/YYYY-MM.yaml` — phiên ghi SAU cùng thắng, đè mất mục mà phiên
 * ghi TRƯỚC vừa thêm, không một tiếng động (đúng lỗi `reserveId` đã vá cho
 * id.ts, nhưng ở tầng NỘI DUNG file, không phải ở tầng con số). `appendEntry`
 * của sổ cái xác minh là ca thứ hai, và ở đó cái mất còn nặng hơn: hai tiến
 * trình đọc cùng một trạng thái rồi cùng ghi sinh `seq` trùng và `prev_hash`
 * sai — tức ĐỨT chính chuỗi hash mà ganas dùng để chứng minh sổ cái không bị
 * sửa tay.
 *
 * Cùng primitive nguyên tử `open(file, "wx")` với `acquireLock` (`graph/claim.ts`),
 * nhưng vòng đời khác hẳn nên là hàm riêng thay vì tái dùng `acquireLock`:
 *   - `acquireLock` trả `boolean` NGAY, để người gọi tự quyết nhảy sang ứng
 *     viên khác (đúng nhu cầu của `reserveId`/`claimTask`). `withFileLock`
 *     ĐỢI (poll ngắn) tới khi giành được khoá rồi mới chạy `fn` — người gọi
 *     không có "ứng viên khác" để nhảy sang, chỉ có một file duy nhất cần ghi.
 *   - TTL của `withFileLock` tính bằng MILI GIÂY, không phải phút: khoá này
 *     chỉ sống trong đúng một lượt đọc-sửa-ghi (vài chục mili giây), không
 *     phải một phiên làm việc. TTL dài như `claim.ttl_minutes` sẽ khiến một
 *     tiến trình crash giữa chừng khoá cả file hàng giờ.
 *   - Không cần `Claim` (session_id + claimed_at): đây là mutex thuần, không
 *     ai "sở hữu" khoá theo nghĩa `sameSessionKeeps` — chỉ cần biết khoá còn
 *     mới hay đã bỏ hoang, nên dùng `mtime` của chính file khoá rỗng thay vì
 *     ghi/đọc JSON.
 *
 * Khoá bị bỏ hoang (tiến trình giữ nó crash) được nhận ra qua `mtime` cũ hơn
 * `ttlMs` và bị giành lại — cùng lý lẽ "claim cũ quá hạn" của `acquireLock`.
 * Giải phóng trong `finally`: `fn` ném lỗi thì khoá vẫn phải được nhả, nếu
 * không lỗi ứng dụng biến thành khoá treo vĩnh viễn.
 */
export async function withFileLock<T>(lockFile: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(lockFile), { recursive: true });

  const giveUpAfterMs = ttlMs * 5; // vài chu kỳ TTL — đủ để một khoá bỏ hoang được giành lại và dùng, không treo vô hạn.
  const waitStartedAt = Date.now();

  for (;;) {
    try {
      const handle = await open(lockFile, "wx");
      await handle.close();
      break; // giành được khoá
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      const info = await stat(lockFile).catch(() => null);
      if (!info || Date.now() - info.mtimeMs > ttlMs) {
        // Không còn file (vừa được giải phóng giữa hai bước đọc), hoặc khoá đã
        // bỏ hoang quá TTL — giành lại ngay, không cần đợi thêm.
        await rm(lockFile, { force: true });
        continue;
      }

      if (Date.now() - waitStartedAt > giveUpAfterMs) {
        throw new Error(
          `withFileLock: không giành được khoá ${lockFile} sau ${giveUpAfterMs}ms — ` +
            `có tiến trình khác đang giữ nó lâu bất thường.`,
          { cause: err },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
    }
  }

  try {
    return await fn();
  } finally {
    await rm(lockFile, { force: true });
  }
}
