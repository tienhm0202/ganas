import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseDocument } from "yaml";

import {
  contractPathRefs,
  formatBoundaryWarning,
  outsideBoundary,
  ownsGanasFile,
  taskBoundary,
} from "../boundary.js";
import { buildCommitMessage } from "../commit.js";
import { alreadyGreen, evaluateGate, formatGate, type GateResult } from "../gate.js";
import { GANAS_DIR } from "../graph/paths.js";
import type { Sourced } from "../graph/types.js";
import type { Task } from "../model/index.js";
import { baselineFor, taskForSession, touchedPathsFor } from "../state.js";
import { type Argv, enabled, flag, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { runShell } from "../util/exec.js";
import { verifyChain } from "../verify/ledger.js";
import { openProject } from "./_common.js";
import { commitDebtSummary } from "./debt.js";

/** Bọc pathspec cho `git add`: đủ để chống một dấu nháy đơn trong path lạ. */
function quote(p: string): string {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

export interface PorcelainEntry {
  /** Cột index (đã stage). `?` = chưa track. */
  x: string;
  /** Cột working tree. Khác `" "` ⇒ trên đĩa còn khác với index. */
  y: string;
  path: string;
}

/**
 * Parse `git status --porcelain -z`.
 *
 * Dùng `-z` chứ không phải bản có xuống dòng: với `core.quotepath` bật (mặc
 * định), tên file có dấu bị escape thành `\303\251...` và mọi so khớp sau đó
 * đều trượt. `-z` không escape gì.
 *
 * Mục đổi tên/copy chiếm HAI trường (đường dẫn mới và cũ) — lấy cả hai, vì cả
 * hai đều là thứ cần vào commit.
 */
export function parsePorcelainZ(stdout: string): PorcelainEntry[] {
  const fields = stdout.split("\0");
  const entries: PorcelainEntry[] = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field || field.length < 4) continue;
    const x = field[0]!;
    const y = field[1]!;
    entries.push({ x, y, path: field.slice(3) });
    if (x === "R" || x === "C" || y === "R" || y === "C") {
      const other = fields[++i];
      if (other) entries.push({ x, y, path: other });
    }
  }
  return entries;
}

/** File chưa vào git hẳn: chưa track, hoặc trên đĩa còn khác với index. */
function notFullyStaged(e: PorcelainEntry): boolean {
  return e.x === "?" || e.y !== " ";
}

function ownedPaths(task: Task, entries: readonly PorcelainEntry[]): string[] {
  return [...new Set(entries.filter((e) => ownsGanasFile(task, e.path)).map((e) => e.path))];
}

function foreignPaths(task: Task, entries: readonly PorcelainEntry[]): string[] {
  return [...new Set(entries.filter((e) => !ownsGanasFile(task, e.path)).map((e) => e.path))];
}

async function changedUnder(root: string, pathspec: string[]): Promise<PorcelainEntry[]> {
  if (pathspec.length === 0) return [];
  const spec = pathspec.map(quote).join(" ");
  // `-uall`: mặc định git gộp cả thư mục chưa track thành MỘT dòng `?? .ganas/`.
  // Gộp như thế thì không phân loại được file nào thuộc task nào — mà đó chính
  // là việc ở đây.
  const res = await runShell(`git status --porcelain -z -uall -- ${spec}`, {
    cwd: root,
    timeoutMs: 15_000,
  });
  if (res.code !== 0) return [];
  return parsePorcelainZ(res.stdout);
}

/**
 * Ghi `status: done` + `done_at` vào file task, giữ nguyên comment.
 *
 * Dùng `Document` của `yaml` như `writeBackFact` (src/verify/run.ts): serialize
 * lại từ object JS sẽ xoá sạch chú thích, mà chú thích trong file spine thường
 * là phần giải thích quan trọng nhất.
 *
 * Trả về nội dung CŨ để khôi phục nếu `git commit` fail — đánh dấu done cho một
 * commit không bao giờ tồn tại là nói dối lịch sử.
 */
async function closeTaskFile(root: string, sourced: Sourced<Task>): Promise<string> {
  const file = join(root, sourced.file);
  const original = await readFile(file, "utf8");
  const doc = parseDocument(original);
  const base = sourced.index === undefined ? [] : [sourced.index];

  doc.setIn([...base, "status"], "done");
  doc.setIn([...base, "done_at"], new Date().toISOString());

  await writeFile(file, doc.toString(), "utf8");
  return original;
}

function reportBaseline(gate: GateResult, baseline: Record<string, boolean> | undefined): string {
  const green = alreadyGreen(gate, baseline);
  if (green.length === 0) return "";
  return (
    `\n⚠ ${green.length} tiêu chí đã XANH SẴN từ trước khi bắt đầu task:\n` +
    green.map((r) => `    ${r.label}`).join("\n") +
    `\n  Hoặc task này đã xong từ trước, hoặc tiêu chí đó không gác gì.\n` +
    `  Một gate tự xanh trước khi sửa là gate không tồn tại.\n`
  );
}

export async function run(argv: Argv): Promise<number> {
  const { root, graph, freshness } = await openProject(argv);

  const sessionId = option(argv, "session");
  const taskId =
    argv.positional[0] ?? option(argv, "task") ?? (await taskForSession(root, sessionId));
  if (!taskId) throw new GanasError("chưa biết đang làm task nào — chạy `ganas next` trước");

  const sourced = graph.tasks.get(taskId);
  if (!sourced) throw new GanasError(`không có task ${taskId}`);
  const task = sourced.value;

  // Sổ cái là gốc tin cậy của cả hệ thống. Chain đứt nghĩa là có entry đã bị sửa
  // hoặc xoá SAU khi ghi — commit đè lên đó là đóng dấu lên bằng chứng đã hỏng.
  const chain = verifyChain(graph.ledgerRaw);
  if (!chain.ok) {
    throw new GanasError(
      `hash-chain của sổ cái xác minh đứt ở dòng ${(chain.brokenAt ?? 0) + 1} ` +
        `(.ganas/verify-ledger.jsonl).\n` +
        `Sổ cái là append-only: đứt chain nghĩa là có dòng bị sửa, xoá hoặc đảo thứ tự ` +
        `sau khi ghi. Xem \`ganas ledger --check\` và \`ganas validate\`, phục hồi từ git ` +
        `trước khi commit tiếp.`,
    );
  }

  const gateResult = await evaluateGate(graph, task, freshness, sessionId);
  if (!gateResult.ok) {
    process.stdout.write(
      `Chưa commit được — điều kiện hoàn thành của ${taskId} chưa thoả:\n\n${formatGate(gateResult)}\n`,
    );
    return 1;
  }

  const baseline = await baselineFor(root, sessionId, taskId);
  const baselineWarning = reportBaseline(gateResult, baseline);

  const allGanas = flag(argv, "all-ganas");
  const codePaths = taskBoundary(task, graph);

  // Cảnh báo đối chiếu ĐÚNG cái ranh giới sắp đem đi `git add` — dùng lại
  // `codePaths` chứ không tính lại, để không có đường nào cho hai thứ lệch nhau.
  const touched = await touchedPathsFor(root, sessionId, taskId);
  const outsideWarning = formatBoundaryWarning(
    taskId,
    codePaths,
    touched,
    outsideBoundary(task, graph, touched),
  );

  // Đóng task TRƯỚC khi stage, để thay đổi đó nằm trong chính commit này chứ
  // không lơ lửng trong working tree sau đó.
  const willClose =
    enabled(argv, "close") && task.status !== "done" && gateResult.pendingHuman.length === 0;

  if (flag(argv, "dry-run")) {
    const ganasChanged = allGanas ? [] : await changedUnder(root, [GANAS_DIR]);
    const owned = ownedPaths(task, ganasChanged);
    const foreign = foreignPaths(task, ganasChanged);
    const message = buildCommitMessage(graph, task, gateResult);

    process.stdout.write(
      `--- ganas commit ${taskId} (dry-run, KHÔNG stage, KHÔNG commit) ---\n\n` +
        `Sẽ stage:\n` +
        [...(allGanas ? [GANAS_DIR] : owned), ...codePaths].map((p) => `  + ${p}`).join("\n") +
        (foreign.length > 0
          ? `\n\nĐể lại (không thuộc ${taskId}):\n` + foreign.map((p) => `  · ${p}`).join("\n")
          : "") +
        (willClose ? `\n\nSẽ đánh dấu ${taskId}: status: done + done_at.` : "") +
        baselineWarning +
        outsideWarning +
        `\n\n--- commit message ---\n${message}`,
    );
    return 0;
  }

  let originalTaskFile: string | null = null;
  if (willClose) originalTaskFile = await closeTaskFile(root, sourced);

  // Liệt kê SAU khi đóng task, nếu không file task vừa sửa sẽ không có trong danh sách.
  const ganasChanged = allGanas ? [] : await changedUnder(root, [GANAS_DIR]);
  const owned = ownedPaths(task, ganasChanged);
  const foreign = foreignPaths(task, ganasChanged);

  // Best-effort: một pattern không khớp file nào (khối chưa có code thật) không
  // được làm cả lệnh add hỏng — bỏ qua lỗi từng pattern, không bỏ qua cả việc add.
  for (const p of [...(allGanas ? [GANAS_DIR] : owned), ...codePaths]) {
    await runShell(`git add -- ${quote(p)}`, { cwd: root, timeoutMs: 15_000 });
  }

  const staged = await runShell("git diff --cached --quiet", { cwd: root, timeoutMs: 10_000 });
  if (staged.code === 0) {
    if (originalTaskFile !== null) {
      await writeFile(join(root, sourced.file), originalTaskFile, "utf8");
    }
    process.stdout.write(
      `Không có gì để commit — phạm vi của ${taskId} đang sạch.\n` +
        (foreign.length > 0
          ? `\n${GANAS_DIR}/ có ${foreign.length} file đang đổi nhưng KHÔNG thuộc ${taskId}:\n` +
            foreign.map((p) => `  · ${p}`).join("\n") +
            `\nCommit chúng cùng task sở hữu, hoặc \`git add\` tay nếu muốn gộp.\n`
          : "") +
        outsideWarning,
    );
    return 0;
  }

  const message = buildCommitMessage(graph, task, gateResult);

  const dir = await mkdtemp(join(tmpdir(), "ganas-commit-"));
  try {
    const msgFile = join(dir, "MSG");
    await writeFile(msgFile, message, "utf8");
    const result = await runShell(`git commit -F ${quote(msgFile)}`, {
      cwd: root,
      timeoutMs: 30_000,
    });
    if (result.code !== 0) {
      if (originalTaskFile !== null) {
        await writeFile(join(root, sourced.file), originalTaskFile, "utf8");
      }
      throw new GanasError(`git commit thất bại:\n${result.stderr || result.stdout}`);
    }

    process.stdout.write(
      `✓ Đã commit cho ${taskId}.\n\n${message}` +
        (willClose ? `\n${taskId} đã đánh dấu \`status: done\`.\n` : "") +
        (!willClose && gateResult.pendingHuman.length > 0
          ? `\n${taskId} CHƯA đóng: còn ${gateResult.pendingHuman.length} tiêu chí cần người ` +
            `xác nhận:\n` +
            gateResult.pendingHuman.map((p) => `  … ${p.label}`).join("\n") +
            `\n`
          : "") +
        reportUnstagedContract(task, await unstagedContractPaths(root, task)) +
        (foreign.length > 0
          ? `\n${GANAS_DIR}/ có ${foreign.length} file đang đổi nhưng KHÔNG thuộc ${taskId} — ` +
            `để lại, chưa commit:\n` +
            foreign.map((p) => `  · ${p}`).join("\n") +
            `\nCommit chúng cùng task sở hữu chúng.\n`
          : "") +
        baselineWarning +
        outsideWarning +
        commitDebtSummary(graph, task.scope),
    );
    return 0;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * File mà `exit_contract` chạy nhưng SAU khi commit vẫn chưa vào git.
 *
 * Đây là lưới an toàn cho đúng lỗi znstrack mục 1: commit đạt gate ở máy này,
 * clone về máy khác thì lệnh trong `exit_contract` không tìm thấy file.
 */
async function unstagedContractPaths(root: string, task: Task): Promise<string[]> {
  const existing = contractPathRefs(task).filter((r) => existsSync(join(root, r.path)));
  if (existing.length === 0) return [];
  const changed = await changedUnder(
    root,
    existing.map((r) => r.path),
  );
  return [...new Set(changed.filter(notFullyStaged).map((e) => e.path))];
}

function reportUnstagedContract(task: Task, left: string[]): string {
  if (left.length === 0) return "";
  const refs = contractPathRefs(task);
  return (
    `\n⚠ ${left.length} file mà \`exit_contract\` của ${task.id} chạy vẫn CHƯA vào git:\n` +
    left
      .map((p) => {
        const from = refs.find((r) => r.path === p)?.from;
        return `  · ${p}${from ? `\n      ${from}` : ""}`;
      })
      .join("\n") +
    `\n  Clone về máy khác, gate của ${task.id} sẽ đỏ. \`git add\` chúng rồi commit tiếp.\n`
  );
}
