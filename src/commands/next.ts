import { criterionKey, evaluateGate, isAutoCriterion } from "../gate.js";
import { claimNextTask } from "../graph/claim.js";
import type { VerificationState } from "../graph/freshness.js";
import { blockedTasks, rankedCandidates } from "../graph/select.js";
import type { Graph } from "../graph/types.js";
import type { Task } from "../model/index.js";
import { renderBrief } from "../render/brief.js";
import { renderGroupedByScope } from "../render/group.js";
import { bindSession, setBaseline, updateState } from "../state.js";
import { type Argv, enabled, flag, option } from "../util/args.js";
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

    process.stdout.write(
      `Mọi task còn lại đều đang bị chặn:\n\n` +
        renderGroupedByScope(
          graph,
          blocked,
          (c) => c.task.value,
          (c) => `${c.task.value.id} — ${c.task.value.title}\n  chờ: ${c.blockers.join(", ")}`,
        ),
    );
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
        renderGroupedByScope(
          graph,
          ranked,
          (c) => c.task.value,
          (c) => `${c.task.value.id} — ${c.task.value.title}`,
        ) +
        `\nThử lại sau, hoặc chờ phiên đang giữ giải phóng.\n`,
    );
    return 0;
  }

  const taskId = picked.task.value.id;

  // Ghi lại lựa chọn để `ganas brief`, gate và hook biết phiên này đang làm gì.
  if (sessionId) await bindSession(root, sessionId, taskId);
  else await updateState(root, (s) => void (s.current_task = taskId));

  const baselineGreen = sessionId
    ? await recordBaseline(root, graph, picked.task.value, freshness, argv)
    : [];

  if (flag(argv, "json")) {
    const brief = renderBrief({ graph, task: picked.task, freshness });
    process.stdout.write(JSON.stringify({ task: taskId, brief }, null, 2) + "\n");
    return 0;
  }

  const volatile = argv.flags["volatile"] === false ? undefined : await volatileStatus(root);
  process.stdout.write(renderBrief({ graph, task: picked.task, freshness, volatile }) + "\n");

  if (baselineGreen.length > 0) {
    process.stdout.write(
      `\n⚠ ${baselineGreen.length} tiêu chí trong \`exit_contract\` của ${taskId} ĐÃ ĐẠT ` +
        `ngay lúc này, trước khi làm gì:\n` +
        baselineGreen.map((l) => `    ${l}`).join("\n") +
        `\n\n  Hoặc task này đã xong từ trước, hoặc những tiêu chí đó không gác gì —\n` +
        `  chúng sẽ vẫn xanh dù không viết dòng nào. Sửa \`exit_contract\` để nó đòi\n` +
        `  đúng thứ task này phải tạo ra, trước khi bắt đầu.\n`,
    );
  }
  return 0;
}

/**
 * Chấm `exit_contract` NGAY lúc nhận task và ghi lại làm mốc.
 *
 * Tiêu chí đã xanh ở đây mà lúc commit vẫn xanh thì nó không gác gì. Đây là chỗ
 * đáng biết nhất — lúc VIẾT task, không phải lúc chấm gate: một task sửa bug có
 * gate xanh 2/2 trước khi sửa nghĩa là gate đó không tồn tại.
 *
 * Trả về nhãn của những tiêu chí đã xanh sẵn.
 */
async function recordBaseline(
  root: string,
  graph: Graph,
  task: Task,
  freshness: Map<string, VerificationState>,
  argv: Argv,
): Promise<string[]> {
  if (!enabled(argv, "baseline")) return [];

  const sessionId = option(argv, "session")!;
  // Chỉ chấm tiêu chí tự động: `manual` luôn chờ người, `handoff` luôn đỏ khi
  // phiên vừa mở — đo hai thứ đó lúc bắt đầu không nói lên gì, chỉ tốn thời gian.
  const auto = task.exit_contract.filter(isAutoCriterion);
  if (auto.length === 0) return [];

  const gate = await evaluateGate(
    graph,
    { ...task, exit_contract: auto },
    freshness,
  );

  const baseline: Record<string, boolean> = {};
  for (const r of gate.results) baseline[criterionKey(r.criterion)] = r.status === "pass";
  await setBaseline(root, sessionId, baseline);

  return gate.results.filter((r) => r.status === "pass").map((r) => r.label);
}
