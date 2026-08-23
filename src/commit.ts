import { existsSync } from "node:fs";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evaluateTreeCriteria, type GateResult } from "./gate.js";
import type { Graph } from "./graph/types.js";
import type { Task } from "./model/index.js";
import { runShell } from "./util/exec.js";

/**
 * Dựng commit message TỪ dữ liệu đã kiểm chứng, không phải văn xuôi tự bịa.
 *
 * "Làm việc gì" lấy từ chính spine (task/design/goal). "Test thế nào" lấy
 * nguyên kết quả `evaluateGate` — chỉ gọi được hàm này sau khi gate đã `ok`,
 * nên mọi mục hiện ra ở đây đều THẬT SỰ đã chấm qua, không phải khai suông.
 *
 * Không bao giờ có dòng ghi công AI/trợ lý — đây là quy ước cứng của ganas,
 * không phải tuỳ chọn cấu hình.
 */
export function buildCommitMessage(graph: Graph, task: Task, gate: GateResult): string {
  const lines: string[] = [`${task.id}: ${task.title}`, "", "Điều kiện hoàn thành:"];

  for (const r of gate.results) {
    const mark = r.status === "pass" ? "✓" : r.status === "pending_human" ? "…" : "✗";
    lines.push(`  ${mark} ${r.label}`);
  }

  const design = graph.designs.get(task.implements)?.value;
  const context = [
    `phục vụ ${task.serves.join(", ")}`,
    design ? `design ${design.id} — ${design.title}` : `design ${task.implements}`,
    `phạm vi ${task.scope}`,
  ].join(" · ");

  lines.push("", context);

  return lines.join("\n") + "\n";
}

/* ------------------------------------------------------------------------- *
 * Chấm lại trên CÂY SẮP ĐƯỢC COMMIT
 * ------------------------------------------------------------------------- */

/** Kết quả chấm lại. `skipped` là "không dựng được cây", KHÔNG phải "đã xanh". */
export interface StagedTreeCheck {
  status: "ok" | "failed" | "skipped";
  /** Tiêu chí đỏ trên cây đã stage — rỗng khi `ok` hoặc `skipped`. */
  failures: { label: string; reason: string }[];
  /** Vì sao bỏ qua. Chỉ có khi `skipped`. */
  reason?: string;
}

/** Bọc một đường dẫn cho shell. */
function shellQuote(p: string): string {
  return `'${p.split("'").join(`'\\''`)}'`;
}

/**
 * Chấm lại `exit_contract` trên chính nội dung ĐÃ STAGE, trước khi tạo commit.
 *
 * ## Vì sao cần
 *
 * `ganas gate` chạy các lệnh với cwd là gốc repo — tức trên WORKING TREE. Còn
 * `ganas commit` chỉ `git add` những file trong `taskBoundary()`. Chênh lệch
 * giữa hai tập đó trước đây không ai kiểm, nên gate xanh vẫn sinh ra được một
 * commit không biên dịch nổi: file trong ranh giới import một file NGOÀI ranh
 * giới đang sửa dở, working tree có đủ cả hai, commit thì chỉ có một.
 *
 * Đã xảy ra thật ở T-010 (`commit:fc99e87`, phải `--amend` mới vá được). Đây
 * đúng lớp lỗi "xanh ở máy tác giả, đỏ ở mọi máy khác" mà ganas tồn tại để
 * chặn, nên để nó lọt là mâu thuẫn với chính lý do dự án có mặt.
 *
 * ## Vì sao `write-tree` + `archive`, không phải `git stash --keep-index`
 *
 * `stash` đụng vào working tree THẬT của người dùng: tiến trình chết giữa
 * chừng thì phần chưa commit nằm lại trong stash, và người dùng phải tự biết
 * đường lấy ra. Một lệnh KIỂM TRA không được phép có chế độ hỏng kiểu đó.
 * `git write-tree` chỉ đọc index và không sửa gì; `git archive` bung bản sao ra
 * thư mục tạm.
 *
 * `node_modules` được mượn qua symlink chứ không chép: nó không nằm trong git
 * (nên không có trong cây đã stage), mà thiếu nó thì mọi lệnh `npm`/`npx` đều
 * đỏ vì lý do chẳng liên quan gì tới task.
 *
 * ## Dựng không được thì SKIPPED, không phải OK
 *
 * Không phải repo git, `git archive` lỗi, không có `tar` — mọi trường hợp đó
 * trả `skipped` kèm lý do, và nơi gọi phải NÓI RA. Im lặng coi như xanh là
 * dựng lại đúng cái lỗ này ở một chỗ khác.
 */
export async function checkStagedTree(root: string, task: Task): Promise<StagedTreeCheck> {
  const tree = await runShell("git write-tree", { cwd: root, timeoutMs: 30_000 });
  if (tree.code !== 0 || !tree.stdout.trim()) {
    return {
      status: "skipped",
      failures: [],
      reason: `\`git write-tree\` không chạy được: ${tree.stderr.trim() || "không rõ lý do"}`,
    };
  }

  const dir = await mkdtemp(join(tmpdir(), "ganas-staged-"));
  try {
    const extract = await runShell(
      `git archive ${tree.stdout.trim()} | tar -x -C ${shellQuote(dir)}`,
      { cwd: root, timeoutMs: 120_000 },
    );
    if (extract.code !== 0) {
      return {
        status: "skipped",
        failures: [],
        reason: `bung cây đã stage ra thư mục tạm thất bại: ${extract.stderr.trim() || "không rõ lý do"}`,
      };
    }

    const modules = join(root, "node_modules");
    if (existsSync(modules)) {
      await symlink(modules, join(dir, "node_modules"), "dir").catch(() => undefined);
    }

    const results = await evaluateTreeCriteria(dir, task.exit_contract);
    const failures = results
      .filter((r) => r.status === "fail")
      .map((r) => ({ label: r.label, reason: r.reason ?? "không đạt" }));

    return failures.length === 0
      ? { status: "ok", failures: [] }
      : { status: "failed", failures };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** In kết quả chấm lại thành chữ. Trả `""` khi xanh — không có gì để nói thì đừng nói. */
export function formatStagedTreeCheck(taskId: string, check: StagedTreeCheck): string {
  if (check.status === "ok") return "";

  if (check.status === "skipped") {
    return (
      `\n⚠ KHÔNG chấm lại được trên cây sắp commit: ${check.reason}\n` +
      `  Gate đã xanh trên working tree, nhưng đó là một cây KHÁC với cây sắp đi vào commit.\n`
    );
  }

  return (
    `\n✗ ${taskId} xanh trên working tree nhưng ĐỎ trên cây sắp được commit:\n` +
    check.failures.map((f) => `    ${f.label}\n      ${f.reason}`).join("\n") +
    `\n\n  Gần như luôn cùng một nguyên nhân: file trong ranh giới của task phụ thuộc một\n` +
    `  file NGOÀI ranh giới đang sửa dở. Working tree có đủ cả hai, commit thì không.\n` +
    `  Hoặc khai thêm khối vào \`touches\`, hoặc commit file kia trước bằng task sở hữu nó.\n`
  );
}
