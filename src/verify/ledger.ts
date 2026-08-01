import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";

import { ganasPath } from "../graph/paths.js";
import { runShell } from "../util/exec.js";

/**
 * Sổ cái xác minh — append-only, **commit vào git**.
 *
 * Đây là thứ khiến `last_verified_at` không tự khai được. Không có nó thì
 * `ganas verify` chỉ là nghi lễ: model ghi `last_verified_at: <hôm qua>` +
 * `last_result: pass` vào YAML là xong, không cần chạy gì.
 *
 * Sổ cái commit vào git để cả team và CI đều đối chiếu được — người khác pull về
 * là biết fact nào đã thật sự verify, thay vì phải chạy lại từ đầu.
 */

export const LEDGER_FILE = "verify-ledger.jsonl";

export const LEDGER_RESULT = [
  "pass",
  "fail",
  /** Ngưỡng đạt nhưng nằm trong vùng nhiễu — chưa đủ để gọi là pass. */
  "marginal",
  /** `skip_if` khớp: không kiểm được ở môi trường này. KHÔNG phải fail. */
  "unavailable",
  /** Probe nằm trong danh sách cấm hoặc không chấm được — cần người xem. */
  "unprovable",
] as const;
export type LedgerResult = (typeof LEDGER_RESULT)[number];

export interface LedgerEntry {
  /** `F-ACC-001` (fact) hoặc `M-intent/V-intent-smoke` (bằng chứng của khối). */
  target: string;
  kind: "probe" | "eval" | "contract";
  at: string;
  /** Vân tay ĐỊNH NGHĨA đã chạy. Lệch ⇒ probe bị thay ruột sau khi verify. */
  def: string;
  result: LedgerResult;

  /* --- riêng eval: kết quả chỉ đúng với đúng bộ này --------------------- */
  score?: number;
  threshold?: number;
  n?: number;
  passed?: number;
  model?: string;
  /** sha file prompt lúc chạy. */
  prompt?: string;
  /** sha file dataset lúc chạy. */
  dataset?: string;
  cost_usd?: number;

  /* --- ai chạy, ở đâu --------------------------------------------------- */
  by: string;
  git?: string;
  host?: string;
  /** sha của stdout+stderr — để đối chiếu khi nghi ngờ. */
  output?: string;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex").slice(0, 16);
}

/**
 * Vân tay của một định nghĩa bằng chứng.
 *
 * Chuẩn hoá bằng cách sắp xếp khoá: cùng một định nghĩa viết theo thứ tự field
 * khác nhau vẫn phải ra cùng một hash, nếu không mọi lần format lại YAML đều
 * làm fact thành stale một cách vô cớ.
 */
export function definitionHash(def: unknown): string {
  return sha256(canonical(def));
}

/**
 * Trường mô tả ĐỐI TƯỢNG được đo, không phải PHÉP ĐO.
 *
 * Chúng được theo dõi riêng (`model_changed`, `prompt_changed`, `dataset_changed`)
 * nên phải loại khỏi vân tay định nghĩa — nếu không `definition_changed` sẽ nuốt
 * mất chẩn đoán cụ thể, mà chẩn đoán cụ thể mới là thứ nói cho người đọc biết
 * phải làm gì.
 */
const FINGERPRINT_FIELDS = ["model", "prompt", "dataset"] as const;

/**
 * Vân tay của PHÉP KIỂM: lệnh chạy, kỳ vọng, ngưỡng, guard.
 * Lệch ⇒ kết quả cũ đo một phép kiểm khác.
 */
export function defHash(definition: unknown): string {
  if (definition === null || typeof definition !== "object" || Array.isArray(definition)) {
    return definitionHash(definition);
  }
  const stripped: Record<string, unknown> = { ...(definition as Record<string, unknown>) };
  for (const field of FINGERPRINT_FIELDS) delete stripped[field];
  return definitionHash(stripped);
}

function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** sha nội dung file; chuỗi rỗng nếu không đọc được (file chưa có cũng là một trạng thái). */
export async function fileHash(path: string): Promise<string> {
  try {
    return sha256(await readFile(path, "utf8"));
  } catch {
    return "";
  }
}

export function ledgerPath(root: string): string {
  return ganasPath(root, LEDGER_FILE);
}

export async function appendEntry(root: string, entry: LedgerEntry): Promise<void> {
  const file = ledgerPath(root);
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(entry) + "\n", "utf8");
}

/** Đọc toàn bộ sổ cái. Dòng hỏng bị bỏ qua chứ không làm sập — sổ cái là file cộng dồn. */
export async function readLedger(root: string): Promise<LedgerEntry[]> {
  const file = ledgerPath(root);
  if (!existsSync(file)) return [];
  const raw = await readFile(file, "utf8");
  const out: LedgerEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as LedgerEntry;
      if (parsed.target && parsed.at) out.push(parsed);
    } catch {
      /* dòng hỏng: bỏ qua */
    }
  }
  return out;
}

/** Chỉ mục theo target, giữ thứ tự xuất hiện (cũ → mới). */
export function indexByTarget(entries: readonly LedgerEntry[]): Map<string, LedgerEntry[]> {
  const map = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    const list = map.get(e.target);
    if (list) list.push(e);
    else map.set(e.target, [e]);
  }
  return map;
}

export function lastFor(
  index: Map<string, LedgerEntry[]>,
  target: string,
): LedgerEntry | undefined {
  const list = index.get(target);
  return list?.[list.length - 1];
}

export function historyFor(
  index: Map<string, LedgerEntry[]>,
  target: string,
  k = 5,
): LedgerEntry[] {
  return (index.get(target) ?? []).slice(-k);
}

/** Tìm bản ghi khớp đúng thời điểm — dùng để đối chiếu `last_verified_at`. */
export function entryAt(
  index: Map<string, LedgerEntry[]>,
  target: string,
  at: string,
): LedgerEntry | undefined {
  return (index.get(target) ?? []).find((e) => e.at === at);
}

/** Bối cảnh máy/commit lúc chạy — để biết một kết quả đến từ đâu. */
export async function runContext(
  root: string,
  by: string,
): Promise<Pick<LedgerEntry, "by" | "git" | "host">> {
  const git = await runShell("git rev-parse --short HEAD", { cwd: root, timeoutMs: 5000 });
  return {
    by,
    ...(git.code === 0 ? { git: git.stdout.trim() } : {}),
    host: hostname(),
  };
}
