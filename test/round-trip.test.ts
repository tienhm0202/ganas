import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { needsRunFor } from "../src/commands/verify.js";
import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import { checkAllEdges, recordEdgeChecks } from "../src/graph/trace.js";
import { allTargets, runTarget } from "../src/verify/run.js";
import { cleanup, goal, makeProject } from "./helpers.js";

/**
 * BẤT BIẾN VÒNG TRÒN: **ghi rồi đọc lại thì phải khớp.**
 *
 * Vân tay bằng chứng được tính ở BỐN chỗ — `verify/run.ts` và `graph/trace.ts`
 * (ghi vào sổ cái), `graph/freshness.ts` và `graph/validate.ts` (so lại). Bốn
 * chỗ đó phải dùng đúng một công thức, nhưng không gì trong hệ ép chúng khớp:
 * sửa tham số ở ba chỗ mà quên chỗ thứ tư thì mọi bằng chứng loại đó âm thầm
 * thành `definition_changed` VĨNH VIỄN — verify xong vẫn báo cũ, và không test
 * đơn lẻ nào thấy được vì mỗi bên nhìn riêng đều đúng.
 *
 * Đúng chuyện đã xảy ra ở P2 N21 (thêm `statement` vào vân tay: phải sửa cả 4)
 * và P2 N24 (thêm vân tay nội dung file).
 *
 * Test này chạy đủ vòng — verify thật, rồi hỏi lại độ tươi — cho **mọi loại
 * target**. Nó không kiểm một hàm nào cả; nó kiểm rằng hai nửa của hệ thống
 * vẫn nói cùng một ngôn ngữ.
 */

async function fullProject(): Promise<string> {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/scopes/P-x.yaml": `id: P-x
title: "Phạm vi đủ loại bằng chứng"
version: 0.1.0
owner: "@t"
status: active
modules: [M-a, M-b]
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
contract:
  outputs:
    - name: ket_qua
      shape: "string"
verify:
  - id: V-a-probe
    kind: probe
    run: "test -f src/a/index.ts"
  - id: V-a-hop-dong
    kind: contract
    to: M-b
`,
    ".ganas/modules/M-b.yaml": `id: M-b
scope: P-x
title: "Khối B"
nature: code
paths: ["src/b/**"]
status: implemented
depends_on: [M-a]
contract:
  inputs:
    - name: ket_qua
      shape: "string"
verify:
  - id: V-b-probe
    kind: probe
    run: "test -f src/b/index.ts"
`,
    ".ganas/facts/f.yaml": `- id: F-A-001
  scope: P-x
  statement: "khối A có entrypoint"
  depends_on: ["src/a/**"]
  verify:
    run: "test -f src/a/index.ts"
`,
  });
  for (const d of ["a", "b"]) {
    await mkdir(join(root, "src", d), { recursive: true });
    await writeFile(join(root, "src", d, "index.ts"), `export const ${d} = 1;\n`, "utf8");
  }
  return root;
}

test("⭐ verify xong thì MỌI loại bằng chứng đều fresh — vân tay ghi và vân tay đọc phải khớp", async () => {
  const root = await fullProject();
  try {
    const graph = await loadGraph(root);
    for (const target of allTargets(graph)) {
      if (target.kind === "contract") continue; // cạnh hợp đồng do `trace` chạy
      await runTarget(target, { root, by: "test" });
    }

    const after = await loadGraph(root);
    const freshness = await computeFreshness(after);

    const notFresh = [...freshness.entries()]
      .filter(([id]) => !id.endsWith("/V-a-hop-dong"))
      .filter(([, s]) => s.freshness !== "fresh")
      .map(([id, s]) => `${id} → ${s.freshness} (${s.reason})`);

    assert.deepEqual(
      notFresh,
      [],
      `Vừa verify xong mà đã không fresh — vân tay lúc GHI khác vân tay lúc ĐỌC.\n` +
        `Nhiều khả năng một trong bốn chỗ gọi defHash() bị sửa mà ba chỗ kia thì không.\n` +
        notFresh.join("\n"),
    );
  } finally {
    await cleanup(root);
  }
});

test("⭐ trace xong thì cạnh hợp đồng cũng fresh — trace và freshness phải cùng công thức", async () => {
  const root = await fullProject();
  try {
    const graph = await loadGraph(root);
    // `trace` ghi sổ cái bằng đường RIÊNG, không đi qua `runTarget`. Đó chính là
    // chỗ dễ trôi nhất: sửa vân tay ở `verify/run.ts` mà quên `graph/trace.ts`
    // thì cạnh hợp đồng vừa kiểm xong đã bị coi là "định nghĩa đã đổi".
    const checks = await checkAllEdges(graph, root);
    assert.ok(checks.length > 0, "fixture phải có ít nhất một cạnh contract");
    await recordEdgeChecks(graph, checks, { root, by: "test" });

    const state = (await computeFreshness(await loadGraph(root))).get("M-a/V-a-hop-dong");
    assert.equal(
      state?.freshness,
      "fresh",
      `cạnh hợp đồng vừa kiểm xong phải fresh, nhận: ${state?.freshness} (${state?.reason})`,
    );
  } finally {
    await cleanup(root);
  }
});

test("⭐ `ganas verify` và brief phải nói CÙNG một điều về cùng một target", async () => {
  const root = await fullProject();
  try {
    const graph = await loadGraph(root);
    for (const t of allTargets(graph)) {
      if (t.kind !== "contract") await runTarget(t, { root, by: "test" });
    }

    // Đổi NỘI DUNG file mà khối A phụ thuộc.
    await writeFile(join(root, "src", "a", "index.ts"), "export const a = 2;\n", "utf8");

    const after = await loadGraph(root);
    const freshness = await computeFreshness(after);

    // Lỗi thật đã xảy ra (P2 N24): brief báo "CẦN VERIFY LẠI" trong khi
    // `ganas verify` báo "không có gì cần chạy", vì `needsRun` tự soi sổ cái và
    // bỏ qua file phụ thuộc. Hai đầu ra mâu thuẫn từ cùng một công cụ là cách
    // nhanh nhất để người dùng thôi tin cả hai.
    const disagree: string[] = [];
    for (const target of allTargets(after)) {
      if (target.kind === "contract") continue;
      const isFresh = freshness.get(target.id)?.freshness === "fresh";
      const needsRun = needsRunFor(target, after, freshness) !== null;
      if (isFresh === needsRun) {
        disagree.push(
          `${target.id}: freshness=${isFresh ? "fresh" : "không fresh"}, cần chạy=${needsRun}`,
        );
      }
    }

    assert.deepEqual(
      disagree,
      [],
      `\`ganas verify\` và brief bất đồng về cùng một target:\n${disagree.join("\n")}`,
    );
  } finally {
    await cleanup(root);
  }
});
