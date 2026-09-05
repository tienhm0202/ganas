/**
 * Parser tham số tối giản — không dùng thư viện để giữ thời gian khởi động thấp
 * (hook gọi CLI rất nhiều lần mỗi phiên).
 *
 *   --key value | --key=value  → options.key
 *   --flag                     → flags.flag = true (khi token sau là một cờ khác
 *                                hoặc hết chuỗi)
 *   --no-flag                  → flags.flag = false
 *   -k value                   → options.k
 *   phần còn lại               → positional
 *   sau `--`                   → passthrough (không diễn giải)
 */
export interface Argv {
  positional: string[];
  options: Record<string, string>;
  /**
   * Mọi giá trị của một cờ CÓ THỂ lặp lại (vd `--anchor A --anchor B`), theo
   * đúng thứ tự gõ. `options` chỉ giữ giá trị CUỐI CÙNG (ghi đè) — lệnh nào
   * cần nhận nhiều giá trị cho cùng một tên cờ (vd `ganas icebox add
   * --anchor`) phải đọc từ đây qua `multiOption()`, không phải `option()`.
   */
  multi: Record<string, string[]>;
  flags: Record<string, boolean>;
  passthrough: string[];
}

/** Cờ boolean đã biết: không nuốt token kế tiếp làm giá trị. */
const KNOWN_BOOLEAN_FLAGS = new Set([
  "help",
  "h",
  "version",
  "v",
  "yes",
  "y",
  "json",
  "quiet",
  "q",
  "strict",
  "force",
  // Không khai ở đây thì `ganas commit --dry-run T-005` nuốt `T-005` làm GIÁ TRỊ
  // của `--dry-run`, và lệnh im lặng chạy trên task khác.
  "dry-run",
  "all-ganas",
  "check",
  // `ganas commit --allow-outside-tests T-005` không được nuốt `T-005` làm
  // giá trị của cờ — cùng lý do với `dry-run`/`all-ganas` ở trên.
  "allow-outside-tests",
]);

export function parseArgs(raw: string[], booleanFlags: Iterable<string> = []): Argv {
  const bools = new Set([...KNOWN_BOOLEAN_FLAGS, ...booleanFlags]);
  const argv: Argv = { positional: [], options: {}, multi: {}, flags: {}, passthrough: [] };

  const pushMulti = (key: string, value: string): void => {
    (argv.multi[key] ??= []).push(value);
  };

  let i = 0;
  for (; i < raw.length; i++) {
    const token = raw[i]!;

    if (token === "--") {
      argv.passthrough = raw.slice(i + 1);
      break;
    }

    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        const key = body.slice(0, eq);
        const value = body.slice(eq + 1);
        argv.options[key] = value;
        pushMulti(key, value);
        continue;
      }
      if (body.startsWith("no-")) {
        argv.flags[body.slice(3)] = false;
        continue;
      }
      const next = raw[i + 1];
      if (bools.has(body) || next === undefined || next.startsWith("-")) {
        argv.flags[body] = true;
      } else {
        argv.options[body] = next;
        pushMulti(body, next);
        i++;
      }
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      const body = token.slice(1);
      const next = raw[i + 1];
      if (bools.has(body) || next === undefined || next.startsWith("-")) {
        argv.flags[body] = true;
      } else {
        argv.options[body] = next;
        pushMulti(body, next);
        i++;
      }
      continue;
    }

    argv.positional.push(token);
  }

  return argv;
}

/** Đọc một cờ boolean, chấp nhận cả dạng tên dài lẫn tên ngắn. */
export function flag(argv: Argv, ...names: string[]): boolean {
  for (const n of names) {
    if (argv.flags[n] !== undefined) return argv.flags[n];
  }
  return false;
}

/**
 * Đọc một cờ MẶC ĐỊNH BẬT — chỉ `--no-<tên>` mới tắt.
 *
 * `flag()` không phân biệt được "vắng mặt" với "`--no-x`" (cả hai ra `false`),
 * nên hành vi mặc-định-bật phải hỏi thẳng `argv.flags`.
 */
export function enabled(argv: Argv, ...names: string[]): boolean {
  for (const n of names) {
    if (argv.flags[n] !== undefined) return argv.flags[n];
  }
  return true;
}

/** Đọc một option chuỗi, chấp nhận cả dạng tên dài lẫn tên ngắn. */
export function option(argv: Argv, ...names: string[]): string | undefined {
  for (const n of names) {
    const v = argv.options[n];
    if (v !== undefined) return v;
  }
  return undefined;
}

/**
 * Đọc MỌI giá trị của một cờ có thể lặp lại (vd `--anchor A --anchor B` →
 * `["A", "B"]`), theo đúng thứ tự gõ trên dòng lệnh. Gộp theo mọi tên truyền
 * vào (tên dài lẫn tên ngắn), không chỉ tên đầu tiên có mặt — khác `option()`,
 * vì một cờ lặp lại có thể trộn cả hai dạng tên trên cùng một lời gọi.
 */
export function multiOption(argv: Argv, ...names: string[]): string[] {
  const out: string[] = [];
  for (const n of names) out.push(...(argv.multi[n] ?? []));
  return out;
}
