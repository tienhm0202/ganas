import { z } from "zod";

import {
  zDesignId,
  zExpect,
  zFactId,
  zGoalId,
  zIsoDate,
  zModuleId,
  zNonEmpty,
  zScopeId,
  zTaskId,
} from "./common.js";
import { MODEL_TIER } from "./config.js";

/**
 * KHÔNG có `blocked`: "bị chặn" là điều SUY RA từ `blocked_by`, không phải điều
 * khai tay. `openBlockers()` (`src/graph/select.ts`) đã là người quyết duy nhất
 * của câu hỏi đó; một trạng thái khai song song là câu trả lời thứ hai cho cùng
 * một câu hỏi, và câu trả lời thứ hai luôn trôi — task khai `blocked` mà mọi
 * blocker đã done thì `ganas next` không bao giờ đánh dấu nó `in_progress` nữa
 * (nó chỉ đổi từ `todo`), mà không lỗi nào nổi lên.
 *
 * Giá trị này chưa từng được ghi bởi bất kỳ dòng code nào kể từ khi enum ra
 * đời — đúng lớp "khai rồi không nối dây" mà `test/no-dead-ends.test.ts` sinh
 * ra để chặn.
 */
export const TASK_STATUS = ["todo", "in_progress", "done"] as const;

/** Ước lượng context. `large` bị validator cảnh báo — task phải vừa một phiên. */
export const ESTIMATED_CONTEXT = ["small", "medium", "large"] as const;

/**
 * Vai của task: `design` (vẽ bản thiết kế, không đụng code) hay `build`
 * (hiện thực code theo bản vẽ). Xem docstring trường `role` bên dưới `zTask`
 * cho lý do và luật đi kèm.
 */
export const TASK_ROLE = ["design", "build"] as const;

/**
 * Địa chỉ một BẢN VẼ của chặng: `D-010/A-users-table` — id design, gạch chéo,
 * id bản vẽ. Cùng khuôn địa chỉ với `M-intent/V-intent-smoke`, và đúng dạng thứ
 * tư mà `resolvesTarget()` (`src/graph/validate.ts`) đã biết giải.
 *
 * Phải ghép hai vế chứ không dùng lại được một `zXxxId` sẵn có: `zArtifactId`
 * (`src/model/design.ts`) chỉ có nghĩa CỤC BỘ trong một design, nên một mình nó
 * không trỏ được tới đâu cả.
 */
export const zArtifactRef = z
  .string()
  .regex(
    /^D-\d{3,}\/A-[A-Za-z0-9][A-Za-z0-9-]*$/,
    "địa chỉ bản vẽ phải dạng `D-010/A-users-table` (id design, gạch chéo, id bản vẽ)",
  );

/**
 * Bản giao việc cho một sub-agent.
 *
 * Đây là CHỈ THỊ cho agent, không phải PHÁT BIỂU về hệ thống — nên nó không rơi
 * vào luật cấm "viết tổng kết văn xuôi rồi coi đó là tri thức"
 * (`.claude/rules/ganas-knowledge.md`). Nhưng ranh giới phải giữ, nếu không
 * task thành bãi văn xuôi:
 *
 * - điều KIỂM CHỨNG ĐƯỢC thuộc `exit_contract` (lệnh chạy được, hoặc
 *   `kind: manual` để người ký), KHÔNG phải một câu văn agent tự chấm mình;
 * - quy trình lặp lại ở nhiều task thì thành `skills` — đã có sẵn và brief đã
 *   nạp; `steps` chỉ cho các bước RIÊNG của task này;
 * - guardrail đã cưỡng chế ở nơi khác thì không chép lại: "không ra ngoài phạm
 *   vi" đã là `scope` + `taskBoundary()`, "không bịa" đã là luật có hook chặn.
 *
 * Mọi trường tuỳ chọn hoặc `.default([])`: điền một nửa vẫn hợp lệ. Chỗ bắt
 * "khai rồi không nói được gì" là luật `spine/agent-empty`, chấm bằng chính
 * `agentDispatchLines()` ngay dưới đây.
 */
export const zAgentSpec = z
  .object({
    persona: zNonEmpty.optional().describe("agent này đóng vai gì"),
    objective: zNonEmpty.optional().describe("một câu: xong nghĩa là gì"),
    steps: z.array(zNonEmpty).default([]),
    self_check: z.array(zNonEmpty).default([]),
    guardrails: z.array(zNonEmpty).default([]),
    /**
     * Công cụ nên dùng. ganas KHÔNG cưỡng chế được danh sách này: tool sinh
     * sub-agent không nhận allowlist từ ganas, nên đây là KHUYẾN NGHỊ in ra cho
     * người đọc, không phải một hàng rào. Giả vờ cưỡng chế được là đúng lớp lỗi
     * `test/no-dead-ends.test.ts` sinh ra để chặn — nên `agentDispatchLines()`
     * tự khai là không kiểm được, ngay trên dòng nó in ra.
     */
    tools: z.array(zNonEmpty).default([]),
  })
  .strict();

export type AgentSpec = z.infer<typeof zAgentSpec>;

/**
 * Bản giao việc thành CHỮ — nơi quyết DUY NHẤT nó trông thế nào.
 *
 * Đây là accessor công khai của `AgentSpec`: chỗ khác (brief in ra cho người,
 * validator chấm luật) gọi hàm này thay vì với tay vào từng trường, nên đổi
 * cách trình bày chỉ phải sửa một chỗ. Hai chỗ tự dựng chữ là hai bản sẽ lệch
 * nhau.
 *
 * Trả về mảng RỖNG khi `agent` không nói được gì — `spine/agent-empty`
 * (`src/graph/validate.ts`) chấm đúng điều kiện đó, và đó cũng là lý do phép
 * "rỗng ruột" được quyết ở ĐÂY chứ không phải bằng một phép đếm trường thứ hai
 * trong validator.
 */
export function agentDispatchLines(agent: AgentSpec): string[] {
  const lines: string[] = [];
  if (agent.persona) lines.push(`Vai: ${agent.persona}`);
  if (agent.objective) lines.push(`Xong nghĩa là: ${agent.objective}`);
  agent.steps.forEach((step, i) => lines.push(`Bước ${i + 1}: ${step}`));
  for (const rail of agent.guardrails) lines.push(`Không được: ${rail}`);
  for (const item of agent.self_check) lines.push(`Tự kiểm trước khi báo xong: ${item}`);
  if (agent.tools.length > 0) {
    lines.push(
      `Công cụ nên dùng: ${agent.tools.join(", ")} — khuyến nghị thôi, ` +
        `ganas không chặn được công cụ nằm ngoài danh sách này`,
    );
  }
  return lines;
}

/**
 * context_contract — trả lời câu hỏi "phiên mới cần THÔNG TIN gì".
 * Đây là thứ SessionStart render vào brief.
 */
export const zContextContract = z.object({
  must_read: z
    .array(
      z.object({
        path: zNonEmpty,
        /** Bắt buộc: một danh sách file không có lý do thì phiên sau đọc mò. */
        why: zNonEmpty,
      }),
    )
    .default([]),
  /** Fact phải còn FRESH mới được dùng; brief cảnh báo nếu STALE. */
  facts: z.array(zFactId).default([]),
  open_questions: z.array(zNonEmpty).default([]),
});

export type ContextContract = z.infer<typeof zContextContract>;

/**
 * exit_contract — điều kiện "done" kiểm chứng được. Stop hook chấm cái này;
 * chưa thoả thì phiên không kết thúc được.
 */
const zExitCommand = z.object({
  kind: z.literal("command"),
  run: zNonEmpty,
  expect: zExpect,
});

const zExitArtifact = z.object({
  kind: z.literal("artifact"),
  path: zNonEmpty,
  must_contain: z.string().optional(),
});

const zExitHandoff = z.object({
  kind: z.literal("handoff"),
  required: z.boolean().default(true),
});

const zExitManual = z.object({
  kind: z.literal("manual"),
  check: zNonEmpty,
});

/**
 * Đòi một target trong sổ cái phải FRESH (chạy thật, còn tươi) — không phải
 * chỉ "chạy một lệnh nào đó thoát mã 0". Đây là cầu nối giữa `touches` (khối
 * nào task này chạm) và bằng chứng thật của khối đó; không có tiêu chí này
 * thì task chạm khối xong vẫn "done" được mà không ai chạy `ganas verify`.
 */
const zExitVerification = z.object({
  kind: z.literal("verification"),
  target: zNonEmpty.describe(
    "id target trong sổ cái, vd `M-intent/V-intent-eval` (bằng chứng của khối) hoặc `F-ACC-001` (fact)",
  ),
});

export const zExitCriterion = z.discriminatedUnion("kind", [
  zExitCommand,
  zExitArtifact,
  zExitHandoff,
  zExitManual,
  zExitVerification,
]);

export type ExitCriterion = z.infer<typeof zExitCriterion>;

export const zTask = z
  .object({
    id: zTaskId,
    title: zNonEmpty,
    serves: z
      .array(zGoalId, { required_error: "task phải khai `serves` — nó phục vụ goal nào?" })
      .min(1, "task phải khai `serves` — nó phục vụ goal nào?"),
    implements: zDesignId.describe("design mà task này hiện thực"),
    /**
     * Phạm vi công việc chứa task. Bắt buộc: task không thuộc phạm vi nào thì
     * không ai nghiệm thu được nó, và tri thức nó sinh ra không biết neo vào đâu.
     */
    scope: zScopeId,
    status: z.enum(TASK_STATUS).default("todo"),
    estimated_context: z.enum(ESTIMATED_CONTEXT).default("medium"),

    context_contract: zContextContract.default({ must_read: [], facts: [], open_questions: [] }),

    /** Kỹ năng cần cho task — brief liệt kê để phiên mới biết nạp gì. */
    skills: z.array(zNonEmpty).default([]),

    /**
     * Tier model nên dùng khi giao task này (cho sub-agent hoặc phiên mới).
     * Gán lúc chẻ task từ plan — quyết định của người/agent thiết kế, KHÔNG
     * suy tự động từ module.nature (heuristic không đáng tin bằng người biết rõ
     * việc). Không gán thì brief không gợi ý model nào — không đoán bừa.
     */
    model: z.enum(MODEL_TIER).optional(),

    /**
     * Vai của task: `design` (vẽ bản thiết kế) hay `build` (hiện thực code
     * theo bản vẽ). Gán lúc chẻ task — quyết định của NGƯỜI, không suy tự
     * động, đúng lý lẽ đã áp cho `model` ngay phía trên: heuristic (vd "task
     * không có `touches` thì chắc là design") không đáng tin bằng người biết
     * rõ việc, và đoán sai thì không lỗi nào nổi lên.
     *
     * Mặc định `build`: toàn bộ task khai từ trước khi trường này ra đời là
     * hiện thực code, và phần lớn task tương lai cũng vậy — coi "build" là
     * ngầm định để 49 task cũ adopt được mà không phải sửa file nào, thay vì
     * bắt mọi task khai tay một trường vốn hầu như luôn cùng một giá trị.
     * Đây KHÔNG phải suy luận: mặc định chỉ chọn giá trị PHỔ BIẾN NHẤT, còn
     * `design` vẫn phải khai tay — không có tín hiệu nào (kể cả `touches`
     * rỗng, vốn có nhiều lý do khác) tự động biến một task thành design.
     */
    role: z.enum(TASK_ROLE).default("build"),

    /**
     * Bản vẽ mà task này CẦN — hợp đồng vào (input_contract).
     *
     * Đây là thứ thay `context_contract.must_read` cho phần hợp đồng: brief bơm
     * thẳng `shape` của đúng những bản vẽ này, thay vì đưa một danh sách ĐƯỜNG
     * DẪN rồi bắt agent mở cả kho. Một design mười bản vẽ mà task chỉ dùng hai
     * thì tám cái còn lại là nhiễu — và agent vẫn sẽ suy diễn theo nhiễu đó.
     *
     * `.default([])`: mọi task khai trước khi trường này ra đời phải adopt được
     * mà không phải sửa file nào.
     */
    consumes: z.array(zArtifactRef).default([]),

    /**
     * Bản vẽ mà task này SINH RA — vế ngược của `consumes`.
     *
     * Nhờ hai trường đó, câu "bước sau là task nào" SUY ĐƯỢC: task nào
     * `consumes` thứ task này `produces` thì đó là bước sau. Vì vậy KHÔNG có
     * trường `next`: hai câu trả lời cho một câu hỏi thì có ngày lệch nhau —
     * đúng lý lẽ đã dùng cho `blocked_by` so với một `status: blocked` (xem
     * docstring `TASK_STATUS` đầu file).
     *
     * Khai `produces` thì `exit_contract` phải có tiêu chí `verification` trỏ
     * vào chính bản vẽ đó — luật `spine/task-produces-without-verification`,
     * đúng khuôn `touches` → `spine/task-missing-verification`.
     */
    produces: z.array(zArtifactRef).default([]),

    /**
     * Bản giao việc cho sub-agent. TUỲ CHỌN — chỉ điền khi task thật sự sẽ được
     * giao đi. Điền cho đủ lệ vào mọi task đang mở là đưa văn xuôi chết vào
     * đường nóng của `loadGraph`, chạy lại mỗi lần hook chạy.
     */
    agent: zAgentSpec.optional(),

    /**
     * Khối trong sơ đồ mà task này chạm tới.
     *
     * Đây là điểm nối giữa trục VIỆC và trục HỆ THỐNG: chạm khối nào thì phải để
     * lại bằng chứng cho khối đó (luật `spine/task-missing-verification`).
     */
    touches: z.array(zModuleId).default([]),

    exit_contract: z
      .array(zExitCriterion, {
        required_error:
          "task phải có `exit_contract` — làm sao biết nó xong? " +
          "Không có tiêu chí kiểm chứng được thì Stop hook không chấm được, " +
          'và "xong" trở thành ý kiến.',
      })
      .min(1, "task phải có `exit_contract` — làm sao biết nó xong?"),

    blocked_by: z.array(zTaskId).default([]),
    created_at: zIsoDate.optional(),
    done_at: zIsoDate.optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    if (t.blocked_by.includes(t.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blocked_by"],
        message: `task ${t.id} không thể tự chặn chính nó`,
      });
    }
    if (t.status === "done" && !t.done_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["done_at"],
        message: `task ${t.id} đánh dấu done nhưng thiếu done_at`,
      });
    }
    const dupServes = t.serves.find((g, i) => t.serves.indexOf(g) !== i);
    if (dupServes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serves"],
        message: `task ${t.id} liệt kê goal ${dupServes} hai lần`,
      });
    }
  });

export type Task = z.infer<typeof zTask>;
