import { z } from "zod";

import { zAnchors } from "./anchor.js";
import {
  zIceboxId,
  zIsoDate,
  zNonEmpty,
  zScopeId,
  zScoreValue,
  zTaskId,
} from "./common.js";
import { CLOCK_SKEW_MS } from "./knowledge.js";

/**
 * ICEBOX — việc đã quyết CHƯA làm.
 *
 * `Task` (`src/model/task.ts`) là đã quyết LÀM: nó có `exit_contract`, được
 * `candidates()` (`src/graph/select.ts`) chọn để giao cho một phiên. Icebox là
 * mặt đối lập có chủ đích — một phát hiện giữa phiên, đã chấm điểm hai trục
 * (`weight`/`ease`, cùng thang với `DebtScore` ở `src/debt.ts`), nhưng chưa
 * tới lượt làm. Nó KHÔNG có `exit_contract`, KHÔNG có `serves`/`implements`,
 * và không bao giờ được `candidates()` nhìn thấy — hai thực thể lặp lại đúng
 * khuôn `Claim` (nhẹ, chưa kiểm chứng) → `Fact` (nặng, đã kiểm chứng): `Task`
 * không đổi một dòng nào để dựng khuôn này.
 *
 * Thứ repo này không cho phép là một việc chưa quyết gì cả, nằm lơ lửng —
 * icebox không phải thứ đó. Mỗi bản ghi bắt buộc có điểm số (`weight`/`ease`),
 * lý do hoãn (`why_deferred`), và ngày xem lại (`found_at` + `review_after_days`)
 * — ba thứ phân biệt "hoãn có ý thức" với "quên mất".
 *
 * File: `.ganas/icebox/YYYY-MM.yaml` — MẢNG bản ghi trong một file theo
 * tháng, cùng khuôn nạp `collectArray` như `facts/`, `claims/`, `decisions/`.
 */

export const ICEBOX_STATUS = ["open", "closed", "promoted"] as const;
export type IceboxStatus = (typeof ICEBOX_STATUS)[number];

export const zIcebox = z
  .object({
    id: zIceboxId,
    title: zNonEmpty,
    /** Thời điểm phát hiện. KHÔNG default `now` — lệnh `add` sẽ điền. */
    found_at: zIsoDate,
    /**
     * Per-record, không per-project: "sửa kiến trúc khi rảnh" và "kiểm lại
     * sau sprint" là hai chân trời khác nhau. Cùng khuôn `Fact.ttl_days`.
     */
    review_after_days: z.number().int().min(1).default(30),
    /** Quan trọng đến đâu nếu bỏ qua. Cùng thang với `DebtScore.weight`. */
    weight: zScoreValue,
    /** Dễ sửa đến đâu. Cùng thang với `DebtScore.ease`. */
    ease: zScoreValue,
    /**
     * Lý do hoãn, bắt buộc, không rỗng. Trường giữ sổ này trung thực — sáu
     * tháng sau không ai biết lý do hoãn còn đúng không nếu không ghi. Đây là
     * thứ phân biệt "hoãn có ý thức" với "quên".
     */
    why_deferred: zNonEmpty,
    anchors: zAnchors,
    /**
     * Tuỳ chọn CÓ CHỦ ĐÍCH, khác `Module.scope` bắt buộc: phát hiện giữa
     * phiên thường chưa biết thuộc phạm vi nào, bắt buộc = ép bịa. Luật
     * validate ở bước sau sẽ nhắc khi thiếu, không phải schema này.
     */
    scope: zScopeId.optional(),
    status: z.enum(ICEBOX_STATUS).default("open"),
    closed_at: zIsoDate.optional(),
    closed_reason: zNonEmpty.optional(),
    promoted_to: zTaskId.optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((i, ctx) => {
    if (i.status !== "open" && !i.closed_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closed_at"],
        message: `icebox ${i.id} có status="${i.status}" nhưng thiếu closed_at`,
      });
    }

    if (i.status === "closed" && !i.closed_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closed_reason"],
        message:
          `icebox ${i.id} đóng (status="closed") nhưng thiếu closed_reason. ` +
          `Đóng mà không nói vì sao thì phiên sau đề xuất lại đúng thứ vừa bị loại.`,
      });
    }

    if (i.status === "promoted" && !i.promoted_to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["promoted_to"],
        message: `icebox ${i.id} có status="promoted" nhưng thiếu promoted_to`,
      });
    }

    // Bản sao của luật `zClaim` cấm `verdict.promoted_to` khi trust !==
    // "confirmed": cưỡng chế "đã thăng cấp thì không còn nằm trong danh sách
    // đang gác" ở TẦNG SCHEMA — trạng thái đó trở thành bất khả thi về cấu
    // trúc, không phải một cảnh báo đọc sau.
    if (i.promoted_to && i.status !== "promoted") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["promoted_to"],
        message: `icebox ${i.id} chỉ được có promoted_to khi status="promoted"`,
      });
    }

    if (i.status === "open" && (i.closed_at !== undefined || i.closed_reason !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: `icebox ${i.id} status="open" nhưng có closed_at/closed_reason — đóng chưa xảy ra nhưng lại có dấu vết đã đóng`,
      });
    }

    // Ngày ở tương lai làm "quá hạn xem lại" không bao giờ tới — cùng lý lẽ
    // và cùng ngưỡng lệch đồng hồ mà `zFact` dùng để chặn `last_verified_at`
    // ở tương lai (xem CLOCK_SKEW_MS, src/model/knowledge.ts).
    const t = Date.parse(i.found_at);
    if (t > Date.now() + CLOCK_SKEW_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["found_at"],
        message: `icebox ${i.id} có found_at ở tương lai (${i.found_at}). Chỉ đặt trường này bằng thời điểm phát hiện thật.`,
      });
    }
  });

export type Icebox = z.infer<typeof zIcebox>;
