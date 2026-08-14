import assert from "node:assert/strict";
import { test } from "node:test";

import { run as runId } from "../src/commands/id.js";
import { parseArgs } from "../src/util/args.js";
import { GanasError } from "../src/util/errors.js";
import { cleanup, goal, makeProject, task } from "./helpers.js";

/** Chạy `ganas id ...` và bắt stdout, theo mẫu ở test/commit-staging.test.ts:386-398. */
async function runCli(root: string, args: string[]): Promise<{ out: string; code: number }> {
  const out: string[] = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    out.push(String(chunk));
    return true;
  });
  try {
    const code = await runId(parseArgs([...args, "--root", root]));
    return { out: out.join(""), code };
  } finally {
    process.stdout.write = write;
  }
}

/* --- task: lấy số lớn nhất đang dùng, không phải đếm ----------------------- */

test("kho chưa có task nào → T-001", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const { out, code } = await runCli(root, ["task"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "T-001");
  } finally {
    await cleanup(root);
  }
});

test("có T-001 và T-007 → T-008 (lấy max, không đếm số lượng)", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/tasks/T-001.yaml": task("T-001"),
    ".ganas/tasks/T-007.yaml": task("T-007"),
  });
  try {
    const { out, code } = await runCli(root, ["task"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "T-008");
  } finally {
    await cleanup(root);
  }
});

test("--count 3 → ba id liên tiếp, không trùng id đang có", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/tasks/T-001.yaml": task("T-001"),
    ".ganas/tasks/T-007.yaml": task("T-007"),
  });
  try {
    const { out, code } = await runCli(root, ["task", "--count", "3"]);
    assert.equal(code, 0);
    assert.deepEqual(
      out.trim().split("\n"),
      ["T-008", "T-009", "T-010"],
    );
  } finally {
    await cleanup(root);
  }
});

test("có T-1234 → T-1235 (số ≥ 1000 không bị cắt về 3 chữ số)", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/tasks/T-1234.yaml": task("T-1234"),
  });
  try {
    const { out, code } = await runCli(root, ["task"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "T-1235");
  } finally {
    await cleanup(root);
  }
});

/* --- fact: bắt buộc --group -------------------------------------------------- */

test("fact thiếu --group → mã thoát khác 0, thông điệp nói rõ", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await assert.rejects(
      () => runId(parseArgs(["fact", "--root", root])),
      (err: unknown) => {
        assert.ok(err instanceof GanasError, "phải là GanasError, không phải lỗi khác");
        assert.notEqual((err).exitCode, 0);
        assert.match((err).message, /--group/);
        return true;
      },
    );
  } finally {
    await cleanup(root);
  }
});

test("fact --group ACC khi đã có F-ACC-002 → F-ACC-003", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/facts/a.yaml": `- id: F-ACC-002
  scope: P-thu
  statement: "s"
  verify:
    run: "true"`,
  });
  try {
    const { out, code } = await runCli(root, ["fact", "--group", "ACC"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "F-ACC-003");
  } finally {
    await cleanup(root);
  }
});

test("fact --group XYZ khi chưa có group đó → F-XYZ-001", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/facts/a.yaml": `- id: F-ACC-002
  scope: P-thu
  statement: "s"
  verify:
    run: "true"`,
  });
  try {
    const { out, code } = await runCli(root, ["fact", "--group", "XYZ"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "F-XYZ-001");
  } finally {
    await cleanup(root);
  }
});

/* --- loại slug: không có số kế tiếp ---------------------------------------- */

test("module → mã thoát khác 0, thông điệp nhắc tới slug và scope new", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await assert.rejects(
      () => runId(parseArgs(["module", "--root", root])),
      (err: unknown) => {
        assert.ok(err instanceof GanasError);
        assert.notEqual((err).exitCode, 0);
        assert.match((err).message, /slug|Ý NGHĨA/i);
        assert.match((err).message, /ganas scope new/);
        return true;
      },
    );
  } finally {
    await cleanup(root);
  }
});

test("scope → mã thoát khác 0, thông điệp nhắc tới slug và scope new", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await assert.rejects(
      () => runId(parseArgs(["scope", "--root", root])),
      (err: unknown) => {
        assert.ok(err instanceof GanasError);
        assert.notEqual((err).exitCode, 0);
        assert.match((err).message, /slug|Ý NGHĨA/i);
        assert.match((err).message, /ganas scope new/);
        return true;
      },
    );
  } finally {
    await cleanup(root);
  }
});

/* --- --json ------------------------------------------------------------------ */

test("--json parse được, có kind và ids", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/tasks/T-001.yaml": task("T-001"),
  });
  try {
    const { out, code } = await runCli(root, ["task", "--json"]);
    assert.equal(code, 0);
    const parsed = JSON.parse(out) as { kind: string; ids: string[] };
    assert.equal(parsed.kind, "task");
    assert.deepEqual(parsed.ids, ["T-002"]);
  } finally {
    await cleanup(root);
  }
});

test("--json cho fact có thêm trường group", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const { out, code } = await runCli(root, ["fact", "--group", "ACC", "--json"]);
    assert.equal(code, 0);
    const parsed = JSON.parse(out) as { kind: string; group: string; ids: string[] };
    assert.equal(parsed.kind, "fact");
    assert.equal(parsed.group, "ACC");
    assert.deepEqual(parsed.ids, ["F-ACC-001"]);
  } finally {
    await cleanup(root);
  }
});

