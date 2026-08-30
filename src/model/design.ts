import { z } from "zod";

import { zDecisionId, zDesignId, zGoalId, zIsoDate, zModuleId, zNonEmpty, zProbe } from "./common.js";
import type { Module } from "./module.js";
import { zExitCriterion } from "./task.js";

export const DESIGN_STATUS = ["draft", "active", "superseded", "archived", "done"] as const;

/**
 * Loại bản vẽ. Mỗi loại là một HÌNH DẠNG mà code phải khớp, không phải một
 * mức độ chi tiết.
 *
 * `doc` là loại DUY NHẤT không mô tả code: nó mô tả một TÀI LIỆU, nên nó neo
 * vào `path` (một file) thay vì vào `module`, và độ tươi tính từ chính file đó
 * chứ không từ `module.paths` — xem `artifactTargets()` (`src/verify/run.ts`).
 * Hai hình dạng neo khác nhau nên `superRefine` của `zDesignArtifact` ép ĐÚNG
 * MỘT trong hai có mặt, theo `kind`.
 */
export const ARTIFACT_KIND = ["schema", "migration", "function", "api", "type", "doc"] as const;
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
    /**
     * Khối chứa code mà bản vẽ này mô tả. Cũng là nguồn tính STALE.
     *
     * `.optional()` chỉ vì `kind: doc` neo bằng `path` thay vì bằng khối — với
     * mọi kind khác nó vẫn BẮT BUỘC, và `superRefine` bên dưới ép điều đó thành
     * lỗi PARSE.
     */
    module: zModuleId.optional(),
    /**
     * File tài liệu mà bản vẽ `doc` mô tả — nguồn tính STALE thay cho
     * `module.paths`.
     *
     * Phải là ĐƯỜNG DẪN có thư mục (`docs/CONCEPTS.md`), không phải một tên
     * file trần: `globsOf()` (`src/graph/freshness.ts`) chỉ nhận phần tử có
     * `*` hoặc `/`, nên một `path` trần khiến context rỗng và bản vẽ XANH VĨNH
     * VIỄN — đúng cái bẫy mà docstring `scopeTargets()` (`src/verify/run.ts`)
     * đã trả giá một lần.
     */
    path: zNonEmpty.optional(),
    shape: zNonEmpty.describe('hình dạng, vd "(userId: string) => Date | null"'),
    port: zArtifactPort.optional(),
    probe: zProbe.optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    // Lỗi PARSE chứ không phải cảnh báo đọc sau: một bản vẽ không neo được vào
    // đâu (hoặc neo vào hai chỗ) thì không có file nào để tính STALE, và nó
    // xanh vĩnh viễn — im lặng, đúng lớp hỏng mà chặng bản vẽ sinh ra để chống.
    if (a.kind === "doc") {
      if (!a.path) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["path"],
          message: `bản vẽ ${a.id} khai kind: doc nên phải có \`path\` — tài liệu neo vào một file, không vào khối`,
        });
      }
      if (a.module) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["module"],
          message: `bản vẽ ${a.id} khai kind: doc thì không được khai \`module\` — chọn một trong hai, \`path\` cho tài liệu`,
        });
      }
      // `path` PHẢI nằm trong một thư mục. Đây không phải luật thẩm mỹ:
      // `globsOf()` (`src/graph/freshness.ts`) chỉ giữ phần tử context có `*`
      // hoặc `/` — nó tồn tại để loại `entrypoints` (tên symbol) ra khỏi phép
      // tính độ tươi. Một `path` trần như `README.md` rơi đúng vào bộ lọc đó,
      // nên context thành rỗng và bản vẽ KHÔNG BAO GIỜ stale: sửa tài liệu bao
      // nhiêu lần nó vẫn xanh. Thà chặn ồn ào lúc ghi còn hơn phát hiện bằng
      // một bản vẽ đã nói dối suốt sáu tháng.
      if (a.path && !a.path.includes("/")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["path"],
          message:
            `bản vẽ ${a.id} khai \`path: ${a.path}\` — tên file trần không tính được độ tươi, ` +
            `bản vẽ sẽ xanh vĩnh viễn dù tài liệu đã đổi. Đặt tài liệu trong một thư mục, vd \`docs/${a.path}\`.`,
        });
      }
      if (a.port) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["port"],
          message: `bản vẽ ${a.id} khai kind: doc thì không được khai \`port\` — cổng là của khối, mà bản vẽ doc không neo vào khối nào`,
        });
      }
      return;
    }
    if (!a.module) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["module"],
        message: `bản vẽ ${a.id} (kind: ${a.kind}) phải khai \`module\` — chỉ kind: doc mới neo bằng \`path\``,
      });
    }
    if (a.path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["path"],
        message: `bản vẽ ${a.id} (kind: ${a.kind}) mô tả CODE nên neo bằng \`module\`, không bằng \`path\``,
      });
    }
  });

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
  // `module ?? path` chứ không phải hai câu khác nhau: bản vẽ `doc` neo vào file,
  // các kind còn lại neo vào khối, nhưng CÂU niêm phong vẫn phải là một khuôn —
  // đổi khuôn cho kind cũ là làm `defHash()` lệch và mọi bản vẽ đã kiểm rơi về
  // `definition_changed` mà không ai đổi gì.
  return `${design.id}/${artifact.id} (${artifact.kind}) trong ${artifact.module ?? artifact.path}: ${artifact.shape}`;
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

    // Bản vẽ `doc` không neo vào khối (`superRefine` của `zDesignArtifact` đã ép
    // điều đó), nên mọi phép kiểm dưới đây — vốn đều cần khối — không áp dụng.
    // Chỉ còn `probe`: tài liệu cũng phải có gì đó đối chiếu được với file thật.
    if (!a.module) {
      if (!a.probe) {
        add(
          "missing-probe",
          `bản vẽ ${design.id}/${a.id} chưa có \`probe\` — không có gì đối chiếu nó với file thật`,
          'Thêm `probe: { run: "...", expect: exit_zero }`. Bản vẽ không chấm được thì nó là văn xuôi, chỉ khác chỗ đặt.',
        );
      }
      return;
    }

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
