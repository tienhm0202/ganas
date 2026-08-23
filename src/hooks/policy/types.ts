/**
 * Hình dạng dữ liệu của một lượt hook — thứ Claude Code gửi vào và mong nhận lại.
 *
 * Ở LÕI chứ không ở vỏ, dù chính vỏ mới là nơi đọc stdin ghi stdout. Đây là
 * ĐỊNH NGHĨA DỮ LIỆU thuần: không đọc gì, không ghi gì, không phụ thuộc ai.
 *
 * Trước T-041 chúng nằm trong `io/io.ts`, chỉ vì lịch sử file — và hệ quả là
 * `policy/index.ts` phải import ngược từ vỏ, biến cặp lõi/vỏ thành một CHU
 * TRÌNH ở mức khối (`spine/module-cycle`). Vòng đó vô hình suốt từ T-020 vì
 * cạnh `policy → io` chưa bao giờ được khai trong `depends_on`; nó chỉ lộ ra
 * khi khai `depends_on` đúng import thật. Xem PR-012.
 *
 * Đừng đưa `readHookInput`/`writeHookOutput` về đây: chúng CHẠM stdin/stdout,
 * và đó là ranh giới mà cả lần chẻ T-020 sinh ra để giữ.
 */

export interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  permission_mode?: string;
  /** SessionStart: "startup" | "resume" | "clear" | "compact" | "fork" */
  source?: string;
  /** PostToolUse */
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  /** Stop: cờ chống lặp vô hạn khi hook đã chặn một lần. */
  stop_hook_active?: boolean;
  last_assistant_message?: string;
  stop_reason?: string;
  /** Chỉ có khi tool call đến từ sub-agent — main session không có field này. */
  agent_id?: string;
  agent_type?: string;
  [key: string]: unknown;
}

export interface HookOutput {
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  decision?: "block";
  reason?: string;
  hookSpecificOutput?: Record<string, unknown>;
}

/** Cho phép đi tiếp, không nói gì. */
export const ALLOW: HookOutput = {};

/**
 * ganas gặp sự cố. Báo cho người dùng biết công cụ đang hỏng, nhưng KHÔNG chặn.
 * Người dùng cần biết là mình đang mất lớp bảo vệ, chứ không phải bị kẹt.
 */
export function degraded(message: string): HookOutput {
  return { systemMessage: `ganas không chạy được (đang bỏ qua kiểm soát): ${message}` };
}
