# src/commands/ — một file một lệnh con của CLI

<!-- Khối `M-commands`. File này chỉ được nạp khi agent đụng vào file trong thư
     mục này. Không chép lại luật gốc ở đây. -->

Khối này là `nature: io` — 19/21 lệnh ghi thẳng ra `process.stdout`, đó là bản
chất của một lớp adapter CLI, không phải ngoại lệ cần miễn trừ. Nó vẫn là lớp
**điều phối**, không phải lõi nghiệp vụ: phần tính toán thật nằm ở `src/graph/`
(đọc đồ thị) và ở các file lõi từng lệnh (`src/gate.ts`, `src/commit.ts`,
`src/boundary.ts`…). Lệnh ở đây chỉ: đọc `argv` → gọi lõi → in chữ cho người —
chính bước cuối đó mới là lý do nhãn phải là `io`.

## Cổng vào

Mỗi file export đúng một hàm `run(argv: Argv): Promise<number> | number`, và
`src/cli.ts` nạp nó **lười** qua bảng `COMMANDS` (`import()` trong hàm) — thêm
lệnh mới không làm chậm mọi lệnh khác.

Lệnh có lệnh con (`scope`, `icebox`, `proposal`) tự phân nhánh trên
`argv.positional[0]` bằng `switch`, và nhánh `default` **phải** liệt kê các
lệnh con có thật trong thông báo lỗi.

Gần như mọi lệnh mở đầu bằng `openProject(argv)` (`_common.ts`) — nó trả
`{ root, graph, freshness }`. Đừng tự `loadGraph` rồi tự `computeFreshness`:
tính độ tươi hai lần trong một lượt chạy là hai nguồn sự thật cho cùng một câu
hỏi.

## Bất biến dễ phá

- **Lỗi của NGƯỜI DÙNG ném `GanasError`, không phải `Error`.** `src/cli.ts` bắt
  `GanasError` và in gọn, mã thoát `1`; `Error` thường thì in nguyên stack như
  một lỗi lập trình. Ném nhầm loại là bắt người dùng đọc stack trace cho một
  câu "thiếu --title".
- **Lệnh chỉ ĐỌC thì không được ghi.** `list`/`show`/`review` không sửa đĩa.
  Người ta chạy chúng để nhìn, và một lệnh nhìn mà sửa là thứ không ai ngờ tới.
- **Cắt bớt danh sách thì PHẢI in số dòng đã bỏ.** `debt`, `search`, `icebox`,
  `proposal` đều theo quy ước này. Cắt im lặng làm người đọc tưởng đã thấy hết
  — đúng cái bệnh mà mấy bảng đó sinh ra để chống.

## Cạm bẫy đã trả giá

**Thêm một lệnh mới là sửa BỐN chỗ, không phải một.** Quên chỗ nào thì test đỏ
ở một file nghe chẳng liên quan gì tới lệnh vừa thêm:

1. `src/commands/<tên>.ts` — bản thân lệnh
2. bảng `COMMANDS` trong `src/cli.ts`, **và** khối `HELP` ngay dưới nó
3. `EXPECTED_COMMANDS` trong `test/cli-help.test.ts`
4. một mục `### ganas <tên>` trong `docs/COMMANDS.md` — có **hai** test đòi cái
   này, và cả hai đều báo lỗi ở `test/cli-help.test.ts` chứ không ở file lệnh

Chuyện này đã xảy ra thật khi thêm `ganas proposal`.

## Chạy test riêng của vùng

```
npx tsx --test 'test/*-cmd.test.ts' 'test/cli-help.test.ts'
```

## Tri thức kiểm chứng được

Đừng viết kết luận thành chữ ở đây — ghi fact có probe trong `.ganas/` rồi trỏ
id. Chữ ở file này không có `last_verified_at`, không hook nào bắt nó còn đúng.
