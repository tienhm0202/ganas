import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { flowContext, nextStep, STAGES } from "../src/flow.js";
import { runShell } from "../src/util/exec.js";
import { cleanup, makeProject } from "./helpers.js";

/**
 * Dòng chảy tồn tại để **ngõ cụt trở thành test đỏ thay vì phát hiện muộn**.
 *
 * `ganas next` từng nói "không còn task nào chưa xong" trên một dự án có ĐÚNG 0
 * task — một trạng thái không có bước kế tiếp, và không ai thấy suốt nhiều mốc
 * cho tới khi đo chi phí khởi động bằng tay.
 *
 * Ba tính chất dưới đây là hợp đồng của dòng chảy. Chúng kiểm chính cấu trúc
 * (mọi chặng phải dùng được) và kiểm đường đi thật (từ repo trống tới hết vòng,
 * không chặng nào bí).
 */

/* --- Tính chất cấu trúc: mọi chặng đều dùng được -------------------------- */

test("⭐ mọi chặng đều có việc để làm — hoặc một lệnh, hoặc một khung dán được", () => {
  const empty = {
    root: null,
    graph: null,
    freshness: new Map(),
    task: null,
    boundTask: null,
    gate: null,
    dirty: false,
  };
  for (const stage of STAGES) {
    const action = stage.action(empty);
    assert.ok(action.trim().length > 0, `chặng ${stage.id} không nói việc phải làm`);
    assert.ok(stage.why.trim().length > 0, `chặng ${stage.id} không nói VÌ SAO nó tồn tại`);
    assert.ok(
      stage.command !== undefined || stage.template !== undefined || stage.id === "close",
      `chặng ${stage.id} không có lệnh lẫn khung dán — người dùng tới đây sẽ bí, ` +
        `và đó đúng là ngõ cụt mà dòng chảy sinh ra để diệt`,
    );
  }
});

test("id chặng không trùng nhau — trùng thì `flow --all` nói dối về vị trí", () => {
  const ids = STAGES.map((s) => s.id);
  assert.deepEqual([...new Set(ids)], ids);
});

/* --- Đường đi thật: repo trống → hết vòng, không chặng nào bí -------------- */

/**
 * Đi hết dòng chảy như một người dùng thật, làm đúng việc mà mỗi chặng bảo.
 * Test này CHÍNH LÀ đặc tả: nếu thêm một chặng mà quên đường đi qua nó, ở đây
 * sẽ kẹt và báo đúng chặng kẹt.
 */
test("⭐ đi trọn dòng chảy từ repo trống — mọi trạng thái đều có bước kế tiếp", async () => {
  const root = await makeProject({});
  try {
    // `makeProject` đã tạo `.ganas/config.yaml`, nên chặng `init` coi như xong.
    await runShell("git init -q && git config user.email t@t.l && git config user.name t", {
      cwd: root,
      timeoutMs: 15_000,
    });
    await mkdir(join(root, "src", "a"), { recursive: true });
    await writeFile(join(root, "src", "a", "index.ts"), "export const a = 1;\n", "utf8");

    const seen: string[] = [];
    // Trần cứng: nhiều hơn số chặng thì chắc chắn đang quẩn tại chỗ.
    for (let guard = 0; guard < STAGES.length * 2; guard++) {
      const ctx = await flowContext(root);
      const step = nextStep(ctx);
      if (!step) break;

      assert.ok(
        !seen.includes(step.stage.id),
        `chặng "${step.stage.id}" lặp lại — làm đúng việc nó bảo mà vẫn không qua được.\n` +
          `Đã đi: ${seen.join(" → ")}`,
      );
      seen.push(step.stage.id);
      await advance(root, step.stage.id);

      // Xong `close` là hết MỘT vòng. Sau đó dòng chảy quay lại `task` cho vòng
      // sau — đó là chu kỳ đúng, không phải kẹt.
      if (step.stage.id === "close") break;
    }

    // Không cần đi qua HẾT mọi chặng (một số đã xong sẵn), nhưng phải tới được
    // chặng cuối — tức là vòng làm việc khép lại được.
    assert.ok(seen.includes("close"), `không tới được cuối vòng. Đã đi: ${seen.join(" → ")}`);
  } finally {
    await cleanup(root);
  }
});

/** Ghi file, tự tạo thư mục — `makeProject` chỉ dựng config, chưa có cây thư mục. */
async function put(root: string, rel: string, content: string): Promise<void> {
  const file = join(root, rel);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, content, "utf8");
}

/** Làm đúng việc mà một chặng yêu cầu — mô phỏng người dùng làm theo hướng dẫn. */
async function advance(root: string, stage: string): Promise<void> {
  const cli = (args: string) =>
    runShell(`npx tsx ${JSON.stringify(join(process.cwd(), "src", "cli.ts"))} -C ${root} ${args}`, {
      cwd: process.cwd(),
      timeoutMs: 120_000,
    });

  switch (stage) {
    case "fix-graph":
      // Dự án vừa `git init` chưa có `.gitignore`, mà trạng thái riêng của phiên
      // (`runs/`, `state.json`) không được commit — validate coi đó là lỗi.
      await writeFile(join(root, ".gitignore"), ".ganas/runs/\n.ganas/state.json\n", "utf8");
      return;

    case "scope":
      await cli(
        `scope new --yes --id P-x --title "Việc đầu" --paths "src/a/**" ` +
          `--accept "test -f src/a/index.ts" --owner "@t"`,
      );
      return;

    case "goal":
      await put(
        root,
        ".ganas/goals/G-001.yaml",
        `id: G-001
title: "Mục tiêu thật"
outcome: "Người dùng thấy khác đi"
acceptance:
  - id: A-1
    kind: command
    run: "test -f src/a/index.ts"
status: active
approved_by: "@t"
approved_at: 2026-01-01T00:00:00Z
`,
        "utf8",
      );
      return;

    case "design":
      await put(
        root,
        ".ganas/designs/D-001.yaml",
        `id: D-001\ntitle: "Cách làm"\nserves: [G-001]\nsummary: "Vì sao chọn cách này"\nstatus: active\n`,
        "utf8",
      );
      return;

    case "evidence": {
      const file = join(root, ".ganas/modules/M-x.yaml");
      const current = (await readFile(file, "utf8")).replace(/verify: \[\]\n/, "");
      await writeFile(
        file,
        `${current}verify:\n  - id: V-x-smoke\n    kind: probe\n    run: "test -f src/a/index.ts"\n`,
        "utf8",
      );
      return;
    }

    case "task":
      await put(
        root,
        ".ganas/tasks/T-001.yaml",
        `id: T-001
title: "Việc cụ thể"
serves: [G-001]
implements: D-001
scope: P-x
status: todo
touches: [M-x]
exit_contract:
  - kind: verification
    target: M-x/V-x-smoke
`,
        "utf8",
      );
      return;

    // Làm ĐÚNG lệnh mà chặng đó in ra, không đoán một lệnh tương đương: `next`
    // còn ghim task vào state, mà `commit` cần biết đang làm task nào.
    case "work":
      await cli("next --no-volatile");
      return;

    case "verify":
      await cli("verify --all");
      return;

    case "commit":
      await runShell("git add -A", { cwd: root, timeoutMs: 15_000 });
      await cli("commit");
      return;

    case "close": {
      const file = join(root, ".ganas/tasks/T-001.yaml");
      const current = await readFile(file, "utf8");
      await writeFile(
        file,
        current.replace("status: todo", "status: done\ndone_at: 2026-01-01T00:00:00Z"),
        "utf8",
      );
      return;
    }

    default:
      throw new Error(
        `chặng "${stage}" chưa có đường đi qua trong test — thêm chặng mà quên ` +
          `dạy cách vượt nó thì dòng chảy có một ngõ cụt chưa ai biết`,
      );
  }
}
