---
name: next
description: Lấy task kế tiếp từ ganas kèm brief đầy đủ — mục tiêu đang phục vụ, thông tin phải đọc, tri thức nào tin được và tri thức nào phải kiểm lại, điều kiện hoàn thành. Dùng khi bắt đầu làm việc, khi không rõ đang làm gì, hoặc sau khi xong một task.
when_to_use: "bắt đầu phiên, không biết làm gì tiếp, vừa xong một task, cần biết điều kiện hoàn thành"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" *)
---

# Task kế tiếp

!`node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" next --no-volatile`

---

## Cách dùng brief trên

Đọc theo thứ tự, đừng nhảy cóc:

1. **Mục tiêu đang phục vụ** — mọi thứ bạn làm phải kéo về phía tiêu chí nghiệm thu ở đó. Việc không phục vụ mục tiêu nào thì đừng làm.
2. **Phải đọc trước khi sửa gì** — đọc hết trước khi chạm code. Mỗi mục có ghi lý do tại sao cần đọc.
3. **Tri thức dùng được** — đã có probe chạy qua, tin được.
4. **CẦN VERIFY LẠI** — ⚠ **không được tin ngay**. Nếu công việc phụ thuộc vào mục nào ở đây, chạy `ganas verify <id>` trước rồi mới sửa code. Bỏ qua bước này chính là cách một hiểu nhầm cũ lan sang code mới.
5. **TRI THỨC KẾ THỪA** — tài liệu cũ nói vậy, chưa ai đối chất với code. Kiểm trước khi dùng, và ghi lại kết quả kiểm.
6. **Câu hỏi còn mở** — chưa ai trả lời. Đừng tự quyết. Hỏi lại, hoặc ghi rõ giả định bạn đang dùng.
7. **Điều kiện hoàn thành** — đây là thứ quyết định "xong" hay chưa, không phải cảm giác của bạn.

## Trong lúc làm

Phát hiện điều gì mới thì ghi ra file ngay, đừng để trong đầu:

- Kiểm chứng được bằng lệnh → `.ganas/facts/` kèm `verify.run`
- Chưa kiểm chứng được → `.ganas/claims/` kèm `anchors`
- Không trả lời được → thêm vào `open_questions` của task

Không có bằng chứng thì không ghi. Hook sẽ chặn, và chặn là đúng.
