import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { checkStagedTree } from "../src/commit.js";
import { loadGraph } from "../src/graph/load.js";
import { runShell } from "../src/util/exec.js";
import { cleanup, design, goal, makeProject, scope } from "./helpers.js";

/**
 * `config.build_check` chạy trên cây sắp commit, SO VỚI MỐC chứ không so với
 * "xanh" (PR-007, bản a').
 *
 * Ba điều kiện dưới đây là hợp đồng, không phải chi tiết: thiếu điều kiện
 * "đỏ-sẵn-thì-không-chặn" là một commit hỏng của người khác khoá cả đội, và
 * một dự án cũ chưa bao giờ sạch không commit nổi commit đầu tiên.
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
  ".ganas/tasks/T-001.yaml": `id: T-001
title: "Sửa lõi A"
serves: [G-001]
implements: D-001
scope: P-thu
touches:
  - M-a
exit_contract:
  - kind: command
    run: "true"
`,
};

/** `check.sh` là "lệnh kiểm toàn dự án": xanh khi src/b/ có dấu mốc. */
async function setup(root: string, depContent: string): Promise<void> {
  await mkdir(join(root, "src", "a"), { recursive: true });
  await writeFile(join(root, "src", "a", "index.ts"), "export {};\n", "utf8");
  await mkdir(join(root, "src", "b"), { recursive: true });
  await writeFile(join(root, "src", "b", "dep.ts"), depContent, "utf8");
  // Bất biến CHÉO: dấu mốc mà src/a/ đòi phải có mặt trong src/b/. Hai file, hai
  // khối — đúng hình T-010, nơi khoá enforcement khai một nơi, dùng một nơi.
  await writeFile(join(root, "check.sh"), 'grep -q "$(cat src/a/needs.txt)" src/b/dep.ts\n', "utf8");
  await writeFile(join(root, "src", "a", "needs.txt"), "DUNG_ROI\n", "utf8");
}

async function taskOf(root: string) {
  return (await loadGraph(root)).tasks.get("T-001")!.value;
}

test("⭐ cây stage đỏ mà HEAD XANH → chặn (đúng lớp lỗi đã cắn hai lần)", async () => {
  const root = await gitProject(BASE);
  try {
    await setup(root, "// DUNG_ROI\n");
    await runShell("git add -A && git commit -q -m base", { cwd: root });

    // src/a/ (TRONG ranh giới) đòi một dấu mốc MỚI; src/b/ (NGOÀI ranh giới) đã
    // được sửa cho khớp nhưng KHÔNG được stage. Working tree xanh, cây stage gãy.
    await writeFile(join(root, "src", "a", "needs.txt"), "MOC_MOI\n", "utf8");
    await writeFile(join(root, "src", "b", "dep.ts"), "// MOC_MOI\n", "utf8");
    assert.equal((await runShell("sh check.sh", { cwd: root })).code, 0, "working tree phải xanh");
    await runShell("git add -- src/a", { cwd: root });

    const check = await checkStagedTree(root, await taskOf(root), "sh check.sh");
    assert.equal(check.status, "failed", JSON.stringify(check));
    assert.match(check.failures[0]!.label, /toàn dự án/);
  } finally {
    await cleanup(root);
  }
});

test("⭐ cây stage đỏ mà HEAD CŨNG ĐỎ → KHÔNG chặn, chỉ báo đỏ sẵn", async () => {
  // Không có điều kiện này thì một commit hỏng của người khác khoá cả đội.
  const root = await gitProject(BASE);
  try {
    await setup(root, "// chua co dau moc\n");
    await runShell("git add -A && git commit -q -m base", { cwd: root });

    await writeFile(join(root, "src", "a", "index.ts"), "export const x = 1;\n", "utf8");
    await runShell("git add -- src/a", { cwd: root });

    const check = await checkStagedTree(root, await taskOf(root), "sh check.sh");
    assert.equal(check.status, "baseline-red", JSON.stringify(check));
    assert.match(check.reason ?? "", /HEAD/);
  } finally {
    await cleanup(root);
  }
});

test("⭐ dự án CHƯA BAO GIỜ xanh vẫn commit được commit đầu tiên", async () => {
  // Ca adopt hệ cũ: không có HEAD nào xanh để so, và ganas vẫn phải cài được.
  const root = await gitProject(BASE);
  try {
    await setup(root, "// khong bao gio xanh\n");
    await runShell("git add -A && git commit -q -m base", { cwd: root });
    await writeFile(join(root, "src", "a", "index.ts"), "export const x = 1;\n", "utf8");
    await runShell("git add -- src/a", { cwd: root });

    const check = await checkStagedTree(root, await taskOf(root), "sh check.sh");
    assert.notEqual(check.status, "failed", "không được chặn dự án vốn đã đỏ");
  } finally {
    await cleanup(root);
  }
});

test("lệnh kiểm KHÔNG TỒN TẠI → đỏ ở cả hai cây → không chặn", async () => {
  // Rủi ro "lệnh cấu hình sai": phép so mốc tự nuốt nó, không cần luật riêng.
  const root = await gitProject(BASE);
  try {
    await setup(root, "// DUNG_ROI\n");
    await runShell("git add -A && git commit -q -m base", { cwd: root });
    await writeFile(join(root, "src", "a", "index.ts"), "export const x = 1;\n", "utf8");
    await runShell("git add -- src/a", { cwd: root });

    const check = await checkStagedTree(root, await taskOf(root), "ganas_lenh_khong_ton_tai");
    assert.equal(check.status, "baseline-red", JSON.stringify(check));
  } finally {
    await cleanup(root);
  }
});

test("không khai build_check → không chạy gì thêm, vẫn ok", async () => {
  const root = await gitProject(BASE);
  try {
    await setup(root, "// DUNG_ROI\n");
    await runShell("git add -A && git commit -q -m base", { cwd: root });
    await writeFile(join(root, "src", "a", "index.ts"), "export const x = 1;\n", "utf8");
    await runShell("git add -- src/a", { cwd: root });

    const check = await checkStagedTree(root, await taskOf(root), undefined);
    assert.equal(check.status, "ok", JSON.stringify(check));
  } finally {
    await cleanup(root);
  }
});

test("build_check xanh trên cây stage → ok, và KHÔNG tốn lượt chạy trên HEAD", async () => {
  const root = await gitProject(BASE);
  try {
    await setup(root, "// DUNG_ROI\n");
    await runShell("git add -A && git commit -q -m base", { cwd: root });
    await writeFile(join(root, "src", "a", "index.ts"), "export const x = 1;\n", "utf8");
    await runShell("git add -- src/a", { cwd: root });

    // Lệnh ghi dấu mỗi lần chạy: đường thường phải đúng MỘT lượt.
    const marker = join(root, "dem.txt");
    const check = await checkStagedTree(
      root,
      await taskOf(root),
      `echo x >> ${JSON.stringify(marker)}; sh check.sh`,
    );
    assert.equal(check.status, "ok");

    const { readFile } = await import("node:fs/promises");
    const runs = (await readFile(marker, "utf8")).trim().split("\n").length;
    assert.equal(runs, 1, "cây stage xanh thì không được chạy thêm lượt nào trên HEAD");
  } finally {
    await cleanup(root);
  }
});
