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
  // Bản cũ khai "ganas dùng đúng cách này cho chính repo ganas" — SAI so với
  // thực tế: mọi tag của repo này đều trần, và `ganas--v0.1.0` từng tag nhầm
  // đã bị đổi lại từ v0.1.1. Một luật mô tả sai thực tế thì tệ hơn không có
  // luật: người đọc làm theo rồi phải quay lại sửa tag đã push.
  assert.doesNotMatch(
    content,
    /ganas dùng đúng cách này/,
    "luật không được khai ganas tag kiểu <tên>--vX.Y.Z — nó không, và chưa bao giờ",
  );
  assert.match(content, /source: \.\/plugin/, "phải chỉ ra vì sao tag không phải nguồn version");
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

/* --- Nội dung thuần: namingRuleMd() ---------------------------------------- */

test("namingRuleMd: nêu đúng ví dụ mất nghĩa khi bỏ dấu, và tự khai không có hook", async () => {
  const { namingRuleMd } = await import("../src/templates/project.js");
  const content = namingRuleMd();

  assert.match(content, /thuoc/, "phải nêu ví dụ bỏ dấu mất nghĩa");
  assert.match(content, /thuốc.*thước.*thuộc/, "phải liệt kê ba nghĩa để thấy sự mơ hồ");
  assert.match(content, /ruler/, "phải nêu tên tiếng Anh thay thế");
  assert.match(content, /commit message/, "phải vạch ranh giới cho văn xuôi");
  assert.match(content, /không có hook nào chặn/, "luật không cưỡng chế được phải tự khai");
  assert.doesNotMatch(content.split("\n")[0]!, /^---/, "không được là rule path-scoped");
});

/* --- Tích hợp: ganas init sinh .claude/rules/naming.md --------------------- */

test("ganas init: sinh .claude/rules/naming.md khớp namingRuleMd()", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "ganas-init-test-"));
  try {
    const code = await ganasInit({
      positional: [],
      options: { root: tmp, project: "demo" },
      flags: { yes: true },
      passthrough: [],
    });
    assert.equal(code, 0);

    const { namingRuleMd } = await import("../src/templates/project.js");
    const written = await readFile(join(tmp, ".claude", "rules", "naming.md"), "utf8");
    assert.equal(written, namingRuleMd());
  } finally {
    await cleanup(tmp);
  }
});

/* --- Nội dung thuần: guideRuleMd() ----------------------------------------- */

test("guideRuleMd: tên file theo harness, trần 200 dòng, và cảnh báo mất sau khi nén", async () => {
  const { guideRuleMd } = await import("../src/templates/project.js");

  const claude = guideRuleMd("claude-code");
  assert.match(claude, /CLAUDE\.md/, "harness claude-code thì luật phải nói CLAUDE.md");
  assert.match(claude, /200/, "phải nêu trần độ dài của file gốc");
  assert.match(claude, /\.ganas\/modules/, "ranh giới đặt file phải neo vào paths của khối");
  assert.match(claude, /nén/, "phải cảnh báo file ở thư mục con mất sau khi context bị nén");
  assert.match(claude, /không có hook nào chặn/, "luật không cưỡng chế được phải tự khai");

  // Không đóng cứng một tên: đổi harness thì luật đổi theo, và luật phải nói
  // thẳng rằng Claude Code không đọc AGENTS.md.
  const codex = guideRuleMd("codex");
  assert.match(codex, /AGENTS\.md/);
  assert.doesNotMatch(
    codex.split("\n").find((l) => l.includes("hướng dẫn của nó tên"))!,
    /CLAUDE\.md/,
    "dự án khai codex thì file hướng dẫn của nó không phải CLAUDE.md",
  );
  assert.match(guideRuleMd("gemini"), /GEMINI\.md/);
});

/* --- Tích hợp: ganas init sinh .claude/rules/agent-guide.md ---------------- */

test("ganas init: sinh .claude/rules/agent-guide.md khớp guideRuleMd(harness)", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "ganas-init-test-"));
  try {
    const code = await ganasInit({
      positional: [],
      options: { root: tmp, project: "demo", harness: "codex" },
      flags: { yes: true },
      passthrough: [],
    });
    assert.equal(code, 0);

    const { guideRuleMd } = await import("../src/templates/project.js");
    const written = await readFile(join(tmp, ".claude", "rules", "agent-guide.md"), "utf8");
    assert.equal(written, guideRuleMd("codex"));
  } finally {
    await cleanup(tmp);
  }
});

/* --- Bảng harness → tên file hướng dẫn ------------------------------------- */

test("guideFileName: phủ cạn HARNESS, không harness nào rơi vào undefined", async () => {
  const { HARNESS, guideFileName, pointerFileName } = await import("../src/model/config.js");

  for (const h of HARNESS) {
    assert.match(guideFileName(h), /\.md$/, `harness ${h} phải có tên file hướng dẫn`);
  }
  assert.equal(guideFileName("claude-code"), "CLAUDE.md");
  assert.equal(guideFileName("codex"), "AGENTS.md");
  assert.equal(guideFileName("gemini"), "GEMINI.md");

  // Cửa trỏ chỉ cần khi file chính KHÔNG phải AGENTS.md — ghi AGENTS.md đè lên
  // chính nó thì vô nghĩa.
  assert.equal(pointerFileName("claude-code"), "AGENTS.md");
  assert.equal(pointerFileName("codex"), undefined);
  assert.equal(pointerFileName("gemini"), "AGENTS.md");
});

/* --- Tích hợp: init sinh đúng bộ file cho từng harness --------------------- */

test("⭐ ganas init --harness codex: sinh AGENTS.md đầy đủ, KHÔNG sinh CLAUDE.md", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "ganas-init-test-"));
  try {
    const code = await ganasInit({
      positional: [],
      options: { root: tmp, project: "demo", harness: "codex" },
      flags: { yes: true },
      passthrough: [],
    });
    assert.equal(code, 0);

    assert.ok(
      !existsSync(join(tmp, "CLAUDE.md")),
      "Codex không đọc CLAUDE.md — sinh ra là rác nằm trong repo người khác",
    );
    const agents = await readFile(join(tmp, "AGENTS.md"), "utf8");
    assert.match(agents, /ganas next/, "AGENTS.md phải là hướng dẫn ĐẦY ĐỦ, không phải cửa trỏ");

    const config = await readFile(join(tmp, ".ganas", "config.yaml"), "utf8");
    assert.match(config, /^harness: codex$/m);
  } finally {
    await cleanup(tmp);
  }
});

test("ganas init --harness gemini: GEMINI.md đầy đủ + AGENTS.md cửa trỏ (không phải bản sao)", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "ganas-init-test-"));
  try {
    const code = await ganasInit({
      positional: [],
      options: { root: tmp, project: "demo", harness: "gemini" },
      flags: { yes: true },
      passthrough: [],
    });
    assert.equal(code, 0);

    const guide = await readFile(join(tmp, "GEMINI.md"), "utf8");
    const pointer = await readFile(join(tmp, "AGENTS.md"), "utf8");
    assert.match(guide, /ganas next/);
    assert.match(pointer, /GEMINI\.md/, "cửa trỏ phải chỉ đúng tên file thật");
    assert.ok(
      pointer.length < guide.length / 2,
      "cửa trỏ phải NGẮN — chép nội dung sang là tạo nguồn sự thật thứ hai",
    );
  } finally {
    await cleanup(tmp);
  }
});

test("ganas init: --harness không có trong enum thì báo lỗi, không đoán bừa", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "ganas-init-test-"));
  try {
    await assert.rejects(
      () =>
        ganasInit({
          positional: [],
          options: { root: tmp, project: "demo", harness: "vscode" },
          flags: { yes: true },
          passthrough: [],
        }),
      /harness "vscode" không có/,
    );
  } finally {
    await cleanup(tmp);
  }
});
