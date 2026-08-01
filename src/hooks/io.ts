/**
 * Vào/ra cho hook Claude Code.
 *
 * Nguyên tắc bất di bất dịch: **hook không bao giờ được làm hỏng phiên**. Mọi
 * lỗi bên trong ganas đều biến thành output rỗng (cho phép đi tiếp) kèm một
 * systemMessage. Một công cụ kiểm soát mà tự nó chặn người dùng khi hỏng thì
 * tệ hơn là không có.
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

export async function readHookInput(): Promise<HookInput> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as HookInput;
  } catch {
    return {};
  }
}

export function writeHookOutput(output: HookOutput): void {
  process.stdout.write(JSON.stringify(output));
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
