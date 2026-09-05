---
name: plan-to-tasks
description: Chẻ một plan Claude Code Plan Mode vừa được duyệt thành Design/Task của ganas, gán `model` (main/verifier/scribe) cho từng task ngay lúc chẻ. Nếu được đưa đường dẫn file plan, skill sẽ đọc toàn bộ file đó trước khi chẻ; nếu được kích hoạt vừa sau ExitPlanMode không có file, dùng nội dung plan đã có sẵn trong context.
when_to_use: "plan vừa được duyệt qua ExitPlanMode, sắp bắt đầu hiện thực một plan nhiều bước"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" *), Read
---

# Chẻ plan thành task

Plan Mode là tính năng CỦA Claude Code. Skill này hỗ trợ hai cách dùng:
- Khi được đưa đường dẫn file plan, skill sẽ đọc toàn bộ file đó làm nội dung chuẩn trước khi chẻ.
- Khi được kích hoạt mà không có file, nội dung plan đã duyệt trong context của phiên này sẽ được dùng.
Không tự đi tìm file plan — nếu không ai đưa đường dẫn thì chỉ dùng context.

## Các bước

0. **Đọc file plan nếu được đưa đường dẫn.** Nếu được đưa đường dẫn file plan, `Read` toàn bộ file đó — nội dung file thay cho nội dung plan trong context của phiên này. Nếu vừa được kích hoạt qua ExitPlanMode (không có file), bỏ qua bước này và dùng nội dung plan đã có sẵn. **Không tự đi tìm file plan**: chỉ đọc khi ai đó đưa đường dẫn file plan rõ ràng.

1. **Gắn vào Design.** Nếu plan hiện thực một hướng đã có `.ganas/designs/`
   phù hợp, dùng lại nó (`implements` trỏ vào đó). Nếu plan là một hướng
   tiếp cận mới, tạo Design mới — nhớ khai `serves` đúng goal.

2. **Cấp ID thật ngay, từ lần nhắc tới task đầu tiên.** Chạy `ganas id task
   --count N` một lần cho cả loạt, rồi dùng đúng những id đó trong mọi câu
   sau — kể cả lúc mới bàn miệng, chưa ghi file nào. Cấm nhãn tạm: "Task 1",
   "Lô 3", "P1-T2.3", "T4a" — mỗi nhãn tạm là một lớp phiên dịch mà phiên sau
   phải tự đoán lại, và không nhãn nào tra được bằng `ganas`. Rẻ lúc viết,
   đắt ở mọi lượt đọc về sau.

   Không có mức "subtask": việc con là task anh em, nối bằng `blocked_by`,
   thứ tự và cụm đọc được từ DAG. Đánh số `4a/4b/4c` là giả vờ có một tầng
   không tồn tại trong model.

   Không có "phase"/"sprint"/"lô": đơn vị gom nhóm là **Scope** (`P-`, ranh
   giới bàn giao + code + người ký) và **Design** (`D-`, một hướng tiếp
   cận). Một plan vừa duyệt thường ứng với đúng một Design — muốn nói
   "phase 1" thì gọi tên Design đó.

3. **Chẻ thành Task vừa một phiên.** Ưu tiên nhiều task nhỏ hơn một task
   khổng lồ (`estimated_context: large` bị validator cảnh báo — đó là dấu
   hiệu phải chẻ tiếp, không phải thứ chấp nhận được).

4. **Mỗi task khai đủ:**
   - `touches` — khối nào trong sơ đồ bị chạm.
   - `exit_contract` — mỗi khối trong `touches` phải có ít nhất một tiêu chí
     `kind: verification` kiểm nó (luật `spine/task-missing-verification`,
     đã có sẵn — không viết luật mới).
   - `role` — `design` (chốt bản vẽ, không đụng code) hay `build` (hiện thực
     theo bản vẽ). Mặc định `build`; khai `design` thì task đó **không được**
     có `touches` (`spine/design-task-touches-code`, error) và phải có tiêu
     chí `exit_contract` kiểu `artifact` trỏ `.ganas/designs/<id>.yaml`
     (`spine/design-task-without-artifact-criterion`).
   - `consumes` / `produces` — nếu design đã có `artifacts` (bản vẽ, địa chỉ
     `D-010/A-x`), khai task nào SINH bản vẽ nào (`produces`) và task nào
     CẦN bản vẽ nào (`consumes`) thay vì nhét đường dẫn vào
     `context_contract.must_read`: brief bơm thẳng `shape` của đúng bản vẽ
     cần, một design mười bản vẽ mà task chỉ dùng hai thì tám cái còn lại là
     nhiễu. `produces` phải kèm một tiêu chí `exit_contract` kiểu
     `verification` trỏ đúng bản vẽ đó, nếu không `spine/task-produces-without-verification`
     cảnh báo. Đừng khai tay task nào là "bước sau" (không có trường `next`)
     — nó SUY được từ việc task sau `consumes` đúng thứ task này `produces`.
   - `agent` — CHỈ điền khi task thật sự sẽ giao cho sub-agent (xem mục 5 và
     skill `design` cho bản vẽ nó cần). Ba ranh giới hay sai:
     - điều **kiểm chứng được** thuộc `exit_contract` (lệnh chạy được),
       KHÔNG phải một câu trong `agent.self_check` để agent tự chấm mình —
       tự chấm mình không phải bằng chứng.
     - quy trình **lặp lại ở nhiều task** thì thành `skills` (đã có sẵn,
       brief tự nạp theo `touches`); `agent.steps` chỉ cho bước RIÊNG của
       task này.
     - guardrail đã cưỡng chế ở nơi khác thì **đừng chép lại**: "không ra
       ngoài scope" đã là `scope` + `taskBoundary()`; "không bịa tri thức"
       đã là luật ghi tri thức có hook chặn. Một `agent.guardrails` lặp lại
       luật đã cưỡng chế sẵn chỉ làm task dài ra mà không thêm gì.

   Có tiêu chí thôi chưa đủ: mỗi tiêu chí phải **ĐỎ ngay lúc viết task**.
   Xanh sẵn thì nó không gác gì — task có thể "xong" mà chẳng ai phải sửa
   dòng nào. Trước khi ghi task xuống, chạy thử chính lệnh trong `run:`; nếu
   nó đạt ngay, viết lại tiêu chí tới khi nó đòi đúng thứ task này sắp tạo
   ra. Ca hay gặp nhất: task sửa bug mà tiêu chí là `npm test` — cả bộ test
   đang xanh sẵn nên tiêu chí này không gác gì cả; đúng phải là một test
   *tái hiện được bug*, đỏ bây giờ và chỉ xanh sau khi sửa. `ganas next
   --session` có chụp baseline và cảnh báo chuyện này, nhưng lúc đó task đã
   viết xong — vá ở đây, lúc chẻ, rẻ hơn nhiều. **Một gate tự xanh trước khi
   sửa là gate không tồn tại.**

5. **Gán `model` cho MỌI task, ngay lúc chẻ.** Field `Task.model`, một trong
   ba tier có sẵn trong `config.yaml` (`main`/`verifier`/`scribe`):
   - `main` — việc thật sự khó/mơ hồ, cần phán đoán nhiều.
   - `scribe` — việc cơ học, đơn giản, ít quyết định.
   - `verifier` — khoảng giữa hai loại trên.

   Gán `commit_type` cùng lúc với `model`: một trong các conventional commits
   (`feat|fix|refactor|docs|test|chore|perf|build|ci`), mặc định `chore`. Field
   này dùng để dựng commit message dạng `<commit_type>(<design>/<task>): <title>`.

   Đây là quyết định của agent NGAY LÚC THIẾT KẾ — lúc này agent hiểu độ khó
   từng phần rõ hơn bất kỳ heuristic nào suy sau (vd suy từ `module.nature`).
   Không suy tự động.

   **Đừng gán `main` cho cả loạt.** Một plan đã chẻ đúng thì phần lớn task là
   việc cơ học có ranh giới rõ — đó là `scribe`/`verifier`. Gán `main` hết
   nghĩa là hoặc chưa chẻ đủ, hoặc chưa thật sự cân độ khó. `ganas validate`
   báo `spine/task-missing-model` cho task nào bỏ trống, và brief của task đó
   sẽ mở đầu bằng cảnh báo "chưa ai quyết ai làm".

6. **Chạy `ganas validate`.** Validator hiện có (liên kết goal/design/scope,
   `task-missing-verification`, `estimated_context: large`...) đã đủ để bắt
   lỗi chẻ ẩu — không cần bước kiểm tra thủ công thêm.

## Hai ràng buộc xếp thứ tự đã trả giá thật

Hai điều dưới đây từng làm việc chẻ task phải sửa lại giữa chừng — chẻ tiếp
theo mà biết trước thì khỏi lặp lại:

- **Một task không được chạm khối của hai phạm vi.**
  `scope/task-touches-outside-scope` (error) bắt lỗi khi `task.touches` có
  khối không nằm trong `scope.modules` của phạm vi task thuộc về. Nếu một
  bước công việc tự nhiên đụng khối ở hai `Scope` khác nhau, chẻ theo **ranh
  giới phạm vi trước**, rồi mới chẻ tiếp theo việc bên trong từng phạm vi —
  không chẻ theo việc trước rồi mới phát hiện task chạm sai phạm vi.
- **Trường schema mới phải ship CÙNG người đọc nó ngoài `src/model/`.** Thêm
  một field vào `zTask`/`zDesign`/... mà chưa có chỗ nào đọc nó (validator,
  brief, lệnh CLI) thì `test/no-dead-ends.test.ts` đỏ — đây là guard test
  chặn đúng lớp lỗi "khai rồi không nối dây" đã xảy ra nhiều lần trong repo
  này (`zone_survey`, `part.exit`, `Fact.ttl_days`...). Đừng chẻ một task
  "thêm field vào schema" tách rời khỏi task "dùng field đó ở đâu đó thật" —
  hai việc đó phải chung một task hoặc task sau phải `blocked_by` ngay, nếu
  không graph đỏ ở khoảng giữa hai task.

## Không làm gì thêm

Không có lệnh CLI riêng cho bước này — chẻ task là việc ghi file YAML vào
`.ganas/tasks/` (và `.ganas/designs/` nếu cần) bằng Write/Edit như bình
thường, rồi chạy `ganas validate` để xác nhận. Write lên một file thực thể
`.ganas/` ĐÃ tồn tại bị hook từ chối (ghi đè âm thầm là mất dữ liệu) — muốn
sửa file có sẵn thì dùng Edit.
