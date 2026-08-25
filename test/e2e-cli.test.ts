import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { runShell } from "../src/util/exec.js";
import { cleanup } from "./helpers.js";

/**
 * Nghiệm thu luồng ghép của P-cli (`V-cli-e2e`).
 *
 * Bản cũ khai `run: "npm test"` cho tiêu chí này — một lệnh CHUNG CHUNG, không
 * kiểm riêng gì P-cli, nên `ganas verify` tự gắn nhãn "chưa chứng minh được là
 * có thể fail" (đúng: 740 test khác cũng làm `npm test` đỏ, không phải mỗi
 * P-cli). Test này thay nó: đi qua đúng CHUỖI LỆNH người dùng CLI thật sự gõ —
 * `init` → `scope new` → `next` → `gate` → `commit` — bằng subprocess `ganas`
 * thật (không gọi thẳng hàm `run()` của từng lệnh), trên một project tạm dựng
 * từ đầu, và khẳng định kết quả ở TỪNG chặng. Đổi sai một chặng (vd `gate` báo
 * đạt trước khi tiêu chí thật sự đạt) thì test này đỏ — đó là bằng chứng cho
 * nhãn "đã chứng minh được là có thể fail".
 *
 * Khuôn dựng project tạm mượn từ `test/flow.test.ts` (đường đi thật của dòng
 * chảy) và `test/helpers.ts` (tiện ích thư mục tạm) — không phát minh lại.
 */

const CLI = join(process.cwd(), "src", "cli.ts");

interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Gọi `ganas <args>` như một subprocess thật, đúng cách người dùng gõ. */
function cli(root: string, args: string): Promise<CliResult> {
  return runShell(`npx tsx ${JSON.stringify(CLI)} -C ${JSON.stringify(root)} ${args}`, {
    cwd: process.cwd(),
    timeoutMs: 120_000,
  });
}

test(
  "⭐ P-cli đầu-cuối: init → scope new → next → gate → commit, mỗi chặng đúng " +
    "như CLI thật in ra",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "ganas-e2e-cli-"));
    try {
      // Git thật: `ganas init` cần biết có git để bật hook commit-msg, và
      // `ganas commit` ở cuối chuỗi cần một repo thật để commit vào.
      await runShell("git init -q && git config user.email t@t.l && git config user.name t", {
        cwd: root,
        timeoutMs: 15_000,
      });

      /* --- 1. init: dự án trần → .ganas/ đầy đủ, sinh bằng CLI thật --------- */

      const init = await cli(root, "init --yes --project demo --owner @tien");
      assert.equal(init.code, 0, `ganas init thất bại:\n${init.stderr || init.stdout}`);

      const config = await readFile(join(root, ".ganas", "config.yaml"), "utf8");
      assert.match(config, /project: "demo"/, "init phải ghi đúng tên dự án vào config.yaml");
      assert.ok(
        existsSync(join(root, "CLAUDE.md")),
        "init phải sinh CLAUDE.md (harness mặc định claude-code)",
      );

      // Dự án vừa `git init` chưa có `.gitignore` — `ganas validate` coi trạng
      // thái riêng của phiên (runs/, .locks/, state.json) chưa ignore là lỗi.
      await writeFile(
        join(root, ".gitignore"),
        ".ganas/runs/\n.ganas/.locks/\n.ganas/state.json\n",
        "utf8",
      );

      /* --- 2. scope new: sinh phạm vi + khối THẬT qua CLI, không viết tay YAML */

      await mkdir(join(root, "src", "a"), { recursive: true });
      await writeFile(join(root, "src", "a", "index.ts"), "export const a = 1;\n", "utf8");

      const scopeNew = await cli(
        root,
        `scope new --yes --id P-x --title "Việc đầu" --paths "src/a/**" ` +
          `--accept "test -f src/a/index.ts" --owner "@tien"`,
      );
      assert.equal(scopeNew.code, 0, `ganas scope new thất bại:\n${scopeNew.stderr || scopeNew.stdout}`);
      assert.match(scopeNew.stdout, /Đã tạo phạm vi P-x/);

      const scopeFile = await readFile(join(root, ".ganas/scopes/P-x.yaml"), "utf8");
      assert.match(scopeFile, /id: P-x/);
      const moduleFile = await readFile(join(root, ".ganas/modules/M-x.yaml"), "utf8");
      assert.match(moduleFile, /scope: P-x/, "khối sinh ra phải khai scope khớp hai chiều với P-x");

      // `scope new` chưa gắn bằng chứng cho khối — thêm probe tối thiểu, như
      // chặng "evidence" của flow.test.ts, để task chạm M-x có chỗ trỏ vào.
      await writeFile(
        join(root, ".ganas/modules/M-x.yaml"),
        moduleFile.replace(
          /verify: \[\]\n/,
          `verify:\n  - id: V-x-smoke\n    kind: probe\n    run: "test -f src/a/index.ts"\n`,
        ),
        "utf8",
      );

      // goal/design/task: chưa có lệnh CLI nào sinh nội dung nghiệp vụ này —
      // viết tay như người dùng thật viết, giống `advance()` của flow.test.ts.
      await writeFile(
        join(root, ".ganas/goals/G-001.yaml"),
        `id: G-001
title: "Mục tiêu thật"
outcome: "Người dùng thấy khác đi"
acceptance:
  - id: A-1
    kind: command
    run: "test -f src/a/index.ts"
status: active
approved_by: "@tien"
approved_at: 2026-01-01T00:00:00Z
`,
        "utf8",
      );
      await writeFile(
        join(root, ".ganas/designs/D-001.yaml"),
        `id: D-001
title: "Cách làm"
serves: [G-001]
summary: "Vì sao chọn cách này"
status: active
`,
        "utf8",
      );
      // Tiêu chí trỏ vào một file CHƯA tồn tại — cốt để chứng minh gate THẬT SỰ
      // báo được đỏ trước khi việc xong, không phải một tiêu chí đã xanh sẵn
      // từ lúc tạo task (đó sẽ là một test không bao giờ fail được).
      await writeFile(
        join(root, ".ganas/tasks/T-001.yaml"),
        `id: T-001
title: "Việc cụ thể"
serves: [G-001]
implements: D-001
scope: P-x
status: todo
touches: [M-x]
model: verifier
exit_contract:
  - kind: verification
    target: M-x/V-x-smoke
  - kind: command
    run: "test -f src/a/done.marker"
`,
        "utf8",
      );

      /* --- 3. validate: graph vừa dựng bằng CLI + tay phải khớp schema ------ */

      const validate = await cli(root, "validate");
      assert.equal(
        validate.code,
        0,
        `ganas validate báo lỗi trên graph vừa dựng:\n${validate.stdout}\n${validate.stderr}`,
      );

      /* --- 4. next: bind đúng task vừa tạo qua claim thật ------------------- */

      const next = await cli(root, "next --no-volatile");
      assert.equal(next.code, 0, `ganas next thất bại:\n${next.stderr || next.stdout}`);
      assert.match(next.stdout, /T-001/, `next không in đúng task đã bind:\n${next.stdout}`);

      /* --- 5. gate: TRƯỚC khi thoả tiêu chí — phải báo ĐỎ, không nói dối ---- */
      // Task khai HAI tiêu chí: `kind: verification` trỏ vào M-x/V-x-smoke
      // (chưa từng `ganas verify` nên chưa "fresh") và `kind: command` trỏ vào
      // một file chưa tồn tại. Cả hai đều thật sự chưa đạt lúc này.

      const gateBefore = await cli(root, "gate T-001");
      assert.equal(
        gateBefore.code,
        1,
        `gate phải báo CHƯA đạt khi tiêu chí thật sự chưa thoả:\n${gateBefore.stdout}`,
      );
      assert.match(gateBefore.stdout, /Còn 2 tiêu chí chưa đạt/);

      /* --- 6. làm việc thật + verify: tạo file, RỒI ghi bằng chứng vào sổ cái */
      // Thứ tự có ý nghĩa: freshness tính theo dấu vết trên đĩa TẠI LÚC verify.
      // Đổi file sau khi verify thì bằng chứng đó hoá cũ ngay — verify phải
      // chạy SAU khi việc đã xong, đúng thứ tự người dùng thật làm.

      await writeFile(join(root, "src", "a", "done.marker"), "", "utf8");
      const verify = await cli(root, "verify --all");
      assert.equal(verify.code, 0, `ganas verify thất bại:\n${verify.stdout}\n${verify.stderr}`);

      /* --- 7. gate: SAU khi thoả cả hai tiêu chí thật — phải báo XANH ------- */

      const gateAfter = await cli(root, "gate T-001");
      assert.equal(
        gateAfter.code,
        0,
        `gate vẫn báo chưa đạt dù tiêu chí đã thoả trên đĩa:\n${gateAfter.stdout}`,
      );
      assert.match(gateAfter.stdout, /Mọi tiêu chí chấm tự động đều đạt/);

      /* --- 8. commit: git add rồi commit thật, message + git log phải khớp - */

      await runShell("git add -A", { cwd: root, timeoutMs: 15_000 });
      const commit = await cli(root, "commit T-001");
      assert.equal(commit.code, 0, `ganas commit thất bại:\n${commit.stdout}\n${commit.stderr}`);
      assert.match(commit.stdout, /Đã commit cho T-001/);

      const log = await runShell("git log --oneline -1", { cwd: root, timeoutMs: 10_000 });
      assert.match(log.stdout, /T-001/, `commit message phải nhắc T-001:\n${log.stdout}`);

      const taskAfter = await readFile(join(root, ".ganas/tasks/T-001.yaml"), "utf8");
      assert.match(taskAfter, /status: done/, "commit phải tự đóng task khi gate đã đạt");

      // Commit thứ hai trên cây sạch: không có gì để commit, CLI phải nói vậy
      // thay vì tạo một commit rỗng hay báo lỗi mập mờ.
      const commitAgain = await cli(root, "commit T-001");
      assert.equal(commitAgain.code, 0);
      assert.match(commitAgain.stdout, /Không có gì để commit/);
    } finally {
      await cleanup(root);
    }
  },
);
