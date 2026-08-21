import { z } from "zod";

/**
 * Mẫu ID. Tiền tố cố định để nhìn một ID là biết nó thuộc loại nào — brief và
 * thông báo lỗi dựa vào điều đó.
 */
export const ID_PATTERNS = {
  goal: /^G-\d{3,}$/,
  design: /^D-\d{3,}$/,
  task: /^T-\d{3,}$/,
  fact: /^F-[A-Z0-9]+-\d{3,}$/,
  claim: /^C-\d{3,}$/,
  legacyClaim: /^LC-\d{3,}$/,
  decision: /^DEC-\d{3,}$/,
  /**
   * Khối trong sơ đồ. Thay cho `Zone` cũ: một khối vừa là vùng code (có `paths`)
   * vừa là node có contract và bộ verify — không cần hai bản đồ song song.
   */
  module: /^M-[a-z0-9][a-z0-9-]*$/,
  /** Phạm vi công việc = đơn vị bàn giao có ranh giới code và người nghiệm thu. */
  scope: /^P-[a-z0-9][a-z0-9-]*$/,
  /** Icebox = việc đã quyết CHƯA làm. Xem docstring đầu `src/model/icebox.ts`. */
  icebox: /^ICE-\d{3,}$/,
  /** Đề xuất chờ người duyệt. Xem docstring đầu `src/model/proposal.ts`. */
  proposal: /^PR-\d{3,}$/,
} as const;

export const zGoalId = z.string().regex(ID_PATTERNS.goal, "ID goal phải dạng G-001");
export const zDesignId = z.string().regex(ID_PATTERNS.design, "ID design phải dạng D-001");
export const zTaskId = z.string().regex(ID_PATTERNS.task, "ID task phải dạng T-001");
export const zFactId = z.string().regex(ID_PATTERNS.fact, "ID fact phải dạng F-ACC-007");
export const zClaimId = z.string().regex(ID_PATTERNS.claim, "ID claim phải dạng C-031");
export const zLegacyClaimId = z
  .string()
  .regex(ID_PATTERNS.legacyClaim, "ID legacy claim phải dạng LC-007");
export const zDecisionId = z.string().regex(ID_PATTERNS.decision, "ID decision phải dạng DEC-004");
export const zModuleId = z.string().regex(ID_PATTERNS.module, "ID khối phải dạng M-intent");
export const zScopeId = z.string().regex(ID_PATTERNS.scope, "ID phạm vi phải dạng P-chat-core");
export const zIceboxId = z.string().regex(ID_PATTERNS.icebox, "ID icebox phải dạng ICE-001");
export const zProposalId = z.string().regex(ID_PATTERNS.proposal, "ID đề xuất phải dạng PR-001");

/** Ngày giờ ISO 8601. Chuỗi rỗng không hợp lệ — thà thiếu field còn hơn ghi rỗng. */
export const zIsoDate = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), "phải là ngày ISO 8601 hợp lệ");

/** Handle người: @tên. Bắt buộc có @ để phân biệt với tên tự do. */
export const zHandle = z
  .string()
  .regex(/^@[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'handle phải dạng "@ten-nguoi"');

export const zNonEmpty = z.string().trim().min(1, "không được để trống");

/** Glob path dùng cho depends_on / zone paths. */
export const zGlob = z.string().trim().min(1);

/**
 * Kết quả mong đợi của một probe. Mặc định là "lệnh thoát 0".
 * Tách riêng để `ganas verify` biết cách chấm, thay vì chỉ dựa vào exit code.
 */
export const zExpect = z
  .union([
    z.literal("exit_zero"),
    z.object({
      exit_code: z.number().int().optional(),
      stdout_contains: z.string().optional(),
      stdout_matches: z.string().optional(),
      stderr_contains: z.string().optional(),
    }),
  ])
  .default("exit_zero");

export type Expect = z.infer<typeof zExpect>;

/**
 * Một probe: lệnh shell + kỳ vọng. Đây là thứ biến "niềm tin" thành "fact".
 *
 * `.strict()`: trường lạ là LỖI, không bị bỏ qua im lặng. Viết nhầm `skipif:`
 * hay `verifiy:` mà zod lặng lẽ vứt đi thì người viết tưởng mình có guard, thực
 * ra không có — đúng kiểu ảo giác mà ganas sinh ra để chống, chỉ khác là lần này
 * do công cụ gây ra.
 */
export const zProbe = z
  .object({
    run: zNonEmpty.describe("lệnh shell chạy được, không tương tác"),
    expect: zExpect,
    /**
     * Lệnh thoát 0 ⇒ bỏ qua, đánh dấu `unavailable`, **KHÔNG phải `failing`**.
     * Dùng cho probe cần môi trường ngoài (DB, service, mạng nội bộ).
     */
    skip_if: z.string().optional(),
    timeout_ms: z.number().int().positive().max(600_000).optional(),
    cwd: z.string().optional(),
  })
  .strict();

export type Probe = z.infer<typeof zProbe>;

/**
 * Thang điểm 1–5 dùng chung cho MỌI chỗ chấm nợ/độ ưu tiên trong repo — hiện
 * là `DebtScore` (`src/debt.ts`) và icebox (`src/model/icebox.ts`).
 *
 * Khai MỘT LẦN ở đây, không phải hai bản độc lập: `src/debt.ts` từng tự khai
 * `ScoreValue = 1 | 2 | 3 | 4 | 5`, và icebox cần đúng thang đó cho
 * `weight`/`ease`. Hai bản trôi khỏi nhau (vd một bên đổi sang 1–10) là lỗi
 * im lặng — không có gì báo, chỉ có hai module ngầm hiểu khác nhau "5" nghĩa
 * là gì. `z.union` của năm literal thay vì `z.number().int().min(1).max(5)`
 * để kiểu suy ra được đúng `1 | 2 | 3 | 4 | 5`, không tụt về `number`.
 */
export const zScoreValue = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export type ScoreValue = z.infer<typeof zScoreValue>;
