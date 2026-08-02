import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import { validateGraph } from "../src/graph/validate.js";
import { factTarget, runTarget } from "../src/verify/run.js";
import { cleanup, goal, makeProject, moduleYaml, scope } from "./helpers.js";

/**
 * Các lỗ hổng ở đây đều đã được CHỨNG MINH bằng khai thác chạy thật trước khi
 * sửa. Test giữ chúng đóng — mỗi test là một kịch bản gian lận cụ thể, không
 * phải một khẳng định trừu tượng về "tính toàn vẹn".
 */

async function project(factYaml: string): Promise<string> {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/facts/a.yaml": factYaml,
  });
  await mkdir(join(root, "src", "a"), { recursive: true });
  await writeFile(join(root, "src", "a", "index.ts"), "export const a = 1;\n", "utf8");
  return root;
}

const FACT = (statement: string) => `- id: F-A-001
  scope: P-thu
  statement: ${JSON.stringify(statement)}
  depends_on: ["src/a/**"]
  verify:
    run: "test -f src/a/index.ts"
`;

async function verifyFact(root: string): Promise<void> {
  const graph = await loadGraph(root);
  await runTarget(factTarget(graph.facts.get("F-A-001")!), { root, by: "test" });
}

async function stateOf(root: string): Promise<{ freshness: string; codes: string[] }> {
  const graph = await loadGraph(root);
  const f = (await computeFreshness(graph)).get("F-A-001")!;
  return { freshness: f.freshness, codes: validateGraph(graph).map((d) => d.code) };
}

/* --- N21: statement phải nằm trong vân tay -------------------------------- */

test("⭐ đổi statement mà giữ nguyên probe → KHÔNG còn fresh, và validate bắt được", async () => {
  const root = await project(FACT("file src/a/index.ts tồn tại"));
  try {
    await verifyFact(root);
    assert.equal((await stateOf(root)).freshness, "fresh", "verify thật thì phải fresh");

    // Đường lách cũ: giữ nguyên probe đã pass VÀ giữ nguyên `last_verified_at`
    // (kẻ lách không dại gì xoá dấu vết đã verify), chỉ đổi ĐIỀU ĐƯỢC KHẲNG
    // ĐỊNH. Trước N21 việc này cho ra `fresh` + `validate` sạch không một lỗi:
    // một dòng sổ cái có thật chứng nhận cho một phát biểu hoàn toàn khác.
    const file = join(root, ".ganas/facts/a.yaml");
    const current = await readFile(file, "utf8");
    await writeFile(
      file,
      current.replace(
        /statement: .*/,
        'statement: "toàn bộ pipeline đối soát đã kiểm chứng end-to-end trên production"',
      ),
      "utf8",
    );

    const after = await stateOf(root);
    assert.equal(after.freshness, "definition_changed");
    assert.ok(
      after.codes.includes("knowledge/definition-changed"),
      `validate phải bắt được; nhận: ${after.codes.join(", ")}`,
    );
  } finally {
    await cleanup(root);
  }
});

test("sửa lại statement về ĐÚNG như cũ thì fresh trở lại — vân tay theo nội dung, không theo lần ghi", async () => {
  const statement = "file src/a/index.ts tồn tại";
  const root = await project(FACT(statement));
  try {
    await verifyFact(root);
    const file = join(root, ".ganas/facts/a.yaml");
    const original = await readFile(file, "utf8");
    await writeFile(
      file,
      original.replace(/statement: .*/, 'statement: "một điều khác hẳn"'),
      "utf8",
    );
    assert.equal((await stateOf(root)).freshness, "definition_changed");

    await writeFile(file, original, "utf8");
    assert.equal((await stateOf(root)).freshness, "fresh");
  } finally {
    await cleanup(root);
  }
});

/* --- N26: ttl_days của FACT phải thật sự hết hạn -------------------------- */

test("⭐ ttl_days của fact thật sự làm nó hết hạn (trước N26 chưa từng chạy)", async () => {
  const root = await project(`- id: F-A-001
  scope: P-thu
  statement: "file src/a/index.ts tồn tại"
  ttl_days: 1
  verify:
    run: "test -f src/a/index.ts"
`);
  try {
    await verifyFact(root);
    assert.equal((await stateOf(root)).freshness, "fresh");

    // Lùi mốc verify về 30 ngày trước, giữ nguyên mọi thứ khác.
    const graph = await loadGraph(root);
    const { appendEntry, defHash } = await import("../src/verify/ledger.js");
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const f = graph.facts.get("F-A-001")!.value;
    await appendEntry(root, {
      target: "F-A-001",
      kind: "probe",
      at: old,
      def: defHash(f.verify, f.statement),
      result: "pass",
      by: "test",
    });
    await writeFile(
      join(root, ".ganas/facts/a.yaml"),
      `- id: F-A-001
  scope: P-thu
  statement: "file src/a/index.ts tồn tại"
  ttl_days: 1
  verify:
    run: "test -f src/a/index.ts"
  last_verified_at: ${old}
  last_result: pass
`,
      "utf8",
    );

    assert.equal(
      (await stateOf(root)).freshness,
      "stale",
      "fact quá ttl_days phải hết hạn — cơ chế này khai từ đầu nhưng đọc sai cấp object nên chưa từng chạy",
    );
  } finally {
    await cleanup(root);
  }
});

/* --- N22: proof phải nằm trong sổ cái ------------------------------------- */

test("⭐ sổ cái ghi `proof`, và `--no-mutation` KHÔNG thành pass vĩnh viễn", async () => {
  const root = await project(FACT("file src/a/index.ts tồn tại"));
  try {
    const { needsRunFor } = await import("../src/commands/verify.js");
    const needsRunNow = async (r: string, t: typeof target) => {
      const g = await loadGraph(r);
      return needsRunFor(t, g, await computeFreshness(g));
    };
    const graph0 = await loadGraph(root);
    const target = factTarget(graph0.facts.get("F-A-001")!);

    // Chạy tắt: pass, nhưng chưa ai chứng minh probe có thể fail.
    const skipped = await runTarget(target, { root, by: "test", skipMutation: true });
    assert.equal(skipped.result, "pass");
    assert.equal(skipped.entry?.proof, undefined, "chạy tắt thì không có proof để ghi");

    // Trước N22, `needsRun` thấy `pass` là bỏ qua ⇒ probe rỗng ruột thoát vĩnh viễn.
    assert.match(
      (await needsRunNow(root, target)) ?? "",
      /mutation/,
      "lần chạy bỏ qua bóp méo phải được chạy lại, không được tính là xong",
    );

    // Chạy đủ: có proof, và lần sau không phải chạy lại nữa.
    const full = await runTarget(target, { root, by: "test" });
    assert.equal(full.entry?.proof, full.proof);
    assert.ok(full.entry?.proof, "chạy đủ thì phải ghi proof vào sổ cái");
    assert.equal(await needsRunNow(root, target), null);
  } finally {
    await cleanup(root);
  }
});
