/**
 * Vào/ra cho hook Claude Code.
 *
 * Nguyên tắc bất di bất dịch: **hook không bao giờ được làm hỏng phiên**. Mọi
 * lỗi bên trong ganas đều biến thành output rỗng (cho phép đi tiếp) kèm một
 * systemMessage. Một công cụ kiểm soát mà tự nó chặn người dùng khi hỏng thì
 * tệ hơn là không có.
 */

// Kiểu và hằng dữ liệu ĐÃ CHUYỂN sang `../policy/types.js` (T-041) — lõi không
// được import ngược từ vỏ. Tái xuất ở đây để `src/commands/hook.ts` (khối
// M-commands, phạm vi P-cli) không phải đổi chỗ import: sửa file đó là sửa
// khối ngoài phạm vi của task đã chuyển.
export {
  ALLOW,
  degraded,
  type HookInput,
  type HookOutput,
} from "../policy/types.js";

import type { HookInput, HookOutput } from "../policy/types.js";

export async function readHookInput(): Promise<HookInput> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as HookInput;
  } catch {
    return {};
  }
}

export function writeHookOutput(output: HookOutput): void {
  process.stdout.write(JSON.stringify(output));
}
