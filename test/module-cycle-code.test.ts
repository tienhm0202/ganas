import assert from "node:assert/strict";
import { test } from "node:test";

import { loadGraph } from "../src/graph/load.js";
import type { Diagnostic } from "../src/graph/types.js";
import { validateGraph } from "../src/graph/validate.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

/**
 * `spine/module-cycle-code` phải THẬT SỰ đỏ được.
 *
 * `spine/module-cycle` chỉ soi `depends_on` ĐÃ KHAI, nên bản đồ khai thiếu là
 * bản đồ sạch: chu trình `M-graph-read ↔ M-load ↔ M-verify` sống nhiều tuần
 * dưới một `ganas validate` không một lỗi, và chỉ lộ ra khi có người ngồi khai
 * cạnh bằng tay (T-042). Mã mới đo trên IMPORT THẬT nên không giấu được kiểu
 * đó nữa — nhưng một validator chưa bao giờ đỏ là một validator chưa tồn tại,
 * nên ca DƯƠNG ở đây là phần quan trọng nhất của file.
 */

const CODE = "spine/module-cycle-code";

/** Hai khối, mỗi khối một thư mục — import giữa chúng do người gọi quyết. */
function project(alphaImport: string, betaImport: string): Record<string, string> {
  return {
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope("P-thu", { modules: ["M-alpha", "M-beta"] }),
    ".ganas/modules/M-alpha.yaml": moduleYaml("M-alpha", { paths: ["src/alpha/**"] }),
    ".ganas/modules/M-beta.yaml": moduleYaml("M-beta", { paths: ["src/beta/**"] }),
    "src/alpha/index.ts": `${alphaImport}\nexport const alpha = 1;\n`,
    "src/beta/index.ts": `${betaImport}\nexport const beta = 2;\n`,
  };
}

async function diagnose(files: Record<string, string>): Promise<Diagnostic[]> {
  const root = await makeProject(files);
  try {
    return validateGraph(await loadGraph(root));
  } finally {
    await cleanup(root);
  }
}

test("⭐ ca DƯƠNG: import vòng thật giữa hai khối ra lỗi spine/module-cycle-code", async () => {
  const diags = await diagnose(
    project(
      `import { beta } from "../beta/index.js";`,
      `import { alpha } from "../alpha/index.js";`,
    ),
  );

  const cycle = diags.find((d) => d.code === CODE);
  assert.ok(cycle, `phải phát ${CODE}, nhận được: ${diags.map((d) => d.code).join(", ")}`);
  assert.equal(cycle.severity, "error", "chu trình khối là lỗi CHẶN, không phải cảnh báo");
  assert.match(cycle.message, /M-alpha/);
  assert.match(cycle.message, /M-beta/);
  // Quy được về đúng file khai khối, không chỉ về "đâu đó trong dự án".
  assert.match(cycle.file, /M-(alpha|beta)\.yaml$/);
});

test("⭐ ca ÂM: không vòng thì KHÔNG được phát spine/module-cycle-code", async () => {
  // Beta không import ngược lại — chỉ còn một chiều M-beta → M-alpha.
  const diags = await diagnose(
    project(`import { beta } from "../beta/index.js";`, `export const only = 3;`),
  );

  assert.equal(
    diags.some((d) => d.code === CODE),
    false,
    `sơ đồ một chiều mà vẫn báo chu trình: ${JSON.stringify(diags.filter((d) => d.code === CODE))}`,
  );
});

test("hint chỉ ra cạnh chỉ mang `import type` — chỗ cắt rẻ nhất", async () => {
  // Chiều alpha → beta chỉ mang KIỂU, nên nó biến mất sau khi biên dịch:
  // chuyển kiểu xuống một khối lá là cắt được vòng mà không đụng luồng chạy.
  const diags = await diagnose(
    project(
      `import type { Beta } from "../beta/index.js";\nexport type Echo = Beta;`,
      `import { alpha } from "../alpha/index.js";\nexport type Beta = number;`,
    ),
  );

  const cycle = diags.find((d) => d.code === CODE);
  assert.ok(cycle, `phải phát ${CODE}`);
  assert.match(cycle.hint ?? "", /import type/);
  assert.match(cycle.hint ?? "", /M-alpha → M-beta \(chỉ `import type`\)/);
  // Cạnh mang giá trị KHÔNG được gắn nhãn đó — gắn nhầm là chỉ sai chỗ cắt.
  assert.equal(/M-beta → M-alpha \(chỉ `import type`\)/.test(cycle.hint ?? ""), false);
});

test("`import { type A, type B }` cũng là cạnh chỉ mang kiểu", async () => {
  // Dạng thứ hai của cùng một chuyện — bỏ sót nó thì `hint` chỉ sai chỗ cắt.
  const diags = await diagnose(
    project(
      `import { type Beta, type Gamma } from "../beta/index.js";\nexport type Echo = Beta | Gamma;`,
      `import { alpha } from "../alpha/index.js";\nexport type Beta = number;\nexport type Gamma = string;`,
    ),
  );

  const cycle = diags.find((d) => d.code === CODE);
  assert.ok(cycle, `phải phát ${CODE}`);
  assert.match(cycle.hint ?? "", /M-alpha → M-beta \(chỉ `import type`\)/);
});

test("một import GIÁ TRỊ lẫn vào là đủ để cạnh thôi 'chỉ mang kiểu'", async () => {
  // `import { type A, b }` kéo module kia vào lúc CHẠY, nên cạnh không rẻ nữa.
  const diags = await diagnose(
    project(
      `import { type Beta, beta } from "../beta/index.js";\nexport type Echo = Beta;\nexport const used = beta;`,
      `import { alpha } from "../alpha/index.js";\nexport type Beta = number;\nexport const beta = alpha;`,
    ),
  );

  const cycle = diags.find((d) => d.code === CODE);
  assert.ok(cycle, `phải phát ${CODE}`);
  assert.equal(/chỉ `import type`/.test(cycle.hint ?? ""), false);
  assert.match(cycle.hint ?? "", /khối LÁ/);
});

test("import ĐỘNG cũng dựng cạnh — cli.ts và flow.ts nạp module bằng đường đó", async () => {
  // Bỏ sót `import()` thì một chu trình có thật đi qua lớp lệnh vẫn vô hình.
  const diags = await diagnose(
    project(
      `export async function load() {\n  return await import("../beta/index.js");\n}`,
      `import { load } from "../alpha/index.js";\nexport const beta = load;`,
    ),
  );

  const cycle = diags.find((d) => d.code === CODE);
  assert.ok(cycle, `phải phát ${CODE} qua import động`);
  assert.equal(/chỉ `import type`/.test(cycle.hint ?? ""), false);
});

test("import trong CÙNG một khối không phải cạnh của sơ đồ khối", async () => {
  const diags = await diagnose({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope("P-thu", { modules: ["M-alpha"] }),
    ".ganas/modules/M-alpha.yaml": moduleYaml("M-alpha", { paths: ["src/alpha/**"] }),
    // Vòng THẬT giữa hai file, nhưng cả hai cùng một khối: sơ đồ KHỐI không
    // thấy gì, và đó là câu trả lời đúng — khối là đơn vị lan truyền độ tin.
    "src/alpha/a.ts": `import { b } from "./b.js";\nexport const a = b;\n`,
    "src/alpha/b.ts": `import { a } from "./a.js";\nexport const b = a;\n`,
  });

  assert.equal(
    diags.some((d) => d.code === CODE),
    false,
  );
});
