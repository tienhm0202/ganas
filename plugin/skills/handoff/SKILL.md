---
name: handoff
description: Ghi bản ghi tiếp nối của phiên — dẫn xuất CƠ HỌC từ transcript (tin nhắn người dùng nguyên văn, file đã sửa, lệnh đã chạy) cộng tri thức đã ghi có bằng chứng, KHÔNG phải model tự tóm tắt. Dùng khi task chưa xong mà phải dừng, hoặc trước khi exit_contract đòi handoff.
when_to_use: "phải dừng giữa chừng, task chưa xong nhưng hết thời gian, exit_contract báo thiếu handoff, sắp bị compact"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" *)
---

# Handoff

Bản ghi này thường được **tự động** sinh ở PreCompact và SessionEnd — không
cần chạy tay trong đa số trường hợp. Chỉ gọi lệnh dưới nếu `ganas gate` báo
thiếu handoff mà hai hook trên chưa kịp chạy:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" handoff --session <id>
```

---

## Vì sao không phải văn xuôi tự viết

Một bản tóm tắt do model viết là chỗ một hiểu nhầm dễ lẻn vào rồi bị phiên
sau tin làm sự thật — đúng thứ luật ghi tri thức cấm. Handoff ở đây trích
**cơ học** từ transcript: tin nhắn người dùng gõ nguyên văn, file bị Edit/
Write, lệnh Bash đã chạy — không có bước nào "đọc rồi diễn giải lại". Phần
tri thức chỉ lấy fact/claim đã có bằng chứng, gắn đúng `session_id` này.

## Nếu cần bổ sung điều model biết mà transcript không có

Đừng sửa tay file `runs/*.md` — nó bị ghi đè ở lần chạy sau. Điều thật sự
quan trọng thì ghi đúng chỗ: fact có probe vào `.ganas/facts/`, điều chưa
kiểm chứng vào `.ganas/claims/` (kèm anchor), câu hỏi chưa trả lời vào
`open_questions` của task — handoff lần sau sẽ tự gom những mục đó.
