---
name: plan-to-tasks
description: Chẻ một plan Claude Code Plan Mode vừa được duyệt thành Design/Task của ganas, gán `model` (main/verifier/scribe) cho từng task ngay lúc chẻ. Dùng ngay sau khi plan được duyệt qua ExitPlanMode — nội dung plan đã có sẵn trong context, không cần đọc lại file nào.
when_to_use: "plan vừa được duyệt qua ExitPlanMode, sắp bắt đầu hiện thực một plan nhiều bước"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" *)
---

# Chẻ plan thành task

Plan Mode là tính năng CỦA Claude Code, không phải của ganas — ganas không đọc
file plan. Không cần đọc lại gì: nội dung plan vừa duyệt đã nằm sẵn trong
context của phiên này.

## Các bước

1. **Gắn vào Design.** Nếu plan hiện thực một hướng đã có `.ganas/designs/`
   phù hợp, dùng lại nó (`implements` trỏ vào đó). Nếu plan là một hướng
   tiếp cận mới, tạo Design mới — nhớ khai `serves` đúng goal.

2. **Chẻ thành Task vừa một phiên.** Ưu tiên nhiều task nhỏ hơn một task
   khổng lồ (`estimated_context: large` bị validator cảnh báo — đó là dấu
   hiệu phải chẻ tiếp, không phải thứ chấp nhận được).

3. **Mỗi task khai đủ:**
   - `touches` — khối nào trong sơ đồ bị chạm.
   - `exit_contract` — mỗi khối trong `touches` phải có ít nhất một tiêu chí
     `kind: verification` kiểm nó (luật `spine/task-missing-verification`,
     đã có sẵn — không viết luật mới).

4. **Gán `model` cho MỌI task, ngay lúc chẻ.** Field `Task.model`, một trong
   ba tier có sẵn trong `config.yaml` (`main`/`verifier`/`scribe`):
   - `main` — việc thật sự khó/mơ hồ, cần phán đoán nhiều.
   - `scribe` — việc cơ học, đơn giản, ít quyết định.
   - `verifier` — khoảng giữa hai loại trên.

   Đây là quyết định của agent NGAY LÚC THIẾT KẾ — lúc này agent hiểu độ khó
   từng phần rõ hơn bất kỳ heuristic nào suy sau (vd suy từ `module.nature`).
   Không suy tự động.

   **Đừng gán `main` cho cả loạt.** Một plan đã chẻ đúng thì phần lớn task là
   việc cơ học có ranh giới rõ — đó là `scribe`/`verifier`. Gán `main` hết
   nghĩa là hoặc chưa chẻ đủ, hoặc chưa thật sự cân độ khó. `ganas validate`
   báo `spine/task-missing-model` cho task nào bỏ trống, và brief của task đó
   sẽ mở đầu bằng cảnh báo "chưa ai quyết ai làm".

5. **Chạy `ganas validate`.** Validator hiện có (liên kết goal/design/sprint,
   `task-missing-verification`, `estimated_context: large`...) đã đủ để bắt
   lỗi chẻ ẩu — không cần bước kiểm tra thủ công thêm.

## Không làm gì thêm

Không có lệnh CLI riêng cho bước này — chẻ task là việc ghi file YAML vào
`.ganas/tasks/` (và `.ganas/designs/` nếu cần) bằng Write/Edit như bình
thường, rồi chạy `ganas validate` để xác nhận.
