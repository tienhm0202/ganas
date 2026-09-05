import { DIRS, GANAS_DIR, LEDGER_FILE } from "./graph/paths.js";
import type { Graph } from "./graph/types.js";
import type { Freshness, Task } from "./model/index.js";
import { TOUCHED_PATHS_CAP } from "./state.js";
import { matchesAny } from "./util/glob.js";
import { looksLikePath, stripOperators, tokenizeShell } from "./util/shell.js";

/* ------------------------------------------------------------------------- *
 * Đường dẫn nhắc tới trong exit_contract
 * ------------------------------------------------------------------------- */

export interface ContractPathRef {
  /** Đường dẫn tương đối repo. */
  path: string;
  /** Tiêu chí đã nhắc tới nó — đưa vào cảnh báo để người biết vì sao file này cần có. */
  from: string;
}

/** Đường dẫn mà một lệnh shell chạm tới — dùng chung cho tiêu chí `command`
 * lẫn cho `run` của verification mà tiêu chí `verification` trỏ tới, để chỉ
 * có MỘT bộ rút đường dẫn từ chuỗi lệnh trong cả file. */
function pathsFromCommand(run: string): string[] {
  const out: string[] = [];
  for (const token of tokenizeShell(run)) {
    const cleaned = stripOperators(token);
    if (looksLikePath(cleaned)) out.push(cleaned);
  }
  return out;
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
      for (const p of pathsFromCommand(c.run)) add(p, `lệnh \`${c.run}\``);
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
 * Đường dẫn mà PROBE của verification mà exit_contract trỏ tới chạy
 * ------------------------------------------------------------------------- */

/**
 * Đường dẫn mà `run` của verification (hoặc fact) mà tiêu chí
 * `kind: verification` trỏ tới thật sự chạy.
 *
 * Đây là lỗ hổng thứ hai, khác lỗ hổng của `contractPathRefs`: tiêu chí
 * `{ kind: "verification", target: "M-a/V-a-probe" }` không tự mang lệnh — nó
 * TRỎ tới một bằng chứng đã khai sẵn trong `graph.modules`/`graph.facts`, và
 * chính bằng chứng đó mới có `run`. Ba lần vấp thật (T-065, T-061, T-062) đều
 * là dạng này: sửa test của khối là việc bình thường khi sửa khối, nhưng
 * `taskBoundary` chưa từng đọc `verify.run` nên không biết file test đó tồn
 * tại.
 *
 * `target` có bốn dạng, phân biệt bằng tiền tố (không thể lẫn — `M-`, `F-`,
 * `D-` là ba bảng chữ cái ID rời nhau, xem `ID_PATTERNS` ở `model/common.ts`):
 *
 *  - `M-x`      — MỌI verification của khối `M-x`.
 *  - `M-x/V-y`  — đúng một verification, khớp bằng `moduleTargets()`
 *    (`src/verify/run.ts`) dựng id theo khuôn `${module.id}/${v.id}`.
 *  - `F-xxx`    — fact; probe của fact cũng là một lệnh chạy thật (`f.verify`
 *    là `zProbe`), gộp luôn cho nhất quán — không có gì phân biệt fact với
 *    module ở khía cạnh "lệnh này có thể chạm file ngoài `paths`" cả.
 *  - `D-x/A-y` (và `D-x` trần) — BẢN VẼ của một chặng, khoá do
 *    `artifactTargets()` (`src/verify/run.ts`) dựng theo khuôn
 *    `${design.id}/${artifact.id}`. Probe của bản vẽ là lệnh đối chiếu bản vẽ
 *    với code thật, nên nó cũng chạm file — thiếu nhánh này thì task khai
 *    `{ kind: verification, target: "D-x/A-y" }` để file đó rơi ra ngoài
 *    commit, đúng lớp lỗi mà cả hàm này sinh ra để chặn.
 *
 * Target không khớp gì trong graph (khối/fact/verification không tồn tại) thì
 * bỏ qua lặng lẽ — đó là việc của `ganas validate` (spine), không phải của
 * ranh giới code.
 */
export function verificationPathRefs(task: Task, graph: Graph): ContractPathRef[] {
  const refs: ContractPathRef[] = [];
  const seen = new Set<string>();

  const add = (raw: string, from: string): void => {
    const path = raw.replace(/^\.\//, "");
    if (!path || seen.has(path)) return;
    seen.add(path);
    refs.push({ path, from });
  };

  const addFromRun = (run: string | undefined, label: string): void => {
    if (!run) return;
    for (const p of pathsFromCommand(run)) add(p, `bằng chứng \`${label}\``);
  };

  for (const c of task.exit_contract) {
    if (c.kind !== "verification") continue;
    const target = c.target;

    if (target.startsWith("F-")) {
      addFromRun(graph.facts.get(target)?.value.verify.run, target);
      continue;
    }

    const slash = target.indexOf("/");
    const ownerId = slash === -1 ? target : target.slice(0, slash);

    const design = graph.designs.get(ownerId)?.value;
    if (design) {
      if (slash === -1) {
        for (const a of design.artifacts) addFromRun(a.probe?.run, `${ownerId}/${a.id}`);
      } else {
        const artifactId = target.slice(slash + 1);
        const a = design.artifacts.find((a) => a.id === artifactId);
        if (a) addFromRun(a.probe?.run, target);
      }
      continue;
    }

    const mod = graph.modules.get(ownerId)?.value;
    if (!mod) continue;

    if (slash === -1) {
      for (const v of mod.verify) addFromRun(v.run, `${ownerId}/${v.id}`);
    } else {
      const v = mod.verify.find((v) => `${ownerId}/${v.id}` === target);
      if (v) addFromRun(v.run, target);
    }
  }
  return refs;
}

/**
 * Đường dẫn mà RUN của MỌI verification thuộc khối trong `touches` chạy —
 * không chỉ verification mà `exit_contract` TRỎ TỚI (đó là việc của
 * `verificationPathRefs` ở trên).
 *
 * Đây là nhánh 1 của D-019, lỗ hổng còn hở sau T-067: một khối thường khai
 * NHIỀU verification, còn `exit_contract` của một task chỉ trỏ vài cái trong
 * số đó. Ca gốc: `M-workflow` gom `commit/flow/gate/handoff/prune`, còn
 * `V-workflow-commit` chỉ chạy `test/commit-staging.test.ts` — nên
 * `test/prune.test.ts` không có đường nào vào ranh giới, dù sửa nó là việc
 * bình thường khi sửa khối đó. Khối đã khai `verify` nào thì file mà
 * verification ấy CHẠY là phần của khối, bất kể `exit_contract` của task này
 * có nhắc tới nó hay không.
 *
 * Dùng lại `pathsFromCommand` — cùng một bộ rút đường dẫn với
 * `verificationPathRefs`, không viết bộ thứ hai.
 *
 * CHỈ gộp `kind: probe`/`kind: eval`, KHÔNG gộp `kind: contract` — đo thật
 * trên chính repo này (so `taskBoundary` của 73 task `done` trước/sau bản vá)
 * cho thấy `kind: contract` là nguồn DUY NHẤT gây rò khối: `run` của một
 * contract luôn `grep` cả file phía khối NGUỒN lẫn file phía khối ĐÍCH (`to`)
 * để so cổng — vd `V-commands-to-mcp` của `M-commands` grep thẳng
 * `src/mcp/server.ts`, kéo file của `M-mcp` vào ranh giới của một task chỉ
 * `touches: [M-commands]`. Đây đúng lớp rủi ro ICE-036: `ganas commit` git-add
 * nhầm file khối khác nếu nó cũng đang bị sửa trong cùng working tree.
 * `probe`/`eval` không có vấn đề này — `run` của chúng là lệnh test THẬT SỰ
 * chạy trên chính khối, không grep chéo sang khối khác.
 */
function moduleVerifyPathRefs(task: Task, graph: Graph): ContractPathRef[] {
  const refs: ContractPathRef[] = [];
  const seen = new Set<string>();

  for (const moduleId of task.touches) {
    const mod = graph.modules.get(moduleId)?.value;
    for (const v of mod?.verify ?? []) {
      if (v.kind !== "probe" && v.kind !== "eval") continue;
      for (const raw of pathsFromCommand(v.run)) {
        const path = raw.replace(/^\.\//, "");
        if (!path || seen.has(path)) continue;
        seen.add(path);
        refs.push({ path, from: `bằng chứng \`${moduleId}/${v.id}\`` });
      }
    }
  }
  return refs;
}

/* ------------------------------------------------------------------------- *
 * Ranh giới code của task
 * ------------------------------------------------------------------------- */

/**
 * Ranh giới CODE của một task: code của mọi khối task chạm tới, cộng đường dẫn
 * mà chính `exit_contract` chạy — TRỰC TIẾP (tiêu chí `command`/`artifact`) lẫn
 * GIÁN TIẾP qua một bằng chứng đã khai sẵn (tiêu chí `verification`, xem
 * `verificationPathRefs`) — cộng đường dẫn mà MỌI verification khác của khối
 * trong `touches` chạy, dù `exit_contract` không nhắc tới (xem
 * `moduleVerifyPathRefs`, nhánh 1 của D-019).
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
  for (const r of verificationPathRefs(task, graph)) patterns.add(r.path);
  for (const r of moduleVerifyPathRefs(task, graph)) patterns.add(r.path);
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

/**
 * In cảnh báo "file ngoài ranh giới code" thành chữ.
 *
 * `gate` và `commit` đều cần đưa `outsideBoundary` ra cho người đọc, và cả hai
 * phải nói CÙNG một khối chữ — tách hàm này ra một chỗ để hai nơi không lỡ
 * nói lệch nhau khi một bên sửa còn bên kia quên.
 *
 * Chuỗi trả về bắt đầu và kết thúc bằng `\n`, cùng quy ước với
 * `reportBaseline` ở `src/commands/commit.ts` — để nối thẳng vào chuỗi báo
 * cáo khác mà không phải tự thêm dòng trống ở nơi gọi.
 */
export function formatBoundaryWarning(
  taskId: string,
  boundary: readonly string[],
  touched: readonly string[],
  outside: readonly string[],
): string {
  if (outside.length > 0) {
    let out =
      `\n⚠ ${outside.length} file phiên này đã sửa nằm NGOÀI ranh giới code của ${taskId}:\n` +
      outside.map((p) => `    ${p}`).join("\n") +
      `\n  Ranh giới của ${taskId}: ${boundary.join(", ")}\n` +
      "  (từ `touches` + đường dẫn mà `exit_contract` chạy)\n" +
      "  `ganas commit` KHÔNG stage những file này — chúng ở lại working tree,\n" +
      "  không nằm trong commit nào và không ai nghiệm thu.\n" +
      "  Hoặc khai thêm khối vào `touches`, hoặc tách phần lạc ra task riêng.\n";
    if (touched.length >= TOUCHED_PATHS_CAP) {
      out += `  (đã ghi tối đa ${TOUCHED_PATHS_CAP} đường dẫn — có thể còn file khác.)\n`;
    }
    return out;
  }

  if (boundary.length === 0 && touched.length > 0) {
    return (
      `\n⚠ ${taskId} chưa khai \`touches\` và \`exit_contract\` không nhắc đường dẫn nào,\n` +
      `  nên KHÔNG có ranh giới code để đối chiếu — ${touched.length} file đã sửa đi qua mà không\n` +
      "  ai kiểm được chúng có thuộc task này không.\n"
    );
  }

  return "";
}

/**
 * Cảnh báo tóm tắt: task khai tier `scribe`/`verifier` mà CẢ phiên không có
 * lượt sửa nào từ sub-agent — bổ sung cho lần nhắc sớm ở `postToolUse`
 * (`checkDispatchNudge` trong hooks/handlers.ts), KHÔNG thay thế nó. Lần nhắc
 * sớm nổ đúng lúc còn kịp đổi hành vi (lượt sửa đầu tiên); đây là bản tóm tắt
 * lúc sắp tuyên bố xong, cho người đọc thấy lại kết luận.
 *
 * Cùng khuôn `formatBoundaryWarning`: hàm thuần, trả `""` khi không có gì cần
 * nói, chuỗi khác rỗng bắt đầu và kết thúc bằng `\n`.
 */
export function formatDispatchWarning(
  taskId: string,
  tier: Task["model"],
  subagentTouched: boolean,
): string {
  if (tier !== "scribe" && tier !== "verifier") return "";
  if (subagentTouched) return "";

  return (
    `\n⚠ ${taskId} khai tier \`${tier}\` nhưng cả phiên không có lượt sửa nào từ sub-agent —\n` +
    `  có vẻ phiên chính (model mạnh nhất) đã tự làm việc cơ học/kiểm chứng thay vì giao việc.\n` +
    `  Xem mục "Giao việc" trong brief để giao đúng cho sub-agent.\n`
  );
}

/**
 * Hai trường mà cảnh báo lệch bản vẽ cần đọc từ một dòng độ tươi.
 *
 * Khai CẤU TRÚC chứ không nhập `VerificationState` (`graph/freshness.ts`):
 * `VerificationState` khớp đủ để truyền thẳng vào, còn `M-cli-core` thì không
 * phải mọc thêm một cạnh phụ thuộc lên `M-freshness` chỉ để mượn một cái tên
 * kiểu. Khối này là tính THUẦN cho lớp lệnh — nó nhận dữ liệu, không đi lấy.
 */
export interface DriftState {
  freshness: Freshness;
  reason: string;
}

/**
 * Cảnh báo code đã lệch BẢN VẼ của chặng mà task đang hiện thực.
 *
 * Cùng khuôn `formatBoundaryWarning`/`formatDispatchWarning`: hàm thuần, trả
 * `""` khi không có gì cần nói, chuỗi khác rỗng bắt đầu và kết thúc bằng `\n`.
 * Đặt ở ĐÂY chứ không ở chỗ gọi vì `gate` và `commit` đều phải nói CÙNG một
 * khối chữ — hai bản chép tay sẽ trôi khỏi nhau.
 *
 * Hai thông điệp, KHÁC NGHĨA, cố ý không gộp:
 *
 * - `definition_changed` + task `role: build` — chính BẢN VẼ vừa bị sửa. Đây là
 *   đổi hợp đồng, không phải hiện thực hợp đồng; làm việc đó trong một task xây
 *   nghĩa là quyết định thiết kế đi qua mà không ai duyệt. Vai `design` thì đúng
 *   việc, nên không nói gì.
 * - `stale`/`failing` — code trong khối đã đổi (hoặc probe trượt) mà chưa ai
 *   chứng minh nó còn khớp bản vẽ. Bắn cho MỌI vai: bản vẽ trôi khỏi code là
 *   chuyện của cả hai vai.
 *
 * Độ tươi vào đây qua tham số `freshness` (kết quả `computeFreshness`), KHÔNG
 * đọc thẳng sổ cái — xem luật "không ai đọc thẳng sổ cái để tự kết luận độ
 * tươi" ở `test/no-dead-ends.test.ts`. Một chỗ thứ hai tự soi sổ cái là một
 * chỗ thứ hai trả lời "còn dùng được không", và hai chỗ sẽ trôi khỏi nhau.
 *
 * Chỉ CẢNH BÁO, không chặn và không đổi mã thoát — cùng hạng `outsideBoundary`.
 */
export function formatDesignDriftWarning(
  task: Task,
  graph: Graph,
  freshness: ReadonlyMap<string, DriftState>,
): string {
  const design = graph.designs.get(task.implements)?.value;
  if (!design) return "";

  const changed: string[] = [];
  const drifted: { id: string; reason: string }[] = [];

  for (const a of design.artifacts) {
    const targetId = `${design.id}/${a.id}`;
    const state = freshness.get(targetId);
    if (!state) continue;
    if (state.freshness === "definition_changed") {
      if (task.role === "build") changed.push(targetId);
    } else if (state.freshness === "stale" || state.freshness === "failing") {
      drifted.push({ id: targetId, reason: state.reason });
    }
  }

  let out = "";

  if (changed.length > 0) {
    out +=
      `\n⚠ ${task.id} khai \`role: build\` nhưng đã ĐỔI BẢN VẼ ${changed.join(", ")} —\n` +
      "  sửa hợp đồng trong một task xây là quyết định không ai duyệt.\n" +
      `  Tách phần đổi bản vẽ ra một task \`role: design\`, hoặc đổi \`role\` của ${task.id}.\n`;
  }

  if (drifted.length > 0) {
    out +=
      `\n⚠ code đã lệch bản vẽ ${drifted.map((d) => d.id).join(", ")}:\n` +
      drifted.map((d) => `    ${d.id} — ${d.reason}`).join("\n") +
      `\n  Chạy \`ganas design check ${design.id}\` để xem lệch ở đâu, rồi \`ganas verify\`\n` +
      "  cho bản vẽ đó khi code đã khớp lại.\n";
  }

  return out;
}

const YAML_EXT = /\.ya?ml$/;

/**
 * Tách id design ra khỏi địa chỉ bản vẽ `D-011/A-x` (`zArtifactRef`,
 * `src/model/task.ts`) — cắt chuỗi trước dấu `/`, KHÔNG tra graph. Nhờ vậy
 * `ownsGanasFile` giữ được chữ ký thuần `(task, relPath)`: đọc `produces` của
 * chính task là đủ, không cần biết design đó có thật hay không.
 */
function designIdFromArtifactRef(ref: string): string {
  const slash = ref.indexOf("/");
  return slash === -1 ? ref : ref.slice(0, slash);
}

/**
 * File `.ganas/` này có thuộc task không.
 *
 * Quyền sở hữu đi theo ĐÚNG những liên kết task tự khai — file task đó, khối
 * trong `touches`, fact trong `context_contract.facts`, và design/goal/phạm vi
 * mà nó khai `implements`/`serves`/`scope`/`produces` — cộng fact mà chính
 * PHIÊN đang làm task này vừa verify (xem nhánh 2 dưới đây). Nhờ vậy
 * `.ganas/designs/D-003.yaml` của một loạt task khác không lọt vào commit
 * mang nhãn task này, mà bộ khung spine của chính task thì vẫn đi cùng nó.
 *
 * `produces` cũng được tính: một task có thể `implements: D-010` (chặng đang
 * hiện thực) mà `produces: ["D-011/A-x"]` (SINH bản vẽ cho một chặng khác) —
 * thiếu nhánh này thì `.ganas/designs/D-011.yaml` không thuộc task nào,
 * `ganas commit` không stage, và bản vẽ vừa vẽ nằm ngoài mọi commit, không ai
 * nghiệm thu. `consumes` thì CỐ TÌNH không tính: đọc một bản vẽ không có
 * nghĩa là sở hữu file chứa nó — nhận cả `consumes` thì commit của task này sẽ
 * nuốt file design mà task khác đang sửa, đúng lỗi mà luật "cố tình KHÔNG quét
 * theo `scope`" ngay dưới đây đã chặn cho fact/claim.
 *
 * Cố tình KHÔNG quét theo `scope` cho fact/claim: fact cùng phạm vi là của cả
 * phạm vi, lấy theo đó thì lại nuốt đúng thứ cần tách ra.
 *
 * Cố tình KHÔNG nhận `config.yaml`: mức cưỡng chế là quyết định của người, ở
 * tầm dự án chứ không phải việc của một task — nó đáng có commit riêng.
 *
 * **Nhánh 2 (D-019):** fact SINH RA trong lúc làm task — vì chính task này
 * chạy `ganas verify` — chưa thể có mặt ở `context_contract.facts`, khai
 * trường đó đòi biết trước một fact còn chưa tồn tại lúc mở task. Hệ quả cũ:
 * fact không task nào nhận, `ganas commit` bỏ lại working tree — `F-FLOW-001`
 * đã bị vậy. Nhận diện thay bằng `verified_by`: fact ghi `verified_by` đúng
 * bằng `sessionId` của phiên đang làm task này thì coi là fact của phiên đó.
 * Cần cả `graph` (để tra `verified_by` của fact) lẫn `sessionId` (để so
 * khớp) — thiếu một trong hai thì bỏ qua nhánh này, giữ hành vi cũ (an toàn
 * hơn là đoán bừa).
 *
 * File không thuộc nhóm nào thì để lại và BÁO cho người, đừng nuốt im.
 */
export function ownsGanasFile(
  task: Task,
  relPath: string,
  graph?: Graph,
  sessionId?: string,
): boolean {
  const p = relPath.split("\\").join("/").replace(/^\.\//, "");
  const prefix = `${GANAS_DIR}/`;
  if (!p.startsWith(prefix)) return false;
  const inner = p.slice(prefix.length);

  if (inner === LEDGER_FILE) return true;

  const stem = inner.replace(YAML_EXT, "");
  if (
    stem === `${DIRS.tasks}/${task.id}` ||
    stem === `${DIRS.designs}/${task.implements}` ||
    stem === `${DIRS.scopes}/${task.scope}` ||
    task.serves.some((g) => stem === `${DIRS.goals}/${g}`) ||
    task.touches.some((m) => stem === `${DIRS.modules}/${m}`) ||
    task.context_contract.facts.some((f) => stem === `${DIRS.facts}/${f}`) ||
    task.produces.some((ref) => stem === `${DIRS.designs}/${designIdFromArtifactRef(ref)}`)
  ) {
    return true;
  }

  if (graph && sessionId && stem.startsWith(`${DIRS.facts}/`)) {
    const factId = stem.slice(`${DIRS.facts}/`.length);
    if (graph.facts.get(factId)?.value.verified_by === sessionId) return true;
  }

  return false;
}
