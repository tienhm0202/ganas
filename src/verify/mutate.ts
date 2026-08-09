import type { Expect } from "../model/index.js";
import { judge, runShell } from "../util/exec.js";
import { looksLikePath, stripOperators, type TokenSpan, tokenSpans } from "../util/shell.js";

/**
 * Mutation test cho probe.
 *
 * Lint bắt được kiểu lười lộ liễu (`true`, `echo ok`). Nhưng `ls src >/dev/null`
 * thì qua lint mà vẫn không bao giờ fail. Cách duy nhất chứng minh một probe CÓ
 * KHẢ NĂNG fail là bóp méo nó rồi bắt nó fail thật.
 *
 * Không nhận ra dạng ⇒ nói thẳng là "chưa chứng minh được", chứ không im lặng
 * coi như đã chứng minh.
 */

export interface Mutation {
  /** Lệnh đã bóp méo. */
  run: string;
  /** Bóp méo cái gì — đưa vào thông báo để người đọc hiểu bài kiểm. */
  what: string;
}

const MUTANT_SUFFIX = ".ganas-mutant";
/** Chuỗi gần như chắc chắn không tồn tại trong bất kỳ file nào. */
const IMPROBABLE = "ganas_mutant_zqx7_khong_ton_tai";

/** `test -f X`, `test -d X`, `test -e X`, `[ -f X ]` → đổi X thành đường dẫn không tồn tại. */
const FILE_TEST = /(\[\s+|\btest\s+)(-[fdesr])\s+("?)([^\s"';|&)]+)\3/;

/** `grep -q PAT FILE`, `rg -q PAT FILE` → đổi PAT thành chuỗi không thể khớp. */
const GREP = /\b(grep|rg|ag)\b((?:\s+-[A-Za-z-]+)*)\s+(['"])((?:(?!\3).)+)\3/;
const GREP_BARE = /\b(grep|rg|ag)\b((?:\s+-[A-Za-z-]+)*)\s+([^\s'"|;&-][^\s|;&]*)/;

/** Chuỗi trong nháy ở bất kỳ đâu — phương án cuối. */
const QUOTED = /(['"])((?:(?!\1).){2,})\1/;

/**
 * Bộ chạy test kèm đối số đường dẫn: `bun test src/x`, `pytest tests/`…
 *
 * Đây là dạng probe phổ biến nhất của một dự án thật, mà trước đây không mẫu
 * nào nhận ra ⇒ đa số probe chỉ "đạt yếu": chạy pass nhưng chưa bao giờ được
 * chứng minh là CÓ THỂ fail.
 */
const RUNNER = /\b(?:bun\s+test|vitest(?:\s+run)?|jest|pytest|go\s+test|cargo\s+test)\b/;

/**
 * Cờ ĂN token kế tiếp làm giá trị — token đó không phải đối số đường dẫn.
 *
 * Cố tình liệt kê tường minh thay vì đoán "cờ nào cũng ăn giá trị": cờ boolean
 * (`-v`, `--lib`, `--watch`) phổ biến hơn nhiều trong lệnh test, và coi chúng
 * là cờ ăn giá trị sẽ nuốt mất chính đường dẫn cần bóp méo.
 */
const VALUE_FLAGS = new Set([
  "-c",
  "--config",
  "-p",
  "--project",
  "--rootdir",
  "-k",
  "-t",
  "--testNamePattern",
  "--test-name-pattern",
  "--testPathPattern",
  "-n",
  "--numprocesses",
  "--reporter",
  "-o",
]);

/**
 * Đối số đường dẫn đầu tiên sau tên bộ chạy.
 *
 * Trả về span (kèm vị trí) để người gọi thay đúng chỗ trong chuỗi gốc — không
 * dùng `String.replace` được, vì cùng một chuỗi có thể xuất hiện nhiều lần.
 */
function runnerPathSpan(run: string): TokenSpan | null {
  const m = RUNNER.exec(run);
  if (!m) return null;

  const after = m.index + m[0].length;
  const spans = tokenSpans(run.slice(after)).map((s) => ({ ...s, start: s.start + after }));

  let skipNext = false;
  for (const span of spans) {
    if (span.text.startsWith("-")) {
      skipNext = VALUE_FLAGS.has(span.text);
      continue;
    }
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (looksLikePath(stripOperators(span.text))) return span;
  }
  return null;
}

/**
 * Sinh bản bóp méo. Trả về null nếu không nhận ra dạng — người gọi biến điều đó
 * thành `probe_unproven`, chứ không đoán bừa.
 */
export function mutateProbe(run: string): Mutation | null {
  const fileTest = FILE_TEST.exec(run);
  if (fileTest) {
    const [full, head, flag, quote, path] = fileTest;
    const replaced = `${head}${flag} ${quote}${path}${MUTANT_SUFFIX}${quote}`;
    return {
      run: run.replace(full, replaced),
      what: `đổi đường dẫn \`${path}\` thành đường dẫn không tồn tại`,
    };
  }

  const grep = GREP.exec(run);
  if (grep) {
    const [full, cmd, flags, quote, pattern] = grep;
    return {
      run: run.replace(full, `${cmd}${flags} ${quote}${IMPROBABLE}${quote}`),
      what: `đổi pattern \`${pattern}\` thành chuỗi không thể khớp`,
    };
  }

  const grepBare = GREP_BARE.exec(run);
  if (grepBare) {
    const [full, cmd, flags, pattern] = grepBare;
    return {
      run: run.replace(full, `${cmd}${flags} ${IMPROBABLE}`),
      what: `đổi pattern \`${pattern}\` thành chuỗi không thể khớp`,
    };
  }

  // Trước QUOTED: với `bun test x.ts -t 'tên'` thì đổi ĐƯỜNG DẪN là bài kiểm
  // mạnh hơn đổi chuỗi lọc — nó chứng minh probe thật sự phụ thuộc vào chỗ file
  // nằm, chứ không chỉ vào một cái tên.
  const runnerPath = runnerPathSpan(run);
  if (runnerPath) {
    const path = stripOperators(runnerPath.text);
    const replaced = runnerPath.text.replace(path, `${path}${MUTANT_SUFFIX}`);
    return {
      run: run.slice(0, runnerPath.start) + replaced + run.slice(runnerPath.start + runnerPath.text.length),
      what: `đổi đường dẫn \`${path}\` thành đường dẫn không tồn tại`,
    };
  }

  const quoted = QUOTED.exec(run);
  if (quoted) {
    const [full, quote, body] = quoted;
    return {
      run: run.replace(full, `${quote}${IMPROBABLE}${quote}`),
      what: `đổi chuỗi \`${body}\` thành chuỗi không thể khớp`,
    };
  }

  return null;
}

export type MutationVerdict =
  /** Bản bóp méo đã fail đúng như kỳ vọng — probe chứng minh được là có thể fail. */
  | { status: "proven"; what: string }
  /** Bản bóp méo VẪN PASS — probe không kiểm thứ nó nói là đang kiểm. */
  | { status: "cannot_fail"; what: string; message: string }
  /** Không nhận ra dạng để bóp méo. Không kết luận gì. */
  | { status: "unproven"; message: string };

/**
 * Chạy bản bóp méo và kiểm nó có fail không.
 *
 * `cannot_fail` là phát hiện đáng giá nhất ở đây: probe qua được lint, chạy
 * pass, nhưng bóp méo rồi vẫn pass ⇒ nó đang đo một thứ khác với thứ nó khai.
 */
export async function proveCanFail(
  run: string,
  expect: Expect,
  opts: { cwd: string; timeoutMs?: number | undefined },
): Promise<MutationVerdict> {
  const mutation = mutateProbe(run);
  if (!mutation) {
    return {
      status: "unproven",
      message:
        `không nhận ra dạng probe để bóp méo, nên chưa chứng minh được nó có thể fail. ` +
        `Dạng kiểm được: \`test -f <path>\`, \`grep -q '<pattern>' <file>\`, ` +
        `bộ chạy test kèm đường dẫn (\`bun test <path>\`, \`vitest\`, \`jest\`, \`pytest\`, ` +
        `\`go test\`, \`cargo test\`), hoặc lệnh có chuỗi trong nháy.`,
    };
  }

  const result = await runShell(mutation.run, {
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs ?? 30_000,
  });
  const verdict = judge(result, expect);

  if (verdict.pass) {
    return {
      status: "cannot_fail",
      what: mutation.what,
      message:
        `bản bóp méo (${mutation.what}) VẪN PASS — probe này không kiểm thứ nó nói là đang kiểm.\n` +
        `    bản gốc:    ${run}\n` +
        `    bóp méo:    ${mutation.run}\n` +
        `    Cả hai cùng pass nghĩa là kết quả pass không mang thông tin gì.`,
    };
  }

  return { status: "proven", what: mutation.what };
}
