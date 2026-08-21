import type { DebtItem, DebtKind } from "./graph/trace.js";
import type { Diagnostic, Graph, Severity } from "./graph/types.js";
import type { ScoreValue } from "./model/common.js";
import type { Icebox } from "./model/icebox.js";

/**
 * Bảng xếp hạng nợ.
 *
 * `validateGraph` (spine/scope/knowledge) và `computeDebt` (sơ đồ khối) mỗi
 * bên nói một thứ nợ, chấm điểm khác nhau (hoặc không chấm gì cả) — người đọc
 * xong một phiên thấy hai danh sách rời nhau, không cái nào nói "làm cái nào
 * trước". Module này CHỈ gộp + chấm điểm + sắp xếp + lọc theo phạm vi — thuần
 * túy, không I/O, không in ra màn hình. Phần hiển thị là việc khác.
 */

/* ------------------------------------------------------------------------- *
 * Thang điểm
 * ------------------------------------------------------------------------- */

/**
 * `ScoreValue` (thang đầy đủ 1–5, không phải chỉ 1/3/5) khai ở
 * `src/model/common.ts` — icebox (`src/model/icebox.ts`) dùng chung đúng
 * thang đó cho `weight`/`ease`, để hai sổ không trôi khỏi nhau. Re-export ở
 * đây để mọi chỗ đang `import { ScoreValue } from "./debt.js"` không phải đổi.
 *
 * Ba mốc lẻ là NEO để chấm cho nhất quán, không phải giới hạn: có luật thật
 * sự nằm giữa hai neo, và ép nó về neo gần nhất là làm sai thứ tự trong bảng
 * — đúng thứ mà bảng này tồn tại để làm đúng. Xem `spine/decision-cycle`
 * (weight 4) cho một ca cụ thể.
 */
export type { ScoreValue } from "./model/common.js";

export interface DebtScore {
  /**
   * Quan trọng đến đâu nếu bỏ qua: 5 = mất dữ liệu/hỏng nền, 3 = sinh kết
   * luận sai, 1 = chỉ là thông tin.
   */
  weight: ScoreValue;
  /**
   * Dễ sửa đến đâu: 5 = sửa một dòng YAML, 3 = phải chạy lệnh hoặc viết
   * probe, 1 = phải thiết kế lại.
   */
  ease: ScoreValue;
}

/**
 * Bảng điểm `code → { weight, ease }`.
 *
 * Đây là PHÁN ĐOÁN của người viết luật, khai một lần — `severity` sẵn có
 * trong `Diagnostic` là gợi ý tốt cho `weight` nhưng không thay thế nó, vì
 * `severity` chỉ nói "chặn CI hay không", không nói "quan trọng đến đâu nếu
 * bỏ qua" hay "dễ sửa đến đâu". Khoá là mã tĩnh grep được từ
 * `src/graph/validate.ts` và `src/graph/load.ts` (literal `code: "..."`),
 * cộng ba `DebtKind` của `computeDebt` (không có dấu `/`, không đụng namespace
 * nào ở trên).
 *
 * Mọi mã tĩnh PHẢI có mặt ở đây — `test/debt.test.ts` grep hai file nguồn để
 * ép luật này: thêm luật mới mà quên chấm điểm thì test đỏ.
 */
const SCORES: Record<string, DebtScore> = {
  /* --- spine: design ---------------------------------------------------- */
  // Liên kết treo (design → goal/decision/design khác không tồn tại): phá vỡ
  // giả định mà brief/trace dựa vào để suy luận, nhưng cách sửa hầu hết là
  // trỏ lại đúng ID hoặc tạo bản ghi thiếu — một sửa đổi YAML nhỏ.
  "spine/design-missing-goal": { weight: 3, ease: 5 },
  "spine/design-missing-decision": { weight: 3, ease: 5 },
  "spine/design-missing-supersede": { weight: 3, ease: 5 },
  // Thông tin quy trình (goal chưa duyệt, design mồ côi vì goal đã closed) —
  // không sai lệch gì, chỉ nhắc một trạng thái đang chờ.
  "spine/design-serves-draft-goal": { weight: 1, ease: 3 },
  "spine/design-orphaned": { weight: 1, ease: 5 },

  /* --- spine: task -------------------------------------------------------- */
  "spine/task-missing-goal": { weight: 3, ease: 5 },
  "spine/task-missing-design": { weight: 3, ease: 5 },
  "spine/task-goal-not-in-design": { weight: 3, ease: 5 },
  "spine/task-missing-blocker": { weight: 3, ease: 5 },
  "spine/task-missing-module": { weight: 3, ease: 5 },
  // Task "chạm khối" mà không có tiêu chí verification kiểm khối đó — task
  // "done" được mà chưa ai chạy verify: đúng nghĩa "sinh kết luận sai". Sửa
  // cần thêm một mục exit_contract, đôi khi phải viết bằng chứng mới cho khối.
  "spine/task-missing-verification": { weight: 3, ease: 3 },
  // Thiếu `model`: không ai quyết tier — không sai lệch dữ liệu, chỉ là ngỏ.
  "spine/task-missing-model": { weight: 1, ease: 5 },
  // "large": rủi ro compact giữa chừng làm tri thức mất/méo — hỏng nền của
  // chính phiên đó. Sửa = chẻ nhỏ task, một việc thiết kế lại thật sự.
  "spine/task-too-large": { weight: 3, ease: 1 },

  /* --- scope: task/module/phạm vi ----------------------------------------- */
  "scope/task-scope-not-found": { weight: 3, ease: 5 },
  // Có cả lối sửa nhanh (thêm khối vào phạm vi) lẫn lối phải chẻ task — chấm
  // ở mức giữa.
  "scope/task-touches-outside-scope": { weight: 3, ease: 3 },
  "scope/missing-module": { weight: 3, ease: 5 },
  // Phạm vi active mà thiếu tiêu chí nghiệm thu / chưa ai ký: "bàn giao xong"
  // trở thành ý kiến — cùng nhóm "sinh kết luận sai". Thiếu owner sửa bằng
  // một dòng; thiếu acceptance phải viết tiêu chí thật.
  "scope/without-acceptance": { weight: 3, ease: 3 },
  "scope/without-owner": { weight: 1, ease: 5 },
  "scope/module-without-scope": { weight: 1, ease: 5 },
  "scope/module-scope-not-found": { weight: 3, ease: 5 },
  "scope/module-scope-mismatch": { weight: 3, ease: 5 },
  // Khối không nối được vào sơ đồ của phạm vi — không có sẵn "lối sửa nhanh"
  // đúng: nối depends_on nghĩa là quyết định lại kiến trúc luồng.
  "scope/module-orphaned": { weight: 1, ease: 1 },

  /* --- sơ đồ khối --------------------------------------------------------- */
  "spine/module-missing-dependency": { weight: 3, ease: 5 },
  // Có lối sửa nhanh (đổi `to`) nhưng cũng có thể cần tạo khối mới.
  "spine/contract-missing-target": { weight: 3, ease: 5 },
  // Khối chưa có bằng chứng nào — mọi luồng qua nó "không tin được": sinh kết
  // luận sai. Sửa cần viết một bằng chứng (probe/eval) thật, không phải một
  // dòng YAML.
  "verify/module-unverified": { weight: 3, ease: 3 },
  // Eval yếu (ngưỡng/dataset đáng ngờ) đóng dấu xanh giả — cùng mức độ hại,
  // sửa cần cải lại dataset/ngưỡng.
  "verify/eval-weak": { weight: 3, ease: 3 },

  /* --- chu trình: chỉ sửa được bằng cách thiết kế lại phụ thuộc ----------- */
  "spine/module-cycle": { weight: 3, ease: 1 },
  "spine/task-cycle": { weight: 3, ease: 1 },
  "spine/design-cycle": { weight: 3, ease: 1 },
  // Chu trình decision KHÁC hẳn ba cái trên, cả hai trục — đừng chấm theo họ
  // hàng, chấm theo hậu quả:
  //
  // weight 4: chu trình module/task/design là cấu trúc phụ thuộc sai, nhìn ra
  // được. Chu trình decision làm brief loại CẢ CỤM khỏi mục "không được đi
  // ngược" — phiên làm việc không thấy MỘT ràng buộc nào, và không có dấu hiệu
  // gì cho biết có thứ đã bị nuốt. Im lặng tệ hơn sai.
  //
  // ease 5: hai decision khai `supersedes` trỏ vòng vào nhau gần như luôn là
  // gõ nhầm, không phải thiết kế sai — xoá một dòng YAML là xong. Khác chu
  // trình module/task, nơi vòng lặp phản ánh phụ thuộc thật phải gỡ.
  "spine/decision-cycle": { weight: 4, ease: 5 },

  /* --- goal ----------------------------------------------------------------- */
  // Goal active không design nào phục vụ: rủi ro ở tương lai (không có đường
  // đi tới hành động), chưa gây kết luận sai ngay bây giờ. Sửa cần viết một
  // design mới — không phải chỉ đổi một trường.
  "spine/goal-without-design": { weight: 1, ease: 3 },

  /* --- tri thức: fact --------------------------------------------------- */
  // Khai đã verify nhưng sổ cái không có bản ghi khớp — lần verify đó KHÔNG
  // xảy ra: chính là ví dụ "sinh kết luận sai" trong đề bài. Sửa = chạy lại
  // `ganas verify`.
  "knowledge/unbacked-verification": { weight: 3, ease: 3 },
  // Định nghĩa đổi sau lần verify cuối — kết quả cũ đang nói về một thứ khác.
  "knowledge/definition-changed": { weight: 3, ease: 3 },
  "knowledge/result-mismatch": { weight: 3, ease: 3 },
  // Chưa verify lần nào: trung thực về tình trạng của nó (không giả vờ đã
  // kiểm), nên weight thấp hơn hẳn hai mã phía trên — nhưng vẫn phải CHẠY
  // verify thật để sửa, không phải sửa YAML.
  "knowledge/fact-never-verified": { weight: 1, ease: 3 },
  // Probe fail ở lần chạy gần nhất — phát biểu ĐANG sai, đang chủ động đánh
  // lừa bất kỳ ai đọc fact này. Sửa cần điều tra statement hay code sai.
  "knowledge/fact-failing": { weight: 3, ease: 3 },
  "knowledge/fact-missing-promoted-from": { weight: 1, ease: 5 },
  "knowledge/claim-missing-promoted-fact": { weight: 3, ease: 5 },
  // Claim bị bác bỏ: giữ lại làm thông tin ("đừng tin lại"), không có gì để
  // "sửa" — ví dụ đúng nguyên văn của đề bài.
  "knowledge/claim-refuted": { weight: 1, ease: 5 },
  "knowledge/task-missing-fact": { weight: 3, ease: 5 },

  /* --- sổ cái hỏng: mất dữ liệu / hỏng nền -------------------------------- */
  "knowledge/ledger-corrupt": { weight: 5, ease: 1 },
  "knowledge/ledger-chain-broken": { weight: 5, ease: 1 },

  /* --- .gitignore: rò rỉ state riêng vào git ------------------------------ */
  "spine/gitignore-missing-local": { weight: 3, ease: 5 },

  /* --- load: config/YAML/ID trùng ----------------------------------------- */
  // Khoá lạ trong config.yaml (vd gõ sai "enforcment") có thể âm thầm tắt một
  // hàng rào mà người viết tưởng đang bật — sinh kết luận sai đúng nghĩa.
  "spine/config-unknown-key": { weight: 3, ease: 5 },
  // YAML không đọc được / ID trùng bị bỏ qua: cả bản ghi biến mất khỏi graph
  // KHÔNG một tiếng động — downstream coi như nó chưa từng tồn tại.
  "load/yaml": { weight: 3, ease: 5 },
  "load/duplicate-id": { weight: 3, ease: 5 },

  /* --- icebox: luật validate riêng của Icebox (KHÔNG phải hàng "icebox" ---
   * tự mang điểm bên dưới trong `debtRows` — ba mã dưới đây là DIAGNOSTIC do
   * `validateGraph` sinh ra khi một bản ghi icebox tự nó SAI, khác hẳn hàng
   * "icebox" trong bảng nợ vốn không tra SCORES). ------------------------- */
  // Bản sao của `knowledge/claim-missing-promoted-fact` (cũng 3/5): sổ nói
  // "đã thành T-042" mà T-042 không tồn tại ⇒ một quyết định đã ghi đang trỏ
  // vào hư không. Sửa = trỏ lại đúng id hoặc gỡ `promoted_to`.
  "icebox/promoted-missing-task": { weight: 3, ease: 5 },
  // Không sai lệch gì, chỉ nhắc một quyết định tới hạn xem lại — hạng "chỉ là
  // thông tin". ease 3 chứ không 5: đóng nó là một lệnh, nhưng cái phải trả
  // là một QUYẾT ĐỊNH, không phải một dòng YAML.
  "icebox/review-overdue": { weight: 1, ease: 3 },
  // Chấm theo hậu quả, không theo họ hàng (đúng lối lập luận đã ghi cho
  // `spine/decision-cycle`). Anh em gần nhất `scope/module-without-scope` là
  // 1/5, nhưng hậu quả khác hẳn: khối không khai scope vẫn nằm trên sơ đồ;
  // mục icebox không khai scope RƠI KHỎI bảng `ganas debt` mặc định của MỌI
  // task và khỏi báo cáo sau commit — chỉ còn thấy dưới `--all`. Đó là im
  // lặng biến mất khỏi chỗ người thật sự nhìn.
  "icebox/without-scope": { weight: 3, ease: 5 },

  /* --- bản đồ code: tài liệu vùng, vùng chồng nhau ------------------------ */
  // Thiếu tài liệu vùng: không sai gì cả, nhưng mỗi phiên đụng vào vùng đó
  // phải tự suy lại — nợ lãi kép, và viết một file là xong.
  "scope/module-missing-guide": { weight: 2, ease: 4 },
  // Hai khối cùng nhận một vùng: `parallelCandidates` có thể xếp hai task
  // "rời nhau" mà thật ra cùng file — hỏng im lặng, nhưng sửa là chuyện tách
  // vài dòng glob.
  "scope/module-paths-overlap": { weight: 4, ease: 4 },

  /* --- proposal: chỗ lệch chưa ai quyết ---------------------------------- */
  // Liên kết treo, cùng hạng với các `*-missing-*` khác: sai một id, sửa nhanh.
  "scope/proposal-scope-not-found": { weight: 3, ease: 5 },
  "spine/proposal-missing-target": { weight: 3, ease: 5 },
  "spine/proposal-missing-supersede": { weight: 3, ease: 5 },
  // Hai đề xuất tranh công một đích: không sai dữ liệu, nhưng lịch sử "vì sao
  // có D-00x" thành hai bản — người phải xử, nên ease thấp hơn.
  "spine/proposal-duplicate-target": { weight: 3, ease: 4 },
  // Vòng lặp supersedes: đồ thị tự mâu thuẫn, nhưng cắt một cạnh là xong.
  "spine/proposal-cycle": { weight: 4, ease: 4 },
  // Chất lượng nội dung đề xuất — không chặn gì, sửa bằng cách viết lại hai
  // câu. Nhẹ nhất bảng, đúng vai một lời nhắc.
  "knowledge/proposal-repeats-rejected": { weight: 2, ease: 5 },
  "knowledge/proposal-problem-equals-change": { weight: 1, ease: 5 },

  /* --- computeDebt: nợ riêng của sơ đồ khối (DebtKind, không có "/") ------ */
  // Cạnh `depends_on` không cạnh contract nào kiểm — sơ đồ TRÔNG như đã nối
  // nhưng chưa ai kiểm tương thích thật.
  "uncovered-edge": { weight: 3, ease: 3 },
  // Cạnh contract ĐANG fail — tích hợp giữa hai khối thật sự đang gãy ngay
  // lúc này, không phải nguy cơ tương lai: cùng hạng với sổ cái hỏng.
  "broken-contract": { weight: 5, ease: 3 },
  // Trùng điều kiện với `verify/module-unverified` (khối chưa có bằng chứng
  // nào) — chấm giống nhau cho nhất quán.
  "unverified-module": { weight: 3, ease: 3 },
};

/**
 * Điểm mặc định theo NAMESPACE cho hai nhóm mã ĐỘNG — tập mã không cố định
 * nên không liệt kê được từng cái:
 *
 * - `schema/${issue.code}` (`issuesToDiagnostics` trong `load.ts`): mã do zod
 *   quyết định, sinh khi một bản ghi trật schema — cả bản ghi đó biến mất
 *   khỏi graph, cùng mức hại với `load/yaml`.
 * - `verify/${finding.code}` (probe lint trong `validate.ts`, cho cả fact lẫn
 *   khối `kind: probe`): probe rỗng ruột (`tautological`), nguy hiểm
 *   (`dangerous`), hoặc lạc đề (`probe-unrelated`) đóng dấu xanh cho phỏng
 *   đoán — sinh kết luận sai, sửa cần viết lại probe.
 *
 * Hai mã TĨNH `verify/module-unverified` và `verify/eval-weak` đã có điểm
 * riêng ở `SCORES` phía trên và ưu tiên hơn fallback này — namespace chỉ áp
 * dụng cho mã KHÔNG có mặt trong bảng tĩnh.
 */
const NAMESPACE_DEFAULTS: Record<string, DebtScore> = {
  schema: { weight: 3, ease: 5 },
  verify: { weight: 3, ease: 3 },
};

/**
 * Tra điểm cho một mã. Ném lỗi nếu không tìm được cả trong `SCORES` lẫn
 * fallback namespace — im lặng trả một điểm bịa (vd 1/1) sẽ chôn đúng thứ
 * `test/debt.test.ts` cố tình phải bắt được: luật mới không chấm điểm thì
 * phải ĐỎ, không phải âm thầm rơi khỏi bảng xếp hạng.
 */
export function scoreOf(code: string): DebtScore {
  const exact = SCORES[code];
  if (exact) return exact;

  const slash = code.indexOf("/");
  if (slash > 0) {
    const fallback = NAMESPACE_DEFAULTS[code.slice(0, slash)];
    if (fallback) return fallback;
  }

  throw new Error(
    `debt.ts: mã "${code}" không có điểm trong SCORES và không khớp namespace mặc định nào ` +
      `(schema/*, verify/*) — thêm vào SCORES hoặc NAMESPACE_DEFAULTS trong src/debt.ts`,
  );
}

/* ------------------------------------------------------------------------- *
 * Gộp Diagnostic + DebtItem thành hàng đã chấm điểm
 * ------------------------------------------------------------------------- */

export type DebtSource =
  | { origin: "diagnostic"; diagnostic: Diagnostic }
  | { origin: "debt-item"; item: DebtItem }
  | { origin: "icebox"; item: Icebox; file: string };

export interface DebtRow {
  /**
   * `Diagnostic.code`, `DebtItem.kind` cho hàng tới từ `computeDebt`, hoặc
   * literal `"icebox"` cho hàng tới từ `graph.icebox`.
   */
  code: string;
  score: DebtScore;
  /** `score.weight + score.ease` — khoá sắp xếp chính. */
  total: number;
  /** Chỉ có ở hàng tới từ `Diagnostic`; `DebtItem` không có severity. */
  severity: Severity | undefined;
  /** `undefined` = "không gắn phạm vi" — KHÔNG đoán, xem `scopeIndex`. */
  scopeId: string | undefined;
  source: DebtSource;
}

/**
 * `switch` + nhánh `default: never` thay vì ternary/if-else: TypeScript CHỈ
 * báo lỗi biên dịch khi thêm origin thứ tư mà quên xử lý ở đây nếu khuôn là
 * exhaustive switch trên literal union — ternary/if-else âm thầm rơi qua
 * nhánh else mà tsc không hề kêu. Đây chính là bẫy làm mục icebox suýt in
 * message của `DebtItem` (và crash, vì `item.message` không tồn tại trên
 * `Icebox`) khi origin thứ ba được thêm vào `DebtSource`.
 */
function rowMessage(row: DebtRow): string {
  switch (row.source.origin) {
    case "diagnostic":
      return row.source.diagnostic.message;
    case "debt-item":
      return row.source.item.message;
    case "icebox": {
      const i = row.source.item;
      // Kèm `id`: tie-break của `compareRows` dựa vào message — thiếu id thì
      // hai mục icebox cùng tiêu đề sắp không tất định.
      return `${i.id} — ${i.title}`;
    }
    default: {
      const _exhaustive: never = row.source;
      throw new Error(`rowMessage: origin lạ ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Sắp giảm dần theo `total`. Tie-break: `code` (bảng chữ cái) rồi `message`.
 *
 * Chọn hai khoá NÀY — không phải thứ tự trong mảng `Diagnostic[]`/`DebtItem[]`
 * đầu vào — để kết quả không phụ thuộc thứ tự duyệt `Map` bên trong
 * `validateGraph`/`computeDebt` (vốn không phải hợp đồng công khai của hai
 * hàm đó, có thể đổi mà không ai coi là breaking change). Trên CÙNG một
 * graph, `code` + `message` xác định lại đúng một thứ tự tuyệt đối mỗi lần
 * chạy, kể cả khi mảng đầu vào tới theo thứ tự khác.
 */
function compareRows(a: DebtRow, b: DebtRow): number {
  if (b.total !== a.total) return b.total - a.total;
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  const am = rowMessage(a);
  const bm = rowMessage(b);
  if (am !== bm) return am < bm ? -1 : 1;
  return 0;
}

/**
 * Map `file → scopeId`, dựng từ MỌI thực thể có `scope`: task, module (nếu
 * có khai), fact, claim. `Diagnostic` chỉ có `file`, không có ID thực thể —
 * đây là cách duy nhất suy ra phạm vi của nó mà không đoán bừa.
 *
 * Giới hạn đã biết: `facts/` và `claims/` cho phép nhiều bản ghi trong CÙNG
 * một file (`collectArray`), nên nếu hai fact trong cùng file khai hai
 * `scope` khác nhau, bản ghi duyệt sau (claim ghi đè fact, trong cùng nhóm
 * bản ghi sau ghi đè bản ghi trước theo thứ tự `Map`) thắng — cùng độ chi
 * tiết "theo file" mà `Diagnostic` vốn đã giới hạn, không phải lỗi mới do map
 * này sinh ra.
 */
export function scopeIndex(graph: Graph): Map<string, string> {
  const index = new Map<string, string>();
  for (const task of graph.tasks.values()) index.set(task.file, task.value.scope);
  for (const mod of graph.modules.values()) {
    if (mod.value.scope !== undefined) index.set(mod.file, mod.value.scope);
  }
  for (const fact of graph.facts.values()) index.set(fact.file, fact.value.scope);
  for (const claim of graph.claims.values()) index.set(claim.file, claim.value.scope);
  // Icebox: `scope` tuỳ chọn (xem docstring `zIcebox`) — chỉ những bản ghi
  // CÓ khai mới góp vào map, để diagnostic `schema/*` trên file icebox quy
  // được về phạm vi khi có thể.
  for (const i of graph.icebox.values()) {
    if (i.value.scope !== undefined) index.set(i.file, i.value.scope);
  }
  return index;
}

function scopeOfDebtItem(item: DebtItem, graph: Graph): string | undefined {
  // Chỉ tra qua `moduleId` — `edge` không đủ để suy ra MỘT phạm vi (hai đầu
  // cạnh có thể ở hai phạm vi khác nhau), nên cố tình không đụng tới nó.
  if (item.moduleId === undefined) return undefined;
  return graph.modules.get(item.moduleId)?.value.scope;
}

/**
 * Gộp `Diagnostic[]` (từ `validateGraph`) và `DebtItem[]` (từ `computeDebt`)
 * thành một bảng xếp hạng đã chấm điểm, sắp theo `total` giảm dần.
 */
export function debtRows(
  diagnostics: readonly Diagnostic[],
  items: readonly DebtItem[],
  graph: Graph,
): DebtRow[] {
  const index = scopeIndex(graph);
  const rows: DebtRow[] = [];

  for (const diagnostic of diagnostics) {
    const score = scoreOf(diagnostic.code);
    rows.push({
      code: diagnostic.code,
      score,
      total: score.weight + score.ease,
      severity: diagnostic.severity,
      scopeId: index.get(diagnostic.file),
      source: { origin: "diagnostic", diagnostic },
    });
  }

  for (const item of items) {
    const score = scoreOf(item.kind);
    rows.push({
      code: item.kind,
      score,
      total: score.weight + score.ease,
      severity: undefined,
      scopeId: scopeOfDebtItem(item, graph),
      source: { origin: "debt-item", item },
    });
  }

  for (const s of graph.icebox.values()) {
    const i = s.value;
    // `closed`/`promoted` không còn là nợ — đã đóng sổ hoặc đã lên task
    // (nợ đó nay sống ở chính task đó, qua SCORES/DebtItem như bình thường).
    if (i.status !== "open") continue;
    rows.push({
      // "icebox", KHÔNG có dấu "/": cùng quy ước với ba DebtKind tĩnh
      // ("uncovered-edge", "broken-contract", "unverified-module"). Có dấu
      // "/" thì một ngày nào đó code này sẽ vô tình khớp namespace trong
      // NAMESPACE_DEFAULTS (vd nếu ai đó lỡ đặt "icebox/xxx") và bị chấm điểm
      // sai qua fallback thay vì qua chính bản ghi — cố tình tránh cả khả
      // năng đó bằng cách không có "/" ngay từ đầu.
      code: "icebox",
      // Điểm của CHÍNH bản ghi, KHÔNG qua `scoreOf`/`SCORES` — icebox tự
      // mang điểm của nó lúc phát hiện, không phải một luật tĩnh tra bảng.
      score: { weight: i.weight, ease: i.ease },
      total: i.weight + i.ease,
      severity: undefined,
      scopeId: i.scope,
      source: { origin: "icebox", item: i, file: s.file },
    });
  }

  return rows.sort(compareRows);
}

/* ------------------------------------------------------------------------- *
 * Lọc theo phạm vi
 * ------------------------------------------------------------------------- */

/**
 * Hàng thuộc phạm vi `scopeId`. Truyền `undefined` để lấy đúng nhóm "không
 * gắn phạm vi" — diagnostic không khớp file nào trong `scopeIndex`, hoặc
 * `DebtItem` không có `moduleId` (hoặc khối đó không khai `scope`).
 */
export function rowsInScope(rows: readonly DebtRow[], scopeId: string | undefined): DebtRow[] {
  return rows.filter((r) => r.scopeId === scopeId);
}

/** Chỉ để test/CLI liệt kê "còn mã nào chưa chấm điểm" — không phải API chính. */
export function knownDebtKinds(): readonly DebtKind[] {
  return ["uncovered-edge", "broken-contract", "unverified-module"];
}

/**
 * Mã này có điểm TƯỜNG MINH trong `SCORES` không — khác `scoreOf` ở chỗ
 * KHÔNG rơi về fallback namespace. Dành riêng cho guard test: mã tĩnh grep
 * được từ `validate.ts`/`load.ts` phải có mặt thật trong bảng, "không ném
 * lỗi nhờ fallback" không đủ để coi là đã chấm điểm.
 */
export function isExplicitlyScored(code: string): boolean {
  return Object.hasOwn(SCORES, code);
}
