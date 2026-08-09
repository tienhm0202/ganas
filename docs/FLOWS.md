# Các luồng chính của ganas

Tài liệu này trả lời câu hỏi **"dữ liệu chạy qua đâu"** — khác với
`docs/CONCEPTS.md` (từng khái niệm là gì), `docs/COMMANDS.md` (từng cờ của từng
lệnh) và `docs/WORKFLOW.md` (một ngày làm việc, từng bước).

Mọi sơ đồ dưới đây vẽ theo **code hiện hành**, mỗi node ghi kèm hàm/file thật.
Nếu sơ đồ và code lệch nhau thì sơ đồ sai — sửa sơ đồ, đừng sửa trí nhớ.

Có **5 luồng**. Ba luồng đầu là xương sống; hai luồng sau là thứ khiến ganas
khác một trình quản lý task thông thường.

---

## 0. Dòng chảy — `ganas` trần trả lời "bước kế tiếp là gì"

Bốn luồng phía dưới mô tả dữ liệu chạy qua đâu. Luồng này khác: nó là thứ người
dùng thật sự gặp. `ganas` không tham số in **đúng một** bước kế tiếp — không phải
menu 12 lệnh, vì mỗi lựa chọn đẩy sang người dùng là một chỗ đi lạc.

```mermaid
flowchart TD
  I["init<br/>chưa có .ganas/"] --> FG["fix-graph<br/>graph có lỗi"]
  FG --> SC["scope<br/>chưa có phạm vi"]
  SC --> GO["goal<br/>chưa có mục tiêu active"]
  GO --> DE["design<br/>chưa có design phục vụ goal"]
  DE --> EV["evidence<br/>khối chưa có bằng chứng nào"]
  EV --> TA["task<br/>chưa có task làm được"]
  TA --> WO["work<br/>chưa mở brief"]
  WO --> VE["verify<br/>bằng chứng chưa tươi"]
  VE --> GA["gate<br/>tiêu chí chưa đạt"]
  GA --> CO["commit<br/>phạm vi task còn bẩn"]
  CO --> CL["close<br/>chưa đánh dấu done"]
  CL -.->|vòng sau| TA
```

**Bước kế tiếp = chặng ĐẦU TIÊN chưa xong.** Thứ tự là thứ tự *phụ thuộc*, không
phải sở thích: graph hỏng thì mọi kết luận phía sau không tin được nên nó chặn
trước; không có phạm vi thì task không neo vào đâu.

Bảng chặng nằm ở `STAGES` (`src/flow.ts`) — **dữ liệu, không phải cây `if`**.
Chuyển việc rẽ nhánh từ đầu người dùng sang một hàm 500 dòng thì chỉ đổi chỗ
đau. Mỗi chặng là một dòng: điều kiện xong, việc phải làm, vì sao, lệnh (hoặc
khung YAML dán được cho các chặng chưa có lệnh).

### Hai luật của dòng chảy, và vì sao chúng là test

1. **Mọi chặng phải có việc làm được** — một lệnh hoặc một khung dán được. Chặng
   không có gì là ngõ cụt.
2. **Mỗi chặng phải vượt được bằng chính việc nó bảo làm.** Nghe hiển nhiên, và
   mình vi phạm ngay lần đầu: `work` và `verify` từng dùng chung điều kiện xong,
   nên chạy `ganas next` không bao giờ qua được `work`.

`test/flow.test.ts` đi trọn một vòng từ repo trống, làm đúng lệnh mà mỗi chặng
in ra. Nó **là đặc tả**: thêm chặng mà quên đường vượt thì test kẹt và gọi đúng
tên chặng kẹt.

Ba lỗi thiết kế bị chính test này bắt trong lần viết đầu:
- `commit` xét cả cây làm việc bẩn ⇒ một file lạc không liên quan cũng làm chặng
  đó **không bao giờ qua được** trong repo thật. Nay chỉ xét đúng đường dẫn mà
  `ganas commit` sẽ stage (`pathsToStage`).
- `work`/`verify` trùng điều kiện (ở trên).
- thiếu hẳn chặng `evidence`: `ganas scope new` tạo khối với `verify: []`, nên
  khung task bảo trỏ vào `M-x/<V-id>` mà **chưa có bằng chứng nào để trỏ**.

## 1. Luồng phiên — từ lúc mở tới lúc đóng

Đây là luồng người dùng không bao giờ gõ tay: hook của Claude Code gọi ganas ở
sáu thời điểm (`plugin/hooks/hooks.json` → `src/commands/hook.ts` → `HANDLERS`).

```mermaid
flowchart TD
  SS["SessionStart hook<br/>handlers.sessionStart"] --> BIND{"phiên đã bind task?<br/>state.taskForSession"}
  BIND -->|có, chưa done| KEEP["giữ task cũ"]
  BIND -->|không| PICK["selectNextTask(graph, preferScope)<br/>graph/select.ts"]
  KEEP --> BRIEF["renderBrief()<br/>render/brief.ts"]
  PICK --> BRIEF
  BRIEF --> CTX["additionalContext<br/>bơm vào đầu context phiên"]

  CTX --> WORK["agent làm việc"]

  WORK --> PRE["PreToolUse<br/>handlers.preToolUse"]
  PRE -->|"Write/Edit vào verify-ledger.jsonl"| DENY["deny — chỉ ganas verify được ghi"]
  PRE -->|khác| WORK

  WORK --> POST["PostToolUse<br/>handlers.postToolUse"]
  POST -->|"ghi .ganas/ sai schema<br/>hoặc claim thiếu anchor"| WARN["block / cảnh báo<br/>theo enforcementFor()"]
  POST -->|hợp lệ| WORK

  WORK --> STOP["Stop hook<br/>handlers.stop"]
  STOP -->|"phiên chưa ghi file<br/>từ lần chấm trước"| QUIET["im lặng đi tiếp<br/>(lượt hỏi đáp)"]
  STOP -->|"đã ghi file"| GATE["evaluateGate()<br/>gate.ts"]
  GATE -->|chưa thoả| BLOCK["chặn kết thúc phiên"]
  GATE -->|thoả| END["SessionEnd<br/>generateHandoff()"]
  BLOCK --> WORK
  QUIET --> WORK
```

**Vì sao có nhánh `QUIET`:** Stop hook chạy ở cuối **mọi** lượt trả lời, mà phần
lớn lượt là hỏi đáp — không file nào đổi. Chấm `exit_contract` ở đó thì đương
nhiên trượt (chưa ai làm gì), và cái giá là thật: một lượt trả lời thừa để thoát
khỏi `decision: "block"`, cộng với việc mọi tiêu chí `kind: command` (`npm test`,
`tsc`…) chạy lại từ đầu. Nên `handlers.postToolUse` đặt cờ `touched_at` vào bản
ghi phiên mỗi khi có ghi file (`preToolUse` làm việc tương tự cho `sed -i`, `>`
qua Bash), còn `handlers.stop` chỉ chấm khi thấy cờ đó rồi hạ nó xuống. Một đợt
sửa được chấm đúng một lần; hỏi bao nhiêu câu sau đó cũng không đánh thức gate.

**Điểm đứt đã biết, ghi ở đây để không ai tưởng nó liền:** `generateHandoff()`
ghi `.ganas/runs/<session>.md`, nhưng **không code nào đọc lại file đó**.
`sessionStart` dựng brief thuần từ graph. Thứ duy nhất thật sự đi qua ranh giới
phiên là `state.current_task` (`src/state.ts`) và những gì đã được ghi thành
fact/claim trong `.ganas/`. Handoff hiện là bản ghi cho **người** đọc, không
phải cho phiên sau.

---

## 2. Luồng dịch — từ câu nói người dùng thành graph

Đây là luồng phục vụ mục tiêu của ganas: chuyển ngôn ngữ người dùng sang ngôn
ngữ quản lý dự án.

```mermaid
flowchart LR
  SAY["người dùng nói:<br/>'tôi muốn khách đặt lịch qua Zalo'"] --> Q["ganas scope new<br/>commands/scope.ts"]
  Q --> Q1["Bàn giao cái gì? → title"]
  Q --> Q2["Code ở đâu? → paths"]
  Q --> Q3["Sao biết là xong? → acceptance"]
  Q --> Q4["Ai ký? → owner"]
  Q1 & Q2 & Q3 & Q4 --> SC["scopes/P-x.yaml"]
  Q2 --> MOD{"đã có khối<br/>paths trùng?"}
  MOD -->|có| REUSE["dùng lại khối đó"]
  MOD -->|không| NEW["tạo modules/M-x.yaml<br/>nature: code"]

  SC --> HAND["3 mẩu còn phải viết TAY:<br/>goal · design · task"]
  HAND --> VAL["ganas validate"]
```

**Khoảng trống đã đo (P2 N18):** `scope new` phủ trục **hệ thống** (phạm vi +
khối). Trục **xương sống** (goal → design → task) vẫn phải viết tay — ba mẩu
YAML. Đây là con số đo thật từ repo trống, không phải ước lượng.

---

## 3. Luồng bằng chứng — vì sao `fresh` không tự khai được

Luồng quan trọng nhất của ganas. Điểm mấu chốt: **YAML sửa tay được, dòng sổ
cái thì không** (hook chặn ghi thẳng), nên `validate` đối chiếu được hai bên.

```mermaid
flowchart TD
  T["allTargets(graph)<br/>verify/run.ts"] --> K{"kind"}
  K -->|probe| LINT["lintProbe()<br/>verify/lint.ts<br/>rỗng ruột / lạc đề / nguy hiểm"]
  K -->|eval| EV["runEval() + adapter<br/>verify/adapters.ts"]
  K -->|contract| TR["thuộc ganas trace,<br/>KHÔNG chạy ở đây"]

  LINT -->|chặn| UNPROV["unprovable"]
  LINT -->|qua| SKIP{"skip_if khớp?"}
  SKIP -->|có| UNAVAIL["unavailable<br/>KHÔNG phải fail"]
  SKIP -->|không| RUN["runShell + judge()<br/>util/exec.ts"]
  RUN -->|fail| FAIL["fail"]
  RUN -->|pass| MUT["proveCanFail()<br/>verify/mutate.ts<br/>bóp méo probe rồi chạy lại"]
  MUT -->|bản bóp méo cũng pass| CANNOT["unprovable — probe rỗng ruột"]
  MUT -->|bản bóp méo fail| PASS["pass"]

  PASS & FAIL & UNAVAIL & UNPROV & EV --> LEDGER[("verify-ledger.jsonl<br/>append-only, COMMIT vào git")]
  PASS & FAIL --> YAML["ghi ngược last_verified_at<br/>writeBackFact()"]

  LEDGER --> FRESH["computeFreshness()<br/>graph/freshness.ts"]
  YAML --> FRESH
  FRESH --> BRIEF2["brief: dùng được / cần verify lại / ngoài phạm vi"]
  LEDGER --> VALID["validate: đối chiếu YAML với sổ cái<br/>knowledge/unbacked-verification"]
```

`computeFreshness` trả **một trong 11 lý do**, không phải một mức độ — vì "model
đã đổi" và "file đã sửa" dẫn tới hai hành động khác nhau. Chỉ `fresh` được coi
là dùng được (`isUsable`).

**Đã bịt ở P2 N21–N27:** `statement` nay nằm trong `defHash`; `proof` được ghi
vào sổ cái và `--no-mutation` không còn thành pass vĩnh viễn; độ cũ tính theo
**nội dung** file chứ không theo `mtime` (nên `touch -d` không đảo được);
`ttl_days` của fact thật sự hết hạn; `.ganas/config.yaml` được bảo vệ như sổ cái.

**Còn nợ, ghi thẳng để không quên:** `kind: eval` vẫn KHÔNG đi qua lint lẫn
mutation test (`run.ts` chỉ chạy chúng cho `kind: probe`) — mà eval chính là
bằng chứng bắt buộc của khối `nature: llm`. Và sổ cái vẫn chưa có hash chain:
`readLedger` mới ĐẾM được dòng hỏng, chưa phát hiện được ai sửa lịch sử bằng
`git checkout` một bản cũ.

---

## 4. Luồng tri thức — phạm vi là ranh giới

```mermaid
flowchart LR
  subgraph W["ghi vào"]
    F["Fact<br/>scope BẮT BUỘC<br/>+ probe chạy được"]
    C["Claim<br/>scope BẮT BUỘC<br/>+ anchor"]
    D["Decision<br/>scope TUỲ CHỌN<br/>thiếu = toàn dự án"]
  end

  F --> FR{"freshness"}
  FR -->|fresh + cùng scope| USE["Tri thức dùng được"]
  FR -->|fresh + khác scope| OUT["NGOÀI PHẠM VI<br/>hiện, nhưng không tin"]
  FR -->|không fresh| RE["CẦN VERIFY LẠI"]

  C -->|imported + unverified<br/>+ cùng scope| LEG["TRI THỨC KẾ THỪA"]
  D -->|scope khớp hoặc rỗng| DEC["Quyết định đã chốt<br/>+ vì / đánh đổi / nguồn"]

  USE & OUT & RE & LEG & DEC --> B["brief của task"]
```

**Bất biến của luồng này, có test riêng khoá cả hai chiều:**

> Phạm vi dùng để **hạ cấp độ tin**, không bao giờ để **giấu**.

Fact ngoài phạm vi không bao giờ vào "Tri thức dùng được", nhưng **luôn** hiện ở
mục riêng. Giấu đi là đổi *ảo giác* lấy *quên* — cùng một tổn thất, khó phát
hiện hơn.

Chiều ngược lại cho Decision: mặc định của nó là **áp cho tất cả**, vì fact
ngoài phạm vi mà được tin thì sinh ảo giác, còn decision bị thu hẹp nhầm thì
model vi phạm một ràng buộc người đã chốt — tệ hơn.

---

## 5. Luồng cưỡng chế — hook chặn được gì, và không chặn được gì

```mermaid
flowchart TD
  A["agent gọi tool"] --> M{"matcher trong hooks.json"}
  M -->|"Write/Edit/Bash…"| P["preToolUse"]
  P --> L{"đích là verify-ledger.jsonl?"}
  L -->|"Write/Edit: file_path khớp"| D1["deny"]
  L -->|"Bash: KHÔNG chặn nữa"| OK["cho qua"]
  L -->|khác| OK

  D1 -.-> CH["lớp cưỡng chế thật:<br/>hash-chain sổ cái<br/>ganas ledger --check"]

  OK --> W["tool chạy"]
  W --> PT["postToolUse"]
  PT --> S{"file trong .ganas/?"}
  S -->|"sai schema / claim thiếu anchor"| E{"enforcementFor()"}
  E -->|enforce| BL["decision: block"]
  E -->|warn| SM["chỉ systemMessage"]
```

**Nói thẳng giới hạn, vì tin nhầm vào hàng rào còn tệ hơn không có hàng rào:**

- Hook **fail-open** có chủ đích (`hooks/io.ts`, `plugin/bin/ganas.mjs` im lặng
  thoát 0 khi ganas hỏng). Công cụ hỏng không được biến thành hàng rào nhốt
  người dùng. Đổi lại: ganas hỏng = mất lớp kiểm soát, không ai được báo.
- Chặn ghi sổ cái **chỉ ở nhánh `Write`/`Edit`**, nơi có đường dẫn thật đã
  resolve. Nhánh Bash trước đây khớp tên file trên chuỗi lệnh thô — đã bỏ, vì
  lớp đó sai cả hai chiều: chặn nhầm lệnh chỉ đọc có kèm dấu chuyển hướng, mà
  không cản được ai chỉ cần không gõ tên file (`git add .ganas`, hoặc
  `node -e "…'verify-'+'ledger…'"`). Bash, và mọi tool MCP không khớp matcher,
  đều ghi được sổ cái.
- Thứ thay cho nó là **hash-chain** của chính sổ cái: sửa bằng cách nào cũng
  đứt chain, và `ganas ledger --check` (git hook `pre-commit`), `ganas validate`
  cùng `ganas commit` đều thấy. Đúng nghĩa tamper-**evident**.
- `.ganas/config.yaml` **không được bảo vệ** — ghi `enforcement: warn` vào đó là
  tự tắt cả tầng cưỡng chế.

Kết luận đúng về mô hình này: ganas là **tamper-evident**, không phải
tamper-proof. Hook là lớp nhắc; cổng thật phải là CI chạy `ganas validate`.

---

## Người quyết duy nhất — luật quan trọng nhất của các luồng trên

Mỗi câu hỏi của hệ thống có **đúng một** hàm trả lời. Ai cần biết thì hỏi nó,
không tự tính lại.

| Câu hỏi | Người quyết duy nhất |
|---|---|
| Bằng chứng này còn dùng được không? | `computeFreshness()` — `graph/freshness.ts` |
| Vân tay của bằng chứng này là gì? | `defHash()` — `verify/ledger.ts` |
| Task này xong chưa? | `evaluateGate()` — `gate.ts` |
| Task nào tiếp theo? | `selectNextTask()` — `graph/select.ts` |
| Graph có hợp lệ không? | `validateGraph()` — `graph/validate.ts` |
| Target này thuộc phạm vi nào? | `scopeOfTarget()` — `verify/run.ts` |

Luật này sinh ra từ một lỗi thật, không phải từ sở thích kiến trúc.
`needsRunFor()` trong `commands/verify.ts` từng **tự soi sổ cái** để quyết định "có cần chạy lại
không", và bỏ sót hoàn toàn file phụ thuộc — comment ngay trên nó ghi *"N5 sẽ bổ
sung: file phụ thuộc đã đổi"* rồi không ai làm, **suốt từ N4 tới N24**.

Hậu quả: sửa code xong, brief báo *"CẦN VERIFY LẠI"* trong khi `ganas verify`
báo *"không có gì cần chạy"*. Hai đầu ra mâu thuẫn từ cùng một công cụ là cách
nhanh nhất để người dùng thôi tin cả hai.

Điểm đáng chú ý: **không tên nào sai cả.** Bộ dò ngõ cụt không thấy gì, vì hàm
đó không nhắc thứ không tồn tại và không khai trường chết. Nó chỉ đơn
giản là *làm thiếu*. Lớp lỗi này cần luật khác:

- `test/round-trip.test.ts` — **bất biến vòng tròn**: verify xong thì mọi loại
  bằng chứng phải `fresh`, và `ganas verify` phải nói cùng điều với brief. Nó
  không kiểm một hàm nào; nó kiểm rằng hai nửa hệ thống còn nói cùng ngôn ngữ.
- Luật 5 trong `test/no-dead-ends.test.ts` — cấm đọc thẳng `graph.ledger` ngoài
  danh sách cho phép, và danh sách đó bắt buộc kèm **lý do đó là câu hỏi gì**.

### Vì sao cần cả hai

Vân tay được tính ở **bốn** chỗ: `verify/run.ts` và `graph/trace.ts` ghi vào sổ
cái, `graph/freshness.ts` và `graph/validate.ts` so lại. Không gì ép bốn chỗ đó
dùng cùng công thức — sửa ba, quên một, thì loại bằng chứng đó âm thầm thành
`definition_changed` **vĩnh viễn**, và mỗi bên nhìn riêng đều đúng nên không
test đơn lẻ nào thấy. Chỉ bất biến vòng tròn thấy được.

Đã kiểm chứng bằng cách gieo đúng hai lỗi lịch sử: bỏ `statement` khỏi vân tay
ở riêng `trace.ts`, và cho hàm đó tự soi sổ cái lại. Cả hai đều đỏ đúng chỗ.

## Làm sao biết sơ đồ này chưa mục?

Ba luật trong `test/no-dead-ends.test.ts` chạy cùng `npm test`, chặn bằng máy
đúng lớp lỗi đã gặp nhiều lần trong repo này:

| Luật | Chặn được gì | Ca thật đã bắt |
|---|---|---|
| Lệnh được nhắc phải tồn tại trong `COMMANDS` | chuỗi chỉ người dùng tới lệnh ma | `ganas adopt --audit` in vào brief **mỗi phiên** |
| Đường dẫn `.ganas/<x>/` phải có trong `DIRS` | trỏ vào thư mục không tồn tại | — |
| Mọi trường schema phải có người đọc ngoài `src/model/` | trường khai rồi không ai dùng | `Scope.window`, `Module.risk/survey/surveyed_at`, `Claim.created_at/imported_at`, `Decision.link/consequence` |
| Không đọc thẳng `graph.ledger` ngoài danh sách cho phép | hai chỗ cùng quyết một câu hỏi | `needsRunFor()` bỏ qua file phụ thuộc suốt N4→N24 |

Chúng nằm trong **test** chứ không nằm trong `CONTRIBUTING.md` là có chủ đích:
một quy ước viết trong tài liệu sẽ mục ngay lần đầu có người quên, và không ai
đối chiếu lại.

**Giới hạn thành thật của bộ dò:** nó dò theo *văn bản*, không phân tích luồng
dữ liệu. Nó bắt được "nhắc tên thứ không có" và "khai rồi không ai đọc"; nó
**không** bắt được:

- *đọc đúng tên nhưng sai ngữ nghĩa* — `Fact.ttl_days` từng được đọc bằng
  `(target.definition as { ttl_days?: number })`, đúng chữ nhưng sai cấp object
  nên luôn `undefined`. Ép kiểu `as` đã vô hiệu hoá type checker.
- *trùng tên giữa hai type* — `Decision.context` bị bộ dò cho là "có người đọc"
  vì `target.context` (một type khác) tồn tại. Ca đó phải soi tay.

Hai chỗ đó là nơi cần đọc kỹ khi review, vì máy không đỡ được.
