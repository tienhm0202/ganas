import type { Document } from "yaml";

import type {
  Claim,
  Config,
  Decision,
  Design,
  Fact,
  Goal,
  Icebox,
  Module,
  Proposal,
  Scope,
  Task,
} from "../model/index.js";

export type Severity = "error" | "warning" | "info";

/**
 * File YAML đã parse, giữ nguyên Document để quy lỗi về đúng dòng.
 *
 * Kiểu thuần, không đọc gì — khai ở đây (khối lá) chứ không ở `util/yaml.ts`
 * để `Graph` không phải nhập ngược từ khối nạp file. Chỗ đọc thật vẫn là
 * `readYamlFile()`.
 */
export interface LoadedYaml {
  /** Giá trị JS thuần đã parse. */
  value: unknown;
  /** Document giữ vị trí node — dùng để quy lỗi về đúng dòng. */
  doc: Document;
  source: string;
  file: string;
}

export const LEDGER_RESULT = [
  "pass",
  "fail",
  /** Ngưỡng đạt nhưng nằm trong vùng nhiễu — chưa đủ để gọi là pass. */
  "marginal",
  /** `skip_if` khớp: không kiểm được ở môi trường này. KHÔNG phải fail. */
  "unavailable",
  /** Probe nằm trong danh sách cấm hoặc không chấm được — cần người xem. */
  "unprovable",
] as const;
export type LedgerResult = (typeof LEDGER_RESULT)[number];

/**
 * Một dòng của sổ cái xác minh.
 *
 * Kiểu dữ liệu thuần, không kèm cách ghi — chỗ ghi/đọc thật là
 * `src/verify/ledger.ts`. Khai ở khối lá vì `Graph` giữ sổ cái đã nạp, mà
 * khối nạp lại không được để khối đồ thị phụ thuộc ngược vào khối chạy
 * bằng chứng (chu trình khối, xem PR-013).
 */
export interface LedgerEntry {
  /** `F-ACC-001` (fact) hoặc `M-intent/V-intent-smoke` (bằng chứng của khối). */
  target: string;
  kind: "probe" | "eval" | "contract";
  at: string;
  /** Vân tay ĐỊNH NGHĨA + PHÁT BIỂU đã chạy. Lệch ⇒ đo một thứ khác. */
  def: string;
  result: LedgerResult;
  /**
   * Số thứ tự tăng dần trong chain hash — xem `verifyChain()`.
   *
   * Vắng mặt = dòng ghi trước khi có hash-chain (P2). Đoạn đó không được
   * chain bảo vệ, chỉ được bảo vệ bởi "append-only + commit git" như trước —
   * xem CONCEPTS.md.
   */
  seq?: number;
  /**
   * Hash của toàn bộ chain TÍNH TỚI NGAY TRƯỚC dòng này (không tính chính
   * dòng này) — cùng lược đồ hash-chain mà Secure Scuttlebutt và Certificate
   * Transparency (RFC 6962) dùng, không phải tự nghĩ ra: mỗi bản ghi giữ dấu
   * vết của mọi bản ghi trước nó, nên sửa/xoá/đảo một dòng cũ làm lệch hash
   * của MỌI dòng sau nó — phát hiện được bằng cách đọc lại và tính lại, không
   * cần gì ngoài chính file này. Xem `verifyChain()`.
   *
   * Vắng mặt = dòng ghi trước khi có hash-chain.
   */
  prev_hash?: string;
  /**
   * Mutation test đã chứng minh probe CÓ THỂ fail chưa.
   *
   * Không có trường này thì một dòng `pass` do `--no-mutation` sinh ra không
   * phân biệt được với dòng do lần chạy đã qua bóp méo sinh ra — và
   * `needsRun()` thấy `pass` là bỏ qua, nên probe rỗng ruột thành `pass` vĩnh
   * viễn trong sổ cái. Bằng chứng mạnh nhất mà hệ có lại là thứ duy nhất không
   * được lưu.
   *
   * Vắng mặt = lần chạy cũ, trước khi trường này tồn tại.
   */
  proof?: "proven" | "unproven";
  /**
   * Vân tay NỘI DUNG của tập file phụ thuộc lúc chạy.
   *
   * Trước P2 N24 độ cũ tính bằng `mtime`, nên `touch -d '2020-01-01' <file>`
   * đảo một fact từ `stale` về `fresh` mà không sửa một dòng code nào — và
   * `touch` không nằm trong danh sách lệnh bị hook chặn. Hash nội dung thì
   * không lùi được bằng cách chỉnh đồng hồ.
   *
   * Vắng mặt = bản ghi cũ; khi đó rơi về so `mtime` như trước.
   */
  deps?: string;

  /* --- riêng eval: kết quả chỉ đúng với đúng bộ này --------------------- */
  score?: number;
  threshold?: number;
  n?: number;
  passed?: number;
  model?: string;
  /** sha file prompt lúc chạy. */
  prompt?: string;
  /** sha file dataset lúc chạy. */
  dataset?: string;
  cost_usd?: number;

  /* --- ai chạy, ở đâu --------------------------------------------------- */
  by: string;
  git?: string;
  host?: string;
  /** sha của stdout+stderr — để đối chiếu khi nghi ngờ. */
  output?: string;
}

/** Một phát hiện của validator, luôn quy về được `file:line`. */
export interface Diagnostic {
  severity: Severity;
  /** Mã ổn định để hook và test bám vào, vd "spine/design-missing-goal". */
  code: string;
  message: string;
  file: string;
  line?: number | undefined;
  /** Gợi ý cách sửa — hook trả lại cho Claude qua `reason`. */
  hint?: string | undefined;
}

/** Bản ghi kèm nguồn gốc file, để mọi lỗi truy ngược được. */
export interface Sourced<T> {
  value: T;
  file: string;
  /** Vị trí trong file với các file dạng mảng (facts, claims, decisions). */
  index?: number;
}

export interface Graph {
  root: string;
  config: Config;
  goals: Map<string, Sourced<Goal>>;
  designs: Map<string, Sourced<Design>>;
  tasks: Map<string, Sourced<Task>>;
  /** Phạm vi công việc — ranh giới của cả việc lẫn tri thức. */
  scopes: Map<string, Sourced<Scope>>;
  modules: Map<string, Sourced<Module>>;
  facts: Map<string, Sourced<Fact>>;
  claims: Map<string, Sourced<Claim>>;
  decisions: Map<string, Sourced<Decision>>;
  /** Việc đã quyết CHƯA làm — xem docstring đầu `src/model/icebox.ts`. */
  icebox: Map<string, Sourced<Icebox>>;
  /** Chỗ lệch CHƯA ai quyết — xem docstring đầu `src/model/proposal.ts`. */
  proposals: Map<string, Sourced<Proposal>>;
  /**
   * Document YAML đã parse, theo đường dẫn file tương đối. Giữ lại để validator
   * chéo quy được lỗi về đúng dòng, không chỉ đúng file.
   */
  sources: Map<string, LoadedYaml>;
  /**
   * Sổ cái xác minh, đánh chỉ mục theo target. Nạp cùng graph để validator có
   * thể đối chiếu `last_verified_at` mà không cần thành hàm async.
   */
  ledger: Map<string, LedgerEntry[]>;
  /**
   * Sổ cái xác minh, ĐÚNG THỨ TỰ đã ghi trong file — `ledger` ở trên đã gom
   * theo target nên mất thứ tự xen kẽ giữa các target, mà hash-chain
   * (`verifyChain()`) cần đúng thứ tự thật để tính lại.
   */
  ledgerRaw: readonly LedgerEntry[];
  /** Lỗi phát sinh ngay lúc nạp (YAML hỏng, sai schema, ID trùng). */
  loadDiagnostics: Diagnostic[];
  /** Nội dung `.gitignore` ở gốc dự án, nếu có — dùng để đối chiếu `LOCAL_ONLY`. */
  gitignoreRaw: string | null;
}

export function hasErrors(diags: readonly Diagnostic[]): boolean {
  return diags.some((d) => d.severity === "error");
}

export function countBySeverity(diags: readonly Diagnostic[]): Record<Severity, number> {
  const out: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const d of diags) out[d.severity]++;
  return out;
}
