import { relative } from "node:path";

import { evaluateGate } from "../../gate.js";
import { claimNextTask, claimTask, releaseClaimsForSession } from "../../graph/claim.js";
import { computeFreshness } from "../../graph/freshness.js";
import { loadGraph } from "../../graph/load.js";
import { CONFIG_FILE, findGanasRoot, GANAS_DIR, ganasPath } from "../../graph/paths.js";
import { type Candidate, openBlockers, rankedCandidates, selectNextTask } from "../../graph/select.js";
import type { Graph } from "../../graph/types.js";
import { validateGraph } from "../../graph/validate.js";
import { generateHandoff } from "../../handoff.js";
import { autoLoopFor as autoLoopConfigFor, enforcementFor } from "../../model/index.js";
import type { Task } from "../../model/index.js";
import { generateNote } from "../../note.js";
import { REPORT_SECTIONS, renderBrief } from "../../render/brief.js";
import {
  agentReportedFor,
  autoLoopFor as autoLoopStateFor,
  autoLoopHaltedFor,
  bindSession,
  clearTouched,
  dispatchNudgedFor,
  haltAutoLoop,
  incrementAutoLoopRounds,
  markAgentReported,
  markDispatchNudged,
  markRedTask,
  markTouched,
  releaseSession,
  sessionRecord,
  taskForSession,
} from "../../state.js";
import { existsAsync } from "../../util/fsprobe.js";
import { ledgerPath, runContext } from "../../verify/ledger.js";
import {
  applyEnforcement,
  decideEntityOverwrite,
  decideProposalWrite,
  decideWriteEarly,
  denyPreTool,
  DISPATCH_NUDGE_REASON,
  inRepoTree,
  knowledgeWriteBody,
  locate,
  PLAN_APPROVED_REASON,
  ruleForDiagnostics,
  shellLooksLikeWrite,
  WRITE_TOOLS,
} from "../policy/index.js";
import { ALLOW, type HookInput, type HookOutput } from "../policy/types.js";
/* ------------------------------------------------------------------------- *
 * SessionStart — phiên mới biết phải làm gì
 * ------------------------------------------------------------------------- */

export async function sessionStart(input: HookInput): Promise<HookOutput> {
  const root = findGanasRoot(input.cwd ?? process.cwd());
  if (!root) return ALLOW; // dự án không dùng ganas

  const graph = await loadGraph(root);
  const sessionId = input.session_id;

  // Phiên nối tiếp (resume/compact/fork) giữ nguyên task đang làm.
  const bound = sessionId ? await taskForSession(root, sessionId) : null;
  const existing = bound ? graph.tasks.get(bound) : undefined;

  // Phải chọn task mới thì ở lại phạm vi cũ nếu còn việc: brief của phạm vi đó
  // đã nạp rồi, nhảy sang phạm vi khác là dựng lại ngữ cảnh từ đầu.
  let picked: Candidate | null;
  if (existing && existing.value.status !== "done") {
    // Giữ lại claim của chính task đang làm — quan trọng khi phiên này mới
    // tạo (claim cũ, nếu có, do phiên trước để lại) hoặc claim đã hết hạn.
    if (sessionId)
      await claimTask(root, existing.value.id, sessionId, graph.config.claim.ttl_minutes);
    picked = { task: existing, blockers: [] };
  } else {
    picked = sessionId
      ? await claimNextTask(graph, root, sessionId, { preferScope: existing?.value.scope })
      : selectNextTask(graph, { preferScope: existing?.value.scope });
  }

  if (!picked) {
    const heldByOthers = rankedCandidates(graph).length;
    const body =
      heldByOthers > 0
        ? `Dự án này dùng ganas, nhưng ${heldByOthers} task còn làm được đang bị ` +
          `phiên khác giữ. Đợi phiên đó giải phóng, hoặc phối hợp trước khi giành lại.`
        : `Dự án này dùng ganas, nhưng hiện **không có task nào làm được**.\n\n` +
          `Trước khi sửa code, hãy tạo task trong \`.ganas/tasks/\` (phải khai \`serves\`, ` +
          `\`implements\`, \`scope\`, \`exit_contract\`) rồi chạy \`ganas validate\`.`;
    return {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: `# ganas\n\n${body}`,
      },
    };
  }

  const taskId = picked.task.value.id;
  if (sessionId) await bindSession(root, sessionId, taskId);

  const freshness = await computeFreshness(graph);
  // Không kèm phần biến động: brief đi vào đầu context, thêm mốc thời gian ở đây
  // là làm hỏng prompt cache của mọi phiên.
  const brief = renderBrief({ graph, task: picked.task, freshness });

  const errors = validateGraph(graph).filter((d) => d.severity === "error");
  const graphWarning =
    errors.length > 0
      ? `\n\n> ⚠ Graph ganas đang có ${errors.length} lỗi. Chạy \`ganas validate\` — ` +
        `brief bên trên có thể thiếu chính xác.`
      : "";

  const out: HookOutput = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: brief + graphWarning,
      sessionTitle: `${taskId} — ${picked.task.value.title}`,
    },
  };

  if (graph.config.session_start.auto_begin && input.source === "startup") {
    (out.hookSpecificOutput as Record<string, unknown>)["initialUserMessage"] =
      `Bắt đầu ${taskId}. Đọc brief đã được nạp, làm theo thứ tự trong đó. ` +
      `Verify lại mọi mục nằm trong "CẦN VERIFY LẠI" trước khi dựa vào chúng.`;
  }

  return out;
}

/* ------------------------------------------------------------------------- *
 * PreToolUse — giữ sổ cái xác minh khỏi bị sửa
 * ------------------------------------------------------------------------- */

/**
 * Nhắc MỘT LẦN khi phiên chính (không phải sub-agent) tự sửa file cho task khai
 * tier `scribe`/`verifier` — đúng lúc còn kịp đổi hành vi: đây là lượt sửa file
 * ĐẦU TIÊN mà phiên chính phớt lờ hướng dẫn giao việc trong brief. Nổ ở
 * `ganas gate` thì đã muộn (việc làm xong rồi); nổ ở mọi lượt Write/Edit thì
 * thành lải nhải.
 *
 * Thứ tự kiểm cố ý theo cái RẺ trước, cái ĐẮT sau: cờ đã-nhắc (đọc state) →
 * nguồn gốc lượt sửa (đã có sẵn trong input) → CUỐI CÙNG mới `loadGraph`. Nhờ
 * vậy `loadGraph` chạy NHIỀU NHẤT một lần cho mỗi phiên, không phải mỗi lần
 * Write/Edit.
 *
 * Không chặn — chỉ `systemMessage`. Task tier `main`, hoặc task không khai
 * `model` (đã có luật `spine/task-missing-model` lo), đều im lặng.
 */
async function pendingDispatchNudge(
  root: string,
  sessionId: string,
  fromSubagent: boolean,
): Promise<string | undefined> {
  const rec = await sessionRecord(root, sessionId);
  if (!rec) return undefined;

  if (await dispatchNudgedFor(root, sessionId, rec.task)) return undefined;
  if (fromSubagent) return undefined;

  const graph = await loadGraph(root);
  const tier = graph.tasks.get(rec.task)?.value.model;
  if (tier !== "scribe" && tier !== "verifier") return undefined;

  return DISPATCH_NUDGE_REASON;
}

/**
 * Chặn **trước khi** ghi, không phải sau.
 *
 * Đây không phải luật quy trình nên không theo cờ warn/enforce: sổ cái là gốc
 * tin cậy của cả hệ thống, và không ai có thói quen cũ nào ghi vào file mà ganas
 * vừa tạo ra.
 *
 * Chỉ chặn ở nhánh `Write`/`Edit`, nơi có ĐƯỜNG DẪN THẬT đã resolve. Nhánh Bash
 * từng khớp `command.includes(LEDGER_FILE)` trên chuỗi lệnh thô — đã bỏ, vì lớp
 * đó sai cả hai chiều: nó chặn nhầm những lệnh chỉ đọc có kèm dấu chuyển hướng
 * (`grep … verify-ledger.jsonl > /tmp/x`), mà lại không cản được ai chỉ cần
 * không gõ tên file (`git add .ganas`, hoặc nối chuỗi trong một script). Lớp
 * cưỡng chế thật với Bash là hash-chain của chính sổ cái: sửa bằng cách nào
 * cũng đứt chain, và `ganas validate` / `ganas ledger --check` / `ganas commit`
 * đều thấy. Xem `verifyChain()` trong verify/ledger.ts.
 *
 * Luật ghi-đè-thực-thể (thêm ở đây, sau ledger/config/skill để giữ đúng thứ
 * tự — luật cũ vẫn thắng trước, thông điệp cũ không đổi): CHỈ áp cho
 * `tool_name === "Write"`, tuyệt đối không áp cho `Edit`/`MultiEdit`/
 * `NotebookEdit` — sửa file có sẵn là việc hợp lệ (`Edit` vốn đòi file phải
 * tồn tại rồi). `Write` đè lên file thực thể (`goals/designs/tasks/scopes/
 * modules/facts/claims/decisions`) ĐÃ CÓ trên đĩa mới bị chặn — đây chính là
 * lớp thứ hai vá lỗ đua của `ganas id` (xem doc comment ở `commands/id.ts`):
 * lớp một (`reserveId`) chỉ chống được đua giữa các phiên đặt-chỗ TRƯỚC khi
 * ghi; lớp này chặn cú GHI thật sự nếu một phiên khác đã ghi file trước đó
 * (kể cả khi việc đặt chỗ id bị bỏ qua, hoặc hai máy khác nhau tính trùng
 * id — `.locks/` không giúp được trường hợp đó).
 *
 * Không theo cờ `warn`/`enforce` như luật quy trình: thứ bị đe doạ ở đây là
 * DỮ LIỆU, không phải thói quen — cùng lý lẽ với luật ledger phía trên.
 *
 * Luật proposal (thêm ở đây, sau cùng): CÓ theo `enforcementFor` (khoá
 * `proposal_decision`) — khác bốn luật trên, đây là luật QUY TRÌNH ("duyệt là
 * việc của người"), không phải luật bảo toàn dữ liệu, nên dự án cũ phải hạ
 * được xuống `warn` như mọi luật quy trình khác. Áp cho cả `Write` lẫn `Edit`/
 * `MultiEdit` (không giới hạn ở `Write` như luật ghi-đè phía trên): việc cần
 * chặn không phải "đè file" mà là "nội dung sắp ghi đặt status thành
 * approved/rejected", và `Edit` làm được việc đó y hệt `Write`.
 *
 * Giới hạn phải biết: hook này chỉ chạy khi plugin ganas được cài trong
 * Claude Code. Gọi `ganas` trần từ terminal (hoặc bất kỳ agent nào không đi
 * qua hook của plugin) không có lớp này — lúc đó chỉ còn `reserveId` (lớp 1)
 * và kỷ luật của người/agent gọi lệnh.
 */
export async function preToolUse(input: HookInput): Promise<HookOutput> {
  const cwd = input.cwd ?? process.cwd();
  const root = findGanasRoot(cwd);
  if (!root) return ALLOW;

  if (input.tool_name && WRITE_TOOLS.has(input.tool_name)) {
    const raw = input.tool_input?.["file_path"];
    if (typeof raw === "string") {
      const { abs, rel } = locate(raw, cwd, root);

      // Gom dữ kiện RẺ, hỏi policy, rồi chỉ đi lấy thứ nó thật sự đòi. Phép
      // lười nằm ở đây: `existsAsync` và `loadGraph` chỉ chạy khi policy hỏi.
      const step = decideWriteEarly({
        toolName: input.tool_name,
        abs,
        rel,
        ledgerAbs: ledgerPath(root),
        configAbs: ganasPath(root, CONFIG_FILE),
        fromSubagent: input.agent_id !== undefined,
        toolInput: input.tool_input,
      });

      if (step.kind === "deny") return denyPreTool(step.reason);

      if (step.kind === "need" && step.probe === "entity-exists") {
        const after = decideEntityOverwrite(await existsAsync(abs));
        if (after.kind === "deny") return denyPreTool(after.reason);
      }

      if (step.kind === "need" && step.probe === "proposal-mode") {
        const graph = await loadGraph(root);
        return decideProposalWrite(enforcementFor(graph.config, "proposal_decision"));
      }
    }
    return ALLOW;
  }

  if (input.tool_name === "Bash" || input.tool_name === "PowerShell") {
    const command = input.tool_input?.["command"];
    if (typeof command === "string" && shellLooksLikeWrite(command)) {
      // `sed -i`, `>` — sửa file mà không đi qua PostToolUse của Write/Edit. Đánh
      // dấu ở PRE vì với Bash đây là lần duy nhất ganas nhìn thấy nội dung lệnh.
      // Đánh dấu nhầm (lệnh sau đó fail) chỉ tốn thêm một lần chấm gate; bỏ sót
      // thì cả một đợt sửa code thoát khỏi exit_contract.
      //
      // KHÔNG kèm đường dẫn: Bash chỉ cho ta chuỗi lệnh thô, và parse nó để đoán
      // file nào bị sửa thì sai nhiều hơn đúng (`sed -i` sau `xargs`, biến, glob
      // do shell bung). Nên đợt sửa qua Bash dựng `touched_at` mà không góp
      // `touched_paths` nào — nó VÔ HÌNH với mọi kiểm dựa trên đường dẫn. Bỏ
      // sót thì còn im lặng được, báo sai thì cảnh báo bị tắt vĩnh viễn.
      if (input.session_id) await markTouched(root, input.session_id);
    }
  }

  return ALLOW;
}

/* ------------------------------------------------------------------------- *
 * PostToolUse — chặn ghi tri thức sai
 * ------------------------------------------------------------------------- */

export async function postToolUse(input: HookInput): Promise<HookOutput> {
  // Đây là NHẮC, không phải cổng: không `decision: "block"` (chặn ExitPlanMode
  // là nhốt người dùng ngoài chính kế hoạch họ vừa duyệt), không đọc `tool_input`
  // (harness không tả field nào của ExitPlanMode), không markTouched (duyệt plan
  // không phải lượt sửa code — xem doc comment `touched_at` trong state.ts).
  if (input.tool_name === "ExitPlanMode") {
    return { systemMessage: PLAN_APPROVED_REASON };
  }

  if (!input.tool_name || !WRITE_TOOLS.has(input.tool_name)) return ALLOW;

  const cwd = input.cwd ?? process.cwd();
  const root = findGanasRoot(cwd);
  if (!root) return ALLOW;

  const raw = input.tool_input?.["file_path"];
  const rel = typeof raw === "string" ? locate(raw, cwd, root).rel : undefined;

  // File ngoài cây repo (`../..`, ổ đĩa khác) không đối chiếu được với ranh giới
  // của task — ranh giới là pathspec tương đối gốc repo. Ghi vào chỉ tạo nhiễu.
  const inTree = inRepoTree(rel);

  const sessionId = input.session_id;
  const fromSubagent = input.agent_id !== undefined;

  // Trước cả bộ lọc `.ganas/` bên dưới: ghi code cũng là làm việc, và đó chính
  // là thứ Stop hook cần biết để phân biệt lượt sửa với lượt hỏi đáp. Vẫn phải
  // gọi kể cả khi không có đường dẫn — NotebookEdit gửi `notebook_path`.
  if (sessionId) await markTouched(root, sessionId, inTree ? rel : undefined, fromSubagent);

  const nudgeText = sessionId ? await pendingDispatchNudge(root, sessionId, fromSubagent) : undefined;

  // Hạ cờ CHỈ khi lời nhắc thật sự được trả ra. Đặt cờ ngay lúc tính toán là
  // cách "nhắc một lần" âm thầm biến thành "nhắc không lần nào": nhánh xác thực
  // `.ganas/` bên dưới trả thông điệp của nó và lời nhắc bị nuốt mất.
  const deliverNudge = async (): Promise<HookOutput> => {
    if (nudgeText === undefined || sessionId === undefined) return ALLOW;
    await markDispatchNudged(root, sessionId);
    return { systemMessage: nudgeText };
  };

  if (rel === undefined) return deliverNudge();
  if (!rel.startsWith(`${GANAS_DIR}/`)) return deliverNudge(); // chỉ gác kho tri thức

  const graph = await loadGraph(root);
  const all = validateGraph(graph);

  // Chỉ báo lỗi của CHÍNH file vừa ghi. Nếu bắt Claude chịu trách nhiệm cho mọi
  // lỗi sẵn có trong repo thì nó sẽ không bao giờ ghi xong được file nào.
  const mine = all.filter((d) => d.severity === "error" && d.file === rel);
  if (mine.length === 0) return deliverNudge();

  const rule = ruleForDiagnostics(mine);
  const mode = enforcementFor(graph.config, rule);

  // Lời nhắc giao việc đi KÈM chứ không bị thay thế: hai chuyện khác nhau, và
  // `HookOutput` chỉ có một chỗ để nói. Bỏ một cái là mất hẳn — nó chỉ nhắc
  // một lần trong cả phiên.
  const nudgeTail = nudgeText === undefined ? "" : `\n\n---\n\n${nudgeText}`;
  if (nudgeText !== undefined && sessionId !== undefined) {
    await markDispatchNudged(root, sessionId);
  }

  return applyEnforcement(mode, knowledgeWriteBody(rel, mine, rule, nudgeTail));
}

/* ------------------------------------------------------------------------- *
 * Auto-loop — D-015 vế 2: gate xanh thì tự mồi lượt kế, phanh nằm ở ganas
 * ------------------------------------------------------------------------- */

/**
 * Còn task nào KHÁC `task`, cùng chặng (`task.implements`), chưa `done` và
 * không còn blocker mở hay không.
 *
 * Đây là câu hỏi mà điều kiện dừng cứng #4 ("hết task chưa done trong cùng
 * chặng") cần trả lời. Cố ý loại trừ CHÍNH `task`: ngay lúc hàm này chạy, gate
 * của `task` đã xanh nhưng nó CHƯA `done` (việc đó chỉ xảy ra sau `ganas
 * commit`) — tính cả nó thì điều kiện luôn đúng, vô hiệu hoá hẳn điểm dừng.
 *
 * Duyệt thẳng `graph.tasks` theo `implements` — KHÔNG thêm khái niệm
 * "phase"/"sprint" mới, `Design` đã là chặng (xem D-015).
 */
function hasMoreWorkInDesign(graph: Graph, task: Task): boolean {
  return [...graph.tasks.values()].some(
    (t) =>
      t.value.implements === task.implements &&
      t.value.id !== task.id &&
      t.value.status !== "done" &&
      openBlockers(graph, t.value).length === 0,
  );
}

/**
 * Quyết định của auto-loop SAU KHI gate của `task` đã xanh (mọi tiêu chí tự
 * động đạt, `pendingHuman` rỗng) — chỉ được gọi từ đúng chỗ đó trong `stop()`.
 * Đặt nhánh này TRƯỚC `evaluateGate` là phá luôn G-002 ("hàng rào không xanh
 * được khi chưa kiểm gì"); thứ tự gọi ở `stop()` là bắt buộc, không phải sở
 * thích — xem brief T-091.
 *
 * Kiểm theo đúng thứ tự "Năm điều kiện dừng cứng" của brief (bỏ #2 — task đỏ
 * hai lượt liên tiếp — vì điều đó chỉ có nghĩa ở NHÁNH GATE ĐỎ, không phải ở
 * đây; và bỏ #5 — `stop_hook_active` — vì `stop()` đã xử lý nó làm phanh
 * ngoài cùng trước khi gọi tới hàm này):
 *
 * 1. `enabled: false` ⇒ ALLOW im lặng, y hệt hành vi hôm nay (đây là test
 *    quan trọng nhất của cả chặng — xem `test/auto-loop.test.ts`).
 * 2. chạm trần `max_iterations` ⇒ ALLOW kèm lý do.
 * 3. cờ halt (do `subagentStop` đặt khi báo cáo có "CHẶN:") ⇒ ALLOW kèm lý do.
 * 4. hết task chưa `done` cùng chặng ⇒ ALLOW kèm lý do.
 * 5. còn đủ cả bốn ⇒ tăng đếm, `decision: "block"` với lệnh cụ thể.
 */
async function autoLoopDecision(
  root: string,
  graph: Graph,
  task: Task,
  sessionId: string,
): Promise<HookOutput> {
  const loopConfig = autoLoopConfigFor(graph.config);
  if (!loopConfig.enabled) return ALLOW;

  const loopState = await autoLoopStateFor(root, sessionId);
  const rounds = loopState?.rounds ?? 0;
  if (rounds >= loopConfig.max_iterations) {
    return {
      systemMessage:
        `ganas: auto-loop dừng — đã chạm trần ${loopConfig.max_iterations} vòng liên tiếp ` +
        `của phiên này. Kiểm lại tiến độ; muốn tiếp tục thì tự chạy \`ganas commit ${task.id}\` ` +
        `rồi \`ganas next --session ${sessionId}\`.`,
    };
  }

  if (await autoLoopHaltedFor(root, sessionId)) {
    return {
      systemMessage:
        `ganas: auto-loop đang bị dừng (một sub-agent trước đã báo "CHẶN:" trong kết luận — ` +
        `xem \`runs/notes/${sessionId}.md\`). Xử lý xong thì tự chạy \`ganas next\` để mở lại; ` +
        `state.json chỉ tự reset khi người can thiệp.`,
    };
  }

  if (!hasMoreWorkInDesign(graph, task)) {
    return {
      systemMessage:
        `ganas: auto-loop dừng — hết task chưa xong trong chặng ${task.implements}. ` +
        `Chạy \`ganas commit ${task.id}\` để đóng nốt task này, rồi \`ganas gate --design ${task.implements}\` ` +
        `để xác nhận cả chặng đã đóng.`,
    };
  }

  const nextRound = await incrementAutoLoopRounds(root, sessionId);
  return {
    decision: "block",
    reason:
      `${task.id}: mọi tiêu chí tự động đã đạt (vòng ${nextRound}/${loopConfig.max_iterations}). ` +
      `Chạy \`ganas commit ${task.id}\` rồi \`ganas next --session ${sessionId}\` để giao sub-agent kế tiếp — ` +
      `chặng ${task.implements} còn việc, đừng dừng lại hỏi người.`,
  };
}

/* ------------------------------------------------------------------------- *
 * Stop — không cho kết thúc khi việc chưa xong
 * ------------------------------------------------------------------------- */

export async function stop(input: HookInput): Promise<HookOutput> {
  // Đã chặn một lần rồi mà vẫn tới đây: nhả ra. Chặn tiếp là nhốt người dùng
  // trong vòng lặp mà họ không thoát được.
  if (input.stop_hook_active) return ALLOW;

  const root = findGanasRoot(input.cwd ?? process.cwd());
  if (!root) return ALLOW;

  const sessionId = input.session_id;
  if (!sessionId) return ALLOW;

  // Chỉ chấm khi CHÍNH phiên này đã ghi file kể từ lần chấm gần nhất.
  //
  // Stop hook chạy ở cuối mọi lượt, phần lớn trong số đó là hỏi đáp: người dùng
  // hỏi một câu, Claude trả lời, không file nào đổi. Chấm exit_contract ở đó thì
  // đương nhiên trượt (chưa ai làm gì) và cái giá phải trả là thật — một lượt
  // trả lời thừa để thoát khỏi `decision: "block"`, cộng với `npm test`/`tsc`
  // trong exit_contract chạy lại từ đầu cho một lượt không đụng tới code.
  //
  // Không dùng `taskForSession`: cú rơi về `current_task` của nó khiến một phiên
  // chưa bind bị chấm theo task của phiên khác.
  const session = await sessionRecord(root, sessionId);
  if (!session?.touched_at) return ALLOW;

  const taskId = session.task;
  const graph = await loadGraph(root);
  const task = graph.tasks.get(taskId);
  if (!task) return ALLOW;

  // Hạ cờ NGAY khi đã quyết định chấm: dù kết quả là chặn hay cho qua, đợt sửa
  // này đã được chấm rồi. Những lượt hỏi đáp sau đó im lặng cho tới lần ghi file
  // kế tiếp — còn nếu Claude sửa tiếp thật thì cờ lại được dựng lên và chấm lại.
  await clearTouched(root, sessionId);

  const freshness = await computeFreshness(graph);
  const result = await evaluateGate(graph, task.value, freshness, sessionId);
  // Gate xanh VÀ không còn mục chờ người: đúng điều kiện auto-loop cần biết.
  // Nhánh trong `autoLoopDecision` tự trả ALLOW nguyên vẹn khi `enabled: false`
  // — hành vi hôm nay không đổi một byte.
  if (result.ok && result.pendingHuman.length === 0) {
    return autoLoopDecision(root, graph, task.value, sessionId);
  }

  const unmetText = result.unmet
    .map((u) => `  ✗ ${u.label}${u.reason ? `\n      ${u.reason}` : ""}`)
    .join("\n");

  if (result.ok) {
    // Chỉ còn mục cần người xác nhận — không chặn phiên, nhưng phải nói ra.
    return {
      systemMessage:
        `${taskId}: mọi tiêu chí tự động đã đạt. Còn ${result.pendingHuman.length} mục ` +
        `cần người xác nhận trước khi đánh dấu task done:\n` +
        result.pendingHuman.map((p) => `  … ${p.label}`).join("\n"),
    };
  }

  // Gate đỏ: điều kiện dừng cứng #2 của auto-loop ("cùng một task đỏ hai lượt
  // liên tiếp") chỉ có nghĩa ở đây, không phải ở nhánh gate xanh. CHỈ đếm khi
  // auto-loop đang bật — tắt thì không đụng `state.json`, giữ đúng "y hệt hôm
  // nay" cho phần còn lại của test.
  if (autoLoopConfigFor(graph.config).enabled) {
    const redCount = await markRedTask(root, sessionId, taskId);
    if (redCount >= 2) {
      return {
        systemMessage:
          `ganas: auto-loop dừng — task ${taskId} vẫn đỏ sau ${redCount} lượt liên tiếp, ` +
          `không thấy tiến triển:\n\n${unmetText}\n\n` +
          `Xử lý xong thì tự chạy \`ganas next --session ${sessionId}\` để mở lại.`,
      };
    }
  }

  const mode = enforcementFor(graph.config, "exit_contract");
  const body =
    `Task ${taskId} chưa thoả điều kiện hoàn thành:\n\n${unmetText}\n\n` +
    `Làm nốt những mục trên rồi hãy kết thúc. Nếu thật sự không làm được, ` +
    `ghi rõ lý do vào handoff (\`ganas handoff\`) và nói cho người dùng biết ` +
    `mục nào còn dở — đừng im lặng bỏ qua.`;

  return mode === "enforce"
    ? { decision: "block", reason: body }
    : { systemMessage: `ganas (chế độ warn — chưa chặn):\n${body}` };
}

/* ------------------------------------------------------------------------- *
 * SubagentStop — giữ lại báo cáo của worker, đòi đủ ba mục phản biện
 * ------------------------------------------------------------------------- */

/**
 * Trần độ dài phần báo cáo ghi vào `runs/notes/` — chặn `state.json`/note
 * phình vô hạn khi một sub-agent lỡ dán nguyên một đoạn log dài vào câu trả
 * lời cuối. Quy ước bắt buộc của repo: "cắt bớt thì phải in số dòng đã bỏ"
 * (`src/commands/CLAUDE.md`) — cắt im lặng làm người đọc note tưởng đã thấy
 * hết báo cáo.
 */
const NOTE_BODY_LIMIT_CHARS = 8_000;

/**
 * Cắt `text` CỨNG ở đúng `NOTE_BODY_LIMIT_CHARS` ký tự (không lùi về biên
 * dòng gần nhất — mục tiêu là chặn TRẦN dung lượng, không phải giữ Markdown
 * đẹp), trả kèm số dòng đã bỏ để in ra cho người đọc note.
 */
function truncateForNote(text: string): { body: string; droppedLines: number } {
  if (text.length <= NOTE_BODY_LIMIT_CHARS) return { body: text, droppedLines: 0 };
  const body = text.slice(0, NOTE_BODY_LIMIT_CHARS);
  // Dòng bị cắt dở ở đúng mốc cũng tính là một dòng "đã bỏ".
  const droppedLines = text.slice(NOTE_BODY_LIMIT_CHARS).split("\n").length;
  return { body, droppedLines };
}

/**
 * `section` có xuất hiện dưới dạng MỘT DÒNG heading Markdown (`#`…`######`,
 * rồi đúng chữ đó, cho phép khoảng trắng hai đầu) trong `message` không.
 *
 * Đây là TOÀN BỘ những gì hàng rào này kiểm được: sự CÓ MẶT của tiêu đề,
 * không phải nội dung bên dưới nó. Worker viết "(không có)" ngay sau heading
 * vẫn qua — xem giới hạn đầy đủ ở docstring của `subagentStop`.
 */
function hasReportHeading(message: string, section: string): boolean {
  const escaped = section.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`^#{1,6}\\s*${escaped}\\s*$`, "mi").test(message);
}

/** Những tiêu đề của `REPORT_SECTIONS` còn thiếu trong `message` — rỗng nghĩa là đủ. */
function missingReportSections(message: string): string[] {
  return REPORT_SECTIONS.filter((s) => !hasReportHeading(message, s));
}

/**
 * Worker tự khai kết luận của lượt này là "CHẶN:" — xin dừng auto-loop để
 * người xử lý, không phải đang bị HOOK chặn. Chuỗi khớp đúng quy ước trong
 * mẫu báo cáo (`Kết luận: XONG hoặc CHẶN: <lý do một dòng>`).
 */
function reportRequestsHalt(message: string): boolean {
  return /CHẶN:/.test(message);
}

function missingSectionsReason(missing: readonly string[]): string {
  return (
    `Báo cáo kết thúc lượt của sub-agent thiếu ${missing.length} tiêu đề bắt buộc: ` +
    `${missing.map((s) => `"${s}"`).join(", ")}.\n\n` +
    `Ba mục "${REPORT_SECTIONS.join('", "')}" là chỗ worker được nói ngược lại người ra đề — ` +
    `thiếu một trong chúng thì báo cáo chỉ còn là lời khen suông. Viết lại đủ ba mục, ĐÚNG DẠNG ` +
    `heading Markdown (vd \`## ${REPORT_SECTIONS[0]}\`), rồi kết thúc lượt lần nữa.\n\n` +
    `(Chỉ đòi đúng MỘT LẦN cho agent này — lượt kế tiếp, dù vẫn thiếu, sẽ không bị đòi lại.)`
  );
}

/**
 * Sub-agent kết thúc lượt (Claude Code gọi khi một Agent-tool call trả về).
 * Đây là nơi DUY NHẤT ganas nhìn thấy `last_assistant_message` của sub-agent
 * trước khi nó tan vào tóm tắt của phiên cha — xem D-015 vế 1.
 *
 * Thứ tự dưới đây CHÍNH LÀ nội dung task T-089, không được đảo:
 *
 * 1. Không phải dự án ganas ⇒ `ALLOW`.
 * 2. `input.agent_id === undefined` (tool call không đến từ sub-agent, tức
 *    đây là Stop của phiên chính bị harness gắn nhầm tên sự kiện) ⇒ `ALLOW`.
 * 3. LUÔN ghi báo cáo ra `runs/notes/<session>.md` qua lõi `src/note.ts` —
 *    GHI TRƯỚC, CHẤM SAU: báo cáo tồi (thiếu tiêu đề, hay bị chặn ở bước 4)
 *    vẫn phải được giữ lại, không phải chỉ báo cáo "đạt" mới đáng lưu.
 * 4. Thiếu tiêu đề bắt buộc VÀ agent này CHƯA từng bị đòi báo cáo (ở đúng
 *    task đang bind) ⇒ `applyEnforcement(enforcementFor(config,
 *    "subagent_report"), ...)`. Đánh dấu "đã đòi" xảy ra bất kể mode
 *    warn/enforce — đây là cờ nhắc-một-lần, không phải cờ riêng của enforce.
 * 5. Báo cáo tự khai "CHẶN:" trong kết luận ⇒ KHÔNG chặn (worker đã nói thật,
 *    chặn thêm là phạt đúng hành vi cần khuyến khích) — thay vào đó dừng
 *    auto-loop và trả `systemMessage` để người biết mà xử lý.
 *
 * `loadGraph` (đắt — đọc và validate cả `.ganas/`) chỉ được gọi SAU bước 2,
 * và ở đây còn trễ hơn: chỉ gọi khi bước 4 THẬT SỰ cần biết mode cưỡng chế —
 * luật "chỉ đi lấy thứ policy hỏi" (`src/hooks/io/CLAUDE.md`).
 *
 * Giới hạn PHẢI nói thẳng: hàng rào ở bước 4 cưỡng chế được sự CÓ MẶT của ba
 * tiêu đề, KHÔNG cưỡng chế được nội dung — worker viết "(không có)" dưới mỗi
 * heading là qua. Đừng coi ALLOW ở đây là "báo cáo đã được xác nhận đúng sự
 * thật"; đó là việc của người đọc `runs/notes/`.
 *
 * Không có `sessionId`: vẫn ghi note (dùng nhãn `unknown-session`) nhưng bỏ
 * qua bước 4/5 — cả hai đều cần `state.json` khoá theo session để nhớ "đã
 * đòi chưa"/dừng đúng phiên nào, và không có session thì không có gì để nhớ.
 * Chặn lặp lại vô hạn trong ca đó còn tệ hơn bỏ qua.
 */
export async function subagentStop(input: HookInput): Promise<HookOutput> {
  const root = findGanasRoot(input.cwd ?? process.cwd());
  if (!root) return ALLOW;

  if (input.agent_id === undefined) return ALLOW;
  const agentId = input.agent_id;

  const sessionId = input.session_id;
  const session = sessionId ? await sessionRecord(root, sessionId) : null;
  const taskId = session?.task ?? null;
  const rawMessage = input.last_assistant_message ?? "";

  // Bước 3 — GHI TRƯỚC, CHẤM SAU.
  const { body, droppedLines } = truncateForNote(rawMessage);
  const cutNotice =
    droppedLines > 0
      ? `\n\n… đã cắt bớt ${droppedLines} dòng còn lại (báo cáo dài hơn ${NOTE_BODY_LIMIT_CHARS} ký tự).`
      : "";
  // Dùng lại `runContext` của sổ cái xác minh chỉ để lấy sha hiện tại — M-hook-io
  // đã sẵn `depends_on: M-verify`, không đáng viết thêm một lời gọi git riêng.
  const sha = (await runContext(root, "subagentStop")).git;
  await generateNote(root, sessionId ?? "unknown-session", {
    at: new Date().toISOString(),
    taskId,
    sha,
    touchedPaths: session?.touched_paths ?? [],
    content:
      `- agent_type: \`${input.agent_type ?? "(không rõ)"}\`\n` +
      `- agent_id: \`${agentId}\`\n\n` +
      body +
      cutNotice,
  });

  if (!sessionId) return ALLOW;

  // Bước 4.
  const missing = missingReportSections(rawMessage);
  if (missing.length > 0) {
    const already = await agentReportedFor(root, sessionId, taskId ?? "", agentId);
    if (!already) {
      await markAgentReported(root, sessionId, agentId);
      const graph = await loadGraph(root);
      return applyEnforcement(enforcementFor(graph.config, "subagent_report"), missingSectionsReason(missing));
    }
  }

  // Bước 5.
  if (reportRequestsHalt(rawMessage)) {
    await haltAutoLoop(root, sessionId);
    return {
      systemMessage:
        `ganas: sub-agent báo "CHẶN:" trong kết luận — đã dừng auto-loop. Đọc báo cáo trong ` +
        `\`runs/notes/${sessionId}.md\`, xử lý xong thì tự chạy \`ganas next\` để mở lại.`,
    };
  }

  return ALLOW;
}

/* ------------------------------------------------------------------------- *
 * PreCompact / SessionEnd
 * ------------------------------------------------------------------------- */

/** Ghi handoff nếu biết đủ (root/session/task) — lỗi thì bỏ qua, không chặn hook nào. */
async function tryHandoff(root: string, input: HookInput): Promise<{ path: string } | undefined> {
  if (!input.session_id) return undefined;
  const taskId = await taskForSession(root, input.session_id);
  if (!taskId) return undefined;

  try {
    const graph = await loadGraph(root);
    const task = graph.tasks.get(taskId);
    if (!task) return undefined;
    const freshness = await computeFreshness(graph);
    const gate = await evaluateGate(graph, task.value, freshness, input.session_id);
    return await generateHandoff(root, graph, task.value, gate, {
      sessionId: input.session_id,
      transcriptPath: input.transcript_path,
    });
  } catch {
    // Handoff là tiện ích, không phải cửa chặn — hỏng thì bỏ qua lặng lẽ.
    return undefined;
  }
}

export async function preCompact(input: HookInput): Promise<HookOutput> {
  const root = findGanasRoot(input.cwd ?? process.cwd());
  if (!root) return ALLOW;

  const taskId = await taskForSession(root, input.session_id);
  if (!taskId) return ALLOW;

  // Compaction là lúc tri thức chưa ghi ra file sẽ biến mất — hoặc tệ hơn, bị
  // tóm tắt thành một phiên bản méo. Nhắc ghi ra trước khi điều đó xảy ra, và
  // tự chụp lại handoff từ transcript trong lúc còn đọc được.
  const handoff = await tryHandoff(root, input);
  const handoffNote = handoff ? `\n\nĐã ghi handoff: ${relative(root, handoff.path)}.` : "";

  return {
    systemMessage:
      `ganas: context sắp bị nén. Trước khi mất chi tiết, ghi những gì đã xác lập ` +
      `ra file: fact đã verify vào .ganas/facts/, điều chưa kiểm chứng vào ` +
      `.ganas/claims/ (kèm anchor), câu hỏi còn mở vào task ${taskId}.` +
      handoffNote,
  };
}

export async function sessionEnd(input: HookInput): Promise<HookOutput> {
  const root = findGanasRoot(input.cwd ?? process.cwd());
  if (!root || !input.session_id) return ALLOW;
  await tryHandoff(root, input);
  await releaseClaimsForSession(root, input.session_id);
  await releaseSession(root, input.session_id);
  return ALLOW;
}
