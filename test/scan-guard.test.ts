import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { scanFilesWithText } from "./scan.js";

const ROOT = join(import.meta.dirname, "..");

/**
 * KHÔNG file test nào được tự `readdir`/`readdirSync` ngoài `test/scan.ts`.
 *
 * `test/module-nature.test.ts:105` từng kết bằng `assert.deepEqual(wrong,
 * [])` mà `wrong` rỗng có hai nghĩa NGƯỢC NHAU — "đã quét hết, không vi phạm"
 * và "không quét được gì". `test/scan.ts` sửa việc đó bằng cách NÉM khi vòng
 * quét rỗng, nhưng helper chỉ còn tác dụng khi nó là NƠI DUY NHẤT gọi
 * `readdir` để dựng danh sách kiểm — một test tự viết lại vòng quét riêng là
 * quay lại đúng lỗ hổng cũ, chỉ đổi chỗ.
 *
 * Khuôn theo `packages/github-client/src/no-child-process.test.ts` (repo
 * mosonlab/anneal).
 */

/** `test/scan.ts` là chỗ ĐƯỢC PHÉP tự readdir — nó chính là helper đang canh. */
const ALLOWED = new Set(["test/scan.ts"]);

/**
 * Chỗ tự readdir ngoài `test/scan.ts` mà KHÔNG phải lỗi — mỗi mục phải nói rõ
 * vì sao `scanFiles`/`scanYamlDocs` (ném khi rỗng) không hợp cho ca đó.
 */
const EXEMPT: Record<string, string> = {
  "test/lock.test.ts":
    "readdir ở đây không dựng danh sách file để kiểm — nó khẳng định thư mục " +
    "khoá RỖNG là trạng thái ĐÚNG sau khi nhả khoá. scanFiles() ném lỗi khi rỗng, " +
    "tức ngược hẳn ý nghĩa cần ở đây.",
};

test("⭐ không file test nào tự readdir ngoài test/scan.ts", async () => {
  const files = await scanFilesWithText(ROOT, "test");

  assert.ok(
    files.length > 0,
    "vòng quét không thấy file test nào, nên nó không chứng minh được gì",
  );

  // Chỉ bắt IMPORT thật của readdir/readdirSync từ node:fs — không bắt chữ
  // "readdir" xuất hiện trong comment hay chuỗi (chính file này, và
  // `module-nature.test.ts`/`fsprobe.test.ts` đều NHẮC tới cái tên đó trong
  // văn xuôi/danh sách lọc mà không tự gọi).
  const offenders: string[] = [];
  for (const { path, text } of files) {
    if (ALLOWED.has(path) || EXEMPT[path]) continue;
    for (const m of text.matchAll(/import \{([^}]*)\} from "node:fs(?:\/promises)?"/g)) {
      const names = m[1]!.split(",").map((x) => x.trim().split(" as ")[0]!.trim());
      if (names.some((n) => n === "readdir" || n === "readdirSync")) {
        offenders.push(path);
        break;
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Các file test sau tự gọi readdir/readdirSync thay vì dùng test/scan.ts:\n` +
      offenders.join("\n") +
      `\n\nDùng scanFiles/scanFilesWithText/scanYamlDocs từ test/scan.ts, hoặc nếu ` +
      `ca này thật sự khác (như test/lock.test.ts), thêm vào EXEMPT kèm lý do.`,
  );
});

test("⭐ mọi mục EXEMPT đều trỏ vào file CÓ THẬT và giải thích được", async () => {
  const files = await scanFilesWithText(ROOT, "test");
  const paths = new Set(files.map((f) => f.path));

  for (const [path, why] of Object.entries(EXEMPT)) {
    assert.ok(paths.has(path), `EXEMPT trỏ tới file không tồn tại: ${path}`);
    assert.ok(why.trim().length > 20, `EXEMPT ${path} phải nói rõ vì sao`);
  }
});
