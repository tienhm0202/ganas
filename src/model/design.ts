import { z } from "zod";

import { zDecisionId, zDesignId, zGoalId, zIsoDate, zModuleId, zNonEmpty, zProbe } from "./common.js";
import type { Module } from "./module.js";
import { zExitCriterion } from "./task.js";

export const DESIGN_STATUS = ["draft", "active", "superseded", "archived", "done"] as const;

/**
 * Loại bản vẽ. Mỗi loại là một HÌNH DẠNG mà code phải khớp, không phải một
 * mức độ chi tiết.
 *
 * Cố ý chưa có `doc` (tài liệu, không phải code): bản vẽ loại đó lấy độ tươi từ
 * một `path` chứ không từ `module.paths`, tức là một hình dạng artifact thứ hai
 * với một bộ luật thứ hai. Chưa có ca dùng thật trong repo này thì chưa xây —
 * xem `open_questions` của T-068.
 */
export const ARTIFACT_KIND = ["schema", "migration", "function", "api", "type"] as const;
export type ArtifactKind = (typeof ARTIFACT_KIND)[number];

/**
 * Id bản vẽ — CỤC BỘ trong một design, đúng như `zVerificationId` cục bộ trong
 * một khối. Nó chỉ có nghĩa khi ghép: `D-010/A-users-table`, cùng khuôn địa chỉ
 * với `M-intent/V-intent-smoke`. Vì vậy nó KHÔNG vào `ID_PATTERNS` toàn cục.
 */
export const zArtifactId = z
  .string()
  .regex(/^A-[a-z0-9][a-z0-9-]*$/i, "ID bản vẽ phải dạng A-users-table");

/** Neo bản vẽ vào một cổng đã khai của khối, để `shape` không tồn tại ở hai nơi. */
export const zArtifactPort = z
  .object({
    side: z.enum(["in", "out"]),
    name: zNonEmpty,
  })
  .strict();

/**
 * Một bản vẽ: hình dạng mà code PHẢI khớp, cộng lệnh đối chiếu nó với code thật.
 *
 * `probe` là cầu nối duy nhất giữa bản vẽ và code. Không có nó thì bản vẽ chỉ là
 * văn xuôi đặt ở chỗ khác — `portIssues()` (`graph/trace.ts`) so shape của khối
 * này với shape của khối kia, không bao giờ so với code.
 */
export const zDesignArtifact = z
  .object({
    id: zArtifactId,
    kind: z.enum(ARTIFACT_KIND),
    /** Khối chứa code mà bản vẽ này mô tả. Cũng là nguồn tính STALE. */
    module: zModuleId,
    shape: zNonEmpty.describe('hình dạng, vd "(userId: string) => Date | null"'),
    port: zArtifactPort.optional(),
    probe: zProbe.optional(),
    notes: z.string().optional(),
  })
  .strict();

export type DesignArtifact = z.infer<typeof zDesignArtifact>;

/**
 * Design chỉ tồn tại để phục vụ goal.
 *
 * `serves` bắt buộc và không rỗng — đây chính là luật chặn "20 design trôi nổi":
 * không thể thêm một design mà không nói nó phục vụ mục tiêu nào.
 */
export const zDesign = z
  .object({
    id: zDesignId,
    title: zNonEmpty,
    serves: z
      .array(zGoalId, {
        required_error:
          "design phải khai `serves` — nó phục vụ goal nào? Không có goal thì không cần design.",
        invalid_type_error: "`serves` phải là danh sách ID goal, vd:\n  serves:\n    - G-001",
      })
      .min(
        1,
        "design phải khai `serves` — nó phục vụ goal nào? Không có goal thì không cần design.",
      ),
    summary: zNonEmpty.describe("một đoạn: cách tiếp cận và vì sao chọn nó"),
    status: z.enum(DESIGN_STATUS).default("draft"),
    /** Các quyết định người đã chốt mà design này dựa vào. */
    decisions: z.array(zDecisionId).default([]),
    supersedes: z.array(zDesignId).default([]),

    /**
     * Hợp đồng ra của CHẶNG — dùng chung `zExitCriterion` với task, cố ý.
     *
     * Task trả lời "bước này xong chưa"; design trả lời "chặng này đóng được
     * chưa". Hai câu hỏi khác nhau nhưng cùng một loại bằng chứng, nên loại
     * tiêu chí thứ hai chỉ làm hai bảng trôi khỏi nhau.
     *
     * Đây cũng là chỗ nợ tiếp nối phải sống. Trước đó nó sống trong `notes`
     * văn xuôi — không schema, không validator — và T-039 (xem
     * `.ganas/tasks/T-048.yaml`) bay hơi đúng vì thế.
     *
     * `.default([])` chứ không `.min(1)`: bảy design đã có phải adopt được.
     * Chỗ ép là luật `spine/design-missing-exit-contract`, ở mức warning.
     */
    /**
     * Bản vẽ của chặng — hình dạng dữ liệu và chữ ký mà code phải khớp.
     *
     * Đây là cạnh Design → Module mà xương sống vốn thiếu: trước đây đường duy
     * nhất từ design xuống code là `task.implements` (ngược chiều) rồi mới
     * `task.touches`. Nghĩa là design không nói được nó CHỐT cái gì, chỉ nói
     * được ai đang làm nó.
     *
     * `.default([])` chứ không `.min(1)`: chín design đã có phải adopt được.
     */
    artifacts: z.array(zDesignArtifact).default([]),

    exit_contract: z.array(zExitCriterion).default([]),

    created_at: zIsoDate.optional(),
    done_at: zIsoDate.optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const dup = d.serves.find((g, i) => d.serves.indexOf(g) !== i);
    if (dup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serves"],
        message: `design ${d.id} liệt kê goal ${dup} hai lần`,
      });
    }
    if (d.status === "done" && !d.done_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["done_at"],
        message: `design ${d.id} đánh dấu done nhưng thiếu done_at`,
      });
    }
    const artifactIds = d.artifacts.map((a) => a.id);
    const dupArtifact = artifactIds.find((id, i) => artifactIds.indexOf(id) !== i);
    if (dupArtifact) {
      // Lỗi PARSE chứ không phải cảnh báo đọc sau: hai bản vẽ trùng id sinh ra hai
      // `Target.id` giống hệt nhau, và dòng sổ cái của cái này đè kết quả của cái
      // kia — câm lặng, không ai thấy.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["artifacts"],
        message: `design ${d.id} có hai bản vẽ trùng id "${dupArtifact}"`,
      });
    }
    if (d.supersedes.includes(d.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["supersedes"],
        message: `design ${d.id} không thể thay thế chính nó`,
      });
    }
  });

export type Design = z.infer<typeof zDesign>;

/**
 * Phát biểu của một bản vẽ — chuỗi mà sổ cái niêm phong cùng với probe.
 *
 * `defHash(definition, statement)` (`src/verify/ledger.ts`) băm CẢ HAI, và đó là
 * toàn bộ lý do hàm này tồn tại: đưa `shape` vào đây thì sửa `shape` trong YAML
 * làm freshness rơi xuống `definition_changed` — "bản vẽ vừa bị đổi, chưa ai
 * chứng minh code chạy theo bản mới". Không có nó thì đổi bản vẽ là chuyện im
 * lặng, và đó đúng là chỗ hỏng mà chặng này sinh ra để vá.
 *
 * Dùng CHUNG giữa `artifactTargets()` (verify/run.ts) và `lintProbe` ở
 * validate.ts. Hai chuỗi khác nhau nghĩa là lint soi một câu còn probe chạy theo
 * câu khác.
 */
export function artifactStatement(design: Design, artifact: DesignArtifact): string {
  return `${design.id}/${artifact.id} (${artifact.kind}) trong ${artifact.module}: ${artifact.shape}`;
}

export const ARTIFACT_ISSUE_CODE = [
  "missing-module",
  "missing-probe",
  "port-not-found",
  "shape-drift",
] as const;
export type ArtifactIssueCode = (typeof ARTIFACT_ISSUE_CODE)[number];

export interface ArtifactIssue {
  artifactId: string;
  /** Vị trí trong mảng `artifacts` — để validator trỏ đúng dòng YAML. */
  index: number;
  code: ArtifactIssueCode;
  message: string;
  hint: string;
}

/**
 * Đối chiếu bản vẽ với sơ đồ khối — thuần, không chạm đĩa, không chạy lệnh.
 *
 * Một nơi quyết, hai nơi in: `graph/validate.ts` biến kết quả thành diagnostic,
 * `commands/design.ts` in cho người. Hai bản cài đặt độc lập của cùng phép kiểm
 * là hai câu trả lời cho một câu hỏi, và chúng sẽ lệch nhau.
 */
export function artifactIssues(
  design: Design,
  lookupModule: (id: string) => Module | undefined,
): ArtifactIssue[] {
  const issues: ArtifactIssue[] = [];

  design.artifacts.forEach((a, index) => {
    const add = (code: ArtifactIssueCode, message: string, hint: string): void => {
      issues.push({ artifactId: a.id, index, code, message, hint });
    };

    const mod = lookupModule(a.module);
    if (!mod) {
      add(
        "missing-module",
        `bản vẽ ${design.id}/${a.id} thuộc khối \`${a.module}\` nhưng khối đó không tồn tại`,
        `Tạo .ganas/modules/${a.module}.yaml, hoặc sửa \`module\` của bản vẽ. Bản vẽ không neo được vào khối thì không có file nào để tính STALE — nó sẽ xanh vĩnh viễn.`,
      );
      return; // các phép kiểm dưới đều cần khối, kiểm tiếp chỉ đẻ lỗi phái sinh
    }

    if (!a.probe) {
      add(
        "missing-probe",
        `bản vẽ ${design.id}/${a.id} chưa có \`probe\` — không có gì đối chiếu nó với code thật`,
        "Thêm `probe: { run: \"...\", expect: exit_zero }`. Bản vẽ không chấm được thì nó là văn xuôi, chỉ khác chỗ đặt.",
      );
    }

    if (!a.port) return;

    const ports = a.port.side === "out" ? mod.contract.outputs : mod.contract.inputs;
    const sideLabel = a.port.side === "out" ? "cổng ra" : "cổng vào";
    const port = ports.find((p) => p.name === a.port?.name);
    if (!port) {
      add(
        "port-not-found",
        `bản vẽ ${design.id}/${a.id} neo vào ${sideLabel} \`${a.port.name}\` của khối ${a.module}, nhưng khối đó không khai cổng nào tên vậy`,
        `Thêm cổng vào \`contract.${a.port.side === "out" ? "outputs" : "inputs"}\` của ${a.module}, hoặc bỏ \`port\` khỏi bản vẽ.`,
      );
      return;
    }

    // So y hệt `portIssues()` (graph/trace.ts): `.trim()` rồi `!==`, không parse kiểu.
    // Hai phép so khác nhau cho cùng một câu hỏi là chỗ hai bảng bắt đầu trôi khỏi nhau.
    if (port.shape.trim() !== a.shape.trim()) {
      add(
        "shape-drift",
        `bản vẽ ${design.id}/${a.id} khai shape \`${a.shape.trim()}\` nhưng ${sideLabel} \`${port.name}\` của ${a.module} khai \`${port.shape.trim()}\` — hai bản vẽ của cùng một thứ`,
        "Sửa một trong hai cho khớp. Phép so là `.trim()` rồi so từng ký tự, đúng như `portIssues()` — khoảng trắng đầu/cuối không tính, còn lại tính hết.",
      );
    }
  });

  return issues;
}
