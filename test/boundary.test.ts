import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { matchPatterns, outsideBoundary, taskBoundary } from "../src/boundary.js";
import { loadGraph } from "../src/graph/load.js";
import { zTask } from "../src/model/index.js";
import { runShell } from "../src/util/exec.js";
import { matchesAny } from "../src/util/glob.js";
import { cleanup, design, goal, makeProject } from "./helpers.js";

test("taskBoundary: paths của khối task chạm tới, cộng đường dẫn exit_contract chạy", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối A"
nature: code
paths: ["src/a/**"]
status: implemented
verify:
  - id: V-a-probe
    kind: probe
    run: "true"
`,
  });
  try {
    const graph = await loadGraph(root);
    const task = zTask.parse({
      id: "T-001",
      title: "t",
      serves: ["G-001"],
      implements: "D-001",
      scope: "P-thu",
      touches: ["M-a", "M-khong-co"],
      exit_contract: [{ kind: "command", run: "true" }],
    });
    const patterns = taskBoundary(task, graph);
    assert.deepEqual(patterns, ["src/a/**"]);
  } finally {
    await cleanup(root);
  }
});

/* --- outsideBoundary ------------------------------------------------------ */

const MOD_A = `id: M-a
title: "Khối A"
nature: code
paths: ["src/a/**"]
status: implemented
verify:
  - id: V-a-probe
    kind: probe
    run: "true"
`;

/** Task chạm M-a, exit_contract chạy một file test nằm ngoài mọi khối. */
async function fixture(
  over: Partial<Record<"touches" | "exit_contract", unknown>> = {},
): Promise<{ root: string; task: ReturnType<typeof zTask.parse>; graph: Awaited<ReturnType<typeof loadGraph>> }> {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/modules/M-a.yaml": MOD_A,
  });
  const graph = await loadGraph(root);
  const task = zTask.parse({
    id: "T-001",
    title: "t",
    serves: ["G-001"],
    implements: "D-001",
    scope: "P-thu",
    touches: over.touches ?? ["M-a"],
    exit_contract: over.exit_contract ?? [
      { kind: "command", run: "npx tsx --test test/e2e/x.test.ts" },
    ],
  });
  return { root, task, graph };
}

test("file trong paths của khối chạm tới → không báo", async () => {
  const { root, task, graph } = await fixture();
  try {
    assert.deepEqual(outsideBoundary(task, graph, ["src/a/x.ts", "src/a/deep/y.ts"]), []);
  } finally {
    await cleanup(root);
  }
});

test("file mà chính exit_contract chạy → không báo, dù ngoài mọi khối", async () => {
  const { root, task, graph } = await fixture();
  try {
    assert.deepEqual(outsideBoundary(task, graph, ["test/e2e/x.test.ts"]), []);
  } finally {
    await cleanup(root);
  }
});

test("⭐ exit_contract chạy cả thư mục (`vitest src/`) → cả cây con là trong ranh giới", async () => {
  const { root, task, graph } = await fixture({
    exit_contract: [{ kind: "command", run: "npx vitest run src/" }],
    touches: [],
  });
  try {
    assert.deepEqual(
      outsideBoundary(task, graph, ["src/deep/lam/x.ts"]),
      [],
      "pathspec `src/` là cả cây con — không bù chỗ này thì báo nhầm hàng loạt",
    );
  } finally {
    await cleanup(root);
  }
});

test("file không thuộc khối nào → báo", async () => {
  const { root, task, graph } = await fixture();
  try {
    assert.deepEqual(outsideBoundary(task, graph, ["src/a/x.ts", "scripts/deploy.sh"]), [
      "scripts/deploy.sh",
    ]);
  } finally {
    await cleanup(root);
  }
});

test("file .ganas/ không bao giờ bị báo — đó là việc của ownsGanasFile", async () => {
  const { root, task, graph } = await fixture();
  try {
    assert.deepEqual(
      outsideBoundary(task, graph, [".ganas/facts/F-999.yaml", ".ganas/tasks/T-007.yaml"]),
      [],
    );
  } finally {
    await cleanup(root);
  }
});

test("ranh giới rỗng → không kết luận gì, dù đã sửa file", async () => {
  const { root, task, graph } = await fixture({
    touches: [],
    exit_contract: [{ kind: "command", run: "true" }],
  });
  try {
    assert.deepEqual(outsideBoundary(task, graph, ["bat/ky/dau.ts"]), []);
  } finally {
    await cleanup(root);
  }
});

test("khối không tồn tại trong touches không ném và không nới ranh giới", async () => {
  const { root, task, graph } = await fixture({ touches: ["M-a", "M-khong-co"] });
  try {
    assert.deepEqual(outsideBoundary(task, graph, ["ngoai/kia.ts"]), ["ngoai/kia.ts"]);
  } finally {
    await cleanup(root);
  }
});

test("kết quả khử trùng lặp và sắp xếp ổn định", async () => {
  const { root, task, graph } = await fixture();
  try {
    assert.deepEqual(
      outsideBoundary(task, graph, ["z/b.ts", "a/a.ts", "z/b.ts", "./a/a.ts"]),
      ["a/a.ts", "z/b.ts"],
    );
  } finally {
    await cleanup(root);
  }
});

/* --- Đối chứng với git: git là trọng tài của ngữ nghĩa pathspec ------------ */

/**
 * `taskBoundary` trả về PATHSPEC — thứ `ganas commit` đưa thẳng cho `git add`.
 * Nên câu "file này có trong ranh giới không" đã có một câu trả lời đúng sẵn:
 * câu của git. Test này hỏi cả hai bên cùng một câu và bắt chúng khớp nhau.
 *
 * Nhờ vậy ngữ nghĩa được khoá lại bằng git mà `ganas gate` KHÔNG phải gọi git
 * lúc chạy — mượn uy tín của git ở tầng test, không ở tầng runtime.
 *
 * Không đưa `{a,b}` vào bộ ca: pathspec của git dùng wildmatch, không bung
 * ngoặc nhọn, còn `matchesAny` thì có. Chỗ lệch đó có thật và nằm ngoài phạm
 * vi hàm này.
 */
const FILES = [
  "src/a/x.ts",
  "src/a/deep/y.ts",
  "src/b/z.ts",
  "test/e2e/x.test.ts",
  "scripts/deploy.sh",
  "tsconfig.json",
  "docs/r.md",
];

const SPECS = [
  "src",
  "src/",
  "./src/a",
  "src/a/**",
  "src/**",
  "tsconfig.json",
  "test/e2e/x.test.ts",
  "scripts",
];

test("⭐ matchPatterns khớp đúng ngữ nghĩa pathspec của git", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await runShell("git init -q .", { cwd: root });
    for (const f of FILES) {
      await mkdir(join(root, dirname(f)), { recursive: true });
      await writeFile(join(root, f), "x\n", "utf8");
    }

    for (const spec of SPECS) {
      const ls = await runShell(`git ls-files --cached --others -- ${JSON.stringify(spec)}`, {
        cwd: root,
      });
      const byGit = ls.stdout.split("\n").map((s) => s.trim()).filter(Boolean).sort();

      // Bên ta: file nào khớp ranh giới `[spec]`.
      const patterns = matchPatterns([spec]);
      const byGanas = FILES.filter((f) => matchesAny(f, patterns)).sort();

      assert.deepEqual(
        byGanas,
        byGit,
        `pathspec ${JSON.stringify(spec)}: ganas và git phải kết luận giống nhau`,
      );
    }
  } finally {
    await cleanup(root);
  }
});
