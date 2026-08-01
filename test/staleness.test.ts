import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir, utimes } from "node:fs/promises";
import { join } from "node:path";
import { makeProject, cleanup, goal } from "./helpers.js";
import { loadGraph } from "../src/graph/load.js";
import { validateGraph } from "../src/graph/validate.js";
import { computeFreshness } from "../src/graph/freshness.js";
import { runTarget, factTarget, moduleTargets } from "../src/verify/run.js";
import type { Freshness } from "../src/model/index.js";

const RUN = (root: string) => ({ root, by: "test" });

/* --- Helper: dựng dự án, verify thật, rồi hỏi trạng thái ------------------ */

async function stateOf(root: string, targetId: string): Promise<{
  freshness: Freshness;
  reason: string;
  action?: string | undefined;
}> {
  const graph = await loadGraph(root);
  const s = (await computeFreshness(graph)).get(targetId)!;
  return { freshness: s.freshness, reason: s.reason, action: s.action };
}

async function verifyFact(root: string, id: string) {
  const graph = await loadGraph(root);
  return runTarget(factTarget(graph.facts.get(id)!), RUN(root));
}

async function verifyModule(root: string, moduleId: string) {
  const graph = await loadGraph(root);
  return runTarget(moduleTargets(graph.modules.get(moduleId)!)[0]!, RUN(root));
}

async function factProject(probeRun: string, dependsOn = '["src/**"]'): Promise<string> {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/facts/a.yaml": `- id: F-A-001
  statement: "file src/a.ts tồn tại"
  verify:
    run: ${JSON.stringify(probeRun)}
  depends_on: ${dependsOn}
`,
  });
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "a.ts"), "export const X = 1;\n", "utf8");
  return root;
}

/** Ghi đè probe trong YAML mà không đụng sổ cái. */
async function swapProbe(root: string, newRun: string): Promise<void> {
  const file = join(root, ".ganas", "facts", "a.yaml");
  const { readFile } = await import("node:fs/promises");
  const current = await readFile(file, "utf8");
  await writeFile(file, current.replace(/run: .*/, `run: ${JSON.stringify(newRun)}`), "utf8");
}

/* --- fresh --------------------------------------------------------------- */

test("verify xong thì fresh, lý do nêu ngày kiểm", async () => {
  const root = await factProject("test -f src/a.ts");
  try {
    await verifyFact(root, "F-A-001");
    const s = await stateOf(root, "F-A-001");
    assert.equal(s.freshness, "fresh");
    assert.match(s.reason, /kiểm lần cuối/);
  } finally {
    await cleanup(root);
  }
});

test("chưa verify → never_verified, kèm việc phải làm", async () => {
  const root = await factProject("test -f src/a.ts");
  try {
    const s = await stateOf(root, "F-A-001");
    assert.equal(s.freshness, "never_verified");
    assert.match(s.action!, /ganas verify/);
  } finally {
    await cleanup(root);
  }
});

/* --- ⭐ definition_changed: bịt cửa sau của sổ cái ------------------------- */

test("⭐ verify thật rồi thay ruột probe → definition_changed", async () => {
  const root = await factProject("test -f src/a.ts");
  try {
    await verifyFact(root, "F-A-001");
    assert.equal((await stateOf(root, "F-A-001")).freshness, "fresh");

    await swapProbe(root, "test -d src");

    const s = await stateOf(root, "F-A-001");
    assert.equal(
      s.freshness,
      "definition_changed",
      "không có luật này thì sổ cái chỉ chặn cửa trước: verify bằng probe thật rồi thay ruột",
    );
    assert.match(s.reason, /định nghĩa verify đã đổi/);
  } finally {
    await cleanup(root);
  }
});

test("thay ruột probe cũng bị validate bắt", async () => {
  const root = await factProject("test -f src/a.ts");
  try {
    await verifyFact(root, "F-A-001");
    await swapProbe(root, "test -d src");

    const codes = validateGraph(await loadGraph(root)).map((d) => d.code);
    assert.ok(codes.includes("knowledge/definition-changed"));
  } finally {
    await cleanup(root);
  }
});

test("đổi probe thành `true` bị bắt CẢ hai đường: tautological và definition-changed", async () => {
  const root = await factProject("test -f src/a.ts");
  try {
    await verifyFact(root, "F-A-001");
    await swapProbe(root, "true");

    const codes = validateGraph(await loadGraph(root)).map((d) => d.code);
    assert.ok(codes.includes("verify/tautological"), "probe rỗng ruột");
    assert.ok(codes.includes("knowledge/definition-changed"), "kết quả cũ không còn áp dụng");
  } finally {
    await cleanup(root);
  }
});

/* --- stale theo file phụ thuộc -------------------------------------------- */

test("file trong depends_on sửa sau lần verify → stale, nêu ĐÚNG file nào", async () => {
  const root = await factProject("test -f src/a.ts");
  try {
    await verifyFact(root, "F-A-001");
    // Đẩy mtime lên tương lai để không phụ thuộc độ phân giải đồng hồ.
    const future = new Date(Date.now() + 60_000);
    await utimes(join(root, "src", "a.ts"), future, future);

    const s = await stateOf(root, "F-A-001");
    assert.equal(s.freshness, "stale");
    assert.match(s.reason, /src\/a\.ts/, "phải chỉ đích danh file, không nói chung chung");
  } finally {
    await cleanup(root);
  }
});

/* --- Vân tay riêng của eval — ảo giác tầng LLM ---------------------------- */

const EVAL_RUN = `printf '{\\"score\\":0.95,\\"n\\":50}' > $GANAS_EVAL_OUT`;

async function evalProject(extra: string): Promise<string> {
  const root = await makeProject({
    ".ganas/modules/M-intent.yaml": `id: M-intent
title: "Phân loại ý định"
nature: llm
paths: ["src/intent/**"]
status: implemented
verify:
  - id: V-smoke
    kind: eval
    run: "${EVAL_RUN}"
    threshold: 0.9
${extra}`,
  });
  await mkdir(join(root, "src", "intent"), { recursive: true });
  await writeFile(join(root, "src", "intent", "prompt.md"), "Bạn là trợ lý.\n", "utf8");
  await writeFile(join(root, "evals.jsonl"), '{"case":1}\n', "utf8");
  return root;
}

async function editModule(root: string, from: string, to: string): Promise<void> {
  const file = join(root, ".ganas", "modules", "M-intent.yaml");
  const { readFile } = await import("node:fs/promises");
  await writeFile(file, (await readFile(file, "utf8")).replace(from, to), "utf8");
}

test("⭐ đổi `model` → model_changed, dù KHÔNG sửa một dòng code nào", async () => {
  const root = await evalProject(`    model: claude-sonnet-5\n`);
  try {
    await verifyModule(root, "M-intent");
    assert.equal((await stateOf(root, "M-intent/V-smoke")).freshness, "fresh");

    await editModule(root, "model: claude-sonnet-5", "model: claude-haiku-4-5");

    const s = await stateOf(root, "M-intent/V-smoke");
    assert.equal(
      s.freshness,
      "model_changed",
      '"eval đã pass" chỉ đúng với model lúc đó — provider đổi model là kết quả cũ vô nghĩa',
    );
    assert.match(s.reason, /claude-sonnet-5/);
    assert.match(s.reason, /claude-haiku-4-5/);
  } finally {
    await cleanup(root);
  }
});

test("⭐ sửa một ký tự trong file prompt → prompt_changed", async () => {
  const root = await evalProject(`    prompt: src/intent/prompt.md\n`);
  try {
    await verifyModule(root, "M-intent");
    assert.equal((await stateOf(root, "M-intent/V-smoke")).freshness, "fresh");

    await writeFile(join(root, "src", "intent", "prompt.md"), "Bạn là trợ lý!\n", "utf8");

    assert.equal((await stateOf(root, "M-intent/V-smoke")).freshness, "prompt_changed");
  } finally {
    await cleanup(root);
  }
});

test("⭐ thêm một ca vào dataset → dataset_changed", async () => {
  const root = await evalProject(`    dataset: evals.jsonl\n`);
  try {
    await verifyModule(root, "M-intent");
    assert.equal((await stateOf(root, "M-intent/V-smoke")).freshness, "fresh");

    await writeFile(join(root, "evals.jsonl"), '{"case":1}\n{"case":2}\n', "utf8");

    assert.equal((await stateOf(root, "M-intent/V-smoke")).freshness, "dataset_changed");
  } finally {
    await cleanup(root);
  }
});

test("model/prompt/dataset không đổi thì vẫn fresh", async () => {
  const root = await evalProject(
    `    model: claude-sonnet-5\n    prompt: src/intent/prompt.md\n    dataset: evals.jsonl\n`,
  );
  try {
    await verifyModule(root, "M-intent");
    assert.equal((await stateOf(root, "M-intent/V-smoke")).freshness, "fresh");
  } finally {
    await cleanup(root);
  }
});

/* --- Các kết cục của lần chạy gần nhất ------------------------------------ */

test("lần chạy trượt → failing, nói rõ phát biểu đang SAI", async () => {
  const root = await factProject("test -f src/khong-co.ts");
  try {
    await verifyFact(root, "F-A-001");
    const s = await stateOf(root, "F-A-001");
    assert.equal(s.freshness, "failing");
    assert.match(s.reason, /đang SAI/);
  } finally {
    await cleanup(root);
  }
});

test("skip_if khớp → unavailable, và lý do nói rõ KHÔNG phải fail", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/facts/a.yaml": `- id: F-A-001
  statement: "cần công cụ không có"
  verify:
    run: "ganas-khong-ton-tai"
    skip_if: "! command -v ganas-khong-ton-tai"
`,
  });
  try {
    await verifyFact(root, "F-A-001");
    const s = await stateOf(root, "F-A-001");
    assert.equal(s.freshness, "unavailable");
    assert.match(s.reason, /không phải là fail/i);
  } finally {
    await cleanup(root);
  }
});

test("eval sát ngưỡng → marginal, nêu điểm và ngưỡng", async () => {
  const root = await makeProject({
    ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối"
nature: llm
paths: ["src/a/**"]
status: implemented
verify:
  - id: V-smoke
    kind: eval
    run: "printf '{\\"score\\":0.91,\\"n\\":50}' > $GANAS_EVAL_OUT"
    threshold: 0.9
    margin: 0.03
`,
  });
  try {
    await verifyModule(root, "M-a");
    const s = await stateOf(root, "M-a/V-smoke");
    assert.equal(s.freshness, "marginal");
    assert.match(s.reason, /0\.910/);
    assert.match(s.reason, /0\.9/);
  } finally {
    await cleanup(root);
  }
});

test("probe rỗng ruột → unprovable", async () => {
  const root = await factProject("ls src >/dev/null && echo 'src co ton tai'");
  try {
    await verifyFact(root, "F-A-001");
    assert.equal((await stateOf(root, "F-A-001")).freshness, "unprovable");
  } finally {
    await cleanup(root);
  }
});

/* --- Brief in đúng lý do --------------------------------------------------- */

test("brief in ĐÚNG lý do cho từng trường hợp, không nói chung chung", async () => {
  const root = await factProject("test -f src/a.ts");
  try {
    await verifyFact(root, "F-A-001");
    await swapProbe(root, "test -d src");

    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const { renderBrief } = await import("../src/render/brief.js");

    // Task tối thiểu trỏ vào fact đó.
    const { zTask } = await import("../src/model/index.js");
    const task = {
      value: zTask.parse({
        id: "T-001",
        title: "t",
        serves: ["G-001"],
        implements: "D-001",
        sprint: "S-2026-08",
        context_contract: { facts: ["F-A-001"] },
        exit_contract: [{ kind: "command", run: "true" }],
      }),
      file: ".ganas/tasks/T-001.yaml",
    };

    const brief = renderBrief({ graph, task, freshness });
    assert.match(brief, /CẦN VERIFY LẠI/);
    assert.match(brief, /định nghĩa verify đã đổi/, "phải nêu đúng lý do, không nói 'đã cũ'");
    assert.match(brief, /chạy lại/);
  } finally {
    await cleanup(root);
  }
});

test("eval dao động quanh ngưỡng thì brief cho thấy xu hướng điểm", async () => {
  const root = await makeProject({
    ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối"
nature: llm
paths: ["src/a/**"]
status: implemented
verify:
  - id: V-smoke
    kind: eval
    run: "printf '{\\"score\\":0.88,\\"n\\":50}' > $GANAS_EVAL_OUT"
    threshold: 0.9
`,
  });
  try {
    await verifyModule(root, "M-a");
    await verifyModule(root, "M-a");
    const graph = await loadGraph(root);
    const s = (await computeFreshness(graph)).get("M-a/V-smoke")!;
    assert.deepEqual(s.recentScores, [0.88, 0.88], "hai lần chạy phải thấy được cả hai điểm");
  } finally {
    await cleanup(root);
  }
});
