---
name: scope
description: Dịch một yêu cầu bằng lời của người dùng thành phạm vi công việc có ranh giới code, tiêu chí nghiệm thu và người ký. Dùng khi người dùng mô tả một việc mới muốn làm, khi chưa có phạm vi nào phù hợp để gắn task/fact vào, hoặc khi cần nhìn toàn cảnh dự án đang có những phạm vi nào và còn nợ gì.
when_to_use: "người dùng nói muốn làm gì đó mới, chưa biết gắn task vào đâu, fact/claim báo lỗi thiếu scope, cần nhìn toàn cảnh dự án"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" *)
---

# Phạm vi công việc

!`node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" scope`

---

## Phạm vi là gì, và vì sao mọi thứ phải neo vào nó

Phạm vi công việc là **đơn vị mà một câu nói của người dùng được dịch sang**:
bàn giao cái gì, code nằm ở đâu, làm sao biết là xong, ai ký.

Nó cũng là **ranh giới của tri thức**:

> Một fact chỉ được coi là đúng BÊN TRONG phạm vi của nó. Ra ngoài là **chưa
> biết** — không phải sai, mà là chưa ai kiểm.

Đây không phải thủ tục hành chính. Không có ranh giới thì kho fact càng lớn
càng thành máy sinh ảo giác: một điều đúng ở khối thanh toán sẽ được phiên sau
đọc như chân lý toàn dự án — và ảo giác đó mang dấu kiểm chứng của chính hệ
thống đóng lên, nên còn khó phát hiện hơn là không có gì.

## Khi người dùng mô tả một việc mới

Đừng tự bịa phạm vi rồi ghi YAML. Hỏi lại đúng **bốn câu** — đây chính là phép
dịch từ ngôn ngữ người dùng sang ngôn ngữ quản lý dự án:

1. **Bàn giao cái gì?** — kết quả người dùng cảm nhận được, không phải việc phải làm.
2. **Code nằm ở đâu?** — glob thật trên đĩa. Chưa có code thì hỏi nó *sẽ* nằm ở đâu.
3. **Làm sao biết là xong?** — một lệnh chạy được. "Xong" mà không có lệnh chấm thì chỉ là ý kiến.
4. **Ai ký nghiệm thu?** — handle dạng `@ten`. Không ai ký thì không ai nghiệm thu được.

Câu nào người dùng chưa trả lời được thì **hỏi**, đừng điền đại. Một phạm vi
với `run: "true"` hay owner bịa ra còn tệ hơn chưa có phạm vi, vì nó trông như
đã xong.

Có đủ bốn câu rồi mới chạy:

```
ganas scope new --yes \
  --title "<câu 1>" --paths "<câu 2>" --accept "<câu 3>" --owner "<câu 4>"
```

Lệnh tự tạo một khối nếu chưa khối nào trùng vùng code. Khối đó mặc định
`nature: code` — **nếu vùng này có gọi LLM thì phải sửa thành `nature: llm`**,
khi đó bắt buộc phải có eval: probe kiểm được cấu trúc, không kiểm được hành vi
của LLM.

Xong thì `ganas validate`, rồi tạo task khai `scope: <id vừa tạo>`.

## Khi fact/claim/task báo lỗi thiếu `scope`

```
ganas scope assign            # xem trước, không đụng đĩa
ganas scope assign --write    # ghi phần suy chắc chắn
```

Nó chỉ ghi những bản ghi suy được **đúng một** phạm vi. Bản ghi khớp 0 hoặc ≥2
phạm vi được in ra để **bạn hoặc người dùng quyết** — đừng gán bừa cho hết
cảnh báo. Gán sai phạm vi là im lặng đặt một phát biểu vào ngữ cảnh nó không
đúng, tệ hơn hẳn so với để trống và bị báo lỗi.

## Đọc kết quả liệt kê ở trên

- `⚠ chưa ai ký` — phạm vi active mà không có owner: chưa ai nghiệm thu được.
- `⚠ chưa có tiêu chí nghiệm thu` — "bàn giao xong" đang là ý kiến, không phải kết luận.
- `⚠ nghiệm thu: ... (stale/failing/...)` — chạy `ganas verify --scope <id>`. Nghiệm thu mức phạm vi chạy trên **luồng đã ghép**: một luồng có thể đúng ở từng khối mà vẫn sai khi ghép.
- `⚠ N mục nợ kiểm chứng` — xem `ganas trace --scope <id>`.
