import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { runShell } from "../src/util/exec.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * `scripts/install-target.mjs` cài ganas cho project KHÔNG qua Claude Code
 * plugin system — dùng khi ganas được thêm bằng package manager (`bun add
 * github:...`). Test dựng lại đúng bố cục thật: một project giả có
 * `node_modules/ganas/{plugin,scripts}` (giống hệt cách `bun add` chép
 * nguyên repo vào đó), rồi chạy script như `bun add` xong sẽ chạy.
 */

async function fakeProjectWithGanasInstalled(): Promise<{ project: string; scriptPath: string }> {
  const project = await mkdtemp(join(tmpdir(), "ganas-consumer-"));
  const ganasDir = join(project, "node_modules", "ganas");
  await cp(join(ROOT, "plugin"), join(ganasDir, "plugin"), { recursive: true });
  await cp(join(ROOT, "scripts"), join(ganasDir, "scripts"), { recursive: true });
  return { project, scriptPath: join(ganasDir, "scripts", "install-target.mjs") };
}

async function runInstall(
  scriptPath: string,
  projectDir: string,
  args: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return runShell(`node ${JSON.stringify(scriptPath)} ${args}`, {
    cwd: projectDir,
    timeoutMs: 15_000,
  });
}

test("⭐ --claude-code: sinh đủ 6 hook trong .claude/settings.json, hook chạy được thật", async () => {
  const { project, scriptPath } = await fakeProjectWithGanasInstalled();
  try {
    const r = await runInstall(scriptPath, project, "--claude-code");
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);

    const settings = JSON.parse(
      await readFile(join(project, ".claude", "settings.json"), "utf8"),
    ) as { hooks: Record<string, unknown[]> };
    for (const event of [
      "SessionStart",
      "PreToolUse",
      "PostToolUse",
      "Stop",
      "PreCompact",
      "SessionEnd",
    ]) {
      assert.equal(settings.hooks[event]?.length, 1, `thiếu hook ${event}`);
    }

    // Không có ${CLAUDE_PLUGIN_ROOT} sống sót — phải thay bằng đường dẫn thật.
    assert.doesNotMatch(JSON.stringify(settings), /CLAUDE_PLUGIN_ROOT/);

    // Hook phải chạy được thật, đúng đường dẫn vừa sinh (node_modules/ganas/plugin/bin/ganas.mjs).
    const bin = join(project, "node_modules", "ganas", "plugin", "bin", "ganas.mjs");
    const hookRun = await runShell(
      `echo '{"session_id":"t","cwd":"${project}","source":"startup"}' | node ${JSON.stringify(bin)} hook session-start`,
      { cwd: project, timeoutMs: 15_000 },
    );
    assert.equal(hookRun.code, 0);
    assert.equal(hookRun.stdout.trim(), "{}");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("--claude-code: sinh đủ 9 skill, đã thay ${CLAUDE_PLUGIN_ROOT} trong SKILL.md", async () => {
  const { project, scriptPath } = await fakeProjectWithGanasInstalled();
  try {
    const r = await runInstall(scriptPath, project, "--claude-code");
    assert.equal(r.code, 0);

    const gateSkill = await readFile(
      join(project, ".claude", "skills", "gate", "SKILL.md"),
      "utf8",
    );
    assert.doesNotMatch(gateSkill, /CLAUDE_PLUGIN_ROOT/);
    assert.match(gateSkill, /node_modules\/ganas\/plugin\/bin\/ganas\.mjs/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("⭐ chạy lại lần 2 không nhân đôi hook, không xoá key khác trong settings.json", async () => {
  const { project, scriptPath } = await fakeProjectWithGanasInstalled();
  try {
    await mkdir(join(project, ".claude"), { recursive: true });
    await writeFile(
      join(project, ".claude", "settings.json"),
      JSON.stringify({ attribution: { commit: "" }, env: { FOO: "bar" } }),
      "utf8",
    );

    await runInstall(scriptPath, project, "--claude-code");
    const r2 = await runInstall(scriptPath, project, "--claude-code");
    assert.equal(r2.code, 0);
    assert.match(r2.stdout, /0 hook mới/, `phải báo 0 hook mới ở lần chạy thứ hai: ${r2.stdout}`);

    const settings = JSON.parse(
      await readFile(join(project, ".claude", "settings.json"), "utf8"),
    ) as {
      hooks: Record<string, unknown[]>;
      attribution: { commit: string };
      env: { FOO: string };
    };
    assert.equal(settings.hooks["SessionStart"]?.length, 1);
    assert.equal(settings.attribution.commit, "");
    assert.equal(settings.env.FOO, "bar");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("--zed: ghi .zed/settings.json dạng context_servers, đường dẫn tương đối", async () => {
  const { project, scriptPath } = await fakeProjectWithGanasInstalled();
  try {
    const r = await runInstall(scriptPath, project, "--zed");
    assert.equal(r.code, 0);

    const settings = JSON.parse(await readFile(join(project, ".zed", "settings.json"), "utf8")) as {
      context_servers: { ganas: { source: string; command: string; args: string[] } };
    };
    assert.equal(settings.context_servers.ganas.source, "custom");
    assert.equal(settings.context_servers.ganas.command, "node");
    assert.equal(
      settings.context_servers.ganas.args[0],
      "node_modules/ganas/plugin/bin/ganas-mcp.mjs",
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("--cursor: ghi .cursor/mcp.json dạng mcpServers", async () => {
  const { project, scriptPath } = await fakeProjectWithGanasInstalled();
  try {
    const r = await runInstall(scriptPath, project, "--cursor");
    assert.equal(r.code, 0);

    const settings = JSON.parse(await readFile(join(project, ".cursor", "mcp.json"), "utf8")) as {
      mcpServers: { ganas: { command: string; args: string[] } };
    };
    assert.equal(settings.mcpServers.ganas.command, "node");
    assert.equal(settings.mcpServers.ganas.args[0], "node_modules/ganas/plugin/bin/ganas-mcp.mjs");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("--windsurf: chỉ in hướng dẫn, đường dẫn TUYỆT ĐỐI, không ghi file", async () => {
  const { project, scriptPath } = await fakeProjectWithGanasInstalled();
  try {
    const r = await runInstall(scriptPath, project, "--windsurf");
    assert.equal(r.code, 0);
    assert.match(r.stdout, /mcp_config\.json/);
    assert.match(r.stdout, /"args": \["\/.*plugin\/bin\/ganas-mcp\.mjs"\]/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("không cờ nào / --help → in hướng dẫn, thoát mã tương ứng", async () => {
  const { project, scriptPath } = await fakeProjectWithGanasInstalled();
  try {
    const noArgs = await runInstall(scriptPath, project, "");
    assert.equal(noArgs.code, 1);
    assert.match(noArgs.stdout, /--claude-code/);

    const help = await runInstall(scriptPath, project, "--help");
    assert.equal(help.code, 0);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("cờ không biết → báo lỗi rõ ràng, thoát mã 1", async () => {
  const { project, scriptPath } = await fakeProjectWithGanasInstalled();
  try {
    const r = await runInstall(scriptPath, project, "--vscode");
    assert.equal(r.code, 1);
    assert.match(r.stderr, /--vscode/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
