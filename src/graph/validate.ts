import { join, posix } from "node:path";

import type { AnchorObject, ExitCriterion, Proposal } from "../model/index.js";
import {
  evalWeakness,
  formatAnchor,
  freshnessOf,
  guideFileName,
  moduleGuideDir,
  modulePathsOverlap,
} from "../model/index.js";
import { exists } from "../util/fsprobe.js";
import { matchesAny } from "../util/glob.js";
import { lineOfPath } from "../util/yaml.js";
import { defHash, entryAt, ledgerCorruption, verifyChain } from "../verify/ledger.js";
import { lintProbe } from "../verify/lint.js";
import { GANAS_DIR, LEDGER_FILE, LOCAL_ONLY } from "./paths.js";
import type { Diagnostic, Graph, Sourced } from "./types.js";

/**
 * Validator chéo — luật spine.
 *
 * Luật hình thức (thiếu field bắt buộc) đã do zod chặn ở tầng schema. Ở đây là
 * các luật cần nhìn cả graph: liên kết treo, mục tiêu mồ côi, vòng lặp, và tính
 * nhất quán giữa task / design / phạm vi.
 */

/* ------------------------------------------------------------------------- *
 * Cạnh sơ đồ khối suy từ IMPORT THẬT
 *
 * `spine/module-cycle` bên dưới chỉ soi `depends_on` ĐÃ KHAI, nên nó sạch đúng
 * bằng mức bản đồ đầy đủ — bản đồ khai thiếu càng nhiều thì càng ít lỗi. Chu
 * trình `M-graph-read ↔ M-load ↔ M-verify` sống nhiều tuần dưới một `ganas
 * validate` không một lỗi vì đúng chiều khuyến khích ngược đó (T-042).
 *
 * Phép đo ở đây THUẦN: nội dung file đã do `graph/load.ts` (`nature: io`) đọc
 * sẵn vào `graph.codeImports`. Lõi không được tự `readFile` — xem
 * `.claude/rules/architecture.md`.
 * ------------------------------------------------------------------------- */

/** Một cạnh sơ đồ khối suy từ import thật trong mã nguồn. */
export interface CodeEdge {
  /** Khối chứa file ĐI import. */
  from: string;
  /** Khối chứa file BỊ import. */
  to: string;
  /**
   * MỌI import đỡ cạnh này đều chỉ mang kiểu.
   *
   * Cạnh như vậy biến mất sau khi biên dịch, nên nó là chỗ RẺ NHẤT để cắt một
   * chu trình: chuyển kiểu xuống một khối lá là xong, luồng chạy không đổi.
   * Đo trên cây trước T-042: 10 cạnh chỉ mang kiểu, 72 cạnh có import giá trị —
   * bỏ riêng nhóm đầu thì chu trình co từ ba khối xuống hai.
   */
  typeOnly: boolean;
}

/** Khoá gộp hai đầu một cạnh. Id khối không chứa khoảng trắng nên không nhập nhằng. */
function edgeKey(from: string, to: string): string {
  return `${from} ${to}`;
}

/**
 * Cạnh `khối nguồn → khối đích` suy từ `graph.codeImports`.
 *
 * Phải TRÙNG KHÍT với phép đo trong `test/module-deps.test.ts` — hai phép đo
 * lệch nhau là hỏng cả hai, nên test đó gọi thẳng hàm này thay vì tự dựng bản
 * thứ hai.
 */
export function codeModuleEdges(graph: Graph): CodeEdge[] {
  const owners = [...graph.modules].map(([id, m]) => ({ id, paths: m.value.paths }));
  const cache = new Map<string, string | undefined>();
  const ownerOf = (file: string): string | undefined => {
    if (cache.has(file)) return cache.get(file);
    const id = owners.find((o) => matchesAny(file, o.paths))?.id;
    cache.set(file, id);
    return id;
  };

  const edges = new Map<string, CodeEdge>();
  for (const [file, imports] of graph.codeImports) {
    const from = ownerOf(file);
    if (!from) continue;
    for (const imp of imports) {
      // `./x.js` trong mã TypeScript ESM trỏ tới `./x.ts` trên đĩa.
      const target = posix.join(posix.dirname(file), imp.specifier.replace(/\.js$/, ".ts"));
      const to = ownerOf(target);
      // Import trong CÙNG một khối không phải cạnh của sơ đồ khối.
      if (!to || to === from) continue;
      const seen = edges.get(edgeKey(from, to));
      // Một import GIÁ TRỊ là đủ để cạnh thôi "chỉ mang kiểu".
      if (seen) seen.typeOnly = seen.typeOnly && imp.typeOnly;
      else edges.set(edgeKey(from, to), { from, to, typeOnly: imp.typeOnly });
    }
  }
  return [...edges.values()];
}

/** Định vị dòng của một field trong file nguồn của bản ghi. */
function at(
  graph: Graph,
  sourced: Sourced<unknown>,
  ...path: (string | number)[]
): number | undefined {
  const loaded = graph.sources.get(sourced.file);
  if (!loaded) return undefined;
  const full = sourced.index === undefined ? path : [sourced.index, ...path];
  return lineOfPath(loaded, full);
}

/** Phát hiện chu trình trong đồ thị có hướng. Trả về chu trình đầu tiên tìm được. */
function findCycle(edges: Map<string, readonly string[]>): string[] | null {
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];

  function visit(node: string): string[] | null {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const start = stack.indexOf(next);
        return [...stack.slice(start), next];
      }
      if (c === WHITE) {
        const cycle = visit(next);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    color.set(node, BLACK);
    return null;
  }

  for (const node of edges.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      const cycle = visit(node);
      if (cycle) return cycle;
    }
  }
  return null;
}

/**
 * Validate toàn graph, trả về mọi diagnostic (đã gộp `graph.loadDiagnostics`).
 *
 * ĐẦU RA HÀM NÀY PHỤ THUỘC ĐỒNG HỒ kể từ luật `icebox/review-overdue`: một
 * bản ghi hôm nay "chưa quá hạn" có thể "quá hạn" ở lần gọi sau, cùng một
 * graph, chỉ vì thời gian trôi. Đây là đánh đổi thật, không giấu: mọi test
 * đọc diagnostic của luật đó (hoặc muốn kết quả tất định) PHẢI ghim `now` qua
 * `opts.now` — không truyền thì hàm dùng `Date.now()` thật, và test sẽ trở
 * thành flaky theo ngày chạy.
 */
export function validateGraph(graph: Graph, opts: { now?: number } = {}): Diagnostic[] {
  const now = opts.now ?? Date.now();
  const diags: Diagnostic[] = [...graph.loadDiagnostics];

  /* --- Design: liên kết goal, mồ côi, chặng bỏ dở ---------------------- */

  /**
   * Số task TỔNG và số task CHƯA done của từng design. `implements` là cạnh duy
   * nhất từ một bước về chặng chứa nó, nên map này là toàn bộ nguồn của câu hỏi
   * "chặng đã bắt đầu chưa, và còn việc đang chạy không".
   *
   * Phải đếm CẢ HAI, không chỉ số chưa done: `total === 0` và `open === 0` cho
   * cùng một con số nhưng là hai trạng thái ngược nhau — chưa bắt đầu và đã
   * xong hết.
   */
  const taskCountOf = new Map<string, { total: number; open: number }>();
  for (const t of graph.tasks.values()) {
    const c = taskCountOf.get(t.value.implements) ?? { total: 0, open: 0 };
    c.total += 1;
    if (t.value.status !== "done") c.open += 1;
    taskCountOf.set(t.value.implements, c);
  }

  for (const design of graph.designs.values()) {
    const d = design.value;

    d.serves.forEach((goalId, i) => {
      const goal = graph.goals.get(goalId);
      if (!goal) {
        diags.push({
          severity: "error",
          code: "spine/design-missing-goal",
          message: `design ${d.id} phục vụ goal ${goalId} nhưng goal đó không tồn tại`,
          file: design.file,
          line: at(graph, design, "serves", i),
          hint: `Tạo .ganas/goals/${goalId}.yaml, hoặc sửa lại serves.`,
        });
        return;
      }
      if (goal.value.status === "draft") {
        diags.push({
          severity: "warning",
          code: "spine/design-serves-draft-goal",
          message:
            `design ${d.id} phục vụ goal ${goalId} còn ở trạng thái draft ` +
            `(chưa có người duyệt)`,
          file: design.file,
          line: at(graph, design, "serves", i),
          hint: `Chốt goal trước: đặt approved_by + approved_at rồi chuyển status: active.`,
        });
      }
    });

    const allClosed =
      d.serves.length > 0 && d.serves.every((g) => graph.goals.get(g)?.value.status === "closed");
    if (allClosed && d.status !== "archived" && d.status !== "superseded") {
      diags.push({
        severity: "warning",
        code: "spine/design-orphaned",
        message: `design ${d.id} mồ côi: mọi goal nó phục vụ đã closed`,
        file: design.file,
        line: at(graph, design, "status"),
        hint: `Đặt status: archived, hoặc trỏ serves sang goal đang active.`,
      });
    }

    d.decisions.forEach((decId, i) => {
      if (!graph.decisions.has(decId)) {
        diags.push({
          severity: "error",
          code: "spine/design-missing-decision",
          message: `design ${d.id} dẫn decision ${decId} không tồn tại`,
          file: design.file,
          line: at(graph, design, "decisions", i),
        });
      }
    });

    d.supersedes.forEach((oldId, i) => {
      if (!graph.designs.has(oldId)) {
        diags.push({
          severity: "error",
          code: "spine/design-missing-supersede",
          message: `design ${d.id} thay thế design ${oldId} không tồn tại`,
          file: design.file,
          line: at(graph, design, "supersedes", i),
        });
      }
    });

    if (d.status === "active") {
      // Chặng BỎ DỞ: đã bắt đầu rồi dừng giữa chừng — không còn bước nào chạy,
      // mà chặng cũng chưa đóng. Ca gốc là T-039: `.ganas/tasks/T-048.yaml` ghi
      // trong `notes` rằng còn "task cuối" phải làm, task đó chưa bao giờ được
      // tạo, và `ganas validate` sạch suốt nhiều tuần. Nợ tiếp nối sống trong
      // văn xuôi thì sống hay chết là ngẫu nhiên; đây là chỗ bắt nó bằng cấu trúc.
      //
      // `total > 0` là vế BẮT BUỘC, không phải chi tiết: design chưa có task nào
      // là chặng CHƯA BẮT ĐẦU, trạng thái ngược hẳn với bỏ dở. Thiếu vế đó thì
      // `fix-graph` (src/flow.ts) — đứng TRƯỚC chặng `task` và chỉ qua khi graph
      // sạch lỗi — kẹt vĩnh viễn ngay sau khi repo trống tạo design đầu tiên,
      // vì thuốc chữa nằm ở chặng phía sau.
      const tasks = taskCountOf.get(d.id) ?? { total: 0, open: 0 };
      if (tasks.total > 0 && tasks.open === 0) {
        diags.push({
          severity: "error",
          code: "spine/design-stalled",
          message:
            `design ${d.id} còn active nhưng cả ${tasks.total} task trỏ vào nó đều done — ` +
            `chặng bỏ dở`,
          file: design.file,
          line: at(graph, design, "status"),
          hint:
            `Đóng chặng: đặt status: done + done_at sau khi exit_contract thoả. ` +
            `Còn thiếu bước thì dựng nốt task và cho nó implements: ${d.id}.`,
        });
      }

      if (d.exit_contract.length === 0) {
        diags.push({
          severity: "warning",
          code: "spine/design-missing-exit-contract",
          message: `design ${d.id} chưa khai exit_contract — không có gì chấm "chặng đóng được chưa"`,
          file: design.file,
          line: at(graph, design, "id"),
          hint:
            `Thêm exit_contract vào ${design.file}, dùng đúng khuôn tiêu chí của task ` +
            `(kind: command / artifact / handoff / manual / verification).`,
        });
      }
    }
  }

  /* --- Task: liên kết + nhất quán spine -------------------------------- */

  for (const task of graph.tasks.values()) {
    const t = task.value;

    t.serves.forEach((goalId, i) => {
      if (!graph.goals.has(goalId)) {
        diags.push({
          severity: "error",
          code: "spine/task-missing-goal",
          message: `task ${t.id} phục vụ goal ${goalId} không tồn tại`,
          file: task.file,
          line: at(graph, task, "serves", i),
        });
      }
    });

    const design = graph.designs.get(t.implements);
    if (!design) {
      diags.push({
        severity: "error",
        code: "spine/task-missing-design",
        message: `task ${t.id} hiện thực design ${t.implements} không tồn tại`,
        file: task.file,
        line: at(graph, task, "implements"),
        hint: `Mọi task phải neo vào một design; design phải neo vào goal.`,
      });
    } else {
      // Spine phải liền mạch: task không được phục vụ goal mà design của nó không phục vụ.
      const stray = t.serves.filter((g) => !design.value.serves.includes(g));
      if (stray.length > 0) {
        diags.push({
          severity: "error",
          code: "spine/task-goal-not-in-design",
          message:
            `task ${t.id} phục vụ ${stray.join(", ")} nhưng design ${design.value.id} ` +
            `không phục vụ goal đó (design phục vụ: ${design.value.serves.join(", ")})`,
          file: task.file,
          line: at(graph, task, "serves"),
          hint:
            `Hoặc bổ sung goal vào design ${design.value.id}, hoặc chuyển task sang ` +
            `design khác. Spine phải liền mạch task → design → goal.`,
        });
      }
    }

    const scope = graph.scopes.get(t.scope);
    if (!scope) {
      diags.push({
        severity: "error",
        code: "scope/task-scope-not-found",
        message: `task ${t.id} thuộc phạm vi ${t.scope} không tồn tại`,
        file: task.file,
        line: at(graph, task, "scope"),
        hint: `Tạo phạm vi bằng \`ganas scope new\`, hoặc chuyển task sang phạm vi đã có.`,
      });
    } else {
      // Task chạm khối ngoài phạm vi của nó thì không ai nghiệm thu được nó:
      // bản sao của `spine/task-goal-not-in-design` cho trục HỆ THỐNG.
      const outside = t.touches.filter((m) => !scope.value.modules.includes(m));
      if (outside.length > 0) {
        diags.push({
          severity: "error",
          code: "scope/task-touches-outside-scope",
          message:
            `task ${t.id} chạm khối ${outside.join(", ")} nhưng phạm vi ${t.scope} ` +
            `không chứa khối đó (phạm vi chứa: ${scope.value.modules.join(", ")})`,
          file: task.file,
          line: at(graph, task, "touches"),
          hint:
            `Hoặc thêm khối vào phạm vi ${t.scope}, hoặc chẻ task — một task chạm hai ` +
            `phạm vi thì không ai nghiệm thu được nó.`,
        });
      }
    }

    t.blocked_by.forEach((blockerId, i) => {
      if (!graph.tasks.has(blockerId)) {
        diags.push({
          severity: "error",
          code: "spine/task-missing-blocker",
          message: `task ${t.id} bị chặn bởi task ${blockerId} không tồn tại`,
          file: task.file,
          line: at(graph, task, "blocked_by", i),
        });
      }
    });

    const verifiedTargets = t.exit_contract
      .filter(
        (c): c is Extract<ExitCriterion, { kind: "verification" }> => c.kind === "verification",
      )
      .map((c) => c.target);

    t.touches.forEach((moduleId, i) => {
      const mod = graph.modules.get(moduleId);
      if (!mod) {
        diags.push({
          severity: "error",
          code: "spine/task-missing-module",
          message: `task ${t.id} chạm khối ${moduleId} nhưng khối đó không tồn tại`,
          file: task.file,
          line: at(graph, task, "touches", i),
        });
        return;
      }

      // chạm khối mà không để lại tiêu chí kiểm chứng nào cho NÓ thì task
      // "done" được mà chưa ai chạy `ganas verify` lên khối đó.
      const covered = verifiedTargets.some(
        (target) => target === moduleId || target.startsWith(`${moduleId}/`),
      );
      if (!covered) {
        diags.push({
          severity: "error",
          code: "spine/task-missing-verification",
          message:
            `task ${t.id} chạm khối ${moduleId} nhưng \`exit_contract\` không có tiêu chí ` +
            `\`kind: verification\` nào kiểm khối đó`,
          file: task.file,
          line: at(graph, task, "touches", i),
          hint:
            mod.value.verify.length > 0
              ? `Thêm vào exit_contract: { kind: verification, target: "${moduleId}/${mod.value.verify[0]!.id}" }`
              : `Khối ${moduleId} chưa có \`verify\` nào — thêm bằng chứng cho khối trước, ` +
                `rồi trỏ exit_contract vào đó.`,
        });
      }
    });

    t.context_contract.facts.forEach((factId, i) => {
      if (!graph.facts.has(factId)) {
        diags.push({
          severity: "error",
          code: "knowledge/task-missing-fact",
          message: `task ${t.id} cần fact ${factId} nhưng fact đó không tồn tại`,
          file: task.file,
          line: at(graph, task, "context_contract", "facts", i),
        });
      }
    });

    // Chẻ task mà không quyết tier là để ngỏ cho phiên chính ôm hết bằng model
    // mạnh nhất. Cảnh báo chứ không chặn: task cũ (chẻ trước khi có luật này)
    // vẫn phải chạy được, và người quyết tier là người/agent chẻ task chứ
    // không phải validator — nó chỉ nhắc rằng chưa ai quyết.
    if (!t.model && t.status !== "done") {
      diags.push({
        severity: "warning",
        code: "spine/task-missing-model",
        message: `task ${t.id} chưa gán \`model\` — chưa ai quyết tier nào làm việc này`,
        file: task.file,
        line: at(graph, task, "status"),
        hint:
          `Thêm \`model: main|verifier|scribe\` (main = khó/mơ hồ, verifier = khoảng giữa, ` +
          `scribe = cơ học). Thiếu nó, brief không giao được task cho sub-agent nào.`,
      });
    }

    if (t.estimated_context === "large") {
      diags.push({
        severity: "warning",
        code: "spine/task-too-large",
        message: `task ${t.id} ước lượng context "large" — nhiều khả năng không vừa một phiên`,
        file: task.file,
        line: at(graph, task, "estimated_context"),
        hint:
          `Chẻ thành các task nhỏ hơn. Task quá lớn buộc phải compact giữa chừng, ` +
          `và đó là lúc tri thức bị mất hoặc bị bóp méo.`,
      });
    }
  }

  /* --- Phạm vi công việc ----------------------------------------------- */

  for (const scope of graph.scopes.values()) {
    const sc = scope.value;

    sc.modules.forEach((moduleId, i) => {
      if (!graph.modules.has(moduleId)) {
        diags.push({
          severity: "error",
          code: "scope/missing-module",
          message: `phạm vi ${sc.id} chứa khối ${moduleId} không tồn tại`,
          file: scope.file,
          line: at(graph, scope, "modules", i),
        });
      }
    });

    // Hai luật chống "phạm vi thùng rác": một khoanh vùng không ai ký và không
    // có cách nghiệm thu thì chỉ là cái nhãn, và nó sẽ hút mọi thứ vô chủ vào.
    if (sc.status === "active" && sc.acceptance.length === 0) {
      diags.push({
        severity: "warning",
        code: "scope/without-acceptance",
        message: `phạm vi ${sc.id} đang active nhưng không có tiêu chí nghiệm thu nào`,
        file: scope.file,
        line: at(graph, scope, "acceptance"),
        hint:
          `Nghiệm thu mức phạm vi chạy trên LUỒNG ĐÃ GHÉP — một luồng có thể đúng ` +
          `ở từng khối mà vẫn sai khi ghép. Thiếu nó thì "bàn giao xong" là ý kiến.`,
      });
    }

    if (sc.status === "active" && !sc.owner) {
      diags.push({
        severity: "warning",
        code: "scope/without-owner",
        message: `phạm vi ${sc.id} đang active nhưng không ai ký nghiệm thu`,
        file: scope.file,
        line: at(graph, scope, "id"),
        hint: `Khai \`owner: "@ten"\` — không ai ký thì không ai nghiệm thu được.`,
      });
    }
  }

  /* --- Sơ đồ khối: khối và cạnh ---------------------------------------- */

  for (const module of graph.modules.values()) {
    const m = module.value;

    if (m.scope === undefined) {
      diags.push({
        severity: "warning",
        code: "scope/module-without-scope",
        message: `khối ${m.id} không thuộc phạm vi nào — sẽ không nằm trong bộ bàn giao nào`,
        file: module.file,
        line: at(graph, module, "id"),
      });
    } else {
      const scope = graph.scopes.get(m.scope);
      if (!scope) {
        diags.push({
          severity: "error",
          code: "scope/module-scope-not-found",
          message: `khối ${m.id} khai thuộc phạm vi ${m.scope} nhưng phạm vi đó không tồn tại`,
          file: module.file,
          line: at(graph, module, "scope"),
        });
      } else if (!scope.value.modules.includes(m.id)) {
        // Hai chiều phải khớp nhau, nếu không sơ đồ nói một đằng, khối nói một nẻo.
        diags.push({
          severity: "error",
          code: "scope/module-scope-mismatch",
          message: `khối ${m.id} khai thuộc phạm vi ${m.scope}, nhưng phạm vi đó không liệt kê nó trong \`modules\``,
          file: module.file,
          line: at(graph, module, "scope"),
          hint: `Thêm ${m.id} vào \`modules\` của ${m.scope}, hoặc sửa \`scope\` của khối.`,
        });
      }
    }

    m.depends_on.forEach((depId, i) => {
      if (!graph.modules.has(depId)) {
        diags.push({
          severity: "error",
          code: "spine/module-missing-dependency",
          message: `khối ${m.id} phụ thuộc khối ${depId} không tồn tại`,
          file: module.file,
          line: at(graph, module, "depends_on", i),
        });
      }
    });

    m.verify.forEach((v, i) => {
      if (v.kind === "contract" && !graph.modules.has(v.to)) {
        diags.push({
          severity: "error",
          code: "spine/contract-missing-target",
          message: `khối ${m.id} khai cạnh hợp đồng ${v.id} tới khối ${v.to} nhưng khối đó không tồn tại`,
          file: module.file,
          line: at(graph, module, "verify", i, "to"),
          hint: `Sửa \`to\`, hoặc tạo khối ${v.to}. \`ganas trace\` sẽ không kiểm được cạnh này tới khi đó.`,
        });
      }
    });

    if (m.verify.length === 0 && m.status !== "unmapped") {
      diags.push({
        severity: "warning",
        code: "verify/module-unverified",
        message: `khối ${m.id} chưa có bằng chứng nào — mọi luồng đi qua nó đều không tin được`,
        file: module.file,
        line: at(graph, module, "id"),
        hint:
          m.nature === "llm"
            ? `Khối gọi LLM: thêm một bằng chứng \`kind: eval\` với dataset và ngưỡng.`
            : `Thêm một bằng chứng \`kind: probe\` chạy được (unit test, typecheck…).`,
      });
    }

    const moduleContext = [
      ...m.paths,
      ...m.entrypoints,
      ...m.contract.inputs.map((p) => p.name),
      ...m.contract.outputs.map((p) => p.name),
    ];

    for (const v of m.verify) {
      if (v.kind === "eval") {
        const weak = evalWeakness(v);
        if (weak) {
          diags.push({
            severity: "warning",
            code: "verify/eval-weak",
            message: `bằng chứng ${m.id}/${v.id}: ${weak.reason}`,
            file: module.file,
            line: at(graph, module, "verify"),
          });
        }
      }

      if (v.kind === "probe") {
        for (const f of lintProbe({ run: v.run, statement: m.title, context: moduleContext })) {
          diags.push({
            severity: f.severity,
            code: `verify/${f.code === "unrelated" ? "probe-unrelated" : f.code}`,
            message: `bằng chứng ${m.id}/${v.id}: ${f.message}`,
            file: module.file,
            line: at(graph, module, "verify"),
            hint: f.hint,
          });
        }
      }
    }
  }

  // Khối mồ côi: không NỐI được vào sơ đồ của phạm vi.
  //
  // Kiểm liên thông trên đồ thị VÔ HƯỚNG, không phải "tới được từ `entry`".
  // Bản cũ duyệt một chiều từ một điểm, nên bất kỳ phạm vi nào có từ hai khối
  // nguồn trở lên (khối không `depends_on` ai) đều luôn có khối bị báo mồ côi —
  // đổi `entry` chỉ đổi khối nào bị báo, có khi còn nhiều hơn. Đó là cảnh báo
  // thường trực không tắt được, mà cảnh báo thường trực là thứ người ta quen
  // mắt rồi ngừng đọc — cảnh báo thật tiếp theo sẽ bị bỏ qua cùng.
  //
  // Câu hỏi thật sự đáng hỏi là "khối này có nối vào sơ đồ của phạm vi không",
  // và liên thông vô hướng trả lời đúng câu đó.
  for (const scope of graph.scopes.values()) {
    const sc = scope.value;
    const inScope = new Set<string>(sc.modules);
    const neighbours = new Map<string, string[]>();
    for (const id of inScope) neighbours.set(id, []);
    for (const id of inScope) {
      const mod = graph.modules.get(id);
      if (!mod) continue;
      for (const dep of mod.value.depends_on) {
        if (!inScope.has(dep)) continue;
        neighbours.get(id)!.push(dep);
        neighbours.get(dep)!.push(id);
      }
    }

    const seen = new Set<string>();
    const root = inScope.has(sc.entry) ? sc.entry : sc.modules[0];
    const queue = root === undefined ? [] : [root];
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of neighbours.get(cur) ?? []) queue.push(next);
    }

    for (const id of sc.modules) {
      if (!seen.has(id) && graph.modules.has(id)) {
        diags.push({
          severity: "warning",
          code: "scope/module-orphaned",
          message: `khối ${id} không nối vào sơ đồ của phạm vi ${sc.id} — không có \`depends_on\` nào nối nó với các khối còn lại`,
          file: scope.file,
          line: at(graph, scope, "modules"),
          hint: `Nối nó vào sơ đồ qua \`depends_on\` (chiều nào cũng được), hoặc bỏ khỏi \`modules\` của phạm vi.`,
        });
      }
    }
  }

  /* --- Chu trình ------------------------------------------------------- */

  const moduleEdges = new Map<string, readonly string[]>();
  for (const [id, m] of graph.modules) moduleEdges.set(id, m.value.depends_on);
  const moduleCycle = findCycle(moduleEdges);
  if (moduleCycle) {
    const head = graph.modules.get(moduleCycle[0]!)!;
    diags.push({
      severity: "error",
      code: "spine/module-cycle",
      message: `vòng lặp phụ thuộc giữa các khối: ${moduleCycle.join(" → ")}`,
      file: head.file,
      line: at(graph, head, "depends_on"),
      hint: `Sơ đồ khối phải là đồ thị không chu trình, nếu không không lan truyền được độ tin.`,
    });
  }

  // Vế thứ hai của cùng một câu hỏi, đo trên IMPORT THẬT thay vì trên lời khai.
  // Hai vế không thay thế nhau: cạnh khai mà code không có là cạnh chết, cạnh
  // code có mà không ai khai là chu trình VÔ HÌNH — thứ đã sống nhiều tuần
  // dưới một `ganas validate` sạch không một lỗi.
  const codeEdges = codeModuleEdges(graph);
  const codeAdjacency = new Map<string, string[]>();
  for (const edge of codeEdges) {
    const list = codeAdjacency.get(edge.from);
    if (list) list.push(edge.to);
    else codeAdjacency.set(edge.from, [edge.to]);
  }
  const codeCycle = findCycle(codeAdjacency);
  if (codeCycle) {
    const head = graph.modules.get(codeCycle[0]!)!;
    const typeOnlyOf = new Map(codeEdges.map((e) => [edgeKey(e.from, e.to), e.typeOnly]));
    const legs = codeCycle.slice(0, -1).map((from, i) => {
      const to = codeCycle[i + 1]!;
      return { label: `${from} → ${to}`, typeOnly: typeOnlyOf.get(edgeKey(from, to)) === true };
    });
    const cheap = legs.filter((leg) => leg.typeOnly).map((leg) => leg.label);
    diags.push({
      severity: "error",
      code: "spine/module-cycle-code",
      message:
        `vòng lặp phụ thuộc giữa các khối, suy từ IMPORT THẬT trong code: ` + codeCycle.join(" → "),
      file: head.file,
      line: at(graph, head, "paths"),
      hint:
        `Cạnh trong vòng: ` +
        legs.map((leg) => leg.label + (leg.typeOnly ? " (chỉ `import type`)" : "")).join(", ") +
        `.\n` +
        (cheap.length > 0
          ? `Cắt rẻ nhất ở cạnh chỉ mang kiểu (${cheap.join(", ")}): kiểu biến mất sau khi ` +
            `biên dịch, nên chuyển nó xuống một khối lá là xong — luồng chạy không đổi.`
          : `Không cạnh nào chỉ mang kiểu — phải tách phần dùng chung ra một khối LÁ, không ` +
            `phải bỏ bớt \`depends_on\`: cạnh đo từ import thật, khai thiếu không làm nó biến mất.`),
    });
  }

  const taskEdges = new Map<string, readonly string[]>();
  for (const [id, t] of graph.tasks) taskEdges.set(id, t.value.blocked_by);
  const taskCycle = findCycle(taskEdges);
  if (taskCycle) {
    const head = graph.tasks.get(taskCycle[0]!)!;
    diags.push({
      severity: "error",
      code: "spine/task-cycle",
      message: `vòng lặp phụ thuộc giữa các task: ${taskCycle.join(" → ")}`,
      file: head.file,
      line: at(graph, head, "blocked_by"),
    });
  }

  const designEdges = new Map<string, readonly string[]>();
  for (const [id, d] of graph.designs) designEdges.set(id, d.value.supersedes);
  const designCycle = findCycle(designEdges);
  if (designCycle) {
    const head = graph.designs.get(designCycle[0]!)!;
    diags.push({
      severity: "error",
      code: "spine/design-cycle",
      message: `vòng lặp thay thế giữa các design: ${designCycle.join(" → ")}`,
      file: head.file,
      line: at(graph, head, "supersedes"),
    });
  }

  // `Decision.supersedes` không vô hại như trước: brief loại khỏi bàn giao
  // MỌI decision nằm trong tập "bị supersede" (xem `src/render/brief.ts`).
  // Một chu trình — DEC-A supersedes DEC-B, DEC-B supersedes DEC-A — đưa cả
  // hai vào tập chết đó cùng lúc, nên brief nuốt mất cả cụm: phiên làm việc
  // không thấy một mệnh lệnh nào, im lặng hoàn toàn, không phải dữ liệu xấu
  // đơn thuần như chu trình module/task/design.
  const decisionEdges = new Map<string, readonly string[]>();
  for (const [id, dec] of graph.decisions) decisionEdges.set(id, dec.value.supersedes);
  const decisionCycle = findCycle(decisionEdges);
  if (decisionCycle) {
    const head = graph.decisions.get(decisionCycle[0]!)!;
    diags.push({
      severity: "error",
      code: "spine/decision-cycle",
      message: `vòng lặp thay thế giữa các decision: ${decisionCycle.join(" → ")}`,
      file: head.file,
      line: at(graph, head, "supersedes"),
      hint: `Chu trình khiến brief loại cả cụm decision khỏi bàn giao — không phiên nào thấy được.`,
    });
  }

  /* --- Goal không ai phục vụ ------------------------------------------- */

  const servedGoals = new Set<string>();
  for (const d of graph.designs.values()) for (const g of d.value.serves) servedGoals.add(g);
  for (const goal of graph.goals.values()) {
    if (goal.value.status === "active" && !servedGoals.has(goal.value.id)) {
      diags.push({
        severity: "warning",
        code: "spine/goal-without-design",
        message: `goal ${goal.value.id} đang active nhưng chưa design nào phục vụ`,
        file: goal.file,
        line: at(graph, goal, "id"),
        hint: `Mục tiêu không có đường đi tới hành động thì sẽ không bao giờ đạt.`,
      });
    }
  }

  /* --- Tri thức: fact chưa verify, claim bị bác bỏ ---------------------- */

  for (const fact of graph.facts.values()) {
    const f = fact.value;

    // Bằng chứng phải có dấu vết trong sổ cái. Không có node này thì cả cơ chế
    // STALE vô nghĩa: model chỉ cần ghi hai trường vào YAML là "đã verify".
    if (f.last_verified_at) {
      const entry = entryAt(graph.ledger, f.id, f.last_verified_at);
      if (!entry) {
        diags.push({
          severity: "error",
          code: "knowledge/unbacked-verification",
          message:
            `fact ${f.id} khai đã verify lúc ${f.last_verified_at} nhưng sổ cái không có ` +
            `bản ghi nào khớp — lần verify đó KHÔNG xảy ra`,
          file: fact.file,
          line: at(graph, fact, "last_verified_at"),
          hint:
            `Chỉ \`ganas verify ${f.id}\` mới được đặt trường này. Xoá \`last_verified_at\` ` +
            `và \`last_result\` rồi chạy verify thật.`,
        });
      } else if (entry.def !== defHash(f.verify, f.statement)) {
        // Verify bằng probe thật rồi thay ruột (hoặc đổi `statement` mà giữ
        // probe). Không có luật này thì sổ cái chỉ chặn được cửa trước.
        //
        // `error` chứ không phải `warning`: đây là điều kiện để CI ĐỎ được. Hook
        // fail-open và `.ganas/config.yaml` sửa được, nên cổng thật của mô hình
        // này là CI chạy `ganas validate` — mà cổng chỉ đóng khi có `error`.
        diags.push({
          severity: "error",
          code: "knowledge/definition-changed",
          message:
            `fact ${f.id}: định nghĩa hoặc phát biểu đã đổi sau lần verify lúc ` +
            `${f.last_verified_at} — kết quả cũ đo một thứ khác, không còn nói về fact hiện tại`,
          file: fact.file,
          line: at(graph, fact, "verify", "run"),
          hint: `Chạy lại: ganas verify ${f.id}`,
        });
      } else if (entry.result === "fail" && f.last_result !== "fail") {
        diags.push({
          severity: "error",
          code: "knowledge/result-mismatch",
          message:
            `fact ${f.id} khai last_result="${f.last_result}" nhưng sổ cái ghi lần chạy ` +
            `lúc ${f.last_verified_at} là "fail"`,
          file: fact.file,
          line: at(graph, fact, "last_result"),
        });
      }
    }

    // Probe rỗng ruột nguy hiểm hơn không có probe: nó đóng dấu xanh cho phỏng đoán.
    for (const finding of lintProbe({
      run: f.verify.run,
      statement: f.statement,
      context: [...f.depends_on, ...f.anchors.map(formatAnchor)],
    })) {
      diags.push({
        severity: finding.severity,
        code: `verify/${finding.code === "unrelated" ? "probe-unrelated" : finding.code}`,
        message: `fact ${f.id}: ${finding.message}`,
        file: fact.file,
        line: at(graph, fact, "verify", "run"),
        hint: finding.hint,
      });
    }

    const fresh = freshnessOf({ fact: f });
    if (fresh === "never_verified") {
      diags.push({
        severity: "warning",
        code: "knowledge/fact-never-verified",
        message: `fact ${f.id} chưa verify lần nào — hiện chỉ là niềm tin, không phải sự thật`,
        file: fact.file,
        line: at(graph, fact, "id"),
        hint: `Chạy: ganas verify ${f.id}`,
      });
    } else if (fresh === "failing") {
      diags.push({
        severity: "error",
        code: "knowledge/fact-failing",
        message: `fact ${f.id} có probe fail ở lần chạy gần nhất — phát biểu này đang SAI`,
        file: fact.file,
        line: at(graph, fact, "verify"),
        hint: `Sửa lại statement cho khớp thực tế, hoặc sửa code cho khớp statement.`,
      });
    }

    if (f.promoted_from && !graph.claims.has(f.promoted_from)) {
      diags.push({
        severity: "warning",
        code: "knowledge/fact-missing-promoted-from",
        message: `fact ${f.id} ghi promoted_from ${f.promoted_from} nhưng claim đó không còn`,
        file: fact.file,
        line: at(graph, fact, "promoted_from"),
      });
    }
  }

  for (const claim of graph.claims.values()) {
    const c = claim.value;
    const promotedTo = c.verdict?.promoted_to;
    if (promotedTo && !graph.facts.has(promotedTo)) {
      diags.push({
        severity: "error",
        code: "knowledge/claim-missing-promoted-fact",
        message: `claim ${c.id} nói đã thăng cấp thành fact ${promotedTo} nhưng fact đó không tồn tại`,
        file: claim.file,
        line: at(graph, claim, "verdict", "promoted_to"),
      });
    }
    if (c.trust === "refuted") {
      diags.push({
        severity: "info",
        code: "knowledge/claim-refuted",
        message: `claim ${c.id} đã bị bác bỏ: "${c.statement}"`,
        file: claim.file,
        line: at(graph, claim, "id"),
        hint: `Đây là một hiểu nhầm đã tồn tại trong dự án. Giữ lại để phiên sau không tin lại.`,
      });
    }
  }

  /* --- Icebox: quyết định đã ghi CHƯA làm -------------------------------- */

  for (const item of graph.icebox.values()) {
    const i = item.value;

    // Bản sao của `knowledge/claim-missing-promoted-fact`: sổ nói "đã thành
    // T-042" mà T-042 không tồn tại — không phân biệt open/closed/promoted,
    // vì đây là một tham chiếu treo bất kể trạng thái hiện tại của bản ghi.
    if (i.promoted_to && !graph.tasks.has(i.promoted_to)) {
      diags.push({
        severity: "error",
        code: "icebox/promoted-missing-task",
        message: `icebox ${i.id} khai đã thăng cấp thành task ${i.promoted_to} nhưng task đó không tồn tại`,
        file: item.file,
        line: at(graph, item, "promoted_to"),
        hint: `Sửa \`promoted_to\` trỏ đúng id, hoặc gỡ nó nếu chưa thật sự thăng cấp.`,
      });
    }

    // Hai luật dưới đây chỉ áp cho bản ghi còn "sống" (status: open) — mục đã
    // đóng hay đã thăng cấp thì không còn là nợ, réo nữa là tiếng ồn.
    if (i.status !== "open") continue;

    const foundAtMs = Date.parse(i.found_at);
    const reviewAfterMs = i.review_after_days * 24 * 60 * 60 * 1000;
    if (foundAtMs + reviewAfterMs <= now) {
      const daysSince = Math.floor((now - foundAtMs) / (24 * 60 * 60 * 1000));
      diags.push({
        severity: "warning",
        code: "icebox/review-overdue",
        message:
          `icebox ${i.id} quá hạn xem lại: phát hiện ${daysSince} ngày trước, hẹn xem lại ` +
          `sau ${i.review_after_days} ngày`,
        file: item.file,
        line: at(graph, item, "review_after_days"),
        hint:
          `Xem lại quyết định hoãn: đóng nó (status: closed + closed_reason), thăng cấp ` +
          `thành task (status: promoted + promoted_to), hoặc nếu vẫn cố tình hoãn tiếp thì ` +
          `dời found_at/review_after_days — đừng để nó nằm im quá hạn không ai đọc.`,
      });
    }

    // Cùng lối lập luận với `scope/module-without-scope`, nhưng hậu quả khác
    // hẳn: khối thiếu scope vẫn nằm trên sơ đồ, còn mục icebox thiếu scope
    // rơi khỏi bảng `ganas debt` mặc định của MỌI task (chỉ lọc theo scope
    // của chính task) — chỉ còn thấy được dưới `--all`.
    if (i.scope === undefined) {
      diags.push({
        severity: "warning",
        code: "icebox/without-scope",
        message: `icebox ${i.id} đang open nhưng không khai \`scope\` — sẽ rơi khỏi bảng \`ganas debt\` mặc định của mọi task`,
        file: item.file,
        line: at(graph, item, "id"),
        hint:
          `Thêm \`scope: <id-phạm-vi>\` nếu đã biết thuộc phạm vi nào. Thiếu nó, mục này chỉ ` +
          `còn thấy được dưới \`ganas debt --all\`, không nằm trong báo cáo sau commit của ai cả.`,
      });
    }
  }

  /* --- Bản đồ code: tài liệu vùng và vùng chồng nhau ---------------------- *
   * Cả hai đều `warning`, KHÔNG `error`, và đó là một quyết định chứ không
   * phải sự dè dặt: ganas phải cài được lên dự án CŨ vốn có cấu trúc khác.
   * Một dự án legacy vừa `ganas init` sẽ vi phạm cả hai luật này ngay giây
   * đầu; chặn cứng ở đó thì ganas không cài được, chứ không cải thiện gì. Cửa
   * ra khi người không muốn sửa là `ganas proposal reject --why` hoặc
   * `ganas icebox add`. */

  const guideFile = guideFileName(graph.config.harness);
  const modulesWithPaths = [...graph.modules.values()].filter((m) => m.value.paths.length > 0);

  for (const mod of modulesWithPaths) {
    const dir = moduleGuideDir(mod.value.paths);
    if (dir === undefined) continue;

    if (!exists(join(graph.root, dir, guideFile))) {
      diags.push({
        severity: "warning",
        code: "scope/module-missing-guide",
        message: `khối ${mod.value.id} nhận cả thư mục \`${dir}\` nhưng ở đó không có \`${guideFile}\``,
        file: mod.file,
        line: at(graph, mod, "paths"),
        hint:
          `Agent đọc file hướng dẫn TRƯỚC khi đọc code. Thiếu nó, mọi phiên đụng vào ` +
          `\`${dir}\` phải tự suy lại cổng vào và cạm bẫy của vùng. Tạo ` +
          `\`${dir}/${guideFile}\` — cổng vào, bất biến, cạm bẫy, lệnh test riêng.`,
      });
    }
  }

  // Hai khối cùng nhận một vùng code = hai bản đồ cho một chỗ, và `taskBoundary()`
  // sẽ trả về vùng đó cho CẢ HAI task chạm hai khối — hai phiên song song tưởng
  // mình đang ở hai chỗ rời nhau (xem `parallelCandidates`, graph/select.ts).
  for (let i = 0; i < modulesWithPaths.length; i++) {
    for (let j = i + 1; j < modulesWithPaths.length; j++) {
      const a = modulesWithPaths[i]!;
      const b = modulesWithPaths[j]!;
      if (!modulePathsOverlap(a.value.paths, b.value.paths)) continue;
      diags.push({
        severity: "warning",
        code: "scope/module-paths-overlap",
        message: `khối ${a.value.id} và ${b.value.id} có thể cùng nhận một vùng code`,
        file: a.file,
        line: at(graph, a, "paths"),
        hint:
          `Tách \`paths\` cho rời nhau, hoặc gộp hai khối. Chồng nhau thì hai task ` +
          `song song có thể cùng sửa một file mà \`parallelCandidates\` vẫn coi là an toàn.`,
      });
    }
  }

  /* --- Đề xuất: chỗ lệch CHƯA ai quyết ----------------------------------- */

  /**
   * Chuẩn hoá để so hai đề xuất có phải là MỘT không: bỏ khoảng trắng thừa và
   * phân biệt hoa thường. Cố ý thô — bắt được đúng ca đắt nhất (chép lại y
   * nguyên một đề xuất đã bị từ chối) mà không giả vờ hiểu ngữ nghĩa.
   */
  const sameChange = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

  const rejectedChanges = new Map<string, Proposal>();
  for (const sourced of graph.proposals.values()) {
    const p = sourced.value;
    if (p.status === "rejected") rejectedChanges.set(sameChange(p.proposed_change), p);
  }

  const promotedBy = new Map<string, string>();

  for (const sourced of graph.proposals.values()) {
    const p = sourced.value;

    if (!graph.scopes.has(p.scope)) {
      diags.push({
        severity: "error",
        code: "scope/proposal-scope-not-found",
        message: `đề xuất ${p.id} thuộc phạm vi ${p.scope} không tồn tại`,
        file: sourced.file,
        line: at(graph, sourced, "scope"),
        hint: `Trỏ lại đúng phạm vi, hoặc tạo phạm vi bằng \`ganas scope new\`.`,
      });
    }

    if (p.promoted_to) {
      const target = p.promoted_to;
      const exists =
        graph.designs.has(target) || graph.tasks.has(target) || graph.icebox.has(target);
      if (!exists) {
        diags.push({
          severity: "error",
          code: "spine/proposal-missing-target",
          message: `đề xuất ${p.id} khai đã thành ${target} nhưng thực thể đó không tồn tại`,
          file: sourced.file,
          line: at(graph, sourced, "promoted_to"),
          hint: `Sửa \`promoted_to\` trỏ đúng id, hoặc gỡ nó nếu chưa thật sự sinh ra gì.`,
        });
      }

      // Hai đề xuất cùng trỏ một đích: một trong hai đang nhận công của cái
      // kia, và cạnh chỉ đi một chiều nên không có gì bên phía đích cãi lại
      // được. Người phải xử, máy chỉ chỉ chỗ.
      const first = promotedBy.get(target);
      if (first) {
        diags.push({
          severity: "warning",
          code: "spine/proposal-duplicate-target",
          message: `đề xuất ${p.id} và ${first} cùng khai đã thành ${target}`,
          file: sourced.file,
          line: at(graph, sourced, "promoted_to"),
          hint: `Chỉ một đề xuất được sinh ra ${target}; cái còn lại nên là \`superseded\`.`,
        });
      } else {
        promotedBy.set(target, p.id);
      }
    }

    for (const oldId of p.supersedes) {
      if (!graph.proposals.has(oldId)) {
        diags.push({
          severity: "error",
          code: "spine/proposal-missing-supersede",
          message: `đề xuất ${p.id} thay thế đề xuất ${oldId} không tồn tại`,
          file: sourced.file,
          line: at(graph, sourced, "supersedes"),
          hint: `Trỏ đúng id đề xuất cũ, hoặc bỏ khỏi \`supersedes\`.`,
        });
      }
    }

    // Nêu giải pháp mà không nêu vấn đề: người duyệt chỉ còn cách tin lời
    // người đề xuất. Đây là lý do `problem` và `proposed_change` là HAI trường
    // tách rời (xem docstring `src/model/proposal.ts`) — chép cùng một câu vào
    // cả hai là vô hiệu hoá đúng chỗ tách đó.
    if (sameChange(p.problem) === sameChange(p.proposed_change)) {
      diags.push({
        severity: "warning",
        code: "knowledge/proposal-problem-equals-change",
        message: `đề xuất ${p.id} có \`problem\` trùng y hệt \`proposed_change\` — chưa nêu vấn đề, chỉ nêu giải pháp`,
        file: sourced.file,
        line: at(graph, sourced, "problem"),
        hint:
          `Viết \`problem\` là chỗ LỆCH quan sát được (kèm anchor), \`proposed_change\` là ` +
          `việc đề nghị làm. Không tách được hai câu đó thì nhiều khả năng chưa có vấn đề thật.`,
      });
    }

    // Đề nghị lại ĐÚNG thay đổi vừa bị từ chối: chính là chuyện `why_rejected`
    // sinh ra để chặn. So `proposed_change` chứ không so `title` — cùng một
    // thay đổi hay được đặt tên khác đi ở lần đề xuất sau.
    if (p.status === "pending") {
      const old = rejectedChanges.get(sameChange(p.proposed_change));
      if (old) {
        diags.push({
          severity: "warning",
          code: "knowledge/proposal-repeats-rejected",
          message: `đề xuất ${p.id} đề nghị đúng thay đổi mà ${old.id} đã bị từ chối`,
          file: sourced.file,
          line: at(graph, sourced, "proposed_change"),
          hint:
            `${old.id} bị từ chối vì: ${old.why_rejected ?? "(không ghi lý do)"} — ` +
            `nêu được điều gì đã khác đi thì hãy giữ, không thì đóng lại.`,
        });
      }
    }
  }

  const proposalCycle = findCycle(
    new Map([...graph.proposals.values()].map((p) => [p.value.id, p.value.supersedes])),
  );
  if (proposalCycle) {
    const head = graph.proposals.get(proposalCycle[0]!);
    diags.push({
      severity: "error",
      code: "spine/proposal-cycle",
      message: `vòng lặp thay thế giữa các đề xuất: ${proposalCycle.join(" → ")}`,
      file: head?.file ?? GANAS_DIR,
      line: head ? at(graph, head, "supersedes") : undefined,
      hint: `Cắt một cạnh \`supersedes\` — một đề xuất không thể vừa thay thế vừa bị thay thế.`,
    });
  }

  /* --- Anchor URL không có trích dẫn ------------------------------------- *
   * `fetched_at` bắt buộc vì WEB ĐỔI. Nhưng khi trang đã đổi thật, `fetched_at`
   * chỉ nói "tôi đọc nó ngày ấy" — thứ duy nhất còn trả lời được "ngày ấy nó
   * viết gì" là `quote`. Bắt buộc mốc thời gian mà thả nội dung là giữ đúng
   * phần ít giá trị hơn.
   *
   * `warning`, không `error`: dự án cũ import tri thức từ tài liệu có sẵn
   * thường không còn trích dẫn để chép lại, và chặn cứng ở đó là chặn việc
   * ghi lại thứ họ ĐANG BIẾT. Xem PR-009. */

  const anchored: { id: string; file: string; anchors: readonly AnchorObject[] }[] = [
    ...[...graph.facts.values()].map((x) => ({
      id: x.value.id,
      file: x.file,
      anchors: x.value.anchors,
    })),
    ...[...graph.claims.values()].map((x) => ({
      id: x.value.id,
      file: x.file,
      anchors: x.value.anchors,
    })),
    ...[...graph.icebox.values()].map((x) => ({
      id: x.value.id,
      file: x.file,
      anchors: x.value.anchors,
    })),
    ...[...graph.proposals.values()].map((x) => ({
      id: x.value.id,
      file: x.file,
      anchors: x.value.anchors,
    })),
  ];

  for (const rec of anchored) {
    for (const a of rec.anchors) {
      if (a.kind !== "url" || a.quote) continue;
      diags.push({
        severity: "warning",
        code: "knowledge/url-anchor-without-quote",
        message: `${rec.id} neo vào ${a.url} nhưng không chép lại trích dẫn nào`,
        file: rec.file,
        hint:
          `Trang web đổi, và khi nó đổi thì \`fetched_at\` chỉ còn nói được "đã đọc ngày nào". ` +
          `Thêm \`quote:\` với đúng đoạn đã đọc — đó là phần bằng chứng sống lâu hơn cái link.`,
      });
    }
  }

  /* --- Sổ cái hỏng ------------------------------------------------------ */

  const corrupt = ledgerCorruption(graph.root);
  if (corrupt > 0) {
    diags.push({
      severity: "error",
      code: "knowledge/ledger-corrupt",
      message:
        `${corrupt} dòng trong ${LEDGER_FILE} không đọc được — sổ cái là gốc tin cậy ` +
        `của mọi kết luận "đã kiểm chứng"`,
      file: `${GANAS_DIR}/${LEDGER_FILE}`,
      hint:
        `Dòng hỏng bị bỏ qua khi tính độ tươi, nên fact dựa vào chúng âm thầm quay ` +
        `lại "chưa verify". Xem git history của file này: một dòng rách có thể là ` +
        `lỗi ghi, cũng có thể là dấu vết ai đó sửa lịch sử.`,
    });
  }

  const chain = verifyChain(graph.ledgerRaw);
  if (!chain.ok) {
    const at = graph.ledgerRaw[chain.brokenAt!];
    diags.push({
      severity: "error",
      code: "knowledge/ledger-chain-broken",
      message:
        `${LEDGER_FILE} đứt hash-chain tại dòng thứ ${chain.brokenAt! + 1}` +
        (at ? ` (target ${at.target}, ghi lúc ${at.at})` : "") +
        ` — một dòng TRƯỚC đó đã bị sửa, xoá, hoặc đảo thứ tự sau khi ghi.`,
      file: `${GANAS_DIR}/${LEDGER_FILE}`,
      hint:
        `Sổ cái là append-only; hash-chain giữ dấu vết cho MỌI dòng sau một chỗ bị ` +
        `sửa, không chỉ dòng bị sửa. Xem git history quanh dòng này để biết ai đổi gì.`,
    });
  }

  /* --- .gitignore: local-only phải được loại trừ ----------------------- */

  // Dự án không dùng git thì "local vs shared qua git" vô nghĩa — bỏ qua,
  // khớp hành vi `ensureGitignore()` lúc `ganas init`.
  if (exists(join(graph.root, ".git"))) {
    const lines = new Set((graph.gitignoreRaw ?? "").split("\n").map((l) => l.trim()));
    const missing = LOCAL_ONLY.filter((p) => !lines.has(`.ganas/${p}`));
    if (missing.length > 0) {
      diags.push({
        severity: "error",
        code: "spine/gitignore-missing-local",
        message:
          `.gitignore thiếu ${missing.map((p) => `.ganas/${p}`).join(", ")} — trạng thái riêng ` +
          `của máy có thể bị commit nhầm`,
        file: ".gitignore",
        hint: `Thêm các dòng trên vào .gitignore (hoặc chạy lại \`ganas init\` để tự bổ sung).`,
      });
    }
  }

  return diags;
}
