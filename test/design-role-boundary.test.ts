import assert from "node:assert/strict";
import { test } from "node:test";

import type { DriftState } from "../src/boundary.js";
import { formatDesignDriftWarning, taskBoundary } from "../src/boundary.js";
import { loadGraph } from "../src/graph/load.js";
import type { Graph } from "../src/graph/types.js";
import type { Freshness } from "../src/model/index.js";
import { zTask } from "../src/model/index.js";
import { cleanup, goal, makeProject, moduleYaml, scope } from "./helpers.js";

/*
 * T-070, hai vế:
 *
 * 1. `verificationPathRefs()` phải nhận dạng target thứ tư — `D-x/A-y`, bản vẽ
 *    của chặng. Thiếu nhánh đó thì file mà PROBE CỦA BẢN VẼ chạy không vào
 *    `taskBoundary`, `ganas commit` không `git add` nó, và gate xanh ở máy tác
 *    giả nhưng đỏ ở máy khác — đúng lớp lỗi đã vấp ba lần (T-065, T-061,
 *    T-062) và là lý do `verificationPathRefs` tồn tại.
 * 2. `formatDesignDriftWarning()` phải nói ra khi code đã lệch bản vẽ, và nói
 *    HAI câu khác nghĩa: "đổi bản vẽ trong task xây" (definition_changed +
 *    role build) khác hẳn "code lệch bản vẽ" (stale/failing, mọi vai).
 */

const DESIGN_WITH_PROBES = `id: D-010
title: "Chặng thử"
serves:
  - G-001
summary: "Cách tiếp cận"
status: active
artifacts:
  - id: A-mot
    kind: function
    module: M-a
    shape: "(x: string) => number"
    probe:
      run: "npx tsx --test test/e2e/artifact-mot.test.ts"
      expect: exit_zero
  - id: A-hai
    kind: schema
    module: M-a
    shape: "table users (id uuid)"
    probe:
      run: "npx tsx --test test/e2e/artifact-hai.test.ts"
      expect: exit_zero
`;

async function projectWithDesign(): Promise<string> {
  return makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-010.yaml": DESIGN_WITH_PROBES,
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
}

function buildTask(opts: {
  role?: "design" | "build";
  target?: string;
  touches?: string[];
}): ReturnType<typeof zTask.parse> {
  return zTask.parse({
    id: "T-070",
    title: "t",
    serves: ["G-001"],
    implements: "D-010",
    scope: "P-thu",
    role: opts.role ?? "build",
    touches: opts.touches ?? ["M-a"],
    exit_contract: opts.target
      ? [{ kind: "verification", target: opts.target }]
      : [{ kind: "command", run: "true" }],
  });
}

/** Một dòng độ tươi dựng tay — hàm cần `Map`, không cần sổ cái thật. */
function state(freshness: Freshness, reason: string): DriftState {
  return { freshness, reason };
}

/* --- Vế 1: ranh giới code ------------------------------------------------- */

test("taskBoundary: target D-x/A-y — file probe của BẢN VẼ phải vào ranh giới", async () => {
  const root = await projectWithDesign();
  try {
    const graph = await loadGraph(root);
    const boundary = taskBoundary(buildTask({ target: "D-010/A-mot" }), graph);
    assert.ok(
      boundary.includes("test/e2e/artifact-mot.test.ts"),
      `boundary phải chứa file probe của bản vẽ, thực tế: ${JSON.stringify(boundary)}`,
    );
    assert.ok(
      !boundary.includes("test/e2e/artifact-hai.test.ts"),
      "target trỏ đúng một bản vẽ thì không được kéo theo bản vẽ khác",
    );
    assert.ok(boundary.includes("src/a/**"));
  } finally {
    await cleanup(root);
  }
});

test("taskBoundary: target D-x trần — gộp probe của MỌI bản vẽ của chặng", async () => {
  const root = await projectWithDesign();
  try {
    const graph = await loadGraph(root);
    const boundary = taskBoundary(buildTask({ target: "D-010" }), graph);
    assert.ok(boundary.includes("test/e2e/artifact-mot.test.ts"));
    assert.ok(
      boundary.includes("test/e2e/artifact-hai.test.ts"),
      `dạng trần phải gom mọi bản vẽ, thực tế: ${JSON.stringify(boundary)}`,
    );
  } finally {
    await cleanup(root);
  }
});

test("taskBoundary: target D-x/A-y không tồn tại — không throw, không thêm gì", async () => {
  const root = await projectWithDesign();
  try {
    const graph = await loadGraph(root);
    const boundary = taskBoundary(buildTask({ target: "D-010/A-khong-co" }), graph);
    assert.deepEqual(boundary, ["src/a/**"]);
  } finally {
    await cleanup(root);
  }
});

/* --- Vế 2: cảnh báo lệch bản vẽ ------------------------------------------- */

async function withGraph<T>(fn: (graph: Graph) => T): Promise<T> {
  const root = await projectWithDesign();
  try {
    return fn(await loadGraph(root));
  } finally {
    await cleanup(root);
  }
}

test("formatDesignDriftWarning: role build + definition_changed ⇒ nói đã ĐỔI BẢN VẼ", async () => {
  await withGraph((graph) => {
    const out = formatDesignDriftWarning(
      buildTask({ role: "build" }),
      graph,
      new Map([["D-010/A-mot", state("definition_changed", "định nghĩa đã đổi")]]),
    );
    assert.match(out, /ĐỔI BẢN VẼ/);
    assert.match(out, /D-010\/A-mot/);
    assert.match(out, /role: design/);
    assert.ok(out.startsWith("\n") && out.endsWith("\n"), "chuỗi khác rỗng phải mở/đóng bằng \\n");
  });
});

test("formatDesignDriftWarning: role design + definition_changed ⇒ KHÔNG nói câu đó", async () => {
  await withGraph((graph) => {
    const out = formatDesignDriftWarning(
      buildTask({ role: "design" }),
      graph,
      new Map([["D-010/A-mot", state("definition_changed", "định nghĩa đã đổi")]]),
    );
    assert.equal(out, "", `vai design đổi bản vẽ là đúng việc, thực tế: ${JSON.stringify(out)}`);
  });
});

for (const role of ["build", "design"] as const) {
  test(`formatDesignDriftWarning: stale ⇒ "code đã lệch bản vẽ" cho vai ${role}`, async () => {
    await withGraph((graph) => {
      const out = formatDesignDriftWarning(
        buildTask({ role }),
        graph,
        new Map([["D-010/A-mot", state("stale", "src/a/x.ts đã sửa")]]),
      );
      assert.match(out, /code đã lệch bản vẽ/);
      assert.match(out, /src\/a\/x\.ts đã sửa/);
      assert.match(out, /ganas design check D-010/);
      assert.doesNotMatch(out, /ĐỔI BẢN VẼ/);
    });
  });

  test(`formatDesignDriftWarning: failing ⇒ "code đã lệch bản vẽ" cho vai ${role}`, async () => {
    await withGraph((graph) => {
      const out = formatDesignDriftWarning(
        buildTask({ role }),
        graph,
        new Map([["D-010/A-hai", state("failing", "probe trượt lần gần nhất")]]),
      );
      assert.match(out, /code đã lệch bản vẽ/);
      assert.match(out, /D-010\/A-hai/);
      assert.match(out, /probe trượt lần gần nhất/);
    });
  });
}

test("formatDesignDriftWarning: mọi bản vẽ đều fresh ⇒ trả chuỗi rỗng", async () => {
  await withGraph((graph) => {
    const out = formatDesignDriftWarning(
      buildTask({}),
      graph,
      new Map([
        ["D-010/A-mot", state("fresh", "vừa chạy")],
        ["D-010/A-hai", state("fresh", "vừa chạy")],
      ]),
    );
    assert.equal(out, "");
  });
});

test("formatDesignDriftWarning: chưa có dòng độ tươi nào ⇒ trả chuỗi rỗng", async () => {
  await withGraph((graph) => {
    assert.equal(formatDesignDriftWarning(buildTask({}), graph, new Map()), "");
  });
});

test("formatDesignDriftWarning: task trỏ chặng không tồn tại ⇒ trả chuỗi rỗng", async () => {
  await withGraph((graph) => {
    const orphan = zTask.parse({
      id: "T-071",
      title: "t",
      serves: ["G-001"],
      implements: "D-999",
      scope: "P-thu",
      exit_contract: [{ kind: "command", run: "true" }],
    });
    assert.equal(
      formatDesignDriftWarning(
        orphan,
        graph,
        new Map([["D-999/A-mot", state("stale", "x")]]),
      ),
      "",
    );
  });
});
