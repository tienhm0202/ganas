import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { run as runNote } from "../src/commands/note.js";
import { loadGraph } from "../src/graph/load.js";
import { hasErrors } from "../src/graph/types.js";
import { applyPrune, notePath, planPrune } from "../src/prune.js";
import { bindSession, markTouched, readState } from "../src/state.js";
import { parseArgs } from "../src/util/args.js";
import { GanasError } from "../src/util/errors.js";
import { runShell } from "../src/util/exec.js";
import { cleanup, goal, makeProject } from "./helpers.js";

/**
 * `ganas note` — xem doc comment ở đầu `src/commands/note.ts` cho lý do tồn
 * tại của lệnh này (làm đường ghi chú đúng RẺ hơn mở NOTES.md ra gõ tay).
 *
 * Bộ test này khoá đúng ba điều task N3 đòi phải đúng:
 *  1. Note KHÔNG BAO GIỜ thành fact/record trong graph.
 *  2. `ganas prune` dọn được file note — đây là test khoá cái BẪY đặt tên: nếu
 *     ai lỡ đổi `notePath()` sang dạng `notes-<sessionId>.md`, phép suy
 *     sessionId-từ-tên-file trong `collectStaleIn()` (src/prune.ts) sẽ ra sai
 *     và test dưới đây phải ĐỎ.
 *  3. Ghi nối thêm (append), không ghi đè.
 */

async function gitProjectWithCommit(files: Record<string, string>): Promise<string> {
  const root = await makeProject(files);
  await runShell("git init -q", { cwd: root });
  await runShell('git config user.email "test@ganas.local"', { cwd: root });
  await runShell('git config user.name "ganas test"', { cwd: root });
  await runShell('git add -A && git commit -q -m "init"', { cwd: root });
  return root;
}

test("note: tạo file mới trong runs/notes/, đủ dấu task/sha/thời điểm/file đã đụng", async () => {
  const root = await gitProjectWithCommit({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await bindSession(root, "sess-1", "T-001");
    await markTouched(root, "sess-1", "src/a.ts");
    await markTouched(root, "sess-1", "src/b.ts");

    const code = await runNote(
      parseArgs(["chưa rõ vì sao webhook retry 3 lần", "--root", root, "--session", "sess-1"]),
    );
    assert.equal(code, 0);

    const path = notePath(root, "sess-1");
    assert.ok(existsSync(path), "phải tạo đúng file mà notePath() trỏ tới");

    const content = await readFile(path, "utf8");
    assert.match(content, /CHƯA KIỂM/, "đầu file phải nói rõ đây là ghi chép chưa kiểm");
    assert.match(content, /chưa rõ vì sao webhook retry 3 lần/);
    assert.match(content, /task: `T-001`/);
    assert.match(content, /sha: `[0-9a-f]{7,}`/);
    assert.match(content, /src\/a\.ts/);
    assert.match(content, /src\/b\.ts/);
    assert.match(content, /## \d{4}-\d{2}-\d{2}T/, "phải có mốc thời gian ISO");
  } finally {
    await cleanup(root);
  }
});

test("note: gọi hai lần → hai mẩu, mẩu đầu không mất", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await bindSession(root, "sess-2", "T-001");

    await runNote(parseArgs(["mẩu thứ nhất", "--root", root, "--session", "sess-2"]));
    await runNote(parseArgs(["mẩu thứ hai", "--root", root, "--session", "sess-2"]));

    const content = await readFile(notePath(root, "sess-2"), "utf8");
    assert.match(content, /mẩu thứ nhất/);
    assert.match(content, /mẩu thứ hai/);
    assert.equal(
      content.match(/CHƯA KIỂM/g)?.length,
      1,
      "đầu file chỉ ghi một lần lúc tạo, không lặp lại mỗi mẩu nối thêm",
    );
  } finally {
    await cleanup(root);
  }
});

test("note: loadGraph sau khi ghi vẫn sạch, note không thành record nào trong graph", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await runNote(parseArgs(["một ghi chú bất kỳ", "--root", root]));

    const graph = await loadGraph(root);
    assert.equal(hasErrors(graph.loadDiagnostics), false, "loadGraph phải chạy sạch sau khi có note");
    assert.equal(graph.goals.size, 1, "dữ liệu thật vẫn nạp đúng, không bị note gây nhiễu");
    assert.equal(graph.tasks.size, 0);
    assert.equal(graph.facts.size, 0);
    assert.equal(graph.claims.size, 0);
    for (const d of graph.loadDiagnostics) {
      assert.ok(!d.file.includes("runs"), `diagnostic không được nhắc tới file trong runs/: ${d.file}`);
    }
  } finally {
    await cleanup(root);
  }
});

test("ganas prune dọn được file note cũ (khoá bẫy: tên file phải khớp phép suy sessionId)", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await runNote(parseArgs(["ghi chú sẽ bị dọn", "--root", root, "--session", "sess-old"]));
    const path = notePath(root, "sess-old");
    assert.ok(existsSync(path));

    // Lùi mtime cho đủ cũ. Note gọi tay không tự bind session trong state.json,
    // nên "sess-old" vốn đã không nằm trong state.sessions.
    const old = new Date(Date.now() - 10 * 86_400_000);
    await utimes(path, old, old);

    const state = await readState(root);
    assert.ok(!state.sessions["sess-old"], "session của note gọi tay không tự bind vào state");

    const graph = await loadGraph(root);
    const plan = await planPrune(root, graph, { olderThanDays: 7 });
    assert.ok(
      plan.staleRuns.some((r) => r.file === path),
      "kế hoạch dọn phải bắt được file note cũ trong runs/notes/",
    );

    await applyPrune(root, plan);
    assert.ok(!existsSync(path), "file note cũ phải bị xoá thật sau applyPrune");
  } finally {
    await cleanup(root);
  }
});

test("note: không có --session vẫn chạy được, không ném lỗi", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const code = await runNote(parseArgs(["ghi chú gọi tay, không có session", "--root", root]));
    assert.equal(code, 0);
    assert.ok(existsSync(notePath(root, "manual")), "phải rơi về nhãn mặc định 'manual'");
  } finally {
    await cleanup(root);
  }
});

test("note: repo không phải git → vẫn ghi được, chỉ thiếu dòng sha", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    assert.ok(!existsSync(join(root, ".git")), "test này phải chạy trên thư mục KHÔNG phải git repo");

    const code = await runNote(parseArgs(["ghi chú trên repo không phải git", "--root", root]));
    assert.equal(code, 0);

    const content = await readFile(notePath(root, "manual"), "utf8");
    assert.doesNotMatch(content, /- sha:/, "không phải git thì không được có dòng sha");
    assert.match(content, /ghi chú trên repo không phải git/);
  } finally {
    await cleanup(root);
  }
});

test("note: thiếu nội dung → GanasError, không ghi file nào", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await assert.rejects(
      () => runNote(parseArgs(["--root", root])),
      (err: unknown) => {
        assert.ok(err instanceof GanasError, "phải là GanasError, không phải lỗi khác");
        return true;
      },
    );
    assert.ok(!existsSync(join(root, ".ganas", "runs")), "không được tạo runs/ khi không có nội dung");
  } finally {
    await cleanup(root);
  }
});
