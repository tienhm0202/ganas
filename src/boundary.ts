import { DIRS, GANAS_DIR } from "./graph/paths.js";
import type { Graph } from "./graph/types.js";
import type { Task } from "./model/index.js";
import { matchesAny } from "./util/glob.js";
import { looksLikePath, stripOperators, tokenizeShell } from "./util/shell.js";
import { LEDGER_FILE } from "./verify/ledger.js";

/* ------------------------------------------------------------------------- *
 * Đường dẫn nhắc tới trong exit_contract
 * ------------------------------------------------------------------------- */

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
 * Ranh giới code của task
 * ------------------------------------------------------------------------- */

/**
 * Ranh giới CODE của một task: code của mọi khối task chạm tới, cộng đường dẫn
 * mà chính `exit_contract` chạy.
 *
 * KHÔNG trả về `.ganas` — xem `ownsGanasFile`. Stage cả thư mục là lý do commit
 * mang nhãn một task lại chứa graph của task khác, và lịch sử graph chính là
 * thứ ganas dùng để trả lời "vì sao chỗ này thành ra thế".
 */
export function taskBoundary(task: Task, graph: Graph): string[] {
  const patterns = new Set<string>();
  for (const moduleId of task.touches) {
    const mod = graph.modules.get(moduleId)?.value;
    for (const p of mod?.paths ?? []) patterns.add(p);
  }
  for (const p of contractPaths(task)) patterns.add(p);
  return [...patterns];
}

/* ------------------------------------------------------------------------- *
 * Đối chiếu file đã sửa với ranh giới
 * ------------------------------------------------------------------------- */

/** Pattern có ký tự glob thì để nguyên; không có thì nó là đường dẫn trần. */
const GLOB_CHARS = /[*?[\]{}]/;

/**
 * Pathspec của git → pattern cho `matchesAny`.
 *
 * Hai thứ này KHÔNG cùng ngữ nghĩa, và chỗ lệch đã đo được:
 *
 *   pathspec `src`   → git nhận `src/x.ts`, `matchesAny` TRẢ VỀ FALSE
 *   pathspec `src/`  → git nhận `src/x.ts`, `matchesAny` TRẢ VỀ FALSE
 *   pattern `./src/**` → git nhận `src/x.ts`, `matchesAny` TRẢ VỀ FALSE
 *
 * Hai ca đầu tới từ `contractPaths`: `looksLikePath` nhận mọi token có `/`, nên
 * `npx vitest run src/` cào ra đúng chuỗi `src/`. Ca thứ ba tới từ YAML khối —
 * `matchesAny` chỉ chuẩn hoá `./` ở phía ĐƯỜNG DẪN, không ở phía pattern.
 *
 * Không bù ba chỗ này thì file nằm gọn trong ranh giới vẫn bị báo là ra ngoài.
 * Mà cảnh báo sai một lần là cảnh báo bị tắt vĩnh viễn — nên ở đây thà nhận
 * rộng còn hơn báo nhầm.
 *
 * Cố ý chỉ chuẩn hoá TẠI ĐÂY chứ không sửa `matchesAny`: hàm đó còn phục vụ
 * `depends_on`, `zone.paths` và `commands/scope.ts`, đổi ngữ nghĩa của nó là
 * việc riêng, đáng có test riêng.
 */
export function matchPatterns(boundary: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of boundary) {
    const p = raw.split("\\").join("/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (!p) continue;
    out.add(p);
    // Đường dẫn trần vừa có thể là chính file đó, vừa có thể là cả cây con —
    // git không phân biệt, ta cũng không được phân biệt.
    if (!GLOB_CHARS.test(p)) out.add(`${p}/**`);
  }
  return [...out];
}

/**
 * File phiên đã sửa mà nằm NGOÀI ranh giới code của task.
 *
 * Chỉ để cảnh báo, không bao giờ chặn và không đổi mã thoát — cùng hạng với
 * `alreadyGreen`: nói ra một sự thật khó chịu rồi để người quyết.
 *
 * Ba quy ước, mỗi cái có lý do riêng:
 *
 * - **`.ganas/` luôn coi là trong.** Đây là ranh giới CODE. Phần kho tri thức
 *   đã có chủ hiểu việc hơn: `ownsGanasFile` cộng danh sách `foreign` mà
 *   `ganas commit` dựng từ `git status` thật. Báo ở đây là in trùng.
 * - **Ranh giới rỗng ⇒ không kết luận gì.** `touches: []` và `exit_contract`
 *   không nhắc đường dẫn nào đều hợp lệ; lúc đó MỌI file đều "ngoài" và cảnh
 *   báo thành bão. Cùng nguyên tắc `graph/select.ts`: không biết nó đụng đâu
 *   thì không kết luận được.
 * - **File mới tạo không được đặc cách.** Hook không phân biệt được Write một
 *   file mới với Edit một file cũ, và agent tự đẻ ra `src/moi/` ngoài mọi khối
 *   đã khai đúng là thứ hàm này sinh ra để bắt. Đừng "sửa" chỗ này.
 *
 * Không lọc theo `existsSync`: file viết ra rồi xoá vẫn là việc đã làm ngoài
 * ranh giới, và thêm lời gọi fs vào đường nóng của CLI cho một cảnh báo là đắt.
 */
export function outsideBoundary(
  task: Task,
  graph: Graph,
  touched: readonly string[],
): string[] {
  const boundary = taskBoundary(task, graph);
  if (boundary.length === 0) return [];

  const patterns = matchPatterns(boundary);
  const out = new Set<string>();

  for (const raw of touched) {
    const p = raw.split("\\").join("/").replace(/^\.\//, "");
    if (!p) continue;
    if (p === GANAS_DIR || p.startsWith(`${GANAS_DIR}/`)) continue;
    if (matchesAny(p, patterns)) continue;
    out.add(p);
  }

  return [...out].sort();
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
