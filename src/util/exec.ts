import { execFile } from "node:child_process";

import type { Expect } from "../model/index.js";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
/** Chặn output khổng lồ làm nghẽn hook. */
const MAX_BUFFER = 4 * 1024 * 1024;

/**
 * Chạy một lệnh shell không tương tác. Không ném lỗi khi lệnh fail — probe fail
 * là dữ liệu, không phải sự cố.
 */
export function runShell(
  command: string,
  opts: { cwd?: string | undefined; timeoutMs?: number | undefined; env?: NodeJS.ProcessEnv } = {},
): Promise<ExecResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = execFile(
      command,
      {
        shell: true,
        cwd: opts.cwd ?? process.cwd(),
        timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        env: { ...process.env, ...opts.env, GANAS_PROBE: "1" },
        // Probe không được hỏi gì — nếu nó chờ input thì phải fail, không treo.
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        // execFile đặt error.code = mã thoát (số) khi lệnh chạy nhưng fail, và
        // = mã lỗi hệ thống (chuỗi, vd "ETIMEDOUT") khi không spawn được.
        const rawCode: unknown = error ? (error as { code?: unknown }).code : 0;
        const timedOut =
          rawCode === "ETIMEDOUT" || (error as { killed?: boolean })?.killed === true;
        resolve({
          code: typeof rawCode === "number" ? rawCode : error ? 1 : 0,
          stdout: String(stdout),
          stderr: String(stderr),
          timedOut,
          durationMs: Date.now() - started,
        });
      },
    );
    // Không cho probe đọc stdin: lệnh chờ nhập sẽ nhận EOF và thoát.
    child.stdin?.end();
  });
}

export interface Judgement {
  pass: boolean;
  /** Vì sao trượt — đưa nguyên văn cho Claude khi hook chặn. */
  reason?: string;
}

/** Chấm kết quả chạy theo `expect`. */
export function judge(result: ExecResult, expect: Expect): Judgement {
  if (result.timedOut) {
    return { pass: false, reason: `lệnh quá hạn sau ${result.durationMs}ms` };
  }

  if (expect === "exit_zero") {
    if (result.code === 0) return { pass: true };
    return {
      pass: false,
      reason: `thoát với mã ${result.code}${result.stderr.trim() ? ` — ${firstLines(result.stderr)}` : ""}`,
    };
  }

  if (expect.exit_code !== undefined && result.code !== expect.exit_code) {
    return { pass: false, reason: `mong đợi mã thoát ${expect.exit_code}, nhận ${result.code}` };
  }
  if (expect.stdout_contains !== undefined && !result.stdout.includes(expect.stdout_contains)) {
    return { pass: false, reason: `stdout không chứa "${expect.stdout_contains}"` };
  }
  if (expect.stdout_matches !== undefined) {
    let re: RegExp;
    try {
      re = new RegExp(expect.stdout_matches);
    } catch {
      return {
        pass: false,
        reason: `stdout_matches không phải regex hợp lệ: ${expect.stdout_matches}`,
      };
    }
    if (!re.test(result.stdout)) {
      return { pass: false, reason: `stdout không khớp /${expect.stdout_matches}/` };
    }
  }
  if (expect.stderr_contains !== undefined && !result.stderr.includes(expect.stderr_contains)) {
    return { pass: false, reason: `stderr không chứa "${expect.stderr_contains}"` };
  }

  // Không khai exit_code ⇒ vẫn đòi thoát sạch.
  if (expect.exit_code === undefined && result.code !== 0) {
    return { pass: false, reason: `thoát với mã ${result.code}` };
  }

  return { pass: true };
}

function firstLines(text: string, n = 3): string {
  return text.trim().split("\n").slice(0, n).join(" / ");
}
