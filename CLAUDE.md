# ganas

Dự án này dùng **ganas** để kiểm soát phiên làm việc. Trạng thái công việc và tri
thức đã kiểm chứng nằm ở `.ganas/`, không nằm trong đầu bạn và không nằm trong
file tổng kết tự do.

## Bắt đầu một phiên

Brief của task hiện tại được bơm tự động lúc mở phiên. Nếu không thấy, chạy:

```
ganas next
```

## Luật quan trọng nhất

Đọc `.claude/rules/ganas-knowledge.md`. Tóm tắt một dòng: **không có bằng chứng
thì không được ghi vào kho tri thức**.

Kiến trúc: đọc `.claude/rules/architecture.md` — tách lõi nghiệp vụ khỏi I/O.

## Lệnh hay dùng

| Lệnh | Việc |
|---|---|
| `ganas next` | Task kế tiếp + brief đầy đủ |
| `ganas validate` | Kiểm tra graph trước khi commit |
| `ganas verify <id>` | Chạy probe của một fact |
| `ganas gate` | Chấm điều kiện hoàn thành của task đang làm |
| `ganas commit` | Commit task đã đạt gate — chỉ khi thật sự xong |

<!-- Giữ file này dưới ~200 dòng. Quy trình nhiều bước → chuyển thành skill.
     Luật theo vùng code → chuyển thành .claude/rules/*.md có `paths:`. -->
