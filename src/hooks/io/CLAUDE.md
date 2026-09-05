# src/hooks/io/ — vỏ I/O của hook

<!-- Khối `M-hook-io`. File này chỉ được nạp khi agent đụng vào file trong thư
     mục này. Không mô tả khối khác, không chép lại luật gốc. -->

Khối này là `nature: io` — **nơi chạm ra ngoài thật**, và là chỗ duy nhất ganas
chạm vào tiến trình Claude Code. Mỗi sự kiện hook sinh một process Node mới,
nhận JSON qua stdin và phải trả JSON qua stdout đúng khuôn Claude Code hiểu
được. Nó gom dữ liệu từ đĩa, hỏi `M-hook-policy`, rồi phát kết quả ra.

## Cổng vào

Bảy handler cùng khuôn `(input: HookInput) => Promise<HookOutput>`:
`sessionStart`, `preToolUse`, `postToolUse`, `stop`, `subagentStop`,
`preCompact`, `sessionEnd`. Chúng được nối vào Claude Code qua
`plugin/hooks/hooks.json` (sự kiện `SubagentStop` cho `subagentStop`) và
`src/commands/hook.ts`; `readHookInput`/`writeHookOutput` lo phần
stdin/stdout.

## Bất biến dễ phá

- **Handler không bao giờ được ném ra ngoài.** Hook hỏng là phiên hỏng.
  `sessionStart` trả `ALLOW` khi thư mục không dùng ganas; `tryHandoff` tự bắt
  lỗi bên trong thay vì dựa vào lớp bắt-tất-cả ở ngoài — vì lớp đó sẽ nuốt luôn
  thông điệp hữu ích của `preCompact`.
- **Mọi luật CHẶN phải đi qua `enforcementFor()`.** Ngoại lệ đúng bốn cái, và
  đều là luật bảo toàn DỮ LIỆU chứ không phải quy trình: sổ cái xác minh,
  `config.yaml`, thư mục skill, ghi đè thực thể. Luật quy trình mà chặn vô điều
  kiện thì ganas không cài được lên dự án có sẵn.
- **Chỉ đi lấy thứ policy HỎI.** `existsAsync` và `loadGraph` nằm sau nhánh
  `need` chứ không chạy trước — xem lý do ở tài liệu của `M-hook-policy`.

## Cạm bẫy đã trả giá

Chặn ghi sổ cái xác minh qua Bash từng làm bằng cách khớp chuỗi
`command.includes(LEDGER_FILE)` trên lệnh shell thô — đã bỏ vì **sai cả hai
chiều**: chặn nhầm lệnh chỉ ĐỌC có kèm dấu chuyển hướng
(`grep … verify-ledger.jsonl > /tmp/x`), mà lại không cản được ai chỉ cần né
tên file (`git add .ganas`, nối chuỗi trong script). `preToolUse` giờ chỉ chặn
ở nhánh `Write`/`Edit` nơi có đường dẫn thật đã resolve; lớp cưỡng chế thật cho
Bash là hash-chain của chính sổ cái — phát hiện SAU khi đã ghi, không chặn
TRƯỚC.

## Chạy test riêng của vùng

```
npx tsx --test 'test/hooks.test.ts'
```

## Tri thức kiểm chứng được

Đừng viết kết luận thành chữ ở đây — ghi fact có probe trong `.ganas/` rồi trỏ
id. Bằng chứng của khối: `M-hook-io/V-hooks-smoke`.
