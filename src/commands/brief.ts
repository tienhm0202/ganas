import { flag, option, type Argv } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { renderBrief } from "../render/brief.js";
import { taskForSession } from "../state.js";
import { openProject, volatileStatus } from "./_common.js";

export async function run(argv: Argv): Promise<number> {
  const { root, graph, freshness } = await openProject(argv);

  const sessionId = option(argv, "session");
  const taskId =
    argv.positional[0] ?? option(argv, "task") ?? (await taskForSession(root, sessionId));

  if (!taskId) {
    throw new GanasError(
      `chưa biết đang làm task nào.\n` +
        `  Chọn task kế tiếp: ganas next\n` +
        `  Hoặc chỉ định:      ganas brief T-001`,
    );
  }

  const task = graph.tasks.get(taskId);
  if (!task) {
    throw new GanasError(
      `không có task ${taskId}.\n` +
        `  Task hiện có: ${[...graph.tasks.keys()].sort().join(", ") || "(chưa có task nào)"}`,
    );
  }

  // `--no-volatile` cho ra brief thuần xác định — dùng khi so sánh/kiểm thử.
  const volatile = argv.flags["volatile"] === false ? undefined : await volatileStatus(root);
  const text = renderBrief({ graph, task, freshness, volatile });

  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify({ task: taskId, brief: text }, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(text + "\n");
  return 0;
}
