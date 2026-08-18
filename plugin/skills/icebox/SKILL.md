---
name: icebox
description: Ghi một phát hiện giữa phiên chưa ai duyệt vào sổ icebox thay vì bịa thành Task. Dùng khi thấy vấn đề ngoài phạm vi task đang làm — nợ kỹ thuật, thiết kế nên đổi, việc nên làm sau — và muốn nó không mất theo context nhưng cũng không giả vờ đã được quyết. Icebox là việc đã quyết CHƯA làm; Task là việc đã quyết LÀM.
when_to_use: "phát hiện một vấn đề/ý tưởng ngoài phạm vi task đang chạy, chưa ai duyệt làm ngay, không muốn nó mất khi context bị compact"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" *)
---

# Ghi vào sổ icebox

## Khi nào dùng cái này thay vì Task

Chẻ Task đòi bốn thứ có thật: `serves` (phục vụ goal nào), `implements`
(hiện thực design nào), `scope` (ranh giới bàn giao), `exit_contract` (tiêu
chí ĐỎ ngay lúc viết). Một phát hiện giữa phiên — thấy dọc đường lúc đang làm
việc khác, chưa ai bàn tới, chưa ai duyệt — không có sẵn bốn thứ đó. Chẻ
thành Task lúc này là **bịa dữ liệu giả** để hợp lệ hoá một việc chưa ai
quyết.

Không chẻ Task không có nghĩa nói miệng rồi bỏ. Plan vừa duyệt còn mất khi
context bị compact; một câu buột miệng giữa phiên càng chắc chắn mất. Icebox
là chỗ giữ nó: nằm trên đĩa, trong git, không giả vờ đã được quyết.

**Không dùng icebox cho:**
- Việc đã được người dùng đồng ý làm ngay hoặc làm trong phiên này — đó là
  Task, chẻ bằng skill `plan-to-tasks`.
- Một giới hạn đã biết của fact đang có (vd "đoạn code này còn bug nhưng
  chưa sửa") — nếu đã có fact hoặc probe kiểm được, dùng cơ chế `ttl_days` +
  verify lại, không tạo icebox song song.

## Bắt buộc phải có

`ganas icebox add` từ chối chạy (mã thoát `1`) nếu thiếu bất kỳ thứ nào
trong năm tuỳ chọn bắt buộc:

| Tuỳ chọn | Bắt buộc vì |
|---|---|
| `--title` | Tên ngắn để `list`/`review` in ra được. |
| `--weight <1-5>` | Quan trọng đến đâu nếu bỏ qua — cùng thang `ganas debt`. Không chấm thì không xếp hạng được so với nợ khác. |
| `--ease <1-5>` | Dễ sửa đến đâu — cùng thang `ganas debt`. |
| `--why <chuỗi>` | Lý do hoãn. Đây là điểm phân biệt "hoãn có ý thức" với "quên mất" — thiếu nó thì sáu tháng sau không ai biết vì sao chưa làm. |
| `--anchor <chuỗi>`, lặp lại được | Ít nhất một bằng chứng (file:dòng, id fact, …) cho phát hiện — không phải cảm giác chay. |

`--scope <P-...>` không bắt buộc ở tầng schema nhưng nên khai nếu đã biết:
thiếu nó thì mục rơi khỏi `ganas debt` mặc định (luật `icebox/without-scope`)
và chỉ còn thấy dưới `--all` — im lặng biến mất khỏi chỗ người thật sự nhìn.

Chấm điểm trung thực, không chấm cho có: `weight`/`ease` là phán đoán của
chính agent lúc phát hiện, không phải điền số 3 mặc định. Điểm sai không bị
máy bắt — chỉ `why_deferred` + `anchors` làm nó soi được sau này.

## Lệnh

```
node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" icebox add \
  --title "<tên ngắn>" --weight <1-5> --ease <1-5> \
  --why "<vì sao hoãn>" --anchor <file:dòng hoặc id> [--scope P-xxx]
```

Xem lại việc đã ghi, xử lý mục quá hạn:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" icebox list
node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" icebox review
```

`review` chỉ đề xuất, không tự đóng gì — người quyết `close` (kèm
`--reason`) hoặc `promote` (khi tới lượt làm, thăng cấp thành Task thật qua
`plan-to-tasks`). Chi tiết đầy đủ cờ và mã thoát: `docs/COMMANDS.md`, mục
`ganas icebox`.
