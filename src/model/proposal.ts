import { z } from "zod";

import { zAnchors } from "./anchor.js";
import {
  zDesignId,
  zHandle,
  zIceboxId,
  zIsoDate,
  zNonEmpty,
  zProposalId,
  zScopeId,
  zScoreValue,
  zTaskId,
} from "./common.js";
import { CLOCK_SKEW_MS } from "./knowledge.js";

/**
 * PROPOSAL — chỗ lệch mà agent THẤY nhưng CHƯA ai duyệt sửa.
 *
 * Ba thực thể "việc chưa làm" của ganas khác nhau ở chỗ AI đã quyết cái gì:
 *
 *  - `Task`   — người đã quyết LÀM. Có `exit_contract`, được `candidates()` giao.
 *  - `Icebox` — người đã quyết CHƯA làm. Có `why_deferred` và ngày xem lại.
 *  - `Proposal` — **chưa ai quyết gì**. Nó là câu "chỗ này lệch, nên refactor"
 *    đang chờ một con người trả lời có/không.
 *
 * Trước khi có nó, câu đó chỉ tồn tại trong chat và chết theo context, nên
 * agent chỉ còn hai đường đều sai: im lặng bỏ qua, hoặc tự refactor thứ không
 * ai duyệt. Đây là đường thứ ba.
 *
 * File: `.ganas/proposals/PR-00N.yaml` — MỘT file một đề xuất, nạp bằng
 * `collectSingle` như goal/design/task.
 *
 * ## Cạnh chỉ đi MỘT CHIỀU
 *
 * `promoted_to` trỏ tới thực thể sinh ra từ đề xuất này (`D-`/`T-`/`ICE-`), và
 * design/task/icebox KHÔNG có trường nào trỏ ngược lại. Muốn hỏi "design này
 * sinh từ đề xuất nào" thì duyệt proposals. Lưu cả hai chiều là tạo hai nguồn
 * sự thật cho cùng một quan hệ, và chúng lệch nhau ngay lần sửa tay đầu tiên.
 *
 * ## Vì sao `scope` BẮT BUỘC, khác `Icebox.scope`
 *
 * Brief chỉ nhắc proposal CÙNG PHẠM VI với task đang làm (ràng buộc "cách ly"
 * của D-004). Đề xuất không khai phạm vi thì không bao giờ tới tay phiên nào —
 * ghi mà không ai đọc còn tệ hơn không ghi, vì nó tạo cảm giác đã báo rồi.
 * Icebox được phép thiếu `scope` vì nó là sổ của người, tra bằng
 * `ganas icebox review`; proposal thì sống bằng đường brief.
 */

export const PROPOSAL_STATUS = ["pending", "approved", "rejected", "superseded"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUS)[number];

/** Thực thể mà một đề xuất được duyệt có thể sinh ra. */
export const zPromotedTarget = z.union([zDesignId, zTaskId, zIceboxId], {
  errorMap: () => ({
    message: "`promoted_to` phải là ID design (D-001), task (T-001) hoặc icebox (ICE-001)",
  }),
});

export const zProposal = z
  .object({
    id: zProposalId,
    title: zNonEmpty,

    /** Bắt buộc — xem docstring trên. */
    scope: zScopeId,

    /**
     * Chỗ lệch là gì. Tách khỏi `proposed_change` có chủ đích: người duyệt phải
     * đọc được vấn đề trước khi đọc giải pháp, nếu không thì mọi đề xuất đều
     * "nghe hợp lý" — đó là cách một refactor không cần thiết được duyệt.
     */
    problem: zNonEmpty,
    proposed_change: zNonEmpty,

    /**
     * Bằng chứng, không rỗng. Cùng luật đã áp cho fact/claim
     * (`.claude/rules/ganas-knowledge.md`): không chỉ được nguồn thì không phải
     * phát hiện, chỉ là ý kiến — và ý kiến thì không đáng để người bỏ thời gian
     * duyệt.
     */
    anchors: zAnchors,

    /** Quan trọng đến đâu nếu bỏ qua. Cùng thang `DebtScore.weight`. */
    weight: zScoreValue,
    /** Dễ sửa đến đâu. Cùng thang `DebtScore.ease`. */
    ease: zScoreValue,

    /** Thời điểm phát hiện. KHÔNG default `now` — lệnh `new` sẽ điền. */
    found_at: zIsoDate,

    status: z.enum(PROPOSAL_STATUS).default("pending"),

    /**
     * Ai đã trả lời, và lúc nào. Người, luôn luôn: duyệt là việc của người,
     * cùng luật đã áp cho `Decision.decided_by`. Model tự điền hai trường này
     * là giả mạo một quyết định chưa xảy ra — hook chặn ở tầng ghi file.
     */
    decided_by: zHandle.optional(),
    decided_at: zIsoDate.optional(),

    /**
     * Bắt buộc khi từ chối. "Không refactor" mà không nói vì sao thì phiên sau
     * đề xuất lại đúng thứ vừa bị loại, và người duyệt phải trả lời hai lần.
     */
    why_rejected: zNonEmpty.optional(),

    /** Cạnh MỘT CHIỀU tới thứ sinh ra từ đề xuất này. */
    promoted_to: zPromotedTarget.optional(),

    /** Đề xuất cũ mà bản này thay thế. Cùng khuôn `Design.supersedes`. */
    supersedes: z.array(zProposalId).default([]),

    notes: z.string().optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const decided = p.status === "approved" || p.status === "rejected";

    if (decided && !p.decided_by) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decided_by"],
        message:
          `đề xuất ${p.id} có status="${p.status}" nhưng thiếu decided_by — ` +
          `duyệt hay từ chối đều là việc của người, phải ghi tên người đó.`,
      });
    }

    if (decided && !p.decided_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decided_at"],
        message: `đề xuất ${p.id} có status="${p.status}" nhưng thiếu decided_at`,
      });
    }

    if (p.status === "rejected" && !p.why_rejected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["why_rejected"],
        message:
          `đề xuất ${p.id} bị từ chối nhưng thiếu why_rejected. ` +
          `Từ chối không nói lý do thì phiên sau đề xuất lại đúng thứ vừa bị loại.`,
      });
    }

    // Cùng kỹ thuật `zIcebox` dùng cho closed_at/closed_reason: trạng thái
    // "chưa ai quyết mà đã có dấu vết quyết định" bị chặn ở TẦNG SCHEMA, không
    // để thành một cảnh báo đọc sau.
    if (p.status === "pending") {
      for (const [field, value] of [
        ["decided_by", p.decided_by],
        ["decided_at", p.decided_at],
        ["why_rejected", p.why_rejected],
      ] as const) {
        if (value !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message:
              `đề xuất ${p.id} còn status="pending" nhưng đã có ${field} — ` +
              `chưa ai trả lời mà đã có dấu vết đã trả lời.`,
          });
        }
      }
    }

    if (p.promoted_to && p.status !== "approved") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["promoted_to"],
        message: `đề xuất ${p.id} chỉ được có promoted_to khi status="approved"`,
      });
    }

    if (p.supersedes.includes(p.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["supersedes"],
        message: `đề xuất ${p.id} không thể thay thế chính nó`,
      });
    }

    const dup = p.supersedes.find((x, i) => p.supersedes.indexOf(x) !== i);
    if (dup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["supersedes"],
        message: `đề xuất ${p.id} liệt kê ${dup} hai lần`,
      });
    }

    // Cùng ngưỡng lệch đồng hồ mà zFact/zIcebox dùng.
    if (Date.parse(p.found_at) > Date.now() + CLOCK_SKEW_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["found_at"],
        message: `đề xuất ${p.id} có found_at ở tương lai (${p.found_at})`,
      });
    }
  });

export type Proposal = z.infer<typeof zProposal>;
