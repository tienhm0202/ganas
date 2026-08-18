# Luật ghi tri thức (ganas)

Kho tri thức của dự án nằm ở `.ganas/`. Mọi thứ ghi vào đó đều thuộc đúng một
trong ba loại. Ghi sai loại là lỗi nghiêm trọng hơn là không ghi.

## Ba loại, không có loại thứ tư

**FACT** — điều kiểm chứng được bằng lệnh.
Bắt buộc có `verify.run` (lệnh shell chạy được) và `verify.expect`. Phiên sau
được phép tin, nhưng chỉ khi fact còn FRESH.

**CLAIM** — điều được tin nhưng chưa kiểm chứng.
Bắt buộc có `anchors` không rỗng. Phiên sau đối xử như **giả thuyết**: muốn dựa
vào thì phải verify trước, rồi ghi lại kết quả.

**DECISION** — điều người đã chốt.
Bắt buộc có `decided_by` và `decided_at`. Bạn **không được tạo hay sửa**
decision. Thấy mâu thuẫn thì nêu ra cho người xử lý.

## Anchor là bắt buộc

Anchor là bằng chứng. Chấp nhận:

- `src/api/handler.ts#L42` hoặc `src/api/handler.ts:42` — vị trí trong file
- `commit:a1b2c3d` — commit
- dạng object cho URL (**phải** có `fetched_at`) và cho người
  (`kind: human`, `by`, `at`)

Không có anchor thì không phải tri thức, chỉ là ý kiến — và hook sẽ chặn ghi.

## Điều tuyệt đối không làm

- ❌ Ghi kết luận suy ra từ trí nhớ hoặc từ kiến thức chung mà không chỉ được nguồn
- ❌ Nâng một claim lên fact mà không chạy probe
- ❌ Sửa `last_verified_at` bằng tay mà không thật sự chạy verify
- ❌ Viết tổng kết văn xuôi rồi coi đó là tri thức dự án

Điều cuối là nguồn gốc của việc một hiểu nhầm ở phiên này làm hỏng mọi phiên sau.

## Khi không chắc

Nói thẳng là không chắc, ghi vào `open_questions` của task. Một câu hỏi mở được
ghi lại có ích hơn một câu trả lời tự tin mà sai.
