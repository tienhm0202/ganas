# Từ plan đã duyệt tới chặng chạy hết — không dừng lại chờ người giữa chừng

Tài liệu này trả lời đúng một câu: **bạn vừa duyệt xong một plan trong Claude
Code Plan Mode, giờ làm gì để không đánh mất mọi thứ ganas 1.2.0 vừa xây?**
Khác `docs/WORKFLOW.md` — luồng ở đó là luồng TƯƠNG TÁC, người ngồi cùng, gõ
`ganas next`, xem gate, quyết từng bước. Luồng ở đây ngược lại đúng chỗ quan
trọng nhất: **người chỉ duyệt plan một lần rồi rời đi**, và ganas phải tự chạy
hết phần còn lại.

## 1. Khoảnh khắc sau `ExitPlanMode` — vì sao nó là chỗ hở

`ExitPlanMode` là tính năng CỦA Claude Code, không phải của ganas. Ngay khi
plan được duyệt, hành vi MẶC ĐỊNH của Claude Code là bắt tay hiện thực NGAY —
và đó là điều **đúng** ở mọi dự án không dùng ganas. Không có gì sai ở đó cả.

Cái sai là: bạn không có lý do nào để ngờ rằng dự án NÀY khác. Không có lệnh
nào đỏ lên nhắc bạn dừng lại. Không hook nào kêu. Phiên đó **chưa hề có task
ganas nào được tạo**, nên không có gì để một hàng rào của ganas gác cả — mọi
cơ chế của bản 1.2.0 này đều đứng ở phía SAU khi đã có task, và khoảnh khắc
sau `ExitPlanMode` nằm ở phía TRƯỚC đó.

Đi thẳng vào code lúc này, bạn mất trọn ba thứ:

- **Task có ranh giới commit** — không có `touches`/`exit_contract` nào neo
  thay đổi vào một khối cụ thể, nên không có gì để `ganas gate` chấm.
- **Báo cáo phản biện của worker** — mẫu ba mục (lệch đặc tả / quyết định tự
  ý / phát hiện, nghi ngờ) chỉ được đòi khi sub-agent nhận việc qua
  `ganas brief`, không phải khi Claude tự hiện thực trong chính phiên đang
  duyệt plan.
- **Vòng lặp chạy hết chặng** — `auto_loop` (mục 6) chỉ mồi lại sau khi
  `ganas gate` báo xanh; không có task, không có gate, không có gì để mồi.

Bốn bước dưới đây (2–5) đóng đúng chỗ hở này. Bước 6 là phần TUỲ CHỌN, và cố ý
đọc xong bốn bước đầu bạn mới nên cân nhắc bật nó.

## 2. Lưu plan ra file, đưa đường dẫn cho skill `plan-to-tasks`

Nội dung plan vừa duyệt đang nằm trong context của phiên — nó sẽ mất khi phiên
kết thúc hoặc bị nén (compact), giống mọi thứ không được ghi ra đĩa. Lưu nó ra
một file trong dự án (ví dụ `docs/plans/<tên-việc>.md`, hoặc bất kỳ đường dẫn
nào bạn quen dùng — ganas không đòi vị trí cố định) trước khi làm gì tiếp.

Rồi gọi skill `plan-to-tasks` kèm đường dẫn file đó. Có file đường dẫn, skill
đọc TOÀN BỘ file làm nội dung chuẩn; không có file (ví dụ gọi ngay sau
`ExitPlanMode`, chưa kịp lưu), skill dùng nội dung plan đã có sẵn trong
context của phiên. Ưu tiên đưa đường dẫn file — nội dung trên đĩa không lệ
thuộc vào context còn sống hay đã bị nén.

## 3. Chẻ task — gán `model` và `commit_type` ngay lúc chẻ

Sáu bước chẻ một plan thành Design/Task nằm ở
[`plugin/skills/plan-to-tasks/SKILL.md`](../plugin/skills/plan-to-tasks/SKILL.md)
— tài liệu này KHÔNG chép lại chúng. Hai bản song song thì bản sai luôn là
bản không ai đọc; đọc file đó khi thực sự chẻ.

Một điều đáng nhắc lại ở đây vì nó dễ bị bỏ qua khi vội: skill đòi gán
`Task.model` (`main`/`verifier`/`scribe`) và `Task.commit_type` (conventional
commits) cho **mọi** task **ngay lúc chẻ**, không để trống rồi tính sau. Đây
không phải thủ tục hình thức — nó là thứ quyết định ai làm task đó ở bước 4:
bỏ trống, `ganas validate` báo `spine/task-missing-model` và brief của task
mở đầu bằng cảnh báo "chưa ai quyết ai làm". Không có `model`, không có sub-
agent nào được giao đúng tier, và bước 4 dưới đây không chạy được.

## 4. Giao sub-agent bằng `ganas brief <id>` — không chép brief bằng tay

Sau khi task đã có trong `.ganas/tasks/` và `ganas validate` sạch, việc sửa
code KHÔNG chạy trong chính phiên đang điều phối. Tạo một sub-agent, và
prompt mở đầu của nó là đúng một lệnh:

```
ganas brief <id>
```

Để sub-agent tự gọi lệnh này lấy brief, đừng đọc brief ra rồi chép nội dung
vào prompt bằng tay. Chép tay là chỗ brief bị bóp méo — thiếu một dòng cảnh
báo, một tri thức stale, hoặc đúng đoạn "giới hạn phải nói thẳng" mà brief cố
ý in ra. `ganas brief` sinh CƠ HỌC từ graph nên luôn tươi tại đúng thời điểm
sub-agent đọc nó; một bản chép tay thì tươi tại thời điểm bạn chép, không phải
tại thời điểm nó được dùng.

Hai lý do tách việc điều phối khỏi việc sửa code, không phải một: context của
phiên điều phối không bị chi tiết thực thi (log, diff, output test) nuốt mất;
và tier thấp (`scribe`/`verifier`) không bị đẩy vào việc phải tự phán đoán khi
việc thật ra là cơ học.

Phiên điều phối, sau khi sub-agent báo xong, chạy `ganas gate` để chấm —
**bằng lệnh, không bằng lời tổng kết của sub-agent**. Đây chính là điều nhắc
lại ở mục 6 dưới, và là điều quan trọng nhất của cả tài liệu này.

## 5. Mẫu báo cáo ba mục, và hook `SubagentStop` đòi nó thế nào

Sub-agent phải kết thúc lượt bằng đúng ba tiêu đề Markdown:

```
## Lệch so với đặc tả
## Quyết định tự ý
## Phát hiện / nghi ngờ
```

rồi một dòng kết luận `Kết luận: XONG` hoặc `Kết luận: CHẶN: <lý do một
dòng>`. Đây là mẫu mà `ganas brief` in sẵn cho sub-agent đọc (không cần bạn
gõ tay vào prompt) — xem `REPORT_SECTIONS` ở `src/render/brief.ts:85`.

Hook `SubagentStop` (`subagentStop` — `src/hooks/io/handlers.ts:619`) chặn
sub-agent dừng lại nếu thiếu một trong ba tiêu đề, đúng MỘT LẦN cho mỗi
agent — nhắc một lần rồi thôi, không nhốt sub-agent vào vòng đòi lại bất tận.
Báo cáo — kể cả bản còn thiếu — luôn được ghi ra `.ganas/runs/notes/` trước
khi hàng rào này chạy, nên không có báo cáo nào bị chặn thì mất hẳn.

**Đây là chỗ phải nói thẳng, không được bán hàng:** hàng rào này kiểm được
**sự CÓ MẶT** của ba tiêu đề (`hasReportHeading` — cùng file, dòng ~552 — chỉ
so khớp một dòng heading Markdown), **không kiểm được nội dung bên dưới**.
Worker viết `## Lệch so với đặc tả` rồi để nguyên dòng `(không có)` là qua
hàng rào — đúng cú pháp, không đúng bằng chứng gì cả.

Quan sát thật, không phải suy đoán: trong một phiên chạy ngày 2026-09-05,
cùng một prompt, model bậc mạnh (`main`) viết cả ba mục có nội dung thật, kể
cả chỗ nói ngược lại người ra đề (đúng thứ mẫu báo cáo này sinh ra để bắt);
model bậc nhỏ (`scribe`) viết `(không có)` ở cả ba mục và vẫn qua hàng rào.
Ai đọc tài liệu này mà tưởng "báo cáo tồn tại" nghĩa là "báo cáo đáng tin" sẽ
tin nhầm đúng chỗ nguy hiểm nhất: chỗ worker được quyền nói ngược lại người ra
đề, tức đúng chỗ một model yếu có động cơ nhất để im lặng.

**Chỗ kiểm thật vẫn là `ganas gate` và `.ganas/verify-ledger.jsonl`, không
phải văn xuôi của worker.** Ba mục báo cáo là kênh để bạn — người đọc —
phát hiện worker đang nói ngược lại đặc tả hay đang giấu một quyết định tự ý;
nó không phải, và không thay thế, bằng chứng chạy được. Việc "task này đã
xong" chỉ được quyết bởi `ganas gate` chạy lệnh thật trong `exit_contract`,
đọc kết quả đã ghi ở sổ cái xác minh — không phải bởi dòng `Kết luận: XONG`
mà sub-agent tự viết.

## 6. `auto_loop` — bật thế nào, bốn phanh, và vì sao mặc định tắt

Bốn bước trên đã đủ để chạy hết một chặng: lặp lại mục 3–5 cho từng task, tự
gõ `ganas commit` rồi `ganas next` giữa hai task. `auto_loop` chỉ thay bước
"bạn tự gõ `commit`/`next`" bằng "ganas tự nhắc gõ" — nó KHÔNG nới lỏng bất
kỳ tiêu chí nào, và **không bắt buộc** để chạy hết một chặng.

### Bật thế nào

Sửa `auto_loop.enabled` trong `.ganas/config.yaml` của dự án:

```yaml
auto_loop:
  enabled: true
  # max_iterations: 5    # trần số vòng liên tiếp trong CÙNG một task
```

Khi bật, brief của mỗi task giao sub-agent (mục 4) sẽ có thêm một đoạn nói rõ:
sau khi `ganas gate` báo xanh, đừng dừng lại chờ người — tự chạy `ganas
commit` → `ganas next` → giao sub-agent kế tiếp cho task mới, cho tới khi hết
task chưa `done` trong cùng design.

### Bốn phanh — không cái nào dựa vào hành vi của harness

Vòng lặp thật nằm ở PROMPT (phiên điều phối tự gõ lệnh kế tiếp), không phải ở
bản thân hook `Stop` tự lặp — hook chỉ mồi lại đúng một nhịp mỗi lượt. Bốn
điều kiện dừng dưới đây là cơ chế MỚI của bản 1.2.0, mỗi cái đọc từ
`.ganas/state.json` (khoá theo `sessionId`, sống xuyên suốt phiên bất kể đổi
bao nhiêu task — xem docstring `State.auto_loop`, `src/state.ts`), không cái
nào cần harness báo đúng một cờ nào đó thì mới hoạt động:

1. **Chạm trần `max_iterations`** — số vòng liên tiếp trong cùng một phiên
   vượt ngưỡng cấu hình.
2. **Cùng một task đỏ hai lượt liên tiếp** — gate không đạt, sinh task vá,
   task vá cũng đỏ: tín hiệu vòng lặp không tiến triển, không phải "sắp
   xong".
3. **Cờ `halted`** — bật khi báo cáo của sub-agent (mục 5) tự khai `Kết
   luận: CHẶN:`. Worker nói thật là hành vi cần thưởng, không phải phạt —
   nên đây không phải một lần hàng rào CHẶN sub-agent, mà là auto-loop tự
   dừng để người xử lý.
4. **Hết task chưa `done` trong cùng design** — chặng coi như xong, không
   còn gì để mồi tiếp. (`Design` chính là "chặng" — ganas cố ý không có khái
   niệm "phase"/"sprint" riêng, xem `plugin/skills/plan-to-tasks/SKILL.md`
   mục 2.)

Một tiêu chí `kind: manual` trong `exit_contract` (đòi người xác nhận tay)
vẫn luôn dừng loop trước khi tới cả bốn phanh trên — đây là ranh giới của
G-002 ("hàng rào không xanh được khi chưa kiểm gì"), auto-loop không được
phép nới nó.

Ngoài bốn phanh trên còn một phanh thứ năm đã có SẴN trong Claude Code —
`stop_hook_active` — giữ nguyên làm lớp ngoài cùng nhưng KHÔNG được tính vào
"bốn phanh" vì nó phụ thuộc hành vi harness, không phải trạng thái ganas tự
giữ. Xem lý do phải tách riêng ở mục dưới.

### Vì sao mặc định TẮT, và nên để tắt cho tới khi chạy thử

`auto_loop.enabled` mặc định `false`. Đây không phải sự khiêm tốn giả — lý do
có bằng chứng cụ thể, ghi ở `.ganas/claims/C-003.yaml`: ba hành vi của chính
harness Claude Code quanh sự kiện `SubagentStop`/`stop_hook_active` **chưa
quan sát được** trong sandbox viết ra bản 1.2.0 này, cụ thể:

- `stop_hook_active` có còn `true` ở đúng lượt Stop kế tiếp sau một lượt
  `decision: block`, hay có thể còn `true` qua nhiều lượt — tài liệu không
  nói rõ, và không tìm được ví dụ JSON cụ thể để khẳng định.
- `SubagentStop` có thật sự nhận field `stop_hook_active` giống `Stop` không
  — trả lời được bằng TÀI LIỆU (Agent SDK của Anthropic, có), nhưng chưa
  bằng một log hook thật bắt được từ chính harness CLI.
- Một sự kiện `SubagentStop` bắn ra có dùng chung `session_id` với `Stop` của
  phiên cha hay không — suy được một phần từ việc `preToolUse`/`postToolUse`
  đã dùng chung `session_id` cho tool-call từ sub-agent, nhưng chưa xác nhận
  trực tiếp cho `SubagentStop`.

Bốn phanh ở trên KHÔNG dựa vào bất kỳ điều nào trong ba điều trên — đó chính
là lý do chúng được thiết kế sống trong `state.json` của ganas thay vì dựa
vào `stop_hook_active`. Nhưng bản thân cơ chế `auto_loop` vẫn còn non: nó
chưa từng chạy một chặng thật nào ngoài test tự động (`test/auto-loop.test.ts`
giả lập input, không phải một phiên Claude Code CLI thật). Bật nó lên nghĩa
là để ganas tự gọi `ganas commit` — commit thật, vào git thật — không có
người xác nhận giữa hai lần commit.

Khuyến nghị cụ thể: **để `enabled: false` cho tới khi bạn tự chạy tay một
chặng nhỏ 2–3 task theo mục 2–5** (không bật `auto_loop`), xem `gate`/
`commit` có đúng ý ở dự án của bạn không, rồi mới bật thử trên một chặng nhỏ
tương tự có người theo dõi màn hình. Đừng bật `auto_loop` làm bước đầu tiên
khi mới biết tới luồng này.

## Xem thêm

- `plugin/skills/plan-to-tasks/SKILL.md` — sáu bước chẻ plan (mục 3).
- `.ganas/claims/C-003.yaml` — nguồn đầy đủ của mọi cảnh báo `auto_loop` ở
  mục 6, kèm anchor vào code và tài liệu Claude Code.
- `docs/WORKFLOW.md` — luồng tương tác từng bước, dùng khi bạn ngồi cùng
  phiên thay vì rời đi sau khi duyệt plan.
- `docs/CONCEPTS.md` — Goal/Design/Task/Scope/Module và ba loại tri thức, để
  hiểu sâu từng khái niệm được nhắc ở trên.
