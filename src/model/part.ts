import { z } from "zod";

import { zHandle, zModuleId, zNonEmpty, zPartId } from "./common.js";
import { zVerification } from "./verification.js";

/**
 * Phần — đơn vị **đóng gói bàn giao**, không phải nhãn nhóm.
 *
 * Có version, có chủ sở hữu, và có bộ nghiệm thu riêng ở mức phần. Bộ nghiệm thu
 * mức phần không phải tổng của các khối: một luồng có thể đúng ở từng khối mà
 * vẫn sai khi ghép — đó chính là thứ `acceptance` ở đây bắt.
 */

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export const zPart = z
  .object({
    id: zPartId,
    title: zNonEmpty,
    version: z.string().regex(SEMVER, "version phải theo semver, vd 0.3.0"),
    owner: zHandle.optional(),

    modules: z.array(zModuleId).min(1, "phần phải chứa ít nhất một khối"),
    /** Khối đầu luồng — dùng để phát hiện khối mồ côi. */
    entry: zModuleId,
    /** Khối cuối luồng. */
    exit: zModuleId,

    /** Nghiệm thu ở mức phần — chạy trên luồng ghép, không phải từng khối. */
    acceptance: z.array(zVerification).default([]),

    notes: z.string().optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const dup = p.modules.find((m, i) => p.modules.indexOf(m) !== i);
    if (dup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modules"],
        message: `phần ${p.id} liệt kê khối ${dup} hai lần`,
      });
    }

    for (const [field, value] of [
      ["entry", p.entry],
      ["exit", p.exit],
    ] as const) {
      if (!p.modules.includes(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `phần ${p.id} khai ${field}: ${value} nhưng khối đó không nằm trong \`modules\``,
        });
      }
    }

    const ids = p.acceptance.map((a) => a.id);
    const dupA = ids.find((a, i) => ids.indexOf(a) !== i);
    if (dupA) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acceptance"],
        message: `phần ${p.id} có hai tiêu chí nghiệm thu trùng id "${dupA}"`,
      });
    }
  });

export type Part = z.infer<typeof zPart>;
