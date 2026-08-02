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
  /** Sửa code trong zone chưa survey. */
  "zone_survey",
] as const;
export type EnforcementRule = (typeof ENFORCEMENT_RULES)[number];

/**
 * Tier model — dùng cho `config.models` (id thật cho từng tier) và
 * `Task.model` (tier agent gán lúc chẻ task từ plan, xem `task.ts`).
 */
export const MODEL_TIER = ["main", "verifier", "scribe"] as const;
export type ModelTier = (typeof MODEL_TIER)[number];

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

  /** Cách adopt xử lý dự án cũ. */
  adopt: z
    .object({
      /** Nguồn tài liệu cũ được import thành legacy claim. */
      import_sources: z
        .array(zNonEmpty)
        .default(["CLAUDE.md", "AGENTS.md", ".cursor/rules", ".github/copilot-instructions.md"]),
    })
    .default({}),
});

export type Config = z.infer<typeof zConfig>;

/** Mức cưỡng chế hiệu lực cho một luật cụ thể. */
export function enforcementFor(config: Config, rule: EnforcementRule): Enforcement {
  return config.enforcement_rules[rule] ?? config.enforcement;
}
