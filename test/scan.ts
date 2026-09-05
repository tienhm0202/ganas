import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "yaml";

/**
 * Chỗ DUY NHẤT test được phép tự `readdir` để dựng danh sách file cho một
 * phép kiểm — canh bởi `test/scan-guard.test.ts`.
 *
 * Trước file này, mỗi test tự viết lại một vòng quét (`module-nature.test.ts`,
 * `module-map.test.ts`, `fsprobe.test.ts`, `no-dead-ends.test.ts` — bốn bản
 * gần như giống hệt nhau), và không bản nào phân biệt được "đã quét hết,
 * không thấy vi phạm" với "quét trật, không thấy GÌ cả". Hai trạng thái đó
 * cùng cho ra `[]`, nên `assert.deepEqual(wrong, [])` xanh trong cả hai ca —
 * một glob sai hay một lần đổi cấu trúc thư mục là hàng rào tắt lặng lẽ mà
 * test vẫn báo xanh (`test/module-nature.test.ts:105` là ca gốc).
 *
 * Sửa ở ĐÚNG chỗ hỏng: hàm quét NÉM khi không thấy file nào, không trả một
 * mảng rỗng cho người gọi tự đoán nghĩa. Người gọi không còn phải nhớ tự kiểm
 * — kỷ luật nằm trong helper, đúng thứ đang thiếu.
 */

/**
 * Quét đệ quy `dir` (tương đối `root`) tìm mọi file có đuôi `ext`, trả về
 * đường dẫn tương đối `root`, dùng dấu `/`.
 *
 * NÉM nếu không tìm thấy file nào — ở một vòng quét dựng danh sách cho một
 * phép kiểm, rỗng không phải là "không có gì sai", mà là dấu hiệu quét TRẬT
 * (glob sai, đổi tên thư mục, hoặc trỏ nhầm `root`). Người gọi cần con số 0
 * thật (ví dụ kiểm tra một thư mục ĐÃ nhả khoá) thì đây không phải hàm phù
 * hợp — dùng `readdir` thẳng và ghi lại tại sao ở `test/scan-guard.test.ts`.
 */
export async function scanFiles(root: string, dir: string, ext = ".ts"): Promise<string[]> {
  const out: string[] = [];

  async function walk(sub: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(join(root, sub), { withFileTypes: true });
    } catch (err) {
      throw new Error(
        `scanFiles: không đọc được thư mục "${sub}" (dưới ${root}): ${(err as Error).message}`,
        { cause: err },
      );
    }
    for (const e of entries) {
      const rel = `${sub}/${e.name}`;
      if (e.isDirectory()) await walk(rel);
      else if (e.name.endsWith(ext)) out.push(rel);
    }
  }

  await walk(dir);

  if (out.length === 0) {
    throw new Error(
      `scanFiles: quét "${join(root, dir)}" tìm file "*${ext}" không thấy file nào.\n` +
        `Rỗng ở đây là LỖI của phép quét (glob/đuôi file sai, thư mục đổi tên, hoặc ` +
        `${dir} không nằm dưới ${root}), không phải một kết quả hợp lệ — một vòng quét ` +
        `rỗng khiến mọi phép kiểm dựa trên nó xanh mà không chứng minh được gì.`,
    );
  }

  return out;
}

/** Như `scanFiles`, kèm sẵn nội dung UTF-8 của từng file. */
export async function scanFilesWithText(
  root: string,
  dir: string,
  ext = ".ts",
): Promise<Array<{ path: string; text: string }>> {
  const files = await scanFiles(root, dir, ext);
  return Promise.all(
    files.map(async (path) => ({ path, text: await readFile(join(root, path), "utf8") })),
  );
}

/**
 * Đọc mọi file `*.yaml` nằm TRỰC TIẾP trong `dir` (không đệ quy), parse từng
 * file bằng `yaml`, trả về mảng đã parse. Dùng cho các thư mục dạng
 * `.ganas/modules/` — mỗi file một bản ghi độc lập.
 *
 * NÉM nếu không thấy file `.yaml` nào, cùng lý do với `scanFiles`.
 */
export async function scanYamlDocs<T>(root: string, dir: string): Promise<T[]> {
  const full = join(root, dir);
  let names: string[];
  try {
    names = await readdir(full);
  } catch (err) {
    throw new Error(
      `scanYamlDocs: không đọc được thư mục "${dir}" (dưới ${root}): ${(err as Error).message}`,
      { cause: err },
    );
  }

  const yamlFiles = names.filter((f) => f.endsWith(".yaml"));
  if (yamlFiles.length === 0) {
    throw new Error(
      `scanYamlDocs: quét "${full}" tìm file "*.yaml" không thấy file nào.\n` +
        `Rỗng ở đây là LỖI của phép quét, không phải kết quả hợp lệ.`,
    );
  }

  return Promise.all(
    yamlFiles.map(async (f) => parse(await readFile(join(full, f), "utf8")) as T),
  );
}
