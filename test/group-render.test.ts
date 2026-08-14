import assert from "node:assert/strict";
import { test } from "node:test";

import { loadGraph } from "../src/graph/load.js";
import { rankedCandidates } from "../src/graph/select.js";
import type { Graph } from "../src/graph/types.js";
import { renderGroupedByScope } from "../src/render/group.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

/**
 * N4: helper dùng chung để in danh sách task đã sắp xếp sẵn thành cây
 * `Scope → Design → Task`, dùng lại ở `commands/next.ts` và `render/brief.ts`.
 */

/** Dựng một `Sourced<Task>` giả (dòng "id — title" cơ bản, không có đuôi). */
function baseLine(t: { id: string; title: string }): string {
  return `${t.id} — ${t.title}`;
}

async function loadRanked(root: string): Promise<{ graph: Graph; ranked: ReturnType<typeof rankedCandidates> }> {
  const graph = await loadGraph(root);
  return { graph, ranked: rankedCandidates(graph) };
}

test("hai task khác scope → in ra hai đầu mục scope", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-a.yaml": scope("P-a", { modules: ["M-a"] }),
    ".ganas/scopes/P-b.yaml": scope("P-b", { modules: ["M-b"] }),
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", { scope: "P-a" }),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", { scope: "P-b", paths: ["src/b/**"] }),
    ".ganas/tasks/T-001.yaml": task("T-001", { scope: "P-a" }),
    ".ganas/tasks/T-002.yaml": task("T-002", { scope: "P-b" }),
  });
  try {
    const { graph, ranked } = await loadRanked(root);
    const out = renderGroupedByScope(
      graph,
      ranked,
      (c) => c.task.value,
      (c) => baseLine(c.task.value),
    );
    assert.match(out, /^P-a — Phạm vi thử$/m, "phải có đầu mục scope P-a");
    assert.match(out, /^P-b — Phạm vi thử$/m, "phải có đầu mục scope P-b");
    assert.match(out, /T-001/);
    assert.match(out, /T-002/);
  } finally {
    await cleanup(root);
  }
});

test("hai task cùng scope nhưng khác design → một đầu mục scope, hai đầu mục design", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design("D-001"),
    ".ganas/designs/D-002.yaml": design("D-002"),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": task("T-001", { implements: "D-001" }),
    ".ganas/tasks/T-002.yaml": task("T-002", { implements: "D-002" }),
  });
  try {
    const { graph, ranked } = await loadRanked(root);
    const out = renderGroupedByScope(
      graph,
      ranked,
      (c) => c.task.value,
      (c) => baseLine(c.task.value),
    );
    const scopeHeaders = out.match(/^P-thu — .*$/gm) ?? [];
    assert.equal(scopeHeaders.length, 1, "một scope, dù có hai design bên trong, chỉ một đầu mục");
    assert.match(out, /^ {2}D-001 — Design thử$/m);
    assert.match(out, /^ {2}D-002 — Design thử$/m);
  } finally {
    await cleanup(root);
  }
});

test("một task duy nhất vẫn in đầu mục scope và design (không đặc cách)", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": task("T-001"),
  });
  try {
    const { graph, ranked } = await loadRanked(root);
    const out = renderGroupedByScope(
      graph,
      ranked,
      (c) => c.task.value,
      (c) => baseLine(c.task.value),
    );
    assert.match(out, /^P-thu — Phạm vi thử$/m);
    assert.match(out, /^ {2}D-001 — Design thử$/m);
    assert.match(out, /^ {4}T-001 — Task thử$/m);
  } finally {
    await cleanup(root);
  }
});

test("⭐ thứ tự task bên trong nhóm khớp thứ tự rankedCandidates trả về", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    // Cả ba cùng scope + design → một nhóm duy nhất; thứ tự BÊN TRONG nhóm
    // phải là thứ tự rankedCandidates, KHÔNG phải thứ tự id (T-003 việc dở
    // phải lên đầu dù đứng cuối theo alphabet — đây mới là chỗ khoá được
    // "không đổi thứ tự ưu tiên").
    ".ganas/tasks/T-001.yaml": task("T-001"),
    ".ganas/tasks/T-002.yaml": task("T-002"),
    ".ganas/tasks/T-003.yaml": task("T-003", { extra: "status: in_progress" }).replace(
      "status: todo\n",
      "",
    ),
  });
  try {
    const { graph, ranked } = await loadRanked(root);
    const expectedOrder = ranked.map((c) => c.task.value.id);
    assert.deepEqual(
      expectedOrder,
      ["T-003", "T-001", "T-002"],
      "chốt trước: rankedCandidates phải đặt việc dở lên đầu",
    );

    const out = renderGroupedByScope(
      graph,
      ranked,
      (c) => c.task.value,
      (c) => baseLine(c.task.value),
    );
    const positions = expectedOrder.map((id) => out.indexOf(`${id} — `));
    assert.ok(
      positions.every((p) => p >= 0),
      `mọi task phải xuất hiện trong kết quả in:\n${out}`,
    );
    assert.deepEqual(
      [...positions].sort((a, b) => a - b),
      positions,
      `thứ tự in ra phải khớp đúng thứ tự rankedCandidates (${expectedOrder.join(", ")}), đã in:\n${out}`,
    );
  } finally {
    await cleanup(root);
  }
});

test("scope treo (không có trong graph) → không ném lỗi, vẫn in id trần rồi đi tiếp", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    // Không có file .ganas/scopes/P-treo.yaml — scope này treo có chủ đích.
    ".ganas/tasks/T-001.yaml": task("T-001", { scope: "P-treo" }),
  });
  try {
    const graph = await loadGraph(root);
    const sourced = graph.tasks.get("T-001")!;
    assert.doesNotThrow(() => {
      const out = renderGroupedByScope(
        graph,
        [sourced],
        (s) => s.value,
        (s) => baseLine(s.value),
      );
      assert.match(out, /^P-treo$/m, "scope treo: in id trần, không kèm title");
      assert.match(out, /T-001/);
    });
  } finally {
    await cleanup(root);
  }
});
