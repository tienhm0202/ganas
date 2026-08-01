import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildCommitMessage, pathsToStage } from "../commit.js";
import { evaluateGate, formatGate } from "../gate.js";
import { taskForSession } from "../state.js";
import { type Argv, flag, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { runShell } from "../util/exec.js";
import { openProject } from "./_common.js";

/** Bọc pathspec cho `git add`: đủ để chống một dấu nháy đơn trong path lạ. */
function quote(p: string): string {
  return `'${p.replace(/'/g, `'\\''`)}'`;
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

  const gateResult = await evaluateGate(graph, task, freshness, sessionId);
  if (!gateResult.ok) {
    process.stdout.write(
      `Chưa commit được — điều kiện hoàn thành của ${taskId} chưa thoả:\n\n${formatGate(gateResult)}\n`,
    );
    return 1;
  }

  // Best-effort: một pattern không khớp file nào (khối chưa có code thật) không
  // được làm cả lệnh add hỏng — bỏ qua lỗi từng pattern, không bỏ qua cả việc add.
  for (const p of pathsToStage(task, graph)) {
    await runShell(`git add -- ${quote(p)}`, { cwd: root, timeoutMs: 15_000 });
  }

  const staged = await runShell("git diff --cached --quiet", { cwd: root, timeoutMs: 10_000 });
  if (staged.code === 0) {
    process.stdout.write(
      `Không có gì để commit — phạm vi của ${taskId} (.ganas/ + code khối chạm tới) đang sạch.\n`,
    );
    return 0;
  }

  const message = buildCommitMessage(graph, task, gateResult);

  if (flag(argv, "dry-run")) {
    process.stdout.write(`--- commit message (dry-run, chưa commit) ---\n${message}`);
    return 0;
  }

  const dir = await mkdtemp(join(tmpdir(), "ganas-commit-"));
  try {
    const msgFile = join(dir, "MSG");
    await writeFile(msgFile, message, "utf8");
    const result = await runShell(`git commit -F ${quote(msgFile)}`, {
      cwd: root,
      timeoutMs: 30_000,
    });
    if (result.code !== 0) {
      throw new GanasError(`git commit thất bại:\n${result.stderr || result.stdout}`);
    }
    process.stdout.write(`✓ Đã commit cho ${taskId}.\n\n${message}`);
    return 0;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
