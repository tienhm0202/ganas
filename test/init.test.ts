import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { run as ganasInit } from "../src/commands/init.js";
import { runShell } from "../src/util/exec.js";
import { cleanup } from "./helpers.js";

/* --- Nội dung thuần: architectureRuleMd() ---------------------------------- */

test("architectureRuleMd: nhắc nature: io và cả Python lẫn TypeScript", async () => {
  const { architectureRuleMd } = await import("../src/templates/project.js");
  const content = architectureRuleMd();

  assert.match(content, /nature: io/, "phải nối rõ vào taxonomy nature: io của Module");
  assert.match(content, /`code`.*`data`.*`llm`/, "phải nhắc bộ ba lõi code/data/llm");
  assert.match(content, /Python/);
  assert.match(content, /TypeScript/);
  assert.match(content, /Protocol/, "phải chỉ hướng dùng Protocol/ABC cho Python");
  assert.match(content, /interface/, "phải chỉ hướng dùng interface cho TypeScript");
});

/* --- Tích hợp: ganas init sinh .claude/rules/architecture.md --------------- */

test("ganas init: sinh .claude/rules/architecture.md khớp architectureRuleMd()", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "ganas-init-test-"));
  try {
    const code = await ganasInit({
      positional: [],
      options: { root: tmp, project: "demo" },
      flags: { yes: true },
      passthrough: [],
    });
    assert.equal(code, 0);

    const { architectureRuleMd } = await import("../src/templates/project.js");
    const written = await readFile(join(tmp, ".claude", "rules", "architecture.md"), "utf8");
    assert.equal(written, architectureRuleMd());
  } finally {
    await cleanup(tmp);
  }
});

/* --- Nội dung thuần: gitRuleMd() -------------------------------------------- */

test("gitRuleMd: tag semver trần, ký local (không --global), không Co-Authored-By", async () => {
  const { gitRuleMd } = await import("../src/templates/project.js");
  const content = gitRuleMd();

  assert.match(content, /vX\.Y\.Z/, "phải nêu rõ định dạng tag semver");
  assert.match(content, /claude plugin tag/, "phải phân biệt với quy ước tag riêng của plugin");
  assert.doesNotMatch(
    content,
    /git config --global/,
    "lệnh mẫu không được có --global — ký phải cấu hình theo từng repo",
  );
  assert.match(content, /commit\.gpgsign/, "phải hướng dẫn bật ký commit");
  assert.match(content, /Co-Authored-By/, "phải nhắc không thêm Co-Authored-By");
});

/* --- Tích hợp: ganas init sinh .claude/rules/ganas-git.md ------------------ */

test("ganas init: sinh .claude/rules/ganas-git.md khớp gitRuleMd()", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "ganas-init-test-"));
  try {
    const code = await ganasInit({
      positional: [],
      options: { root: tmp, project: "demo" },
      flags: { yes: true },
      passthrough: [],
    });
    assert.equal(code, 0);

    const { gitRuleMd } = await import("../src/templates/project.js");
    const written = await readFile(join(tmp, ".claude", "rules", "ganas-git.md"), "utf8");
    assert.equal(written, gitRuleMd());
  } finally {
    await cleanup(tmp);
  }
});

/* --- Nội dung thuần: commitMsgHook() --------------------------------------- */

test("commitMsgHook: bắt Co-Authored-By nhắc Claude/Anthropic, không chặn commit (exit 0)", async () => {
  const { commitMsgHook } = await import("../src/templates/project.js");
  const content = commitMsgHook();

  assert.match(content, /^#!\/bin\/sh/);
  assert.match(content, /Co-Authored-By/i);
  assert.match(content, /claude\|anthropic/i);
  assert.match(content, /^exit 0$/m, "không được chặn commit — chỉ tự sửa message");
});

/* --- Tích hợp: ganas init bật hook commit-msg thật, hook chạy được thật ---- */

test("⭐ ganas init: bật .githooks/commit-msg, hook thật xoá Co-Authored-By khỏi commit", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "ganas-init-test-"));
  try {
    await runShell("git init -q && git config user.email t@t.l && git config user.name t", {
      cwd: tmp,
      timeoutMs: 15_000,
    });

    const code = await ganasInit({
      positional: [],
      options: { root: tmp, project: "demo" },
      flags: { yes: true },
      passthrough: [],
    });
    assert.equal(code, 0);

    const hookFile = join(tmp, ".githooks", "commit-msg");
    assert.ok(existsSync(hookFile), "phải sinh .githooks/commit-msg");
    const mode = (await stat(hookFile)).mode & 0o777;
    assert.equal(mode, 0o755, `hook phải executable, mode thật: ${mode.toString(8)}`);

    const hooksPath = await runShell("git config --get core.hooksPath", {
      cwd: tmp,
      timeoutMs: 5000,
    });
    assert.equal(hooksPath.stdout.trim(), ".githooks");

    // Chạy thật một commit có dòng Co-Authored-By — hook phải tự xoá.
    await runShell("echo hello > a.txt && git add a.txt", { cwd: tmp, timeoutMs: 5000 });
    const commit = await runShell(
      `git commit -m "$(printf 'test\\n\\nbody\\n\\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\\n')"`,
      { cwd: tmp, timeoutMs: 10_000 },
    );
    assert.equal(commit.code, 0);

    const log = await runShell("git log -1 --format=%B", { cwd: tmp, timeoutMs: 5000 });
    assert.doesNotMatch(log.stdout, /Co-Authored-By/, `message vẫn còn trailer: ${log.stdout}`);
    assert.match(log.stdout, /body/);
  } finally {
    await cleanup(tmp);
  }
});

test("ganas init: không dùng git thì không tạo .githooks/", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "ganas-init-test-"));
  try {
    const code = await ganasInit({
      positional: [],
      options: { root: tmp, project: "demo" },
      flags: { yes: true },
      passthrough: [],
    });
    assert.equal(code, 0);
    assert.ok(!existsSync(join(tmp, ".githooks")), "không dùng git thì không có gì để bật hook");
  } finally {
    await cleanup(tmp);
  }
});
