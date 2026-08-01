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
