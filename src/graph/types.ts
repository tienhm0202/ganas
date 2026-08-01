import type {
  Goal,
  Sprint,
  Design,
  Task,
  Fact,
  Claim,
  Decision,
  Config,
  Part,
  Module,
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
  sprints: Map<string, Sourced<Sprint>>;
  designs: Map<string, Sourced<Design>>;
  tasks: Map<string, Sourced<Task>>;
  /** Sơ đồ khối: phần và khối. */
  parts: Map<string, Sourced<Part>>;
  modules: Map<string, Sourced<Module>>;
  facts: Map<string, Sourced<Fact>>;
  claims: Map<string, Sourced<Claim>>;
  decisions: Map<string, Sourced<Decision>>;
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
