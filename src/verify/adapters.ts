import { readFile } from "node:fs/promises";

/**
 * Đọc kết quả từ bộ eval của dự án.
 *
 * ganas **không phải framework eval**. Dự án tự chạy bộ eval của mình; ganas gọi
 * lệnh, đọc kết quả, chấm theo ngưỡng, ghi sổ cái. Nhờ vậy ganas không phải ôm
 * API key, retry, rate limit, cách chấm điểm — và không đụng tooling sẵn có.
 */

export interface EvalReading {
  /** Tỉ lệ đạt, 0..1. */
  score: number;
  n?: number | undefined;
  passed?: number | undefined;
  failed?: number | undefined;
  /** Model runner báo đã dùng. Khai trong `verify.model` thì ưu tiên khai báo. */
  model?: string | undefined;
  cost_usd?: number | undefined;
}

export type AdapterName = "json" | "promptfoo";

export class AdapterError extends Error {}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Contract gốc của ganas — runner tự ghi ra đúng shape này. */
function readJsonAdapter(data: unknown): EvalReading {
  if (typeof data !== "object" || data === null) {
    throw new AdapterError("kết quả không phải object JSON");
  }
  const d = data as Record<string, unknown>;

  let score = num(d["score"]);
  const passed = num(d["passed"]);
  const failed = num(d["failed"]);
  const n =
    num(d["n"]) ?? (passed !== undefined && failed !== undefined ? passed + failed : undefined);

  // Thiếu `score` nhưng có passed/n thì suy ra được — đừng bắt runner khai thừa.
  if (score === undefined && passed !== undefined && n !== undefined && n > 0) {
    score = passed / n;
  }
  if (score === undefined) {
    throw new AdapterError("thiếu `score` (và không suy ra được từ `passed`/`n`)");
  }
  if (score < 0 || score > 1) {
    throw new AdapterError(`score = ${score}, phải nằm trong 0..1`);
  }

  return {
    score,
    n,
    passed,
    failed,
    model: typeof d["model"] === "string" ? d["model"] : undefined,
    cost_usd: num(d["cost_usd"]),
  };
}

/**
 * promptfoo: `results.stats.{successes,failures}`.
 * (promptfoo thoát mã 100 khi dưới ngưỡng của chính nó — ganas không dựa vào mã
 * thoát mà chấm lại theo ngưỡng khai trong module.)
 */
function readPromptfooAdapter(data: unknown): EvalReading {
  const root = data as Record<string, unknown> | null;
  const results = root?.["results"] as Record<string, unknown> | undefined;
  const stats = (results?.["stats"] ?? root?.["stats"]) as Record<string, unknown> | undefined;

  const successes = num(stats?.["successes"]);
  const failures = num(stats?.["failures"]);
  if (successes === undefined || failures === undefined) {
    throw new AdapterError("không tìm thấy `results.stats.successes` / `.failures`");
  }

  const n = successes + failures;
  if (n === 0) throw new AdapterError("bộ eval chạy 0 ca — không có gì để chấm");

  const tokenUsage = (results?.["tokenUsage"] ?? root?.["tokenUsage"]) as
    Record<string, unknown> | undefined;

  return {
    score: successes / n,
    n,
    passed: successes,
    failed: failures,
    cost_usd: num(tokenUsage?.["cost"]),
  };
}

/**
 * Đọc file kết quả. `stdoutFallback` dùng khi runner in ra stdout thay vì ghi file
 * — chuyện thường gặp, và bắt người ta sửa runner chỉ vì chỗ này thì quá cứng nhắc.
 */
export async function readEvalResult(
  adapter: AdapterName,
  outFile: string,
  stdoutFallback: string,
): Promise<EvalReading> {
  let raw: string;
  try {
    raw = await readFile(outFile, "utf8");
    if (!raw.trim()) throw new Error("rỗng");
  } catch {
    raw = stdoutFallback.trim();
    if (!raw) {
      throw new AdapterError(
        `runner không ghi gì vào $GANAS_EVAL_OUT và cũng không in JSON ra stdout`,
      );
    }
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    // stdout thường lẫn log; thử vớt object JSON cuối cùng.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new AdapterError("kết quả không phải JSON hợp lệ");
    try {
      data = JSON.parse(match[0]);
    } catch {
      throw new AdapterError("kết quả không phải JSON hợp lệ");
    }
  }

  return adapter === "promptfoo" ? readPromptfooAdapter(data) : readJsonAdapter(data);
}
