import { flag, option, type Argv } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { openProject } from "./_common.js";
import { evaluateGate } from "../gate.js";
import { generateHandoff } from "../handoff.js";
import { taskForSession } from "../state.js";

export async function run(argv: Argv): Promise<number> {
  const { root, graph, freshness } = await openProject(argv);

  const sessionId = option(argv, "session");
  if (!sessionId) {
    throw new GanasError(
      "cần --session <id> — handoff gắn với đúng một phiên, ganas không tự đoán được phiên nào.",
    );
  }

  const taskId = option(argv, "task") ?? (await taskForSession(root, sessionId));
  if (!taskId) throw new GanasError(`không biết phiên ${sessionId} đang làm task nào`);

  const sourced = graph.tasks.get(taskId);
  if (!sourced) throw new GanasError(`không có task ${taskId}`);

  const gate = await evaluateGate(graph, sourced.value, freshness, sessionId);
  const { path, content } = await generateHandoff(root, graph, sourced.value, gate, {
    sessionId,
    transcriptPath: option(argv, "transcript"),
  });

  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify({ path, ok: gate.ok }, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(`Đã ghi handoff: ${path}\n\n${content}`);
  return 0;
}
