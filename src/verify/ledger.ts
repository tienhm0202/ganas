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
  /** Vân tay ĐỊNH NGHĨA + PHÁT BIỂU đã chạy. Lệch ⇒ đo một thứ khác. */
  def: string;
  result: LedgerResult;
  /**
   * Mutation test đã chứng minh probe CÓ THỂ fail chưa.
   *
   * Không có trường này thì một dòng `pass` do `--no-mutation` sinh ra không
   * phân biệt được với dòng do lần chạy đã qua bóp méo sinh ra — và
   * `needsRun()` thấy `pass` là bỏ qua, nên probe rỗng ruột thành `pass` vĩnh
   * viễn trong sổ cái. Bằng chứng mạnh nhất mà hệ có lại là thứ duy nhất không
   * được lưu.
   *
   * Vắng mặt = lần chạy cũ, trước khi trường này tồn tại.
   */
  proof?: "proven" | "unproven";
  /**
   * Vân tay NỘI DUNG của tập file phụ thuộc lúc chạy.
   *
   * Trước P2 N24 độ cũ tính bằng `mtime`, nên `touch -d '2020-01-01' <file>`
   * đảo một fact từ `stale` về `fresh` mà không sửa một dòng code nào — và
   * `touch` không nằm trong danh sách lệnh bị hook chặn. Hash nội dung thì
   * không lùi được bằng cách chỉnh đồng hồ.
   *
   * Vắng mặt = bản ghi cũ; khi đó rơi về so `mtime` như trước.
   */
  deps?: string;

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
 * Vân tay của PHÉP KIỂM **và** ĐIỀU ĐƯỢC KHẲNG ĐỊNH.
 *
 * `statement` bắt buộc nằm trong vân tay, và đây là chỗ dễ làm sai nhất của cả
 * hệ. Trước P2 N21 vân tay chỉ gồm định nghĩa probe, nên đường lách này sạch
 * tuyệt đối:
 *
 *   1. viết fact "file src/a.ts tồn tại" + probe `test -f src/a.ts`
 *   2. `ganas verify` → pass thật, sổ cái có một dòng hợp lệ
 *   3. sửa MỖI dòng `statement` thành "toàn bộ pipeline đã kiểm chứng
 *      end-to-end trên production", giữ nguyên probe
 *   4. freshness vẫn `fresh`, `ganas validate` sạch không một lỗi
 *
 * Kết quả: một dòng sổ cái có thật, một probe có thật, chứng nhận cho một phát
 * biểu hoàn toàn khác. Sổ cái niêm phong PHÉP ĐO mà không niêm phong ĐIỀU ĐƯỢC
 * ĐO thì nó chỉ biến ảo giác thành ảo giác CÓ DẤU VẾT.
 *
 * Lệch ⇒ kết quả cũ đo một phép kiểm khác, hoặc nói về một điều khác.
 */
export function defHash(definition: unknown, statement?: string): string {
  const base =
    definition === null || typeof definition !== "object" || Array.isArray(definition)
      ? definition
      : (() => {
          const stripped: Record<string, unknown> = { ...(definition as Record<string, unknown>) };
          for (const field of FINGERPRINT_FIELDS) delete stripped[field];
          return stripped;
        })();
  return definitionHash({ def: base, statement: statement ?? null });
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

/** Số dòng hỏng của lần `readLedger` gần nhất, theo gốc dự án. */
const corruptLines = new Map<string, number>();

/** Bao nhiêu dòng sổ cái không đọc được ở lần nạp gần nhất. */
export function ledgerCorruption(root: string): number {
  return corruptLines.get(root) ?? 0;
}

/**
 * Đọc toàn bộ sổ cái. Dòng hỏng KHÔNG làm sập (sổ cái là file cộng dồn, một
 * dòng rách không được chặn cả phiên) — nhưng cũng KHÔNG được nuốt im lặng.
 *
 * Bỏ qua không tiếng động nghĩa là một người sửa lịch sử bằng cách làm hỏng
 * đúng những dòng bất lợi sẽ không để lại dấu vết nào. Đếm lại và để validator
 * nêu ra: sổ cái là gốc tin cậy, hỏng ở đó phải nhìn thấy được.
 */
export async function readLedger(root: string): Promise<LedgerEntry[]> {
  const file = ledgerPath(root);
  corruptLines.set(root, 0);
  if (!existsSync(file)) return [];
  const raw = await readFile(file, "utf8");
  const out: LedgerEntry[] = [];
  let bad = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as LedgerEntry;
      if (parsed.target && parsed.at) out.push(parsed);
      else bad++;
    } catch {
      bad++;
    }
  }
  corruptLines.set(root, bad);
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
