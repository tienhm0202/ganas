#!/usr/bin/env node
/**
 * Bộ khởi chạy cho plugin.
 *
 * Hook và skill gọi file này thay vì gọi `ganas` trên PATH: plugin phải chạy
 * được cả khi người dùng chưa cài ganas toàn cục, và phải dùng đúng phiên bản
 * đi kèm plugin thay vì một phiên bản khác trên máy.
 *
 * `dist/` nằm NGAY TRONG `plugin/` là bắt buộc, không phải tuỳ chọn: Claude Code
 * cài plugin bằng cách copy đúng thư mục này, nên đường dẫn trỏ ra ngoài sẽ
 * không tồn tại sau khi cài. Trước P2 N30 nó trỏ `../../dist` và mọi bản cài qua
 * marketplace đều im lặng không làm gì.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "dist", "cli.js");

try {
  await import(`file://${cli}`);
} catch (err) {
  // Chưa build, hoặc cài hỏng. Với hook, im lặng thoát 0 kèm output rỗng là
  // đúng: mất lớp kiểm soát còn hơn chặn người dùng lại.
  const isHook = process.argv[2] === "hook";
  if (isHook) {
    // Vẫn thoát 0 — công cụ hỏng không được biến thành hàng rào nhốt người dùng.
    // Nhưng nói ĐỦ để người đọc biết đây là lỗi CÀI ĐẶT chứ không phải trục trặc
    // thoáng qua: bản cài thiếu build thì mọi luật của ganas đều không chạy, mà
    // giao diện vẫn báo plugin đã cài thành công.
    process.stdout.write(
      JSON.stringify({
        systemMessage:
          `⚠ ganas KHÔNG chạy — mọi kiểm soát của nó đang tắt.\n` +
          `Bản cài thiếu \`plugin/dist/\` (chi tiết: ${err?.message ?? err}).\n` +
          `Sửa: vào thư mục nguồn ganas chạy \`npm install && npm run build\`, ` +
          `rồi \`claude plugin marketplace update ganas\`.`,
      }),
    );
    process.exit(0);
  }
  process.stderr.write(
    `ganas: không nạp được ${cli}\n` +
      `  Nếu đang chạy từ mã nguồn, chạy "npm run build" trước.\n` +
      `  Chi tiết: ${err?.message ?? err}\n`,
  );
  process.exit(70);
}
