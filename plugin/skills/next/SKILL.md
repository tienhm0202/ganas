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

## Giao việc: phiên này điều phối, sub-agent làm

Brief có mục **Giao việc** — đọc nó trước khi chạm code. Ở Claude Code
(`harness: claude-code`), phiên chính KHÔNG tự làm task:

1. Tạo sub-agent với đúng model của tier brief ghi (`scribe` → `haiku`,
   `verifier` → `sonnet`, `main` → `opus`).
2. Prompt sub-agent mở đầu bằng `ganas brief <task-id>` — để nó tự lấy brief,
   đừng chép tay lại.
3. Sub-agent xong thì phiên này chạy `/ganas:gate` để chấm. Chấm bằng lệnh,
   không bằng lời tổng kết của sub-agent.

Lý do không phải tiết kiệm tiền: context phiên chính giữ được toàn cảnh (task
kế tiếp, gate, commit) thay vì bị chi tiết thực thi nuốt mất, và việc cơ học
giao cho tier thấp thì không bị nghĩ quá tay.

**Song song khi giao được.** Nếu mục Giao việc có phần "Giao được song song
ngay bây giờ", mở tất cả sub-agent đó CÙNG LÚC (nhiều tool call trong một tin
nhắn), mỗi cái một task, rồi chấm từng cái bằng `ganas gate <id>`.

Chỉ giao song song đúng những task ganas liệt kê ở đó — danh sách này suy từ
sơ đồ khối: không chặn nhau và vùng code rời nhau. Task ngoài danh sách có thể
chạm cùng file, và hai sub-agent sửa cùng file cùng lúc thì cái sau đè cái
trước mà không ai thấy. Đừng tự nới danh sách bằng cảm giác "chắc là độc lập".

Brief báo "chưa ai quyết ai làm" nghĩa là task thiếu `model` — gán vào file
task rồi chạy `ganas validate`, đừng mặc kệ rồi tự làm.

## Trong lúc làm

Phát hiện điều gì mới thì ghi ra file ngay, đừng để trong đầu:

- Kiểm chứng được bằng lệnh → `.ganas/facts/` kèm `verify.run`
- Chưa kiểm chứng được → `.ganas/claims/` kèm `anchors`
- Không trả lời được → thêm vào `open_questions` của task

Không có bằng chứng thì không ghi. Hook sẽ chặn, và chặn là đúng.
