/**
 * Matcher glob tối giản — đủ cho `depends_on` và `zone.paths`, không kéo thêm
 * phụ thuộc (hook gọi CLI liên tục nên mỗi module nạp thêm đều tính vào latency).
 *
 * Hỗ trợ: `**` (nhiều cấp), `*` (trong một cấp), `?`, `{a,b}`, `[abc]`.
 */

function expandBraces(pattern: string): string[] {
  const open = pattern.indexOf("{");
  if (open === -1) return [pattern];

  let depth = 0;
  let close = -1;
  for (let i = open; i < pattern.length; i++) {
    if (pattern[i] === "{") depth++;
    else if (pattern[i] === "}") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return [pattern];

  const prefix = pattern.slice(0, open);
  const suffix = pattern.slice(close + 1);
  const body = pattern.slice(open + 1, close);

  // Tách theo dấu phẩy ở cấp ngoài cùng.
  const parts: string[] = [];
  let current = "";
  let nest = 0;
  for (const ch of body) {
    if (ch === "{") nest++;
    else if (ch === "}") nest--;
    if (ch === "," && nest === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);

  return parts.flatMap((p) => expandBraces(prefix + p + suffix));
}

function segmentToRegex(segment: string): string {
  let out = "";
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]!;
    if (ch === "*") {
      out += "[^/]*";
    } else if (ch === "?") {
      out += "[^/]";
    } else if (ch === "[") {
      const close = segment.indexOf("]", i + 1);
      if (close === -1) {
        out += "\\[";
      } else {
        const body = segment.slice(i + 1, close);
        out += `[${body.startsWith("!") ? "^" + body.slice(1) : body}]`;
        i = close;
      }
    } else {
      out += ch.replace(/[.+^${}()|\\]/g, "\\$&");
    }
  }
  return out;
}

function patternToRegex(pattern: string): RegExp {
  const segments = pattern.split("/");
  const parts: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (seg === "**") {
      // `a/**/b` khớp cả `a/b`; `a/**` khớp mọi thứ dưới `a/`.
      parts.push(i === segments.length - 1 ? "(?:.*)?" : "(?:.*/)?");
      continue;
    }
    parts.push(segmentToRegex(seg));
    if (i < segments.length - 1 && segments[i + 1] !== "**") parts.push("/");
  }

  // `a/**/b` sinh ra "a/" + "(?:.*/)?" + "b"; nối lại rồi neo hai đầu.
  return new RegExp(`^${parts.join("")}$`);
}

const cache = new Map<string, RegExp[]>();

/** Một đường dẫn có khớp bất kỳ pattern nào không. Đường dẫn dùng dấu `/`. */
export function matchesAny(path: string, patterns: readonly string[]): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  for (const pattern of patterns) {
    let regexes = cache.get(pattern);
    if (!regexes) {
      regexes = expandBraces(pattern).map(patternToRegex);
      cache.set(pattern, regexes);
    }
    if (regexes.some((re) => re.test(normalized))) return true;
  }
  return false;
}
