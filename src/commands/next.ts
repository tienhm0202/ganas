import { blockedTasks, selectNextTask } from "../graph/select.js";
import { renderBrief } from "../render/brief.js";
import { bindSession, updateState } from "../state.js";
import { type Argv, flag, option } from "../util/args.js";
import { openProject, volatileStatus } from "./_common.js";

export async function run(argv: Argv): Promise<number> {
  const { root, graph, freshness } = await openProject(argv);

  const picked = selectNextTask(graph);

  if (!picked) {
    const blocked = blockedTasks(graph);
    if (flag(argv, "json")) {
      process.stdout.write(
        JSON.stringify(
          {
            task: null,
            blocked: blocked.map((c) => ({ id: c.task.value.id, blockers: c.blockers })),
          },
          null,
          2,
        ) + "\n",
      );
      return 0;
    }

    if (blocked.length === 0) {
      process.stdout.write(
        `Không còn task nào chưa xong.\n\n` +
          `Thêm task mới vào .ganas/tasks/ (nhớ khai serves, implements, sprint, exit_contract),\n` +
          `rồi chạy: ganas validate\n`,
      );
      return 0;
    }

    process.stdout.write(`Mọi task còn lại đều đang bị chặn:\n\n`);
    for (const c of blocked) {
      process.stdout.write(
        `  ${c.task.value.id} — ${c.task.value.title}\n    chờ: ${c.blockers.join(", ")}\n`,
      );
    }
    return 0;
  }

  const taskId = picked.task.value.id;
  const sessionId = option(argv, "session");

  // Ghi lại lựa chọn để `ganas brief`, gate và hook biết phiên này đang làm gì.
  if (sessionId) await bindSession(root, sessionId, taskId);
  else await updateState(root, (s) => void (s.current_task = taskId));

  if (flag(argv, "json")) {
    const brief = renderBrief({ graph, task: picked.task, freshness });
    process.stdout.write(JSON.stringify({ task: taskId, brief }, null, 2) + "\n");
    return 0;
  }

  const volatile = argv.flags["volatile"] === false ? undefined : await volatileStatus(root);
  process.stdout.write(renderBrief({ graph, task: picked.task, freshness, volatile }) + "\n");
  return 0;
}
