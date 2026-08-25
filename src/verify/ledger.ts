import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";

import { DIRS, ganasPath, LEDGER_FILE } from "../graph/paths.js";
import type { LedgerEntry } from "../graph/types.js";
import { runShell } from "../util/exec.js";
import { exists } from "../util/fsprobe.js";
import { withFileLock } from "../util/lock.js";

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

// `LEDGER_FILE`, `LedgerEntry`, `LedgerResult`, `LEDGER_RESULT` khai báo ở
// `graph/paths.ts` và `graph/types.ts` (khối lá `M-graph-base`, T-042). Đừng
// tái xuất lại từ đây: tái xuất dựng lại đúng hai cạnh khối mà T-044/T-045 vừa gỡ.

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

/** Chain chưa từng bắt đầu, hoặc vừa migrate — không có gì trước đó để giữ dấu vết. */
export const CHAIN_GENESIS = "0".repeat(64);

/** Nội dung một dòng, trừ hai trường chain — đó là thứ được băm, không phải chính chúng. */
function chainContent(entry: LedgerEntry): Record<string, unknown> {
  const content: Record<string, unknown> = { ...entry };
  delete content["seq"];
  delete content["prev_hash"];
  return content;
}

/** Hash chain sau khi cộng thêm một dòng vào hash chain tính tới trước nó. */
function chainStep(runningHash: string, entry: LedgerEntry): string {
  return createHash("sha256")
    .update(runningHash + canonical(chainContent(entry)))
    .digest("hex");
}

/**
 * Hash chain tính TỚI HẾT danh sách entry đã cho — dùng làm `prev_hash` cho
 * dòng kế tiếp sẽ ghi. Dòng chưa có `prev_hash` (trước khi có hash-chain) bị
 * bỏ qua, không tính vào chain — chain coi như bắt đầu lại từ dòng có
 * `prev_hash` đầu tiên.
 */
function runningHashOf(entries: readonly LedgerEntry[]): string {
  let running = CHAIN_GENESIS;
  for (const e of entries) {
    if (e.prev_hash === undefined) continue;
    running = chainStep(running, e);
  }
  return running;
}

/**
 * TTL của khoá sổ cái — MILI GIÂY, không phải phút: khoá chỉ sống trong đúng
 * một lượt đọc-tính-ghi của `appendEntry`. Xem `withFileLock` (`util/lock.ts`).
 */
const LEDGER_LOCK_TTL_MS = 5000;

/**
 * Khoá mutex của sổ cái — đặt cạnh sổ cái, tên suy từ chính `LEDGER_FILE`,
 * cùng khuôn `iceboxLockFile` (`commands/icebox.ts`). Nằm trong `.locks/` vì
 * đó là `LOCAL_ONLY` (`graph/paths.ts`): file khoá là rác tạm của một máy, sổ
 * cái mới là thứ commit vào git.
 */
function ledgerLockFile(root: string): string {
  return ganasPath(root, DIRS.locks, `${LEDGER_FILE.replace(/[\\/]/g, "_")}.lock`);
}

/**
 * Cộng một dòng vào sổ cái, DƯỚI KHOÁ.
 *
 * Phần đọc-tính-ghi phải nguyên tử với nhau, không chỉ phần ghi: `seq` và
 * `prev_hash` của dòng mới đều suy từ TOÀN BỘ sổ cái đọc được ngay trước đó.
 * Không khoá thì hai `ganas verify` chạy chồng nhau đọc cùng một trạng thái
 * rồi cùng ghi — dòng sau nhận `seq` trùng dòng trước và `prev_hash` tính
 * thiếu một dòng, tức ĐỨT chuỗi hash. Mà chuỗi hash chính là thứ duy nhất
 * chứng minh sổ cái không bị sửa tay, nên đứt nó là mất luôn giá trị của cả
 * cơ chế (ICE-014; `appendFile` bản thân nó nguyên tử ở tầng ghi, và đúng vì
 * thế mà lỗ đua này không bao giờ lộ ra thành file rách — nó lộ ra thành một
 * sổ cái đọc được nhưng không còn chứng minh được gì).
 */
export async function appendEntry(root: string, entry: LedgerEntry): Promise<void> {
  const file = ledgerPath(root);
  await mkdir(dirname(file), { recursive: true });

  await withFileLock(ledgerLockFile(root), LEDGER_LOCK_TTL_MS, async () => {
    const existing = await readLedger(root);
    const lastSeq = existing.length > 0 ? (existing[existing.length - 1]!.seq ?? 0) : 0;
    const chained: LedgerEntry = {
      ...entry,
      seq: lastSeq + 1,
      prev_hash: runningHashOf(existing),
    };

    await appendFile(file, JSON.stringify(chained) + "\n", "utf8");
  });
}

export interface ChainVerdict {
  ok: boolean;
  /** Chỉ mục (0-based) của entry đầu tiên đứt chain — chỉ có khi `ok: false`. */
  brokenAt?: number;
}

/**
 * Đi lại toàn bộ sổ cái, tính lại hash-chain, đối chiếu với `prev_hash` đã
 * ghi. Đứt ở đâu là entry đó (hoặc một trong các entry TRƯỚC nó) đã bị sửa,
 * xoá, hoặc đảo thứ tự sau khi ghi — sổ cái là append-only nên bất kỳ thay
 * đổi nào sau khi ghi cũng phải để lại dấu vết ở đây.
 */
export function verifyChain(entries: readonly LedgerEntry[]): ChainVerdict {
  let running = CHAIN_GENESIS;
  let started = false;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (!started) {
      if (e.prev_hash === undefined) continue; // vẫn ở đoạn trước khi có hash-chain
      started = true;
    }
    if (e.prev_hash !== running) return { ok: false, brokenAt: i };
    running = chainStep(running, e);
  }
  return { ok: true };
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
  if (!exists(file)) return [];
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
