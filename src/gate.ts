import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { VerificationState } from "./graph/freshness.js";
import { DIRS, ganasPath } from "./graph/paths.js";
import type { Graph } from "./graph/types.js";
import type { ExitCriterion, Task } from "./model/index.js";
import { judge, runShell } from "./util/exec.js";

export interface CriterionResult {
  criterion: ExitCriterion;
  label: string;
  status: "pass" | "fail" | "pending_human";
  reason?: string | undefined;
}

export interface GateResult {
  task: string;
  /** Mọi tiêu chí chấm tự động được đều đạt. Tiêu chí cần người không tính vào đây. */
  ok: boolean;
  results: CriterionResult[];
  /** Tiêu chí trượt — dùng làm `reason` khi hook chặn. */
  unmet: CriterionResult[];
  /** Tiêu chí chờ người xác nhận — không chặn phiên, nhưng chặn đánh dấu task done. */
  pendingHuman: CriterionResult[];
}

function labelOf(c: ExitCriterion): string {
  switch (c.kind) {
    case "command":
      return `lệnh \`${c.run}\``;
    case "artifact":
      return `file \`${c.path}\`` + (c.must_contain ? ` chứa \`${c.must_contain}\`` : "");
    case "handoff":
      return "handoff record của phiên";
    case "manual":
      return c.check;
    case "verification":
      return `bằng chứng \`${c.target}\``;
  }
}

async function checkCriterion(
  criterion: ExitCriterion,
  ctx: {
    root: string;
    sessionId?: string | undefined;
    freshness: Map<string, VerificationState>;
  },
): Promise<CriterionResult> {
  const label = labelOf(criterion);

  switch (criterion.kind) {
    case "command": {
      const result = await runShell(criterion.run, { cwd: ctx.root });
      const verdict = judge(result, criterion.expect);
      return verdict.pass
        ? { criterion, label, status: "pass" }
        : { criterion, label, status: "fail", reason: verdict.reason };
    }

    case "artifact": {
      const file = join(ctx.root, criterion.path);
      if (!existsSync(file)) {
        return { criterion, label, status: "fail", reason: `file chưa tồn tại` };
      }
      if (criterion.must_contain) {
        const content = await readFile(file, "utf8").catch(() => "");
        if (!content.includes(criterion.must_contain)) {
          return {
            criterion,
            label,
            status: "fail",
            reason: `file tồn tại nhưng chưa chứa "${criterion.must_contain}"`,
          };
        }
      }
      return { criterion, label, status: "pass" };
    }

    case "handoff": {
      if (!criterion.required) return { criterion, label, status: "pass" };
      if (!ctx.sessionId) {
        return {
          criterion,
          label,
          status: "fail",
          reason: "không biết session id nên không xác định được handoff",
        };
      }
      const file = ganasPath(ctx.root, DIRS.runs, `${ctx.sessionId}.md`);
      return existsSync(file)
        ? { criterion, label, status: "pass" }
        : {
            criterion,
            label,
            status: "fail",
            reason: `chưa có ${DIRS.runs}/${ctx.sessionId}.md — chạy \`ganas handoff\``,
          };
    }

    case "manual":
      return { criterion, label, status: "pending_human" };

    case "verification": {
      const state = ctx.freshness.get(criterion.target);
      if (!state) {
        return {
          criterion,
          label,
          status: "fail",
          reason: `không tìm thấy target "${criterion.target}" trong sổ cái/graph`,
        };
      }
      return state.freshness === "fresh"
        ? { criterion, label, status: "pass" }
        : { criterion, label, status: "fail", reason: state.reason };
    }
  }
}

/**
 * Chấm exit_contract của một task.
 *
 * Tách "chấm được tự động" khỏi "cần người": tiêu chí thủ công mà chặn phiên thì
 * phiên không bao giờ kết thúc được. Chúng chặn việc đánh dấu task `done`, chứ
 * không chặn Stop.
 */
export async function evaluateGate(
  graph: Graph,
  task: Task,
  freshness: Map<string, VerificationState>,
  sessionId?: string,
): Promise<GateResult> {
  const results = await Promise.all(
    task.exit_contract.map((c) => checkCriterion(c, { root: graph.root, sessionId, freshness })),
  );

  const unmet = results.filter((r) => r.status === "fail");
  const pendingHuman = results.filter((r) => r.status === "pending_human");

  return { task: task.id, ok: unmet.length === 0, results, unmet, pendingHuman };
}

/** Diễn giải kết quả gate thành văn bản đưa lại cho Claude. */
export function formatGate(result: GateResult): string {
  const lines: string[] = [];
  for (const r of result.results) {
    const mark = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "…";
    lines.push(`  ${mark} ${r.label}${r.reason ? `\n      ${r.reason}` : ""}`);
  }
  return lines.join("\n");
}
