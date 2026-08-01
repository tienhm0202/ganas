import assert from "node:assert/strict";
import { test } from "node:test";

import { formatAnchor, parseAnchorString, zAnchor, zAnchors } from "../src/model/anchor.js";

test("nhận dạng anchor file dạng #L", () => {
  assert.deepEqual(parseAnchorString("src/a.ts#L42"), {
    kind: "file",
    path: "src/a.ts",
    line: 42,
  });
  assert.deepEqual(parseAnchorString("src/a.ts#L12-L18"), {
    kind: "file",
    path: "src/a.ts",
    line: 12,
    line_end: 18,
  });
  assert.deepEqual(parseAnchorString("CLAUDE.md#L34-40"), {
    kind: "file",
    path: "CLAUDE.md",
    line: 34,
    line_end: 40,
  });
});

test("nhận dạng anchor file dạng dấu hai chấm", () => {
  assert.deepEqual(parseAnchorString("src/a.ts:42"), {
    kind: "file",
    path: "src/a.ts",
    line: 42,
  });
});

test("đường dẫn trần neo vào cả file", () => {
  assert.deepEqual(parseAnchorString("docs/quy-che.md"), {
    kind: "file",
    path: "docs/quy-che.md",
  });
});

test("nhận dạng anchor commit", () => {
  assert.deepEqual(parseAnchorString("commit:a1b2c3d"), { kind: "commit", sha: "a1b2c3d" });
});

test("URL trần bị từ chối — thiếu fetched_at thì không neo được gì", () => {
  assert.equal(parseAnchorString("https://example.com/quy-che"), null);

  const parsed = zAnchor.safeParse("https://example.com/quy-che");
  assert.equal(parsed.success, false);
});

test("URL dạng object có fetched_at thì hợp lệ", () => {
  const parsed = zAnchor.safeParse({
    kind: "url",
    url: "https://example.com/quy-che",
    fetched_at: "2026-08-01T00:00:00Z",
  });
  assert.equal(parsed.success, true);
});

test("chuỗi vô nghĩa bị từ chối thay vì đoán bừa", () => {
  assert.equal(parseAnchorString("tôi nhớ là ở đâu đó trong repo"), null);
  assert.equal(parseAnchorString(""), null);
  assert.equal(zAnchor.safeParse("tôi nghĩ vậy").success, false);
});

test("danh sách anchor rỗng bị từ chối", () => {
  assert.equal(zAnchors.safeParse([]).success, false);
  assert.equal(zAnchors.safeParse(["src/a.ts#L1"]).success, true);
});

test("anchor người phải có cả handle lẫn ngày", () => {
  assert.equal(
    zAnchor.safeParse({ kind: "human", by: "@nguyen-a", at: "2026-08-01T00:00:00Z" }).success,
    true,
  );
  assert.equal(zAnchor.safeParse({ kind: "human", by: "nguyen-a" }).success, false);
});

test("hiển thị lại anchor thành chuỗi ngắn", () => {
  assert.equal(formatAnchor({ kind: "file", path: "a.ts", line: 4 }), "a.ts:4");
  assert.equal(formatAnchor({ kind: "file", path: "a.ts", line: 4, line_end: 9 }), "a.ts:4-9");
  assert.equal(formatAnchor({ kind: "file", path: "a.ts" }), "a.ts");
  assert.equal(formatAnchor({ kind: "commit", sha: "a1b2c3d4e5" }), "commit:a1b2c3d4");
});
