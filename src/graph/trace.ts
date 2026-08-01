import type { ContractVerification, Module } from "../model/index.js";
import { judge, runShell } from "../util/exec.js";
import { appendEntry, defHash, type LedgerResult, runContext, sha256 } from "../verify/ledger.js";
import { hasBlockingFinding, lintProbe } from "../verify/lint.js";
import type { Graph } from "./types.js";

/**
 * Cạnh hợp đồng: kiểm tương thích giữa hai khối liền kề trong sơ đồ.
 *
 * "Cạnh" ở đây khác `depends_on` — `depends_on` chỉ khai THỨ TỰ chạy, còn
 * `kind: contract` khai và kiểm THỰC SỰ output khối nguồn có phủ được input
 * khối đích không. Một sơ đồ có thể đủ cạnh `depends_on` mà không cạnh nào
 * được kiểm tương thích — đó chính là nợ mà `debt()` bên dưới bắt.
 */
export interface ContractEdge {
  /** Khối sở hữu verification — chạy trước, "nguồn" của cạnh. */
  from: string;
  /** `to` trong verification — khối chạy sau, "đích" của cạnh. */
  to: string;
  verificationId: string;
  verification: ContractVerification;
}

export interface PortIssue {
  port: string;
  reason: string;
}

export interface EdgeCheck {
  edge: ContractEdge;
  result: LedgerResult;
  issues: PortIssue[];
  reason?: string | undefined;
}

/** Liệt kê mọi cạnh contract khai trong `verify` của khối. */
export function contractEdges(graph: Graph): ContractEdge[] {
  const out: ContractEdge[] = [];
  for (const [id, sourced] of graph.modules) {
    for (const v of sourced.value.verify) {
      if (v.kind === "contract") {
        out.push({ from: id, to: v.to, verificationId: v.id, verification: v });
      }
    }
  }
  return out;
}

/** Cổng ra của `from` phải phủ mọi cổng vào bắt buộc của `to`. */
function portIssues(from: Module, to: Module): PortIssue[] {
  const outputs = new Map(from.contract.outputs.map((p) => [p.name, p]));
  const issues: PortIssue[] = [];

  for (const input of to.contract.inputs) {
    if (input.optional) continue;
    const out = outputs.get(input.name);
    if (!out) {
      issues.push({
        port: input.name,
        reason: `${from.id} không có cổng ra tên "${input.name}" mà ${to.id} cần`,
      });
      continue;
    }
    if (out.shape.trim() !== input.shape.trim()) {
      issues.push({
        port: input.name,
        reason: `cổng "${input.name}" lệch kiểu — ${from.id} xuất \`${out.shape}\`, ${to.id} cần \`${input.shape}\``,
      });
    }
  }

  return issues;
}

/**
 * Kiểm một cạnh: trước tiên so cổng khai báo, chỉ chạy `run` bổ sung (nếu có)
 * khi cổng đã khớp — cổng lệch thì chạy lệnh cũng vô nghĩa.
 */
export async function checkEdge(
  graph: Graph,
  edge: ContractEdge,
  root: string,
): Promise<EdgeCheck> {
  const from = graph.modules.get(edge.from)?.value;
  const to = graph.modules.get(edge.to)?.value;

  if (!from || !to) {
    const missing = !from ? edge.from : edge.to;
    return {
      edge,
      result: "unprovable",
      issues: [],
      reason: `khối ${missing} không tồn tại`,
    };
  }

  const issues = portIssues(from, to);
  if (issues.length > 0) {
    return { edge, result: "fail", issues, reason: issues.map((i) => i.reason).join("; ") };
  }

  const run = edge.verification.run;
  if (!run) return { edge, result: "pass", issues: [] };

  const findings = lintProbe({
    run,
    statement: `${from.id} → ${to.id}`,
    context: [
      ...from.contract.outputs.map((p) => p.name),
      ...to.contract.inputs.map((p) => p.name),
    ],
  });
  if (hasBlockingFinding(findings)) {
    const blocking = findings.filter((f) => f.severity === "error");
    return {
      edge,
      result: "unprovable",
      issues: [],
      reason: blocking.map((f) => f.message).join("; "),
    };
  }

  const result = await runShell(run, { cwd: root, timeoutMs: 60_000 });
  const verdict = judge(result, "exit_zero");
  if (!verdict.pass) {
    return { edge, result: "fail", issues: [], reason: verdict.reason };
  }

  return { edge, result: "pass", issues: [] };
}

export async function checkAllEdges(graph: Graph, root: string): Promise<EdgeCheck[]> {
  const edges = contractEdges(graph);
  return Promise.all(edges.map((edge) => checkEdge(graph, edge, root)));
}

/**
 * Ghi mỗi cạnh đã kiểm vào sổ cái, cùng khoá `${khối}/${verification}` mà
 * `ganas verify` và `computeFreshness` đã dùng cho mọi loại bằng chứng khác —
 * nhờ vậy STALE / freshness coi cạnh contract như bất kỳ bằng chứng nào khác,
 * dù người chạy nó là `ganas trace` chứ không phải `ganas verify`.
 */
export async function recordEdgeChecks(
  graph: Graph,
  checks: readonly EdgeCheck[],
  opts: { root: string; by: string },
): Promise<void> {
  const ctx = await runContext(opts.root, opts.by);
  for (const check of checks) {
    if (check.result === "unprovable") continue; // khối biến mất giữa chừng — không có gì để ghi
    await appendEntry(opts.root, {
      target: `${check.edge.from}/${check.edge.verificationId}`,
      kind: "contract",
      at: new Date().toISOString(),
      def: defHash(check.edge.verification),
      result: check.result,
      output: check.reason ? sha256(check.reason) : undefined,
      ...ctx,
    });
  }
}

/* ------------------------------------------------------------------------- *
 * Sơ đồ khối — Mermaid
 * ------------------------------------------------------------------------- */

/** Mermaid không cho `-` trong id node một cách an toàn ở mọi renderer — thay bằng `_`. */
function nodeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}

export interface DiagramOptions {
  /** Khoá theo `${from}/${verificationId}` — dùng để in ✓/✗ lên cạnh contract. */
  edgeResults?: ReadonlyMap<string, LedgerResult>;
}

/**
 * Sơ đồ khối dạng Mermaid: mỗi phần là một subgraph, khối là node, `depends_on`
 * là cạnh xuôi theo chiều chạy (khối phụ thuộc → khối phụ thuộc vào nó). Cạnh
 * nào có `kind: contract` được gắn nhãn kết quả kiểm; cạnh nào không có thì để
 * trơn — đó chính là điều `debt()` liệt kê ra bằng lời.
 */
export function renderDiagram(graph: Graph, opts: DiagramOptions = {}): string {
  const lines: string[] = ["flowchart LR"];

  const inPart = new Set<string>();
  for (const [partId, sourced] of graph.parts) {
    const p = sourced.value;
    lines.push(`  subgraph ${nodeId(partId)}["${partId} (${p.version})"]`);
    for (const moduleId of p.modules) {
      const mod = graph.modules.get(moduleId)?.value;
      inPart.add(moduleId);
      lines.push(`    ${nodeId(moduleId)}["${moduleLabel(moduleId, mod)}"]`);
    }
    lines.push("  end");
  }

  const loose = [...graph.modules.keys()].filter((id) => !inPart.has(id));
  if (loose.length > 0) {
    lines.push(`  subgraph unmapped["(chưa gán phần)"]`);
    for (const moduleId of loose) {
      lines.push(
        `    ${nodeId(moduleId)}["${moduleLabel(moduleId, graph.modules.get(moduleId)?.value)}"]`,
      );
    }
    lines.push("  end");
  }

  for (const [id, sourced] of graph.modules) {
    for (const dep of sourced.value.depends_on) {
      lines.push(`  ${nodeId(dep)} --> ${nodeId(id)}`);
    }
  }

  for (const edge of contractEdges(graph)) {
    const key = `${edge.from}/${edge.verificationId}`;
    const result = opts.edgeResults?.get(key);
    const mark =
      result === "pass" ? "✓" : result === "fail" ? "✗" : result === undefined ? "?" : result;
    lines.push(`  ${nodeId(edge.from)} -.->|hợp đồng ${mark}| ${nodeId(edge.to)}`);
  }

  return lines.join("\n");
}

function moduleLabel(id: string, mod: Module | undefined): string {
  if (!mod) return `${id}<br/>? khối mồ côi`;
  return `${id}<br/>${mod.nature} · ${mod.status}`;
}

/* ------------------------------------------------------------------------- *
 * Nợ kiểm chứng của sơ đồ
 * ------------------------------------------------------------------------- */

export type DebtKind = "uncovered-edge" | "broken-contract" | "unverified-module";

export interface DebtItem {
  kind: DebtKind;
  moduleId?: string | undefined;
  edge?: { from: string; to: string } | undefined;
  message: string;
}

/**
 * Liệt kê nợ: cạnh `depends_on` không có cạnh contract nào kiểm nó, cạnh
 * contract đang fail, và khối chưa có bằng chứng nào. Đây là góc nhìn RIÊNG
 * cho sơ đồ khối — `ganas validate` đã bắt phần lớn các mục này rải rác ở
 * chỗ khác; ở đây gom lại một chỗ để trả lời đúng câu hỏi "sơ đồ này còn hở
 * ở đâu".
 */
export function computeDebt(graph: Graph, checks: readonly EdgeCheck[]): DebtItem[] {
  const items: DebtItem[] = [];

  const checkedPairs = new Set(contractEdges(graph).map((e) => `${e.from}->${e.to}`));
  for (const [id, sourced] of graph.modules) {
    for (const dep of sourced.value.depends_on) {
      if (!checkedPairs.has(`${dep}->${id}`)) {
        items.push({
          kind: "uncovered-edge",
          edge: { from: dep, to: id },
          message: `cạnh ${dep} → ${id} có trong depends_on nhưng không có bằng chứng \`kind: contract\` nào kiểm nó`,
        });
      }
    }
  }

  for (const check of checks) {
    if (check.result === "fail") {
      items.push({
        kind: "broken-contract",
        moduleId: check.edge.from,
        edge: { from: check.edge.from, to: check.edge.to },
        message: `hợp đồng ${check.edge.from}/${check.edge.verificationId} → ${check.edge.to} TRƯỢT: ${check.reason ?? ""}`,
      });
    }
  }

  for (const [id, sourced] of graph.modules) {
    const m = sourced.value;
    if (m.verify.length === 0 && m.status !== "unmapped") {
      items.push({
        kind: "unverified-module",
        moduleId: id,
        message: `khối ${id} chưa có bằng chứng nào`,
      });
    }
  }

  return items;
}
