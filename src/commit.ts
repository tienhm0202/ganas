import type { GateResult } from "./gate.js";
import { DIRS, GANAS_DIR } from "./graph/paths.js";
import type { Graph } from "./graph/types.js";
import type { Task } from "./model/index.js";
import { LEDGER_FILE } from "./verify/ledger.js";

/**
 * Dựng commit message TỪ dữ liệu đã kiểm chứng, không phải văn xuôi tự bịa.
 *
 * "Làm việc gì" lấy từ chính spine (task/design/goal). "Test thế nào" lấy
 * nguyên kết quả `evaluateGate` — chỉ gọi được hàm này sau khi gate đã `ok`,
 * nên mọi mục hiện ra ở đây đều THẬT SỰ đã chấm qua, không phải khai suông.
 *
 * Không bao giờ có dòng ghi công AI/trợ lý — đây là quy ước cứng của ganas,
 * không phải tuỳ chọn cấu hình.
 */
export function buildCommitMessage(graph: Graph, task: Task, gate: GateResult): string {
  const lines: string[] = [`${task.id}: ${task.title}`, "", "Điều kiện hoàn thành:"];

  for (const r of gate.results) {
    const mark = r.status === "pass" ? "✓" : r.status === "pending_human" ? "…" : "✗";
    lines.push(`  ${mark} ${r.label}`);
  }

  const design = graph.designs.get(task.implements)?.value;
  const context = [
    `phục vụ ${task.serves.join(", ")}`,
    design ? `design ${design.id} — ${design.title}` : `design ${task.implements}`,
    `phạm vi ${task.scope}`,
  ].join(" · ");

  lines.push("", context);

  return lines.join("\n") + "\n";
}

/* ------------------------------------------------------------------------- *
 * Đường dẫn nhắc tới trong exit_contract
 * ------------------------------------------------------------------------- */

/**
 * Tách chuỗi lệnh thành token, tôn trọng nháy đơn/kép.
 *
 * Không phải parser shell đầy đủ — chỉ đủ để nhặt ra đường dẫn. Chỗ quan trọng
 * là chuỗi trong nháy phải ra MỘT token: `-t 'tên test'` mà tách theo khoảng
 * trắng thì `test` thành một token và bị nhầm là đường dẫn.
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
function stripOperators(token: string): string {
  return token.replace(/^[0-9]*[<>|&;()]+/, "").replace(/[;|&)]+$/, "");
}

/**
 * Token này có dáng một đường dẫn không: có `/`, hoặc có đuôi file.
 *
 * Cố tình lỏng — người gọi còn lọc lại bằng "file có thật trên đĩa không", nên
 * đoán thừa (URL, `2>/dev/null`) không gây hại, mà đoán thiếu thì đúng lỗi mục 1.
 */
export function looksLikePath(token: string): boolean {
  if (!token || token.startsWith("-")) return false;
  return token.includes("/") || /\.[A-Za-z0-9]+$/.test(token);
}

export interface ContractPathRef {
  /** Đường dẫn tương đối repo. */
  path: string;
  /** Tiêu chí đã nhắc tới nó — đưa vào cảnh báo để người biết vì sao file này cần có. */
  from: string;
}

/**
 * Đường dẫn mà `exit_contract` của task nhắc tới.
 *
 * Đây là lỗ hổng của bản cũ: một tiêu chí `kind: command` chạy
 * `bun test tests/e2e/domain.test.ts` trong khi khối chỉ khai
 * `paths: ["src/domain/core/**"]` thì file test KHÔNG vào commit — gate xanh ở
 * máy tác giả, đỏ ở mọi máy khác. Chính thứ ganas tồn tại để chặn.
 */
export function contractPathRefs(task: Task): ContractPathRef[] {
  const refs: ContractPathRef[] = [];
  const seen = new Set<string>();

  const add = (raw: string, from: string): void => {
    const path = raw.replace(/^\.\//, "");
    if (!path || seen.has(path)) return;
    seen.add(path);
    refs.push({ path, from });
  };

  for (const c of task.exit_contract) {
    if (c.kind === "command") {
      for (const token of tokenizeShell(c.run)) {
        const cleaned = stripOperators(token);
        if (looksLikePath(cleaned)) add(cleaned, `lệnh \`${c.run}\``);
      }
    } else if (c.kind === "artifact") {
      add(c.path, `file \`${c.path}\``);
    }
  }
  return refs;
}

/** Như `contractPathRefs` nhưng chỉ lấy đường dẫn. */
export function contractPaths(task: Task): string[] {
  return contractPathRefs(task).map((r) => r.path);
}

/* ------------------------------------------------------------------------- *
 * Chọn đường dẫn để stage
 * ------------------------------------------------------------------------- */

/**
 * Pathspec code nên `git add` cho task này: code của mọi khối task chạm tới,
 * cộng đường dẫn mà chính `exit_contract` chạy.
 *
 * KHÔNG còn trả về `.ganas` — xem `ownsGanasFile`. Stage cả thư mục là lý do
 * commit mang nhãn một task lại chứa graph của task khác, và lịch sử graph
 * chính là thứ ganas dùng để trả lời "vì sao chỗ này thành ra thế".
 */
export function pathsToStage(task: Task, graph: Graph): string[] {
  const patterns = new Set<string>();
  for (const moduleId of task.touches) {
    const mod = graph.modules.get(moduleId)?.value;
    for (const p of mod?.paths ?? []) patterns.add(p);
  }
  for (const p of contractPaths(task)) patterns.add(p);
  return [...patterns];
}

const YAML_EXT = /\.ya?ml$/;

/**
 * File `.ganas/` này có thuộc task không.
 *
 * Quyền sở hữu đi theo ĐÚNG những liên kết task tự khai — file task đó, khối
 * trong `touches`, fact trong `context_contract.facts`, và design/goal/phạm vi
 * mà nó khai `implements`/`serves`/`scope`. Nhờ vậy `.ganas/designs/D-003.yaml`
 * của một loạt task khác không lọt vào commit mang nhãn task này, mà bộ khung
 * spine của chính task thì vẫn đi cùng nó.
 *
 * Cố tình KHÔNG quét theo `scope` cho fact/claim: fact cùng phạm vi là của cả
 * phạm vi, lấy theo đó thì lại nuốt đúng thứ cần tách ra.
 *
 * Cố tình KHÔNG nhận `config.yaml`: mức cưỡng chế là quyết định của người, ở
 * tầm dự án chứ không phải việc của một task — nó đáng có commit riêng.
 *
 * File không thuộc nhóm nào thì để lại và BÁO cho người, đừng nuốt im.
 */
export function ownsGanasFile(task: Task, relPath: string): boolean {
  const p = relPath.split("\\").join("/").replace(/^\.\//, "");
  const prefix = `${GANAS_DIR}/`;
  if (!p.startsWith(prefix)) return false;
  const inner = p.slice(prefix.length);

  if (inner === LEDGER_FILE) return true;

  const stem = inner.replace(YAML_EXT, "");
  return (
    stem === `${DIRS.tasks}/${task.id}` ||
    stem === `${DIRS.designs}/${task.implements}` ||
    stem === `${DIRS.scopes}/${task.scope}` ||
    task.serves.some((g) => stem === `${DIRS.goals}/${g}`) ||
    task.touches.some((m) => stem === `${DIRS.modules}/${m}`) ||
    task.context_contract.facts.some((f) => stem === `${DIRS.facts}/${f}`)
  );
}
