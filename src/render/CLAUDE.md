# src/render/ — dựng brief từ graph thành chữ

<!-- Khối `M-render`. File này chỉ được nạp khi agent đụng vào file trong thư
     mục này. Không chép lại luật gốc ở đây. -->

Khối này là `nature: code` — lõi. Mỗi hàm nhận `Graph` đã nạp sẵn và
`freshness` đã tính sẵn làm tham số, trả về một chuỗi Markdown; không tự đọc
`.ganas/`, không tự tính freshness, không tự gọi git. Nơi CHẠM I/O thật — đọc
đĩa để nạp graph, chạy git, in ra terminal hay bơm brief vào context của phiên
— nằm ở nơi GỌI vào đây: `src/commands/brief.ts`, `src/commands/next.ts`,
`src/hooks/handlers.ts`.

## Cổng vào

`renderBrief(input: BriefInput): string` (`brief.ts`) — hàm chính. Ba chỗ gọi
dùng cùng dữ liệu (`graph`, `task`, `freshness`) nhưng khác nhau đúng một
tham số: `src/commands/brief.ts` và `src/commands/next.ts` truyền thêm
`volatile`; `src/hooks/handlers.ts` (hook `SessionStart`, đường brief đi vào
context mọi phiên) thì **không** — xem bất biến đầu tiên bên dưới.

`renderGroupedByScope<T>(...)` (`group.ts`) — trình bày một danh sách ĐÃ SẮP
SẴN thành cây `Scope → Design → Task`; không tự sắp lại thứ tự, không phải
nguồn dữ liệu mới. Dùng nội bộ trong `parallelBlock` (`brief.ts`) và trực tiếp
từ `src/commands/next.ts` cho hai danh sách khác — generic trên kiểu item vì
mỗi chỗ gọi giữ task ở một dạng bọc khác nhau (`Sourced<Task>`, `Candidate`).

## Bất biến dễ phá

- **Bố cục phần ỔN ĐỊNH phải tất định; mọi thứ BIẾN ĐỘNG nằm ở CUỐI, sau một
  `---`.** Brief bơm thẳng vào context ở `SessionStart` (`hooks/handlers.ts`),
  mỗi phiên mới một lần — một mốc thời gian hay `git status` lẫn vào giữa thân
  brief phá prompt cache của MỌI phiên sau, không riêng phiên đang chạy.
  `volatile` là tham số optional riêng, luôn được `push` sau cùng trong
  `renderBrief`; `volatileStatus()` (`src/commands/_common.ts`) là chỗ DUY
  NHẤT được gọi `git rev-parse`, `git status`, hay `new Date()` cho mục đích
  này. `hooks/handlers.ts` gọi `renderBrief` mà cố tình KHÔNG truyền
  `volatile`, kèm comment ngay tại chỗ gọi giải thích đúng lý do trên.
- **Mọi mục trong brief lọc theo `task.scope` TRƯỚC khi đếm/cắt, không phải
  sau.** `suggestedFactsSection`, `overdueIceboxSection`,
  `pendingProposalsSection`, `relevantLegacyClaims` đều lọc scope trước —
  một fact, một mục icebox, hay một đề xuất NGOÀI phạm vi task thì không được
  xuất hiện trong brief dù khớp mọi tiêu chí khác. Nạp tri thức ngoài phạm vi
  vào context đầu phiên là mời phiên sau tin nhầm nó áp dụng cho việc đang
  làm.
- **Section rỗng phải trả `""`, không in tiêu đề rỗng.** Áp dụng cho mọi hàm
  `...Section` trong `brief.ts` — một tiêu đề trống dễ bị đọc nhầm thành "đã
  tra mà không có gì", trong khi sự thật là "mục này không áp dụng ở đây".

## Cạm bẫy đã trả giá

- Trước N3, brief không nhìn tới `design.status`: một task khai
  `implements: D-xxx` trong khi design đó đã bị `superseded` hoặc `archived`
  thì phiên làm việc hiện thực một hướng đã chết mà không hề biết — đúng lúc
  brief nạp vào đầu phiên là lúc còn kịp đổi hướng, im lặng bỏ qua là phí mất
  cơ hội duy nhất đó (`brief.ts:464-467`).
- Trước N15, đường DUY NHẤT để một decision tới được brief là qua
  `design.decisions` — một decision áp cho đúng scope của task nhưng design
  quên dẫn tới thì không bao giờ tới tay phiên làm việc. Nay có thêm đường thứ
  hai: mọi decision cùng scope (hoặc không khai scope = toàn dự án) đều được
  nhặt vào, không chỉ decision mà design có dẫn (`brief.ts:488-502`).

## Chạy test riêng của vùng

```
npx tsx --test 'test/scope-brief.test.ts'
```

## Tri thức kiểm chứng được

Đừng viết kết luận thành chữ ở đây — ghi fact có probe trong `.ganas/` rồi trỏ
id. Bằng chứng của khối này: `V-render-brief` (`.ganas/modules/M-render.yaml`).
