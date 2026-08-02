import { z } from "zod";

import { zHandle, zModuleId, zNonEmpty, zScopeId } from "./common.js";
import { zVerification } from "./verification.js";

/**
 * **Phạm vi công việc** — khoanh vùng có ranh giới code, có người nghiệm thu,
 * có tiêu chí nghiệm thu, và tuổi thọ dài hơn một task.
 *
 * Đây là đơn vị mà một câu nói của người dùng ("tôi muốn khách đặt lịch qua
 * Zalo") được dịch sang: bàn giao cái gì, code nằm ở đâu, làm sao biết là xong,
 * ai ký. Mọi thứ khác trong ganas neo vào nó.
 *
 * Bất biến quan trọng nhất, và là lý do khái niệm này tồn tại:
 *
 * > Mọi phát biểu (fact, claim) chỉ được coi là đúng BÊN TRONG một phạm vi.
 * > Ra ngoài là chưa biết.
 *
 * Không có phạm vi thì kho fact càng lớn càng thành máy sinh ảo giác — một điều
 * đúng ở khối thanh toán được phiên sau đọc như chân lý toàn dự án. `depends_on`
 * và `ttl_days` chỉ khoanh được THỜI GIAN ("còn đúng nữa không"), không khoanh
 * được KHÔNG GIAN ("đúng ở đâu").
 *
 * `acceptance` chạy trên luồng đã ghép, không phải tổng nghiệm thu từng khối:
 * một luồng có thể đúng ở từng khối mà vẫn sai khi ghép.
 */

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * `delivered` chứ không phải `closed`: phạm vi đã bàn giao vẫn còn khối trỏ vào
 * nó và fact còn hiệu lực trong nó. Nó ngừng nhận việc mới, không biến mất.
 */
export const SCOPE_STATUS = ["draft", "active", "delivered"] as const;
export type ScopeStatus = (typeof SCOPE_STATUS)[number];

export const zScope = z
  .object({
    id: zScopeId,
    title: zNonEmpty,
    version: z.string().regex(SEMVER, "version phải theo semver, vd 0.3.0"),

    /**
     * Người ký nghiệm thu. Không ai ký thì không ai nghiệm thu được — luật
     * `scope/without-owner` cảnh báo khi phạm vi `active` mà thiếu.
     */
    owner: zHandle.optional(),
    status: z.enum(SCOPE_STATUS).default("draft"),

    /** Ranh giới code của phạm vi, gián tiếp qua `module.paths`. */
    modules: z.array(zModuleId).min(1, "phạm vi phải chứa ít nhất một khối"),
    /** Khối đầu luồng — dùng để phát hiện khối mồ côi. */
    entry: zModuleId,

    /** Nghiệm thu ở mức phạm vi — chạy trên luồng ghép, không phải từng khối. */
    acceptance: z.array(zVerification).default([]),
  })
  .strict()
  .superRefine((s, ctx) => {
    const dup = s.modules.find((m, i) => s.modules.indexOf(m) !== i);
    if (dup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modules"],
        message: `phạm vi ${s.id} liệt kê khối ${dup} hai lần`,
      });
    }

    if (!s.modules.includes(s.entry)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entry"],
        message: `phạm vi ${s.id} khai entry: ${s.entry} nhưng khối đó không nằm trong \`modules\``,
      });
    }

    const ids = s.acceptance.map((a) => a.id);
    const dupA = ids.find((a, i) => ids.indexOf(a) !== i);
    if (dupA) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acceptance"],
        message: `phạm vi ${s.id} có hai tiêu chí nghiệm thu trùng id "${dupA}"`,
      });
    }
  });

export type Scope = z.infer<typeof zScope>;
