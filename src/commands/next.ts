import { claimNextTask } from "../graph/claim.js";
import { blockedTasks, rankedCandidates } from "../graph/select.js";
import { renderBrief } from "../render/brief.js";
import { bindSession, updateState } from "../state.js";
import { type Argv, flag, option } from "../util/args.js";
import { openProject, volatileStatus } from "./_common.js";

export async function run(argv: Argv): Promise<number> {
  const { root, graph, freshness } = await openProject(argv);

  const ranked = rankedCandidates(graph);

  if (ranked.length === 0) {
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
      // Phân biệt "đã xong hết" với "chưa có gì": dự án vừa init có 0 task, mà
      // báo "không còn task nào chưa xong" là nói ngược sự thật — và đó lại là
      // câu đầu tiên người mới nhìn thấy.
      const empty = graph.tasks.size === 0;
      process.stdout.write(
        (empty ? `Dự án chưa có task nào.\n\n` : `Không còn task nào chưa xong.\n\n`) +
          (empty && graph.scopes.size === 0
            ? `Trước hết cần một phạm vi công việc — task phải thuộc về một cái:\n` +
              `  ganas scope new\n\n`
            : "") +
          `Thêm task mới vào .ganas/tasks/ (nhớ khai serves, implements, scope, exit_contract),\n` +
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

  const sessionId = option(argv, "session");
  // Không có --session (gọi tay từ CLI) vẫn cần một danh tính để tham gia
  // đúng giao thức claim — nếu không, nó có thể giành lại task một phiên
  // Claude Code khác đang thật sự giữ.
  const picked = await claimNextTask(graph, root, sessionId ?? "cli");

  if (!picked) {
    if (flag(argv, "json")) {
      process.stdout.write(
        JSON.stringify({ task: null, held_by_others: ranked.length }, null, 2) + "\n",
      );
      return 0;
    }
    process.stdout.write(
      `${ranked.length} task còn làm được, nhưng tất cả đang bị phiên khác giữ:\n\n` +
        ranked.map((c) => `  ${c.task.value.id} — ${c.task.value.title}\n`).join("") +
        `\nThử lại sau, hoặc chờ phiên đang giữ giải phóng.\n`,
    );
    return 0;
  }

  const taskId = picked.task.value.id;

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
