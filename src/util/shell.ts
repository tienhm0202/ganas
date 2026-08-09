/**
 * Nhặt đường dẫn ra khỏi một chuỗi lệnh shell.
 *
 * Dùng chung cho hai chỗ hỏi cùng một câu: `commit.ts` (file nào mà
 * `exit_contract` chạy thì phải vào commit) và `verify/mutate.ts` (probe chạy
 * trên đường dẫn nào thì bóp méo đường dẫn đó). Trước đây chỉ `commit.ts` có,
 * và mutate không nhận ra `bun test <thư mục>` — hai chỗ cùng một bài toán mà
 * chỉ một chỗ giải.
 *
 * Không phải parser shell đầy đủ, và không cần: mọi kết luận rút ra ở đây đều
 * còn được lọc lại (`existsSync`, hoặc chạy thật bản bóp méo).
 */

/**
 * Tách chuỗi lệnh thành token, tôn trọng nháy đơn/kép.
 *
 * Chỗ quan trọng là chuỗi trong nháy phải ra MỘT token: `-t 'tên test'` mà tách
 * theo khoảng trắng thì `test` thành một token và bị nhầm là đường dẫn.
 */
export function tokenizeShell(command: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let started = false;
  let quote: '"' | "'" | null = null;

  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) tokens.push(cur);
      cur = "";
      started = false;
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started) tokens.push(cur);
  return tokens;
}

/** Gỡ ký tự nối/chuyển hướng dính vào đầu-cuối token: `2>/dev/null`, `x.ts;`. */
export function stripOperators(token: string): string {
  return token.replace(/^[0-9]*[<>|&;()]+/, "").replace(/[;|&)]+$/, "");
}

/**
 * Token này có dáng một đường dẫn không: có `/`, hoặc có đuôi file.
 *
 * Cố tình lỏng — người gọi còn lọc lại bằng "file có thật trên đĩa không", nên
 * đoán thừa (URL, `2>/dev/null`) không gây hại, mà đoán thiếu thì bỏ sót file
 * cần commit.
 */
export function looksLikePath(token: string): boolean {
  if (!token || token.startsWith("-")) return false;
  return token.includes("/") || /\.[A-Za-z0-9]+$/.test(token);
}

export interface TokenSpan {
  text: string;
  /** Vị trí bắt đầu trong chuỗi gốc — cần khi phải THAY token tại chỗ. */
  start: number;
}

/**
 * Token kèm vị trí, tách thuần theo khoảng trắng (không gỡ nháy).
 *
 * `tokenizeShell` gỡ nháy nên không dùng để thay chuỗi tại chỗ được: token trả
 * về không còn khớp với văn bản gốc. Hàm này giữ nguyên văn, đủ để chèn hậu tố
 * vào đúng chỗ.
 */
export function tokenSpans(command: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command)) !== null) spans.push({ text: m[0], start: m.index });
  return spans;
}
