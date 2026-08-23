import { z } from "zod";

import { zHandle, zIsoDate, zNonEmpty } from "./common.js";

/**
 * Anchor = bằng chứng cho một phát biểu.
 *
 * Đây là ràng buộc trung tâm của ganas: không có anchor thì không phải tri thức
 * hợp lệ, chỉ là ý kiến. Validator từ chối claim/fact thiếu anchor, và hook
 * PostToolUse chặn ghi.
 *
 * Cho phép hai cách viết:
 *  - chuỗi rút gọn, dễ gõ tay: "src/a.ts#L12-L18", "src/a.ts:12", "commit:abc1234"
 *  - dạng object, cho url (cần fetched_at) và human (cần người + ngày)
 */

export const zFileAnchor = z.object({
  kind: z.literal("file"),
  path: zNonEmpty,
  /** Dòng bắt đầu, 1-indexed. Thiếu = neo vào cả file. */
  line: z.number().int().positive().optional(),
  line_end: z.number().int().positive().optional(),
});

export const zCommitAnchor = z.object({
  kind: z.literal("commit"),
  sha: z.string().regex(/^[0-9a-f]{7,40}$/, "sha phải là hex 7–40 ký tự"),
  note: z.string().optional(),
});

export const zUrlAnchor = z.object({
  kind: z.literal("url"),
  url: z.string().url(),
  /** Bắt buộc: web đổi. Một URL không có mốc thời gian lấy về thì không neo được gì. */
  fetched_at: zIsoDate,
  quote: z.string().optional(),
});

export const zHumanAnchor = z.object({
  kind: z.literal("human"),
  by: zHandle,
  at: zIsoDate,
  /** Link tới ticket/biên bản/chat — để người sau truy lại được. */
  link: z.string().optional(),
});

export const zAnchorObject = z.discriminatedUnion("kind", [
  zFileAnchor,
  zCommitAnchor,
  zUrlAnchor,
  zHumanAnchor,
]);

export type AnchorObject = z.infer<typeof zAnchorObject>;

const FILE_HASH_RANGE = /^(?<path>[^#\s]+)#L(?<line>\d+)(?:-L?(?<end>\d+))?$/;
const FILE_COLON = /^(?<path>[^:\s]+):(?<line>\d+)(?::(?<end>\d+))?$/;
const COMMIT = /^commit:(?<sha>[0-9a-f]{7,40})$/;

/**
 * Diễn giải chuỗi rút gọn thành anchor. Trả về null nếu chuỗi không nhận dạng
 * được — người gọi biến điều đó thành lỗi validate, chứ không đoán bừa.
 */
export function parseAnchorString(raw: string): AnchorObject | null {
  const s = raw.trim();
  if (!s) return null;

  const commit = COMMIT.exec(s);
  if (commit?.groups) return { kind: "commit", sha: commit.groups["sha"]! };

  const hash = FILE_HASH_RANGE.exec(s);
  if (hash?.groups) {
    const line = Number(hash.groups["line"]);
    const end = hash.groups["end"] ? Number(hash.groups["end"]) : undefined;
    return end === undefined
      ? { kind: "file", path: hash.groups["path"]!, line }
      : { kind: "file", path: hash.groups["path"]!, line, line_end: end };
  }

  const colon = FILE_COLON.exec(s);
  if (colon?.groups) {
    const line = Number(colon.groups["line"]);
    const end = colon.groups["end"] ? Number(colon.groups["end"]) : undefined;
    return end === undefined
      ? { kind: "file", path: colon.groups["path"]!, line }
      : { kind: "file", path: colon.groups["path"]!, line, line_end: end };
  }

  // URL trần bị từ chối có chủ đích: thiếu fetched_at thì không neo được.
  if (/^https?:\/\//.test(s)) return null;

  // Đường dẫn file không kèm dòng vẫn chấp nhận — neo vào cả file.
  if (!s.includes(" ")) return { kind: "file", path: s };

  return null;
}

export const zAnchor = z.union([z.string(), zAnchorObject]).transform((v, ctx) => {
  if (typeof v !== "string") return v;
  const parsed = parseAnchorString(v);
  if (!parsed) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        `anchor "${v}" không nhận dạng được. Dùng "src/a.ts#L12", "src/a.ts:12", ` +
        `"commit:abc1234", hoặc dạng object cho url/human (url cần fetched_at).`,
    });
    return z.NEVER;
  }
  return parsed;
});

/** Ít nhất một anchor. Đây là chỗ luật "không anchor thì không hợp lệ" được cưỡng chế. */
const NEED_ANCHOR =
  "phải có `anchors` — bằng chứng cho phát biểu này. Dùng `src/a.ts#L42`, " +
  "`commit:abc1234`, hoặc dạng object cho URL (kèm `fetched_at`) / người " +
  "(`kind: human`). Không chỉ ra được nguồn thì đừng ghi: đưa vào `open_questions` " +
  "của task thay vì đưa vào kho tri thức.";

export const zAnchors = z
  .array(zAnchor, { required_error: NEED_ANCHOR, invalid_type_error: NEED_ANCHOR })
  .min(1, NEED_ANCHOR);

/**
 * Trích dẫn dài bao nhiêu thì còn vừa một dòng.
 *
 * `formatAnchor` được dùng làm Ô trong bảng `ganas debt` (`rowLocation`,
 * src/commands/debt.ts), nên nó PHẢI giữ đúng một dòng — xuống dòng ở đây là
 * phá bố cục bảng ở một chỗ chẳng liên quan gì tới anchor.
 */
const QUOTE_PREVIEW = 60;

/** Rút trích dẫn về một dòng: gộp khoảng trắng, cắt, thêm dấu lược. */
function preview(quote: string): string {
  const flat = quote.trim().replace(/\s+/g, " ");
  return flat.length <= QUOTE_PREVIEW ? flat : `${flat.slice(0, QUOTE_PREVIEW).trimEnd()}…`;
}

/** Hiển thị anchor lại thành chuỗi ngắn cho brief và báo cáo. */
export function formatAnchor(a: AnchorObject): string {
  switch (a.kind) {
    case "file":
      if (a.line === undefined) return a.path;
      return a.line_end === undefined ? `${a.path}:${a.line}` : `${a.path}:${a.line}-${a.line_end}`;
    case "commit":
      return `commit:${a.sha.slice(0, 8)}`;
    case "url":
      // Trích dẫn là thứ DUY NHẤT còn lại khi trang đã đổi — chính lý do
      // `fetched_at` bắt buộc. Ghi vào mà không bao giờ hiện ra thì người dùng
      // tưởng bằng chứng đã được giữ, trong khi nó nằm im trong file (PR-009).
      return a.quote
        ? `${a.url} (lấy ${a.fetched_at.slice(0, 10)}) — "${preview(a.quote)}"`
        : `${a.url} (lấy ${a.fetched_at.slice(0, 10)})`;
    case "human":
      return `${a.by} ${a.at.slice(0, 10)}${a.link ? ` — ${a.link}` : ""}`;
  }
}
