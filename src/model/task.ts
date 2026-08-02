import { z } from "zod";

import {
  zDesignId,
  zExpect,
  zFactId,
  zGoalId,
  zIsoDate,
  zModuleId,
  zNonEmpty,
  zScopeId,
  zTaskId,
} from "./common.js";
import { MODEL_TIER } from "./config.js";

export const TASK_STATUS = ["todo", "in_progress", "blocked", "done"] as const;

/** Ước lượng context. `large` bị validator cảnh báo — task phải vừa một phiên. */
export const ESTIMATED_CONTEXT = ["small", "medium", "large"] as const;

/**
 * context_contract — trả lời câu hỏi "phiên mới cần THÔNG TIN gì".
 * Đây là thứ SessionStart render vào brief.
 */
export const zContextContract = z.object({
  must_read: z
    .array(
      z.object({
        path: zNonEmpty,
        /** Bắt buộc: một danh sách file không có lý do thì phiên sau đọc mò. */
        why: zNonEmpty,
      }),
    )
    .default([]),
  /** Fact phải còn FRESH mới được dùng; brief cảnh báo nếu STALE. */
  facts: z.array(zFactId).default([]),
  open_questions: z.array(zNonEmpty).default([]),
});

export type ContextContract = z.infer<typeof zContextContract>;

/**
 * exit_contract — điều kiện "done" kiểm chứng được. Stop hook chấm cái này;
 * chưa thoả thì phiên không kết thúc được.
 */
const zExitCommand = z.object({
  kind: z.literal("command"),
  run: zNonEmpty,
  expect: zExpect,
});

const zExitArtifact = z.object({
  kind: z.literal("artifact"),
  path: zNonEmpty,
  must_contain: z.string().optional(),
});

const zExitHandoff = z.object({
  kind: z.literal("handoff"),
  required: z.boolean().default(true),
});

const zExitManual = z.object({
  kind: z.literal("manual"),
  check: zNonEmpty,
});

/**
 * Đòi một target trong sổ cái phải FRESH (chạy thật, còn tươi) — không phải
 * chỉ "chạy một lệnh nào đó thoát mã 0". Đây là cầu nối giữa `touches` (khối
 * nào task này chạm) và bằng chứng thật của khối đó; không có tiêu chí này
 * thì task chạm khối xong vẫn "done" được mà không ai chạy `ganas verify`.
 */
const zExitVerification = z.object({
  kind: z.literal("verification"),
  target: zNonEmpty.describe(
    "id target trong sổ cái, vd `M-intent/V-intent-eval` (bằng chứng của khối) hoặc `F-ACC-001` (fact)",
  ),
});

export const zExitCriterion = z.discriminatedUnion("kind", [
  zExitCommand,
  zExitArtifact,
  zExitHandoff,
  zExitManual,
  zExitVerification,
]);

export type ExitCriterion = z.infer<typeof zExitCriterion>;

export const zTask = z
  .object({
    id: zTaskId,
    title: zNonEmpty,
    serves: z
      .array(zGoalId, { required_error: "task phải khai `serves` — nó phục vụ goal nào?" })
      .min(1, "task phải khai `serves` — nó phục vụ goal nào?"),
    implements: zDesignId.describe("design mà task này hiện thực"),
    /**
     * Phạm vi công việc chứa task. Bắt buộc: task không thuộc phạm vi nào thì
     * không ai nghiệm thu được nó, và tri thức nó sinh ra không biết neo vào đâu.
     */
    scope: zScopeId,
    status: z.enum(TASK_STATUS).default("todo"),
    estimated_context: z.enum(ESTIMATED_CONTEXT).default("medium"),

    context_contract: zContextContract.default({ must_read: [], facts: [], open_questions: [] }),

    /** Kỹ năng cần cho task — brief liệt kê để phiên mới biết nạp gì. */
    skills: z.array(zNonEmpty).default([]),

    /**
     * Tier model nên dùng khi giao task này (cho sub-agent hoặc phiên mới).
     * Gán lúc chẻ task từ plan — quyết định của người/agent thiết kế, KHÔNG
     * suy tự động từ module.nature (heuristic không đáng tin bằng người biết rõ
     * việc). Không gán thì brief không gợi ý model nào — không đoán bừa.
     */
    model: z.enum(MODEL_TIER).optional(),

    /**
     * Khối trong sơ đồ mà task này chạm tới.
     *
     * Đây là điểm nối giữa trục VIỆC và trục HỆ THỐNG: chạm khối nào thì phải để
     * lại bằng chứng cho khối đó (luật `spine/task-missing-verification`).
     */
    touches: z.array(zModuleId).default([]),

    exit_contract: z
      .array(zExitCriterion, {
        required_error:
          "task phải có `exit_contract` — làm sao biết nó xong? " +
          "Không có tiêu chí kiểm chứng được thì Stop hook không chấm được, " +
          'và "xong" trở thành ý kiến.',
      })
      .min(1, "task phải có `exit_contract` — làm sao biết nó xong?"),

    blocked_by: z.array(zTaskId).default([]),
    created_at: zIsoDate.optional(),
    done_at: zIsoDate.optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    if (t.blocked_by.includes(t.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blocked_by"],
        message: `task ${t.id} không thể tự chặn chính nó`,
      });
    }
    if (t.status === "done" && !t.done_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["done_at"],
        message: `task ${t.id} đánh dấu done nhưng thiếu done_at`,
      });
    }
    const dupServes = t.serves.find((g, i) => t.serves.indexOf(g) !== i);
    if (dupServes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serves"],
        message: `task ${t.id} liệt kê goal ${dupServes} hai lần`,
      });
    }
  });

export type Task = z.infer<typeof zTask>;
