import { z } from "zod";

import { zDecisionId, zDesignId, zGoalId, zIsoDate, zNonEmpty } from "./common.js";
import { zExitCriterion } from "./task.js";

export const DESIGN_STATUS = ["draft", "active", "superseded", "archived", "done"] as const;

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
      .min(
        1,
        "design phải khai `serves` — nó phục vụ goal nào? Không có goal thì không cần design.",
      ),
    summary: zNonEmpty.describe("một đoạn: cách tiếp cận và vì sao chọn nó"),
    status: z.enum(DESIGN_STATUS).default("draft"),
    /** Các quyết định người đã chốt mà design này dựa vào. */
    decisions: z.array(zDecisionId).default([]),
    supersedes: z.array(zDesignId).default([]),

    /**
     * Hợp đồng ra của CHẶNG — dùng chung `zExitCriterion` với task, cố ý.
     *
     * Task trả lời "bước này xong chưa"; design trả lời "chặng này đóng được
     * chưa". Hai câu hỏi khác nhau nhưng cùng một loại bằng chứng, nên loại
     * tiêu chí thứ hai chỉ làm hai bảng trôi khỏi nhau.
     *
     * Đây cũng là chỗ nợ tiếp nối phải sống. Trước đó nó sống trong `notes`
     * văn xuôi — không schema, không validator — và T-039 (xem
     * `.ganas/tasks/T-048.yaml`) bay hơi đúng vì thế.
     *
     * `.default([])` chứ không `.min(1)`: bảy design đã có phải adopt được.
     * Chỗ ép là luật `spine/design-missing-exit-contract`, ở mức warning.
     */
    exit_contract: z.array(zExitCriterion).default([]),

    created_at: zIsoDate.optional(),
    done_at: zIsoDate.optional(),
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
    if (d.status === "done" && !d.done_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["done_at"],
        message: `design ${d.id} đánh dấu done nhưng thiếu done_at`,
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
