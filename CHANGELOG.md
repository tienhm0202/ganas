# Changelog

Ghi theo tính năng, không theo từng commit — xem `git log` nếu cần chi tiết
từng bước (`P2 N<số>` trong commit message khớp số thứ tự trong lịch sử phát
triển thật, không phải số phát minh ra sau).

## v0.1.2 — 2026-08-04

- **Cài không qua Claude Code plugin system** — `scripts/install-target.mjs`
  mới, dùng khi ganas được thêm bằng package manager
  (`bun add github:tienhm0202/ganas`) và muốn mọi thứ nằm 100% trong
  `node_modules/` của project, không đụng `~/.claude/plugins/` (cố định,
  không đổi được dù chọn scope nào lúc cài qua `claude plugin install`).
  Script đọc thẳng `plugin/hooks/hooks.json` làm nguồn (không lặp tay 6
  hook), sinh hook thật vào `.claude/settings.json` + skill vào
  `.claude/skills/`, và MCP config project-local cho Zed/Cursor
  (`--claude-code`, `--zed`, `--cursor`, `--windsurf`). Cưỡng chế
  `PreToolUse`/`Stop` hoạt động y hệt cài qua plugin. `docs/INSTALL.md` thêm
  mục 3 + bảng so sánh 3 cách cài. Bỏ luôn khuyến nghị `npm link` (global,
  ngược hướng scope project).
- **Cưỡng chế "không Co-Authored-By" bằng git hook thật** —
  `.githooks/commit-msg` mới, `ganas init` tự sinh và bật bằng
  `git config core.hooksPath .githooks` khi dự án dùng git. Rule
  `.claude/rules/ganas-git.md` chỉ là văn bản (dựa vào agent nhớ đọc đúng
  lúc — đã chứng minh không đủ tin cậy qua sự cố thật trong quá trình phát
  triển bản này); hook chạy trên MỌI commit bất kể ai/công cụ nào tạo ra,
  tự xoá dòng `Co-Authored-By` nhắc Claude/Anthropic thay vì chặn commit.

## v0.1.1 — 2026-08-04

- **README.md ở gốc repo** — trước bản này chỉ có `docs/` và `llms.txt`,
  không có gì tóm tắt "ganas là gì" ngay khi mở repo trên GitHub.
- **`.claude/rules/ganas-git.md`** — `ganas init` giờ sinh thêm rule này cho
  mọi dự án dùng ganas: tag = semver trần (`vX.Y.Z`), không ghép tên công cụ
  kiểu `<tên>--vX.Y.Z` (đó là quy ước riêng của `claude plugin tag`, chỉ
  đúng khi CHÍNH dự án là Claude Code plugin); ký commit cấu hình theo TỪNG
  repo (không `--global`); không `Co-Authored-By`. Bịt đúng nhầm lẫn vừa gặp
  khi tag chính repo ganas.
- Tag của chính repo ganas cũng đổi theo luật trên: `v0.1.0` (semver trần),
  thay cho `ganas--v0.1.0` đã tag/push nhầm trước đó.

## v0.1.0 — 2026-08-04

Bản phát hành đầu tiên. Dưới đây là toàn bộ năng lực đã có tính tới tag này,
gom theo mảng, không phải danh sách 27 commit rời rạc.

### Lõi: đồ thị tri thức có bằng chứng

- **Spine** hai trục: `Goal → Design → Task` (vì sao làm) cắt ngang
  `Scope → Module` (làm ở đâu, có bằng chứng gì) — nối bằng `task.touches` và
  `exit_contract`.
- **Ba loại tri thức tách biệt rạch ròi**, không lẫn vào nhau: **Fact** (đã
  re-run bằng probe), **Claim** (mới tin, bắt buộc có `anchor`), **Decision**
  (người quyết, có chữ ký, không kiểm bằng máy được).
- **Freshness 11 trạng thái** (`src/graph/freshness.ts`) — mỗi trạng thái là
  một LÝ DO khác nhau khiến một fact hết dùng được (định nghĩa đổi, model
  đổi, prompt đổi, dataset đổi, fail, marginal, unavailable, unprovable,
  stale-by-age…), không phải một thang "cũ dần".
- `ganas validate` — kiểm tra chéo toàn đồ thị: cycle, orphan,
  `task.serves ⊆ design.serves`, mọi `task.touches` phải có tiêu chí
  `kind: verification`, `.gitignore` đủ mục local-only.

### Sổ cái xác minh chống giả mạo

- `verify-ledger.jsonl` — append-only, commit vào git, chỉ `ganas verify`
  được ghi (hook `PreToolUse` chặn mọi đường ghi thẳng khác, kể cả qua Bash).
- `defHash`/`definitionHash` — vân tay của CẢ phép kiểm lẫn điều được khẳng
  định (`statement`), không chỉ phép kiểm — chặn đường lách "giữ probe cũ,
  đổi ý nghĩa fact".
- **Hash-chain** (`seq`, `prev_hash`) — mỗi dòng giữ hash của toàn bộ chain
  tính tới ngay trước nó, đúng lược đồ Secure Scuttlebutt / Certificate
  Transparency (RFC 6962). `verifyChain()` phát hiện sửa/xoá/đảo một dòng cũ
  bằng công cụ ngoài git, không chỉ dựa vào "append-only + hook chặn".
- Mutation-test guard (`proof: proven/unproven`) — probe rỗng ruột (không
  thể fail) không được tính là bằng chứng thật.

### Cưỡng chế qua hook Claude Code

- 6 hook: `SessionStart` (nạp brief đúng 1 task), `PreToolUse` (chặn ghi
  thẳng ledger/config), `PostToolUse` (chặn ghi tri thức sai schema hoặc
  thiếu anchor), `Stop` (chặn kết thúc phiên khi `exit_contract` chưa đạt),
  `PreCompact` (nhắc ghi ra trước khi mất context), `SessionEnd` (handoff +
  giải phóng session/claim).
- Enforcement 2 mức (`warn`/`enforce`), bật/tắt riêng theo từng luật
  (`knowledge_anchor`, `schema`, `exit_contract`, `task_link`).
- Tự nhận là **tamper-evident, không phải tamper-proof** — hook là lớp
  nhắc, `.ganas/config.yaml` không được bảo vệ khỏi bị hạ `enforcement`
  bằng tay; cổng thật phải là CI chạy `ganas validate`.

### Dòng chảy một-bước-một-lúc

- `ganas` trần in **đúng một** bước kế tiếp trong 12 chặng cố định
  (`init → fix-graph → scope → goal → design → evidence → task → work →
  verify → gate → commit → close`), không đưa menu — mỗi lựa chọn đẩy sang
  người dùng là một chỗ đi lạc.
- Bộ dò ngõ cụt (`test/flow.test.ts`): đi hết dòng chảy từ repo trống như
  người dùng thật, kẹt ở đâu là test đỏ ở đó — ngõ cụt thành lỗi thấy trước,
  không phải phát hiện muộn qua đo chi phí khởi động bằng tay.

### Multi-agent — claim task theo phiên

- `graph/claim.ts` — lock file `.ganas/.locks/<task>.claim` tạo bằng
  `fs.open(..., "wx")` (nguyên tử ở tầng filesystem), có TTL chống claim mồ
  côi khi phiên crash. Hai phiên `next` gần như cùng lúc chỉ một phiên nhận
  được một task — trước bản này, `selectNextTask` thuần không biết task đã
  bị phiên khác giữ.
- `scope new` chuyển sang ghi file mới bằng `wx`: hai phiên chọn trùng ID
  không còn âm thầm ghi đè nhau, mà báo lỗi rõ ràng.

### Lệnh / skill

13 subcommand CLI (`flow`, `init`, `validate`, `scope`, `brief`, `next`,
`gate`, `verify`, `trace`, `commit`, `handoff`, `prune`, `hook`), lộ ra
Claude Code dưới dạng 9 skill: `commit`, `gate`, `handoff`, `next`,
`plan-to-tasks`, `prune`, `scope`, `trace`, `verify`.

### Đa nền tảng

- **Plugin tự chứa cho Claude Code** — `plugin/dist/cli.js` là một bundle
  esbuild duy nhất (gói cả `yaml`, `zod`), commit vào git; cài qua
  marketplace là chạy được ngay, không cần build lại trên máy người dùng.
  `test/plugin-selfcontained.test.ts` giữ bất biến này: copy riêng
  `plugin/` sang thư mục tạm rồi chạy như Claude Code chạy thật.
- Cài theo scope `project` (khuyến nghị, `.claude/settings.json` commit
  git, cả team tự có) thay vì `user` mặc định (dễ ghi đè marketplace giữa
  các dự án khác nhau).
- **MCP server** (`plugin/bin/ganas-mcp.mjs`, transport `stdio`) — 7 tool
  (`ganas_flow/next/gate/verify/trace/scope/commit`) cho editor không phải
  Claude Code (Zed, Cursor, Windsurf). Gọi thẳng `run(argv)` của command
  CLI có sẵn, không viết lại logic. **Không có** cưỡng chế
  `PreToolUse`/`Stop` — MCP không có khái niệm tương đương, nên chỉ Claude
  Code mới có lớp chặn thật.

### Docs

`docs/CONCEPTS.md` (mô hình dữ liệu), `docs/COMMANDS.md` (từng lệnh),
`docs/FLOWS.md` (5 luồng + lỗ đã bịt/còn nợ), `docs/WORKFLOW.md` (câu
chuyện đầu-cuối), `docs/INSTALL.md` (cài theo từng editor: Claude Code /
Zed / Cursor / Windsurf), `llms.txt`.
