/**
 * `V-hook-e2e` — nghiệm thu luồng ghép của P-hook.
 *
 * Mọi test khác của hook (`test/hooks.test.ts`) gọi thẳng
 * `handlers.preToolUse(...)` trong tiến trình test — kiểm được PHÁN QUYẾT
 * nhưng không kiểm được VỎ I/O bọc nó: `readHookInput` đọc stdin thật,
 * `writeHookOutput` ghi JSON ra stdout thật, và `src/commands/hook.ts` là
 * điểm vào mà Claude Code thật sự gọi (`node bin/ganas.mjs hook <event>`,
 * xem `plugin/hooks/hooks.json`).
 *
 * File này spawn CHÍNH `src/cli.ts hook <event>` làm tiến trình con, đẩy JSON
 * vào stdin, đọc JSON ra ở stdout — đúng ranh giới lõi/vỏ `M-hook-policy →
 * M-hook-io` mà D-007 gọi là cạnh đáng tin nhất trong sơ đồ. `npm test` (lệnh
 * cũ của `V-hook-e2e`) chỉ chứng minh 740 test khác còn xanh; nó không chứng
 * minh riêng luồng ghép NÀY còn sống — thay bằng lệnh chung chung đó là một
 * bản ghi nói quá, đúng thứ D-007/T-056 sửa.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

const CLI_PATH = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

/** Dự án tối thiểu, đủ để hook chạy: spine hợp lệ trong phạm vi P-thu. */
async function project(): Promise<string> {
  return makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
  });
}

interface HookRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Gọi ĐÚNG lệnh mà Claude Code gọi thật: `hook <event>` đọc JSON ở stdin, phát
 * JSON ra stdout. Không đi qua `handlers.*` — đây là cả tiến trình `src/cli.ts`.
 */
function runHook(event: string, input: unknown): Promise<HookRun> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", CLI_PATH, "hook", event], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

/* --- Chiều CHẶN: ghi đè file thực thể đã tồn tại dưới .ganas/ ------------- */

test(
  "⭐ e2e: Write đè file task đã tồn tại → tiến trình con thoát 0, stdout là JSON deny",
  { timeout: 30_000 },
  async () => {
    const root = await project();
    try {
      const run = await runHook("pre-tool-use", {
        cwd: root,
        tool_name: "Write",
        tool_input: { file_path: ".ganas/tasks/T-001.yaml" },
      });

      assert.equal(run.code, 0, `hook phải luôn thoát 0 (stderr: ${run.stderr})`);

      let out: Record<string, unknown>;
      try {
        out = JSON.parse(run.stdout) as Record<string, unknown>;
      } catch {
        assert.fail(`stdout không phải JSON hợp lệ: ${JSON.stringify(run.stdout)}`);
      }

      const h = out["hookSpecificOutput"] as Record<string, string>;
      assert.equal(h["permissionDecision"], "deny");
      assert.match(h["permissionDecisionReason"]!, /GHI ĐÈ/);
    } finally {
      await cleanup(root);
    }
  },
);

/* --- Chiều CHO QUA: ghi file thực thể MỚI, chưa tồn tại -------------------- */

test(
  "e2e: Write file task CHƯA tồn tại → tiến trình con thoát 0, stdout là JSON allow ({})",
  { timeout: 30_000 },
  async () => {
    const root = await project();
    try {
      const run = await runHook("pre-tool-use", {
        cwd: root,
        tool_name: "Write",
        tool_input: { file_path: ".ganas/tasks/T-999.yaml" },
      });

      assert.equal(run.code, 0, `hook phải luôn thoát 0 (stderr: ${run.stderr})`);

      let out: Record<string, unknown>;
      try {
        out = JSON.parse(run.stdout) as Record<string, unknown>;
      } catch {
        assert.fail(`stdout không phải JSON hợp lệ: ${JSON.stringify(run.stdout)}`);
      }

      assert.deepEqual(out, {}, "tạo thực thể mới là việc hợp lệ, hook phải cho qua");
    } finally {
      await cleanup(root);
    }
  },
);
