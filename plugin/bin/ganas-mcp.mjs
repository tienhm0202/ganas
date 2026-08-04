#!/usr/bin/env node
/**
 * Bộ khởi chạy MCP server — dùng cho editor khác Claude Code (Cursor,
 * Windsurf, …) gọi ganas qua Model Context Protocol thay vì hook.
 *
 * Cùng pattern với `bin/ganas.mjs`: resolve `dist/mcp.js` NGAY TRONG
 * `plugin/`, không trỏ ra ngoài — Claude Code (và các host MCP khác) cài
 * plugin bằng cách copy đúng thư mục `plugin/`.
 *
 * Không fail-open như `ganas.mjs`: đó là quy ước riêng cho hook (không được
 * biến máy hỏng thành hàng rào chặn người dùng). MCP server không phải hook —
 * hỏng thì thoát lỗi rõ ràng, host MCP tự biết server không khởi động được.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, "..", "dist", "mcp.js");

try {
  await import(`file://${server}`);
} catch (err) {
  process.stderr.write(
    `ganas-mcp: không nạp được ${server}\n` +
      `  Nếu đang chạy từ mã nguồn, chạy "npm run build" trước.\n` +
      `  Chi tiết: ${err?.message ?? err}\n`,
  );
  process.exit(70);
}
