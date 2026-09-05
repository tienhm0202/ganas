import * as handlers from "../hooks/io/handlers.js";
import {
  ALLOW,
  degraded,
  type HookInput,
  type HookOutput,
  readHookInput,
  writeHookOutput,
} from "../hooks/io/io.js";
import type { Argv } from "../util/args.js";

type Handler = (input: HookInput) => Promise<HookOutput>;

const HANDLERS: Record<string, Handler> = {
  "session-start": handlers.sessionStart,
  "pre-tool-use": handlers.preToolUse,
  "post-tool-use": handlers.postToolUse,
  stop: handlers.stop,
  "subagent-stop": handlers.subagentStop,
  "pre-compact": handlers.preCompact,
  "session-end": handlers.sessionEnd,
};

/**
 * Điểm vào cho hook Claude Code: đọc JSON ở stdin, ghi JSON ra stdout.
 *
 * Luôn thoát 0. Mã thoát khác 0 bị Claude Code hiểu là lỗi chặn, và một lỗi lập
 * trình trong ganas không được biến thành hàng rào chặn người dùng.
 */
export async function run(argv: Argv): Promise<number> {
  const event = argv.positional[0];
  const handler = event ? HANDLERS[event] : undefined;

  if (!handler) {
    writeHookOutput(
      degraded(`không biết hook "${event ?? ""}" (có: ${Object.keys(HANDLERS).join(", ")})`),
    );
    return 0;
  }

  let input: HookInput;
  try {
    input = await readHookInput();
  } catch {
    writeHookOutput(ALLOW);
    return 0;
  }

  try {
    writeHookOutput(await handler(input));
  } catch (err) {
    writeHookOutput(degraded(err instanceof Error ? err.message : String(err)));
  }
  return 0;
}
