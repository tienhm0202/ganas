#!/usr/bin/env node
/**
 * Bộ khởi chạy cho plugin.
 *
 * Hook và skill gọi file này thay vì gọi `ganas` trên PATH: plugin phải chạy
 * được cả khi người dùng chưa cài ganas toàn cục, và phải dùng đúng phiên bản
 * đi kèm plugin thay vì một phiên bản khác trên máy.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "..", "dist", "cli.js");

try {
  await import(`file://${cli}`);
} catch (err) {
  // Chưa build, hoặc cài hỏng. Với hook, im lặng thoát 0 kèm output rỗng là
  // đúng: mất lớp kiểm soát còn hơn chặn người dùng lại.
  const isHook = process.argv[2] === "hook";
  if (isHook) {
    process.stdout.write(
      JSON.stringify({
        systemMessage: `ganas chưa chạy được (đang bỏ qua kiểm soát): ${err?.message ?? err}`,
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
