import { flag, option, type Argv } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { evaluateGate, formatGate } from "../gate.js";
import { taskForSession } from "../state.js";
import { openProject } from "./_common.js";

export async function run(argv: Argv): Promise<number> {
  const { root, graph, freshness } = await openProject(argv);

  const sessionId = option(argv, "session");
  const taskId =
    argv.positional[0] ?? option(argv, "task") ?? (await taskForSession(root, sessionId));

  if (!taskId) throw new GanasError("chưa biết đang làm task nào — chạy `ganas next` trước");

  const task = graph.tasks.get(taskId);
  if (!task) throw new GanasError(`không có task ${taskId}`);

  const result = await evaluateGate(graph, task.value, freshness, sessionId);

  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          task: result.task,
          ok: result.ok,
          unmet: result.unmet.map((u) => ({ label: u.label, reason: u.reason })),
          pending_human: result.pendingHuman.map((p) => p.label),
        },
        null,
        2,
      ) + "\n",
    );
    return result.ok ? 0 : 1;
  }

  process.stdout.write(`Điều kiện hoàn thành của ${result.task}:\n${formatGate(result)}\n\n`);

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
