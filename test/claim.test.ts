import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { test } from "node:test";

import { run as scopeRun } from "../src/commands/scope.js";
import {
  claimNextTask,
  claimOwner,
  claimTask,
  releaseClaim,
  releaseClaimsForSession,
} from "../src/graph/claim.js";
import { loadGraph } from "../src/graph/load.js";
import { DIRS, ganasPath } from "../src/graph/paths.js";
import { parseArgs } from "../src/util/args.js";
import { cleanup, makeProject, moduleYaml, scope, task } from "./helpers.js";

/**
 * `claimTask` là hàng rào chống hai phiên cùng nhận một task — trước bản này,
 * `selectNextTask` không biết gì về việc task đã bị phiên khác giữ, nên hai
 * phiên gọi `next` gần như đồng thời sẽ cùng nhận đúng một task.
 */

test("⭐ hai phiên claim cùng lúc cùng một task → chỉ một thắng", async () => {
  const root = await makeProject({});
  try {
    const results = await Promise.all([
      claimTask(root, "T-001", "session-a", 240),
      claimTask(root, "T-001", "session-b", 240),
    ]);
    const wins = results.filter(Boolean).length;
    assert.equal(wins, 1, `đúng 1 phiên phải thắng, thấy ${wins}`);

    const owner = await claimOwner(root, "T-001");
    assert.ok(owner);
    assert.ok(owner.session_id === "session-a" || owner.session_id === "session-b");
  } finally {
    await cleanup(root);
  }
});

test("phiên đã giữ gọi claim lại chính task đó → vẫn true (idempotent)", async () => {
  const root = await makeProject({});
  try {
    assert.equal(await claimTask(root, "T-001", "session-a", 240), true);
    assert.equal(await claimTask(root, "T-001", "session-a", 240), true);
  } finally {
    await cleanup(root);
  }
});

test("claim quá hạn TTL → phiên khác giành lại được", async () => {
  const root = await makeProject({});
  try {
    // Dựng thẳng một claim với `claimed_at` ở quá khứ xa — mô phỏng phiên đã
    // crash từ lâu, thay vì chờ đồng hồ thật trôi qua TTL.
    const file = ganasPath(root, DIRS.locks, "T-001.claim");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({ session_id: "session-a", claimed_at: "2020-01-01T00:00:00.000Z" }),
      "utf8",
    );

    assert.equal(await claimTask(root, "T-001", "session-b", 240), true);

    const owner = await claimOwner(root, "T-001");
    assert.equal(owner?.session_id, "session-b");
  } finally {
    await cleanup(root);
  }
});

test("releaseClaim giải phóng → phiên khác claim được", async () => {
  const root = await makeProject({});
  try {
    await claimTask(root, "T-001", "session-a", 240);
    assert.equal(await claimTask(root, "T-001", "session-b", 240), false);

    await releaseClaim(root, "T-001");
    assert.equal(await claimTask(root, "T-001", "session-b", 240), true);
  } finally {
    await cleanup(root);
  }
});

test("releaseClaimsForSession chỉ giải phóng claim của đúng phiên đó", async () => {
  const root = await makeProject({});
  try {
    await claimTask(root, "T-001", "session-a", 240);
    await claimTask(root, "T-002", "session-b", 240);

    await releaseClaimsForSession(root, "session-a");

    assert.equal(await claimOwner(root, "T-001"), null);
    assert.equal((await claimOwner(root, "T-002"))?.session_id, "session-b");
  } finally {
    await cleanup(root);
  }
});

test("⭐ claimNextTask bỏ qua task đã bị phiên khác giữ, chọn ứng viên kế tiếp", async () => {
  const root = await makeProject({
    ".ganas/scopes/P-thu.yaml": scope("P-thu", { modules: ["M-a"] }),
    ".ganas/modules/M-a.yaml": moduleYaml("M-a"),
    ".ganas/tasks/T-001.yaml": task("T-001"),
    ".ganas/tasks/T-002.yaml": task("T-002"),
  });
  try {
    const graph = await loadGraph(root);

    const first = await claimNextTask(graph, root, "session-a");
    assert.ok(first);

    const second = await claimNextTask(graph, root, "session-b");
    assert.ok(second);
    assert.notEqual(second.task.value.id, first.task.value.id);

    // Cả hai task đều đã bị giữ — phiên thứ ba không nhận được gì.
    const third = await claimNextTask(graph, root, "session-c");
    assert.equal(third, null);
  } finally {
    await cleanup(root);
  }
});

/**
 * `scope new` tạo file mới bằng `wx` (loại trừ nguyên tử) thay vì ghi đè im
 * lặng — hai phiên chọn trùng `--id` cùng lúc phải có đúng một cái thắng,
 * cái thua phải báo lỗi rõ ràng thay vì mất dữ liệu của cái thắng.
 */
test("⭐ hai `scope new` cùng --id cùng lúc → một thắng, một báo lỗi rõ ràng", async () => {
  const root = await makeProject({});
  try {
    const argvFor = (title: string) =>
      parseArgs([
        "new",
        "--yes",
        "--root",
        root,
        "--id",
        "P-dua",
        "--title",
        title,
        "--paths",
        "src/a/**",
        "--accept",
        "true",
        "--owner",
        "@t",
      ]);

    const results = await Promise.allSettled([
      scopeRun(argvFor("Việc A")),
      scopeRun(argvFor("Việc B")),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "đúng 1 lệnh phải thành công");
    assert.equal(rejected.length, 1, "đúng 1 lệnh phải bị từ chối");

    const reason: unknown = rejected[0]?.reason;
    assert.ok(reason instanceof Error);
    assert.match(reason.message, /đã tồn tại/);
  } finally {
    await cleanup(root);
  }
});
