/**
 * Kiểm tra bản thân bằng chứng, trước khi tin vào kết quả của nó.
 *
 * Model được bảo "viết lệnh kiểm chứng cho phát biểu này" hoàn toàn có thể viết
 * `run: "true"`. Probe đó không bao giờ fail, và nó biến một phỏng đoán thành
 * "fact đã xác minh" một cách hoàn toàn hợp lệ.
 *
 * **Một probe không thể fail thì tệ hơn không có probe** — không có probe thì
 * fact chỉ là `never_verified`; có probe rỗng ruột thì nó được đóng dấu xanh.
 */

export type LintSeverity = "error" | "warning";

export interface LintFinding {
  code: "tautological" | "dangerous" | "unrelated";
  severity: LintSeverity;
  message: string;
  hint?: string;
}

/** Lệnh luôn thoát 0, không phụ thuộc bất cứ thứ gì. */
const ALWAYS_TRUE = [/^true$/, /^:$/, /^exit\s+0$/, /^echo\b[^|;&]*$/, /^printf\b[^|;&]*$/];

/**
 * Không chạy, dù người dùng có muốn.
 *
 * Probe do model sinh ra rồi ganas chạy — đây là bề mặt thực thi mã. Với
 * `adopt --audit` trên dự án cũ, một lệnh sẽ sinh hàng chục probe cùng lúc.
 */
const DANGEROUS: Array<[RegExp, string]> = [
  [/\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rf]/, "xoá đệ quy"],
  [/\bgit\s+push\b/, "đẩy lên remote"],
  [/\bgit\s+reset\s+--hard\b/, "vứt bỏ thay đổi"],
  [/\bgit\s+clean\s+-[a-zA-Z]*[fd]/, "xoá file chưa track"],
  [/\bsudo\b/, "leo quyền"],
  [/\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba)?sh\b/, "tải về rồi chạy thẳng"],
  [/\bdd\s+if=/, "ghi đè thiết bị"],
  [/\bmkfs\b/, "format"],
  [/:\(\)\s*\{.*\}\s*;\s*:/, "fork bomb"],
  [/>\s*\/dev\/(sd|nvme|disk)/, "ghi thẳng vào ổ đĩa"],
  [/\bshutdown\b|\breboot\b/, "tắt/khởi động lại máy"],
];

/** Token đủ đặc trưng để đối chiếu: đường dẫn, định danh ≥3 ký tự, chuỗi trong nháy. */
function tokensOf(text: string): Set<string> {
  const out = new Set<string>();

  for (const m of text.matchAll(/["'`]([^"'`]{2,})["'`]/g)) {
    out.add(m[1]!.toLowerCase());
  }
  for (const m of text.matchAll(/[A-Za-z0-9_./-]*[/.][A-Za-z0-9_./-]+/g)) {
    const t = m[0]!.toLowerCase().replace(/^\.\//, "");
    if (t.length >= 3) out.add(t);
  }
  for (const m of text.matchAll(/[A-Za-z_][A-Za-z0-9_]{2,}/g)) {
    out.add(m[0]!.toLowerCase());
  }

  return out;
}

/** Từ chỉ là khung lệnh, xuất hiện ở mọi probe nên không nói lên điều gì. */
const SHELL_NOISE = new Set([
  "test", "grep", "rip", "npm", "npx", "run", "node", "bash", "sh", "cat", "ls", "find",
  "true", "false", "exit", "echo", "printf", "head", "tail", "wc", "sed", "awk", "jq",
  "the", "and", "not", "for", "with", "out", "dev", "null", "quiet", "count",
]);

export interface LintInput {
  /** Lệnh sẽ chạy. */
  run: string;
  /** Phát biểu mà probe này phải kiểm — dùng để đối chiếu token. */
  statement?: string | undefined;
  /** Ngữ cảnh thêm: paths của khối, anchors của fact. */
  context?: readonly string[] | undefined;
}

/**
 * Soi một probe.
 *
 * Phân mức có chủ đích:
 *  - `tautological` và `dangerous` là **error** — chắc chắn sai.
 *  - `unrelated` chỉ là **warning** — heuristic đối chiếu token có thể nhầm
 *    (phát biểu tiếng Việt, probe tiếng Anh), mà một cảnh báo sai chặn việc
 *    thật thì tệ hơn là bỏ lọt vài probe đáng ngờ.
 */
export function lintProbe(input: LintInput): LintFinding[] {
  const findings: LintFinding[] = [];
  const run = input.run.trim();

  for (const [pattern, what] of DANGEROUS) {
    if (pattern.test(run)) {
      findings.push({
        code: "dangerous",
        severity: "error",
        message: `probe chứa thao tác nguy hiểm (${what}): \`${run}\``,
        hint:
          `ganas sẽ KHÔNG chạy lệnh này. Probe chỉ được đọc và kiểm tra, ` +
          `không được đổi trạng thái hệ thống.`,
      });
      return findings; // nguy hiểm thì khỏi soi tiếp
    }
  }

  const simple = run.replace(/^\s*\(\s*|\s*\)\s*$/g, "").trim();
  if (ALWAYS_TRUE.some((re) => re.test(simple))) {
    findings.push({
      code: "tautological",
      severity: "error",
      message: `probe \`${run}\` luôn thành công — nó không kiểm chứng điều gì cả`,
      hint:
        `Probe phải có khả năng FAIL khi phát biểu sai. Viết lệnh thật sự chạm vào ` +
        `thứ đang được khẳng định (vd \`test -f <đường-dẫn>\`, \`grep -q '<chuỗi>' <file>\`, ` +
        `\`npm test -- <tên-test>\`).`,
    });
    return findings;
  }

  const haystack = [input.statement ?? "", ...(input.context ?? [])].join(" ");
  if (haystack.trim()) {
    const probeTokens = [...tokensOf(run)].filter((t) => !SHELL_NOISE.has(t));
    const claimTokens = tokensOf(haystack);
    const shared = probeTokens.some((t) =>
      [...claimTokens].some((c) => c === t || c.includes(t) || t.includes(c)),
    );
    if (probeTokens.length > 0 && !shared) {
      findings.push({
        code: "unrelated",
        severity: "warning",
        message:
          `probe \`${run}\` không nhắc tới thứ gì có trong phát biểu — ` +
          `nhiều khả năng nó đang kiểm một thứ khác`,
        hint: `Kiểm lại xem probe có thật sự kiểm đúng điều đang được khẳng định không.`,
      });
    }
  }

  return findings;
}

export function hasBlockingFinding(findings: readonly LintFinding[]): boolean {
  return findings.some((f) => f.severity === "error");
}
