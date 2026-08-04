# ganas

Control layer cho các phiên Claude Code — dịch câu nói của người dùng sang
ngôn ngữ quản lý dự án, và không cho agent ghi tri thức không có bằng chứng.

Mã nguồn và tài liệu bằng tiếng Việt.

## Hai điều ganas bảo đảm

Phát biểu đúng bằng thứ code làm được, không hơn:

1. **Không có thứ gì chưa kiểm chứng được trình cho phiên sau như là sự thật.**
2. **Phiên sau không phải khám phá lại những gì phiên trước đã kiểm chứng
   được** — trong cùng một phạm vi công việc.

Điều ganas KHÔNG bảo đảm, và không hứa: rằng mọi thứ phiên trước học được đều
tới tay phiên sau. Không hook nào kiểm được sự tồn tại của thứ đã không được
ghi.

## Cách làm

- **Phạm vi công việc** (Scope) là đơn vị dịch: bàn giao cái gì, code nằm ở
  đâu, làm sao biết là xong, ai ký. Một phát biểu chỉ đúng bên trong ranh
  giới phạm vi của nó — ra ngoài là chưa biết.
- **Ba loại tri thức, không có loại thứ tư**: Fact (kiểm chứng được bằng
  probe chạy lại được), Claim (tin nhưng chưa kiểm, bắt buộc có anchor),
  Decision (người đã chốt, không kiểm bằng máy).
- **Sổ cái xác minh append-only**, hash-chain chống sửa lịch sử (kiểu Secure
  Scuttlebutt / Certificate Transparency), hook Claude Code chặn ghi thẳng —
  `ganas verify` là đường duy nhất khiến `last_verified_at` có ý nghĩa.
- **Một bước kế tiếp, không phải menu** — `ganas` trần luôn in đúng một việc
  phải làm, trong 12 chặng cố định.
- **Claim task theo phiên** — hai phiên Claude Code cùng lúc trên một dự án
  không giành nhau một task.

Xem [CHANGELOG.md](CHANGELOG.md) cho danh sách đầy đủ năng lực hiện có.

## Cài

```
git clone https://github.com/tienhm0202/ganas.git && cd ganas
npm install && npm run build

claude plugin marketplace add "$PWD" --scope project
claude plugin install ganas@ganas --scope project
```

Dùng được cả ở Zed/Cursor/Windsurf qua MCP server đi kèm. Muốn mọi thứ nằm
100% trong project (không đụng `~/.claude/plugins/`) thì `bun add
github:tienhm0202/ganas` rồi chạy `scripts/install-target.mjs` — xem mục 3.
Chi tiết đầy đủ (scope cài, kiểm tra đã cài đúng chưa, cấu hình từng editor)
ở [docs/INSTALL.md](docs/INSTALL.md).

## Lệnh hay dùng

| Lệnh | Việc |
|---|---|
| `ganas next` | Task kế tiếp + brief đầy đủ |
| `ganas validate` | Kiểm tra graph trước khi commit |
| `ganas verify <id>` | Chạy probe của một fact |
| `ganas gate` | Chấm điều kiện hoàn thành của task đang làm |
| `ganas commit` | Commit task đã đạt gate — message dựng từ dữ liệu đã kiểm chứng |

Tham chiếu đầy đủ ở [docs/COMMANDS.md](docs/COMMANDS.md).

## Docs

| File | Đọc khi nào |
|---|---|
| [docs/INSTALL.md](docs/INSTALL.md) | Cài đặt — Claude Code, Zed, Cursor, Windsurf, hoặc bun/npm add không qua plugin system |
| [docs/CONCEPTS.md](docs/CONCEPTS.md) | Mô hình dữ liệu đầy đủ — spine, evidence, freshness |
| [docs/COMMANDS.md](docs/COMMANDS.md) | Tham chiếu CLI đầy đủ, từng cờ và mã thoát |
| [docs/FLOWS.md](docs/FLOWS.md) | 5 luồng chính, điểm đứt và giới hạn đã biết |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | Một luồng làm việc đầu-cuối, chạy thật từ `init` tới `commit` |
| [CHANGELOG.md](CHANGELOG.md) | Năng lực hiện có, theo bản phát hành |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Sửa code ganas (khác với dùng ganas trong dự án khác) |
| [llms.txt](llms.txt) | Bản tóm tắt cho LLM đọc trước khi thao tác |

Lịch sử quyết định thiết kế theo từng mốc phát triển nằm trong `git log`
(commit message) — dự án cố ý không giữ file kế hoạch/roadmap trong git.

## License

MIT
