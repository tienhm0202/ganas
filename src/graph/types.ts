import type {
  Claim,
  Config,
  Decision,
  Design,
  Fact,
  Goal,
  Icebox,
  Module,
  Scope,
  Task,
} from "../model/index.js";
import type { LoadedYaml } from "../util/yaml.js";
import type { LedgerEntry } from "../verify/ledger.js";

export type Severity = "error" | "warning" | "info";

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
