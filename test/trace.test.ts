import assert from "node:assert/strict";
import { test } from "node:test";

import { run as ganasTrace } from "../src/commands/trace.js";
import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import {
  checkAllEdges,
  computeDebt,
  contractEdges,
  recordEdgeChecks,
  renderDiagram,
} from "../src/graph/trace.js";
import { cleanup, makeProject } from "./helpers.js";

/** Bắt stdout của một lời gọi command run() — chưa có helper chung nào cho việc này. */
async function captureStdout(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  const original = process.stdout.write.bind(process.stdout);
  let out = "";
  process.stdout.write = (chunk: string) => {
    out += chunk;
    return true;
  };
  try {
    const code = await fn();
    return { code, out };
  } finally {
    process.stdout.write = original;
  }
}

/* --- Bộ dựng khối có cổng --------------------------------------------------- */

function moduleYaml(
  id: string,
  opts: {
    outputs?: Array<{ name: string; shape: string }>;
    inputs?: Array<{ name: string; shape: string; optional?: boolean }>;
    dependsOn?: string[];
    verify?: string[];
  } = {},
): string {
  const contract = `contract:
  outputs:
${(opts.outputs ?? []).map((p) => `    - name: ${p.name}\n      shape: "${p.shape}"`).join("\n") || "    []"}
  inputs:
${(opts.inputs ?? []).map((p) => `    - name: ${p.name}\n      shape: "${p.shape}"\n      optional: ${p.optional ?? false}`).join("\n") || "    []"}`;

  const verifyBlock =
    opts.verify && opts.verify.length > 0
      ? `verify:\n${opts.verify.map((v) => `  ${v}`).join("\n")}`
      : `verify:\n  - id: V-${id}-probe\n    kind: probe\n    run: "true"`;

  return `id: ${id}
title: "Khối ${id}"
nature: code
paths: ["src/${id}/**"]
status: implemented
depends_on:
${(opts.dependsOn ?? []).map((d) => `  - ${d}`).join("\n") || "  []"}
${contract}
${verifyBlock}
`;
}

/** Dòng cho một mục `verify` kind contract — 4 khoảng trắng để khớp cột `id` sau `- `. */
function contractVerify(idSuffix: string, to: string, run?: string): string {
  return (
    `- id: V-${idSuffix}\n    kind: contract\n    to: ${to}` + (run ? `\n    run: "${run}"` : "")
  );
}

async function graphOf(files: Record<string, string>) {
  const root = await makeProject(files);
  const graph = await loadGraph(root);
  return { root, graph };
}

/* --- Cổng khớp --------------------------------------------------------------- */

test("cổng khớp tên và kiểu → cạnh contract pass", async () => {
  const { root, graph } = await graphOf({
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", {
      outputs: [{ name: "text", shape: "string" }],
      verify: [
        `- id: V-a-probe\n    kind: probe\n    run: "true"`,
        `${contractVerify("a-to-b", "M-b")}`,
      ],
    }),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", {
      dependsOn: ["M-a"],
      inputs: [{ name: "text", shape: "string" }],
    }),
  });
  try {
    const checks = await checkAllEdges(graph, root);
    assert.equal(checks.length, 1);
    assert.equal(checks[0]!.result, "pass", JSON.stringify(checks[0]));
    assert.equal(checks[0]!.issues.length, 0);

    const debt = computeDebt(graph, checks);
    assert.deepEqual(
      debt.filter((d) => d.kind !== "unverified-module"),
      [],
    );
  } finally {
    await cleanup(root);
  }
});

/* --- Cổng thiếu ---------------------------------------------------------------- */

test("khối đích cần cổng khối nguồn không có → fail, nợ broken-contract", async () => {
  const { root, graph } = await graphOf({
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", {
      outputs: [{ name: "text", shape: "string" }],
      verify: [
        `- id: V-a-probe\n    kind: probe\n    run: "true"`,
        `${contractVerify("a-to-b", "M-b")}`,
      ],
    }),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", {
      dependsOn: ["M-a"],
      inputs: [{ name: "extra", shape: "string" }],
    }),
  });
  try {
    const checks = await checkAllEdges(graph, root);
    assert.equal(checks[0]!.result, "fail");
    assert.equal(checks[0]!.issues.length, 1);
    assert.match(checks[0]!.issues[0]!.reason, /extra/);

    const debt = computeDebt(graph, checks);
    const broken = debt.find((d) => d.kind === "broken-contract");
    assert.ok(broken, JSON.stringify(debt, null, 2));
  } finally {
    await cleanup(root);
  }
});

/* --- Cổng lệch kiểu -------------------------------------------------------------- */

test("cổng khớp tên nhưng lệch shape → fail", async () => {
  const { root, graph } = await graphOf({
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", {
      outputs: [{ name: "text", shape: "string" }],
      verify: [
        `- id: V-a-probe\n    kind: probe\n    run: "true"`,
        `${contractVerify("a-to-b", "M-b")}`,
      ],
    }),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", {
      dependsOn: ["M-a"],
      inputs: [{ name: "text", shape: "number" }],
    }),
  });
  try {
    const checks = await checkAllEdges(graph, root);
    assert.equal(checks[0]!.result, "fail");
    assert.match(checks[0]!.issues[0]!.reason, /lệch kiểu/);
  } finally {
    await cleanup(root);
  }
});

/* --- Cổng optional không bắt buộc phải có --------------------------------------- */

test("cổng vào optional thiếu ở nguồn vẫn pass", async () => {
  const { root, graph } = await graphOf({
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", {
      verify: [
        `- id: V-a-probe\n    kind: probe\n    run: "true"`,
        `${contractVerify("a-to-b", "M-b")}`,
      ],
    }),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", {
      dependsOn: ["M-a"],
      inputs: [{ name: "opt", shape: "string", optional: true }],
    }),
  });
  try {
    const checks = await checkAllEdges(graph, root);
    assert.equal(checks[0]!.result, "pass");
  } finally {
    await cleanup(root);
  }
});

/* --- Cạnh depends_on chưa có hợp đồng kiểm -------------------------------------- */

test("depends_on không có contract khớp → nợ uncovered-edge", async () => {
  const { root, graph } = await graphOf({
    ".ganas/modules/M-a.yaml": moduleYaml("M-a"),
    ".ganas/modules/M-c.yaml": moduleYaml("M-c", { dependsOn: ["M-a"] }),
  });
  try {
    const checks = await checkAllEdges(graph, root);
    assert.equal(checks.length, 0, "không có verify kind contract nào được khai");

    const debt = computeDebt(graph, checks);
    const uncovered = debt.find((d) => d.kind === "uncovered-edge");
    assert.ok(uncovered, JSON.stringify(debt, null, 2));
    assert.deepEqual(uncovered.edge, { from: "M-a", to: "M-c" });
  } finally {
    await cleanup(root);
  }
});

/* --- contractEdges() liệt kê đúng ------------------------------------------------ */

test("contractEdges liệt kê mọi cạnh contract khai trong verify", async () => {
  const { root, graph } = await graphOf({
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", {
      verify: [
        `- id: V-a-probe\n    kind: probe\n    run: "true"`,
        `${contractVerify("a-to-b", "M-b")}`,
        `${contractVerify("a-to-c", "M-c")}`,
      ],
    }),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", { dependsOn: ["M-a"] }),
    ".ganas/modules/M-c.yaml": moduleYaml("M-c", { dependsOn: ["M-a"] }),
  });
  try {
    const edges = contractEdges(graph);
    assert.equal(edges.length, 2);
    assert.deepEqual(edges.map((e) => e.to).sort(), ["M-b", "M-c"]);
  } finally {
    await cleanup(root);
  }
});

/* --- Sơ đồ Mermaid ---------------------------------------------------------------- */

test("renderDiagram in ra subgraph phần, cạnh depends_on, và nhãn hợp đồng", async () => {
  const { root, graph } = await graphOf({
    ".ganas/scopes/P-x.yaml": `id: P-x
title: "Phạm vi X"
version: 0.1.0
modules:
  - M-a
  - M-b
entry: M-a
`,
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", {
      outputs: [{ name: "text", shape: "string" }],
      verify: [
        `- id: V-a-probe\n    kind: probe\n    run: "true"`,
        `${contractVerify("a-to-b", "M-b")}`,
      ],
    }),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", {
      dependsOn: ["M-a"],
      inputs: [{ name: "text", shape: "string" }],
    }),
  });
  try {
    const diagram = renderDiagram(graph);
    assert.match(diagram, /flowchart LR/);
    assert.match(diagram, /subgraph P_x\["P-x \(0\.1\.0\)"\]/);
    assert.match(diagram, /M_a --> M_b/);
    assert.match(diagram, /M_a -\.->\|hợp đồng \?\| M_b/);
  } finally {
    await cleanup(root);
  }
});

/* --- Ghi sổ cái và freshness ------------------------------------------------------- */

test("recordEdgeChecks ghi sổ cái; freshness sau đó đọc lại đúng kết quả", async () => {
  const { root, graph } = await graphOf({
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", {
      outputs: [{ name: "text", shape: "string" }],
      verify: [
        `- id: V-a-probe\n    kind: probe\n    run: "true"`,
        `${contractVerify("a-to-b", "M-b")}`,
      ],
    }),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", {
      dependsOn: ["M-a"],
      inputs: [{ name: "text", shape: "string" }],
    }),
  });
  try {
    const before = await computeFreshness(graph);
    assert.equal(before.get("M-a/V-a-to-b")?.freshness, "never_verified");

    const checks = await checkAllEdges(graph, root);
    await recordEdgeChecks(graph, checks, { root, by: "test" });

    const graph2 = await loadGraph(root);
    const after = await computeFreshness(graph2);
    assert.equal(after.get("M-a/V-a-to-b")?.freshness, "fresh");
  } finally {
    await cleanup(root);
  }
});

/* --- CLI: --no-diagram ------------------------------------------------------------- */

test("ganas trace --no-diagram bỏ khối mermaid; mặc định thì có", async () => {
  const root = await makeProject({ ".ganas/modules/M-a.yaml": moduleYaml("M-a") });
  try {
    const withDiagram = await captureStdout(() =>
      ganasTrace({ positional: [], options: { root }, flags: {}, passthrough: [] }),
    );
    assert.match(withDiagram.out, /```mermaid/);

    // parseArgs() (src/util/args.ts) diễn dịch `--no-diagram` thành
    // `flags.diagram = false`, KHÔNG phải `flags["no-diagram"] = true` — mô
    // phỏng đúng shape thật, không phải đoán tên field.
    const withoutDiagram = await captureStdout(() =>
      ganasTrace({
        positional: [],
        options: { root },
        flags: { diagram: false },
        passthrough: [],
      }),
    );
    assert.doesNotMatch(
      withoutDiagram.out,
      /```mermaid/,
      "--no-diagram phải bỏ khối mermaid, không phải luôn in dù có cờ",
    );
  } finally {
    await cleanup(root);
  }
});
