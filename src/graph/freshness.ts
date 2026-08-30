import { join } from "node:path";

import type { Fact, Freshness } from "../model/index.js";
import { mtimeMs } from "../util/fsprobe.js";
import { listProjectFiles, matchesAny } from "../util/glob.js";
import { defHash, fileHash, historyFor, lastFor } from "../verify/ledger.js";
import { allTargets, depsHash, type Target } from "../verify/run.js";
import type { Graph, LedgerEntry } from "./types.js";

/** Thư mục bỏ qua khi không có git — không phải mã nguồn dự án. */

/* ------------------------------------------------------------------------- *
 * Trạng thái của một bằng chứng
 * ------------------------------------------------------------------------- */

export interface VerificationState {
  targetId: string;
  freshness: Freshness;
  /** Lý do cụ thể, viết cho người đọc — brief in thẳng câu này. */
  reason: string;
  /** Việc cần làm tiếp, nếu có. */
  action?: string | undefined;
  fact?: Fact | undefined;
  lastAt?: string | undefined;
  lastScore?: number | undefined;
  /** Điểm của vài lần gần nhất — cho thấy eval có dao động quanh ngưỡng không. */
  recentScores?: number[] | undefined;
}

/** Giữ tên cũ để brief và các chỗ đang dùng không phải đổi hết một lượt. */
export type FactFreshness = VerificationState;

/**
 * Nhãn độ tươi in ra cho người đọc, một dòng, đặt ĐẦU dòng chứ không cuối —
 * một fact đã mục mà nhãn chìm ở cuối thì người đọc lướt qua vẫn tưởng nó
 * dùng được.
 *
 * Ở ĐÂY chứ không ở chỗ gọi: `ganas search` và brief cùng in nhãn này, và
 * hai bản chép tay sẽ trôi khỏi nhau — hôm nào một bên thêm trạng thái mới
 * mà bên kia không biết thì cùng một fact hiện hai kiểu ở hai lệnh, không
 * gì báo. `VerificationState` sinh ra ở file này, nên cách gọi tên trạng
 * thái của nó cũng thuộc về file này.
 *
 * `undefined` = chưa từng có bản ghi nào trong sổ cái cho target đó — vẫn
 * phải cảnh báo, không được im lặng in như thể đáng tin.
 */
export function freshnessMark(state: VerificationState | undefined): string {
  if (!state) return "⚠ [KHÔNG RÕ]";
  if (state.freshness === "fresh") return "✓ [FRESH]";
  return `⚠ [${state.freshness.toUpperCase()}]`;
}

interface Fingerprint {
  model?: string | undefined;
  prompt?: string | undefined;
  dataset?: string | undefined;
}

/**
 * Quyết định trạng thái của một bằng chứng, đối chiếu với sổ cái.
 *
 * Thứ tự kiểm có chủ đích: những lý do khiến kết quả cũ **không còn nói về thứ
 * đang xét nữa** (định nghĩa đổi, model đổi, prompt/dataset đổi) đứng trước
 * những lý do về kết quả (fail, marginal). Một kết quả `pass` của model cũ
 * không phải là `pass` — nó là một phép đo trên đối tượng khác.
 */
function decide(args: {
  entry: LedgerEntry | undefined;
  currentDef: string;
  current: Fingerprint;
  ttlDays: number;
  depsChangedAt?: number | undefined;
  changedFile?: string | undefined;
  /** Vân tay nội dung file phụ thuộc HIỆN TẠI (undefined = target không khai glob). */
  depsNow?: string | undefined;
  now: number;
}): { freshness: Freshness; reason: string; action?: string } {
  const { entry, currentDef, current, ttlDays, depsChangedAt, changedFile, depsNow, now } = args;

  if (!entry) {
    return {
      freshness: "never_verified",
      reason: "chưa chạy lần nào — mới chỉ là niềm tin",
      action: "chạy `ganas verify`",
    };
  }

  if (entry.def !== currentDef) {
    return {
      freshness: "definition_changed",
      reason:
        `định nghĩa verify đã đổi sau lần chạy ${entry.at.slice(0, 10)} — ` +
        `kết quả cũ đo một phép kiểm khác`,
      action: "chạy lại `ganas verify`",
    };
  }

  // Vân tay riêng của eval. Đây là dạng ảo giác đặc thù của hệ LLM: không sửa
  // một dòng code nào mà kết quả cũ vẫn thành vô nghĩa.
  if (entry.model !== undefined && current.model !== undefined && entry.model !== current.model) {
    return {
      freshness: "model_changed",
      reason: `eval cũ chạy trên \`${entry.model}\`, nay khai \`${current.model}\``,
      action: "chạy lại eval trên model mới",
    };
  }
  if (
    entry.prompt !== undefined &&
    current.prompt !== undefined &&
    entry.prompt !== current.prompt
  ) {
    return {
      freshness: "prompt_changed",
      reason: `file prompt đã sửa sau lần chạy ${entry.at.slice(0, 10)}`,
      action: "chạy lại eval",
    };
  }
  if (
    entry.dataset !== undefined &&
    current.dataset !== undefined &&
    entry.dataset !== current.dataset
  ) {
    return {
      freshness: "dataset_changed",
      reason: `dataset đã đổi sau lần chạy ${entry.at.slice(0, 10)}`,
      action: "chạy lại eval",
    };
  }

  switch (entry.result) {
    case "fail":
      return {
        freshness: "failing",
        reason: "**lần chạy gần nhất TRƯỢT — phát biểu này đang SAI**",
        action: "sửa code cho khớp phát biểu, hoặc sửa phát biểu cho khớp code",
      };
    case "marginal":
      return {
        freshness: "marginal",
        reason:
          `điểm ${entry.score?.toFixed(3) ?? "?"} nằm trong vùng nhiễu quanh ngưỡng ` +
          `${entry.threshold ?? "?"} — chưa đủ để gọi là đạt`,
        action: "chạy lại, hoặc cải thiện tới khi vượt hẳn ngưỡng",
      };
    case "unavailable":
      return {
        freshness: "unavailable",
        reason: "môi trường này không kiểm được (`skip_if` khớp) — **không phải là fail**",
        action: "chạy ở nơi có đủ phụ thuộc, hoặc chấp nhận là chưa biết",
      };
    case "unprovable":
      return {
        freshness: "unprovable",
        reason: "probe chưa chứng minh được là có thể fail — kết quả không mang thông tin",
        action: "viết lại probe cho nó thật sự chạm vào điều đang khẳng định",
      };
  }

  const verifiedAt = Date.parse(entry.at);

  // Ưu tiên vân tay NỘI DUNG: `mtime` lùi được bằng `touch -d`, hash thì không.
  // Chỉ rơi về so mtime với bản ghi cũ (trước P2 N24) chưa có trường `deps`.
  if (entry.deps !== undefined && depsNow !== undefined) {
    if (entry.deps !== depsNow) {
      // `changedFile` suy từ mtime chỉ dùng để GỌI TÊN file, không để quyết
      // định stale. Ai lùi mtime bằng `touch` thì mất tên file nhưng vẫn stale.
      return {
        freshness: "stale",
        reason: changedFile
          ? `\`${changedFile}\` đã đổi sau lần verify gần nhất`
          : "nội dung file phụ thuộc đã đổi sau lần verify gần nhất",
        action: "chạy lại `ganas verify`",
      };
    }
  } else if (depsChangedAt !== undefined && depsChangedAt > verifiedAt) {
    return {
      freshness: "stale",
      reason: changedFile
        ? `\`${changedFile}\` đã đổi sau lần verify gần nhất`
        : "file phụ thuộc đã đổi sau lần verify gần nhất",
      action: "chạy lại `ganas verify`",
    };
  }

  if (ttlDays > 0 && now - verifiedAt > ttlDays * 86_400_000) {
    const days = Math.floor((now - verifiedAt) / 86_400_000);
    return {
      freshness: "stale",
      reason: `quá hạn kiểm lại (${days} ngày, hạn ${ttlDays} ngày)`,
      action: "chạy lại `ganas verify`",
    };
  }

  return { freshness: "fresh", reason: `kiểm lần cuối ${entry.at.slice(0, 10)}` };
}

/**
 * Tính trạng thái cho mọi bằng chứng trong graph — fact, khối, và phần.
 *
 * Sổ cái là nguồn sự thật, không phải trường trong YAML: trường YAML sửa tay
 * được, dòng sổ cái thì không (hook chặn ghi).
 */
export async function computeFreshness(
  graph: Graph,
  opts: { now?: number } = {},
): Promise<Map<string, VerificationState>> {
  const now = opts.now ?? Date.now();
  const targets = allTargets(graph);
  const out = new Map<string, VerificationState>();

  const needsFileScan = targets.some((t) => globsOf(t).length > 0);
  const files = needsFileScan ? await listProjectFiles(graph.root) : [];
  const mtimeCache = new Map<string, number>();

  /**
   * Memo cho `depsHash` theo bộ glob.
   *
   * `depsHash` đọc và băm NỘI DUNG mọi file khớp glob, và vòng dưới gọi nó một
   * lần cho MỖI target. Nhiều target cùng trỏ một khối là chuyện thường — một
   * khối có vài verification, và từ chặng này còn thêm mọi bản vẽ khai
   * `module: <khối đó>`. Không memo thì cùng một tập file bị đọc lại nguyên vẹn
   * mỗi lần, trên đường nóng chạy mỗi lượt hook.
   *
   * Khoá là bộ glob đã sắp — cùng glob thì cùng tập file thì cùng hash, bất kể
   * target nào hỏi.
   */
  const depsCache = new Map<string, string | undefined>();
  const depsHashOf = async (context: string[]): Promise<string | undefined> => {
    const key = [...context].sort().join("\n");
    if (depsCache.has(key)) return depsCache.get(key);
    const value = await depsHash(context, graph.root, files);
    depsCache.set(key, value);
    return value;
  };

  const mtimeOf = async (rel: string): Promise<number> => {
    const cached = mtimeCache.get(rel);
    if (cached !== undefined) return cached;
    // file biến mất giữa chừng (undefined): coi như không đổi.
    const value = (await mtimeMs(join(graph.root, rel))) ?? 0;
    mtimeCache.set(rel, value);
    return value;
  };

  for (const target of targets) {
    const entry = lastFor(graph.ledger, target.id);
    const globs = globsOf(target);

    let depsChangedAt: number | undefined;
    let changedFile: string | undefined;
    if (globs.length > 0) {
      for (const file of files) {
        if (!matchesAny(file, globs)) continue;
        const m = await mtimeOf(file);
        if (depsChangedAt === undefined || m > depsChangedAt) {
          depsChangedAt = m;
          changedFile = file;
        }
      }
    }

    const decision = decide({
      entry,
      depsNow: await depsHashOf(target.context),
      currentDef: defHash(target.definition, target.statement),
      current: await currentFingerprint(target, graph.root),
      ttlDays: target.ttlDays,
      depsChangedAt,
      changedFile,
      now,
    });

    const history = historyFor(graph.ledger, target.id, 5)
      .map((e) => e.score)
      .filter((s): s is number => s !== undefined);

    out.set(target.id, {
      targetId: target.id,
      freshness: decision.freshness,
      reason: decision.reason,
      action: decision.action,
      fact: target.fact?.value,
      lastAt: entry?.at,
      lastScore: entry?.score,
      recentScores: history.length > 1 ? history : undefined,
    });
  }

  return out;
}

/** Glob quyết định "file nào đổi thì bằng chứng này cũ đi". */
function globsOf(target: Target): string[] {
  if (target.fact) return target.fact.value.depends_on;
  return target.context.filter((c) => c.includes("*") || c.includes("/"));
}

async function currentFingerprint(target: Target, root: string): Promise<Fingerprint> {
  const v = target.verification;
  if (v?.kind !== "eval") return {};
  return {
    model: v.model,
    prompt: v.prompt ? await fileHash(join(root, v.prompt)) : undefined,
    dataset: v.dataset ? await fileHash(join(root, v.dataset)) : undefined,
  };
}
