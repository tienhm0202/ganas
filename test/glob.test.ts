import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExecResult } from "../src/util/exec.js";
import { judge } from "../src/util/exec.js";
import { matchesAny } from "../src/util/glob.js";

test("* chỉ khớp trong một cấp thư mục", () => {
  assert.equal(matchesAny("src/a.ts", ["src/*.ts"]), true);
  assert.equal(matchesAny("src/deep/a.ts", ["src/*.ts"]), false);
});

test("** khớp nhiều cấp", () => {
  assert.equal(matchesAny("src/a.ts", ["src/**"]), true);
  assert.equal(matchesAny("src/deep/nested/a.ts", ["src/**"]), true);
  assert.equal(matchesAny("other/a.ts", ["src/**"]), false);
});

test("a/**/b khớp cả khi không có cấp trung gian", () => {
  assert.equal(matchesAny("src/index.ts", ["src/**/index.ts"]), true);
  assert.equal(matchesAny("src/a/b/index.ts", ["src/**/index.ts"]), true);
  assert.equal(matchesAny("src/index.js", ["src/**/index.ts"]), false);
});

test("{a,b} nở ra nhiều pattern", () => {
  assert.equal(matchesAny("src/a.ts", ["src/*.{ts,tsx}"]), true);
  assert.equal(matchesAny("src/a.tsx", ["src/*.{ts,tsx}"]), true);
  assert.equal(matchesAny("src/a.js", ["src/*.{ts,tsx}"]), false);
});

test("dấu chấm trong pattern không thành ký tự bất kỳ", () => {
  assert.equal(matchesAny("srcXa.ts", ["src/*.ts"]), false);
  assert.equal(matchesAny("aXts", ["a.ts"]), false);
});

test("khớp nhiều pattern: chỉ cần một cái trúng", () => {
  assert.equal(matchesAny("docs/a.md", ["src/**", "docs/**"]), true);
  assert.equal(matchesAny("test/a.ts", ["src/**", "docs/**"]), false);
});

/* --- Chấm kết quả probe --------------------------------------------------- */

function result(over: Partial<ExecResult> = {}): ExecResult {
  return { code: 0, stdout: "", stderr: "", timedOut: false, durationMs: 1, ...over };
}

test("exit_zero: chỉ mã 0 mới pass", () => {
  assert.equal(judge(result(), "exit_zero").pass, true);
  const failed = judge(result({ code: 1, stderr: "boom" }), "exit_zero");
  assert.equal(failed.pass, false);
  assert.match(failed.reason!, /mã 1/);
});

test("quá hạn luôn là trượt, kèm lý do rõ ràng", () => {
  const j = judge(result({ timedOut: true, durationMs: 5000 }), "exit_zero");
  assert.equal(j.pass, false);
  assert.match(j.reason!, /quá hạn/);
});

test("stdout_contains được chấm đúng", () => {
  assert.equal(judge(result({ stdout: "12 passed" }), { stdout_contains: "passed" }).pass, true);
  const j = judge(result({ stdout: "0 passed" }), { stdout_contains: "all green" });
  assert.equal(j.pass, false);
  assert.match(j.reason!, /all green/);
});

test("không khai exit_code thì vẫn đòi thoát sạch", () => {
  const j = judge(result({ code: 2, stdout: "ok" }), { stdout_contains: "ok" });
  assert.equal(j.pass, false, "stdout đúng nhưng lệnh fail thì không được coi là pass");
});

test("khai exit_code khác 0 thì tôn trọng đúng ý", () => {
  assert.equal(judge(result({ code: 3 }), { exit_code: 3 }).pass, true);
});

test("stdout_matches sai cú pháp regex bị báo là trượt, không ném lỗi", () => {
  const j = judge(result({ stdout: "x" }), { stdout_matches: "([" });
  assert.equal(j.pass, false);
  assert.match(j.reason!, /regex/);
});

/* --- Lệnh trượt phải in được thân xác (ICE-011) --------------------------- */

/** Đuôi thật của `npm test` khi có ca đỏ: mọi thứ ra stdout, stderr rỗng. */
const NODE_TEST_TAIL = [
  "ℹ tests 739",
  "ℹ pass 735",
  "ℹ fail 4",
  "ℹ duration_ms 20000",
  "",
  "✖ failing tests:",
  "",
  "test at test/boundary.test.ts:2:873",
  "✖ ranh giới chặn ghi ngoài phạm vi (1.2ms)",
  "  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:",
  "      at TestContext.<anonymous> (test/boundary.test.ts:9:3)",
  "      at Test.run (node:internal/test_runner/test:1306:25)",
].join("\n");

test("lệnh trượt có stderr: lấy stderr, không đụng tới stdout", () => {
  const j = judge(
    result({ code: 1, stderr: "tsc: error TS2345: sai kiểu", stdout: "đang biên dịch…" }),
    "exit_zero",
  );
  assert.equal(j.pass, false);
  assert.match(j.reason!, /TS2345/);
  assert.doesNotMatch(j.reason!, /đang biên dịch/);
});

test("⭐ stderr rỗng nhưng stdout có: lấy ĐUÔI stdout, không phải một dòng rỗng ruột", () => {
  const j = judge(result({ code: 1, stdout: NODE_TEST_TAIL }), "exit_zero");
  assert.equal(j.pass, false);
  // Chỗ hỏng thật phải gọi được tên: tệp nào, ca nào.
  assert.match(j.reason!, /boundary\.test\.ts/);
  assert.match(j.reason!, /fail 4/);
});

test("nhánh cuối (expect dạng object) cũng in thân xác, không chỉ mã thoát", () => {
  const j = judge(result({ code: 1, stdout: NODE_TEST_TAIL }), { stdout_contains: "tests 739" });
  assert.equal(j.pass, false);
  assert.match(j.reason!, /mã 1/);
  assert.match(j.reason!, /boundary\.test\.ts/);
});

test("khung ngăn xếp bị bỏ — hạn mức dòng dành cho thứ đọc được", () => {
  const j = judge(result({ code: 1, stdout: NODE_TEST_TAIL }), "exit_zero");
  assert.doesNotMatch(j.reason!, /node:internal/);
});

test("log dài không bị đổ nguyên vào lý do", () => {
  const flood = Array.from({ length: 500 }, (_, i) => `dòng ${i}`).join("\n");
  const j = judge(result({ code: 1, stdout: flood }), "exit_zero");
  assert.equal(j.pass, false);
  assert.equal(j.reason!.split(" / ").length <= 12, true, j.reason);
  assert.match(j.reason!, /dòng 499/); // đuôi, không phải đầu
  assert.doesNotMatch(j.reason!, /dòng 0\b/);
});

test("một dòng khổng lồ bị cắt, không nuốt cả brief", () => {
  const j = judge(result({ code: 1, stdout: "x".repeat(50_000) }), "exit_zero");
  assert.equal(j.reason!.length < 400, true, String(j.reason!.length));
});

test("lệnh trượt câm hoàn toàn vẫn cho lý do đọc được", () => {
  const j = judge(result({ code: 7 }), "exit_zero");
  assert.equal(j.pass, false);
  assert.equal(j.reason, "thoát với mã 7");
});
