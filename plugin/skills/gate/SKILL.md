---
name: gate
description: Chấm điều kiện hoàn thành (exit_contract) của task đang làm — chạy thật các lệnh kiểm tra và báo mục nào chưa đạt. Dùng trước khi định kết thúc phiên hoặc trước khi đánh dấu task done.
when_to_use: "sắp kết thúc phiên, muốn biết còn thiếu gì, task đã xong chưa"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" *)
---

# Điều kiện hoàn thành

!`node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" gate`

---

Mục `✗` là chưa đạt — làm nốt rồi chạy lại. Stop hook chấm đúng những mục này,
nên bỏ qua ở đây chỉ để bị chặn ở kia.

Mục `…` cần người xác nhận: không chặn phiên, nhưng chặn việc đánh dấu task
`done`. Nói cho người dùng biết mục nào đang chờ họ.
