import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { contractPathRefs, contractPaths, ownsGanasFile } from "../src/boundary.js";
import { run as ganasCommit } from "../src/commands/commit.js";
import { parsePorcelainZ } from "../src/commands/commit.js";
import { criterionKey } from "../src/gate.js";
import * as handlers from "../src/hooks/io/handlers.js";
import { zTask } from "../src/model/index.js";
import { runShell } from "../src/util/exec.js";
import { tokenizeShell } from "../src/util/shell.js";
import { cleanup, design, goal, makeProject, scope } from "./helpers.js";

function taskWith(extra: Record<string, unknown>) {
  return zTask.parse({
    id: "T-001",
    title: "t",
    serves: ["G-001"],
    implements: "D-001",
    scope: "P-thu",
    ...extra,
  });
}

/* --- tokenizeShell / contractPaths ---------------------------------------- */

test("tokenizeShell: chuỗi trong nháy ra ĐÚNG MỘT token", () => {
  assert.deepEqual(tokenizeShell(`bun test tests/e2e/x.ts -t 'tên test'`), [
    "bun",
    "test",
    "tests/e2e/x.ts",
    "-t",
    "tên test",
  ]);
});

test("contractPaths: lấy file mà lệnh chạy, bỏ cờ và chuỗi trong nháy", () => {
  const task = taskWith({
    exit_contract: [{ kind: "command", run: "bun test tests/e2e/domain.test.ts -t 'ca mới'" }],
  });
  // `-t` là cờ, `ca mới` không có `/` lẫn đuôi file ⇒ không phải đường dẫn.
  assert.deepEqual(contractPaths(task), ["tests/e2e/domain.test.ts"]);
});

test("contractPaths: lấy cả đối số dạng file của công cụ khác", () => {
  const task = taskWith({
    exit_contract: [
      { kind: "command", run: "npx tsc -p tsconfig.json" },
      { kind: "command", run: "./scripts/check.sh" },
      { kind: "artifact", path: "docs/ADR-004.md" },
    ],
  });
  assert.deepEqual(contractPaths(task).sort(), [
    "docs/ADR-004.md",
    "scripts/check.sh",
    "tsconfig.json",
  ]);
});

test("contractPathRefs: giữ được tiêu chí đã nhắc tới đường dẫn", () => {
  const task = taskWith({
    exit_contract: [{ kind: "command", run: "bun test tests/e2e/x.ts" }],
  });
  assert.equal(contractPathRefs(task)[0]?.from, "lệnh `bun test tests/e2e/x.ts`");
});

/* --- ownsGanasFile -------------------------------------------------------- */

test("ownsGanasFile: chỉ nhận file task thật sự sở hữu", () => {
  const task = taskWith({
    touches: ["M-domain"],
    context_contract: { must_read: [], facts: ["F-DOM-002"], open_questions: [] },
    exit_contract: [{ kind: "command", run: "true" }],
  });

  for (const owned of [
    ".ganas/tasks/T-001.yaml",
    ".ganas/modules/M-domain.yaml",
    ".ganas/facts/F-DOM-002.yaml",
    ".ganas/verify-ledger.jsonl",
    // Bộ khung spine mà chính task khai — đi cùng task, nếu không thì không
    // lệnh nào commit chúng cả.
    ".ganas/designs/D-001.yaml",
    ".ganas/goals/G-001.yaml",
    ".ganas/scopes/P-thu.yaml",
  ]) {
    assert.ok(ownsGanasFile(task, owned), `phải sở hữu ${owned}`);
  }

  // Đúng ca znstrack mục 2: commit nhãn T-005 kéo theo graph của T-007 và của
  // phiên trước.
  for (const foreign of [
    ".ganas/tasks/T-007.yaml",
    ".ganas/modules/M-console-store.yaml",
    ".ganas/designs/D-003.yaml",
    ".ganas/goals/G-999.yaml",
    ".ganas/facts/F-KHAC-001.yaml",
    ".ganas/scopes/P-khac.yaml",
    // Mức cưỡng chế là quyết định tầm dự án, đáng có commit riêng.
    ".ganas/config.yaml",
    "src/a/index.ts",
  ]) {
    assert.ok(!ownsGanasFile(task, foreign), `KHÔNG được sở hữu ${foreign}`);
  }
});

/* --- parsePorcelainZ ------------------------------------------------------ */

test("parsePorcelainZ: đọc được cả mục đổi tên (hai trường)", () => {
  const out = parsePorcelainZ("?? .ganas/tasks/T-002.yaml\0 M src/a.ts\0R  new.ts\0old.ts\0");
  assert.deepEqual(out, [
    { x: "?", y: "?", path: ".ganas/tasks/T-002.yaml" },
    { x: " ", y: "M", path: "src/a.ts" },
    { x: "R", y: " ", path: "new.ts" },
    { x: "R", y: " ", path: "old.ts" },
  ]);
});

/* --- criterionKey --------------------------------------------------------- */

test("criterionKey: ổn định khi đảo thứ tự exit_contract", () => {
  const a = { kind: "command", run: "bun test x" } as const;
  const b = { kind: "artifact", path: "docs/x.md" } as const;
  assert.equal(criterionKey(a), "command:bun test x");
  assert.notEqual(criterionKey(a), criterionKey(b));
});

/* --- Tích hợp: git thật --------------------------------------------------- */

async function gitProject(files: Record<string, string>): Promise<string> {
  const root = await makeProject(files);
  await runShell("git init -q", { cwd: root });
  await runShell('git config user.email "test@ganas.local"', { cwd: root });
  await runShell('git config user.name "ganas test"', { cwd: root });
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

/** Đúng hình dạng task T-005 của znstrack: khối chỉ khai src/, gate chạy tests/. */
const T_ZNSTRACK = `id: T-001
# Chú thích này PHẢI còn nguyên sau khi ganas ghi status/done_at.
title: "Sửa lõi"
serves: [G-001]
implements: D-001
scope: P-thu
touches:
  - M-a
exit_contract:
  - kind: command
    run: "test -f tests/e2e/domain.test.ts"
`;

test("⭐ commit stage cả file mà exit_contract chạy, dù nằm ngoài paths của khối", async () => {
  const root = await gitProject({ ...BASE, ".ganas/tasks/T-001.yaml": T_ZNSTRACK });
  try {
    await mkdir(join(root, "src", "a"), { recursive: true });
    await writeFile(join(root, "src", "a", "index.ts"), "export {};\n", "utf8");
    await mkdir(join(root, "tests", "e2e"), { recursive: true });
    await writeFile(join(root, "tests", "e2e", "domain.test.ts"), "// test\n", "utf8");

    assert.equal(
      await ganasCommit({ positional: ["T-001"], options: { root }, flags: {}, passthrough: [] }),
      0,
    );

    const show = await runShell("git show --name-only --format= HEAD", { cwd: root });
    assert.match(
      show.stdout,
      /tests\/e2e\/domain\.test\.ts/,
      "file mà exit_contract chạy phải vào commit — thiếu nó thì gate đỏ ở máy khác",
    );
    assert.match(show.stdout, /src\/a\/index\.ts/);
  } finally {
    await cleanup(root);
  }
});

test("⭐ commit KHÔNG kéo theo .ganas/ của task khác", async () => {
  const root = await gitProject({
    ...BASE,
    ".ganas/tasks/T-001.yaml": T_ZNSTRACK,
    // Của task khác / phiên trước — không được vào commit mang nhãn T-001.
    ".ganas/tasks/T-007.yaml": `id: T-007
title: "Việc khác"
serves: [G-001]
implements: D-001
scope: P-thu
exit_contract:
  - kind: command
    run: "true"
`,
    ".ganas/designs/D-003.yaml": design("D-003"),
  });
  try {
    await mkdir(join(root, "tests", "e2e"), { recursive: true });
    await writeFile(join(root, "tests", "e2e", "domain.test.ts"), "// test\n", "utf8");

    assert.equal(
      await ganasCommit({ positional: ["T-001"], options: { root }, flags: {}, passthrough: [] }),
      0,
    );

    const show = await runShell("git show --name-only --format= HEAD", { cwd: root });
    assert.match(show.stdout, /\.ganas\/tasks\/T-001\.yaml/);
    assert.doesNotMatch(show.stdout, /T-007/, "graph của task khác không được vào commit này");
    assert.doesNotMatch(show.stdout, /D-003/, "design của phiên trước không được vào commit này");
  } finally {
    await cleanup(root);
  }
});

test("⭐ --dry-run KHÔNG đụng vào index", async () => {
  const root = await gitProject({ ...BASE, ".ganas/tasks/T-001.yaml": T_ZNSTRACK });
  try {
    await mkdir(join(root, "tests", "e2e"), { recursive: true });
    await writeFile(join(root, "tests", "e2e", "domain.test.ts"), "// test\n", "utf8");

    assert.equal(
      await ganasCommit({
        positional: ["T-001"],
        options: { root },
        flags: { "dry-run": true },
        passthrough: [],
      }),
      0,
    );

    const staged = await runShell("git diff --cached --name-only", { cwd: root });
    assert.equal(
      staged.stdout.trim(),
      "",
      "dry-run là lệnh để XEM — nó không được để lại gì trong index",
    );
  } finally {
    await cleanup(root);
  }
});

test("commit đóng task: ghi status/done_at mà giữ nguyên comment", async () => {
  const root = await gitProject({ ...BASE, ".ganas/tasks/T-001.yaml": T_ZNSTRACK });
  try {
    await mkdir(join(root, "tests", "e2e"), { recursive: true });
    await writeFile(join(root, "tests", "e2e", "domain.test.ts"), "// test\n", "utf8");

    assert.equal(
      await ganasCommit({ positional: ["T-001"], options: { root }, flags: {}, passthrough: [] }),
      0,
    );

    const after = await readFile(join(root, ".ganas", "tasks", "T-001.yaml"), "utf8");
    assert.match(after, /status: done/);
    assert.match(after, /done_at:/);
    assert.match(after, /# Chú thích này PHẢI còn nguyên/, "ghi lại YAML không được xoá comment");
  } finally {
    await cleanup(root);
  }
});

test("commit --no-close: commit nhưng KHÔNG đánh dấu done", async () => {
  const root = await gitProject({ ...BASE, ".ganas/tasks/T-001.yaml": T_ZNSTRACK });
  try {
    await mkdir(join(root, "tests", "e2e"), { recursive: true });
    await writeFile(join(root, "tests", "e2e", "domain.test.ts"), "// test\n", "utf8");

    assert.equal(
      await ganasCommit({
        positional: ["T-001"],
        options: { root },
        flags: { close: false },
        passthrough: [],
      }),
      0,
    );

    const after = await readFile(join(root, ".ganas", "tasks", "T-001.yaml"), "utf8");
    assert.doesNotMatch(after, /status: done/);
  } finally {
    await cleanup(root);
  }
});

test("còn tiêu chí `manual` chưa xác nhận thì KHÔNG đóng task", async () => {
  const root = await gitProject({
    ...BASE,
    ".ganas/tasks/T-001.yaml": `id: T-001
title: "Sửa lõi"
serves: [G-001]
implements: D-001
scope: P-thu
exit_contract:
  - kind: command
    run: "true"
  - kind: manual
    check: "người review đã xem qua"
`,
  });
  try {
    assert.equal(
      await ganasCommit({ positional: ["T-001"], options: { root }, flags: {}, passthrough: [] }),
      0,
    );

    const after = await readFile(join(root, ".ganas", "tasks", "T-001.yaml"), "utf8");
    assert.doesNotMatch(
      after,
      /status: done/,
      "tiêu chí cần người chưa ai xác nhận thì máy không được tự đóng",
    );
  } finally {
    await cleanup(root);
  }
});

test("sổ cái đứt hash-chain thì KHÔNG commit được", async () => {
  const root = await gitProject({
    ...BASE,
    ".ganas/tasks/T-001.yaml": T_ZNSTRACK,
    // prev_hash bịa — chain không khớp ngay từ dòng đầu.
    ".ganas/verify-ledger.jsonl":
      JSON.stringify({
        target: "M-a/V-a",
        at: "2026-01-01T00:00:00Z",
        result: "pass",
        seq: 1,
        prev_hash: "f".repeat(64),
      }) + "\n",
  });
  try {
    await mkdir(join(root, "tests", "e2e"), { recursive: true });
    await writeFile(join(root, "tests", "e2e", "domain.test.ts"), "// test\n", "utf8");

    await assert.rejects(
      ganasCommit({ positional: ["T-001"], options: { root }, flags: {}, passthrough: [] }),
      /chain.*đứt|đứt.*chain/i,
    );
    const log = await runShell("git log --oneline", { cwd: root });
    assert.equal(log.stdout.trim(), "", "sổ cái hỏng thì tuyệt đối không có commit nào");
  } finally {
    await cleanup(root);
  }
});

/* --- Baseline gate: tiêu chí xanh sẵn từ trước khi bắt đầu ------------------ */

test("⭐ ganas next cảnh báo tiêu chí đã xanh SẴN, và gate nhắc lại", async () => {
  const root = await gitProject({
    ...BASE,
    // Đúng mẫu T-012 của znstrack: task sửa bug chép lại probe của task trước,
    // nên gate xanh trước khi viết một dòng nào.
    ".ganas/tasks/T-001.yaml": `id: T-001
title: "Sửa bug"
serves: [G-001]
implements: D-001
scope: P-thu
exit_contract:
  - kind: command
    run: "test -f tests/e2e/console.test.ts"
`,
  });
  try {
    // File test đã tồn tại sẵn từ task trước.
    await mkdir(join(root, "tests", "e2e"), { recursive: true });
    await writeFile(join(root, "tests", "e2e", "console.test.ts"), "// có sẵn\n", "utf8");

    const next = await import("../src/commands/next.js");
    const argv = {
      positional: [] as string[],
      options: { root, session: "sess-baseline" },
      flags: {},
      passthrough: [] as string[],
    };

    const out: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      out.push(String(chunk));
      return true;
    });
    try {
      await next.run(argv);
      const gate = await import("../src/commands/gate.js");
      await gate.run({ ...argv, flags: {} });
    } finally {
      process.stdout.write = write;
    }

    const text = out.join("");
    assert.match(
      text,
      /ĐÃ ĐẠT\s*\n?\s*ngay lúc này|XANH SẴN/,
      `phải cảnh báo tiêu chí xanh sẵn. Đã in:\n${text}`,
    );
  } finally {
    await cleanup(root);
  }
});

test("baseline không có (phiên khác) thì im lặng, không đoán bừa", async () => {
  const root = await gitProject({ ...BASE, ".ganas/tasks/T-001.yaml": T_ZNSTRACK });
  try {
    await mkdir(join(root, "tests", "e2e"), { recursive: true });
    await writeFile(join(root, "tests", "e2e", "domain.test.ts"), "// test\n", "utf8");

    const out: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      out.push(String(chunk));
      return true;
    });
    try {
      const gate = await import("../src/commands/gate.js");
      // Không `--session` ⇒ không có baseline nào để đối chiếu.
      await gate.run({ positional: ["T-001"], options: { root }, flags: {}, passthrough: [] });
    } finally {
      process.stdout.write = write;
    }

    assert.doesNotMatch(out.join(""), /XANH SẴN/);
  } finally {
    await cleanup(root);
  }
});

/* --- Ranh giới code: file phiên sửa nhưng ngoài `touches` ------------------ */

test("⭐ --dry-run cảnh báo file phiên đã sửa nằm NGOÀI ranh giới code", async () => {
  const root = await gitProject({ ...BASE, ".ganas/tasks/T-001.yaml": T_ZNSTRACK });
  try {
    // Gate của T-001 đòi file này tồn tại, dù dry-run không chấm gate trước đó.
    await mkdir(join(root, "tests", "e2e"), { recursive: true });
    await writeFile(join(root, "tests", "e2e", "domain.test.ts"), "// test\n", "utf8");

    // Bind phiên s1 vào T-001 (ranh giới: src/a/** + tests/e2e/domain.test.ts).
    await handlers.sessionStart({ cwd: root, session_id: "s1" });
    // Phiên ghi một file lạc ngoài ranh giới đó.
    await handlers.postToolUse({
      cwd: root,
      session_id: "s1",
      tool_name: "Write",
      tool_input: { file_path: "scripts/lac.sh" },
    });

    const out: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      out.push(String(chunk));
      return true;
    });
    try {
      assert.equal(
        await ganasCommit({
          positional: [],
          options: { root, session: "s1" },
          flags: { "dry-run": true },
          passthrough: [],
        }),
        0,
      );
    } finally {
      process.stdout.write = write;
    }

    const text = out.join("");
    assert.match(text, /NGOÀI ranh giới code/, `phải cảnh báo file lạc. Đã in:\n${text}`);
    assert.match(text, /scripts\/lac\.sh/);
  } finally {
    await cleanup(root);
  }
});
