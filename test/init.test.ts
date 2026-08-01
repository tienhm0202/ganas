import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup } from "./helpers.js";
import { run as ganasInit } from "../src/commands/init.js";

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
