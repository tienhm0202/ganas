import { z } from "zod";
import { zNonEmpty, zExpect } from "./common.js";

/**
 * Bằng chứng cho một khối.
 *
 * Ba loại, khác nhau ở bản chất chứ không chỉ ở cách chạy:
 *  - `probe`    — tất định, boolean. Verify CẤU TRÚC (file tồn tại, symbol export, config đúng).
 *  - `eval`     — thống kê, ra điểm + ngưỡng. Verify HÀNH VI. Bắt buộc cho khối gọi LLM, vì
 *                 hành vi của LLM không tất định nên unit test kiểu thường không khả thi.
 *  - `contract` — kiểm tương thích cạnh giữa hai khối (output A phủ được input B).
 */

export const VERIFICATION_KIND = ["probe", "eval", "contract"] as const;
export const VERIFICATION_TIER = ["smoke", "full"] as const;
export const EVAL_ADAPTER = ["json", "promptfoo"] as const;

export const zVerificationId = z
  .string()
  .regex(/^V-[a-z0-9][a-z0-9-]*$/i, "ID verification phải dạng V-intent-smoke");

/** Trường chung của mọi loại bằng chứng. */
const base = {
  id: zVerificationId,
  /**
   * `smoke` rẻ, chạy thường xuyên; `full` tốn tiền, chạy khi cần.
   * Eval gọi LLM tốn tiền thật — mặc định `ganas verify` chỉ chạy smoke.
   */
  tier: z.enum(VERIFICATION_TIER).default("smoke"),
  /** Hết hạn theo thời gian kể cả khi không có gì đổi. 0 = không hết hạn. */
  ttl_days: z.number().int().min(0).default(0),
  /**
   * Lệnh thoát 0 ⇒ bỏ qua, đánh dấu `unavailable`, **KHÔNG phải `failing`**.
   *
   * Báo fail sai độc ngang báo fresh sai: một khối cần DB sẽ báo động giả mỗi
   * phiên, và sau vài lần người ta học cách phớt lờ toàn bộ mục cảnh báo —
   * lúc đó cơ chế còn nguyên nhưng đã chết.
   */
  skip_if: z.string().optional(),
  notes: z.string().optional(),
};

export const zProbeVerification = z.object({
  ...base,
  kind: z.literal("probe"),
  run: zNonEmpty.describe("lệnh shell chạy được, không tương tác"),
  expect: zExpect,
  timeout_ms: z.number().int().positive().max(600_000).optional(),
});

export const zEvalVerification = z.object({
  ...base,
  kind: z.literal("eval"),
  /** ganas gọi lệnh này và đọc kết quả — nó KHÔNG tự chạy eval. */
  run: zNonEmpty.describe("lệnh chạy bộ eval, ghi kết quả ra $GANAS_EVAL_OUT"),
  adapter: z.enum(EVAL_ADAPTER).default("json"),
  threshold: z.number().min(0).max(1),
  /**
   * Vùng đệm quanh ngưỡng. Điểm rơi vào [threshold, threshold+margin) là
   * `marginal` — không phải pass. Eval có nhiễu; coi 0.901 là "đạt" trong khi
   * ngưỡng là 0.9 chỉ là tự lừa mình.
   */
  margin: z.number().min(0).max(0.5).default(0),
  timeout_ms: z.number().int().positive().max(3_600_000).optional(),

  /* --- Dấu vân tay: kết quả eval chỉ đúng với đúng bộ này ----------------- */

  /** File dataset. Đổi dataset ⇒ kết quả cũ vô nghĩa. */
  dataset: z.string().optional(),
  /** File prompt/template. Sửa một dòng ⇒ kết quả cũ vô nghĩa. */
  prompt: z.string().optional(),
  /** Model đã dùng. Provider đổi model dưới chân bạn ⇒ kết quả cũ vô nghĩa. */
  model: z.string().optional(),
});

export const zContractVerification = z.object({
  ...base,
  kind: z.literal("contract"),
  /** Khối phía sau trong sơ đồ mà cạnh này nối tới. */
  to: zNonEmpty.describe("id khối đích"),
  /** Lệnh kiểm bổ sung (typecheck, schema check). Thiếu thì chỉ so contract khai báo. */
  run: z.string().optional(),
});

export const zVerification = z.discriminatedUnion("kind", [
  zProbeVerification,
  zEvalVerification,
  zContractVerification,
]);

export type Verification = z.infer<typeof zVerification>;
export type ProbeVerification = z.infer<typeof zProbeVerification>;
export type EvalVerification = z.infer<typeof zEvalVerification>;
export type ContractVerification = z.infer<typeof zContractVerification>;

/** Bộ eval quá yếu thì pass cũng không nói lên gì. */
export interface EvalWeakness {
  reason: string;
}

export function evalWeakness(v: EvalVerification): EvalWeakness | null {
  if (v.threshold <= 0.5) {
    return {
      reason:
        `ngưỡng ${v.threshold} quá thấp — đoán bừa cũng qua được. ` +
        `Ngưỡng dưới 0.5 thì "pass" không mang thông tin.`,
    };
  }
  return null;
}
