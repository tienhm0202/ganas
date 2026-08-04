#!/usr/bin/env node
/**
 * Cài ganas cho một project KHÔNG qua Claude Code plugin system — dùng khi
 * ganas được thêm vào bằng package manager (`bun add github:...`) và người
 * dùng muốn mọi thứ nằm trong chính project đó, không đụng
 * `~/.claude/plugins/`.
 *
 * Chạy TỪ THƯ MỤC GỐC của project đang dùng ganas (không phải từ repo
 * ganas), sau khi đã `bun add`/`npm install` xong:
 *
 *   node node_modules/ganas/scripts/install-target.mjs --claude-code
 *   node node_modules/ganas/scripts/install-target.mjs --zed
 *   node node_modules/ganas/scripts/install-target.mjs --cursor
 *   node node_modules/ganas/scripts/install-target.mjs --windsurf
 *
 * Kết hợp được nhiều cờ cùng lúc. An toàn chạy lại nhiều lần (không nhân
 * đôi hook, skill luôn ghi lại bản mới nhất).
 *
 * Nguồn hook DUY NHẤT là `plugin/hooks/hooks.json` — script này đọc thẳng
 * file đó và thay `${CLAUDE_PLUGIN_ROOT}` bằng đường dẫn tương đối thật tới
 * `plugin/`, không chép tay danh sách 6 hook ra một chỗ khác dễ trôi dạt.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(HERE, "..", "plugin");
const PROJECT_ROOT = process.cwd();

function toPosix(p) {
  return p.split(sep).join("/");
}

const GANAS_PLUGIN_REL = toPosix(relative(PROJECT_ROOT, PLUGIN_DIR));
const GANAS_MCP_REL = toPosix(relative(PROJECT_ROOT, join(PLUGIN_DIR, "bin", "ganas-mcp.mjs")));
const GANAS_MCP_ABS = join(PLUGIN_DIR, "bin", "ganas-mcp.mjs");

function readJson(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`${path} không parse được làm JSON: ${err.message}`);
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

/* --- Claude Code: hook trong .claude/settings.json, skill trong .claude/skills/ --- */

function installClaudeCodeHooks() {
  const hooksSource = JSON.parse(readFileSync(join(PLUGIN_DIR, "hooks", "hooks.json"), "utf8"));
  const settingsPath = join(PROJECT_ROOT, ".claude", "settings.json");
  const settings = readJson(settingsPath);
  settings.hooks ??= {};

  let added = 0;
  for (const [event, entries] of Object.entries(hooksSource.hooks)) {
    settings.hooks[event] ??= [];
    const existingCommands = new Set(
      settings.hooks[event].flatMap((e) => e.hooks.map((h) => h.command)),
    );

    for (const entry of entries) {
      const patched = {
        ...entry,
        hooks: entry.hooks.map((h) => ({
          ...h,
          command: h.command.replaceAll("${CLAUDE_PLUGIN_ROOT}", GANAS_PLUGIN_REL),
        })),
      };
      if (patched.hooks.some((h) => existingCommands.has(h.command))) continue; // đã có, không nhân đôi
      settings.hooks[event].push(patched);
      added++;
    }
  }

  writeJson(settingsPath, settings);
  return { path: relative(PROJECT_ROOT, settingsPath), added };
}

function installClaudeCodeSkills() {
  const skillsSrc = join(PLUGIN_DIR, "skills");
  const skillsDst = join(PROJECT_ROOT, ".claude", "skills");
  const names = readdirSync(skillsSrc, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const name of names) {
    const dst = join(skillsDst, name);
    rmSync(dst, { recursive: true, force: true }); // ghi lại bản mới nhất mỗi lần chạy
    cpSync(join(skillsSrc, name), dst, { recursive: true });
    const skillFile = join(dst, "SKILL.md");
    if (existsSync(skillFile)) {
      const content = readFileSync(skillFile, "utf8").replaceAll(
        "${CLAUDE_PLUGIN_ROOT}",
        GANAS_PLUGIN_REL,
      );
      writeFileSync(skillFile, content, "utf8");
    }
  }

  return { path: relative(PROJECT_ROOT, skillsDst), count: names.length };
}

function installClaudeCode() {
  const hooks = installClaudeCodeHooks();
  const skills = installClaudeCodeSkills();
  return (
    `Claude Code: ${hooks.added} hook mới trong ${hooks.path}, ` +
    `${skills.count} skill ghi vào ${skills.path}`
  );
}

/* --- Editor khác qua MCP: ghi được file project-local (Zed, Cursor); Windsurf chỉ có global --- */

function mergeMcpServers(path, key) {
  const config = readJson(path);
  config[key] ??= {};
  config[key].ganas = { command: "node", args: [GANAS_MCP_REL] };
  writeJson(path, config);
}

function installZed() {
  const path = join(PROJECT_ROOT, ".zed", "settings.json");
  const config = readJson(path);
  config.context_servers ??= {};
  config.context_servers.ganas = { source: "custom", command: "node", args: [GANAS_MCP_REL] };
  writeJson(path, config);
  return `Zed: ghi ${relative(PROJECT_ROOT, path)} (context_servers.ganas)`;
}

function installCursor() {
  const path = join(PROJECT_ROOT, ".cursor", "mcp.json");
  mergeMcpServers(path, "mcpServers");
  return `Cursor: ghi ${relative(PROJECT_ROOT, path)} (mcpServers.ganas)`;
}

function printWindsurfInstructions() {
  console.log(`
Windsurf không có config MCP theo project — chỉ đọc
~/.codeium/windsurf/mcp_config.json (global, tự tạo nếu chưa có). Không ghi
file thay bạn vì nó nằm ngoài project này. Thêm tay:

{
  "mcpServers": {
    "ganas": {
      "command": "node",
      "args": ["${GANAS_MCP_ABS}"]
    }
  }
}

Dùng đường dẫn TUYỆT ĐỐI (như trên) — config này không nằm trong project nên
không có "tương đối với đâu" để tính.
`);
}

/* --- CLI --- */

const flags = new Set(process.argv.slice(2));
const KNOWN = ["--claude-code", "--zed", "--cursor", "--windsurf"];

if (flags.size === 0 || flags.has("--help") || flags.has("-h")) {
  console.log(`Cài ganas cho project này, không qua Claude Code plugin system.

Dùng:
  node ${relative(PROJECT_ROOT, fileURLToPath(import.meta.url))} <cờ...>

Cờ (kết hợp được nhiều cái):
  --claude-code   Hook (.claude/settings.json) + skill (.claude/skills/)
  --zed           MCP server, ghi .zed/settings.json (project-local)
  --cursor        MCP server, ghi .cursor/mcp.json (project-local)
  --windsurf      In hướng dẫn — Windsurf không có config MCP theo project

An toàn chạy lại nhiều lần.
`);
  process.exit(flags.size === 0 ? 1 : 0);
}

for (const f of flags) {
  if (!KNOWN.includes(f)) {
    console.error(`Không biết cờ "${f}" — có: ${KNOWN.join(", ")}`);
    process.exit(1);
  }
}

const done = [];
if (flags.has("--claude-code")) done.push(installClaudeCode());
if (flags.has("--zed")) done.push(installZed());
if (flags.has("--cursor")) done.push(installCursor());
if (flags.has("--windsurf")) {
  printWindsurfInstructions();
  done.push("Windsurf: in hướng dẫn ở trên (không ghi file)");
}

for (const line of done) console.log(`✓ ${line}`);
