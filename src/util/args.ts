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
]);

export function parseArgs(raw: string[], booleanFlags: Iterable<string> = []): Argv {
  const bools = new Set([...KNOWN_BOOLEAN_FLAGS, ...booleanFlags]);
  const argv: Argv = { positional: [], options: {}, flags: {}, passthrough: [] };

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
        argv.options[body.slice(0, eq)] = body.slice(eq + 1);
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

/** Đọc một option chuỗi, chấp nhận cả dạng tên dài lẫn tên ngắn. */
export function option(argv: Argv, ...names: string[]): string | undefined {
  for (const n of names) {
    const v = argv.options[n];
    if (v !== undefined) return v;
  }
  return undefined;
}
