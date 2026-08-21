import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { loadGraph } from "../src/graph/load.js";
import { validateGraph } from "../src/graph/validate.js";
import { moduleGuideDir, modulePathsOverlap } from "../src/model/index.js";
import { cleanup, makeProject, moduleYaml, validSpine } from "./helpers.js";

/**
 * Hai luật bản đồ code: `scope/module-missing-guide` và
 * `scope/module-paths-overlap` — cùng `moduleGuideDir()`/`modulePathsOverlap()`
 * ở `src/model/module.ts` mà chúng dựa vào.
 *
 * CẢ HAI đều `warning`, không `error`. Đó là một quyết định của người dùng
 * (2026-08-21): ganas phải cài được lên dự án CŨ có cấu trúc khác, nên chỗ
 * lệch chỉ được ĐỀ XUẤT sửa, không được chặn.
 */

/* --- moduleGuideDir: khối phải NHẬN CẢ MỘT THƯ MỤC ------------------------ */

test("nhận cả thư mục bằng glob cây con → đó là thư mục gốc", () => {
  assert.equal(moduleGuideDir(["src/render/**"]), "src/render");
  assert.equal(moduleGuideDir(["src/render/**/*.ts"]), "src/render");
});

test("file lẻ thì KHÔNG có thư mục gốc — tiền tố chung là thư mục dùng chung", () => {
  // Đây là ca đắt nhất: `src` là nhà của mười khối khác, đặt file hướng dẫn
  // của riêng một khối ở đó là nói dối về phạm vi.
  assert.equal(moduleGuideDir(["src/cli.ts", "src/util/args.ts"]), undefined);
  assert.equal(moduleGuideDir([]), undefined);
});

test("nhận cả thư mục + kèm file lẻ ngoài đó vẫn có thư mục gốc", () => {
  // Đúng hình của M-build: `release/**` + package.json, guide nằm ở release/.
  assert.equal(moduleGuideDir(["release/**", "package.json"]), "release");
});

test("nhận HAI thư mục rời nhau → không có một chỗ đúng duy nhất", () => {
  assert.equal(moduleGuideDir(["src/a/**", "src/b/**"]), undefined);
});

/* --- modulePathsOverlap: phải CHÍNH XÁC, không thô như pathsOverlap ------- */

test("hai khối file lẻ trong cùng thư mục dùng chung KHÔNG bị coi là chồng nhau", () => {
  // Phép so thô (`pathsOverlap` ở graph/select.ts) trả true ở đây — đúng cho
  // câu hỏi "giao song song có an toàn không", nhưng đem làm cảnh báo thì nổ
  // 87 cảnh báo trên chính repo này.
  assert.equal(modulePathsOverlap(["src/util/glob.ts"], ["src/util/exec.ts"]), false);
  assert.equal(modulePathsOverlap(["src/cli.ts"], ["src/debt.ts"]), false);
});

test("file nằm TRONG cây con của khối kia → chồng nhau", () => {
  assert.equal(modulePathsOverlap(["src/render/**"], ["src/render/brief.ts"]), true);
});

test("hai cây con lồng nhau → chồng nhau", () => {
  assert.equal(modulePathsOverlap(["src/**"], ["src/render/**"]), true);
});

test("cùng một file khai ở hai khối → chồng nhau", () => {
  assert.equal(modulePathsOverlap(["package.json"], ["package.json"]), true);
});

/* --- Luật validate -------------------------------------------------------- */

const moduleClaimingDir = (id: string, dir: string): string =>
  `id: ${id}
scope: P-thu
title: "Khối ${id}"
nature: code
paths:
  - "${dir}/**"
status: surveyed
verify:
  - id: V-${id}-smoke
    kind: probe
    run: "npx tsx --test 'test/${id}.test.ts'"
    expect: exit_zero
`;

test("khối nhận cả thư mục mà thư mục đó không có file hướng dẫn → cảnh báo (KHÔNG phải lỗi)", async () => {
  const files = validSpine();
  files[".ganas/modules/M-a.yaml"] = moduleClaimingDir("M-a", "src/vung-a");
  files["src/vung-a/index.ts"] = "export const x = 1;\n";
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    const diag = validateGraph(graph).find((d) => d.code === "scope/module-missing-guide");
    assert.ok(diag, "phải cảnh báo khi thiếu file hướng dẫn của vùng");
    assert.equal(diag.severity, "warning", "KHÔNG được là error — ganas phải cài được lên hệ cũ");
    assert.match(diag.message, /src\/vung-a/);
  } finally {
    await cleanup(root);
  }
});

test("có file hướng dẫn đúng tên theo harness → im lặng", async () => {
  const files = validSpine();
  files[".ganas/modules/M-a.yaml"] = moduleClaimingDir("M-a", "src/vung-a");
  files["src/vung-a/index.ts"] = "export const x = 1;\n";
  const root = await makeProject(files);
  try {
    // `harness: claude-code` (mặc định) ⇒ tên file là CLAUDE.md.
    await mkdir(join(root, "src", "vung-a"), { recursive: true });
    await writeFile(join(root, "src", "vung-a", "CLAUDE.md"), "# vùng a\n", "utf8");

    const graph = await loadGraph(root);
    const codes = validateGraph(graph).map((d) => d.code);
    assert.ok(!codes.includes("scope/module-missing-guide"), JSON.stringify(codes));
  } finally {
    await cleanup(root);
  }
});

test("khối chỉ trỏ file lẻ thì KHÔNG bị đòi file hướng dẫn", async () => {
  const files = validSpine();
  // Khối mặc định của `validSpine()` nhận `src/a/**` (một thư mục) — thay bằng
  // hai file lẻ, đúng hình `M-cli` trong repo thật.
  files[".ganas/modules/M-a.yaml"] = moduleYaml("M-a", {
    paths: ["src/cli.ts", "src/util/args.ts"],
  });
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    const codes = validateGraph(graph).map((d) => d.code);
    assert.ok(!codes.includes("scope/module-missing-guide"), JSON.stringify(codes));
  } finally {
    await cleanup(root);
  }
});

test("hai khối cùng nhận một vùng code → scope/module-paths-overlap", async () => {
  const files = validSpine();
  files[".ganas/modules/M-a.yaml"] = moduleClaimingDir("M-a", "src/vung-a");
  files[".ganas/modules/M-b.yaml"] = moduleClaimingDir("M-b", "src/vung-a/con");
  files[".ganas/scopes/P-thu.yaml"] = files[".ganas/scopes/P-thu.yaml"]!.replace(
    "  - M-a\n",
    "  - M-a\n  - M-b\n",
  );
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    const diag = validateGraph(graph).find((d) => d.code === "scope/module-paths-overlap");
    assert.ok(diag, "phải bắt được hai khối chung vùng");
    assert.equal(diag.severity, "warning");
    assert.match(diag.message, /M-a.*M-b|M-b.*M-a/);
  } finally {
    await cleanup(root);
  }
});
