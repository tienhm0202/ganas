import assert from "node:assert/strict";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import { validateGraph } from "../src/graph/validate.js";
import type { Freshness } from "../src/model/index.js";
import { factTarget, moduleTargets, runTarget } from "../src/verify/run.js";
import { check, cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

const RUN = (root: string) => ({ root, by: "test" });

/* --- Helper: dựng dự án, verify thật, rồi hỏi trạng thái ------------------ */

async function stateOf(
  root: string,
  targetId: string,
): Promise<{
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
  scope: P-thu
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
    // Đổi NỘI DUNG thật, và đẩy mtime lên tương lai để không phụ thuộc độ phân
    // giải đồng hồ của filesystem.
    const file = join(root, "src", "a.ts");
    await writeFile(file, "export const a = 2;\n", "utf8");
    const future = new Date(Date.now() + 60_000);
    await utimes(file, future, future);

    const s = await stateOf(root, "F-A-001");
    assert.equal(s.freshness, "stale");
    assert.match(s.reason, /src\/a\.ts/, "phải chỉ đích danh file, không nói chung chung");
  } finally {
    await cleanup(root);
  }
});

test("⭐ đổi MỖI mtime mà không đổi nội dung thì KHÔNG stale", async () => {
  const root = await factProject("test -f src/a.ts");
  try {
    await verifyFact(root, "F-A-001");
    const future = new Date(Date.now() + 60_000);
    await utimes(join(root, "src", "a.ts"), future, future);
    // Trước P2 N24 độ cũ tính bằng mtime, nên chạm vào đồng hồ là đổi kết luận.
    // Nay vân tay là NỘI DUNG: file không đổi thì bằng chứng vẫn còn nói đúng.
    assert.equal((await stateOf(root, "F-A-001")).freshness, "fresh");
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
  scope: P-thu
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
        scope: "P-thu",
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

test("brief liệt kê khối chạm tới, suy paths/entrypoints từ sơ đồ", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối A"
nature: code
paths: ["src/a/**"]
entrypoints: ["src/a/index.ts"]
status: implemented
verify:
  - id: V-a-probe
    kind: probe
    run: "true"
`,
  });
  try {
    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const { renderBrief } = await import("../src/render/brief.js");
    const { zTask } = await import("../src/model/index.js");

    const task = {
      value: zTask.parse({
        id: "T-001",
        title: "t",
        serves: ["G-001"],
        implements: "D-001",
        scope: "P-thu",
        touches: ["M-a", "M-ghost"],
        exit_contract: [{ kind: "command", run: "true" }],
      }),
      file: ".ganas/tasks/T-001.yaml",
    };

    const brief = renderBrief({ graph, task, freshness });
    assert.match(brief, /## Khối chạm tới \(suy từ sơ đồ\)/);
    assert.match(brief, /`M-a` — Khối A/);
    assert.match(brief, /`src\/a\/\*\*`/);
    assert.match(brief, /`src\/a\/index\.ts`/);
    assert.match(brief, /`M-ghost` — ⚠ \*\*KHÔNG TÌM THẤY\*\*/);
  } finally {
    await cleanup(root);
  }
});

test("brief không có mục 'Khối chạm tới' khi task không touches gì", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const { renderBrief } = await import("../src/render/brief.js");
    const { zTask } = await import("../src/model/index.js");
    const task = {
      value: zTask.parse({
        id: "T-001",
        title: "t",
        serves: ["G-001"],
        implements: "D-001",
        scope: "P-thu",
        exit_contract: [{ kind: "command", run: "true" }],
      }),
      file: ".ganas/tasks/T-001.yaml",
    };
    const brief = renderBrief({ graph, task, freshness });
    assert.doesNotMatch(brief, /Khối chạm tới/);
  } finally {
    await cleanup(root);
  }
});

/* --- Task.model → mục "Giao việc" của brief (N10, sửa ở N36) ---------------
 *
 * N10 chỉ in một dòng "Gợi ý giao việc: model X" lẫn trong danh sách skill.
 * Hệ quả quan sát được: task nào cũng chạy thẳng ở phiên chính bằng model
 * mạnh nhất. Từ N36, tier phải ra thành CHỈ DẪN GIAO VIỆC, và chỉ dẫn đó
 * khác nhau theo `config.harness` — vì chỉ Claude Code mới tạo được sub-agent
 * và chỉ định model cho nó. */

/** Dựng task trong bộ nhớ (không qua file) để hỏi thẳng brief. */
async function briefFor(root: string, extra: Record<string, unknown>): Promise<string> {
  const graph = await loadGraph(root);
  const freshness = await computeFreshness(graph);
  const { renderBrief } = await import("../src/render/brief.js");
  const { zTask } = await import("../src/model/index.js");
  return renderBrief({
    graph,
    task: {
      value: zTask.parse({
        id: "T-001",
        title: "t",
        serves: ["G-001"],
        implements: "D-001",
        scope: "P-thu",
        exit_contract: [{ kind: "command", run: "true" }],
        ...extra,
      }),
      file: ".ganas/tasks/T-001.yaml",
    },
    freshness,
  });
}

/** Dự án với `harness` khai sẵn trong config. */
async function projectWithHarness(harness: string): Promise<string> {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  await writeFile(
    join(root, ".ganas", "config.yaml"),
    `version: 1\nproject: "test"\nenforcement: enforce\nharness: ${harness}\n`,
    "utf8",
  );
  return root;
}

test("⭐ harness claude-code: brief bảo giao sub-agent, kèm alias model của tier", async () => {
  const root = await projectWithHarness("claude-code");
  try {
    const brief = await briefFor(root, { model: "verifier" });
    assert.match(brief, /## Giao việc/);
    assert.match(brief, /claude-sonnet-5/, "phải in model thật của tier");
    assert.match(brief, /model: "sonnet"/, "phải in alias Agent tool nhận được");
    assert.match(brief, /sub-agent/i, "phải nói rõ là giao đi, không tự làm");
    assert.match(brief, /ganas brief T-001/, "sub-agent phải tự lấy brief, không chép tay");
  } finally {
    await cleanup(root);
  }
});

test("⭐ harness cursor: brief KHÔNG bịa ra sub-agent, và nói thẳng là không cưỡng chế được", async () => {
  const root = await projectWithHarness("cursor");
  try {
    const brief = await briefFor(root, { model: "scribe" });
    assert.match(brief, /## Giao việc/);
    assert.match(brief, /claude-haiku-4-5/, "vẫn phải in model của tier");
    assert.match(brief, /khuyến nghị, không phải hàng rào/, "phải tự khai giới hạn");
    assert.doesNotMatch(
      brief,
      /Tạo sub-agent/,
      "MCP không tạo được agent con — dạy thao tác không tồn tại là dạy sai",
    );
  } finally {
    await cleanup(root);
  }
});

test("⭐ task thiếu model: brief mở đầu mục giao việc bằng cảnh báo, không im lặng bỏ qua", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const brief = await briefFor(root, {});
    assert.match(brief, /## Giao việc — ⚠ chưa ai quyết ai làm/);
    assert.match(brief, /model: main/, "phải chỉ đúng dòng cần thêm");
    assert.match(brief, /spine\/task-missing-model/, "phải dẫn tới luật kiểm được");
  } finally {
    await cleanup(root);
  }
});

test("brief vẫn liệt kê skills, tách khỏi mục giao việc", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const brief = await briefFor(root, { skills: ["gate"], model: "scribe" });
    assert.match(brief, /## Kỹ năng cần dùng cho task này/);
    assert.match(brief, /`\/gate`/);
    assert.doesNotMatch(
      brief.slice(brief.indexOf("## Kỹ năng cần dùng cho task này"), brief.indexOf("## Giao việc")),
      /claude-haiku/,
      "model không còn nấp trong mục kỹ năng nữa",
    );
  } finally {
    await cleanup(root);
  }
});

test("task chưa gán model bị validate cảnh báo, và task done thì không", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": task("T-001"),
  });
  assert.ok(codes.includes("spine/task-missing-model"), "task todo thiếu model phải bị nhắc");

  const withModel = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/tasks/T-001.yaml": task("T-001", { extra: "model: scribe\n" }),
  });
  assert.ok(!withModel.codes.includes("spine/task-missing-model"));
});

/* --- Giao song song: chỉ khi vùng code rời nhau ---------------------------- *
 *
 * Song song hoá là thứ dễ bán mà đắt khi sai: hai sub-agent sửa cùng file cùng
 * lúc thì cái sau đè cái trước và KHÔNG ai thấy. Vì vậy luật ở đây phải sai
 * theo hướng "không song song" chứ không bao giờ theo hướng ngược lại. */

/** Khối với glob tuỳ ý. */
function mod(id: string, paths: string): string {
  return `id: ${id}
title: "Khối ${id}"
nature: code
paths: ${paths}
status: implemented
verify:
  - id: V-${id}
    kind: probe
    run: "true"
`;
}

/** Task chạm đúng một khối, có sẵn tiêu chí kiểm cho khối đó. */
function taskTouching(id: string, moduleId: string, extra = ""): string {
  return `id: ${id}
title: "Task ${id}"
serves:
  - G-001
implements: D-001
scope: P-thu
status: todo
touches:
  - ${moduleId}
exit_contract:
  - kind: verification
    target: ${moduleId}/V-${moduleId}
${extra}`;
}

async function parallelBriefOf(files: Record<string, string>): Promise<string> {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/scopes/P-thu.yaml": scope({ modules: ["M-a", "M-b", "M-deep"] }),
    ...files,
  });
  try {
    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const { renderBrief } = await import("../src/render/brief.js");
    return renderBrief({ graph, task: graph.tasks.get("T-001")!, freshness });
  } finally {
    await cleanup(root);
  }
}

test("⭐ task vùng code rời nhau → brief bảo giao song song, kèm model từng cái", async () => {
  const brief = await parallelBriefOf({
    ".ganas/modules/M-a.yaml": mod("M-a", '["src/a/**"]'),
    ".ganas/modules/M-b.yaml": mod("M-b", '["src/b/**"]'),
    ".ganas/tasks/T-001.yaml": taskTouching("T-001", "M-a", "model: main\n"),
    ".ganas/tasks/T-002.yaml": taskTouching("T-002", "M-b", "model: scribe\n"),
  });
  assert.match(brief, /Giao được song song ngay bây giờ/);
  assert.match(brief, /`T-002`/);
  assert.match(brief, /model: "haiku"/, "mỗi task song song phải kèm model của tier nó");
  assert.match(brief, /ganas gate <id>/, "phải nói cách chấm từng cái");
});

test("⭐ glob lồng nhau (src/a/** vs src/a/deep/**) KHÔNG được coi là song song được", async () => {
  const brief = await parallelBriefOf({
    ".ganas/modules/M-a.yaml": mod("M-a", '["src/a/**"]'),
    ".ganas/modules/M-deep.yaml": mod("M-deep", '["src/a/deep/**"]'),
    ".ganas/tasks/T-001.yaml": taskTouching("T-001", "M-a", "model: main\n"),
    ".ganas/tasks/T-002.yaml": taskTouching("T-002", "M-deep", "model: scribe\n"),
  });
  assert.doesNotMatch(
    brief,
    /Giao được song song/,
    "vùng code lồng nhau: hai agent sẽ sửa cùng file mà không ai thấy",
  );
});

test("task chặn nhau, hoặc chưa khai touches, không vào danh sách song song", async () => {
  const blocked = await parallelBriefOf({
    ".ganas/modules/M-a.yaml": mod("M-a", '["src/a/**"]'),
    ".ganas/modules/M-b.yaml": mod("M-b", '["src/b/**"]'),
    ".ganas/tasks/T-001.yaml": taskTouching("T-001", "M-a", "model: main\n"),
    ".ganas/tasks/T-002.yaml": taskTouching(
      "T-002",
      "M-b",
      "model: scribe\nblocked_by:\n  - T-001\n",
    ),
  });
  assert.doesNotMatch(
    blocked,
    /Giao được song song/,
    "task chờ chính task này thì chờ, không song song",
  );

  const unknownArea = await parallelBriefOf({
    ".ganas/modules/M-a.yaml": mod("M-a", '["src/a/**"]'),
    ".ganas/modules/M-b.yaml": mod("M-b", '["src/b/**"]'),
    ".ganas/tasks/T-001.yaml": taskTouching("T-001", "M-a", "model: main\n"),
    ".ganas/tasks/T-002.yaml": `id: T-002
title: "Không khai chạm khối nào"
serves:
  - G-001
implements: D-001
scope: P-thu
status: todo
model: scribe
exit_contract:
  - kind: command
    run: "true"
`,
  });
  assert.doesNotMatch(
    unknownArea,
    /Giao được song song/,
    "không biết task kia đụng đâu thì không kết luận là an toàn",
  );
});

/* --- Module.skills gộp vào brief qua touches (N11) -------------------------- */

test("brief gộp skill của khối chạm tới dù task.skills rỗng", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối luật nội bộ"
nature: code
paths: ["src/a/**"]
status: implemented
skills:
  - adflex-legal-chunking
verify:
  - id: V-a-probe
    kind: probe
    run: "true"
`,
  });
  try {
    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const { renderBrief } = await import("../src/render/brief.js");
    const { zTask } = await import("../src/model/index.js");
    const task = {
      value: zTask.parse({
        id: "T-001",
        title: "t",
        serves: ["G-001"],
        implements: "D-001",
        scope: "P-thu",
        touches: ["M-a"],
        exit_contract: [{ kind: "command", run: "true" }],
      }),
      file: ".ganas/tasks/T-001.yaml",
    };
    const brief = renderBrief({ graph, task, freshness });
    assert.match(brief, /## Kỹ năng cần dùng cho task này/);
    assert.match(brief, /`\/adflex-legal-chunking`/);
  } finally {
    await cleanup(root);
  }
});

test("brief gộp skill trùng tên giữa task và khối chỉ hiện một lần", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối luật nội bộ"
nature: code
paths: ["src/a/**"]
status: implemented
skills:
  - adflex-legal-chunking
verify:
  - id: V-a-probe
    kind: probe
    run: "true"
`,
  });
  try {
    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const { renderBrief } = await import("../src/render/brief.js");
    const { zTask } = await import("../src/model/index.js");
    const task = {
      value: zTask.parse({
        id: "T-001",
        title: "t",
        serves: ["G-001"],
        implements: "D-001",
        scope: "P-thu",
        skills: ["adflex-legal-chunking"],
        touches: ["M-a"],
        exit_contract: [{ kind: "command", run: "true" }],
      }),
      file: ".ganas/tasks/T-001.yaml",
    };
    const brief = renderBrief({ graph, task, freshness });
    const occurrences = brief.match(/`\/adflex-legal-chunking`/g) ?? [];
    assert.equal(occurrences.length, 1, "skill trùng giữa task và khối phải dedupe");
  } finally {
    await cleanup(root);
  }
});

test("brief không có mục 'Kỹ năng cần dùng' khi task và mọi khối chạm tới đều không có skills, không model", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối trơn"
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
    const freshness = await computeFreshness(graph);
    const { renderBrief } = await import("../src/render/brief.js");
    const { zTask } = await import("../src/model/index.js");
    const task = {
      value: zTask.parse({
        id: "T-001",
        title: "t",
        serves: ["G-001"],
        implements: "D-001",
        scope: "P-thu",
        touches: ["M-a"],
        exit_contract: [{ kind: "command", run: "true" }],
      }),
      file: ".ganas/tasks/T-001.yaml",
    };
    const brief = renderBrief({ graph, task, freshness });
    assert.doesNotMatch(brief, /## Kỹ năng cần dùng cho task này/);
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

/* --- Cảnh báo độ dài brief -------------------------------------------------- */

test("brief ngắn (task tối thiểu) thì không có cảnh báo độ dài", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const { renderBrief } = await import("../src/render/brief.js");
    const { zTask } = await import("../src/model/index.js");
    const task = {
      value: zTask.parse({
        id: "T-001",
        title: "t",
        serves: ["G-001"],
        implements: "D-001",
        scope: "P-thu",
        exit_contract: [{ kind: "command", run: "true" }],
      }),
      file: ".ganas/tasks/T-001.yaml",
    };
    const brief = renderBrief({ graph, task, freshness });
    assert.doesNotMatch(brief, /Brief này dài/);
  } finally {
    await cleanup(root);
  }
});

test("brief phình to (nhiều must_read/open_questions) thì cảnh báo độ dài, nêu đúng ký tự", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const { renderBrief } = await import("../src/render/brief.js");
    const { zTask } = await import("../src/model/index.js");

    // Nhồi must_read + open_questions đủ dài để vượt ngưỡng cảnh báo — mô
    // phỏng task đã phình to thật, không phải số bịa.
    const mustRead = Array.from({ length: 60 }, (_, i) => ({
      path: `src/module-${i}/very/deep/nested/file-with-a-fairly-long-name-${i}.ts`,
      why:
        `Cần đọc để hiểu luồng xử lý dữ liệu số ${i} trước khi sửa logic tương ứng, ` +
        `tránh phá vỡ hợp đồng hiện có (lý do dài để mô phỏng nội dung thật).`,
    }));
    const openQuestions = Array.from(
      { length: 40 },
      (_, i) =>
        `Câu hỏi mở số ${i}: liệu cách tiếp cận X có tương thích với ràng buộc Y trong hệ ` +
        `thống hiện tại hay không, cần ai đó xác nhận trước khi triển khai tiếp?`,
    );

    const task = {
      value: zTask.parse({
        id: "T-001",
        title: "t",
        serves: ["G-001"],
        implements: "D-001",
        scope: "P-thu",
        context_contract: { must_read: mustRead, open_questions: openQuestions },
        exit_contract: [{ kind: "command", run: "true" }],
      }),
      file: ".ganas/tasks/T-001.yaml",
    };
    const brief = renderBrief({ graph, task, freshness });
    assert.match(brief, /> ⚠ Brief này dài ~\d[\d.]* ký tự \(~\d+ dòng\)/);
    const [, reportedChars] = brief.match(/Brief này dài ~([\d.]+) ký tự/) ?? [];
    assert.ok(reportedChars, "phải nêu con số ký tự");
    const n = Number(reportedChars);
    assert.ok(n > 14_000, `số ký tự báo cáo (${n}) phải vượt ngưỡng`);
    assert.ok(
      n < brief.length,
      "số báo cáo phải là phần ỔN ĐỊNH, nhỏ hơn brief đầy đủ (chưa tính header cảnh báo)",
    );
  } finally {
    await cleanup(root);
  }
});

test("cảnh báo độ dài nằm TRƯỚC phần biến động, không bị đẩy xuống cuối", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const { renderBrief } = await import("../src/render/brief.js");
    const { zTask } = await import("../src/model/index.js");

    const mustRead = Array.from({ length: 60 }, (_, i) => ({
      path: `src/module-${i}/very/deep/nested/file-with-a-fairly-long-name-${i}.ts`,
      why:
        `Cần đọc để hiểu luồng xử lý dữ liệu số ${i} trước khi sửa logic tương ứng, ` +
        `tránh phá vỡ hợp đồng hiện có (lý do dài để mô phỏng nội dung thật).`,
    }));
    const openQuestions = Array.from(
      { length: 40 },
      (_, i) =>
        `Câu hỏi mở số ${i}: liệu cách tiếp cận X có tương thích với ràng buộc Y trong hệ ` +
        `thống hiện tại hay không, cần ai đó xác nhận trước khi triển khai tiếp?`,
    );

    const task = {
      value: zTask.parse({
        id: "T-001",
        title: "t",
        serves: ["G-001"],
        implements: "D-001",
        scope: "P-thu",
        context_contract: { must_read: mustRead, open_questions: openQuestions },
        exit_contract: [{ kind: "command", run: "true" }],
      }),
      file: ".ganas/tasks/T-001.yaml",
    };
    const brief = renderBrief({ graph, task, freshness, volatile: "MOC-THOI-GIAN" });
    assert.match(brief, /Brief này dài/);
    const warningIndex = brief.indexOf("Brief này dài");
    const volatileIndex = brief.indexOf("MOC-THOI-GIAN");
    assert.ok(
      volatileIndex > warningIndex,
      "cảnh báo phải nằm trước phần biến động, không phải sau",
    );
    assert.ok(
      brief.endsWith("MOC-THOI-GIAN"),
      "phần biến động vẫn phải ở CUỐI dù có cảnh báo độ dài",
    );
  } finally {
    await cleanup(root);
  }
});

/* --- exit_contract kind verification phải hiện trong "Điều kiện hoàn thành" ----- */

test("brief liệt kê tiêu chí kind verification trong Điều kiện hoàn thành, không âm thầm bỏ sót", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const { renderBrief } = await import("../src/render/brief.js");
    const { zTask } = await import("../src/model/index.js");

    const task = {
      value: zTask.parse({
        id: "T-001",
        title: "t",
        serves: ["G-001"],
        implements: "D-001",
        scope: "P-thu",
        exit_contract: [
          { kind: "command", run: "true" },
          { kind: "verification", target: "M-intent/V-intent-eval" },
        ],
      }),
      file: ".ganas/tasks/T-001.yaml",
    };
    const brief = renderBrief({ graph, task, freshness });
    assert.match(brief, /## Điều kiện hoàn thành/);
    assert.match(
      brief,
      /bằng chứng `M-intent\/V-intent-eval`/,
      "tiêu chí kind: verification (thêm ở N7) từng bị switch trong brief.ts bỏ sót hoàn toàn",
    );
  } finally {
    await cleanup(root);
  }
});

/* --- Nghiệm thu mức PHẠM VI: trước M1′ nó không bao giờ stale ------------- */

/**
 * Bug được sửa ở M1′: `scopeTargets()` từng khai `context: scope.modules` — toàn
 * ID khối, không có `*` hay `/`, nên `globsOf()` lọc sạch và context rỗng. Hệ
 * quả: nghiệm thu ở mức phạm vi pass một lần rồi xanh VĨNH VIỄN, kể cả khi toàn
 * bộ code trong phạm vi đã bị viết lại. Đó là lời hứa rỗng — đúng loại lỗi mà
 * ganas sinh ra để chống, nằm ngay trong ganas.
 */
async function scopeProject(): Promise<string> {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/scopes/P-x.yaml": `id: P-x
title: "Luồng ghép"
version: 0.1.0
owner: "@ai"
status: active
modules: [M-a]
entry: M-a
acceptance:
  - id: V-e2e
    kind: probe
    run: "test -f src/a/index.ts"
`,
    ".ganas/modules/M-a.yaml": `id: M-a
scope: P-x
title: "Khối A"
nature: code
paths: ["src/a/**"]
status: implemented
verify:
  - id: V-unit
    kind: probe
    run: "test -f src/a/index.ts"
`,
  });
  await mkdir(join(root, "src", "a"), { recursive: true });
  await writeFile(join(root, "src", "a", "index.ts"), "export const a = 1;\n", "utf8");
  return root;
}

async function verifyScope(root: string, scopeId: string) {
  const graph = await loadGraph(root);
  const { scopeTargets } = await import("../src/verify/run.js");
  return runTarget(scopeTargets(graph.scopes.get(scopeId)!, graph)[0]!, RUN(root));
}

test("⭐ nghiệm thu phạm vi STALE khi code của khối thành viên đổi", async () => {
  const root = await scopeProject();
  try {
    const run = await verifyScope(root, "P-x");
    assert.equal(run.result, "pass");
    assert.equal((await stateOf(root, "P-x/V-e2e")).freshness, "fresh");

    // Viết lại code trong phạm vi, mốc thời gian sau lần verify.
    const later = new Date(Date.now() + 60_000);
    const file = join(root, "src", "a", "index.ts");
    await writeFile(file, "export const a = 2;\n", "utf8");
    await utimes(file, later, later);

    const after = await stateOf(root, "P-x/V-e2e");
    assert.equal(
      after.freshness,
      "stale",
      "code trong phạm vi đổi thì nghiệm thu luồng ghép không còn nói về luồng đó nữa",
    );
    assert.match(after.reason, /src\/a\/index\.ts/, "phải nêu ĐÚNG file nào đã đổi");
  } finally {
    await cleanup(root);
  }
});

test("phạm vi active mà thiếu nghiệm thu / thiếu người ký đều bị cảnh báo", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/scopes/P-tron.yaml": `id: P-tron
title: "Phạm vi thùng rác"
version: 0.1.0
status: active
modules: [M-a]
entry: M-a
`,
    ".ganas/modules/M-a.yaml": `id: M-a
scope: P-tron
title: "Khối A"
nature: code
paths: ["src/a/**"]
`,
  });
  assert.ok(
    codes.includes("scope/without-acceptance"),
    "không có cách nghiệm thu thì chỉ là cái nhãn",
  );
  assert.ok(codes.includes("scope/without-owner"), "không ai ký thì không ai nghiệm thu được");
});
