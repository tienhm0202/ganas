import { appendFile, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import {
  CONFIG_FILE,
  DIRS,
  findGanasRoot,
  GANAS_DIR,
  ganasPath,
  STATE_FILE,
} from "../graph/paths.js";
import { guideFileName, HARNESS, type Harness, pointerFileName } from "../model/config.js";
import * as T from "../templates/project.js";
import { type Argv, flag, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { runShell } from "../util/exec.js";
import { exists } from "../util/fsprobe.js";

/** Thư mục con tạo sẵn — thư mục rỗng giúp người mới biết chỗ đặt file. */
const SUBDIRS = [
  DIRS.goals,
  DIRS.designs,
  DIRS.tasks,
  DIRS.scopes,
  DIRS.modules,
  DIRS.facts,
  DIRS.claims,
  DIRS.decisions,
  DIRS.icebox,
  DIRS.domains,
  DIRS.legacyImported,
  DIRS.mapSurveys,
  DIRS.proposals,
  DIRS.runs,
] as const;

async function prompt(question: string, fallback = ""): Promise<string> {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = fallback ? ` [${fallback}]` : "";
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

/** Ghi file, không đè lên file đã có trừ khi --force. */
async function writeNew(
  file: string,
  content: string,
  force: boolean,
): Promise<"written" | "kept"> {
  if (exists(file) && !force) return "kept";
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, content, "utf8");
  return "written";
}

export async function run(argv: Argv): Promise<number> {
  const cwd = resolve(option(argv, "root") ?? process.cwd());
  const force = flag(argv, "force");
  const noninteractive = flag(argv, "yes", "y") || !process.stdin.isTTY;

  const existing = findGanasRoot(cwd);
  if (existing && !force) {
    throw new GanasError(
      `dự án đã có .ganas/ tại ${existing}.\n` +
        `  Muốn thêm mục tiêu/task mới: sửa file trong .ganas/ rồi chạy ganas validate\n` +
        `  Muốn khởi tạo lại từ đầu:   ganas init --force`,
    );
  }

  const project =
    option(argv, "project") ??
    (noninteractive ? basename(cwd) : await prompt("Tên dự án", basename(cwd)));

  const ownerRaw =
    option(argv, "owner") ??
    (noninteractive
      ? ""
      : await prompt("Handle người duyệt mục tiêu (vd @nguyen-a), bỏ trống nếu chưa có"));
  const owner = ownerRaw ? (ownerRaw.startsWith("@") ? ownerRaw : `@${ownerRaw}`) : undefined;

  const harnessRaw = option(argv, "harness") ?? "claude-code";
  if (!(HARNESS as readonly string[]).includes(harnessRaw)) {
    throw new GanasError(
      `harness "${harnessRaw}" không có. Chọn một trong: ${HARNESS.join(", ")}.\n` +
        `  Field này quyết định tên file hướng dẫn được sinh ra, không chỉ cách giao task.`,
    );
  }
  const harness = harnessRaw as Harness;

  const vars: T.InitVars = { project, owner, harness };
  const written: string[] = [];
  const kept: string[] = [];

  const track = (rel: string, result: "written" | "kept") => {
    (result === "written" ? written : kept).push(rel);
  };

  for (const dir of SUBDIRS) await mkdir(ganasPath(cwd, dir), { recursive: true });

  track(
    `${GANAS_DIR}/${CONFIG_FILE}`,
    await writeNew(ganasPath(cwd, CONFIG_FILE), T.configYaml(vars), force),
  );
  track(`${GANAS_DIR}/README.md`, await writeNew(ganasPath(cwd, "README.md"), T.readme(), force));
  track(
    `${GANAS_DIR}/${STATE_FILE}`,
    await writeNew(
      ganasPath(cwd, STATE_FILE),
      JSON.stringify({ version: 1, current_task: null }, null, 2) + "\n",
      force,
    ),
  );

  // Luật ghi tri thức: không có `paths:` frontmatter nên sống qua compaction.
  track(
    ".claude/rules/ganas-knowledge.md",
    await writeNew(join(cwd, ".claude", "rules", "ganas-knowledge.md"), T.knowledgeRuleMd(), force),
  );

  // Luật kiến trúc (tách lõi khỏi I/O) — cùng lý do không có `paths:` frontmatter.
  track(
    ".claude/rules/architecture.md",
    await writeNew(join(cwd, ".claude", "rules", "architecture.md"), T.architectureRuleMd(), force),
  );

  // Luật git (tag semver, ký commit local, không Co-Authored-By) — cùng lý do
  // không có `paths:` frontmatter.
  track(
    ".claude/rules/ganas-git.md",
    await writeNew(join(cwd, ".claude", "rules", "ganas-git.md"), T.gitRuleMd(), force),
  );

  // Luật đặt tên (định danh tiếng Anh, văn xuôi tiếng Việt) — cùng lý do không
  // có `paths:` frontmatter: nó áp dụng cho mọi file code, không riêng một vùng.
  track(
    ".claude/rules/naming.md",
    await writeNew(join(cwd, ".claude", "rules", "naming.md"), T.namingRuleMd(), force),
  );

  // Luật viết file hướng dẫn cho agent — nhận `harness` vì TÊN FILE do harness
  // quyết định. Cùng lý do không có `paths:` frontmatter.
  track(
    ".claude/rules/agent-guide.md",
    await writeNew(join(cwd, ".claude", "rules", "agent-guide.md"), T.guideRuleMd(harness), force),
  );

  // File hướng dẫn: TÊN phụ thuộc harness — Claude Code chỉ tự đọc CLAUDE.md,
  // Codex/Cursor/Zed đọc AGENTS.md, Gemini CLI đọc GEMINI.md. Không đè nếu dự
  // án đã có file đó — nội dung cũ là của người dùng, trộn vào là mất thứ họ
  // viết mà không hỏi.
  const guideFile = guideFileName(harness);
  const guideResult = await writeNew(join(cwd, guideFile), T.guideMd(vars), force);
  track(guideFile, guideResult);

  // Cửa trỏ, chỉ khi file chính không tên AGENTS.md: người mở repo bằng một
  // công cụ khác phải tìm được hướng dẫn thật. Cố ý KHÔNG chép nội dung sang.
  const pointer = pointerFileName(harness);
  if (pointer) {
    track(pointer, await writeNew(join(cwd, pointer), T.guidePointerMd(vars, guideFile), force));
  }

  // Goal mẫu để graph có hình hài ngay, và để `validate` có gì mà kiểm. Phạm vi
  // KHÔNG sinh mẫu: nó cần ranh giới code thật, mà `ganas scope new` mới hỏi
  // được. Một phạm vi placeholder sẽ thành cái thùng rác đầu tiên của dự án.
  const goalId = "G-001";
  track(
    `${GANAS_DIR}/${DIRS.goals}/${goalId}.yaml`,
    await writeNew(ganasPath(cwd, DIRS.goals, `${goalId}.yaml`), T.sampleGoal(goalId, vars), force),
  );

  await ensureGitignore(cwd);
  const hook = await ensureCommitMsgHook(cwd, force);
  if (hook) track(hook.path, hook.result);
  const preCommit = await ensureGitHook(cwd, "pre-commit", T.preCommitHook(), force);
  if (preCommit) track(preCommit.path, preCommit.result);

  process.stdout.write(`ganas đã khởi tạo tại ${cwd}\n\n`);
  if (written.length) process.stdout.write(`  tạo mới:  ${written.join("\n            ")}\n`);
  if (kept.length) process.stdout.write(`  giữ nguyên: ${kept.join("\n              ")}\n`);

  if (guideResult === "kept") {
    process.stdout.write(
      `\n  ⚠ ${guideFile} đã có sẵn nên không bị đè.\n` +
        `    Nội dung ở đó CHƯA được đối chất với code thật. Muốn đưa vào kho tri\n` +
        `    thức thì ghi thành claim ở .ganas/legacy/imported/ (tiền tố LC-,\n` +
        `    provenance: imported) rồi verify dần — đừng coi nó là sự thật sẵn có.\n`,
    );
  }

  process.stdout.write(
    `\nTiếp theo:\n` +
      `  1. Sửa .ganas/goals/${goalId}.yaml — mục tiêu thật và tiêu chí nghiệm thu thật\n` +
      (owner ? "" : `  2. Điền approved_by + approved_at rồi chuyển status: active\n`) +
      `  ${owner ? "2" : "3"}. ganas validate\n`,
  );

  return 0;
}

/** Thêm mục ganas vào .gitignore nếu chưa có. Không tạo file nếu dự án không dùng git. */
async function ensureGitignore(cwd: string): Promise<void> {
  const file = join(cwd, ".gitignore");
  if (!exists(file)) {
    if (!exists(join(cwd, ".git"))) return;
    await writeFile(file, T.gitignoreAddition().trimStart(), "utf8");
    return;
  }
  const current = await readFile(file, "utf8");
  if (current.includes(".ganas/runs/")) return;
  await appendFile(file, T.gitignoreAddition(), "utf8");
}

/**
 * Cài một git hook thật (không phải Claude Code hook) vào `.githooks/`.
 *
 * Không tạo gì nếu dự án không dùng git; không đè `core.hooksPath` nếu dự án đã
 * tự đặt khác (tôn trọng lựa chọn có sẵn, giống `writeNew` với file thường).
 */
async function ensureGitHook(
  cwd: string,
  name: string,
  content: string,
  force: boolean,
): Promise<{ path: string; result: "written" | "kept" } | undefined> {
  if (!exists(join(cwd, ".git"))) return undefined;

  const hookFile = join(cwd, ".githooks", name);
  const result = await writeNew(hookFile, content, force);
  await chmod(hookFile, 0o755);

  const current = await runShell("git config --get core.hooksPath", { cwd, timeoutMs: 5000 });
  const already = current.code === 0 ? current.stdout.trim() : "";
  if (already === "" || already === ".githooks") {
    await runShell("git config core.hooksPath .githooks", { cwd, timeoutMs: 5000 });
  }
  // already trỏ chỗ khác: tôn trọng, không đè — hook đã ghi nhưng chưa bật,
  // người dùng tự quyết định có muốn gộp vào không.

  return { path: `.githooks/${name}`, result };
}

/** Cưỡng chế "không Co-Authored-By" bằng git hook thật — xem `T.commitMsgHook()`. */
async function ensureCommitMsgHook(
  cwd: string,
  force: boolean,
): Promise<{ path: string; result: "written" | "kept" } | undefined> {
  return ensureGitHook(cwd, "commit-msg", T.commitMsgHook(), force);
}
