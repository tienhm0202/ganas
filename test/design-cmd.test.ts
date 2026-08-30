import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { run as runDesign } from "../src/commands/design.js";
import { loadGraph } from "../src/graph/load.js";
import { parseArgs } from "../src/util/args.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

/** Chạy `ganas design ...` và bắt stdout, cùng khuôn `test/scope-cmd.test.ts`. */
async function runCli(root: string, args: string[]): Promise<{ out: string; code: number }> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: unknown }).write = (c: string | Uint8Array): boolean => {
    chunks.push(typeof c === "string" ? c : Buffer.from(c).toString("utf8"));
    return true;
  };
  try {
    const code = await runDesign(parseArgs([...args, "--root", root], ["yes", "dry-run"]));
    return { out: chunks.join(""), code };
  } finally {
    (process.stdout as { write: unknown }).write = original;
  }
}

const LEDGER = join(".ganas", "verify-ledger.jsonl");

async function ledgerMtime(root: string): Promise<number | null> {
  try {
    return (await stat(join(root, LEDGER))).mtimeMs;
  } catch {
    return null;
  }
}

/** Design với một bản vẽ SẠCH: khối tồn tại, file thật tồn tại, probe đạt và có thể fail. */
function cleanDesign(id = "D-001"): string {
  return design(id, ["G-001"], `
artifacts:
  - id: A-clean
    kind: function
    module: M-a
    shape: "(x: number) => number"
    probe:
      run: "test -f src/a/index.ts"
      expect: exit_zero
`);
}

/** Design với một bản vẽ LỆCH: trỏ vào khối không tồn tại. */
function driftedDesign(id = "D-001"): string {
  return design(id, ["G-001"], `
artifacts:
  - id: A-lech
    kind: function
    module: M-khong-ton-tai
    shape: "(x: number) => number"
    probe:
      run: "test -f src/a/index.ts"
      expect: exit_zero
`);
}

async function baseProject(designYaml: string, extra: Record<string, string> = {}): Promise<string> {
  return makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designYaml,
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    "src/a/index.ts": "export const a = 1;\n",
    ...extra,
  });
}

/* --- list ------------------------------------------------------------------ */

test("⭐ list in đủ chặng: id, title, trạng thái, số bản vẽ", async () => {
  const root = await baseProject(cleanDesign());
  try {
    const { out, code } = await runCli(root, []);
    assert.equal(code, 0);
    assert.match(out, /D-001 — Design thử/);
    assert.match(out, /active/);
    assert.match(out, /1 bản vẽ/);
  } finally {
    await cleanup(root);
  }
});

test("dự án chưa có design nào thì nói cách tạo, không im lặng in rỗng", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const { out } = await runCli(root, []);
    assert.match(out, /Chưa có chặng/);
    assert.match(out, /ganas design new/);
  } finally {
    await cleanup(root);
  }
});

test("`ganas design list` tường minh cho ra kết quả giống mặc định", async () => {
  const root = await baseProject(cleanDesign());
  try {
    const { out: withoutSub } = await runCli(root, []);
    const { out: withSub } = await runCli(root, ["list"]);
    assert.equal(withoutSub, withSub);
  } finally {
    await cleanup(root);
  }
});

test("⭐ list KHÔNG ghi đĩa", async () => {
  const root = await baseProject(cleanDesign());
  try {
    const before = await ledgerMtime(root);
    await runCli(root, []);
    const after = await ledgerMtime(root);
    assert.equal(after, before, "list không được đụng sổ cái");
  } finally {
    await cleanup(root);
  }
});

/* --- show -------------------------------------------------------------------- */

test("⭐ show in bản vẽ kèm nhãn độ tươi", async () => {
  const root = await baseProject(cleanDesign());
  try {
    // Chưa verify lần nào ⇒ nhãn phải là "chưa rõ", không được im lặng coi như đạt.
    const before = await runCli(root, ["show", "D-001"]);
    assert.match(before.out, /A-clean/);
    assert.match(before.out, /NEVER_VERIFIED/);

    // Chạy check để có bằng chứng trong sổ cái, rồi show phải đổi nhãn theo.
    await runCli(root, ["check", "D-001"]);
    const after = await runCli(root, ["show", "D-001"]);
    assert.match(after.out, /FRESH/);
  } finally {
    await cleanup(root);
  }
});

test("design chưa có bản vẽ nào thì show nói tử tế, không vỡ", async () => {
  const root = await baseProject(design("D-010", ["G-001"]));
  try {
    const { out, code } = await runCli(root, ["show", "D-010"]);
    assert.equal(code, 0);
    assert.match(out, /[Cc]hưa có bản vẽ nào/);
  } finally {
    await cleanup(root);
  }
});

test("show báo lệch cấu trúc qua artifactIssues, không tự so lại", async () => {
  const root = await baseProject(driftedDesign());
  try {
    const { out } = await runCli(root, ["show", "D-001"]);
    assert.match(out, /missing-module/);
    assert.match(out, /M-khong-ton-tai/);
  } finally {
    await cleanup(root);
  }
});

test("show design không tồn tại thì báo lỗi rõ", async () => {
  const root = await baseProject(cleanDesign());
  try {
    await assert.rejects(() => runCli(root, ["show", "D-999"]), /không có design D-999/);
  } finally {
    await cleanup(root);
  }
});

test("⭐ show KHÔNG ghi đĩa", async () => {
  const root = await baseProject(cleanDesign());
  try {
    const before = await ledgerMtime(root);
    await runCli(root, ["show", "D-001"]);
    const after = await ledgerMtime(root);
    assert.equal(after, before, "show không được đụng sổ cái");
  } finally {
    await cleanup(root);
  }
});

/* --- check ------------------------------------------------------------------- */

test("⭐ check trả 0 khi sạch", async () => {
  const root = await baseProject(cleanDesign());
  try {
    const { out, code } = await runCli(root, ["check", "D-001"]);
    assert.equal(code, 0);
    assert.match(out, /A-clean/);
  } finally {
    await cleanup(root);
  }
});

test("⭐ check trả 1 khi lệch cấu trúc", async () => {
  const root = await baseProject(driftedDesign());
  try {
    const { code, out } = await runCli(root, ["check", "D-001"]);
    assert.equal(code, 1);
    assert.match(out, /missing-module/);
  } finally {
    await cleanup(root);
  }
});

test("check ghi sổ cái khi chạy thật", async () => {
  const root = await baseProject(cleanDesign());
  try {
    const before = await ledgerMtime(root);
    await runCli(root, ["check", "D-001"]);
    const after = await ledgerMtime(root);
    assert.ok(after !== null && after !== before, "check chạy thật phải ghi sổ cái");
  } finally {
    await cleanup(root);
  }
});

test("⭐ check --dry-run KHÔNG ghi sổ cái", async () => {
  const root = await baseProject(cleanDesign());
  try {
    const before = await ledgerMtime(root);
    const { out } = await runCli(root, ["check", "D-001", "--dry-run"]);
    const after = await ledgerMtime(root);
    assert.equal(after, before, "dry-run không được ghi sổ cái");
    assert.match(out, /sẽ chạy/);
  } finally {
    await cleanup(root);
  }
});

test("design chưa khai artifacts thì check nói rõ, không im lặng trả 0 như đã kiểm", async () => {
  const root = await baseProject(design("D-010", ["G-001"]));
  try {
    const { out, code } = await runCli(root, ["check", "D-010"]);
    assert.equal(code, 0);
    assert.match(out, /không có gì để chấm/);
  } finally {
    await cleanup(root);
  }
});

test("check không tham số chấm mọi design đang active", async () => {
  const root = await baseProject(cleanDesign(), {
    ".ganas/designs/D-002.yaml": design("D-002", ["G-001"], `status: draft\n`),
  });
  try {
    const { out } = await runCli(root, ["check"]);
    assert.match(out, /D-001/);
    assert.doesNotMatch(out, /D-002/, "design draft không thuộc lượt chấm mặc định");
  } finally {
    await cleanup(root);
  }
});

/* --- new ---------------------------------------------------------------------- */

test("⭐ design new sinh design HỢP LỆ, artifacts/exit_contract rỗng", async () => {
  const root = await baseProject(cleanDesign());
  try {
    const { code } = await runCli(root, [
      "new",
      "--yes",
      "--title",
      "Chặng thử",
      "--serves",
      "G-001",
      "--summary",
      "Cách tiếp cận thử",
      "--id",
      "D-050",
    ]);
    assert.equal(code, 0);

    const graph = await loadGraph(root);
    const d = graph.designs.get("D-050");
    assert.ok(d, "design mới phải nạp được vào graph");
    assert.equal(d.value.title, "Chặng thử");
    assert.deepEqual(d.value.serves, ["G-001"]);
    assert.deepEqual(d.value.artifacts, []);
    assert.deepEqual(d.value.exit_contract, []);
    assert.equal(d.value.status, "draft");
  } finally {
    await cleanup(root);
  }
});

test("design new thiếu câu nào cũng báo đúng câu đó", async () => {
  const root = await baseProject(cleanDesign());
  try {
    await assert.rejects(
      () => runCli(root, ["new", "--yes", "--title", "X"]),
      /serves/,
    );
    await assert.rejects(
      () => runCli(root, ["new", "--yes", "--title", "X", "--serves", "G-001"]),
      /summary/,
    );
  } finally {
    await cleanup(root);
  }
});

test("design new từ chối id đã tồn tại", async () => {
  const root = await baseProject(cleanDesign());
  try {
    await assert.rejects(
      () =>
        runCli(root, [
          "new",
          "--yes",
          "--title",
          "X",
          "--serves",
          "G-001",
          "--summary",
          "Y",
          "--id",
          "D-001",
        ]),
      /đã tồn tại/,
    );
  } finally {
    await cleanup(root);
  }
});

/* --- lệnh con lạ --------------------------------------------------------------- */

test("lệnh con không tồn tại thì báo lỗi kèm danh sách lệnh con thật", async () => {
  const root = await baseProject(cleanDesign());
  try {
    await assert.rejects(() => runCli(root, ["khong-co"]), /list, new, show, check/);
  } finally {
    await cleanup(root);
  }
});
