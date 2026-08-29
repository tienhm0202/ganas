import { criterionKey, evaluateGate, formatGate, isAutoCriterion } from "../gate.js";
import { claimNextTask } from "../graph/claim.js";
import type { VerificationState } from "../graph/freshness.js";
import { blockedTasks, rankedCandidates } from "../graph/select.js";
import type { Graph, Sourced } from "../graph/types.js";
import type { Task } from "../model/index.js";
import { renderBrief } from "../render/brief.js";
import { renderGroupedByScope } from "../render/group.js";
import { bindSession, setBaseline, taskForSession, updateState } from "../state.js";
import { type Argv, enabled, flag, option } from "../util/args.js";
import { openProject, volatileStatus } from "./_common.js";
import { setTaskStatus } from "./_task-status.js";

/**
 * Graph y hệt nhưng KHÔNG có một task — dùng cho `--switch`, để lượt chọn kế
 * tiếp không trả lại đúng cái task vừa bỏ dở.
 *
 * Bỏ hẳn khỏi `tasks` chứ không lọc ở tầng trên vì `rankedCandidates` cho
 * `in_progress` ưu tiên -1000: task đang dở LUÔN đứng đầu, nên `--switch` mà
 * không loại nó ra thì không chuyển đi đâu cả. Xoá một task CHƯA done khỏi map
 * không đổi kết quả của `openBlockers` — nó vốn đã coi blocker chưa done là
 * đang mở.
 */
function withoutTask(graph: Graph, taskId: string): Graph {
  const tasks = new Map(graph.tasks);
  tasks.delete(taskId);
  return { ...graph, tasks };
}

/**
 * Từ chối mở luồng thứ hai khi luồng cũ còn dở — kèm gate của chính nó, vì câu
 * hỏi tiếp theo của người đọc luôn là "còn thiếu gì".
 */
async function refuseSwitch(
  graph: Graph,
  open: Sourced<Task>,
  freshness: Map<string, VerificationState>,
  sessionId: string | undefined,
  argv: Argv,
): Promise<number> {
  const task = open.value;
  const gate = await evaluateGate(graph, task, freshness, sessionId);

  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          task: null,
          current_task: task.id,
          needs_switch: true,
          gate: {
            ok: gate.ok,
            results: gate.results.map((r) => ({ label: r.label, status: r.status })),
          },
        },
        null,
        2,
      ) + "\n",
    );
    return 1;
  }

  process.stdout.write(
    `Chưa mở task mới được — phiên này đang làm ${task.id} (\`${task.status}\`), chưa done:\n\n` +
      `  ${task.id} — ${task.title}\n\n` +
      `${formatGate(gate)}\n\n` +
      (gate.ok
        ? `  Gate đã xanh: \`ganas commit ${task.id}\` để đóng lại, rồi \`ganas next\`.\n`
        : `  Đóng luồng trước khi mở luồng: làm nốt ${task.id}, rồi \`ganas commit\`.\n`) +
      `  Thật sự cần bỏ dở để làm việc khác: \`ganas next --switch\` — ${task.id} vẫn giữ\n` +
      `  \`status: in_progress\` và sẽ được chọn lại trước tiên.\n`,
  );
  return 1;
}

export async function run(argv: Argv): Promise<number> {
  const { root, graph, freshness } = await openProject(argv);

  const sessionId = option(argv, "session");
  const switching = flag(argv, "switch");

  // "Đóng luồng trước khi mở luồng" là hàng rào, không phải điểm cộng trong hàm
  // xếp hạng: `rankedCandidates` chỉ ƯU TIÊN việc dở, nó không ngăn được ai mở
  // mặt trận thứ hai.
  const boundId = await taskForSession(root, sessionId);
  const boundTask = boundId ? graph.tasks.get(boundId) : undefined;
  const stillOpen = boundTask && boundTask.value.status !== "done" ? boundTask : undefined;

  if (stillOpen && !switching) return refuseSwitch(graph, stillOpen, freshness, sessionId, argv);

  const pool = stillOpen ? withoutTask(graph, stillOpen.value.id) : graph;
  const ranked = rankedCandidates(pool);

  if (ranked.length === 0) {
    const blocked = blockedTasks(pool);
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
      if (stillOpen) {
        process.stdout.write(
          `Không còn task nào KHÁC ngoài ${stillOpen.value.id} đang dở — không có chỗ nào ` +
            `để chuyển sang.\n`,
        );
        return 0;
      }

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

  // Không có --session (gọi tay từ CLI) vẫn cần một danh tính để tham gia
  // đúng giao thức claim — nếu không, nó có thể giành lại task một phiên
  // Claude Code khác đang thật sự giữ.
  const picked = await claimNextTask(pool, root, sessionId ?? "cli");

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

  // Trạng thái "đang làm" phải nằm trong chính file task, không chỉ trong
  // `state.json`: state.json là LOCAL_ONLY (graph/paths.ts), không vào git —
  // máy thứ hai và clone mới không thấy gì ở đó.
  //
  // Chỉ đổi từ `todo`: `blocked` là điều người đã khai, đè lên là xoá thông tin.
  // Và KHÔNG đụng `picked.task.value` — brief in "Đây là việc đang dở" theo
  // status trong bộ nhớ, nói câu đó cho một task vừa mới nhận là sai.
  const marked = picked.task.value.status === "todo";
  if (marked) await setTaskStatus(root, picked.task, "in_progress");

  const markedNote = marked
    ? `\n${taskId} đã đánh dấu \`status: in_progress\` trong ${picked.task.file} — ` +
      `\`ganas commit\` sẽ đem theo file đó.\n`
    : "";

  const baselineGreen = sessionId
    ? await recordBaseline(root, graph, picked.task.value, freshness, argv)
    : [];

  if (flag(argv, "json")) {
    const brief = renderBrief({ graph, task: picked.task, freshness });
    process.stdout.write(
      JSON.stringify({ task: taskId, brief, marked_in_progress: marked }, null, 2) + "\n",
    );
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

  process.stdout.write(markedNote);
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
