---
name: design
description: Dựng và chấm bản vẽ (artifact) của một chặng — hình dạng mà code phải khớp, cộng lệnh đối chiếu nó với code thật. Dùng khi một chặng (design) cần chốt hình dạng schema/hàm/api/migration trước khi task hiện thực, hoặc khi cần biết bản vẽ đã có còn khớp code không.
when_to_use: "chặng cần chốt hình dạng code trước khi giao task hiện thực, muốn xem chặng nào đang ở đâu, sau khi sửa code trong khối có bản vẽ, task role: design sắp đóng"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" *)
---

# Bản vẽ của chặng

!`node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" design`

---

## Bản vẽ là gì, và vì sao nó tồn tại

Một bản vẽ (`artifact`) là **hợp đồng giữa thiết kế và code**: hình dạng
(`shape`) mà một khối/hàm/schema phải khớp, cộng một `probe` — lệnh shell đối
chiếu hình dạng đó với code thật. Không có `probe` thì bản vẽ chỉ là văn xuôi
đặt ở chỗ khác trong YAML, đọc có vẻ trịnh trọng hơn nhưng không ai chấm được.

Nó là cạnh Design → Module mà xương sống của ganas từng thiếu: trước đây
design chỉ biết "task nào đang hiện thực mình" (`task.implements`), không
biết "mình đã CHỐT hình dạng gì". Bản vẽ trả lời đúng câu đó, và vì nó chạy
qua cùng đường sổ cái (`ganas verify`) như mọi bằng chứng khác, nó cũng lệch
(stale/định nghĩa đổi/trượt) theo đúng cơ chế đã có — không phải một hệ song
song.

## Khi nào dùng

- **`ganas design new`** — lúc bắt đầu một chặng thiết kế mới, chưa cần biết
  hình dạng ngay. Tạo file design trống, `artifacts: []`.
- Thêm `artifacts` vào file design **khi hình dạng đã đủ rõ để viết ra** —
  đừng viết trước khi biết, một bản vẽ đoán mò không hơn gì không có bản vẽ.
- **`ganas design check <id>`** — sau khi thêm/sửa `artifacts` hoặc sau khi
  sửa code trong khối mà bản vẽ mô tả. Chạy `probe` của từng bản vẽ, báo
  lệch cấu trúc (khối không tồn tại, cổng không khớp, thiếu probe).
- Task `role: design` đóng bằng cách đưa `artifacts` vào file design rồi
  `ganas design check` sạch — đó là bằng chứng "bản vẽ khớp code", không
  phải một câu tự nhận trong `notes`.

## Cạm bẫy đã trả giá thật: probe `grep` tên hàm là KHÔNG đủ

Một probe kiểu `grep -q "function buildBrief" src/render/brief.ts` chỉ kiểm
**tên** còn tồn tại — nó KHÔNG kiểm **chữ ký**. Đổi tham số, đổi kiểu trả về,
đổi số lượng đối số mà giữ nguyên tên hàm thì probe này vẫn pass, bản vẽ vẫn
xanh, trong khi hình dạng thật đã khác hẳn thứ bản vẽ đang khẳng định. Đây là
kiểu hỏng nguy hiểm nhất: không ai thấy gì sai, vì mọi thứ đang "chấm được"
đều báo đạt — bản vẽ nói dối mà không hook nào bắt được.

Probe phải khớp **nguyên chữ ký**, không chỉ tên: `grep` cả tham số và kiểu
trả về (hoặc dùng lệnh biên dịch/typecheck thật khi ngôn ngữ có kiểu tĩnh),
hoặc chạy chính đoạn code gọi hàm theo đúng hình dạng đã khai trong `shape`.
Một probe pass mà không thể fail khi hình dạng đổi thì tệ hơn không có probe
— nó đóng dấu xanh cho một phát biểu không ai còn kiểm.

## Đọc kết quả `ganas design show <id>`

- `✓ [FRESH]` — bản vẽ còn khớp code, kiểm gần nhất còn tin được.
- `⚠ [STALE]` / `⚠ [DEFINITION_CHANGED]` / `⚠ [FAILING]` — chạy lại
  `ganas design check <id>` hoặc `ganas verify <D-x/A-y>` trước khi dựa vào.
- `⚠ chưa có probe` — bản vẽ chưa chấm được gì, chỉ là hình dạng đã ghi.
- Mục "Lệch cấu trúc" — bản vẽ neo sai khối, neo sai cổng, hoặc shape lệch
  cổng đã khai của khối. Sửa một trong hai phía cho khớp.
