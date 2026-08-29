import { isAbsolute, relative, resolve } from "node:path";

import { CONFIG_FILE, DIRS, GANAS_DIR, LEDGER_FILE } from "../../graph/paths.js";
import type { Diagnostic } from "../../graph/types.js";
import { type Enforcement, type EnforcementRule } from "../../model/index.js";
import type { HookOutput } from "./types.js";

/**
 * QUYẾT ĐỊNH của hook — không đọc đĩa, không sinh tiến trình, không stdin/stdout.
 *
 * Khối này trả lời "được hay không, và nói gì với người". Khối `M-hook-io`
 * (`handlers.ts` + `io.ts`) trả lời "lấy dữ liệu ở đâu" rồi phát kết quả ra.
 * Chia thế vì hai câu hỏi đó đổi vì hai lý do khác nhau: luật chặn đổi khi
 * chính sách đổi, còn cách lấy dữ liệu đổi khi hạ tầng đổi.
 *
 * `node:path` KHÔNG phải I/O — nó là phép tính trên chuỗi, không chạm đĩa lần
 * nào. Xem `.claude/rules/architecture.md`, mục "Công cụ io dùng chung".
 *
 * ## Vì sao có kiểu `WriteStep` thay vì một hàm quyết định thẳng
 *
 * Đường quyết định của `preToolUse` cố ý LƯỜI: chỉ hỏi đĩa khi đường dẫn đúng
 * là file thực thể, chỉ nạp graph khi đường dẫn đúng là proposal VÀ nội dung
 * sắp ghi thật sự đặt `status`. Gom sẵn mọi dữ kiện rồi mới quyết định sẽ bắt
 * MỌI lượt Write phải nạp cả graph — một hồi quy hiệu năng thật, và đúng thứ
 * comment trong bản cũ đã dặn đừng làm.
 *
 * Nên policy trả về hoặc một phán quyết, hoặc một YÊU CẦU dữ liệu (`need`).
 * `io` đáp ứng đúng yêu cầu đó rồi hỏi lại. Lười giữ nguyên, mà phán quyết vẫn
 * nằm trọn ở đây.
 */


/** Diagnostic liên quan tới bằng chứng — luật `knowledge_anchor`, không phải `schema`. */
export function isAnchorIssue(d: Diagnostic): boolean {
  return /^(?:\d+\.)?anchors(?:\.\d+)?:/.test(d.message);
}

export function formatDiagnostics(diags: readonly Diagnostic[]): string {
  return diags
    .map((d) => {
      const where = d.line === undefined ? d.file : `${d.file}:${d.line}`;
      return `  ${where}\n    ${d.message}${d.hint ? `\n    → ${d.hint}` : ""}`;
    })
    .join("\n");
}


/** Tool nào là tool GHI — dùng chung cho cả PreToolUse lẫn PostToolUse. */
export const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/** Dấu hiệu một lệnh shell đang GHI chứ không chỉ đọc. */
export const SHELL_WRITE_HINTS = [">", ">>", "tee", "sed -i", "truncate", "rm ", "mv ", "cp ", "dd "];

export function denyPreTool(reason: string): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

const LEDGER_REASON =
  `\`${LEDGER_FILE}\` là sổ cái xác minh — bằng chứng rằng probe đã thật sự chạy. ` +
  `Chỉ \`ganas verify\` mới được ghi vào đó.\n\n` +
  `Muốn một fact được coi là đã kiểm chứng thì chạy \`ganas verify <id>\` cho probe chạy thật, ` +
  `đừng ghi kết quả bằng tay. Nếu probe đang fail thì đó là thông tin cần giữ, không phải ` +
  `thứ cần che đi.`;

const CONFIG_REASON =
  `\`.ganas/${CONFIG_FILE}\` giữ mức cưỡng chế của cả dự án. Ghi \`enforcement: warn\` ` +
  `vào đó là tự tắt mọi hàng rào trong đúng phiên đang bị hàng rào chặn — vòng lặp ` +
  `mà không luật nào bên trong ganas phá được.\n\n` +
  `Mức cưỡng chế là quyết định của NGƯỜI, sửa ngoài phiên agent. Nếu một luật đang ` +
  `chặn sai thì nêu ra để người xử lý, đừng hạ luật xuống.`;

const SKILL_DIR = `.claude/skills/`;

const SKILL_WRITE_REASON =
  `Sub-agent không được sửa skill trong \`${SKILL_DIR}\` — chỉ phiên chính mới được. ` +
  `Skill định hình CÁCH làm việc; để sub-agent tự đổi nó giữa lúc chạy là mất kiểm soát, ` +
  `phiên chính không biết nó đã đổi gì.\n\n` +
  `Nhờ phiên chính sửa hộ nếu skill cần cập nhật.`;

/**
 * Thư mục THỰC THỂ dưới `.ganas/` — mỗi file trong đó là một bản ghi có id
 * (goal/design/task/scope/module/fact/claim/decision/icebox), khác với `runs/`,
 * `.locks/`, `map/`, `proposals/`... vốn không phải "một thực thể = một id".
 * Dùng lại `DIRS` thay vì khai tay chuỗi để không lệch nếu `paths.ts` đổi tên.
 */
const ENTITY_DIRS: readonly string[] = [
  DIRS.goals,
  DIRS.designs,
  DIRS.tasks,
  DIRS.scopes,
  DIRS.modules,
  DIRS.facts,
  DIRS.claims,
  DIRS.decisions,
  DIRS.icebox,
];

export function isEntityPath(rel: string): boolean {
  return ENTITY_DIRS.some((dir) => rel.startsWith(`${GANAS_DIR}/${dir}/`));
}



const ENTITY_OVERWRITE_REASON =
  `File này đã tồn tại trong một thư mục thực thể của ganas. \`Write\` sẽ GHI ĐÈ ÂM THẦM ` +
  `lên nó — không có gì báo cho phiên đang giữ nội dung cũ biết nó vừa mất dữ liệu.\n\n` +
  `Muốn SỬA file có sẵn thì dùng \`Edit\`, không dùng \`Write\`.\n\n` +
  `Nếu tưởng đang tạo một thực thể MỚI: id này đã có chủ. Chạy \`ganas id <loại>\` để lấy ` +
  `một id khác, đừng tự đoán số kế tiếp.`;

/**
 * Đường dẫn một file proposal — `.ganas/proposals/PR-00N.yaml`.
 *
 * Cố ý KHÔNG gộp vào `ENTITY_DIRS`/`isEntityPath`: luật ở đó chặn TOÀN BỘ
 * `Write` đè lên file đã tồn tại (sửa phải đi qua `Edit`), còn luật cho
 * proposal hẹp hơn nhiều — sửa `problem`/`proposed_change` khi đề xuất còn
 * `pending` vẫn là việc hợp lệ của agent; thứ duy nhất bị khoá là NỘI DUNG
 * đặt `status: approved`/`rejected`, bất kể qua `Write` hay `Edit`.
 */
export function isProposalPath(rel: string): boolean {
  return rel.startsWith(`${GANAS_DIR}/${DIRS.proposals}/`) && rel.endsWith(".yaml");
}

/**
 * Dòng YAML biến một proposal thành "đã có người trả lời": đổi `status` sang
 * `approved`/`rejected`, hoặc điền `decided_by`/`decided_at` — ba trường mà
 * schema (`zProposal`, xem `model/proposal.ts`) chỉ chấp nhận khi status đã
 * chuyển khỏi `pending`. Bắt cả `decided_by`/`decided_at` riêng lẻ, không chỉ
 * dòng `status`: ghi hai trường đó trước rồi đổi `status` ở một lượt Edit khác
 * là cùng một việc giả mạo quyết định, chỉ chia làm hai bước để né luật.
 */
const PROPOSAL_DECISION_PATTERN =
  /^[ \t]*(status:\s*["']?(approved|rejected)["']?\s*$|decided_by:\s*\S|decided_at:\s*\S)/m;

/** Gom mọi đoạn nội dung MỚI mà tool call này sắp ghi — Write/Edit/MultiEdit mỗi cái một hình. */
export function writtenText(toolInput: Record<string, unknown>): string[] {
  const texts: string[] = [];
  if (typeof toolInput["content"] === "string") texts.push(toolInput["content"]);
  if (typeof toolInput["new_string"] === "string") texts.push(toolInput["new_string"]);
  const edits = toolInput["edits"];
  if (Array.isArray(edits)) {
    for (const edit of edits) {
      if (edit && typeof edit === "object") {
        const ns = (edit as Record<string, unknown>)["new_string"];
        if (typeof ns === "string") texts.push(ns);
      }
    }
  }
  return texts;
}

export function setsProposalDecision(toolInput: Record<string, unknown> | undefined): boolean {
  if (!toolInput) return false;
  return writtenText(toolInput).some((t) => PROPOSAL_DECISION_PATTERN.test(t));
}

const PROPOSAL_DECISION_REASON =
  `Duyệt hay từ chối một đề xuất là việc của NGƯỜI — cùng luật đã áp cho ` +
  `\`decision\` (\`.claude/rules/ganas-knowledge.md\`). Ghi thẳng \`status: approved\`/` +
  `\`rejected\` (hay \`decided_by\`/\`decided_at\`) vào file proposal bằng Write/Edit là ` +
  `giả mạo một quyết định chưa xảy ra.\n\n` +
  `Đường đúng: \`ganas proposal approve <id> --by @ten\` hoặc \`ganas proposal reject <id> ` +
  `--by @ten --why "..."\` — hai lệnh đó đòi người gõ \`--by\`, không có mặc định, và ghi lại ` +
  `đúng ai đã quyết.`;

/** Chặn khi enforce, chỉ cảnh báo khi warn — cùng khuôn nhánh warn/enforce của postToolUse. */
export function denyOrWarnPreTool(mode: Enforcement, reason: string): HookOutput {
  return mode === "enforce"
    ? denyPreTool(reason)
    : { systemMessage: `ganas (chế độ warn — chưa chặn):\n${reason}` };
}

export const PLAN_APPROVED_REASON =
  `Plan vừa được duyệt đang nằm trong context — và sẽ MẤT khi context bị compact. ` +
  `Chẻ ngay thành Task, đừng để sau.\n\n` +
  `Dùng skill \`plan-to-tasks\`: nó đã dạy đủ các bước, không cần đọc lại plan từ đâu cả. ` +
  `Cấp ID thật ngay bằng \`ganas id task --count N\` — đừng dùng nhãn tạm kiểu T1, T4a.\n\n` +
  `Nhưng phát hiện KHÔNG thuộc plan này — thấy dọc đường, chưa ai duyệt — thì đừng nhét ` +
  `thành Task cho đủ bộ: \`serves\`/\`implements\`/\`exit_contract\` bịa ra là dữ liệu giả. ` +
  `Ghi vào sổ icebox bằng \`ganas icebox add\`. Task là đã quyết LÀM; icebox là đã quyết ` +
  `CHƯA làm, kèm điểm, lý do và ngày xem lại. Cái repo này không cho phép tồn tại là một ` +
  `việc chưa quyết gì cả, nằm lơ lửng — icebox không phải thứ đó.`;

export const DISPATCH_NUDGE_REASON =
  `Task đang làm khai tier rẻ hơn \`main\` (\`scribe\`/\`verifier\`) — việc cơ học hoặc kiểm ` +
  `chứng, không cần model mạnh nhất. Nhưng phiên chính đang tự sửa file thay vì giao việc.\n\n` +
  `Việc cơ học làm bằng model mạnh nhất chính là chỗ over-engineering sinh ra. Brief đã nạp ` +
  `có sẵn hướng dẫn giao sub-agent ở mục "Giao việc" (kèm alias model) — dùng nó.\n\n` +
  `(Chỉ nhắc một lần trong phiên này — không lặp lại ở những lượt sửa tiếp theo.)`;


/* ------------------------------------------------------------------------- *
 * Quyết định cho một lượt GHI
 * ------------------------------------------------------------------------- */

/**
 * Một bước trên đường quyết định: hoặc đã xong (`deny`/`allow`), hoặc còn
 * THIẾU một dữ kiện mà chỉ `io` lấy được (`need`).
 *
 * `need` là chỗ giữ lại phép lười — xem docstring đầu file.
 */
export type WriteStep =
  | { kind: "deny"; reason: string }
  | { kind: "allow" }
  | { kind: "need"; probe: "entity-exists" | "proposal-mode" };

/** Vị trí một file đang bị ghi, đã quy về dạng so sánh được. Do `io` dựng. */
export interface WriteTarget {
  /** Tên tool đang ghi (`Write`, `Edit`, …). */
  toolName: string;
  /** Đường dẫn tuyệt đối đã resolve. */
  abs: string;
  /** Đường dẫn tương đối gốc repo, luôn dùng dấu `/`. */
  rel: string;
  /** Đường dẫn tuyệt đối của sổ cái xác minh, để so bằng. */
  ledgerAbs: string;
  /** Đường dẫn tuyệt đối của `.ganas/config.yaml`, để so bằng. */
  configAbs: string;
  /** Lượt ghi này đến từ sub-agent hay phiên chính. */
  fromSubagent: boolean;
  /** `tool_input` thô — policy chỉ đọc, không sửa. */
  toolInput: Record<string, unknown> | undefined;
}

/**
 * Chặng ĐẦU: mọi thứ quyết định được mà không cần hỏi đĩa.
 *
 * Thứ tự bốn luật giữ nguyên bản cũ và không được đảo: luật cũ thắng trước,
 * thông điệp cũ không đổi. Ai đảo thứ tự này sẽ đổi thông điệp mà người dùng
 * nhận được trong những ca chồng luật, mà không test nào bắt được.
 */
export function decideWriteEarly(t: WriteTarget): WriteStep {
  if (t.abs === t.ledgerAbs) return { kind: "deny", reason: LEDGER_REASON };
  if (t.abs === t.configAbs) return { kind: "deny", reason: CONFIG_REASON };
  if (t.fromSubagent && t.rel.startsWith(SKILL_DIR)) {
    return { kind: "deny", reason: SKILL_WRITE_REASON };
  }

  // Chỉ `Write` mới đè âm thầm; `Edit` vốn đòi file phải có sẵn.
  if (t.toolName === "Write" && isEntityPath(t.rel)) return { kind: "need", probe: "entity-exists" };

  if (isProposalPath(t.rel) && setsProposalDecision(t.toolInput)) {
    return { kind: "need", probe: "proposal-mode" };
  }

  return { kind: "allow" };
}

/** Chặng SAU, nhánh `entity-exists`: file thực thể đã có trên đĩa chưa. */
export function decideEntityOverwrite(exists: boolean): WriteStep {
  return exists ? { kind: "deny", reason: ENTITY_OVERWRITE_REASON } : { kind: "allow" };
}

/** Chặng SAU, nhánh `proposal-mode`: dự án đang đặt luật `proposal_decision` ở mức nào. */
export function decideProposalWrite(mode: Enforcement): HookOutput {
  return denyOrWarnPreTool(mode, PROPOSAL_DECISION_REASON);
}

/** Lệnh shell này có dấu hiệu đang GHI không — quyết định có `markTouched` hay không. */
export function shellLooksLikeWrite(command: string): boolean {
  return SHELL_WRITE_HINTS.some((h) => command.includes(h));
}

/* ------------------------------------------------------------------------- *
 * Quyết định cho PostToolUse — ghi vào kho tri thức
 * ------------------------------------------------------------------------- */

/**
 * Lỗi của file vừa ghi thuộc luật nào: thiếu bằng chứng, hay sai schema.
 *
 * Chỉ cần MỘT lỗi dạng anchor là cả lượt tính theo `knowledge_anchor` — luật
 * nặng hơn thắng, vì hạ xuống `schema` sẽ cho một dự án đang bật
 * `knowledge_anchor: enforce` ghi lọt phát biểu không bằng chứng.
 */
export function ruleForDiagnostics(diags: readonly Diagnostic[]): EnforcementRule {
  return diags.some(isAnchorIssue) ? "knowledge_anchor" : "schema";
}

/** Chữ trả lại cho Claude khi file vừa ghi vào `.ganas/` không hợp lệ. */
export function knowledgeWriteBody(
  rel: string,
  diags: readonly Diagnostic[],
  rule: EnforcementRule,
  nudgeTail: string,
): string {
  return (
    `Ghi vào \`${rel}\` chưa hợp lệ:\n\n${formatDiagnostics(diags)}\n\n` +
    (rule === "knowledge_anchor"
      ? `Kho tri thức chỉ nhận phát biểu có bằng chứng. Thêm anchor (\`file:line\`, ` +
        `\`commit:sha\`, hoặc URL kèm \`fetched_at\`), hoặc bỏ hẳn phát biểu đó ra ` +
        `và ghi vào \`open_questions\` của task.`
      : `Sửa lại cho đúng schema rồi ghi lại. Xem \`.claude/rules/ganas-knowledge.md\`.`) +
    nudgeTail
  );
}

/**
 * Chặn hay chỉ cảnh báo, theo mức cưỡng chế của dự án.
 *
 * Một chỗ duy nhất quyết định hình dạng đó, để mọi luật quy trình nói cùng một
 * kiểu — `warn` mà mỗi luật in một khuôn khác là người đọc phải học lại từng cái.
 */
export function applyEnforcement(mode: Enforcement, body: string): HookOutput {
  return mode === "enforce"
    ? { decision: "block", reason: body }
    : { systemMessage: `ganas (chế độ warn — chưa chặn):\n${body}` };
}

/** Đường dẫn nằm trong cây repo và đối chiếu được với ranh giới của task. */
export function inRepoTree(rel: string | undefined): rel is string {
  return rel !== undefined && rel !== "" && !rel.startsWith("../");
}

/** Quy một đường dẫn thô từ tool call về `{ abs, rel }` chuẩn — phép tính chuỗi, không chạm đĩa. */
export function locate(raw: string, cwd: string, root: string): { abs: string; rel: string } {
  const abs = isAbsolute(raw) ? raw : resolve(cwd, raw);
  return { abs, rel: relative(root, abs).split("\\").join("/") };
}
