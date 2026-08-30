import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import type { Freshness } from "../src/model/index.js";
import { allTargets, artifactTargets, runTarget, scopeOfTarget } from "../src/verify/run.js";
import { cleanup, goal, makeProject, moduleYaml, scope } from "./helpers.js";

const RUN = (root: string) => ({ root, by: "test" });
const SHAPE = "(userId: string) => Date | null";
const TARGET = "D-001/A-last-login";

function designWithArtifact(shape = SHAPE): string {
  return `id: D-001
title: "Design thử"
serves:
  - G-001
summary: "Cách tiếp cận"
status: active
artifacts:
  - id: A-last-login
    kind: function
    module: M-a
    shape: "${shape}"
    probe:
      run: "grep -q lastLogin src/a/x.ts"
      expect: exit_zero
`;
}

const CODE_OK = `export function lastLogin(userId: string): Date | null {
  return userId ? null : null;
}
`;

async function project(shape = SHAPE): Promise<string> {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designWithArtifact(shape),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  await mkdir(join(root, "src/a"), { recursive: true });
  await writeFile(join(root, "src/a/x.ts"), CODE_OK, "utf8");
  return root;
}

async function freshnessOfTarget(root: string): Promise<Freshness> {
  const graph = await loadGraph(root);
  return (await computeFreshness(graph)).get(TARGET)!.freshness;
}

async function verifyArtifact(root: string) {
  const graph = await loadGraph(root);
  const target = artifactTargets(graph.designs.get("D-001")!, graph)[0]!;
  return runTarget(target, RUN(root));
}

/* --- Bản vẽ phải là một target thật, không phải trường trang trí ---------- */

test("bản vẽ xuất hiện trong allTargets với khoá D-xxx/A-yyy", async () => {
  const root = await project();
  try {
    const graph = await loadGraph(root);
    const ids = allTargets(graph).map((t) => t.id);
    assert.ok(ids.includes(TARGET), `thiếu ${TARGET} trong ${JSON.stringify(ids)}`);
  } finally {
    await cleanup(root);
  }
});

test("context của bản vẽ là paths của khối — nếu không nó không bao giờ stale", async () => {
  const root = await project();
  try {
    const graph = await loadGraph(root);
    const target = artifactTargets(graph.designs.get("D-001")!, graph)[0]!;
    assert.deepEqual(target.context, ["src/a/**"]);
    // `definition` PHẢI là probe, không phải cả object bản vẽ: `runTarget` đọc
    // `definition.run`, đặt sai thì runShell(undefined) hỏng câm.
    assert.equal((target.definition as { run: string }).run, "grep -q lastLogin src/a/x.ts");
    // `shape` phải nằm trong statement — đó là chỗ nó đi vào defHash.
    assert.ok(target.statement.includes(SHAPE));
  } finally {
    await cleanup(root);
  }
});

test("bản vẽ chưa có probe thì không phát ra target rỗng ruột", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": `id: D-001
title: "Design thử"
serves:
  - G-001
summary: "Cách tiếp cận"
status: active
artifacts:
  - id: A-khong-probe
    kind: schema
    module: M-a
    shape: "users(id uuid pk)"
`,
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  });
  try {
    const graph = await loadGraph(root);
    assert.deepEqual(artifactTargets(graph.designs.get("D-001")!, graph), []);
  } finally {
    await cleanup(root);
  }
});

test("scopeOfTarget suy phạm vi qua khối của bản vẽ", async () => {
  const root = await project();
  try {
    const graph = await loadGraph(root);
    const target = artifactTargets(graph.designs.get("D-001")!, graph)[0]!;
    // Thiếu nhánh này thì `ganas verify --scope P-thu` im lặng bỏ hết bản vẽ.
    assert.equal(scopeOfTarget(target, graph), "P-thu");
  } finally {
    await cleanup(root);
  }
});

/* --- Ba loại lệch phải ra ba chẩn đoán KHÁC NHAU -------------------------- */

test("chưa verify lần nào ⇒ never_verified; verify xong ⇒ fresh", async () => {
  const root = await project();
  try {
    assert.equal(await freshnessOfTarget(root), "never_verified");
    const outcome = await verifyArtifact(root);
    assert.equal(outcome.result, "pass");
    assert.equal(await freshnessOfTarget(root), "fresh");
  } finally {
    await cleanup(root);
  }
});

test("sửa CODE trong khối ⇒ stale", async () => {
  const root = await project();
  try {
    await verifyArtifact(root);
    await writeFile(join(root, "src/a/x.ts"), `${CODE_OK}// đổi một dòng\n`, "utf8");
    assert.equal(await freshnessOfTarget(root), "stale");
  } finally {
    await cleanup(root);
  }
});

test("sửa SHAPE của bản vẽ ⇒ definition_changed, không phải stale", async () => {
  const root = await project();
  try {
    await verifyArtifact(root);
    // Đổi hợp đồng, không đụng code: đây là việc của vai thiết kế, và ganas phải
    // gọi tên nó khác hẳn với "code đã đổi".
    await writeFile(
      join(root, ".ganas/designs/D-001.yaml"),
      designWithArtifact("(userId: string) => Date"),
      "utf8",
    );
    assert.equal(await freshnessOfTarget(root), "definition_changed");
  } finally {
    await cleanup(root);
  }
});

test("code lệch hẳn bản vẽ ⇒ failing", async () => {
  const root = await project();
  try {
    await verifyArtifact(root);
    await writeFile(join(root, "src/a/x.ts"), "export function docLan(): null { return null; }\n", "utf8");
    const outcome = await verifyArtifact(root);
    assert.equal(outcome.result, "fail");
    assert.equal(await freshnessOfTarget(root), "failing");
  } finally {
    await cleanup(root);
  }
});
