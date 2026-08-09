import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Danh sách lệnh phải khớp với bảng `COMMANDS` trong src/cli.ts.
 *
 * Cố ý KHÔNG `import` trực tiếp src/cli.ts để lấy `COMMANDS`: file đó là một
 * script CLI, không phải thư viện — dòng cuối gọi `main().then(...).catch(...)`
 * ở top-level ngay khi module được nạp. Import nó trong test sẽ khiến CLI thật
 * chạy với `process.argv` của tiến trình test runner (không phải argv của
 * "ganas"), in HELP/thông báo lỗi ra stdout/stderr, và có thể set
 * `process.exitCode` — làm hỏng cả lượt `npm test`. Vì vậy: danh sách dưới
 * đây được ghi tay, và test đối chiếu bằng cách đọc NỘI DUNG VĂN BẢN của
 * src/cli.ts (khối `COMMANDS` + chuỗi `HELP`), không nạp module.
 *
 * Nếu thêm/xoá/đổi tên lệnh trong src/cli.ts, phải sửa cả ba chỗ: mảng này,
 * chuỗi HELP trong src/cli.ts (test dưới sẽ tự bắt nếu quên), và
 * docs/COMMANDS.md (cũng tự bắt nếu quên).
 */
const EXPECTED_COMMANDS = [
  "flow",
  "init",
  "validate",
  "scope",
  "brief",
  "next",
  "gate",
  "verify",
  "trace",
  "commit",
  "handoff",
  "prune",
  "ledger",
  "hook",
] as const;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function readCliSource(): Promise<string> {
  return readFile(join(ROOT, "src", "cli.ts"), "utf8");
}

async function readCommandsDoc(): Promise<string> {
  return readFile(join(ROOT, "docs", "COMMANDS.md"), "utf8");
}

test("EXPECTED_COMMANDS khớp với khối `const COMMANDS = {...}` trong src/cli.ts", async () => {
  const src = await readCliSource();

  const match = src.match(/const COMMANDS:[^\n]*=\s*{([\s\S]*?)\n};/);
  assert.ok(match, "không tìm thấy khối `const COMMANDS = {...}` trong src/cli.ts");
  const body = match[1]!;

  const keysInSource = [...body.matchAll(/^\s*([a-z-]+):\s*\(\)\s*=>\s*import\(/gm)].map(
    (m) => m[1]!,
  );

  assert.ok(keysInSource.length > 0, "không đọc được tên lệnh nào từ khối COMMANDS");
  assert.deepEqual(
    [...keysInSource].sort(),
    [...EXPECTED_COMMANDS].sort(),
    "bảng COMMANDS trong src/cli.ts đã đổi — cập nhật EXPECTED_COMMANDS ở test này và docs/COMMANDS.md",
  );
});

test("mỗi lệnh trong EXPECTED_COMMANDS được liệt kê trong chuỗi HELP của src/cli.ts", async () => {
  const src = await readCliSource();

  const match = src.match(/const HELP = `([\s\S]*?)`;/);
  assert.ok(match, "không tìm thấy chuỗi HELP trong src/cli.ts");
  const help = match[1]!;

  for (const cmd of EXPECTED_COMMANDS) {
    assert.match(
      help,
      new RegExp(`^  ${cmd}\\b`, "m"),
      `lệnh "${cmd}" không thấy ở đầu dòng trong chuỗi HELP — thêm mục mô tả cho nó`,
    );
  }
});

test("global flags trong HELP khớp với những gì src/cli.ts thực sự đọc", async () => {
  const src = await readCliSource();
  const match = src.match(/const HELP = `([\s\S]*?)`;/);
  assert.ok(match);
  const help = match[1]!;

  for (const flag of ["-C, --cwd", "--session", "--json", "-h, --help", "-v, --version"]) {
    assert.ok(help.includes(flag), `HELP thiếu tuỳ chọn chung "${flag}"`);
  }
});

test("docs/COMMANDS.md có một mục ### riêng cho mỗi lệnh trong EXPECTED_COMMANDS", async () => {
  const doc = await readCommandsDoc();
  const headings = [...doc.matchAll(/^### `ganas ([a-z-]+)/gm)].map((m) => m[1]!);

  assert.ok(
    headings.length > 0,
    "không tìm thấy tiêu đề ### `ganas <lệnh>` nào trong docs/COMMANDS.md",
  );
  assert.deepEqual(
    [...new Set(headings)].sort(),
    [...EXPECTED_COMMANDS].sort(),
    "tiêu đề lệnh trong docs/COMMANDS.md không khớp EXPECTED_COMMANDS (thiếu, thừa, hoặc lệch tên)",
  );
});

test("docs/COMMANDS.md nhắc tới mọi lệnh (dạng `ganas <tên>`) ít nhất một lần", async () => {
  const doc = await readCommandsDoc();

  for (const cmd of EXPECTED_COMMANDS) {
    assert.match(
      doc,
      new RegExp(`ganas ${cmd}\\b`),
      `docs/COMMANDS.md không nhắc tới "ganas ${cmd}" ở đâu cả`,
    );
  }
});

test("docs/COMMANDS.md đề cập cả 4 mã thoát chung dùng xuyên suốt CLI", async () => {
  const [doc, errorsSrc] = await Promise.all([
    readCommandsDoc(),
    readFile(join(ROOT, "src", "util", "errors.ts"), "utf8"),
  ]);

  // Mã 2 (NotInitializedError) là số cứng trong source — đối chiếu để không
  // ghi nhầm trong doc nếu source đổi.
  assert.match(
    errorsSrc,
    /super\(\s*[\s\S]*?,\s*2,?\s*\)/,
    "NotInitializedError không còn dùng mã thoát 2 — cập nhật docs/COMMANDS.md",
  );

  for (const code of ["`0`", "`1`", "`2`", "`70`"]) {
    assert.ok(doc.includes(code), `docs/COMMANDS.md thiếu giải thích cho mã thoát ${code}`);
  }
});
