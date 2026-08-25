import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { formatBoundaryWarning, matchPatterns, outsideBoundary, taskBoundary } from "../src/boundary.js";
import { gitTouchedPaths } from "../src/commit.js";
import { loadGraph } from "../src/graph/load.js";
import { zTask } from "../src/model/index.js";
import { TOUCHED_PATHS_CAP } from "../src/state.js";
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

/* --- gitTouchedPaths: nguồn thật của `touched` (ICE-008) ------------------- */

/**
 * ICE-008: `outsideBoundary()` từng nhận `touched` từ sổ phiên
 * (`touchedPathsFor`) — sổ đó gần như luôn rỗng nên cảnh báo không bao giờ
 * kêu. Bộ test này ghép `gitTouchedPaths` với `outsideBoundary` y hệt cách
 * `commands/commit.ts` và `commands/gate.ts` gọi thật, KHÔNG đụng gì tới
 * `.ganas/state.json` — đúng cái đường rò cũ.
 */
test("⭐ gitTouchedPaths + outsideBoundary: bắt được file NGOÀI ranh giới mà không cần --session", async () => {
  const { root, task, graph } = await fixture();
  try {
    await runShell("git init -q .", { cwd: root });
    await mkdir(join(root, "src/a"), { recursive: true });
    await writeFile(join(root, "src/a/x.ts"), "trong ranh gioi\n", "utf8");
    await mkdir(join(root, "scripts"), { recursive: true });
    await writeFile(join(root, "scripts/deploy.sh"), "ngoai ranh gioi\n", "utf8");

    const touched = await gitTouchedPaths(root);
    assert.ok(touched.includes("src/a/x.ts"));
    assert.ok(touched.includes("scripts/deploy.sh"));

    assert.deepEqual(outsideBoundary(task, graph, touched), ["scripts/deploy.sh"]);
  } finally {
    await cleanup(root);
  }
});

test("gitTouchedPaths: file MỚI TẠO (chưa track) vẫn vào danh sách — không đặc cách", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await runShell("git init -q .", { cwd: root });
    await mkdir(join(root, "src/moi"), { recursive: true });
    await writeFile(join(root, "src/moi/agent-tu-de.ts"), "chua track\n", "utf8");

    const touched = await gitTouchedPaths(root);
    assert.ok(
      touched.includes("src/moi/agent-tu-de.ts"),
      `phải thấy file mới tạo, có: ${JSON.stringify(touched)}`,
    );
  } finally {
    await cleanup(root);
  }
});

test("gitTouchedPaths: không phải repo git → rỗng, không ném lỗi", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    assert.deepEqual(await gitTouchedPaths(root), []);
  } finally {
    await cleanup(root);
  }
});

test("gitTouchedPaths: không có gì thay đổi trong cây git sạch → rỗng", async () => {
  const { root } = await fixture();
  try {
    await runShell("git init -q .", { cwd: root });
    await runShell("git add -A", { cwd: root });
    await runShell(
      `git -c user.email=t@t -c user.name=t commit -q -m x --no-gpg-sign`,
      { cwd: root },
    );
    assert.deepEqual(await gitTouchedPaths(root), []);
  } finally {
    await cleanup(root);
  }
});

/* --- formatBoundaryWarning ------------------------------------------------ */

test("formatBoundaryWarning: outside và touched đều rỗng → trả về chuỗi rỗng", () => {
  assert.equal(formatBoundaryWarning("T-042", ["src/gate/**"], [], []), "");
});

test("formatBoundaryWarning: có outside → chứa mọi đường dẫn, taskId, từng pattern boundary, đúng nhãn NGOÀI ranh giới code", () => {
  const boundary = ["src/gate/**", "test/gate.test.ts"];
  const outside = ["docs/README.md", "scripts/tmp.mjs", "src/util/unrelated.ts"];
  const msg = formatBoundaryWarning("T-042", boundary, outside, outside);

  assert.match(msg, /NGOÀI ranh giới code/);
  assert.match(msg, /T-042/);
  for (const p of outside) assert.match(msg, new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const p of boundary) assert.match(msg, new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("formatBoundaryWarning: touched chạm mức trần TOUCHED_PATHS_CAP → cảnh báo thêm dòng tối đa", () => {
  const touched = Array.from({ length: TOUCHED_PATHS_CAP }, (_, i) => `f${i}.ts`);
  const msg = formatBoundaryWarning("T-042", ["src/a/**"], touched, ["ngoai.ts"]);
  assert.match(msg, /tối đa/);
});

test("formatBoundaryWarning: touched dưới ngưỡng → không có dòng tối đa", () => {
  const msg = formatBoundaryWarning("T-042", ["src/a/**"], ["a.ts", "b.ts"], ["ngoai.ts"]);
  assert.doesNotMatch(msg, /tối đa/);
});

test("formatBoundaryWarning: boundary rỗng, touched không rỗng, outside rỗng → nhãn KHÔNG có ranh giới code", () => {
  const msg = formatBoundaryWarning("T-042", [], ["a.ts", "b.ts", "c.ts"], []);
  assert.match(msg, /KHÔNG có ranh giới code/);
});

test("formatBoundaryWarning: boundary rỗng và touched rỗng → chuỗi rỗng", () => {
  assert.equal(formatBoundaryWarning("T-042", [], [], []), "");
});

test("formatBoundaryWarning: chuỗi trả về bắt đầu và kết thúc bằng \\n", () => {
  const outMsg = formatBoundaryWarning("T-042", ["src/a/**"], ["a.ts"], ["ngoai.ts"]);
  assert.ok(outMsg.startsWith("\n"));
  assert.ok(outMsg.endsWith("\n"));

  const noBoundaryMsg = formatBoundaryWarning("T-042", [], ["a.ts", "b.ts"], []);
  assert.ok(noBoundaryMsg.startsWith("\n"));
  assert.ok(noBoundaryMsg.endsWith("\n"));
});
