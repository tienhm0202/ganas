import {
  formatBoundaryWarning,
  formatDesignDriftWarning,
  formatDispatchWarning,
  outsideBoundary,
  taskBoundary,
} from "../boundary.js";
import { gitTouchedPaths } from "../commit.js";
import { alreadyGreen, evaluateExitContract, evaluateGate, formatGate } from "../gate.js";
import type { FactFreshness } from "../graph/freshness.js";
import type { Graph } from "../graph/types.js";
import { baselineFor, sessionRecord, subagentTouchedFor, taskForSession } from "../state.js";
import { type Argv, flag, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { openProject } from "./_common.js";

export async function run(argv: Argv): Promise<number> {
  const { root, graph, freshness } = await openProject(argv);

  const sessionId = option(argv, "session");

  const designId = option(argv, "design");
  if (designId) return gateDesign({ root, graph, freshness, designId, argv });

  const taskId =
    argv.positional[0] ?? option(argv, "task") ?? (await taskForSession(root, sessionId));

  if (!taskId) throw new GanasError("chưa biết đang làm task nào — chạy `ganas next` trước");

  const task = graph.tasks.get(taskId);
  if (!task) throw new GanasError(`không có task ${taskId}`);

  const result = await evaluateGate(graph, task.value, freshness, sessionId);
  const green = alreadyGreen(result, await baselineFor(root, sessionId, taskId));

  // Nguồn `touched` là GIT (gitTouchedPaths), không phải sổ phiên — sổ phiên
  // gần như luôn rỗng nên cảnh báo boundary từng im suốt (ICE-008).
  const touched = await gitTouchedPaths(root);
  const boundary = taskBoundary(task.value, graph);
  const outside = outsideBoundary(task.value, graph, touched);

  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          subject: result.subject,
          ok: result.ok,
          unmet: result.unmet.map((u) => ({ label: u.label, reason: u.reason })),
          pending_human: result.pendingHuman.map((p) => p.label),
          already_green_at_start: green.map((g) => g.label),
          outside_boundary: outside,
        },
        null,
        2,
      ) + "\n",
    );
    return result.ok ? 0 : 1;
  }

  process.stdout.write(`Điều kiện hoàn thành của ${result.subject}:\n${formatGate(result)}\n\n`);

  if (green.length > 0) {
    process.stdout.write(
      `⚠ ${green.length} tiêu chí đã XANH SẴN từ trước khi bắt đầu task:\n` +
        green.map((g) => `    ${g.label}`).join("\n") +
        `\n  Hoặc task này đã xong từ trước, hoặc tiêu chí đó không gác gì.\n` +
        `  Một gate tự xanh trước khi sửa là gate không tồn tại.\n\n`,
    );
  }

  // Hàm trả chuỗi kết thúc bằng một `\n` (quy ước của `reportBaseline`, nơi nó
  // được NỐI vào chuỗi khác). Ở đây nó đứng riêng một khối nên cần thêm dòng
  // trống, cho khớp khoảng cách của khối XANH SẴN ngay trên.
  const boundaryWarning = formatBoundaryWarning(taskId, boundary, touched, outside);
  if (boundaryWarning) process.stdout.write(`${boundaryWarning}\n`);

  // Cảnh báo giao việc chỉ có nghĩa khi TASK ĐANG CHẤM đúng là task mà PHIÊN
  // NÀY đang bind vào (T-096, sửa ICE-033). `subagentTouchedFor` trả `false`
  // cho một task đi ngang MỘT CÁCH CÓ CHỦ Ý (xem docstring của nó trong
  // state.ts) — nhưng gọi nó rồi phát cảnh báo cho task mà phiên không bind
  // vào thì tiền đề của cảnh báo sai ngay từ đầu: ganas không biết gì về việc
  // giao sub-agent cho một task đi ngang, và "không biết" phải im chứ không
  // được đoán. Không có `sessionId` cũng xếp vào "không biết" — im, KHÔNG rơi
  // về hành vi cũ (luôn nổ khi thiếu session): thiếu session nghĩa là không
  // có phiên nào để nói "phiên này đã bind vào task đó".
  const boundTaskId = sessionId ? (await sessionRecord(root, sessionId))?.task : undefined;
  const dispatchWarning =
    boundTaskId === taskId
      ? formatDispatchWarning(
          taskId,
          task.value.model,
          await subagentTouchedFor(root, sessionId, taskId),
        )
      : "";
  if (dispatchWarning) process.stdout.write(`${dispatchWarning}\n`);

  const driftWarning = formatDesignDriftWarning(task.value, graph, freshness);
  if (driftWarning) process.stdout.write(`${driftWarning}\n`);

  if (result.ok) {
    process.stdout.write(`✓ Mọi tiêu chí chấm tự động đều đạt.\n`);
    if (result.pendingHuman.length > 0) {
      process.stdout.write(
        `\nCòn ${result.pendingHuman.length} tiêu chí cần người xác nhận trước khi ` +
          `đánh dấu task done:\n` +
          result.pendingHuman.map((p) => `  … ${p.label}`).join("\n") +
          "\n",
      );
    }
    return 0;
  }

  process.stdout.write(`✗ Còn ${result.unmet.length} tiêu chí chưa đạt.\n`);
  return 1;
}

/**
 * Chấm hợp đồng ra của một CHẶNG (`Design.exit_contract`).
 *
 * Nhánh riêng chứ không nhánh chung với task, vì ba cảnh báo của lối task
 * (`alreadyGreen`, ranh giới code, giao sub-agent) đều là khái niệm của TASK:
 * chặng không có baseline phiên, không có `touches`, không có `model`. Phần
 * duy nhất dùng chung — chấm tiêu chí — đã dùng chung thật, qua
 * `evaluateExitContract`.
 */
async function gateDesign(ctx: {
  root: string;
  graph: Graph;
  freshness: Map<string, FactFreshness>;
  designId: string;
  argv: Argv;
}): Promise<number> {
  const { root, graph, freshness, designId, argv } = ctx;

  const sourced = graph.designs.get(designId);
  if (!sourced) throw new GanasError(`không có design ${designId}`);
  const design = sourced.value;

  // Hợp đồng rỗng KHÔNG được tính là đạt. Một gate tự xanh vì không có gì để
  // chấm là gate không tồn tại — và đó đúng là ca `spine/design-missing-exit-contract`
  // cảnh báo, nên câu trả lời ở đây phải trùng hướng với luật đó.
  if (design.exit_contract.length === 0) {
    const message =
      `${designId} chưa khai \`exit_contract\` — không có gì để chấm.\n` +
      `Chặng không có hợp đồng ra thì "đóng được chưa" là ý kiến, không phải kết quả đo.\n`;
    if (flag(argv, "json")) {
      process.stdout.write(
        JSON.stringify({ subject: designId, ok: false, unmet: [], pending_human: [] }, null, 2) +
          "\n",
      );
      return 1;
    }
    process.stdout.write(message);
    return 1;
  }

  const result = await evaluateExitContract(designId, design.exit_contract, { root, freshness });

  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          subject: result.subject,
          ok: result.ok,
          unmet: result.unmet.map((u) => ({ label: u.label, reason: u.reason })),
          pending_human: result.pendingHuman.map((p) => p.label),
          open_tasks: openTaskIds(graph, designId),
        },
        null,
        2,
      ) + "\n",
    );
    return result.ok ? 0 : 1;
  }

  process.stdout.write(
    `Hợp đồng của chặng ${design.id} — ${design.title}:\n${formatGate(result)}\n\n`,
  );

  const open = openTaskIds(graph, designId);
  if (open.length > 0) {
    process.stdout.write(
      `⚠ Chặng còn ${open.length} task chưa xong: ${open.join(", ")}\n` +
        `  Hợp đồng chặng xanh trong khi task còn mở nghĩa là hợp đồng đo thiếu.\n\n`,
    );
  }

  if (result.ok) {
    process.stdout.write(`✓ Mọi tiêu chí chấm tự động của chặng đều đạt.\n`);
    if (result.pendingHuman.length > 0) {
      process.stdout.write(
        `\nCòn ${result.pendingHuman.length} tiêu chí cần người xác nhận trước khi ` +
          `đóng chặng:\n` +
          result.pendingHuman.map((p) => `  … ${p.label}`).join("\n") +
          "\n",
      );
    }
    return 0;
  }

  process.stdout.write(`✗ Còn ${result.unmet.length} tiêu chí chưa đạt — chặng chưa đóng được.\n`);
  return 1;
}

function openTaskIds(graph: Graph, designId: string): string[] {
  return [...graph.tasks.values()]
    .filter((t) => t.value.implements === designId && t.value.status !== "done")
    .map((t) => t.value.id)
    .sort((a, b) => a.localeCompare(b));
}
