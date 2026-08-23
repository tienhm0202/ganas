# src/hooks/policy/ — phán quyết của hook

<!-- Khối `M-hook-policy`. File này chỉ được nạp khi agent đụng vào file trong
     thư mục này. Không mô tả khối khác, không chép lại luật gốc. -->

Khối này là `nature: code` — **lõi**. Không đọc đĩa, không sinh tiến trình,
không stdin/stdout. Nó chỉ trả lời hai câu: *được hay không*, và *nói gì với
người*.

`node:path` không phải I/O — nó là phép tính trên chuỗi. Xem
`.claude/rules/architecture.md`, mục "Công cụ io dùng chung".

## Cổng vào

`decideWriteEarly()` cho một lượt ghi file, `decideEntityOverwrite()` và
`decideProposalWrite()` cho hai chặng sau của nó. `ruleForDiagnostics()` +
`knowledgeWriteBody()` + `applyEnforcement()` cho đường ghi vào kho tri thức.
Mọi chuỗi lý do trả về cho người dùng cũng nằm ở đây.

## Bất biến dễ phá

- **Không import gì chạm đĩa.** Đây là toàn bộ lý do khối tồn tại: luật kiểm
  được bằng một object, không cần dựng dự án giả. Thêm một `readFile` vào đây
  là xoá cái được đó, và `test/module-nature.test.ts` sẽ đỏ.
- **THỨ TỰ các luật trong `decideWriteEarly` là hợp đồng.** Sổ cái thắng
  trước, rồi config, rồi skill, rồi ghi-đè-thực-thể, rồi proposal. Đảo thứ tự
  làm người dùng nhận thông điệp khác trong ca chồng luật, mà test end-to-end
  không bắt được — `test/hook-policy.test.ts` có một ca riêng canh đúng chuyện
  này.
- **Trả `{kind: "need"}` thay vì đòi dữ liệu sẵn.** Đường quyết định cố ý
  LƯỜI: chỉ hỏi đĩa khi đường dẫn đúng là file thực thể, chỉ nạp graph khi
  đường dẫn đúng là proposal VÀ nội dung thật sự đặt `status`. Đổi sang "gom
  hết rồi mới quyết" là bắt MỌI lượt Write nạp cả graph.

## Cạm bẫy đã trả giá

`PROPOSAL_DECISION_PATTERN` phải bắt **cả** `decided_by`/`decided_at` đứng
riêng, không chỉ dòng `status:`. Ghi hai trường đó ở một lượt `Edit` rồi đổi
`status` ở lượt sau là cùng một việc giả mạo quyết định, chỉ chia làm hai bước
để né luật. Rút gọn regex về mỗi `status:` là mở lại đúng cửa đó.

## Chạy test riêng của vùng

```
npx tsx --test 'test/hook-policy.test.ts'
```

## Tri thức kiểm chứng được

Đừng viết kết luận thành chữ ở đây — ghi fact có probe trong `.ganas/` rồi trỏ
id. Bằng chứng của khối: `M-hook-policy/V-hook-policy-pure`.
