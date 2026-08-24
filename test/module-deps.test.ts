import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { loadGraph } from "../src/graph/load.js";
import type { Graph } from "../src/graph/types.js";
import { codeModuleEdges, validateGraph } from "../src/graph/validate.js";

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
 *
 * Từ T-043 phép đo KHÔNG còn nằm ở đây: `loadGraph` đọc import thật vào
 * `graph.codeImports`, `codeModuleEdges()` suy cạnh từ đó, và `validateGraph`
 * phát `spine/module-cycle-code`. Test gọi thẳng ba thứ đó — một phép đo, một
 * chỗ sửa. Bản Tarjan thứ hai từng sống ở file này đã bỏ: hai phép đo lệch
 * nhau là hỏng cả hai.
 */

const ROOT = join(import.meta.dirname, "..");

let cached: Graph | undefined;

/** Nạp graph của chính repo này đúng MỘT lần cho cả file. */
async function repoGraph(): Promise<Graph> {
  cached ??= await loadGraph(ROOT);
  return cached;
}

/** Cạnh `nguồn → đích` suy từ import thật — đúng phép đo mà validator dùng. */
async function realEdges(): Promise<Set<string>> {
  const edges = codeModuleEdges(await repoGraph());
  return new Set(edges.map((e) => `${e.to} → ${e.from}`));
}

async function declaredEdges(): Promise<Set<string>> {
  const out = new Set<string>();
  const graph = await repoGraph();
  for (const [id, m] of graph.modules) for (const d of m.value.depends_on) out.add(`${d} → ${id}`);
  return out;
}

/* --- Vế 2: siết CHẶT, không có tập đóng nào ------------------------------- */

test("⭐ mọi depends_on phải có ít nhất một import thật đỡ nó", async () => {
  // Vế bắt được cả ba lỗi kể trên. KHÔNG khai miễn trừ ở đây: một cạnh không
  // import nào đỡ là cạnh sai chiều hoặc đã chết, và cả hai đều phải sửa chứ
  // không phải ghi nhận.
  const real = await realEdges();
  const unbacked = [...(await declaredEdges())].filter((e) => !real.has(e)).sort();

  assert.deepEqual(
    unbacked,
    [],
    `Cạnh khai trong \`depends_on\` mà KHÔNG import nào trong code đỡ.\n` +
      `Hoặc cạnh sai chiều, hoặc nó đã chết sau một lần tách khối.\n` +
      unbacked.join("\n"),
  );
});

/* --- Vế 1: tập ĐÓNG, chỉ được ngắn đi ------------------------------------ */

test("⭐ import xuyên khối chưa có depends_on: đúng bằng danh sách đã khai", async () => {
  /**
   * 52 cạnh code CÓ mà bản đồ CHƯA khai.
   *
   * Từ 67 xuống 66 ở T-041: `M-hook-io → M-hook-policy` biến mất vì kiểu
   * `HookInput`/`HookOutput` đã chuyển về lõi, cắt chu trình policy ↔ io
   * (PR-012).
   *
   * Từ 66 lên 72 ở T-042, và đó là ngoại lệ THỨ NHẤT cho luật "chỉ ngắn đi":
   * `M-graph-read` bị CHẺ làm hai (`types.ts`+`paths.ts` sang khối lá
   * `M-graph-base`), nên một cạnh cũ đi tới khối cũ thành hai cạnh đi tới hai
   * khối mới. KHÔNG một import xuyên khối MỚI nào được thêm — mười một cạnh
   * `M-graph-base → …` xuất hiện, hai cạnh chỉ đổi tên khối đích, năm cạnh cũ
   * biến mất (`M-load → M-graph-read` cộng bốn cạnh `M-graph-read → …` đổi
   * chủ).
   *
   * Từ 72 lên 74 ở T-043, ngoại lệ THỨ HAI, và hai dòng mới có hai nguyên nhân
   * khác hẳn nhau:
   *
   *  - `M-exec → M-build` KHÔNG mới, nó chỉ vừa NHÌN THẤY ĐƯỢC. Bản đo cũ ở
   *    file này chỉ duyệt `src/`; validator duyệt mọi file `.ts` nằm trong
   *    `paths` của một khối, nên `release/version.test.ts` (thuộc `M-build`)
   *    lần đầu được tính — nó import `../src/util/exec.js` từ trước tới nay.
   *    Đây đúng là loại cạnh mà bản đo hẹp giấu đi.
   *  - `M-util → M-validate` thì MỚI thật: `codeModuleEdges()` cần `matchesAny`
   *    để quy file về khối. Không có đường nào tránh — phép quy file→khối phải
   *    THUẦN và phải trùng khít với `paths`, mà `matchesAny` là chỗ DUY NHẤT
   *    cài phép đó.
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
   * `uncovered-edge`, tức từng ấy hợp đồng cổng phải khai — việc lớn hơn hẳn
   * và phải do người quyết. PR-014 chẻ nó làm ba theo PHẠM VI.
   *
   * Từ 72 xuống 52 ở T-036, phần P-graph-core của PR-014: đúng 20 cạnh có ĐÍCH
   * thuộc P-graph-core được khai, và nguồn của cả 20 cũng nằm trong chín khối
   * của phạm vi đó — nên hai đầu (`depends_on` bên đích, `contract` hai bên)
   * khép kín được mà không phải chờ P-cli/P-hook. Bảng cổng do MÁY sinh từ
   * chữ ký thật (`node scripts/gen-ports.mjs --scope P-graph-core`), không
   * chép tay: `shape` so khớp từng ký tự nên chép tay là chắc chắn lệch.
   *
   * Ghi chú số đếm: đoạn T-043 ở trên nói 74 và số đó ĐÚNG lúc viết. Hai dòng
   * mất đi sau đó là do PR-014, không phải sai số: T-044 (commit:31752b8) gỡ
   * `M-verify → M-cli-core`, T-045 (commit:e6c78e7) gỡ `M-verify → M-hook-policy`
   * — cả hai là cạnh chết vì bốn file thôi nhập qua tái xuất của verify/ledger.
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
    "M-exec → M-build",
    "M-exec → M-commands",
    "M-exec → M-workflow",
    "M-freshness → M-commands",
    "M-freshness → M-hook-io",
    "M-freshness → M-render",
    "M-freshness → M-workflow",
    "M-fsprobe → M-commands",
    "M-fsprobe → M-hook-io",
    "M-fsprobe → M-render",
    "M-fsprobe → M-workflow",
    "M-graph-base → M-claim",
    "M-graph-base → M-cli-core",
    "M-graph-base → M-commands",
    "M-graph-base → M-hook-io",
    "M-graph-base → M-hook-policy",
    "M-graph-base → M-render",
    "M-graph-base → M-templates",
    "M-graph-base → M-workflow",
    "M-graph-read → M-claim",
    "M-graph-read → M-commands",
    "M-graph-read → M-hook-io",
    "M-graph-read → M-render",
    "M-graph-read → M-workflow",
    "M-hook-io → M-commands",
    "M-load → M-commands",
    "M-load → M-hook-io",
    "M-load → M-workflow",
    "M-model → M-cli-core",
    "M-model → M-commands",
    "M-model → M-hook-io",
    "M-model → M-hook-policy",
    "M-model → M-render",
    "M-model → M-templates",
    "M-model → M-workflow",
    "M-render → M-hook-io",
    "M-util → M-cli",
    "M-util → M-cli-core",
    "M-util → M-commands",
    "M-util → M-mcp",
    "M-validate → M-commands",
    "M-validate → M-hook-io",
    "M-validate → M-workflow",
    "M-verify → M-commands",
    "M-verify → M-hook-io",
    "M-workflow → M-hook-io",
  ].sort();

  const declared = await declaredEdges();
  const missing = [...(await realEdges())].filter((e) => !declared.has(e)).sort();

  assert.deepEqual(
    missing,
    MISSING_EDGES,
    `Danh sách import xuyên khối chưa khai đã LỆCH khỏi tập đã đóng.\n` +
      `Thêm import xuyên khối mới: khai \`depends_on\` cho nó (và một hợp đồng cổng).\n` +
      `Vừa khai xong một cạnh: xoá dòng tương ứng khỏi MISSING_EDGES.`,
  );
});

/* --- Vế 3: sơ đồ khối phải KHÔNG có chu trình ----------------------------- */

test("⭐ sơ đồ khối suy từ import thật không có chu trình", async () => {
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
   *
   * T-043 chuyển phép đo vào chính `validateGraph`, nên test này KHÔNG còn
   * bản Tarjan riêng: nó đòi đúng thứ `ganas validate` đòi. Một phép đo, một
   * chỗ sửa — bản thứ hai chỉ chờ ngày lệch khỏi bản thứ nhất.
   */
  const cycles = validateGraph(await repoGraph()).filter(
    (d) => d.code === "spine/module-cycle-code",
  );

  assert.deepEqual(
    cycles.map((d) => `${d.message}\n${d.hint ?? ""}`),
    [],
    `Sơ đồ khối có CHU TRÌNH — độ tin không lan truyền được qua nó.\n` +
      `Cắt bằng cách tách phần dùng chung ra một khối lá, KHÔNG bằng cách\n` +
      `giấu cạnh: cạnh đo từ import thật, bản đồ khai thiếu không làm nó biến mất.`,
  );

  assert.equal(
    cycles.every((d) => d.severity === "error"),
    true,
    "chu trình khối phải là lỗi CHẶN, không phải cảnh báo",
  );
});
