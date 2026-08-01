import { z } from "zod";

import { zGlob, zHandle, zIsoDate, zModuleId, zNonEmpty, zPartId } from "./common.js";
import { zVerification } from "./verification.js";

/**
 * Khối — node của sơ đồ khối, đồng thời là vùng code trên bản đồ hệ thống.
 *
 * Gộp hai khái niệm làm một là có chủ đích: sơ đồ khối CHÍNH LÀ bản đồ hệ thống.
 * Tiếp quản dự án cũ = khám phá dần các khối (`unmapped → surveyed → …`), thay vì
 * duy trì một bản đồ code và một sơ đồ kiến trúc rồi để chúng lệch nhau.
 */

/**
 * Bản chất của khối quyết định LOẠI bằng chứng bắt buộc.
 *  - `llm`  — có gọi LLM ⇒ hành vi không tất định ⇒ phải có **eval**
 *  - `code` — code thuần ⇒ phải có **unit test / probe**
 *  - `data` — schema, migration, dataset
 *  - `io`   — cổng ra ngoài (API, hàng đợi, file system)
 */
export const MODULE_NATURE = ["llm", "code", "data", "io"] as const;
export type ModuleNature = (typeof MODULE_NATURE)[number];

export const MODULE_STATUS = ["unmapped", "surveyed", "implemented", "verified"] as const;
export const MODULE_RISK = ["low", "medium", "high"] as const;

/** Một cổng vào/ra của khối. `shape` là mô tả tự do, đủ để người và model đối chiếu. */
export const zPort = z.object({
  name: zNonEmpty,
  shape: zNonEmpty.describe('mô tả kiểu, vd "string" hoặc "{ intent: string, score: number }"'),
  /** Cổng không bắt buộc — khối phía sau không đòi thì vẫn tương thích. */
  optional: z.boolean().default(false),
  notes: z.string().optional(),
});

export type Port = z.infer<typeof zPort>;

export const zContract = z.object({
  inputs: z.array(zPort).default([]),
  outputs: z.array(zPort).default([]),
});

export const zModule = z
  .object({
    id: zModuleId,
    title: zNonEmpty,
    part: zPartId.optional().describe("phần chứa khối này; thiếu = khối lẻ, sẽ bị cảnh báo"),
    nature: z.enum(MODULE_NATURE),

    /** Code của khối nằm ở đâu. Cũng là căn cứ tính STALE khi file đổi. */
    paths: z.array(zGlob).default([]),
    entrypoints: z.array(zNonEmpty).default([]),

    contract: zContract.default({ inputs: [], outputs: [] }),
    /** Cạnh của sơ đồ: khối này cần khối nào chạy trước. */
    depends_on: z.array(zModuleId).default([]),

    status: z.enum(MODULE_STATUS).default("unmapped"),
    risk: z.enum(MODULE_RISK).default("medium"),
    owner: zHandle.optional(),

    surveyed_at: zIsoDate.optional(),
    survey: z.string().optional().describe("đường dẫn file survey"),

    /** Rỗng ⇒ khối `unverified` ⇒ mọi luồng đi qua nó đều không tin được. */
    verify: z.array(zVerification).default([]),

    /**
     * Kỹ năng gắn với khối — mô tả cách làm việc trong vùng code này (quy ước
     * riêng, cách chunking riêng, v.v.). Gán một lần khi khảo sát/định nghĩa
     * khối, không phải lúc chẻ task — mọi task chạm khối này tự động thấy skill
     * qua brief, không cần khai lại.
     */
    skills: z.array(zNonEmpty).default([]),

    notes: z.string().optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.depends_on.includes(m.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["depends_on"],
        message: `khối ${m.id} không thể phụ thuộc chính nó`,
      });
    }

    const dup = m.depends_on.find((d, i) => m.depends_on.indexOf(d) !== i);
    if (dup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["depends_on"],
        message: `khối ${m.id} liệt kê ${dup} hai lần`,
      });
    }

    const vids = m.verify.map((v) => v.id);
    const dupV = vids.find((v, i) => vids.indexOf(v) !== i);
    if (dupV) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verify"],
        message: `khối ${m.id} có hai bằng chứng trùng id "${dupV}"`,
      });
    }

    // Khối đã tuyên bố `verified` thì phải có thứ để mà verify.
    if (m.status === "verified" && m.verify.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message:
          `khối ${m.id} khai status "verified" nhưng \`verify\` rỗng — ` +
          `không có bằng chứng nào thì dựa vào đâu mà nói đã verify?`,
      });
    }

    // Khối gọi LLM mà chỉ có probe cấu trúc thì hành vi vẫn chưa được kiểm.
    if (m.nature === "llm" && m.verify.length > 0 && !m.verify.some((v) => v.kind === "eval")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verify"],
        message:
          `khối ${m.id} có nature "llm" nhưng không có bằng chứng nào kind "eval". ` +
          `Probe kiểm được cấu trúc, không kiểm được hành vi của LLM.`,
      });
    }

    if (m.status !== "unmapped" && m.paths.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paths"],
        message: `khối ${m.id} đã ${m.status} nhưng chưa khai \`paths\` — code của nó nằm ở đâu?`,
      });
    }
  });

export type Module = z.infer<typeof zModule>;
