import { z } from "zod";
import { zDesignId, zGoalId, zDecisionId, zIsoDate, zNonEmpty } from "./common.js";

export const DESIGN_STATUS = ["draft", "active", "superseded", "archived"] as const;

/**
 * Design chỉ tồn tại để phục vụ goal.
 *
 * `serves` bắt buộc và không rỗng — đây chính là luật chặn "20 design trôi nổi":
 * không thể thêm một design mà không nói nó phục vụ mục tiêu nào.
 */
export const zDesign = z
  .object({
    id: zDesignId,
    title: zNonEmpty,
    serves: z
      .array(zGoalId, {
        required_error:
          "design phải khai `serves` — nó phục vụ goal nào? Không có goal thì không cần design.",
        invalid_type_error: "`serves` phải là danh sách ID goal, vd:\n  serves:\n    - G-001",
      })
      .min(1, "design phải khai `serves` — nó phục vụ goal nào? Không có goal thì không cần design."),
    summary: zNonEmpty.describe("một đoạn: cách tiếp cận và vì sao chọn nó"),
    status: z.enum(DESIGN_STATUS).default("draft"),
    /** Các quyết định người đã chốt mà design này dựa vào. */
    decisions: z.array(zDecisionId).default([]),
    supersedes: z.array(zDesignId).default([]),
    created_at: zIsoDate.optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const dup = d.serves.find((g, i) => d.serves.indexOf(g) !== i);
    if (dup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serves"],
        message: `design ${d.id} liệt kê goal ${dup} hai lần`,
      });
    }
    if (d.supersedes.includes(d.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["supersedes"],
        message: `design ${d.id} không thể thay thế chính nó`,
      });
    }
  });

export type Design = z.infer<typeof zDesign>;
