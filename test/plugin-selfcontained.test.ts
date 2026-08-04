import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { runShell } from "../src/util/exec.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * PLUGIN PHẢI TỰ CHỨA.
 *
 * Claude Code cài plugin bằng cách copy đúng thư mục `plugin/` vào
 * `~/.claude/plugins/cache/…`. Mọi thứ nằm ngoài đó — `dist/` ở gốc repo,
 * `node_modules/` — KHÔNG tồn tại với bản đã cài.
 *
 * Trước P2 N30, `plugin/bin/ganas.mjs` nạp `../../dist/cli.js` (ngoài plugin) và
 * `dist/` lại nằm trong `.gitignore`. Hệ quả: cài qua marketplace thì Claude Code
 * báo "Successfully installed", `claude plugin details` liệt kê đủ 9 skill và 6
 * hook, và **ganas im lặng không làm gì**. Hook fail-open nên không có lỗi nào
 * nổi lên.
 *
 * Đó là chế độ hỏng tệ nhất có thể cho một công cụ mà toàn bộ giá trị là cưỡng
 * chế — tệ hơn cả `ganas adopt` (lệnh ma), vì lệnh ma ít nhất còn báo lỗi, còn
 * cái này báo THÀNH CÔNG.
 *
 * Test dựng lại đúng điều kiện đó: copy RIÊNG `plugin/` sang thư mục tạm, không
 * kèm gì khác, rồi chạy như Claude Code chạy.
 */

async function isolatedPlugin(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ganas-plugin-"));
  await cp(join(ROOT, "plugin"), dir, { recursive: true });
  return dir;
}

test("⭐ plugin chạy được khi copy RIÊNG thư mục plugin/, không kèm repo", async () => {
  const dir = await isolatedPlugin();
  try {
    const bin = join(dir, "bin", "ganas.mjs");
    const r = await runShell(`node ${JSON.stringify(bin)} --version`, {
      cwd: tmpdir(),
      timeoutMs: 30_000,
    });

    assert.equal(
      r.code,
      0,
      `plugin cô lập không chạy được — bản cài qua marketplace sẽ chết im lặng.\n` +
        `stdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.match(
      r.stdout.trim(),
      /^\d+\.\d+\.\d+/,
      `--version phải in phiên bản, nhận: ${r.stdout}`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("⭐ hook chạy sạch trong plugin cô lập — KHÔNG trả systemMessage 'đang bỏ qua kiểm soát'", async () => {
  const dir = await isolatedPlugin();
  try {
    const bin = join(dir, "bin", "ganas.mjs");
    const r = await runShell(
      `echo '{"session_id":"t","cwd":"${tmpdir()}","source":"startup"}' | ` +
        `node ${JSON.stringify(bin)} hook session-start`,
      { cwd: tmpdir(), timeoutMs: 30_000 },
    );

    assert.equal(r.code, 0, "hook luôn phải thoát 0");
    // Đây là dấu hiệu của bản cài hỏng: hook trả lời nhưng nói mình đang tắt.
    assert.doesNotMatch(
      r.stdout,
      /KHÔNG chạy|bỏ qua kiểm soát/,
      `hook đang báo tự tắt — nghĩa là bản cài thiếu build.\nstdout: ${r.stdout}`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("⭐ bundle không có shebang lạc ở giữa file", async () => {
  // Hai dòng `#!` (một của banner, một esbuild giữ lại từ `src/cli.ts`) khiến
  // file không `import()` được: "Invalid or unexpected token". Nó chỉ lộ ra khi
  // chạy thật, vì `node file.js` trực tiếp thì Node bỏ qua dòng đầu.
  const bundle = await readFile(join(ROOT, "plugin", "dist", "cli.js"), "utf8");
  const lines = bundle.split("\n");
  const shebangs = lines.map((l, i) => [l, i] as const).filter(([l]) => l.startsWith("#!"));

  assert.equal(shebangs.length, 1, `phải có đúng một shebang, thấy ${shebangs.length}`);
  assert.equal(shebangs[0]![1], 0, "shebang phải ở dòng đầu tiên");
});

test("⭐ MCP server chạy được khi copy RIÊNG thư mục plugin/, trả lời tools/list", async () => {
  const dir = await isolatedPlugin();
  try {
    const bin = join(dir, "bin", "ganas-mcp.mjs");
    const requests =
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      }) +
      "\n" +
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) +
      "\n";

    // Ghi request ra file thật thay vì nhét literal vào dòng lệnh shell — tránh
    // hố quote lồng nhau (JSON có dấu " và \n mà `runShell` chạy qua `shell: true`).
    const requestFile = join(dir, "mcp-requests.jsonl");
    await writeFile(requestFile, requests, "utf8");

    // stdio MCP server thoát khi stdin đóng — không cần kill tay, `runShell` chỉ
    // cần đủ timeout để process khởi động và trả lời.
    const r = await runShell(`cat ${JSON.stringify(requestFile)} | node ${JSON.stringify(bin)}`, {
      cwd: tmpdir(),
      timeoutMs: 15_000,
    });

    assert.equal(
      r.code,
      0,
      `MCP server cô lập không chạy được — bản cài qua marketplace sẽ chết im lặng.\n` +
        `stdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );

    const lines = r.stdout.trim().split("\n");
    const responses = lines.map(
      (l) => JSON.parse(l) as { id: number; result?: { tools?: unknown[] } },
    );
    const toolsList = responses.find((res) => res.id === 2);
    const tools = toolsList?.result?.tools;
    assert.ok(tools, `không thấy result.tools trong: ${r.stdout}`);
    assert.ok(tools.length >= 7, `mong ít nhất 7 tool, thấy ${tools.length}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("manifest plugin và marketplace khớp package.json", async () => {
  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
    version: string;
    bin: Record<string, string>;
  };
  const plugin = JSON.parse(
    await readFile(join(ROOT, "plugin", ".claude-plugin", "plugin.json"), "utf8"),
  ) as { name: string; version: string };
  const market = JSON.parse(
    await readFile(join(ROOT, ".claude-plugin", "marketplace.json"), "utf8"),
  ) as { plugins: Array<{ name: string; source: string }> };

  assert.equal(plugin.version, pkg.version, "version của plugin lệch package.json");
  assert.ok(
    market.plugins.some((p) => p.name === plugin.name && p.source === "./plugin"),
    "marketplace.json phải trỏ đúng ./plugin",
  );
  // `bin` phải trỏ vào bundle trong plugin, không phải một `dist/` ngoài plugin.
  assert.match(Object.values(pkg.bin)[0]!, /^\.\/plugin\/dist\//);
});
