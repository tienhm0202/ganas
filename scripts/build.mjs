#!/usr/bin/env node
/**
 * Build bản SHIP: một file bundle duy nhất ở `plugin/dist/cli.js`.
 *
 * Vì sao bundle chứ không phải `tsc` ra nhiều file: Claude Code cài plugin bằng
 * cách copy đúng thư mục `plugin/`. Mọi thứ nằm ngoài đó — `dist/` ở gốc,
 * `node_modules/` — đều KHÔNG tồn tại với bản đã cài. Trước P2 N30 bản build ở
 * gốc, nên mọi lần cài qua marketplace đều báo "thành công" rồi im lặng không
 * làm gì: đúng chế độ hỏng tệ nhất cho một công cụ mà giá trị là cưỡng chế.
 */
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

// zod/yaml (và @modelcontextprotocol/sdk) có nhánh CJS bên trong: bundle ESM
// phải cấp một `require` thật, nếu không sẽ nổ "Dynamic require of 'process'
// is not supported" lúc chạy.
const requireShim =
  "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);";

const shared = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // Đọc package.json lúc chạy là không được: cạnh bundle không có file đó.
  define: { __GANAS_VERSION__: JSON.stringify(pkg.version) },
  logLevel: "warning",
};

await build({
  ...shared,
  entryPoints: ["src/cli.ts"],
  outfile: "plugin/dist/cli.js",
  banner: { js: `#!/usr/bin/env node\n${requireShim}` },
});

// Entry point thứ hai — MCP server cho editor khác Claude Code (Cursor,
// Windsurf, …). Cùng ràng buộc "tự chứa" như bundle CLI: một file, không phụ
// thuộc gì ngoài `plugin/`.
await build({
  ...shared,
  entryPoints: ["src/mcp/server.ts"],
  outfile: "plugin/dist/mcp.js",
  banner: { js: `#!/usr/bin/env node\n${requireShim}` },
});
