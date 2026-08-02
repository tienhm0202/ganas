import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseDocument } from "yaml";

import type { Graph, Sourced } from "../graph/types.js";
import type { Fact, Module, Scope, Verification } from "../model/index.js";
import { judge, runShell } from "../util/exec.js";
import { AdapterError, readEvalResult } from "./adapters.js";
import {
  appendEntry,
  defHash,
  fileHash,
  type LedgerEntry,
  type LedgerResult,
  runContext,
  sha256,
} from "./ledger.js";
import { hasBlockingFinding, lintProbe } from "./lint.js";
import { proveCanFail } from "./mutate.js";

/** Một thứ có thể verify: fact, hoặc một bằng chứng của khối/phần. */
export interface Target {
  /** Khoá trong sổ cái: `F-ACC-001` hoặc `M-intent/V-intent-smoke`. */
  id: string;
  /** Nhãn ngắn cho người đọc. */
  label: string;
  kind: "probe" | "eval" | "contract";
  /** Định nghĩa dùng để tính vân tay — lệch ⇒ probe bị thay ruột. */
  definition: unknown;
  /** Fact nguồn, nếu có — để ghi ngược `last_verified_at` vào YAML. */
  fact?: Sourced<Fact> | undefined;
  verification?: Verification | undefined;
  statement: string;
  context: string[];
}

export interface RunOutcome {
  target: Target;
  result: LedgerResult;
  /** Vì sao ra kết quả đó — đưa nguyên văn vào brief và báo cáo. */
  reason?: string | undefined;
  score?: number | undefined;
  costUsd?: number | undefined;
  /** Mutation test đã chứng minh probe có thể fail chưa. */
  proof?: "proven" | "unproven" | "cannot_fail" | undefined;
  entry?: LedgerEntry | undefined;
  skipped?: boolean;
}

export interface RunOptions {
  root: string;
  by: string;
  /** Bỏ mutation test để chạy nhanh. Mặc định luôn chạy. */
  skipMutation?: boolean;
  /** Chỉ tính toán và in ra, không chạy gì. */
  dryRun?: boolean;
}

/* ------------------------------------------------------------------------- *
 * Liệt kê target
 * ------------------------------------------------------------------------- */

export function factTarget(sourced: Sourced<Fact>): Target {
  const f = sourced.value;
  return {
    id: f.id,
    label: f.id,
    kind: "probe",
    definition: f.verify,
    fact: sourced,
    statement: f.statement,
    context: f.depends_on,
  };
}

export function moduleTargets(sourced: Sourced<Module>): Target[] {
  const m = sourced.value;
  return m.verify.map((v) => ({
    id: `${m.id}/${v.id}`,
    label: `${m.id}/${v.id}`,
    kind: v.kind,
    definition: v,
    verification: v,
    statement: m.title,
    context: [...m.paths, ...m.entrypoints],
  }));
}

/**
 * Target cho nghiệm thu mức phạm vi.
 *
 * `context` phải là GLOB của code trong phạm vi, không phải danh sách ID khối:
 * `globsOf()` (graph/freshness.ts) chỉ nhận phần tử có `*` hoặc `/`, nên khai ID
 * khối ở đây khiến context rỗng và nghiệm thu phạm vi KHÔNG BAO GIỜ stale — pass
 * một lần rồi xanh vĩnh viễn dù code trong phạm vi đã đổi hết. Đó là lời hứa
 * rỗng, và là loại lỗi mà chính ganas sinh ra để chống.
 */
export function scopeTargets(sourced: Sourced<Scope>, graph: Graph): Target[] {
  const s = sourced.value;
  const context = s.modules.flatMap((id) => {
    const m = graph.modules.get(id)?.value;
    return m ? [...m.paths, ...m.entrypoints] : [];
  });
  return s.acceptance.map((v) => ({
    id: `${s.id}/${v.id}`,
    label: `${s.id}/${v.id}`,
    kind: v.kind,
    definition: v,
    verification: v,
    statement: s.title,
    context,
  }));
}

/**
 * Phạm vi mà một target thuộc về. `undefined` = không xác định được (khối chưa
 * gán phạm vi) — khi lọc thì coi như KHÔNG khớp, để `--scope` không âm thầm
 * kéo theo thứ nằm ngoài ranh giới người dùng vừa nêu.
 */
export function scopeOfTarget(target: Target, graph: Graph): string | undefined {
  if (target.fact) return target.fact.value.scope;
  const owner = target.id.split("/")[0]!;
  if (graph.scopes.has(owner)) return owner;
  return graph.modules.get(owner)?.value.scope;
}

export function allTargets(graph: Graph): Target[] {
  return [
    ...[...graph.facts.values()].map(factTarget),
    ...[...graph.modules.values()].flatMap(moduleTargets),
    ...[...graph.scopes.values()].flatMap((s) => scopeTargets(s, graph)),
  ];
}

/* ------------------------------------------------------------------------- *
 * Chạy một target
 * ------------------------------------------------------------------------- */

/** `skip_if` thoát 0 ⇒ không kiểm được ở môi trường này. KHÔNG phải fail. */
async function shouldSkip(skipIf: string | undefined, root: string): Promise<boolean> {
  if (!skipIf) return false;
  const result = await runShell(skipIf, { cwd: root, timeoutMs: 30_000 });
  return result.code === 0;
}

export async function runTarget(target: Target, opts: RunOptions): Promise<RunOutcome> {
  const { root } = opts;

  if (target.kind === "contract") {
    // Tương thích cạnh được kiểm ở tầng graph (N6), không phải bằng cách chạy lệnh.
    return { target, result: "unprovable", reason: "kiểm tương thích cạnh thuộc `ganas trace`" };
  }

  const v = target.verification;
  const run =
    target.kind === "eval"
      ? (v as { run: string }).run
      : (target.definition as { run: string }).run;
  const skipIf = v?.skip_if ?? (target.definition as { skip_if?: string }).skip_if;

  /* --- Lint trước, chạy sau ------------------------------------------- */

  if (target.kind === "probe") {
    const findings = lintProbe({ run, statement: target.statement, context: target.context });
    if (hasBlockingFinding(findings)) {
      const blocking = findings.filter((f) => f.severity === "error");
      return {
        target,
        result: "unprovable",
        reason: blocking.map((f) => f.message).join("; "),
        skipped: true,
      };
    }
  }

  if (opts.dryRun) {
    return { target, result: "unprovable", reason: "dry-run: chưa chạy", skipped: true };
  }

  if (await shouldSkip(skipIf, root)) {
    const outcome: RunOutcome = {
      target,
      result: "unavailable",
      reason: `\`skip_if\` khớp — môi trường này không kiểm được (KHÔNG phải fail)`,
    };
    outcome.entry = await record(target, outcome, opts);
    return outcome;
  }

  const outcome =
    target.kind === "eval" ? await runEval(target, run, opts) : await runProbe(target, run, opts);

  outcome.entry = await record(target, outcome, opts);

  // Chỉ kết quả THẬT SỰ chấm được mới ghi ngược vào YAML. `unavailable` /
  // `unprovable` mà cũng đặt `last_verified_at` thì fact trông như đã kiểm.
  if (target.fact && (outcome.result === "pass" || outcome.result === "fail")) {
    await writeBackFact(target.fact, outcome, root);
  }

  return outcome;
}

async function runProbe(target: Target, run: string, opts: RunOptions): Promise<RunOutcome> {
  const def = target.definition as { expect?: unknown; timeout_ms?: number };
  const expect = (def.expect ?? "exit_zero") as Parameters<typeof judge>[1];

  const result = await runShell(run, { cwd: opts.root, timeoutMs: def.timeout_ms });
  const verdict = judge(result, expect);

  if (!verdict.pass) {
    return { target, result: "fail", reason: verdict.reason };
  }

  if (opts.skipMutation) return { target, result: "pass", proof: "unproven" };

  // Probe pass rồi mới bóp méo: pass mà bản bóp méo cũng pass thì "pass" vô nghĩa.
  const proof = await proveCanFail(run, expect, { cwd: opts.root });

  if (proof.status === "cannot_fail") {
    return {
      target,
      result: "unprovable",
      proof: "cannot_fail",
      reason: proof.message,
    };
  }

  return {
    target,
    result: "pass",
    proof: proof.status,
    reason: proof.status === "unproven" ? proof.message : undefined,
  };
}

async function runEval(target: Target, run: string, opts: RunOptions): Promise<RunOutcome> {
  const v = target.verification as {
    adapter: "json" | "promptfoo";
    threshold: number;
    margin: number;
    timeout_ms?: number;
  };

  const dir = await mkdtemp(join(tmpdir(), "ganas-eval-"));
  const outFile = join(dir, "result.json");

  try {
    const result = await runShell(run, {
      cwd: opts.root,
      timeoutMs: v.timeout_ms ?? 600_000,
      env: { GANAS_EVAL_OUT: outFile },
    });

    let reading;
    try {
      reading = await readEvalResult(v.adapter, outFile, result.stdout);
    } catch (err) {
      // Runner hỏng ≠ khối sai. Gọi nhầm thành `fail` là báo động giả, và báo
      // động giả làm người ta phớt lờ cả mục cảnh báo.
      const detail = err instanceof AdapterError ? err.message : String(err);
      return {
        target,
        result: "unprovable",
        reason:
          `không đọc được kết quả eval: ${detail}` +
          (result.code !== 0 ? ` (lệnh thoát mã ${result.code})` : ""),
      };
    }

    const { score } = reading;
    const marginal = score >= v.threshold && score < v.threshold + v.margin;

    return {
      target,
      result: score < v.threshold ? "fail" : marginal ? "marginal" : "pass",
      score,
      costUsd: reading.cost_usd,
      reason:
        score < v.threshold
          ? `điểm ${score.toFixed(3)} dưới ngưỡng ${v.threshold}` +
            (reading.n ? ` (${reading.passed}/${reading.n} ca đạt)` : "")
          : marginal
            ? `điểm ${score.toFixed(3)} nằm trong vùng nhiễu quanh ngưỡng ` +
              `${v.threshold} (±${v.margin}) — chưa đủ để gọi là đạt`
            : undefined,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------------- *
 * Ghi sổ cái và ghi ngược YAML
 * ------------------------------------------------------------------------- */

async function record(target: Target, outcome: RunOutcome, opts: RunOptions): Promise<LedgerEntry> {
  const ctx = await runContext(opts.root, opts.by);
  const v = target.verification;

  const entry: LedgerEntry = {
    target: target.id,
    kind: target.kind,
    at: new Date().toISOString(),
    def: defHash(target.definition),
    result: outcome.result,
    ...ctx,
  };

  if (outcome.score !== undefined) entry.score = outcome.score;
  if (outcome.costUsd !== undefined) entry.cost_usd = outcome.costUsd;

  if (v?.kind === "eval") {
    entry.threshold = v.threshold;
    if (v.model) entry.model = v.model;
    // Vân tay do ganas tự tính từ file, không lấy theo lời runner: sau này so
    // lại cũng bằng chính cách tính này.
    if (v.prompt) entry.prompt = await fileHash(join(opts.root, v.prompt));
    if (v.dataset) entry.dataset = await fileHash(join(opts.root, v.dataset));
  }

  if (outcome.reason) entry.output = sha256(outcome.reason);

  await appendEntry(opts.root, entry);
  return entry;
}

/**
 * Cập nhật `last_verified_at` / `last_result` trong file fact.
 *
 * Dùng Document của `yaml` để sửa tại chỗ: giữ nguyên comment và định dạng người
 * đã viết. Ghi lại cả file bằng cách serialize từ đối tượng JS sẽ xoá sạch chú
 * thích — mà chú thích trong file tri thức thường là phần giải thích quan trọng.
 */
async function writeBackFact(
  sourced: Sourced<Fact>,
  outcome: RunOutcome,
  root: string,
): Promise<void> {
  const file = join(root, sourced.file);
  const doc = parseDocument(await readFile(file, "utf8"));
  const base = sourced.index === undefined ? [] : [sourced.index];

  doc.setIn([...base, "last_verified_at"], outcome.entry!.at);
  doc.setIn([...base, "last_result"], outcome.result === "pass" ? "pass" : "fail");
  doc.setIn([...base, "verified_by"], outcome.entry!.by);

  await writeFile(file, doc.toString(), "utf8");
}
