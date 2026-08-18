# .ganas/

Kho trạng thái và tri thức của dự án, do `ganas` quản lý.

| Thư mục | Chứa gì |
|---|---|
| `goals/` | Mục tiêu — mỗi file một goal. Phải có người duyệt. |
| `designs/` | Cách tiếp cận. Bắt buộc khai `serves` — design không neo vào goal là không hợp lệ. |
| `tasks/` | Đơn vị việc vừa một phiên. Có context_contract và exit_contract. |
| `scopes/` | Phạm vi công việc — ranh giới code + người ký + nghiệm thu. Fact/claim chỉ đúng TRONG một phạm vi. |
| `modules/` | Khối của sơ đồ: contract vào/ra, `depends_on` = cạnh, `verify` = bằng chứng |
| `facts/` | Điều kiểm chứng được, có probe chạy lại được |
| `claims/` | Điều được tin nhưng chưa kiểm chứng, có anchor |
| `decisions/` | Điều người đã chốt |
| `icebox/` | Việc đã quyết CHƯA làm — phát hiện giữa phiên, chấm điểm, chưa tới lượt làm |
| `legacy/` | Tri thức import từ tài liệu cũ — bị cách ly cho tới khi đối chất |
| `map/` | Bản đồ vùng code và survey |
| `proposals/` | Đề xuất chờ người duyệt (spine, pack) |
| `runs/` | Handoff record theo phiên (không commit) |

Sửa tay được — đều là YAML. Sau khi sửa chạy `ganas validate`.
