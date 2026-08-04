import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ExitCriterion } from "../model/index.js";
import { evalWeakness, formatAnchor, freshnessOf } from "../model/index.js";
import { lineOfPath } from "../util/yaml.js";
import { defHash, entryAt, LEDGER_FILE, ledgerCorruption, verifyChain } from "../verify/ledger.js";
import { lintProbe } from "../verify/lint.js";
import { GANAS_DIR, LOCAL_ONLY } from "./paths.js";
import type { Diagnostic, Graph, Sourced } from "./types.js";

/**
 * Validator chéo — luật spine.
 *
 * Luật hình thức (thiếu field bắt buộc) đã do zod chặn ở tầng schema. Ở đây là
 * các luật cần nhìn cả graph: liên kết treo, mục tiêu mồ côi, vòng lặp, và tính
 * nhất quán giữa task / design / phạm vi.
 */

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

export function validateGraph(graph: Graph): Diagnostic[] {
  const diags: Diagnostic[] = [...graph.loadDiagnostics];

  /* --- Design: liên kết goal, mồ côi ---------------------------------- */

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

  // Khối mồ côi: không tới được từ `entry` của phạm vi. Cạnh xuôi = ngược `depends_on`.
  for (const scope of graph.scopes.values()) {
    const sc = scope.value;
    const inScope = new Set<string>(sc.modules);
    const forward = new Map<string, string[]>();
    for (const id of inScope) forward.set(id, []);
    for (const id of inScope) {
      const mod = graph.modules.get(id);
      if (!mod) continue;
      for (const dep of mod.value.depends_on) {
        if (inScope.has(dep)) forward.get(dep)!.push(id);
      }
    }

    const seen = new Set<string>();
    const queue = inScope.has(sc.entry) ? [sc.entry] : [];
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of forward.get(cur) ?? []) queue.push(next);
    }

    for (const id of sc.modules) {
      if (!seen.has(id) && graph.modules.has(id)) {
        diags.push({
          severity: "warning",
          code: "scope/module-orphaned",
          message: `khối ${id} không tới được từ ${sc.entry} — nó nằm ngoài luồng của phạm vi ${sc.id}`,
          file: scope.file,
          line: at(graph, scope, "modules"),
          hint: `Nối nó vào sơ đồ qua \`depends_on\`, hoặc bỏ khỏi \`modules\` của phạm vi.`,
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
  if (existsSync(join(graph.root, ".git"))) {
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
