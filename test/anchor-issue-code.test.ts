import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type Diagnostic,
  isAnchorIssue,
  ruleForDiagnostics,
} from "../src/hooks/policy/index.js";

/**
 * Kiểm `isAnchorIssue` — phân loại lỗi anchor dựa trên cấu trúc message,
 * không dựa trên chuỗi tiếng Việt.
 *
 * Lỗi anchor luôn có dạng: field `anchors` hoặc `anchors.0` (hoặc `anchors.N`)
 * mở đầu message, theo format của `issuesToDiagnostics` ở `src/graph/load.ts:39`.
 */

const d = (message: string) => ({
  severity: "error" as const,
  code: "schema/required" as const,
  message,
  file: "test.yaml" as const,
});

test("isAnchorIssue: message bắt đầu bằng 'anchors:' → true", () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  assert.strictEqual(isAnchorIssue(d("anchors: phải có `anchors` — bằng chứng cho phát biểu này.") as Diagnostic), true);
});

test("isAnchorIssue: message bắt đầu bằng 'anchors.0:' → true", () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  assert.strictEqual(isAnchorIssue(d("anchors.0: anchor này không nhận dạng được.") as Diagnostic), true);
});

test("isAnchorIssue: message bắt đầu bằng 'anchors.N:' (N là số) → true", () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  assert.strictEqual(isAnchorIssue(d("anchors.5: anchor này không nhận dạng được.") as Diagnostic), true);
});

test("isAnchorIssue: message có chữ 'anchor' ở GIỮA câu → false", () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  assert.strictEqual(isAnchorIssue(d("field_name: nộp dung anchor này không hợp lệ vì lý do khác.") as Diagnostic), false);
});

test("isAnchorIssue: message không chứa 'anchors:' hay 'anchors.N:' → false", () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  assert.strictEqual(isAnchorIssue(d("title: tiêu đề không được để trống.") as Diagnostic), false);
});

test("isAnchorIssue: message có 'anchors' ở GIỮA, không phải tiền tố → false", () => {
  assert.strictEqual(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    isAnchorIssue(d("description: chuỗi với từ anchors ở trong câu không được tính.") as Diagnostic),
    false,
  );
});

test("ruleForDiagnostics: nếu có MỘT lỗi anchor → knowledge_anchor", () => {
  assert.strictEqual(
    ruleForDiagnostics([
      d("title: không được để trống"),
      d("anchors: phải có bằng chứng"),
    ] as Diagnostic[]),
    "knowledge_anchor",
  );
});

test("ruleForDiagnostics: không có lỗi anchor → schema", () => {
  assert.strictEqual(
    ruleForDiagnostics([
      d("title: không được để trống"),
      d("description: không được để trống"),
    ] as Diagnostic[]),
    "schema",
  );
});

test("ruleForDiagnostics: chỉ lỗi anchor, không có lỗi khác → knowledge_anchor", () => {
  assert.strictEqual(
    ruleForDiagnostics([d("anchors: phải có bằng chứng")] as Diagnostic[]),
    "knowledge_anchor",
  );
});

test("isAnchorIssue: message có 'anchors:' ở giữa (không phải đầu) → false", () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  assert.strictEqual(isAnchorIssue(d("field_name: lỗi anchors: là lỗi khác.") as Diagnostic), false);
});

test("isAnchorIssue: message bắt đầu bằng 'anchors.0: ' với khoảng trắng → true", () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  assert.strictEqual(isAnchorIssue(d("anchors.0: anchor không nhận dạng được.") as Diagnostic), true);
});

test("isAnchorIssue: message bắt đầu bằng 'N.anchors:' (element trong mảy) → true", () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  assert.strictEqual(isAnchorIssue(d("0.anchors: phải có bằng chứng cho phát biểu này.") as Diagnostic), true);
});

test("isAnchorIssue: message bắt đầu bằng 'N.anchors.M:' (element trong mảy với index) → true", () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  assert.strictEqual(isAnchorIssue(d("5.anchors.2: anchor không nhận dạng được.") as Diagnostic), true);
});
