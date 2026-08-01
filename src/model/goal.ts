import { z } from "zod";
import { zGoalId, zHandle, zIsoDate, zNonEmpty, zExpect } from "./common.js";

/**
 * Tiêu chí nghiệm thu. Một goal không có tiêu chí kiểm chứng được thì không phải
 * mục tiêu, chỉ là nguyện vọng — và design neo vào nó sẽ không bao giờ đóng được.
 */
const zAcceptanceCommand = z.object({
  id: zNonEmpty,
  kind: z.literal("command"),
  run: zNonEmpty.describe("lệnh shell chạy được, không tương tác"),
  expect: zExpect,
});

const zAcceptanceManual = z.object({
  id: zNonEmpty,
  kind: z.literal("manual"),
  check: zNonEmpty.describe("điều người phải xác nhận, viết đủ cụ thể để trả lời có/không"),
  /** Bắt buộc: tiêu chí thủ công không có người ký thì không ai nghiệm thu. */
  owner: zHandle,
});

export const zAcceptance = z.discriminatedUnion("kind", [zAcceptanceCommand, zAcceptanceManual]);
export type Acceptance = z.infer<typeof zAcceptance>;

export const GOAL_STATUS = ["draft", "active", "closed"] as const;

export const zGoal = z
  .object({
    id: zGoalId,
    title: zNonEmpty,
    /** Kết quả người dùng cảm nhận được, không phải việc phải làm. */
    outcome: zNonEmpty,
    acceptance: z
      .array(zAcceptance, {
        required_error:
          "goal phải có `acceptance` — làm sao biết mục tiêu đã đạt? " +
          "Không đo được thì đó là nguyện vọng, không phải mục tiêu.",
      })
      .min(
        1,
        "goal phải có ít nhất một tiêu chí nghiệm thu — không đo được thì không bao giờ đóng được",
      ),
    status: z.enum(GOAL_STATUS).default("draft"),
    /** Chữ ký người. Model không được tự đặt mục tiêu — xem luật trong plan. */
    approved_by: zHandle.optional(),
    approved_at: zIsoDate.optional(),
    created_at: zIsoDate.optional(),
    closed_at: zIsoDate.optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((g, ctx) => {
    if (g.status === "active" && !g.approved_by) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approved_by"],
        message:
          `goal ${g.id} ở trạng thái "active" nhưng chưa có approved_by. ` +
          `Mục tiêu phải do người chốt, không được để model tự đặt. ` +
          `Giữ ở "draft" cho tới khi có người duyệt.`,
      });
    }
    if (g.approved_by && !g.approved_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approved_at"],
        message: `goal ${g.id} có approved_by nhưng thiếu approved_at`,
      });
    }
    const ids = g.acceptance.map((a) => a.id);
    const dup = ids.find((id, i) => ids.indexOf(id) !== i);
    if (dup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acceptance"],
        message: `goal ${g.id} có tiêu chí nghiệm thu trùng id "${dup}"`,
      });
    }
  });

export type Goal = z.infer<typeof zGoal>;
