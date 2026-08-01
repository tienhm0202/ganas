import { z } from "zod";
import { zSprintId, zGoalId, zIsoDate, zNonEmpty } from "./common.js";

export const SPRINT_STATUS = ["planned", "active", "closed"] as const;

/** Sprint = lát cắt thời gian của một tập goal. Không phải nơi chứa task tự do. */
export const zSprint = z
  .object({
    id: zSprintId,
    title: zNonEmpty,
    goals: z.array(zGoalId).min(1, "sprint phải phục vụ ít nhất một goal"),
    starts_at: zIsoDate,
    ends_at: zIsoDate,
    status: z.enum(SPRINT_STATUS).default("planned"),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (Date.parse(s.ends_at) <= Date.parse(s.starts_at)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ends_at"],
        message: `sprint ${s.id}: ends_at phải sau starts_at`,
      });
    }
    const dup = s.goals.find((g, i) => s.goals.indexOf(g) !== i);
    if (dup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["goals"],
        message: `sprint ${s.id} liệt kê goal ${dup} hai lần`,
      });
    }
  });

export type Sprint = z.infer<typeof zSprint>;
