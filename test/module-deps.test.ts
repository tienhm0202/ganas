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
   * 72 cạnh code CÓ mà bản đồ CHƯA khai.
   *
   * Từ 67 xuống 66 ở T-041: `M-hook-io → M-hook-policy` biến mất vì kiểu
   * `HookInput`/`HookOutput` đã chuyển về lõi, cắt chu trình policy ↔ io
   * (PR-012).
   *
   * Từ 66 lên 72 ở T-042, và đây là ngoại lệ DUY NHẤT cho luật "chỉ ngắn đi":
   * `M-graph-read` bị CHẺ làm hai (`types.ts`+`paths.ts` sang khối lá
   * `M-graph-base`), nên một cạnh cũ đi tới khối cũ thành hai cạnh đi tới hai
   * khối mới. KHÔNG một import xuyên khối MỚI nào được thêm — mười một cạnh
   * `M-graph-base → …` xuất hiện, hai cạnh chỉ đổi tên khối đích, năm cạnh cũ
   * biến mất (`M-load → M-graph-read` cộng bốn cạnh `M-graph-read → …` đổi
   * chủ).
   *
   * `M-verify → M-cli-core` và `M-verify → M-hook-policy` thì KHÔNG mất, và
   * đó là cái giá đã trả có chủ đích: `verify/ledger.ts` TÁI XUẤT bốn tên đã
   * chuyển đi (`LEDGER_FILE`, `LEDGER_RESULT`, `LedgerResult`, `LedgerEntry`)
   * để `boundary.ts` và `hooks/policy/index.ts` — hai file NGOÀI phạm vi
   * `P-graph-core` — không phải đổi import trong cùng một task. Không tái xuất
   * thì `ganas commit` chỉ stage phần trong ranh giới task, và cây sắp commit
   * không typecheck nổi. Tiền lệ T-041. Dọn nốt hai cạnh này là việc của chính
   * P-cli và P-hook.
   *
   * KHÔNG thêm chúng vào `depends_on` một lượt: mỗi cạnh mới đẻ một
   * `uncovered-edge`, tức 72 hợp đồng cổng phải khai — việc lớn hơn hẳn và
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
    "M-fsprobe → M-graph-base",
    "M-fsprobe → M-hook-io",
    "M-fsprobe → M-render",
    "M-fsprobe → M-validate",
    "M-fsprobe → M-verify",
    "M-fsprobe → M-workflow",
    "M-graph-base → M-claim",
    "M-graph-base → M-cli-core",
    "M-graph-base → M-commands",
    "M-graph-base → M-graph-read",
    "M-graph-base → M-hook-io",
    "M-graph-base → M-hook-policy",
    "M-graph-base → M-load",
    "M-graph-base → M-render",
    "M-graph-base → M-templates",
    "M-graph-base → M-validate",
    "M-graph-base → M-workflow",
    "M-graph-read → M-claim",
    "M-graph-read → M-commands",
    "M-graph-read → M-hook-io",
    "M-graph-read → M-render",
    "M-graph-read → M-validate",
    "M-graph-read → M-workflow",
    "M-hook-io → M-commands",
    "M-load → M-commands",
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
    "M-util → M-graph-base",
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

/* --- Vế 3: sơ đồ khối phải KHÔNG có chu trình ----------------------------- */

/**
 * Tarjan: mọi thành phần liên thông mạnh của một đồ thị có hướng, trong một
 * lượt duyệt sâu. Thành phần cỡ > 1 nghĩa là có chu trình đi qua mọi khối
 * trong đó.
 */
function stronglyConnectedComponents(edges: Iterable<string>): string[][] {
  const adjacency = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const edge of edges) {
    const [from, to] = edge.split(" → ");
    nodes.add(from!);
    nodes.add(to!);
    const list = adjacency.get(from!);
    if (list) list.push(to!);
    else adjacency.set(from!, [to!]);
  }

  const index = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  const visit = (v: string): void => {
    index.set(v, counter);
    lowLink.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);

    for (const w of adjacency.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        lowLink.set(v, Math.min(lowLink.get(v)!, lowLink.get(w)!));
      } else if (onStack.has(w)) {
        lowLink.set(v, Math.min(lowLink.get(v)!, index.get(w)!));
      }
    }

    if (lowLink.get(v) === index.get(v)) {
      const component: string[] = [];
      for (;;) {
        const w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
        if (w === v) break;
      }
      components.push(component.sort());
    }
  };

  for (const v of nodes) if (!index.has(v)) visit(v);
  return components;
}

test("⭐ sơ đồ khối suy từ import thật không có chu trình", () => {
  /**
   * Sơ đồ khối có chu trình thì KHÔNG lan truyền được độ tin.
   *
   * Cả cơ chế của ganas dựng trên một phép suy một chiều: khối A đã có bằng
   * chứng, khối B chỉ phụ thuộc A ⇒ tin B tới đâu là hàm của độ tin của A.
   * Phép đó chỉ chạy được khi có thứ tự tô-pô — tức là khi đồ thị không có
   * chu trình. Trong một chu trình thì mỗi khối chờ độ tin của khối kia, và
   * không khối nào là điểm bắt đầu; "độ tin lan truyền" thành lập luận vòng.
   *
   * Đo trên chính tập cạnh suy từ IMPORT THẬT, không phải trên `depends_on`:
   * `depends_on` mới khai một phần cạnh (xem `MISSING_EDGES` ở trên), nên một
   * chu trình có thật trong code vẫn vô hình với bản đồ. Đúng thứ đã xảy ra:
   * đo ngày 2026-08-23 trước T-042 ra ĐÚNG MỘT thành phần liên thông mạnh cỡ
   * 3 — `M-graph-read ↔ M-load ↔ M-verify` (PR-013) — trong khi `ganas
   * validate` sạch không một lỗi.
   *
   * T-042 cắt nó bằng cách tách khối LÁ `M-graph-base` (`graph/types.ts` +
   * `graph/paths.ts`), không phải bằng cách bỏ bớt cạnh khai báo.
   */
  const cyclic = stronglyConnectedComponents(realEdges())
    .filter((component) => component.length > 1)
    .map((component) => component.join(" ↔ "))
    .sort();

  assert.deepEqual(
    cyclic,
    [],
    `Sơ đồ khối có CHU TRÌNH — độ tin không lan truyền được qua nó.\n` +
      `Cắt bằng cách tách phần dùng chung ra một khối lá, KHÔNG bằng cách\n` +
      `giấu cạnh: cạnh đo từ import thật, bản đồ khai thiếu không làm nó biến mất.\n` +
      cyclic.join("\n"),
  );
});
