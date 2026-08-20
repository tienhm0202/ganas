# ganas

Dự án này dùng **ganas** để kiểm soát phiên làm việc. Trạng thái công việc và tri
thức đã kiểm chứng nằm ở `.ganas/`, không nằm trong đầu bạn và không nằm trong
file tổng kết tự do.

## Bắt đầu một phiên

Brief của task hiện tại được bơm tự động lúc mở phiên. Nếu không thấy, chạy:

```
ganas next
```

## Luật

Đọc trước khi sửa gì — mỗi file một luật, đều nằm ở `.claude/rules/`:

| File | Luật |
|---|---|
| `ganas-knowledge.md` | **Không có bằng chứng thì không được ghi vào kho tri thức.** Luật quan trọng nhất, và là luật duy nhất có hook chặn. |
| `architecture.md` | Tách lõi nghiệp vụ khỏi I/O. |
| `naming.md` | Định danh trong code bằng tiếng Anh, văn xuôi bằng tiếng Việt. |
| `agent-guide.md` | Viết file hướng dẫn cho agent: ngắn ở gốc, đặt gần code. |
| `ganas-git.md` | Tag semver, ký commit theo repo, không nhắc AI trong commit. |

## Lệnh hay dùng

| Lệnh | Việc |
|---|---|
| `ganas next` | Task kế tiếp + brief đầy đủ |
| `ganas validate` | Kiểm tra graph trước khi commit |
| `ganas verify <id>` | Chạy probe của một fact |
| `ganas gate` | Chấm điều kiện hoàn thành của task đang làm |
| `ganas commit` | Commit task đã đạt gate — chỉ khi thật sự xong |

<!-- Giữ CLAUDE.md dưới ~200 dòng. Thông tin riêng một vùng code → CLAUDE.md
     trong chính thư mục đó. Quy trình nhiều bước → chuyển thành skill.
     Xem .claude/rules/agent-guide.md. -->
