# src/hooks/ — nơi ganas trả lời sự kiện hook của Claude Code

<!-- Khối `M-hooks`. File này chỉ được nạp khi agent đụng vào file trong thư
     mục này. Không chép lại luật gốc ở đây. -->

Đây là chỗ DUY NHẤT ganas thật sự chạm vào tiến trình Claude Code: mỗi sự kiện
hook sinh ra một process Node mới, nhận JSON qua stdin và phải trả JSON qua
stdout đúng khuôn Claude Code hiểu được (`readHookInput`/`writeHookOutput` ở
`src/hooks/io.ts`). Mọi khối khác trong ganas chỉ tính toán trên đồ thị đã nạp
sẵn trong bộ nhớ; khối này là ranh giới thật.

> Bản đồ hiện khai khối này `nature: code`, tức là LÕI — mâu thuẫn với đoạn
> trên, vì lõi thì không được tự chạm ra ngoài (`.claude/rules/architecture.md`).
> Chỗ lệch này đang chờ người quyết: `ganas proposal show PR-003`. Đừng tự sửa
> nhãn, và cũng đừng dựa vào nó để kết luận khối này là lõi.

## Cổng vào

Sáu hàm export trong `handlers.ts`, mỗi hàm cùng chữ ký
`(input: HookInput) => Promise<HookOutput>`: `sessionStart`, `preToolUse`,
`postToolUse`, `stop`, `preCompact`, `sessionEnd`. Chúng không tự gọi lẫn
nhau và không có một "hàm chính" nào ở đây — bảng nối tên sự kiện Claude Code
với từng hàm nằm ở `src/commands/hook.ts` (khối `M-commands`, xem `HANDLERS`),
còn khai báo sự kiện nào gọi `ganas hook <event>` nằm ở
`plugin/hooks/hooks.json`. Thêm một handler mới ở đây mà quên nối cả hai chỗ
đó thì hook không bao giờ được gọi tới.

Gần như mọi handler mở đầu bằng `findGanasRoot(input.cwd ?? process.cwd())`
rồi trả `ALLOW` ngay nếu không thấy `.ganas/` — dự án không dùng ganas thì
mọi hook phải im lặng đi qua.

## Bất biến dễ phá

- **Mọi luật CHẶN phải đi qua `enforcementFor()`** (`src/model/config.ts`),
  không hardcode `decision: "block"`. Sức chặn thật của cả dự án ganas nằm
  gọn trong khối này — nơi khác chỉ tính và hiển thị — nên nó cũng là chỗ dễ
  khiến một dự án cũ, cấu trúc khác, không cài được ganas lên nếu chặn vô
  điều kiện. Bốn luật bảo toàn DỮ LIỆU ở `preToolUse` (sổ cái verify,
  `config.yaml`, thư mục skill, ghi đè thực thể) cố ý đứng NGOÀI cờ
  warn/enforce — chúng canh dữ liệu, không phải thói quen. Luật QUY TRÌNH
  (`proposal_decision` ở `preToolUse`, `exit_contract` ở `stop`) thì bắt buộc
  đi qua `enforcementFor`; đó là khuôn phải theo cho bất kỳ luật chặn mới nào
  thêm vào đây.
- **Handler không bao giờ được ném lỗi ra ngoài** — nguyên tắc ghi ngay đầu
  `io.ts`: hook hỏng phải biến thành đi tiếp kèm cảnh báo, không phải kẹt
  phiên. `sessionStart` trả `ALLOW` khi không thấy `.ganas/` không phải vì đó
  là lỗi, mà vì "dự án không dùng ganas" phải đi qua êm, không bị xử như một
  điều kiện hỏng. Ở nhánh thật sự có thể ném (đọc graph, ghi handoff),
  `tryHandoff` tự bọc `try/catch` riêng thay vì dựa vào lớp catch-all bên
  ngoài (`src/commands/hook.ts`) — lớp ngoài bọc NGUYÊN cả handler, nên nếu
  để lỗi của `generateHandoff` lọt ra tới đó, nó nuốt luôn message hữu ích
  "context sắp bị nén, ghi ra file" của `preCompact`, biến cả câu trả lời
  thành một `degraded()` chung chung — đúng lúc người dùng cần đọc cái message
  gốc nhất.

## Cạm bẫy đã trả giá

Chặn ghi sổ cái xác minh qua Bash từng làm bằng cách khớp chuỗi
`command.includes(LEDGER_FILE)` trên lệnh shell thô — đã bỏ vì sai cả hai
chiều: chặn nhầm lệnh chỉ ĐỌC có kèm dấu chuyển hướng
(`grep … verify-ledger.jsonl > /tmp/x`), mà lại không cản được ai chỉ cần né
tên file (`git add .ganas`, nối chuỗi trong script). `preToolUse` giờ chỉ
chặn ở nhánh `Write`/`Edit` có đường dẫn thật đã resolve; lớp cưỡng chế thật
cho Bash là hash-chain của chính sổ cái (`verifyChain()` ở
`src/verify/ledger.ts`) — phát hiện SAU khi đã ghi, không chặn TRƯỚC.
(`src/hooks/handlers.ts:320-327`)

## Chạy test riêng của vùng

```
npx tsx --test 'test/hooks.test.ts'
```

## Tri thức kiểm chứng được

Đừng viết kết luận thành chữ ở đây — ghi fact có probe trong `.ganas/` rồi
trỏ id. Chữ ở file này không có `last_verified_at`, không hook nào bắt nó còn
đúng. Bằng chứng smoke của cả khối: `M-hooks/V-hooks-smoke`
(`.ganas/modules/M-hooks.yaml`).
