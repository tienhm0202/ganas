import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";

import { parse } from "yaml";

import { matchesAny } from "../src/util/glob.js";

/**
 * `depends_on` của bản đồ phải khớp IMPORT THẬT trong code.
 *
 * Ba lỗi thật đã sống im lặng nhiều tuần trước khi test này tồn tại, và cả ba
 * chỉ lộ ra vì có người ngồi đọc code để khai hợp đồng cổng:
 *
 *  - `M-fsprobe → M-util` SAI CHIỀU từ T-019 — `fsprobe.ts` không import gì từ
 *    `M-util`; chiều thật ngược lại.
 *  - `M-cli → M-commands` SAI CHIỀU từ T-006 — `src/commands/*` không import gì
 *    từ `cli.ts`; `cli.ts` mới là bên nạp động rồi gọi `mod.run()`.
 *  - `M-render → M-workflow` LỖI THỜI — cạnh có từ lúc `search.ts` còn thuộc
 *    `M-workflow`; T-021 tách file đó sang `M-cli-core` mà cạnh không ai sửa.
 *
 * Không cái nào sinh cảnh báo, vì `computeDebt` chỉ kiểm những cạnh ĐÃ KHAI:
 * bản đồ càng thiếu càng sạch. Test này bịt đúng chiều khuyến khích ngược đó.
 */

const ROOT = join(import.meta.dirname, "..");

interface ModuleDoc {
  id: string;
  paths?: string[];
  depends_on?: string[];
}

function modules(): ModuleDoc[] {
  const dir = join(ROOT, ".ganas", "modules");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => parse(readFileSync(join(dir, f), "utf8")) as ModuleDoc);
}

function sourceFiles(dir = "src"): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...sourceFiles(rel));
    else if (e.name.endsWith(".ts")) out.push(rel);
  }
  return out;
}

/**
 * Cạnh `nguồn → đích` suy từ import thật.
 *
 * PHẢI bắt cả `import()` ĐỘNG: `cli.ts` nạp từng lệnh và `flow.ts` nạp
 * `boundary.js` đều đi đường đó. Bỏ sót thì hai cạnh ĐÚNG bị báo oan là "không
 * import nào đỡ" — đã vấp đúng chỗ này lúc đo lần đầu.
 */
function realEdges(): Set<string> {
  const mods = modules();
  const ownerOf = (f: string): string | undefined =>
    mods.find((m) => matchesAny(f, m.paths ?? []))?.id;

  const edges = new Set<string>();
  for (const f of sourceFiles()) {
    const from = ownerOf(f);
    if (!from) continue;
    const text = readFileSync(join(ROOT, f), "utf8");
    for (const m of text.matchAll(/(?:from|import\()\s*"(\.[^"]+)"/g)) {
      const abs = resolve(dirname(join(ROOT, f)), m[1]!.replace(/\.js$/, ".ts"));
      const to = ownerOf(relative(ROOT, abs));
      if (!to || to === from) continue;
      edges.add(`${to} → ${from}`);
    }
  }
  return edges;
}

function declaredEdges(): Set<string> {
  const out = new Set<string>();
  for (const m of modules()) for (const d of m.depends_on ?? []) out.add(`${d} → ${m.id}`);
  return out;
}

/* --- Vế 2: siết CHẶT, không có tập đóng nào ------------------------------- */

test("⭐ mọi depends_on phải có ít nhất một import thật đỡ nó", () => {
  // Vế bắt được cả ba lỗi kể trên. KHÔNG khai miễn trừ ở đây: một cạnh không
  // import nào đỡ là cạnh sai chiều hoặc đã chết, và cả hai đều phải sửa chứ
  // không phải ghi nhận.
  const real = realEdges();
  const unbacked = [...declaredEdges()].filter((e) => !real.has(e)).sort();

  assert.deepEqual(
    unbacked,
    [],
    `Cạnh khai trong \`depends_on\` mà KHÔNG import nào trong code đỡ.\n` +
      `Hoặc cạnh sai chiều, hoặc nó đã chết sau một lần tách khối.\n` +
      unbacked.join("\n"),
  );
});

/* --- Vế 1: tập ĐÓNG, chỉ được ngắn đi ------------------------------------ */

test("⭐ import xuyên khối chưa có depends_on: đúng bằng danh sách đã khai", () => {
  /**
   * 67 cạnh code CÓ mà bản đồ CHƯA khai (đo 2026-08-23).
   *
   * KHÔNG thêm chúng vào `depends_on` một lượt: mỗi cạnh mới đẻ một
   * `uncovered-edge`, tức 67 hợp đồng cổng phải khai — việc lớn hơn hẳn và
   * phải do người quyết.
   *
   * Tập ĐÓNG, so bằng `deepEqual`: thêm import xuyên khối mới mà quên khai
   * `depends_on` thì đỏ; khai xong một cạnh mà quên xoá dòng cũng đỏ. Danh
   * sách chỉ đi một chiều — ngắn dần.
   */
  const MISSING_EDGES = [
    "M-claim → M-cli-core",
    "M-claim → M-commands",
    "M-claim → M-workflow",
    "M-cli-core → M-cli",
    "M-cli-core → M-commands",
    "M-cli-core → M-mcp",
    "M-exec → M-commands",
    "M-exec → M-graph-read",
    "M-exec → M-util",
    "M-exec → M-workflow",
    "M-freshness → M-commands",
    "M-freshness → M-hook-io",
    "M-freshness → M-render",
    "M-freshness → M-workflow",
    "M-fsprobe → M-commands",
    "M-fsprobe → M-freshness",
    "M-fsprobe → M-graph-read",
    "M-fsprobe → M-hook-io",
    "M-fsprobe → M-render",
    "M-fsprobe → M-validate",
    "M-fsprobe → M-verify",
    "M-fsprobe → M-workflow",
    "M-graph-read → M-claim",
    "M-graph-read → M-cli-core",
    "M-graph-read → M-commands",
    "M-graph-read → M-hook-io",
    "M-graph-read → M-hook-policy",
    "M-graph-read → M-load",
    "M-graph-read → M-render",
    "M-graph-read → M-templates",
    "M-graph-read → M-validate",
    "M-graph-read → M-workflow",
    "M-hook-io → M-commands",
    "M-hook-io → M-hook-policy",
    "M-load → M-commands",
    "M-load → M-graph-read",
    "M-load → M-hook-io",
    "M-load → M-workflow",
    "M-model → M-cli-core",
    "M-model → M-commands",
    "M-model → M-exec",
    "M-model → M-freshness",
    "M-model → M-hook-io",
    "M-model → M-hook-policy",
    "M-model → M-render",
    "M-model → M-templates",
    "M-model → M-validate",
    "M-model → M-workflow",
    "M-render → M-hook-io",
    "M-util → M-cli",
    "M-util → M-cli-core",
    "M-util → M-commands",
    "M-util → M-freshness",
    "M-util → M-graph-read",
    "M-util → M-load",
    "M-util → M-mcp",
    "M-validate → M-commands",
    "M-validate → M-hook-io",
    "M-validate → M-workflow",
    "M-verify → M-cli-core",
    "M-verify → M-commands",
    "M-verify → M-graph-read",
    "M-verify → M-hook-io",
    "M-verify → M-hook-policy",
    "M-verify → M-load",
    "M-verify → M-validate",
    "M-workflow → M-hook-io",
  ].sort();

  const declared = declaredEdges();
  const missing = [...realEdges()].filter((e) => !declared.has(e)).sort();

  assert.deepEqual(
    missing,
    MISSING_EDGES,
    `Danh sách import xuyên khối chưa khai đã LỆCH khỏi tập đã đóng.\n` +
      `Thêm import xuyên khối mới: khai \`depends_on\` cho nó (và một hợp đồng cổng).\n` +
      `Vừa khai xong một cạnh: xoá dòng tương ứng khỏi MISSING_EDGES.`,
  );
});
