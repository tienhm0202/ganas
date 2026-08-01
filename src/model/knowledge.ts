import { z } from "zod";

import { zAnchor, zAnchors } from "./anchor.js";
import {
  zClaimId,
  zDecisionId,
  zFactId,
  zGlob,
  zHandle,
  zIsoDate,
  zLegacyClaimId,
  zNonEmpty,
  zProbe,
} from "./common.js";

/* ------------------------------------------------------------------------- *
 * FACT — điều kiểm chứng được bằng lệnh
 * ------------------------------------------------------------------------- */

export const VERIFY_RESULT = ["pass", "fail", "unknown"] as const;

/**
 * Fact là phát biểu có probe chạy được. Chỉ fact mới được phiên sau coi là sự
 * thật — và chỉ khi còn FRESH.
 *
 * `depends_on` là thứ làm fact tự già đi: khi file khớp glob đổi sau
 * `last_verified_at`, fact chuyển sang STALE và brief xếp nó vào mục
 * "CẦN VERIFY LẠI" thay vì "Đã biết". Đây là cơ chế chặn ảo giác lan truyền:
 * một điều từng đúng không được im lặng tiếp tục đúng.
 */
/** Dung sai lệch đồng hồ giữa các máy khi kiểm ngày verify. */
const CLOCK_SKEW_MS = 5 * 60_000;

export const zFact = z
  .object({
    id: zFactId,
    statement: zNonEmpty,
    verify: zProbe,
    /** Glob các file mà fact này phụ thuộc. Đổi file ⇒ fact thành STALE. */
    depends_on: z.array(zGlob).default([]),
    /** Hết hạn theo thời gian, kể cả khi không file nào đổi. 0 = không hết hạn. */
    ttl_days: z.number().int().min(0).default(0),
    last_verified_at: zIsoDate.optional(),
    verified_by: z.string().optional().describe("session id hoặc @handle"),
    last_result: z.enum(VERIFY_RESULT).default("unknown"),
    anchors: z.array(zAnchor).default([]),
    /** Nếu fact này được thăng cấp từ một claim kế thừa, giữ lại vết. */
    promoted_from: z.union([zClaimId, zLegacyClaimId]).optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    // Ngày verify ở tương lai làm mọi cơ chế STALE mất tác dụng: fact cũ trông
    // như vừa kiểm. Đây là đường tắt dễ đi nhất để lách hệ thống, nên chặn thẳng.
    if (f.last_verified_at) {
      const t = Date.parse(f.last_verified_at);
      if (t > Date.now() + CLOCK_SKEW_MS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["last_verified_at"],
          message:
            `fact ${f.id} có last_verified_at ở tương lai (${f.last_verified_at}). ` +
            `Chỉ đặt trường này bằng cách chạy \`ganas verify\` thật, không điền tay.`,
        });
      }
    }
    if (f.last_result !== "unknown" && !f.last_verified_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["last_result"],
        message: `fact ${f.id} khai last_result="${f.last_result}" nhưng không có last_verified_at`,
      });
    }
  });

export type Fact = z.infer<typeof zFact>;

export const zFactFile = z.array(zFact);

/* ------------------------------------------------------------------------- *
 * CLAIM — điều được tin nhưng chưa kiểm chứng
 * ------------------------------------------------------------------------- */

export const PROVENANCE = ["session", "human", "imported"] as const;
export const TRUST = ["unverified", "confirmed", "refuted", "unprovable"] as const;

/**
 * Claim luôn bị đối xử như GIẢ THUYẾT, không phải sự thật.
 *
 * `anchors` bắt buộc không rỗng: một phát biểu không chỉ được ra nguồn thì
 * không vào được kho tri thức. Đây là điểm mà hook PostToolUse chặn ghi.
 */
export const zClaim = z
  .object({
    id: z.union([zClaimId, zLegacyClaimId]),
    statement: zNonEmpty,
    anchors: zAnchors,
    provenance: z.enum(PROVENANCE),
    trust: z.enum(TRUST).default("unverified"),
    created_at: zIsoDate.optional(),
    imported_at: zIsoDate.optional(),
    /** Phiên nào sinh ra claim này (nếu do phiên ghi). */
    source_session: z.string().optional(),
    /** Kết quả đối chất: probe đã sinh ra, và vì sao kết luận vậy. */
    verdict: z
      .object({
        at: zIsoDate,
        probe: zProbe.optional(),
        evidence: zNonEmpty.describe("bằng chứng dẫn tới kết luận, có anchor"),
        /** Fact được tạo ra nếu claim này confirmed. */
        promoted_to: zFactId.optional(),
      })
      .optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const isLegacy = c.id.startsWith("LC-");
    if (isLegacy && c.provenance !== "imported") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provenance"],
        message: `claim ${c.id} dùng tiền tố LC- nên provenance phải là "imported"`,
      });
    }
    if (!isLegacy && c.provenance === "imported") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message: `claim import từ tài liệu cũ phải dùng tiền tố LC- (hiện là ${c.id})`,
      });
    }
    if (c.trust !== "unverified" && !c.verdict) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verdict"],
        message:
          `claim ${c.id} có trust="${c.trust}" nhưng thiếu verdict. ` +
          `Đổi mức tin cậy phải kèm bằng chứng, không được đổi trần.`,
      });
    }
    if (c.verdict?.promoted_to && c.trust !== "confirmed") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verdict", "promoted_to"],
        message: `claim ${c.id} chỉ được thăng cấp thành fact khi trust="confirmed"`,
      });
    }
  });

export type Claim = z.infer<typeof zClaim>;

export const zClaimFile = z.array(zClaim);

/* ------------------------------------------------------------------------- *
 * DECISION — điều người đã chốt
 * ------------------------------------------------------------------------- */

/**
 * Decision là ràng buộc do người đặt. Model không được tạo, không được đổi —
 * chỉ được đọc và tuân theo, hoặc nêu mâu thuẫn để người xử lý.
 */
export const zDecision = z.object({
  id: zDecisionId,
  statement: zNonEmpty,
  /** Bắt buộc. Không có người ký thì không phải quyết định. */
  decided_by: zHandle,
  decided_at: zIsoDate,
  link: z.string().optional().describe("ticket / biên bản / link chat"),
  /** Điều gì buộc phải chọn — bối cảnh, ràng buộc, lựa chọn khác đã cân nhắc. */
  context: z.string().optional(),
  /** Phải sống với gì sau khi chọn — đánh đổi, rủi ro chấp nhận, việc kéo theo. */
  consequence: z.string().optional(),
  supersedes: z.array(zDecisionId).default([]),
  notes: z.string().optional(),
});

export type Decision = z.infer<typeof zDecision>;

export const zDecisionFile = z.array(zDecision);

/* ------------------------------------------------------------------------- *
 * Tính độ tươi của fact
 * ------------------------------------------------------------------------- */

/**
 * Vì sao một bằng chứng còn dùng được — hoặc không.
 *
 * Mỗi giá trị là một LÝ DO khác nhau, không phải mức độ. Brief in ra đúng lý do
 * chứ không nói chung chung "đã cũ": người đọc cần biết phải làm gì tiếp, và
 * "model đã đổi" với "file đã sửa" dẫn tới hai hành động khác nhau.
 */
export const FRESHNESS = [
  "fresh",
  /** File phụ thuộc đã sửa, hoặc quá `ttl_days`. */
  "stale",
  "never_verified",
  /** Probe/eval fail ở lần chạy gần nhất — phát biểu đang SAI. */
  "failing",
  /** Điểm nằm trong vùng nhiễu quanh ngưỡng — chưa đủ để gọi là đạt. */
  "marginal",
  /** `skip_if` khớp: môi trường này không kiểm được. KHÔNG phải fail. */
  "unavailable",
  /** Probe rỗng ruột / nguy hiểm — chưa chứng minh được điều gì. */
  "unprovable",
  /** Định nghĩa verify đã đổi sau lần chạy: kết quả cũ không còn nói về nó nữa. */
  "definition_changed",
  /** Eval: model đã đổi. Kết quả cũ đo một model khác. */
  "model_changed",
  /** Eval: file prompt đã sửa. */
  "prompt_changed",
  /** Eval: dataset đã đổi. */
  "dataset_changed",
] as const;
export type Freshness = (typeof FRESHNESS)[number];

/** Chỉ `fresh` mới được phiên sau coi là sự thật. */
export function isUsable(f: Freshness): boolean {
  return f === "fresh";
}

export interface FreshnessInput {
  fact: Fact;
  /** Thời điểm sửa gần nhất của các file khớp depends_on (ms epoch), nếu có. */
  depsChangedAt?: number | undefined;
  now?: number;
}

/**
 * Quy tắc: chưa verify bao giờ → never_verified; probe fail lần cuối → failing;
 * dep đổi sau lần verify → stale; quá ttl → stale; còn lại → fresh.
 */
export function freshnessOf({ fact, depsChangedAt, now = Date.now() }: FreshnessInput): Freshness {
  if (!fact.last_verified_at) return "never_verified";
  if (fact.last_result === "fail") return "failing";

  const verifiedAt = Date.parse(fact.last_verified_at);
  if (Number.isNaN(verifiedAt)) return "never_verified";

  if (depsChangedAt !== undefined && depsChangedAt > verifiedAt) return "stale";
  if (fact.ttl_days > 0 && now - verifiedAt > fact.ttl_days * 86_400_000) return "stale";

  return "fresh";
}
