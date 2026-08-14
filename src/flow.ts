import { existsSync } from "node:fs";

import { evaluateGate, type GateResult } from "./gate.js";
import type { VerificationState } from "./graph/freshness.js";
import { findGanasRoot } from "./graph/paths.js";
import { selectNextTask } from "./graph/select.js";
import type { Graph } from "./graph/types.js";
import { validateGraph } from "./graph/validate.js";
import type { Task } from "./model/index.js";

/**
 * DÒNG CHẢY — trạng thái dự án → **đúng một** bước kế tiếp.
 *
 * Trước khi có file này, ganas là 12 lệnh và người dùng phải tự biết lúc nào gọi
 * cái nào. Khoảng trống đó chính là nơi ngõ cụt sinh ra: `ganas next` trên dự án
 * chưa có task nào từng nói "không còn task nào chưa xong" — một trạng thái
 * KHÔNG CÓ bước kế tiếp, và không ai phát hiện cho tới khi đo chi phí khởi động.
 *
 * Hai tính chất phải giữ, và cả hai đều kiểm được bằng máy:
 *
 *  1. **Mọi trạng thái đều có bước kế tiếp.** Ngõ cụt không còn là thứ phải đi
 *     tìm — nó là một test đỏ.
 *  2. **Bảng, không phải cây if.** Chuyển việc rẽ nhánh từ đầu người dùng sang
 *     một hàm 500 dòng thì chỉ đổi chỗ đau. Mỗi chặng là một dòng dữ liệu:
 *     điều kiện xong, việc phải làm, lệnh để làm.
 *
 * Thứ tự chặng là thứ tự PHỤ THUỘC, không phải thứ tự ưa thích: không có phạm vi
 * thì task không neo vào đâu; graph hỏng thì mọi kết luận phía sau đều không tin
 * được, nên nó chặn trước.
 */

export interface FlowContext {
  root: string | null;
  graph: Graph | null;
  freshness: Map<string, VerificationState>;
  task: Task | null;
  /** Task đang được ghim trong `state.json` — `ganas next` đặt nó. */
  boundTask: string | null;
  gate: GateResult | null;
  /**
   * Có thay đổi chưa commit **trong phạm vi mà `ganas commit` sẽ stage** —
   * không phải cả cây làm việc. Dùng cả cây thì một file lạc không liên quan
   * cũng khiến chặng `commit` không bao giờ qua được, và dòng chảy kẹt vĩnh
   * viễn ở đó trong mọi repo thật.
   */
  dirty: boolean;
}

export interface Stage {
  id: string;
  /** Chặng này đã qua chưa. `false` ⇒ đây là bước kế tiếp. */
  done: (c: FlowContext) => boolean;
  /** Việc phải làm, viết cho người đọc. */
  action: (c: FlowContext) => string;
  /** Vì sao chặng này tồn tại — người bỏ qua nó sẽ hỏng ở đâu. */
  why: string;
  /** Lệnh chạy được, nếu có. Không có ⇒ phải viết tay (xem `template`). */
  command?: (c: FlowContext) => string;
  /** YAML dán được, cho các chặng chưa có lệnh. */
  template?: (c: FlowContext) => string;
}

const activeGoals = (g: Graph) => [...g.goals.values()].filter((x) => x.value.status === "active");

const servingDesigns = (g: Graph) =>
  [...g.designs.values()].filter(
    (d) => d.value.status !== "archived" && d.value.serves.some((id) => g.goals.has(id)),
  );

/**
 * Các chặng, theo đúng thứ tự phụ thuộc. Bước kế tiếp = chặng ĐẦU TIÊN chưa
 * `done`. Thêm chặng mới thì chèn đúng chỗ nó bị chặn bởi chặng trước.
 */
export const STAGES: Stage[] = [
  {
    id: "init",
    why: "Chưa có `.ganas/` thì không có gì để neo tri thức vào.",
    done: (c) => c.root !== null,
    action: () => "Khởi tạo ganas cho dự án này",
    command: () => "ganas init",
  },
  {
    id: "fix-graph",
    why: "Graph hỏng thì mọi kết luận phía sau đều không tin được — sửa trước, đừng đi tiếp.",
    done: (c) => !c.graph || validateGraph(c.graph).every((d) => d.severity !== "error"),
    action: (c) => {
      // Nêu ĐÚNG lỗi, không chỉ đếm: "sửa 3 lỗi" rồi bảo chạy `validate` là đẩy
      // thêm một bước tra cứu sang người dùng, đúng thứ dòng chảy sinh ra để bỏ.
      const errs = c.graph ? validateGraph(c.graph).filter((d) => d.severity === "error") : [];
      const first = errs[0];
      if (!first) return "Sửa lỗi trong graph";
      const where = first.line === undefined ? first.file : `${first.file}:${first.line}`;
      return (
        `Sửa ${errs.length} lỗi trong graph. Lỗi đầu tiên:\n` +
        `    ${where}\n    ${first.message}` +
        (first.hint ? `\n    → ${first.hint}` : "")
      );
    },
    command: () => "ganas validate",
  },
  {
    id: "scope",
    why: "Phạm vi là ranh giới của cả việc lẫn tri thức. Task và fact đều phải thuộc về một cái.",
    done: (c) => !c.graph || c.graph.scopes.size > 0,
    action: () => "Dịch yêu cầu thành một phạm vi công việc (4 câu)",
    command: () => "ganas scope new",
  },
  {
    id: "goal",
    why: "Không có mục tiêu đo được thì không có cách nào biết việc đang làm có đáng làm không.",
    done: (c) => !c.graph || activeGoals(c.graph).length > 0,
    action: () => "Sửa `.ganas/goals/G-001.yaml` thành mục tiêu thật, rồi cho người duyệt",
    template: () => `# .ganas/goals/G-001.yaml
title: "<kết quả người dùng cảm nhận được>"
outcome: "<họ thấy gì khác đi sau khi việc này xong>"
acceptance:
  - id: A-1
    kind: command
    run: "<lệnh chấm được có/không>"
status: active
approved_by: "@<ten-nguoi-duyet>"   # model KHÔNG được tự chốt mục tiêu
approved_at: <ISO date>`,
  },
  {
    id: "design",
    why: "Design là chỗ ghi VÌ SAO chọn cách này. Không có nó, phiên sau đề xuất lại đúng cái đã bị loại.",
    done: (c) => !c.graph || servingDesigns(c.graph).length > 0,
    action: (c) =>
      `Viết một design phục vụ ${c.graph ? activeGoals(c.graph)[0]?.value.id : "goal"}`,
    template: (c) => `# .ganas/designs/D-001.yaml
id: D-001
title: "<cách tiếp cận, một câu>"
serves: [${c.graph ? (activeGoals(c.graph)[0]?.value.id ?? "G-001") : "G-001"}]
summary: "<cách làm, và vì sao chọn nó thay vì phương án khác>"
status: active`,
  },
  {
    id: "evidence",
    why: "Task khai `touches` phải trỏ vào một bằng chứng CÓ THẬT của khối. Khối `verify: []` thì không có gì để trỏ, và `ganas scope new` cố ý tạo khối rỗng — nó không đoán hộ cách kiểm vùng code của bạn.",
    done: (c) => !c.graph || unverifiedModules(c).length === 0,
    action: (c) => `Thêm bằng chứng cho khối: ${unverifiedModules(c).join(", ")}`,
    template: (c) => {
      const id = unverifiedModules(c)[0] ?? "M-x";
      const mod = c.graph?.modules.get(id)?.value;
      const llm = mod?.nature === "llm";
      return `# .ganas/modules/${id}.yaml — thêm vào cuối
verify:
  - id: V-${id.replace(/^M-/, "")}-smoke
    kind: ${llm ? "eval" : "probe"}
    run: "<lệnh kiểm vùng code này>"${
      llm
        ? `\n    adapter: json\n    threshold: 0.8\n# nature: llm ⇒ BẮT BUỘC eval: probe kiểm được cấu trúc,\n# không kiểm được hành vi của LLM.`
        : ""
    }`;
    },
  },
  {
    id: "task",
    why: "Task là đơn vị vừa một phiên. Không có task thì phiên không biết bắt đầu từ đâu.",
    done: (c) => !c.graph || selectNextTask(c.graph) !== null,
    action: () => "Viết một task làm được ngay trong phiên tới",
    template: (c) => {
      const g = c.graph;
      const scope = g ? [...g.scopes.values()][0]?.value : undefined;
      const mod = scope?.modules[0] ?? "M-x";
      return `# .ganas/tasks/T-001.yaml
id: T-001
title: "<việc cụ thể, làm xong trong một phiên>"
serves: [${g ? (activeGoals(g)[0]?.value.id ?? "G-001") : "G-001"}]
implements: ${g ? (servingDesigns(g)[0]?.value.id ?? "D-001") : "D-001"}
scope: ${scope?.id ?? "P-x"}
status: todo
touches: [${mod}]
exit_contract:
  # Chạm khối nào thì phải để lại bằng chứng cho khối đó.
  - kind: verification
    target: ${mod}/<V-id-bằng-chứng>`;
    },
  },
  {
    id: "work",
    why: "Brief nạp đúng ngữ cảnh của task: phạm vi, mục tiêu, tri thức dùng được và tri thức phải kiểm lại.",
    // Xong = đã MỞ brief cho đúng task này (`ganas next` ghim task vào state).
    // KHÔNG dùng "bằng chứng đã tươi" — đó là điều kiện của chặng `verify`, và
    // hai chặng dùng chung một điều kiện thì chặng trước không bao giờ vượt
    // được bằng chính việc nó bảo làm. Mỗi chặng phải qua được bởi hành động
    // của chính nó, nếu không dòng chảy kẹt.
    done: (c) => c.task === null || c.boundTask === c.task.id,
    action: () => "Mở phiên và làm task — đọc brief trước, đừng đoán",
    command: () => "ganas next",
  },
  {
    id: "verify",
    why: "Bằng chứng cũ không nói về code hiện tại. `gate` chỉ ĐỌC sổ cái, nó không tự chạy lại giúp.",
    done: (c) => needsVerify(c).length === 0,
    action: (c) => `Chạy lại bằng chứng: ${needsVerify(c).join(", ")}`,
    command: (c) => `ganas verify ${needsVerify(c).join(" ")}`,
  },
  {
    id: "gate",
    why: '"Xong" là thứ chấm được, không phải cảm giác.',
    done: (c) => c.gate === null || c.gate.ok,
    action: () => "Còn tiêu chí hoàn thành chưa đạt — sửa tiếp rồi chấm lại",
    command: () => "ganas gate",
  },
  {
    id: "commit",
    why: "Commit message dựng từ dữ liệu đã kiểm chứng, không phải từ trí nhớ.",
    done: (c) => !c.dirty,
    action: () => "Commit task đã đạt gate",
    command: () => "ganas commit",
  },
  {
    id: "close",
    why: "Task chưa đánh dấu `done` thì phiên sau vẫn chọn lại nó.",
    done: (c) => c.task === null || c.task.status === "done",
    action: (c) =>
      `Đánh dấu ${c.task?.id ?? "task"} xong trong YAML: \`status: done\` + \`done_at\``,
  },
];

/** Khối thuộc một phạm vi mà chưa có bằng chứng nào — không thể trỏ `exit_contract` vào. */
function unverifiedModules(c: FlowContext): string[] {
  if (!c.graph) return [];
  return [...c.graph.modules.values()]
    .filter((m) => m.value.scope !== undefined && m.value.verify.length === 0)
    .map((m) => m.value.id);
}

/** Bằng chứng mà task đang làm cần chạy lại. */
function needsVerify(c: FlowContext): string[] {
  if (!c.task || !c.graph) return [];
  const out: string[] = [];
  for (const criterion of c.task.exit_contract) {
    if (criterion.kind !== "verification") continue;
    const state = c.freshness.get(criterion.target);
    if (!state || state.freshness !== "fresh") out.push(criterion.target);
  }
  return out;
}

export interface FlowStep {
  stage: Stage;
  action: string;
  command: string | undefined;
  template: string | undefined;
  /** Số chặng đã qua / tổng — để người dùng biết mình đang ở đâu. */
  at: number;
  total: number;
}

/**
 * Bước kế tiếp = chặng đầu tiên chưa xong.
 *
 * Trả `null` CHỈ khi mọi chặng đều xong — và ngay cả khi đó cũng không phải ngõ
 * cụt: `close` xong thì `task` lại chưa xong ở vòng sau, dòng chảy quay về đầu
 * vòng làm việc.
 */
export function nextStep(c: FlowContext): FlowStep | null {
  for (const [i, stage] of STAGES.entries()) {
    if (stage.done(c)) continue;
    return {
      stage,
      action: stage.action(c),
      command: stage.command?.(c),
      template: stage.template?.(c),
      at: i + 1,
      total: STAGES.length,
    };
  }
  return null;
}

/** Dựng bối cảnh dòng chảy từ thư mục hiện tại. */
export async function flowContext(cwd: string): Promise<FlowContext> {
  const root = findGanasRoot(cwd);
  if (!root) {
    return {
      root: null,
      graph: null,
      freshness: new Map(),
      task: null,
      boundTask: null,
      gate: null,
      dirty: false,
    };
  }

  const { loadGraph } = await import("./graph/load.js");
  const { computeFreshness } = await import("./graph/freshness.js");
  const { runShell } = await import("./util/exec.js");

  const graph = await loadGraph(root);
  const freshness = await computeFreshness(graph);
  const picked = selectNextTask(graph);
  const task = picked?.task.value ?? null;
  const gate = task ? await evaluateGate(graph, task, freshness) : null;

  // Hỏi git đúng những đường dẫn mà `ganas commit` sẽ stage — một nguồn sự thật,
  // không tự đoán lại danh sách đó ở đây.
  // `taskBoundary` chỉ trả pathspec CODE (từ v0.2.1 nó không còn nuốt cả
  // `.ganas`). Ở đây vẫn hỏi cả `.ganas` vì flow chỉ cần biết "có gì để commit
  // không", không cần biết thứ đó thuộc task nào.
  const { taskBoundary } = await import("./boundary.js");
  const paths = task ? [...taskBoundary(task, graph), ".ganas"] : [".ganas"];
  const spec = paths.map((p) => JSON.stringify(p)).join(" ");
  const status = await runShell(`git status --porcelain -- ${spec}`, {
    cwd: root,
    timeoutMs: 5000,
  });
  const dirty = status.code === 0 && status.stdout.trim().length > 0;

  const { readState } = await import("./state.js");
  const boundTask = (await readState(root)).current_task;

  return { root, graph, freshness, task, boundTask, gate, dirty };
}

/** Có `.git` không — `dirty` vô nghĩa với dự án không dùng git. */
export function hasGit(root: string): boolean {
  return existsSync(`${root}/.git`);
}
