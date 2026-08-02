import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { loadGraph } from "../src/graph/load.js";
import { AdapterError, readEvalResult } from "../src/verify/adapters.js";
import { indexByTarget, lastFor, readLedger } from "../src/verify/ledger.js";
import { allTargets, factTarget, moduleTargets, runTarget } from "../src/verify/run.js";
import { cleanup, goal, makeProject } from "./helpers.js";

const RUN_OPTS = (root: string) => ({ root, by: "test" });

async function projectWithFacts(facts: string): Promise<string> {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/facts/a.yaml": facts,
  });
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "a.ts"), "export const CLOSING_DAY = 5;\n", "utf8");
  return root;
}

async function runFact(root: string, id: string) {
  const graph = await loadGraph(root);
  const sourced = graph.facts.get(id)!;
  return runTarget(factTarget(sourced), RUN_OPTS(root));
}

/* --- Probe: các kết quả cơ bản -------------------------------------------- */

test("probe đạt và bản bóp méo fail → pass, proof proven", async () => {
  const root = await projectWithFacts(`- id: F-A-001
  scope: P-thu
  statement: "file src/a.ts tồn tại"
  verify:
    run: "test -f src/a.ts"
`);
  try {
    const outcome = await runFact(root, "F-A-001");
    assert.equal(outcome.result, "pass");
    assert.equal(outcome.proof, "proven");
  } finally {
    await cleanup(root);
  }
});

test("probe fail → fail, kèm lý do đọc được", async () => {
  const root = await projectWithFacts(`- id: F-A-001
  scope: P-thu
  statement: "file src/khong-co.ts tồn tại"
  verify:
    run: "test -f src/khong-co.ts"
`);
  try {
    const outcome = await runFact(root, "F-A-001");
    assert.equal(outcome.result, "fail");
    assert.match(outcome.reason!, /mã 1/);
  } finally {
    await cleanup(root);
  }
});

test("⭐ probe pass nhưng bóp méo cũng pass → KHÔNG được tính là pass", async () => {
  const root = await projectWithFacts(`- id: F-A-001
  scope: P-thu
  statement: "thư mục src có tồn tại"
  verify:
    run: "ls src >/dev/null && echo 'src co ton tai'"
`);
  try {
    const outcome = await runFact(root, "F-A-001");
    assert.equal(
      outcome.result,
      "unprovable",
      "probe không thể fail mà trả pass thì nó rửa phỏng đoán thành sự thật",
    );
    assert.equal(outcome.proof, "cannot_fail");
    assert.match(outcome.reason!, /VẪN PASS/);
  } finally {
    await cleanup(root);
  }
});

test("probe tautological bị chặn TRƯỚC khi chạy", async () => {
  const root = await projectWithFacts(`- id: F-A-001
  scope: P-thu
  statement: "mọi thứ đều ổn"
  verify:
    run: "true"
`);
  try {
    const outcome = await runFact(root, "F-A-001");
    assert.equal(outcome.result, "unprovable");
    assert.equal(outcome.skipped, true, "không chạy thì mới thật sự là chặn");
  } finally {
    await cleanup(root);
  }
});

/* --- skip_if: KHÔNG phải fail --------------------------------------------- */

test("⭐ skip_if khớp → unavailable, KHÔNG phải failing", async () => {
  const root = await projectWithFacts(`- id: F-A-001
  scope: P-thu
  statement: "cần công cụ không có trên máy này"
  verify:
    run: "ganas-khong-ton-tai --check"
    skip_if: "! command -v ganas-khong-ton-tai"
`);
  try {
    const outcome = await runFact(root, "F-A-001");
    assert.equal(
      outcome.result,
      "unavailable",
      "báo fail sai độc ngang báo fresh sai — người ta sẽ học cách phớt lờ cảnh báo",
    );
    assert.match(outcome.reason!, /KHÔNG phải fail/);
  } finally {
    await cleanup(root);
  }
});

test("skip_if không khớp thì probe vẫn chạy bình thường", async () => {
  const root = await projectWithFacts(`- id: F-A-001
  scope: P-thu
  statement: "file src/a.ts tồn tại"
  verify:
    run: "test -f src/a.ts"
    skip_if: "! command -v sh"
`);
  try {
    assert.equal((await runFact(root, "F-A-001")).result, "pass");
  } finally {
    await cleanup(root);
  }
});

test("skip_if viết sai chính tả bị schema từ chối, không im lặng bỏ qua", async () => {
  const root = await projectWithFacts(`- id: F-A-001
  scope: P-thu
  statement: "s"
  verify:
    run: "test -f src/a.ts"
    skipif: "! command -v psql"
`);
  try {
    const graph = await loadGraph(root);
    assert.equal(graph.facts.size, 0, "fact sai schema không được nạp");
    const err = graph.loadDiagnostics.find((d) => d.code === "schema/unrecognized_keys");
    assert.ok(err, "trường lạ bị nuốt im lặng thì người viết tưởng mình có guard");
  } finally {
    await cleanup(root);
  }
});

/* --- Ghi sổ cái và ghi ngược YAML ----------------------------------------- */

test("mỗi lần chạy để lại đúng một dòng sổ cái", async () => {
  const root = await projectWithFacts(`- id: F-A-001
  scope: P-thu
  statement: "file src/a.ts tồn tại"
  verify:
    run: "test -f src/a.ts"
`);
  try {
    await runFact(root, "F-A-001");
    await runFact(root, "F-A-001");
    const entries = await readLedger(root);
    assert.equal(entries.length, 2);
    assert.equal(entries[0]!.target, "F-A-001");
    assert.ok(entries[0]!.def.length > 0, "phải ghi vân tay định nghĩa");
  } finally {
    await cleanup(root);
  }
});

test("kết quả pass được ghi ngược vào YAML và khớp sổ cái", async () => {
  const root = await projectWithFacts(`- id: F-A-001
  scope: P-thu
  statement: "file src/a.ts tồn tại"
  verify:
    run: "test -f src/a.ts"
`);
  try {
    const outcome = await runFact(root, "F-A-001");
    const yaml = await readFile(join(root, ".ganas/facts/a.yaml"), "utf8");
    assert.match(yaml, /last_verified_at:/);
    assert.match(yaml, /last_result: pass/);

    const graph = await loadGraph(root);
    const fact = graph.facts.get("F-A-001")!.value;
    const entry = lastFor(graph.ledger, "F-A-001")!;
    assert.equal(fact.last_verified_at, entry.at, "YAML và sổ cái phải trỏ cùng một lần chạy");
    assert.equal(outcome.entry!.at, entry.at);
  } finally {
    await cleanup(root);
  }
});

test("unavailable KHÔNG ghi ngược last_verified_at", async () => {
  const root = await projectWithFacts(`- id: F-A-001
  scope: P-thu
  statement: "cần công cụ không có"
  verify:
    run: "ganas-khong-ton-tai"
    skip_if: "! command -v ganas-khong-ton-tai"
`);
  try {
    await runFact(root, "F-A-001");
    const yaml = await readFile(join(root, ".ganas/facts/a.yaml"), "utf8");
    assert.equal(
      /last_verified_at:/.test(yaml),
      false,
      '"không kiểm được" mà đặt last_verified_at thì fact trông như đã kiểm',
    );
    assert.equal((await readLedger(root)).length, 1, "vẫn ghi sổ cái để có vết");
  } finally {
    await cleanup(root);
  }
});

test("verify thật rồi validate → không còn unbacked-verification", async () => {
  const root = await projectWithFacts(`- id: F-A-001
  scope: P-thu
  statement: "file src/a.ts tồn tại"
  verify:
    run: "test -f src/a.ts"
`);
  try {
    await runFact(root, "F-A-001");
    const { validateGraph } = await import("../src/graph/validate.js");
    const codes = validateGraph(await loadGraph(root)).map((d) => d.code);
    assert.equal(codes.includes("knowledge/unbacked-verification"), false);
    assert.equal(codes.includes("knowledge/fact-never-verified"), false);
  } finally {
    await cleanup(root);
  }
});

/* --- Eval: adapter --------------------------------------------------------- */

const OUT = "/tmp/ganas-test-eval-out.json";

test("adapter json đọc score trực tiếp", async () => {
  const r = await readEvalResult("json", "/khong/ton/tai", JSON.stringify({ score: 0.92, n: 50 }));
  assert.equal(r.score, 0.92);
  assert.equal(r.n, 50);
});

test("adapter json suy score từ passed/n khi thiếu score", async () => {
  const r = await readEvalResult("json", OUT, JSON.stringify({ passed: 46, failed: 4 }));
  assert.equal(r.score, 0.92);
  assert.equal(r.n, 50);
});

test("adapter json từ chối score ngoài 0..1", async () => {
  await assert.rejects(
    () => readEvalResult("json", OUT, JSON.stringify({ score: 92 })),
    AdapterError,
  );
});

test("adapter promptfoo đọc results.stats", async () => {
  const r = await readEvalResult(
    "promptfoo",
    OUT,
    JSON.stringify({ results: { stats: { successes: 45, failures: 5 } } }),
  );
  assert.equal(r.score, 0.9);
  assert.equal(r.passed, 45);
  assert.equal(r.n, 50);
});

test("adapter promptfoo báo lỗi khi chạy 0 ca", async () => {
  await assert.rejects(
    () =>
      readEvalResult(
        "promptfoo",
        OUT,
        JSON.stringify({ results: { stats: { successes: 0, failures: 0 } } }),
      ),
    AdapterError,
  );
});

test("vớt được JSON lẫn trong log của runner", async () => {
  const noisy = `> npm run eval\nđang chạy...\n{"score":0.88,"n":25}\nxong.`;
  const r = await readEvalResult("json", OUT, noisy);
  assert.equal(r.score, 0.88);
});

test("runner không ghi gì → AdapterError, không phải kết luận sai", async () => {
  await assert.rejects(() => readEvalResult("json", "/khong/ton/tai", ""), AdapterError);
});

/* --- Eval: chấm theo ngưỡng và margin -------------------------------------- */

async function projectWithEval(threshold: number, margin: number, score: number): Promise<string> {
  const root = await makeProject({
    ".ganas/modules/M-intent.yaml": `id: M-intent
title: "Phân loại ý định"
nature: llm
paths: ["src/intent/**"]
status: implemented
verify:
  - id: V-smoke
    kind: eval
    run: "printf '{\\"score\\":${score},\\"n\\":50,\\"passed\\":${Math.round(score * 50)}}' > $GANAS_EVAL_OUT"
    threshold: ${threshold}
    margin: ${margin}
`,
  });
  return root;
}

async function runEvalOf(root: string) {
  const graph = await loadGraph(root);
  const target = moduleTargets(graph.modules.get("M-intent")!)[0]!;
  return runTarget(target, RUN_OPTS(root));
}

test("eval trên ngưỡng → pass", async () => {
  const root = await projectWithEval(0.9, 0.03, 0.95);
  try {
    const outcome = await runEvalOf(root);
    assert.equal(outcome.result, "pass");
    assert.equal(outcome.score, 0.95);
  } finally {
    await cleanup(root);
  }
});

test("eval dưới ngưỡng → fail, nêu rõ điểm và số ca", async () => {
  const root = await projectWithEval(0.9, 0.03, 0.82);
  try {
    const outcome = await runEvalOf(root);
    assert.equal(outcome.result, "fail");
    assert.match(outcome.reason!, /0\.820 dưới ngưỡng 0\.9/);
    assert.match(outcome.reason!, /41\/50/);
  } finally {
    await cleanup(root);
  }
});

test("⭐ điểm 0.91 với ngưỡng 0.9 margin 0.03 → marginal, KHÔNG phải pass", async () => {
  const root = await projectWithEval(0.9, 0.03, 0.91);
  try {
    const outcome = await runEvalOf(root);
    assert.equal(
      outcome.result,
      "marginal",
      "eval có nhiễu — coi 0.91 là đạt khi ngưỡng 0.9 chỉ là tự lừa mình",
    );
    assert.match(outcome.reason!, /vùng nhiễu/);
  } finally {
    await cleanup(root);
  }
});

test("margin = 0 thì đúng ngưỡng là pass", async () => {
  const root = await projectWithEval(0.9, 0, 0.9);
  try {
    assert.equal((await runEvalOf(root)).result, "pass");
  } finally {
    await cleanup(root);
  }
});

test("runner hỏng → unprovable, KHÔNG phải fail", async () => {
  const root = await makeProject({
    ".ganas/modules/M-intent.yaml": `id: M-intent
title: "Phân loại ý định"
nature: llm
paths: ["src/intent/**"]
status: implemented
verify:
  - id: V-smoke
    kind: eval
    run: "echo 'khong phai json'"
    threshold: 0.9
`,
  });
  try {
    const outcome = await runEvalOf(root);
    assert.equal(
      outcome.result,
      "unprovable",
      "runner hỏng ≠ khối sai; gọi nhầm thành fail là báo động giả",
    );
    assert.match(outcome.reason!, /không đọc được kết quả eval/);
  } finally {
    await cleanup(root);
  }
});

test("sổ cái của eval ghi ngưỡng và điểm", async () => {
  const root = await projectWithEval(0.9, 0.03, 0.95);
  try {
    await runEvalOf(root);
    const entry = lastFor(indexByTarget(await readLedger(root)), "M-intent/V-smoke")!;
    assert.equal(entry.kind, "eval");
    assert.equal(entry.score, 0.95);
    assert.equal(entry.threshold, 0.9);
  } finally {
    await cleanup(root);
  }
});

/* --- Liệt kê target -------------------------------------------------------- */

test("allTargets gom cả fact, khối và phần", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/facts/a.yaml": `- id: F-A-001
  scope: P-thu
  statement: "s"
  verify:
    run: "test -f src/a.ts"
`,
    ".ganas/scopes/P-x.yaml": `id: P-x
title: "Phạm vi"
version: 0.1.0
modules: [M-a]
entry: M-a
acceptance:
  - id: V-e2e
    kind: eval
    run: "x"
    threshold: 0.8
`,
    ".ganas/modules/M-a.yaml": `id: M-a
scope: P-x
title: "Khối"
nature: code
paths: ["src/a/**"]
status: implemented
verify:
  - id: V-unit
    kind: probe
    run: "test -f src/a/index.ts"
`,
  });
  try {
    const ids = allTargets(await loadGraph(root))
      .map((t) => t.id)
      .sort();
    assert.deepEqual(ids, ["F-A-001", "M-a/V-unit", "P-x/V-e2e"]);
  } finally {
    await cleanup(root);
  }
});

/* --- Hạn mức chi phí ------------------------------------------------------- */

test("⭐ hạn mức chặn TRƯỚC khi chạy eval đắt, không phải sau", async () => {
  const root = await makeProject({
    ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối"
nature: llm
paths: ["src/a/**"]
status: implemented
verify:
  - id: V-re
    kind: eval
    run: "printf '{\\"score\\":1,\\"n\\":10,\\"cost_usd\\":0.10}' > $GANAS_EVAL_OUT"
    threshold: 0.9
  - id: V-dat
    kind: eval
    run: "printf '{\\"score\\":1,\\"n\\":10,\\"cost_usd\\":5.00}' > $GANAS_EVAL_OUT"
    threshold: 0.9
`,
  });
  try {
    const { run } = await import("../src/commands/verify.js");
    const argv = {
      positional: [],
      options: { root, "max-cost-usd": "1" },
      flags: { all: true },
      passthrough: [],
    };

    // Lần 1: chưa có lịch sử ⇒ không ước tính được, cả hai đều chạy.
    await run(argv);
    const first = await readLedger(root);
    assert.equal(first.length, 2, "lần đầu không có gì để ước tính");

    // Lần 2: sổ cái đã biết V-dat tốn $5 ⇒ phải dừng trước nó.
    await run(argv);
    const second = (await readLedger(root)).slice(first.length);
    assert.deepEqual(
      second.map((e) => e.target),
      ["M-a/V-re"],
      "eval $5 phải bị chặn trước khi chạy, không phải sau khi đã tiêu",
    );
  } finally {
    await cleanup(root);
  }
});
