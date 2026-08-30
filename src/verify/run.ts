import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseDocument } from "yaml";

import type { Graph, LedgerEntry, LedgerResult, Sourced } from "../graph/types.js";
import type { Design, Fact, Module, Scope, Verification } from "../model/index.js";
import { artifactStatement } from "../model/index.js";
import { judge, runShell } from "../util/exec.js";
import { listProjectFiles, matchesAny } from "../util/glob.js";
import { AdapterError, readEvalResult } from "./adapters.js";
import { appendEntry, defHash, fileHash, runContext, sha256 } from "./ledger.js";
import { hasBlockingFinding, lintProbe } from "./lint.js";
import { proveCanFail } from "./mutate.js";

/** Một thứ có thể verify: fact, hoặc một bằng chứng của khối/phần. */
export interface Target {
  /** Khoá trong sổ cái: `F-ACC-001`, `M-intent/V-intent-smoke`, hoặc `D-010/A-users-table`. */
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
  /**
   * Hết hạn theo thời gian. Tường minh trên Target chứ KHÔNG đọc ra từ
   * `definition`: với fact thì `definition` là `f.verify` (một `zProbe`, không
   * có `ttl_days`), còn `ttl_days` nằm ở cấp fact. Trước P2 N26 chỗ này đọc
   * bằng `(definition as { ttl_days?: number })` — đúng chữ, sai cấp, nên luôn
   * `undefined` và ttl của FACT chưa từng hoạt động. Ép kiểu `as` đã vô hiệu
   * hoá đúng cái type checker lẽ ra phải bắt được.
   */
  ttlDays: number;
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
    ttlDays: f.ttl_days,
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
    ttlDays: v.ttl_days,
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
    ttlDays: v.ttl_days,
  }));
}

/**
 * Target cho BẢN VẼ của một chặng — cầu nối duy nhất giữa thiết kế và code thật.
 *
 * Hai chỗ bắt buộc phải đúng, cả hai đều đã có tiền lệ hỏng trong repo này:
 *
 * 1. `definition` là `a.probe`, KHÔNG phải cả object bản vẽ. `runTarget()` đọc
 *    lệnh bằng `(target.definition as { run: string }).run` — đặt cả object vào
 *    thì `run` là `undefined` và `runShell` hỏng CÂM. Thứ cần niêm phong thêm
 *    (`shape`, `kind`, `module`) đi vào `statement`, và `defHash()` băm cả hai.
 * 2. `context` là `[...m.paths, ...m.entrypoints]` — ĐÚNG công thức của
 *    `moduleTargets()`. Khai khác đi (vd chỉ `paths`, hay tệ hơn là id khối) thì
 *    `globsOf()` trả rỗng và bản vẽ KHÔNG BAO GIỜ stale: pass một lần rồi xanh
 *    vĩnh viễn dù code đã đổi hết. Đó là bug đã trả giá ở `scopeTargets()`.
 *
 * Bản vẽ chưa có `probe` thì không phát ra target — không có gì để chạy. Chỗ
 * bắt việc thiếu probe là luật `spine/design-artifact-missing-probe`, không phải
 * một target rỗng ruột giả vờ kiểm được gì.
 *
 * `ttlDays: 0` có chủ đích: bản vẽ không cũ đi theo đồng hồ. Nó chỉ sai khi file
 * trong khối đổi (`stale`), khi chính nó bị sửa (`definition_changed`), hoặc khi
 * probe trượt (`failing`) — ba điều đó đã được bắt rồi.
 */
export function artifactTargets(sourced: Sourced<Design>, graph: Graph): Target[] {
  const d = sourced.value;
  const targets: Target[] = [];

  for (const a of d.artifacts) {
    if (!a.probe) continue;
    const m = graph.modules.get(a.module)?.value;
    targets.push({
      id: `${d.id}/${a.id}`,
      label: `${d.id}/${a.id}`,
      kind: "probe",
      definition: a.probe,
      statement: artifactStatement(d, a),
      context: m ? [...m.paths, ...m.entrypoints] : [],
      ttlDays: 0,
    });
  }

  return targets;
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

  // Bản vẽ (`D-010/A-x`): design KHÔNG khai `scope` — nó neo vào goal, không vào
  // phạm vi. Phạm vi suy qua khối mà bản vẽ mô tả. Thiếu nhánh này thì
  // `ganas verify --scope P-x` IM LẶNG bỏ hết bản vẽ, đúng cái bẫy mà docstring
  // ngay trên đây cảnh báo: không khớp thì coi như nằm ngoài, và người dùng
  // tưởng đã kiểm hết phạm vi.
  const design = graph.designs.get(owner)?.value;
  if (design) {
    const artifactId = target.id.slice(owner.length + 1);
    const artifact = design.artifacts.find((a) => a.id === artifactId);
    if (artifact) return graph.modules.get(artifact.module)?.value.scope;
    return undefined;
  }

  return graph.modules.get(owner)?.value.scope;
}

export function allTargets(graph: Graph): Target[] {
  return [
    ...[...graph.facts.values()].map(factTarget),
    ...[...graph.modules.values()].flatMap(moduleTargets),
    ...[...graph.scopes.values()].flatMap((s) => scopeTargets(s, graph)),
    ...[...graph.designs.values()].flatMap((d) => artifactTargets(d, graph)),
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

  // KHÔNG gán `proof` khi bỏ qua bóp méo. Ba trạng thái phải phân biệt được:
  //   proof vắng mặt  — chưa hề chạy mutation test (`--no-mutation`)
  //   proof "unproven" — đã chạy, nhưng ganas không nhận ra dạng để bóp méo
  //   proof "proven"   — đã chạy, và bản bóp méo thật sự fail
  // Gộp hai cái đầu làm một thì `--no-mutation` trông y hệt một lần chạy đủ.
  if (opts.skipMutation) return { target, result: "pass" };

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

/**
 * Vân tay nội dung của mọi file khớp `context`. `undefined` khi target không
 * khai glob nào — không có gì để theo dõi thì đừng ghi một hash rỗng, vì hash
 * rỗng trông y hệt "đã kiểm và không có file nào".
 *
 * `allProjectFiles`: danh sách file dự án đã liệt kê sẵn, cho người gọi tự
 * tính MỘT LẦN rồi truyền vào khi cần gọi hàm này lặp lại trên nhiều target
 * trong cùng một lượt (ví dụ `computeFreshness`) — tránh spawn `git ls-files`
 * mỗi target. Không truyền thì tự liệt kê như cũ; đây KHÔNG phải cache ẩn vì
 * người gọi luôn thấy và kiểm soát danh sách được dùng.
 */
export async function depsHash(
  context: string[],
  root: string,
  allProjectFiles?: string[],
): Promise<string | undefined> {
  const globs = context.filter((c) => c.includes("*") || c.includes("/"));
  if (globs.length === 0) return undefined;
  const all = allProjectFiles ?? (await listProjectFiles(root));
  const files = all.filter((p) => matchesAny(p, globs)).sort();
  const parts: string[] = [];
  for (const rel of files) parts.push(`${rel}:${await fileHash(join(root, rel))}`);
  return sha256(parts.join("\n"));
}

async function record(target: Target, outcome: RunOutcome, opts: RunOptions): Promise<LedgerEntry> {
  const ctx = await runContext(opts.root, opts.by);
  const v = target.verification;

  const depsFingerprint = await depsHash(target.context, opts.root);
  const entry: LedgerEntry = {
    target: target.id,
    kind: target.kind,
    at: new Date().toISOString(),
    def: defHash(target.definition, target.statement),
    ...(depsFingerprint === undefined ? {} : { deps: depsFingerprint }),
    ...(outcome.proof === "proven" || outcome.proof === "unproven" ? { proof: outcome.proof } : {}),
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
