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

/**
 * Khoá ổn định của một tiêu chí — dùng làm khoá `baseline` trong state phiên.
 *
 * Cố tình KHÔNG dùng chỉ số trong mảng: sửa `exit_contract` giữa chừng (thêm
 * một tiêu chí, đổi thứ tự) là lệch hết, và baseline lệch còn tệ hơn không có
 * baseline — nó gán nhãn "đã xanh sẵn" cho tiêu chí khác.
 */
export function criterionKey(c: ExitCriterion): string {
  switch (c.kind) {
    case "command":
      return `command:${c.run}`;
    case "artifact":
      return `artifact:${c.path}`;
    case "handoff":
      return `handoff:${c.required}`;
    case "manual":
      return `manual:${c.check}`;
    case "verification":
      return `verification:${c.target}`;
  }
}

/**
 * Tiêu chí chấm được NGAY lúc nhận task, không cần đã làm gì.
 *
 * `manual` luôn chờ người và `handoff` luôn đỏ khi phiên vừa mở — đo hai thứ đó
 * lúc bắt đầu không nói lên điều gì, chỉ tốn thời gian.
 */
export function isAutoCriterion(c: ExitCriterion): boolean {
  return c.kind === "command" || c.kind === "artifact" || c.kind === "verification";
}

/**
 * Tiêu chí ĐANG đạt mà đã đạt sẵn từ trước khi bắt đầu task.
 *
 * Hoặc task đã xong rồi, hoặc tiêu chí đó không gác gì — cả hai đều là thứ
 * người cần biết. Một gate của task sửa bug mà tự xanh trước khi sửa thì gate
 * đó không tồn tại.
 */
export function alreadyGreen(
  gate: GateResult,
  baseline: Record<string, boolean> | undefined,
): CriterionResult[] {
  if (!baseline) return [];
  return gate.results.filter(
    (r) => r.status === "pass" && baseline[criterionKey(r.criterion)] === true,
  );
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

/**
 * Chấm lại CHỈ những tiêu chí đo được trên cây file — `command` và `artifact` —
 * tại một gốc khác gốc dự án.
 *
 * Dựng cho `ganas commit`: nó cần biết cây SẮP ĐƯỢC COMMIT có xanh không, chứ
 * không phải working tree (xem `checkStagedTree`, src/commit.ts). Ba loại còn
 * lại cố ý bị bỏ:
 *
 *  - `verification` hỏi SỔ CÁI bằng chứng, không hỏi cây file — bung cây ra
 *    một chỗ khác không đổi câu trả lời, chạy lại chỉ tốn thời gian.
 *  - `handoff` hỏi `.ganas/runs/` vốn là file CỤC BỘ, cố tình không vào git.
 *  - `manual` cần người.
 */
export async function evaluateTreeCriteria(
  root: string,
  criteria: readonly ExitCriterion[],
): Promise<CriterionResult[]> {
  const measurable = criteria.filter((c) => c.kind === "command" || c.kind === "artifact");
  const freshness = new Map<string, VerificationState>();
  return Promise.all(measurable.map((c) => checkCriterion(c, { root, freshness })));
}
