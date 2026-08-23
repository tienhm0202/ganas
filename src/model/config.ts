import { z } from "zod";

import { zNonEmpty } from "./common.js";

/**
 * Mức cưỡng chế.
 *  - warn:    hook chỉ cảnh báo qua systemMessage, không chặn (shadow mode)
 *  - enforce: hook trả decision: "block"
 *
 * Đọc từ config ngay từ hook đầu tiên: bật enforce sau mà chưa thiết kế sẵn thì
 * phải viết lại toàn bộ hook.
 */
export const ENFORCEMENT = ["warn", "enforce"] as const;
export type Enforcement = (typeof ENFORCEMENT)[number];

/** Các luật có thể bật/tắt cưỡng chế riêng lẻ. */
export const ENFORCEMENT_RULES = [
  /** Ghi tri thức không có anchor. */
  "knowledge_anchor",
  /** Ghi file .ganas/ sai schema. */
  "schema",
  /** Kết thúc phiên khi exit_contract chưa thoả. */
  "exit_contract",
  /** Tạo/đóng task không neo được vào phạm vi/goal. */
  "task_link",
  /** Model tự đặt status: approved/rejected cho proposal thay vì `ganas proposal approve/reject`. */
  "proposal_decision",
] as const;
export type EnforcementRule = (typeof ENFORCEMENT_RULES)[number];

/**
 * Tier model — dùng cho `config.models` (id thật cho từng tier) và
 * `Task.model` (tier agent gán lúc chẻ task từ plan, xem `task.ts`).
 */
export const MODEL_TIER = ["main", "verifier", "scribe"] as const;
export type ModelTier = (typeof MODEL_TIER)[number];

/**
 * Harness đang chạy ganas — khai trong `config.yaml`, `install-target.mjs` ghi
 * lúc cài.
 *
 * Cần khai vì tier model chỉ là DỮ LIỆU; biến nó thành hành động thì mỗi
 * harness một kiểu: Claude Code tạo được sub-agent và chỉ định được model
 * ngay trong tool call, còn Cursor/Zed/Windsurf chỉ nối với ganas qua MCP —
 * MCP không có khái niệm sinh agent con hay đổi model của phiên, model do
 * NGƯỜI chọn trong picker.
 *
 * Field này còn quyết định TÊN FILE HƯỚNG DẪN mà `ganas init` sinh ra
 * (`guideFileName()` ngay dưới) — mỗi harness đọc một tên khác nhau.
 *
 * Đánh đổi đã biết: một repo mở bằng nhiều editor chỉ khai được một giá trị.
 * Khai cái mà bạn thật sự giao việc từ đó; khai sai thì hậu quả là brief
 * hướng dẫn nhầm cách giao và file hướng dẫn mang tên công cụ khác, không
 * phải hỏng dữ liệu.
 */
export const HARNESS = [
  "claude-code",
  "codex",
  "cursor",
  "zed",
  "windsurf",
  "gemini",
  "other",
] as const;
export type Harness = (typeof HARNESS)[number];

/**
 * Tên file hướng dẫn mà mỗi harness THẬT SỰ tự đọc.
 *
 * Không có một tên dùng chung được cho tất cả — xem claim `C-002` với URL và
 * `fetched_at` của từng dòng. Hai điểm vỡ khiến bảng này phải tồn tại thay vì
 * đóng cứng một tên: Claude Code chỉ tự tìm `CLAUDE.md`/`CLAUDE.local.md` và
 * KHÔNG đọc `AGENTS.md` ở bất kỳ cấp thư mục nào; còn Zed lấy file ĐẦU TIÊN
 * khớp trong danh sách fallback của nó, nên `AGENTS.md` có thể bị bỏ qua im
 * lặng khi repo đã có `.rules`.
 *
 * `other` lấy `AGENTS.md`: đó là tên mà nhiều công cụ nhất đọc được, nên là
 * phỏng đoán ít sai nhất khi không biết harness là gì.
 */
const GUIDE_FILE: Record<Harness, string> = {
  "claude-code": "CLAUDE.md",
  codex: "AGENTS.md",
  cursor: "AGENTS.md",
  zed: "AGENTS.md",
  windsurf: "AGENTS.md",
  gemini: "GEMINI.md",
  other: "AGENTS.md",
};

/** Tên file hướng dẫn `ganas init` phải sinh cho harness này. */
export function guideFileName(harness: Harness): string {
  return GUIDE_FILE[harness];
}

/**
 * Tên file CỬA TRỎ cần ghi thêm, hoặc `undefined` nếu không cần.
 *
 * Chỉ khi file chính không phải `AGENTS.md`: người mở repo bằng Codex/Cursor
 * phải có đường tìm ra hướng dẫn thật. Cố ý KHÔNG chép nội dung sang — hai bản
 * đầy đủ song song thì bản sai luôn là bản không ai đọc.
 */
export function pointerFileName(harness: Harness): string | undefined {
  return guideFileName(harness) === "AGENTS.md" ? undefined : "AGENTS.md";
}

/** Harness tạo được sub-agent và chỉ định được model cho nó ngay trong phiên. */
export function canDispatchSubagent(harness: Harness): boolean {
  return harness === "claude-code";
}

/**
 * Alias model mà công cụ tạo sub-agent của Claude Code (Agent tool) nhận —
 * `opus`/`sonnet`/`haiku`/`fable` — suy từ id thật khai trong `config.models`.
 *
 * Phải suy, không hardcode: `config.models` là id đầy đủ (`claude-sonnet-5`)
 * vì đó là thứ dùng được ở mọi harness, còn Agent tool chỉ nhận họ model. Suy
 * hụt (id lạ, model của hãng khác) thì trả `undefined` — brief in id thật và
 * để người đọc tự chọn, thà không gợi ý còn hơn gợi ý một alias không tồn tại
 * khiến tool call hỏng.
 */
export function agentModelAlias(modelId: string): string | undefined {
  return /(opus|sonnet|haiku|fable)/i.exec(modelId)?.[1]?.toLowerCase();
}

/**
 * Phiên bản schema `.ganas/` mà bản ganas này hiểu được.
 *
 * Chưa cần cơ chế migrate: ganas chưa có installed base, nên schema mới cứ đổi
 * thẳng. Điều PHẢI có ngay là lối thoát cho ngày có installed base — một dự án
 * ghi version tương lai phải nhận thông điệp "nâng cấp ganas", chứ không phải
 * một lỗi zod trần khiến người ta hạ số version xuống để chạy tạm.
 */
export const LATEST_SCHEMA_VERSION = 1;

export const zConfig = z.object({
  version: z
    .literal(LATEST_SCHEMA_VERSION)
    .default(LATEST_SCHEMA_VERSION)
    .describe("phiên bản schema .ganas/"),
  project: zNonEmpty,

  /**
   * Harness giao việc. Mặc định `claude-code`: đó là harness ganas cưỡng chế
   * được đầy đủ (hook + skill), và là mặc định của `ganas init`. Dự án cũ
   * không khai field này vẫn chạy như trước.
   */
  harness: z.enum(HARNESS).default("claude-code"),

  /** Mức mặc định cho mọi luật. */
  enforcement: z.enum(ENFORCEMENT).default("warn"),
  /** Ghi đè theo từng luật. Thiếu key ⇒ dùng `enforcement`. */
  enforcement_rules: z.record(z.enum(ENFORCEMENT_RULES), z.enum(ENFORCEMENT)).default({}),

  /** Ba key phải khớp đúng `MODEL_TIER` — `Task.model` tham chiếu vào đây. */
  models: z
    .object({
      main: z.string().default("claude-opus-5"),
      verifier: z.string().default("claude-sonnet-5"),
      scribe: z.string().default("claude-haiku-4-5"),
    } satisfies Record<ModelTier, z.ZodDefault<z.ZodString>>)
    .default({}),

  session_start: z
    .object({
      /**
       * Tự gửi một câu mở đầu khi phiên bắt đầu (hook trả `initialUserMessage`).
       * Mặc định tắt: người mở Claude Code để hỏi nhanh một câu không muốn bị
       * cuốn ngay vào task. Brief vẫn được bơm vào context dù bật hay tắt.
       */
      auto_begin: z.boolean().default(false),
    })
    .default({}),

  claim: z
    .object({
      /**
       * Một task bị giữ (claim) quá lâu không còn tin được là phiên đó vẫn
       * sống — có thể đã crash. Sau ngần này phút, claim cũ bị coi là bỏ
       * hoang và một phiên khác được phép giành lại. Xem `graph/claim.ts`.
       */
      ttl_minutes: z.number().int().positive().default(240),
    })
    .default({}),

  /**
   * Lệnh kiểm TOÀN DỰ ÁN mà `ganas commit` chạy trên cây sắp được commit
   * (vd `npm run typecheck`) — khác hẳn các lệnh trong `exit_contract` của
   * từng task, vốn chỉ kiểm đúng PHẦN task đó chạm tới. Một task có thể có
   * exit_contract xanh (phần của nó đúng) trong khi cây tổng vẫn không biên
   * dịch được vì một thay đổi bắt buộc trải sang phạm vi khác — đây là lớp
   * chặn cho đúng khoảng hở đó, xem PR-007.
   *
   * TUỲ CHỌN, mặc định trống: dự án không khai thì `ganas commit` bỏ qua
   * phép kiểm này kèm một dòng báo, không phải đỏ. Bắt buộc khai sẽ chặn
   * đứng mọi dự án cũ ngay lần commit đầu tiên — trái luật `enforcement`
   * mặc định `warn` (xem `.claude/rules/architecture.md`), nên field này
   * phải mềm y như những luật khác.
   */
  build_check: z.string().optional(),
});

export type Config = z.infer<typeof zConfig>;

/** Mức cưỡng chế hiệu lực cho một luật cụ thể. */
export function enforcementFor(config: Config, rule: EnforcementRule): Enforcement {
  return config.enforcement_rules[rule] ?? config.enforcement;
}
