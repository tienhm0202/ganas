import { z } from "zod";

import { zGlob, zHandle, zModuleId, zNonEmpty, zScopeId } from "./common.js";
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
    scope: zScopeId
      .optional()
      .describe("phạm vi công việc chứa khối này; thiếu = khối lẻ, sẽ bị cảnh báo"),
    nature: z.enum(MODULE_NATURE),

    /** Code của khối nằm ở đâu. Cũng là căn cứ tính STALE khi file đổi. */
    paths: z.array(zGlob).default([]),
    entrypoints: z.array(zNonEmpty).default([]),

    contract: zContract.default({ inputs: [], outputs: [] }),
    /** Cạnh của sơ đồ: khối này cần khối nào chạy trước. */
    depends_on: z.array(zModuleId).default([]),

    status: z.enum(MODULE_STATUS).default("unmapped"),
    owner: zHandle.optional(),

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

/* ------------------------------------------------------------------------- *
 * Thư mục gốc của khối
 * ------------------------------------------------------------------------- */

/** Glob dạng "nhận cả cây con" (`src/render/**`) → thư mục nó nhận. Còn lại `undefined`. */
function subtreeClaim(glob: string): string | undefined {
  const normalized = glob.split("\\").join("/").replace(/^\.\//, "");
  const m = /^([^*?[{]+)\/\*\*(\/.*)?$/.exec(normalized);
  const dir = m?.[1]?.replace(/\/+$/, "");
  return dir ? dir : undefined;
}

/**
 * Thư mục gốc của một khối — nơi đặt file hướng dẫn của vùng
 * (`.claude/rules/agent-guide.md`: "một khối → một file hướng dẫn ở thư mục gốc
 * của khối đó").
 *
 * Quy tắc: khối có thư mục gốc khi và chỉ khi nó **NHẬN CẢ MỘT THƯ MỤC** bằng
 * glob cây con (`src/render/**`), và mọi glob cây con của nó cùng trỏ một thư
 * mục. File lẻ khai thêm ngoài thư mục đó không làm mất tư cách — `M-build`
 * nhận `release/**` rồi kèm `package.json`, và file hướng dẫn của nó nằm đúng
 * ở `release/`.
 *
 * Khối CHỈ liệt kê file lẻ thì trả `undefined`, và đó là câu trả lời đúng chứ
 * không phải thiếu sót: `M-cli` trỏ `src/cli.ts` + `src/util/args.ts` — tiền tố
 * chung của hai đường đó là `src`, mà `src` là nhà của mười khối khác. Đặt file
 * hướng dẫn của riêng `M-cli` ở đó là nói dối về phạm vi, nên ganas không đòi,
 * cũng không sinh.
 */
export function moduleGuideDir(paths: readonly string[]): string | undefined {
  const claims = new Set<string>();
  for (const p of paths) {
    const dir = subtreeClaim(p);
    if (dir !== undefined) claims.add(dir);
  }
  // Không nhận thư mục nào, hoặc nhận HAI thư mục rời nhau ⇒ không có một chỗ
  // duy nhất đúng để đặt file. Im lặng chọn bừa một cái là chọn sai một nửa số lần.
  return claims.size === 1 ? [...claims][0] : undefined;
}

/**
 * Một mẩu `paths` nhận cái gì: đúng MỘT file, hay cả một cây con.
 *
 * Phân biệt này là toàn bộ lý do hàm dưới tồn tại. `pathsOverlap()` trong
 * `graph/select.ts` cố ý thô theo hướng AN TOÀN — nó chỉ so tiền tố thư mục,
 * nên `src/cli.ts` thành `src/` và MỌI khối trong `src/` đều bị coi là chồng
 * nhau. Thô như thế là đúng cho câu hỏi "hai task này có giao được song song
 * không" (kết luận sai theo hướng "rời nhau" mới nguy hiểm), nhưng đem đi làm
 * luật cảnh báo thì nó nổ 87 cảnh báo trên chính repo này — mà cảnh báo thường
 * trực là thứ người ta quen mắt rồi ngừng đọc.
 */
interface PathClaim {
  kind: "file" | "subtree";
  value: string;
}

function claimsOf(paths: readonly string[]): PathClaim[] {
  return paths.map((raw) => {
    const normalized = raw.split("\\").join("/").replace(/^\.\//, "").replace(/\/+$/, "");
    const cut = normalized.search(/[*?[{]/);
    if (cut === -1) return { kind: "file", value: normalized } as const;
    const head = normalized.slice(0, cut);
    const slash = head.lastIndexOf("/");
    return { kind: "subtree", value: slash === -1 ? "" : head.slice(0, slash) } as const;
  });
}

function inside(file: string, dir: string): boolean {
  return dir === "" || file === dir || file.startsWith(`${dir}/`);
}

function claimsTouch(a: PathClaim, b: PathClaim): boolean {
  if (a.kind === "file" && b.kind === "file") return a.value === b.value;
  if (a.kind === "file") return inside(a.value, b.value);
  if (b.kind === "file") return inside(b.value, a.value);
  return inside(a.value, b.value) || inside(b.value, a.value);
}

/**
 * Hai khối có nhận chung vùng code không — phép so CHÍNH XÁC theo đoạn đường
 * dẫn, dùng cho luật `scope/module-paths-overlap`.
 *
 * Chồng nhau là hỏng im lặng: `taskBoundary()` trả cùng một vùng cho hai task
 * khác nhau, và `parallelCandidates()` vẫn có thể xếp chúng chạy song song.
 */
export function modulePathsOverlap(a: readonly string[], b: readonly string[]): boolean {
  const ca = claimsOf(a);
  const cb = claimsOf(b);
  return ca.some((x) => cb.some((y) => claimsTouch(x, y)));
}
