import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { run as runCommit } from "../src/commands/commit.js";
import { checkStagedTree } from "../src/commit.js";
import { loadGraph } from "../src/graph/load.js";
import type { Argv } from "../src/util/args.js";
import { runShell } from "../src/util/exec.js";
import { cleanup, design, goal, makeProject, scope } from "./helpers.js";

/**
 * `ganas commit` chấm lại `exit_contract` trên CÂY SẮP ĐƯỢC COMMIT (D-005).
 *
 * Ca phải dựng lại được là ca đã xảy ra thật ở T-010 (`commit:fc99e87`): file
 * TRONG ranh giới của task phụ thuộc một file NGOÀI ranh giới đang sửa dở.
 * Working tree có đủ cả hai nên gate xanh; commit chỉ mang một nửa nên đỏ.
 * Không dựng lại được ca đó thì test này không chứng minh được gì.
 */

async function gitProject(files: Record<string, string>): Promise<string> {
  const root = await makeProject(files);
  await runShell("git init -q", { cwd: root });
  await runShell('git config user.email "test@ganas.local"', { cwd: root });
  await runShell('git config user.name "ganas test"', { cwd: root });
  await runShell("git config commit.gpgsign false", { cwd: root });
  return root;
}

const BASE = {
  ".ganas/goals/G-001.yaml": goal(),
  ".ganas/designs/D-001.yaml": design(),
  ".ganas/scopes/P-thu.yaml": scope(),
  ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối A"
scope: P-thu
nature: code
paths: ["src/a/**"]
`,
};

/**
 * Task chỉ chạm `src/a/**`, và tiêu chí KHÔNG gọi tên `src/b/dep.ts`.
 *
 * Chi tiết này quyết định cả bài test: `contractPathRefs()` (src/boundary.ts)
 * đã kéo mọi đường dẫn mà lệnh NHẮC TỚI vào ranh giới, nên một tiêu chí
 * `grep ... src/b/dep.ts` sẽ tự lôi file đó vào commit và không tái hiện được
 * lỗi. T-010 hỏng vì phụ thuộc NGẦM — `npm run typecheck` không nhắc tên
 * `src/model/config.ts`, nó chỉ được `import`. Ở đây `check.sh` đóng vai đó.
 */
const TASK = `id: T-001
title: "Sửa lõi A"
serves: [G-001]
implements: D-001
scope: P-thu
touches:
  - M-a
exit_contract:
  - kind: command
    run: "sh check.sh"
`;

function argv(root: string, flags: Record<string, boolean> = {}): Argv {
  return {
    positional: ["T-001"],
    options: { root },
    multi: {},
    flags: { ...flags },
    passthrough: [],
  };
}

async function captureStdout<T>(fn: () => Promise<T>): Promise<{ result: T; out: string }> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: unknown }).write = (chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  };
  try {
    return { result: await fn(), out: chunks.join("") };
  } finally {
    (process.stdout as { write: unknown }).write = original;
  }
}

/** `src/a/` trong ranh giới; `src/b/` NGOÀI ranh giới, chưa commit. */
async function setupSplitTree(root: string, depContent: string): Promise<void> {
  await mkdir(join(root, "src", "a"), { recursive: true });
  await writeFile(join(root, "src", "a", "index.ts"), "export {};\n", "utf8");
  await mkdir(join(root, "src", "b"), { recursive: true });
  await writeFile(join(root, "src", "b", "dep.ts"), depContent, "utf8");
  // Phụ thuộc NGẦM: tiêu chí gọi `check.sh`, còn `check.sh` mới đọc src/b/.
  await writeFile(join(root, "check.sh"), "grep -q DUNG_ROI src/b/dep.ts\n", "utf8");
}

/* --- checkStagedTree: hàm lõi --------------------------------------------- */

test("file ngoài ranh giới CHƯA commit → cây đã stage đỏ, dù working tree xanh", async () => {
  const root = await gitProject({ ...BASE, ".ganas/tasks/T-001.yaml": TASK });
  try {
    await setupSplitTree(root, "// DUNG_ROI\n");

    // Working tree xanh.
    assert.equal((await runShell("sh check.sh", { cwd: root })).code, 0);

    // Chỉ stage phần trong ranh giới — đúng cái `ganas commit` làm.
    await runShell("git add -- .ganas src/a check.sh", { cwd: root });

    const graph = await loadGraph(root);
    const task = graph.tasks.get("T-001")!.value;
    const check = await checkStagedTree(root, task);

    assert.equal(check.status, "failed", `phải đỏ trên cây đã stage: ${JSON.stringify(check)}`);
    assert.match(check.failures[0]!.label, /sh check\.sh/);
  } finally {
    await cleanup(root);
  }
});

test("file ngoài ranh giới ĐÃ commit từ trước → cây đã stage xanh", async () => {
  const root = await gitProject({ ...BASE, ".ganas/tasks/T-001.yaml": TASK });
  try {
    await setupSplitTree(root, "// DUNG_ROI\n");
    await runShell("git add -A && git commit -q -m base", { cwd: root });
    await writeFile(join(root, "src", "a", "index.ts"), "export const x = 1;\n", "utf8");
    await runShell("git add -- src/a", { cwd: root });

    const graph = await loadGraph(root);
    const check = await checkStagedTree(root, graph.tasks.get("T-001")!.value);

    assert.equal(check.status, "ok", JSON.stringify(check));
  } finally {
    await cleanup(root);
  }
});

test("không phải repo git → skipped kèm lý do, KHÔNG âm thầm coi như xanh", async () => {
  const root = await makeProject({ ...BASE, ".ganas/tasks/T-001.yaml": TASK });
  try {
    const graph = await loadGraph(root);
    const check = await checkStagedTree(root, graph.tasks.get("T-001")!.value);

    assert.equal(check.status, "skipped");
    assert.ok(check.reason, "skipped phải nói vì sao");
  } finally {
    await cleanup(root);
  }
});

/* --- Nối vào `ganas commit` ------------------------------------------------ */

test("⭐ ganas commit TỪ CHỐI khi cây sắp commit đỏ, và không tạo commit nào", async () => {
  const root = await gitProject({ ...BASE, ".ganas/tasks/T-001.yaml": TASK });
  try {
    // Bản đã commit CHƯA có dấu mốc — đúng hình T-010: khoá enforcement mới
    // chưa vào git, chỉ có trong working tree.
    await setupSplitTree(root, "// chua co gi\n");
    await runShell("git add -A && git commit -q -m base", { cwd: root });

    // Sửa cả hai: src/a/ TRONG ranh giới, src/b/ NGOÀI ranh giới. Tiêu chí của
    // task phụ thuộc src/b/ nên gate (working tree) xanh, còn cây sắp commit —
    // chỉ có src/a/ mới — thì đỏ.
    await writeFile(join(root, "src", "a", "index.ts"), "export const x = 1;\n", "utf8");
    await writeFile(join(root, "src", "b", "dep.ts"), "// DUNG_ROI\n", "utf8");

    assert.equal(
      (await runShell("sh check.sh", { cwd: root })).code,
      0,
      "working tree phải xanh, nếu không thì test đang kiểm nhầm thứ",
    );

    const before = (await runShell("git rev-parse HEAD", { cwd: root })).stdout.trim();

    await assert.rejects(
      () => captureStdout(() => runCommit(argv(root))),
      /ĐỎ trên cây sắp được commit|đỏ trên cây/i,
    );

    const after = (await runShell("git rev-parse HEAD", { cwd: root })).stdout.trim();
    assert.equal(after, before, "không được tạo commit nào");

    const taskFile = await readFile(join(root, ".ganas", "tasks", "T-001.yaml"), "utf8");
    assert.doesNotMatch(taskFile, /status:\s*done/, "task chưa xong thì không được đánh dấu done");
  } finally {
    await cleanup(root);
  }
});

test("--no-recheck vẫn commit được — cửa thoát có, nhưng phải gõ ra", async () => {
  const root = await gitProject({ ...BASE, ".ganas/tasks/T-001.yaml": TASK });
  try {
    await setupSplitTree(root, "// chua co gi\n");
    await runShell("git add -A && git commit -q -m base", { cwd: root });
    await writeFile(join(root, "src", "a", "index.ts"), "export const x = 1;\n", "utf8");
    await writeFile(join(root, "src", "b", "dep.ts"), "// DUNG_ROI\n", "utf8");

    const before = (await runShell("git rev-parse HEAD", { cwd: root })).stdout.trim();
    // Khoá đúng mà `parseArgs` sinh ra cho token `--no-recheck` là `recheck: false`,
    // KHÔNG phải `"no-recheck": true` — xem `src/util/args.ts:77-79` và T-100.
    await captureStdout(() => runCommit(argv(root, { recheck: false })));
    const after = (await runShell("git rev-parse HEAD", { cwd: root })).stdout.trim();

    assert.notEqual(after, before, "--no-recheck phải commit thật");
  } finally {
    await cleanup(root);
  }
});
