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
 * Đánh đổi đã biết: một repo mở bằng nhiều editor chỉ khai được một giá trị.
 * Khai cái mà bạn thật sự giao việc từ đó; khai sai thì hậu quả là brief
 * hướng dẫn nhầm cách giao, không phải hỏng dữ liệu.
 */
export const HARNESS = ["claude-code", "cursor", "zed", "windsurf", "other"] as const;
export type Harness = (typeof HARNESS)[number];

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

  embedder: z
    .object({
      provider: z.enum(["local", "voyage", "openai", "none"]).default("local"),
      model: z.string().default("multilingual-e5-small"),
    })
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
});

export type Config = z.infer<typeof zConfig>;

/** Mức cưỡng chế hiệu lực cho một luật cụ thể. */
export function enforcementFor(config: Config, rule: EnforcementRule): Enforcement {
  return config.enforcement_rules[rule] ?? config.enforcement;
}
