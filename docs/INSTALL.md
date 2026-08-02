# Cài ganas vào Claude Code

Mọi lệnh dưới đây **đã chạy thật** khi viết tài liệu này, và output là output
thật nhận được.

## Cách nhanh nhất (cài từ mã nguồn)

```
git clone <repo> ganas && cd ganas
npm install
npm run build                          # BẮT BUỘC — xem "Vì sao phải build"

claude plugin marketplace add "$PWD"
claude plugin install ganas@ganas
```

Output thật:

```
✔ Successfully added marketplace: ganas (declared in user settings)
✔ Successfully installed plugin: ganas@ganas (scope: user)
```

## Kiểm tra đã cài đúng chưa

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

## Dùng thử ngay

Vào một dự án bất kỳ:

```
cd /duong/dan/du-an
ganas          # hoặc: node ~/.claude/plugins/cache/ganas/ganas/*/bin/ganas.mjs
```

```
Bước kế tiếp (1/12 · init)

  Khởi tạo ganas cho dự án này

  Vì sao: Chưa có `.ganas/` thì không có gì để neo tri thức vào.

  Chạy:
    ganas init
```

Từ đó cứ làm theo `ganas` — nó luôn in **đúng một** bước kế tiếp cho tới khi
task đầu tiên được commit. Xem `docs/FLOWS.md` mục 0 cho toàn cảnh 12 chặng.

Muốn gõ `ganas` trần ở mọi nơi thì thêm `npm link` (hoặc `npm install -g .`)
trong thư mục nguồn — `bin` trỏ vào chính bundle mà plugin dùng, nên hai đường
không bao giờ lệch phiên bản.

## Cập nhật sau khi sửa mã nguồn

```
npm run build
claude plugin marketplace update ganas
```

Quên `npm run build` thì bản cài vẫn là bản cũ — `marketplace update` chỉ copy
lại thư mục `plugin/`, nó không biên dịch gì.

## Vì sao phải build, và vì sao `plugin/dist/` nằm trong git

Claude Code cài plugin bằng cách **copy đúng thư mục `plugin/`** vào
`~/.claude/plugins/cache/ganas/ganas/<version>/`. Mọi thứ nằm ngoài đó —
`dist/` ở gốc repo, `node_modules/` — **không tồn tại** với bản đã cài.

Vì vậy `plugin/dist/cli.js` là một **bundle tự chứa** (esbuild gói cả `yaml` và
`zod` vào trong), và nó **được commit vào git**. Đó là lựa chọn có ý thức, đổi
"build artifact trong git" lấy "cài xong là chạy".

Trước P2 N30 thì không như vậy: `bin/ganas.mjs` nạp `../../dist/cli.js` (ngoài
plugin) và `dist/` nằm trong `.gitignore`. Cài qua marketplace thì Claude Code
báo *Successfully installed*, `plugin details` liệt kê đủ 9 skill và 6 hook, và
**ganas im lặng không làm gì** — hook fail-open nên không lỗi nào nổi lên.

Đó là chế độ hỏng tệ nhất có thể cho một công cụ mà toàn bộ giá trị là cưỡng
chế, và nó tệ hơn cả một lệnh không tồn tại: lệnh ma còn báo lỗi, cái này báo
thành công.

`test/plugin-selfcontained.test.ts` giữ nó đóng: copy **riêng** `plugin/` sang
thư mục tạm rồi chạy như Claude Code chạy, và bắt lỗi nếu hook trả về thông báo
"đang bỏ qua kiểm soát".

## Gỡ ra

```
claude plugin uninstall ganas@ganas
claude plugin marketplace remove ganas
```

`.ganas/` trong dự án **không bị đụng tới** — nó là dữ liệu của bạn, không phải
của plugin.
