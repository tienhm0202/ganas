import { mkdir, writeFile, readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { flag, option, type Argv } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { findGanasRoot, ganasPath, DIRS, CONFIG_FILE, STATE_FILE, GANAS_DIR } from "../graph/paths.js";
import * as T from "../templates/project.js";

/** Thư mục con tạo sẵn — thư mục rỗng giúp người mới biết chỗ đặt file. */
const SUBDIRS = [
  DIRS.goals,
  DIRS.sprints,
  DIRS.designs,
  DIRS.tasks,
  DIRS.parts,
  DIRS.modules,
  DIRS.facts,
  DIRS.claims,
  DIRS.decisions,
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
async function writeNew(file: string, content: string, force: boolean): Promise<"written" | "kept"> {
  if (existsSync(file) && !force) return "kept";
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

  const project = option(argv, "project") ?? (noninteractive
    ? basename(cwd)
    : await prompt("Tên dự án", basename(cwd)));

  const ownerRaw = option(argv, "owner") ?? (noninteractive
    ? ""
    : await prompt("Handle người duyệt mục tiêu (vd @nguyen-a), bỏ trống nếu chưa có"));
  const owner = ownerRaw ? (ownerRaw.startsWith("@") ? ownerRaw : `@${ownerRaw}`) : undefined;

  const vars: T.InitVars = { project, owner };
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
    await writeNew(
      join(cwd, ".claude", "rules", "ganas-knowledge.md"),
      T.knowledgeRuleMd(),
      force,
    ),
  );

  // CLAUDE.md và AGENTS.md: không đè nếu dự án đã có — đó là việc của `ganas adopt`.
  const claudeMdPath = join(cwd, "CLAUDE.md");
  const claudeMdResult = await writeNew(claudeMdPath, T.claudeMd(vars), force);
  track("CLAUDE.md", claudeMdResult);
  track("AGENTS.md", await writeNew(join(cwd, "AGENTS.md"), T.agentsMd(vars), force));

  // Goal + sprint mẫu để graph có hình hài ngay, và để `validate` có gì mà kiểm.
  const goalId = "G-001";
  const sprintId = `S-${new Date().toISOString().slice(0, 7)}`;
  track(
    `${GANAS_DIR}/${DIRS.goals}/${goalId}.yaml`,
    await writeNew(ganasPath(cwd, DIRS.goals, `${goalId}.yaml`), T.sampleGoal(goalId, vars), force),
  );
  track(
    `${GANAS_DIR}/${DIRS.sprints}/${sprintId}.yaml`,
    await writeNew(
      ganasPath(cwd, DIRS.sprints, `${sprintId}.yaml`),
      T.sampleSprint(sprintId, goalId),
      force,
    ),
  );

  await ensureGitignore(cwd);

  process.stdout.write(`ganas đã khởi tạo tại ${cwd}\n\n`);
  if (written.length) process.stdout.write(`  tạo mới:  ${written.join("\n            ")}\n`);
  if (kept.length) process.stdout.write(`  giữ nguyên: ${kept.join("\n              ")}\n`);

  if (claudeMdResult === "kept") {
    process.stdout.write(
      `\n  ⚠ CLAUDE.md đã có sẵn nên không bị đè.\n` +
        `    Dự án cũ nên dùng "ganas adopt" để đối chất tài liệu cũ với code thật,\n` +
        `    thay vì trộn nội dung cũ vào luồng mới.\n`,
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
  if (!existsSync(file)) {
    if (!existsSync(join(cwd, ".git"))) return;
    await writeFile(file, T.gitignoreAddition().trimStart(), "utf8");
    return;
  }
  const current = await readFile(file, "utf8");
  if (current.includes(".ganas/runs/")) return;
  await appendFile(file, T.gitignoreAddition(), "utf8");
}
