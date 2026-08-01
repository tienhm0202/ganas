---
name: verify
description: Chạy bằng chứng cho fact và khối — probe (tất định) và eval (thống kê, cho khối gọi LLM) — rồi ghi kết quả vào sổ cái. Dùng khi cần biết một điều có còn đúng không, trước khi dựa vào nó để sửa code, hoặc khi brief báo "CẦN VERIFY LẠI".
when_to_use: "brief báo cần verify lại, muốn biết fact còn đúng không, vừa sửa code trong một khối, trước khi dựa vào một điều đã ghi"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" *)
---

# Chạy bằng chứng

!`node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" verify`

---

## Đọc kết quả

| Dấu | Nghĩa | Phải làm gì |
|---|---|---|
| `✓` đạt | Probe/eval chạy và đạt | Dùng được |
| `✗` TRƯỢT | Phát biểu đang **SAI** so với thực tế | Sửa code cho khớp phát biểu, **hoặc** sửa phát biểu cho khớp code. Đừng bỏ qua. |
| `≈` sát ngưỡng | Điểm nằm trong vùng nhiễu quanh ngưỡng | Chưa đủ để gọi là đạt. Chạy lại hoặc cải thiện. |
| `…` không kiểm được | `skip_if` khớp — thiếu môi trường (DB, service) | **Không phải fail.** Ghi nhận rằng ở đây chưa kiểm được. |
| `⚠` chưa chứng minh được | Probe rỗng ruột, hoặc lệnh nguy hiểm | Xem bên dưới — đây là vấn đề nghiêm trọng. |

## Khi thấy `⚠ chưa chứng minh được`

Hai nguyên nhân, cả hai đều nghiêm trọng hơn một probe fail:

**Bản bóp méo VẪN PASS.** ganas đã sửa probe cho nó *phải* sai rồi chạy lại, mà nó vẫn
pass. Nghĩa là probe không đo thứ nó nói là đang đo — kết quả "đạt" của nó không mang
thông tin gì. Viết lại probe cho nó thật sự chạm vào điều đang được khẳng định.

**Probe luôn đúng hoặc nguy hiểm.** `true`, `echo ok`, hay lệnh có `rm -rf` / `git push`.
ganas từ chối chạy.

Một probe không thể fail **tệ hơn không có probe**: không có probe thì fact chỉ là
"chưa kiểm"; có probe rỗng ruột thì nó được đóng dấu xanh.

## Không tự ghi kết quả

`last_verified_at` và `last_result` chỉ được đặt bởi chính lệnh này, và mỗi lần chạy
đều để lại một dòng trong `.ganas/verify-ledger.jsonl`. Sửa tay hai trường đó sẽ bị
`ganas validate` bắt là `unbacked-verification`, và hook chặn ghi thẳng vào sổ cái.

Nếu probe đang fail thì đó là **thông tin cần giữ**, không phải thứ cần che đi.

## Tuỳ chọn

| Lệnh | Việc |
|---|---|
| `ganas verify F-ACC-001` | Chạy đúng một target, bất kể tươi hay cũ |
| `ganas verify M-intent` | Chạy mọi bằng chứng của một khối |
| `ganas verify --all` | Chạy tất cả, kể cả thứ còn tươi |
| `ganas verify --tier full` | Gồm cả bộ eval nặng (tốn tiền) |
| `ganas verify --dry-run` | Xem sẽ chạy gì, không chạy thật |
| `ganas verify --max-cost-usd 2` | Dừng khi chi phí eval chạm hạn mức |
