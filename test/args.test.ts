import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { enabled, flag, multiOption, option, parseArgs } from "../src/util/args.js";
import { scanFilesWithText } from "./scan.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Bài học từ T-100: một hàng loạt test dựng `Argv` bằng tay với đúng khoá
 * `"no-recheck"` đã che mất việc `--no-recheck` chưa từng hoạt động — test
 * kiểm một thế giới không có thật, bỏ qua hẳn `parseArgs`. Mọi test dưới đây
 * đi từ CHUỖI THẬT (`raw: string[]`) qua `parseArgs`, đúng con đường CLI thật
 * đi qua.
 */

test("--no-recheck qua parseArgs sinh flags.recheck = false, KHÔNG phải flags['no-recheck']", () => {
  const argv = parseArgs(["--no-recheck"]);
  assert.equal(argv.flags.recheck, false);
  assert.equal(argv.flags["no-recheck"], undefined);
});

test("enabled(argv, 'recheck') đọc đúng --no-recheck: tắt khi có cờ, bật khi vắng mặt", () => {
  const withFlag = parseArgs(["T-001", "--no-recheck"]);
  assert.equal(enabled(withFlag, "recheck"), false, "--no-recheck phải tắt recheck");

  const withoutFlag = parseArgs(["T-001"]);
  assert.equal(enabled(withoutFlag, "recheck"), true, "vắng cờ thì recheck vẫn mặc định bật");
});

test("flag(argv, 'no-recheck') KHÔNG đọc được --no-recheck — đây chính là bug đã sửa ở T-100", () => {
  const argv = parseArgs(["--no-recheck"]);
  // `flag()` tra đúng tên khoá được truyền vào. Token `--no-recheck` không bao
  // giờ tạo ra khoá `"no-recheck"` trong `argv.flags` (xem test đầu tiên ở
  // trên), nên tra bằng tên này luôn ra `false` — kể cả khi người dùng đã gõ
  // cờ. Test này khoá lại đúng cái bẫy khiến `src/commands/commit.ts:259`
  // từng đọc sai khoá.
  assert.equal(flag(argv, "no-recheck"), false);
});

test("--recheck=false (dạng =) không đi qua nhánh no-, options nhận chuỗi 'false'", () => {
  const argv = parseArgs(["--recheck=false"]);
  assert.equal(argv.options.recheck, "false");
  assert.equal(argv.flags.recheck, undefined);
});

test("parseArgs: cờ boolean đã biết không nuốt token kế tiếp làm giá trị", () => {
  const argv = parseArgs(["commit", "--dry-run", "T-005"]);
  assert.equal(argv.flags["dry-run"], true);
  assert.deepEqual(argv.positional, ["commit", "T-005"]);
});

test("parseArgs: --key value gán option, --key=value cũng vậy", () => {
  const a = parseArgs(["--root", "/tmp/x"]);
  assert.equal(option(a, "root"), "/tmp/x");

  const b = parseArgs(["--root=/tmp/y"]);
  assert.equal(option(b, "root"), "/tmp/y");
});

test("parseArgs: cờ lặp lại gom vào multi theo đúng thứ tự", () => {
  const argv = parseArgs(["--anchor", "A", "--anchor", "B"]);
  assert.deepEqual(multiOption(argv, "anchor"), ["A", "B"]);
  // options chỉ giữ giá trị cuối cùng
  assert.equal(option(argv, "anchor"), "B");
});

test("parseArgs: sau `--` là passthrough, không diễn giải", () => {
  const argv = parseArgs(["run", "--", "--no-recheck", "T-001"]);
  assert.deepEqual(argv.passthrough, ["--no-recheck", "T-001"]);
  assert.equal(argv.flags.recheck, undefined, "cờ sau -- không được diễn giải thành flag");
});

/**
 * BỘ CHẶN CẢ LỚP LỖI, không riêng ca `no-recheck`.
 *
 * `parseArgs` lưu `--no-x` thành `flags.x = false` (xem docstring đầu
 * `src/util/args.ts`) — không bao giờ tạo khoá `"no-x"`. Đọc một khoá dạng đó
 * ở BẤT KỲ đâu ngoài chính `args.ts` là cùng một lớp lỗi đã khiến
 * `--no-recheck` chết lặng từ ngày được thêm (T-100): cờ không hoạt động,
 * không exception nào ném ra, chỉ âm thầm luôn nhận giá trị mặc định.
 *
 * Quét bằng văn bản trên toàn bộ `src/` (trừ `args.ts` — nơi ĐỊNH NGHĨA quy
 * ước `no-`, không phải nơi VI PHẠM nó), tìm `flag(...)`/`enabled(...)`/
 * `option(...)` gọi với một chuỗi bắt đầu bằng `"no-"`, hoặc index thẳng vào
 * `argv.flags["no-..."]`.
 */
test("⭐ không file nào trong src/ (ngoài args.ts) đọc một khoá flag dạng no-*", async () => {
  const files = await scanFilesWithText(ROOT, "src");
  const offenders: string[] = [];

  // `flag(argv, "no-x")` / `enabled(argv, "no-x")` / `option(argv, "no-x")` —
  // tên hàm rồi một chuỗi literal "no-..." xuất hiện trong danh sách đối số.
  const callRe = /\b(?:flag|enabled|option|multiOption)\([^)]*["'`]no-[\w-]+["'`]/g;
  // `argv.flags["no-x"]` / `argv.flags['no-x']` — index thẳng, không qua accessor.
  const indexRe = /\.flags\[\s*["'`]no-[\w-]+["'`]\s*\]/g;

  for (const { path, text } of files) {
    if (path === "src/util/args.ts") continue;
    for (const re of [callRe, indexRe]) {
      for (const m of text.matchAll(re)) {
        const line = text.slice(0, m.index).split("\n").length;
        offenders.push(`${path}:${line} — ${m[0]}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Đọc một khoá flag dạng "no-*" — parseArgs không bao giờ tạo khoá này, nó\n` +
      `lưu "--no-x" thành flags.x = false. Đây đúng bug đã sửa ở T-100\n` +
      `(src/commands/commit.ts từng đọc flag(argv, "no-recheck")). Dùng\n` +
      `enabled(argv, "<tên không có tiền tố no->") thay vào đó.\n` +
      offenders.join("\n"),
  );
});
