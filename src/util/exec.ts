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
    return { pass: false, reason: exitReason(result) };
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
    return { pass: false, reason: exitReason(result) };
  }

  return { pass: true };
}

/** Số dòng lấy từ ĐẦU stderr — lỗi thật của một lệnh thường nằm ngay dòng đầu. */
const STDERR_LINES = 3;
/**
 * Số dòng lấy từ ĐUÔI stdout. Rộng hơn stderr vì tóm tắt của test runner xen
 * lẫn khung ngăn xếp: cắt sát quá thì chỉ còn lại phần đuôi của một dump lỗi.
 */
const STDOUT_TAIL_LINES = 12;
/** Cắt dòng quá dài — một dòng log vài chục KB không được phép nuốt cả brief. */
const MAX_LINE_CHARS = 200;

/**
 * Lý do trượt vì mã thoát, KÈM thân xác của lệnh.
 *
 * stderr là chỗ nhìn đầu tiên, nhưng nhiều runner (node:test, vitest, jest) báo
 * lỗi ra STDOUT và để stderr rỗng — khi đó `thoát với mã 1` là một câu rỗng
 * ruột, đúng thứ đã làm ba phiên liền mù (ICE-011). Không có stderr thì lấy
 * phần ĐUÔI stdout: tóm tắt lỗi của runner nằm ở cuối, không phải ở đầu.
 */
function exitReason(result: ExecResult): string {
  const body = failureBody(result);
  return `thoát với mã ${result.code}${body ? ` — ${body}` : ""}`;
}

function failureBody(result: ExecResult): string {
  if (result.stderr.trim()) return firstLines(result.stderr, STDERR_LINES);
  if (result.stdout.trim()) return lastLines(result.stdout, STDOUT_TAIL_LINES);
  return "";
}

function firstLines(text: string, n = STDERR_LINES): string {
  return joinLines(usefulLines(text).slice(0, n));
}

function lastLines(text: string, n = STDOUT_TAIL_LINES): string {
  return joinLines(usefulLines(text).slice(-n));
}

/**
 * Bỏ dòng trống và khung ngăn xếp (`    at ...`) — quy ước chung của mọi runner
 * chạy trên V8. Giữ lại chúng thì hạn mức dòng bị khung ngăn xếp ăn hết, và cái
 * duy nhất người đọc cần — tên ca đỏ, câu assert — bị đẩy ra ngoài.
 */
function usefulLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "" && !/^\s*at\s/.test(line));
}

function joinLines(lines: string[]): string {
  return lines.map((line) => truncate(line.trim())).join(" / ");
}

function truncate(line: string): string {
  return line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line;
}
