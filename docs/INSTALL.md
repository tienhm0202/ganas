# Cài ganas

Mọi lệnh dưới đây **đã chạy thật** khi viết tài liệu này, và output là output
thật nhận được.

ganas cài được 3 cách, tuỳ bạn muốn code nằm ở đâu:

|              | 1. Claude Code plugin | 2. Editor khác qua MCP | 3. bun/npm add, không qua plugin system |
|--------------|------------------------|--------------------------|-------------------------------------------|
| Cơ chế       | plugin (hook + skill) | MCP server (`stdio`) | hook + skill tự khai thẳng trong `.claude/` của project |
| Cưỡng chế    | có — `PreToolUse`/`Stop` chặn thật | không — chỉ gọi tool theo yêu cầu | có — cùng 6 hook thật như cột 1 |
| Code nằm ở đâu | `~/.claude/plugins/cache/…` (dùng chung mọi project trên máy) | tuỳ editor | `node_modules/ganas/` — 100% trong project |
| Cài          | `claude plugin install` | tự tay trỏ config MCP vào `ganas-mcp.mjs` | `bun add` + script cài kèm theo |

Cả 3 đường dùng chung một bundle build từ cùng mã nguồn — không có bản "rút
gọn" riêng cho đường nào.

## 0. Cài từ mã nguồn (cho mục 1 và 2 — mục 3 tự lo, xem bên dưới)

```
git clone <repo> ganas && cd ganas
npm install
npm run build                          # BẮT BUỘC — xem "Vì sao phải build"
```

`npm run build` sinh `plugin/dist/cli.js` (CLI + hook) và `plugin/dist/mcp.js`
(MCP server) — cả hai bundle tự chứa, không phụ thuộc `node_modules/` bên
ngoài. Nhớ đường dẫn `$PWD` sau bước này — mục 1 và mục 2 bên dưới đều trỏ
vào cùng thư mục `plugin/` vừa build.

Không có bước "gõ `ganas` trần ở mọi nơi" ở đây — `npm link`/`npm install -g`
là cài NPM package global, đi ngược scope bạn chọn cho plugin Claude Code
(mục 1). Muốn gõ tay không qua Claude Code thì gọi thẳng bundle:
`node plugin/dist/cli.js <lệnh>`, hoặc dùng mục 3 (bun/npm add) — khi đó
`node_modules/.bin/ganas` đã là bản project-local, không cần global gì cả.

## 1. Claude Code — plugin (khuyến nghị: có đủ hook + skill + MCP)

```
claude plugin marketplace add "$PWD" --scope project
claude plugin install ganas@ganas --scope project
```

Output thật:

```
✔ Successfully added marketplace: ganas (declared in project settings)
✔ Successfully installed plugin: ganas@ganas (scope: project)
```

Claude Code đã có sẵn 9 skill (`commit`, `gate`, `handoff`, `next`,
`plan-to-tasks`, `prune`, `scope`, `trace`, `verify`) và hook cưỡng chế thật —
**không cần** cấu hình thêm MCP client trong chính Claude Code, MCP server ở
mục 2 là cho editor khác.

### Vì sao có `--scope project`

Claude Code hỗ trợ 3 scope cho cả `marketplace add` lẫn `plugin install`:

- **`project`** (mặc định khuyến nghị ở trên) — ghi vào `.claude/settings.json`,
  commit vào git, mọi người dùng chung repo tự có ganas khi mở project.
- **`local`** — ghi vào `.claude/settings.local.json` (thường bị gitignore),
  dùng khi chỉ muốn ganas chạy trên máy/checkout của riêng bạn, không ép người
  khác trong team cài theo.
- **`user`** (mặc định của `claude` CLI nếu không truyền `--scope`) — một entry
  dùng chung cho **mọi** dự án mở trên máy. Nếu bạn dùng ganas ở nhiều dự án
  khác nhau, tránh scope này: marketplace `ganas` chỉ có một entry trong cấu
  hình user, lần `marketplace add` sau ở dự án khác sẽ **ghi đè** đường dẫn
  nguồn của lần trước.

Muốn đổi scope thì thay `--scope project` bằng `--scope local` hoặc
`--scope user` ở cả hai lệnh trên.

### Kiểm tra đã cài đúng chưa

Đừng tin dòng "Successfully installed" — nó chỉ nói file đã được copy.

```
claude plugin details ganas@ganas
```

```
ganas 0.0.1
  Component inventory
    Skills (9)  commit, gate, handoff, next, plan-to-tasks, prune, scope, trace, verify
    Agents (0)
    Hooks (6)  SessionStart, PreToolUse, PostToolUse, Stop, PreCompact, SessionEnd
  Projected token cost
    Always-on:   ~1,748 tok   added to every session
```

Nhưng bảng trên vẫn hiện đầy đủ **kể cả khi ganas hoàn toàn không chạy**. Phép
thử thật là gọi thẳng hook:

```
echo '{"session_id":"t","cwd":"/tmp","source":"startup"}' \
  | node ~/.claude/plugins/cache/ganas/ganas/*/bin/ganas.mjs hook session-start
```

- `{}` → **đúng**. Hook chạy, `/tmp` không phải dự án ganas nên không có gì để nói.
- `{"systemMessage":"⚠ ganas KHÔNG chạy …"}` → bản cài **thiếu build**. Quay lại
  `npm run build` rồi `claude plugin marketplace update ganas`.

### Dùng thử ngay

Vào một dự án đã bật plugin ganas (mục 1):

```
cd /duong/dan/du-an
node ~/.claude/plugins/cache/ganas/ganas/*/bin/ganas.mjs
```

(đường dẫn cache này cố định — Claude Code luôn copy code plugin vào đó, bất
kể chọn scope nào lúc cài. Không có bước "gõ `ganas` trần" ở đây — xem ghi
chú ở mục 0 vì sao.)

```
Bước kế tiếp (1/12 · init)

  Khởi tạo ganas cho dự án này

  Vì sao: Chưa có `.ganas/` thì không có gì để neo tri thức vào.

  Chạy:
    ganas init
```

Từ đó cứ làm theo `ganas` — nó luôn in **đúng một** bước kế tiếp cho tới khi
task đầu tiên được commit. Xem `docs/FLOWS.md` mục 0 cho toàn cảnh 12 chặng.

## 2. Editor khác qua MCP (Zed, Cursor, Windsurf, …)

Claude Code dùng hook — editor khác không có khái niệm hook tương đương, nên
ganas lộ cùng chức năng qua một **MCP server** (`plugin/bin/ganas-mcp.mjs`,
transport `stdio`), khai báo sẵn trong `plugin/.claude-plugin/plugin.json` ở
khoá `mcpServers` (Claude Code tự đọc khoá này; editor khác thì bạn phải tự
trỏ vào file `.mjs` này trong config MCP của editor đó).

7 tool lộ ra: `ganas_flow`, `ganas_next`, `ganas_gate`, `ganas_verify`,
`ganas_trace`, `ganas_scope`, `ganas_commit` — mỗi tool nhận một `args: string[]`
đúng như gõ sau `ganas <lệnh>` trên dòng lệnh (không gồm tên lệnh), ví dụ
`ganas_verify` với `args: ["F-ACC-001", "--scope", "P-thanh-toan"]`.

**Giới hạn cần biết**: MCP chỉ cho gọi tool theo yêu cầu. Nó **không có**
cưỡng chế kiểu `PreToolUse`/`Stop` mà hook Claude Code có — MCP không có khái
niệm tương đương, nên dùng ganas qua editor khác thì được `next`/`gate`/`verify`/…
nhưng KHÔNG bị chặn khi ghi tri thức sai hay kết thúc phiên sớm. Toàn bộ lớp
cưỡng chế thật vẫn chỉ có ở Claude Code.

Đường dẫn tới file server, dùng cho mọi editor bên dưới:

- **Chạy từ mã nguồn** (mục 0 ở trên): `<đường dẫn repo>/plugin/bin/ganas-mcp.mjs`.
- **Đã cài qua Claude Code** (mục 1): có thể dùng lại đúng file đó thay vì
  build riêng — `~/.claude/plugins/cache/ganas/ganas/<version>/bin/ganas-mcp.mjs`
  (thay `<version>` bằng bản đã cài, xem `claude plugin details ganas@ganas`).

### Zed

Mở settings (`cmd+,` trên macOS, hoặc `~/.config/zed/settings.json`), thêm:

```json
{
  "context_servers": {
    "ganas": {
      "source": "custom",
      "command": "node",
      "args": ["<đường dẫn>/plugin/bin/ganas-mcp.mjs"]
    }
  }
}
```

Lưu file là Zed tự khởi động server — không cần restart Zed. Tool `ganas_*`
xuất hiện trong Agent Panel.

### Cursor

`.cursor/mcp.json` (theo project) hoặc `~/.cursor/mcp.json` (toàn máy):

```json
{
  "mcpServers": {
    "ganas": {
      "command": "node",
      "args": ["<đường dẫn>/plugin/bin/ganas-mcp.mjs"]
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json` (tự tạo nếu chưa có — Windsurf không
sinh sẵn file này):

```json
{
  "mcpServers": {
    "ganas": {
      "command": "node",
      "args": ["<đường dẫn>/plugin/bin/ganas-mcp.mjs"]
    }
  }
}
```

### Kiểm tra MCP server chạy đúng (dùng chung cho mọi editor ở mục này)

Gọi thẳng, không qua editor — cách này dựng lại đúng điều kiện editor sẽ làm:

```
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node <đường dẫn>/plugin/bin/ganas-mcp.mjs
```

Thấy `"result":{"tools":[...]}` với 7 tool là đúng. Không thấy gì / lỗi
`Cannot find module` → chưa `npm run build`, hoặc đường dẫn sai.

## 3. Không qua plugin system — bun/npm add, mọi thứ nằm trong project

Cả mục 1 và 2 đều copy code ganas vào một chỗ NGOÀI project (`claude plugin
install` luôn copy vào `~/.claude/plugins/cache/…`, cố định — không đổi
được dù chọn scope nào). Nếu muốn ganas nằm 100% trong chính project (một
`bun install`/`npm install` ở máy khác là có y hệt, không cần biết gì tới
Claude Code plugin system), dùng cách này.

```
cd /duong/dan/du-an-cua-ban
bun add github:tienhm0202/ganas
```

`package.json` của ganas khai `"bin": {"ganas": "./plugin/dist/cli.js"}` và
`plugin/dist/` đã build sẵn, commit trong git — cài xong có ngay
`node_modules/.bin/ganas` chạy được, không phải `npm run build` lại.

Cài xong CHƯA có hook/skill/MCP nào hoạt động — bun/npm chỉ tải code, không
biết gì về Claude Code. Chạy script cài kèm theo repo, đúng cờ cho từng
editor (kết hợp được nhiều cờ):

```
node node_modules/ganas/scripts/install-target.mjs --claude-code
node node_modules/ganas/scripts/install-target.mjs --zed
node node_modules/ganas/scripts/install-target.mjs --cursor
node node_modules/ganas/scripts/install-target.mjs --windsurf
```

Output thật (`--claude-code`):

```
✓ Claude Code: 6 hook mới trong .claude/settings.json, 9 skill ghi vào .claude/skills
```

`--claude-code` ghi hook vào `.claude/settings.json` — đọc thẳng
`plugin/hooks/hooks.json` làm nguồn (luôn khớp đúng 6 hook thật, không chép
tay ra một chỗ khác dễ trôi dạt) — và copy 9 skill vào `.claude/skills/`,
thay `${CLAUDE_PLUGIN_ROOT}` bằng đường dẫn tương đối
`node_modules/ganas/plugin`. `--zed`/`--cursor` ghi MCP config
**project-local** (`.zed/settings.json`, `.cursor/mcp.json`). `--windsurf`
chỉ in hướng dẫn — Windsurf không có config MCP theo project, chỉ có
`~/.codeium/windsurf/mcp_config.json` (global, ngoài tầm của cách cài này).

An toàn chạy lại nhiều lần: không nhân đôi hook, không đụng key khác đã có
sẵn trong file, skill luôn ghi lại đúng bản mới nhất.

### `harness` trong `.ganas/config.yaml`

Cài đúng **một** cờ thì script ghi luôn `harness:` vào `.ganas/config.yaml`
(sửa theo dòng, giữ nguyên comment của file). Field này quyết định brief
hướng dẫn giao task kiểu nào: `claude-code` thì bảo tạo sub-agent với model
của tier; các harness khác chỉ nối qua MCP nên brief chỉ khuyến nghị đổi
model trong picker và tự khai là không cưỡng chế được.

Cài nhiều cờ cùng lúc thì script **không đoán** — nó in ra danh sách để bạn
tự khai một giá trị, vì `harness` chỉ trả lời được một câu: bạn giao việc từ
đâu. Chưa chạy `ganas init` thì cũng chỉ nhắc, không tạo config thay bạn.

### Cưỡng chế đủ như Claude Code plugin

`--claude-code` viết đúng 6 hook thật (không phải bản rút gọn) nên
`PreToolUse`/`Stop` chặn y hệt cài qua mục 1 — chỉ khác chỗ code nằm
(`node_modules/ganas/` thay vì `~/.claude/plugins/cache/…`).

### Cập nhật

```
bun update ganas
node node_modules/ganas/scripts/install-target.mjs --claude-code
```

Chạy lại script sau mỗi lần update: skill được ghi lại bản mới nhất; hook
chỉ thêm nếu ganas có hook mới, hook cũ không bị xoá hay nhân đôi.

## Cập nhật sau khi sửa mã nguồn

```
npm run build
claude plugin marketplace update ganas   # riêng Claude Code
```

Quên `npm run build` thì bản cài vẫn là bản cũ — `marketplace update` chỉ copy
lại thư mục `plugin/`, nó không biên dịch gì. Với Zed/Cursor/Windsurf không có
lệnh update riêng: build lại rồi khởi động lại server MCP (Zed tự làm khi lưu
settings; Cursor/Windsurf cần tắt/bật lại server trong UI của editor).

## Vì sao phải build, và vì sao `plugin/dist/` nằm trong git

Claude Code cài plugin bằng cách **copy đúng thư mục `plugin/`** vào
`~/.claude/plugins/cache/ganas/ganas/<version>/`. Mọi thứ nằm ngoài đó —
`dist/` ở gốc repo, `node_modules/` — **không tồn tại** với bản đã cài.

Vì vậy `plugin/dist/cli.js` và `plugin/dist/mcp.js` đều là **bundle tự chứa**
(esbuild gói cả `yaml`, `zod`, `@modelcontextprotocol/sdk` vào trong), và cả
hai **được commit vào git**. Đó là lựa chọn có ý thức, đổi "build artifact
trong git" lấy "cài xong là chạy".

Trước P2 N30 thì không như vậy: `bin/ganas.mjs` nạp `../../dist/cli.js` (ngoài
plugin) và `dist/` nằm trong `.gitignore`. Cài qua marketplace thì Claude Code
báo *Successfully installed*, `plugin details` liệt kê đủ 9 skill và 6 hook, và
**ganas im lặng không làm gì** — hook fail-open nên không lỗi nào nổi lên.

Đó là chế độ hỏng tệ nhất có thể cho một công cụ mà toàn bộ giá trị là cưỡng
chế, và nó tệ hơn cả một lệnh không tồn tại: lệnh ma còn báo lỗi, cái này báo
thành công.

`test/plugin-selfcontained.test.ts` giữ nó đóng: copy **riêng** `plugin/` sang
thư mục tạm rồi chạy như Claude Code chạy (và tương tự cho MCP server: bắt lỗi
nếu hook trả về thông báo "đang bỏ qua kiểm soát", hoặc nếu `ganas-mcp.mjs` cô
lập không trả lời được `tools/list`).

## Gỡ ra

### Claude Code

```
claude plugin uninstall ganas@ganas --scope project
claude plugin marketplace remove ganas --scope project
```

`--scope` của lệnh gỡ phải khớp `--scope` lúc cài — nếu bạn cài bằng `local`
hay `user` thì gỡ cũng phải dùng đúng scope đó.

### Zed / Cursor / Windsurf

Xoá đúng entry `ganas` khỏi file config MCP đã sửa ở mục 2 (`context_servers`
với Zed, `mcpServers` với Cursor/Windsurf), rồi khởi động lại server MCP
trong editor.

### bun/npm add (mục 3)

```
bun remove ganas
```

Xoá tay khối `hooks`/`context_servers.ganas`/`mcpServers.ganas` đã thêm vào
`.claude/settings.json`/`.zed/settings.json`/`.cursor/mcp.json` — `bun
remove` chỉ xoá `node_modules/`, không biết gì về các file cấu hình mà
script cài đã ghi.

`.ganas/` trong dự án **không bị đụng tới** ở mọi đường — nó là dữ liệu của
bạn, không phải của plugin/MCP server/script cài.
