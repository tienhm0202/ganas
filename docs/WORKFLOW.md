# Một ngày làm việc với ganas

Tài liệu này đi qua một luồng làm việc đầu-cuối, TỪNG BƯỚC: `ganas init` →
`ganas scope new` → viết goal/design/khối/task → mở phiên (brief) → sửa code →
verify → trace → gate → commit → đánh dấu xong. Khác với `docs/CONCEPTS.md` (mô hình dữ liệu,
prose) và `docs/COMMANDS.md` (tham chiếu đầy đủ từng cờ) — file này là một
ví dụ CHẠY ĐƯỢC, không phải narrative viết theo trí nhớ.

**Mọi YAML và mọi lệnh dưới đây đã được chạy thật** trong một thư mục scratch
(`ganas init` + `git init` thật, không phải dự án ganas này) khi viết tài
liệu này, và output hiển thị là output THẬT nhận được (diễn giải bớt phần
nhiễu, không bịa thêm). Nếu bạn gõ lại đúng như dưới đây trong một thư mục
trống có `git`, kết quả sẽ giống hệt.

Ví dụ xuyên suốt: một dự án nhỏ xử lý **webhook xác nhận thanh toán** — cổng
thanh toán gọi webhook về, hệ thống phải chuẩn hoá payload thô rồi ghi vào sổ
quỹ. Cố tình chọn ví dụ nhỏ (1 phạm vi, 2 khối, 1 task) để mọi YAML vừa một
màn hình.

Về cách gõ lệnh: `package.json` khai `"bin": { "ganas": "./dist/cli.js" }`,
nên sau khi cài (`npm install -g` hoặc `npm link`) bạn gõ thẳng `ganas
<lệnh>`. Trong Claude Code, các lệnh này phần lớn tự chạy qua hook
(`plugin/hooks/hooks.json`: `SessionStart` gọi `hook session-start` —
tương đương `next`, `Stop` gọi `hook stop` — tương đương `gate`) hoặc qua
skill (`/next`, `/gate`, `/verify`, `/trace`, `/commit`) — bạn hiếm khi gõ
CLI trần tay. Tài liệu này gõ trần để mỗi bước và mỗi output đều nhìn thấy
được, kèm `--cwd <thư-mục-dự-án>` vì đang chạy trong dự án scratch riêng
ngoài luồng phiên bình thường.

## 1. `ganas init`

Trong một thư mục trống, đã có `git init` (ganas không tự làm việc này):

```
$ ganas init --project webhook-thanh-toan --owner nguyen-a
```

(bản thân khi viết tài liệu này còn thêm `--yes --cwd <tmp>` vì chạy
không tương tác — bỏ hai cờ đó nếu bạn gõ tay trong terminal thật).

Output thật:

```
ganas đã khởi tạo tại <cwd>

  tạo mới:  .ganas/config.yaml
            .ganas/README.md
            .ganas/state.json
            .claude/rules/ganas-knowledge.md
            .claude/rules/architecture.md
            .claude/rules/ganas-git.md
            CLAUDE.md
            AGENTS.md
            .ganas/goals/G-001.yaml

Tiếp theo:
  1. Sửa .ganas/goals/G-001.yaml — mục tiêu thật và tiêu chí nghiệm thu thật
  2. ganas validate
```

`init` sinh sẵn đúng một goal mẫu (`G-001`, `title: "Đặt tên mục tiêu ở đây"`)
— đủ để `ganas validate` có gì mà kiểm ngay. Việc của bạn ở bước sau là **sửa**
file đó, không phải tạo file mới.

Cố ý **không** sinh phạm vi mẫu: phạm vi cần ranh giới code thật, mà chỉ
`ganas scope new` mới hỏi được. Một phạm vi placeholder sẽ thành cái thùng rác
đầu tiên của dự án — mọi thứ vô chủ sẽ bị ném vào đó.

## 2. `ganas scope new` — dịch yêu cầu thành phạm vi công việc

Đây là bước **dịch**: người dùng nói bằng ngôn ngữ của họ, ganas hỏi lại bốn
câu và ra một *phạm vi công việc* — đơn vị bàn giao có ranh giới code, tiêu
chí nghiệm thu và người ký.

Chạy không tham số thì nó hỏi tương tác. Ở đây gõ thẳng để mỗi câu trả lời
nhìn thấy được:

```
$ ganas scope new --yes --id P-thanh-toan \
    --title "Xử lý webhook thanh toán" \
    --paths "src/webhook.js,src/ledger.js" \
    --accept "node -e \"require('./src/webhook.js')\"" \
    --owner "@tien"
```

Bốn câu, đúng thứ tự một quản lý dự án sẽ hỏi:

| Câu hỏi | Cờ | Thành gì |
|---|---|---|
| Bàn giao cái gì? | `--title` | `title` của phạm vi |
| Code nằm ở đâu? | `--paths` | `paths` của khối trong phạm vi |
| Làm sao biết là xong? | `--accept` | `acceptance` chạy trên luồng đã ghép |
| Ai ký nghiệm thu? | `--owner` | `owner` |

Output thật:

```
Đã tạo phạm vi P-thanh-toan — Xử lý webhook thanh toán

  .ganas/scopes/P-thanh-toan.yaml
  .ganas/modules/M-thanh-toan.yaml

Khối `M-thanh-toan` được tạo với `nature: code`. Nếu vùng này có GỌI LLM
thì đổi thành `nature: llm` — khi đó bắt buộc phải có eval, vì probe kiểm
được cấu trúc nhưng không kiểm được hành vi của LLM.

Tiếp theo: `ganas validate`, rồi tạo task trong .ganas/tasks/ khai `scope: P-thanh-toan`.
```

Lệnh tạo luôn một khối, vì phạm vi đòi ít nhất một khối (`modules` min 1) —
không có nó thì bạn lại phải gõ tay YAML, đúng thứ bước này sinh ra để tránh.
Nếu đã có khối nào `paths` trùng vùng vừa khai thì nó **dùng lại** thay vì đẻ
khối mới: hai khối cùng trỏ một chỗ là hai bản đồ lệch nhau.

`--id` là tuỳ chọn — không có thì id suy từ tiêu đề (bỏ dấu tiếng Việt), ở đây
sẽ ra `P-xu-ly-webhook-thanh-toan`. Đặt tay cho ngắn dễ đọc hơn. Khối và
`acceptance.id` đều bám theo id phạm vi, nên đặt id ngắn là đặt một lần cho cả ba.

`.ganas/scopes/P-thanh-toan.yaml` sinh ra:

```yaml
id: P-thanh-toan
title: "Xử lý webhook thanh toán"
version: 0.1.0
owner: "@tien"
status: active

# Ranh giới code của phạm vi. Fact/claim chỉ được coi là đúng BÊN TRONG đây.
modules:
  - M-thanh-toan
entry: M-thanh-toan

# Nghiệm thu chạy trên LUỒNG ĐÃ GHÉP, không phải tổng nghiệm thu từng khối —
# một luồng có thể đúng ở từng khối mà vẫn sai khi ghép.
acceptance:
  - id: V-thanh-toan-e2e
    kind: probe
    run: "node -e \"require('./src/webhook.js')\""
```

**Vì sao phải có phạm vi trước cả goal:** phạm vi là ranh giới của tri thức.
Fact và claim đều bắt buộc khai `scope`, và brief chỉ trình một fact như *sự
thật dùng được* khi nó thuộc đúng phạm vi của task. Không có ranh giới thì kho
fact càng lớn càng thành máy sinh ảo giác — một điều đúng ở khối thanh toán sẽ
được phiên sau đọc như chân lý toàn dự án.

## 3. Sửa goal thật

`.ganas/goals/G-001.yaml` — thay nội dung mẫu bằng mục tiêu thật, tiêu chí
nghiệm thu là một lệnh chạy được thật (không phải `echo` giữ chỗ như mẫu):

```yaml
id: G-001
title: "Xử lý webhook xác nhận thanh toán"
outcome: "Đơn hàng tự động chuyển sang trạng thái đã thanh toán ngay khi cổng thanh toán báo về, không cần kế toán đối soát tay"

acceptance:
  - id: A-1
    kind: command
    run: "node -e \"const {parseWebhook}=require('./src/webhook.js'); const r=parseWebhook({id:'evt_1',amount:150000,status:'paid'}); process.exit(r.status==='paid'?0:1)\""
    expect: exit_zero

status: active
approved_by: "@nguyen-a"
approved_at: 2026-08-01T16:45:36.157Z
```

Hai trường bắt buộc dễ quên: **`status: active` đòi `approved_by`** (goal
không được để model tự chốt — xem `src/model/goal.ts`), và **có
`approved_by` thì phải có `approved_at`** đi kèm. `init --owner nguyen-a` đã
điền sẵn cả hai nên ở đây chỉ cần giữ nguyên; nếu gọi `init` không có
`--owner`, goal sinh ra sẽ ở `status: draft` và bạn phải tự điền hai trường
này trước khi chuyển `active`.


## 4. Viết design

Một task luôn hiện thực một design, và design luôn phục vụ một goal
(`serves` bắt buộc không rỗng — không có design trôi nổi). Tạo
`.ganas/designs/D-001.yaml`:

```yaml
id: D-001
title: "Chuẩn hoá webhook thanh toán trước khi ghi sổ quỹ"
serves:
  - G-001
summary: >
  Webhook cổng thanh toán gửi payload thô, tên trường và đơn vị tiền khác nhau
  tuỳ cổng. Thêm một khối thuần hàm (parseWebhook) chuẩn hoá payload thô thành
  một bản ghi thanh toán cố định (id, amount_cents, status), rồi mới đưa cho
  khối ghi sổ quỹ. Tách riêng bước chuẩn hoá để khối ghi sổ không phải biết gì
  về định dạng của từng cổng thanh toán.
status: active
```

## 5. Vẽ hai khối vào sơ đồ

Sơ đồ khối CHÍNH LÀ bản đồ hệ thống (xem `docs/CONCEPTS.md` cho lý do gộp hai
khái niệm làm một). Ví dụ này có hai khối, một cạnh `depends_on` giữa chúng.

Khối thứ nhất **đã được `ganas scope new` tạo ở bước 2** — giờ chỉ mở ra sửa
cho đúng: đổi `nature` sang `io` (nó chạm mạng), thu hẹp `paths`, khai
`contract` và `verify`. Khối thứ hai viết mới, và **phải khai `scope`** khớp
hai chiều với `scope.modules`, nếu không `validate` báo
`scope/module-scope-mismatch`.

`.ganas/modules/M-thanh-toan.yaml`:

```yaml
id: M-thanh-toan
scope: P-thanh-toan
title: "Chuẩn hoá payload webhook"
nature: io
paths:
  - "src/webhook.js"

contract:
  inputs:
    - name: raw_payload
      shape: "{ id: string, amount: number, status: string }"
  outputs:
    - name: normalized_payment
      shape: "{ id: string, amount_cents: number, status: 'paid' | 'failed' }"

status: implemented
risk: medium

verify:
  - id: V-webhook-parse-smoke
    kind: probe
    tier: smoke
    run: "node -e \"const {parseWebhook}=require('./src/webhook.js'); const r=parseWebhook({id:'evt_1',amount:150000,status:'paid'}); if(r.id!=='evt_1'||r.amount_cents!==150000||r.status!=='paid') process.exit(1)\""
    expect: exit_zero
  - id: V-webhook-to-ledger
    kind: contract
    to: M-so-quy
```

`.ganas/modules/M-so-quy.yaml`:

```yaml
id: M-so-quy
scope: P-thanh-toan
title: "Ghi nhận thanh toán vào sổ quỹ"
nature: data
paths:
  - "src/ledger.js"
depends_on:
  - M-thanh-toan

contract:
  inputs:
    - name: normalized_payment
      shape: "{ id: string, amount_cents: number, status: 'paid' | 'failed' }"

status: implemented
risk: medium

verify:
  - id: V-ledger-append-smoke
    kind: probe
    tier: smoke
    run: "node -e \"const {appendPayment}=require('./src/ledger.js'); const rows=[]; appendPayment(rows,{id:'evt_1',amount_cents:150000,status:'paid'}); if(rows.length!==1) process.exit(1)\""
    expect: exit_zero
```

Ba điều đáng chú ý:

- `M-thanh-toan` có **hai** mục `verify`: một `kind: probe` (tất định,
  kiểm hành vi hàm) và một `kind: contract` (kiểm cổng ra của chính nó có
  phủ được cổng vào bắt buộc của `M-so-quy` không). Cạnh contract chỉ
  khai được ở khối NGUỒN, `to:` trỏ sang khối đích.
- Hai cổng phải khớp **cả tên lẫn `shape`** y hệt từng ký tự
  (`src/graph/trace.ts` so `out.shape.trim() !== input.shape.trim()`) — đây
  là lý do `normalized_payment` ở outputs của khối trước và inputs của khối
  sau được chép nguyên văn giống nhau.
- `status: implemented` đòi `paths` không rỗng (đã có) — khai `status:
  verified` mà `verify` rỗng thì `ganas validate` chặn ngay.

## 6. Viết task

`.ganas/tasks/T-001.yaml` — đây là chỗ nối trục VIỆC (task) với trục HỆ
THỐNG (khối): `touches` khai khối nào bị chạm, `exit_contract` phải có một
tiêu chí `kind: verification` cho MỖI khối trong `touches` (luật
`spine/task-missing-verification`, `src/graph/validate.ts`) — chạm khối mà
không để lại tiêu chí kiểm chứng thì task "xong" được mà chưa ai chạy
`ganas verify` lên khối đó.

```yaml
id: T-001
title: "Viết parseWebhook + appendPayment cho webhook thanh toán"
serves:
  - G-001
implements: D-001
scope: P-thanh-toan
status: todo
estimated_context: small

context_contract:
  must_read:
    - path: ".ganas/designs/D-001.yaml"
      why: "Design nói rõ vì sao tách khối chuẩn hoá khỏi khối ghi sổ quỹ"
  facts: []
  open_questions: []

touches:
  - M-thanh-toan
  - M-so-quy

exit_contract:
  - kind: verification
    target: "M-thanh-toan/V-chuan-hoa"
  - kind: verification
    target: "M-so-quy/V-ghi-so"
```

`target` của tiêu chí `verification` phải khớp đúng
`<id khối>/<id verify>` (hoặc chỉ `<id khối>` nếu muốn kiểm mọi bằng chứng
của khối, hoặc một fact id như `F-ACC-001`) — validator so bằng
`target === moduleId || target.startsWith(\`${moduleId}/\`)`.

## 7. `ganas validate`

```
$ ganas validate
```

Output thật sau khi đã có phạm vi, hai khối và task — kể cả khi code chưa tồn tại:

```
✓ graph hợp lệ — 1 goal · 1 design · 1 task · 1 phạm vi · 2 khối · 0 fact · 0 claim
```

Sạch, không cảnh báo nào. Khác hẳn mô hình cũ (khối lẻ không thuộc đơn vị bàn
giao nào sẽ bị cảnh báo): vì `ganas scope new` gán `scope` cho khối ngay lúc
tạo, và khối thứ hai viết tay ở bước 5 cũng khai `scope: P-thanh-toan` nên
quan hệ hai chiều với `scope.modules` khớp.

`ganas validate` thoát mã `0` khi chỉ có cảnh báo, `1` khi có lỗi. Dùng
`--strict` nếu muốn CI đỏ cả với cảnh báo.

## 8. Mở phiên — `ganas next`

```
$ ganas next
```

`next` chọn task kế tiếp và ghim nó vào `.ganas/state.json` — mọi lệnh sau đó
(`gate`, `verify`, `commit`…) không cần lặp lại ID task nữa. Output thật (rút
gọn phần luật ghi tri thức ở cuối, giống nhau ở mọi brief):

```
# T-001 — Viết parseWebhook + appendPayment cho webhook thanh toán

phạm vi `P-thanh-toan` · design `D-001` · phục vụ `G-001`

## Phạm vi công việc

### P-thanh-toan — Xử lý webhook thanh toán

phiên bản `0.1.0` · trạng thái `active` · nghiệm thu: @tien

**Ranh giới code:**
- `M-thanh-toan` — Chuẩn hoá payload webhook
  `src/webhook.js`, `parseWebhook`
- `M-so-quy` — Ghi nhận thanh toán vào sổ quỹ
  `src/ledger.js`

**Nghiệm thu luồng ghép:**
- `V-thanh-toan-e2e` (probe) — fresh — kiểm lần cuối 2026-08-02

> Mọi phát biểu bên dưới chỉ được coi là đúng **trong phạm vi này**.
> Ra ngoài là **chưa biết** — không phải sai, mà là chưa ai kiểm.

## Mục tiêu đang phục vụ

### G-001 — Xử lý webhook xác nhận thanh toán

Kết quả mong đợi: Đơn hàng tự động chuyển sang trạng thái đã thanh toán ngay khi cổng thanh toán báo về, không cần kế toán đối soát tay

Nghiệm thu:
- `node -e "const {parseWebhook}=require('./src/webhook.js'); ..."`

## Design đang hiện thực

### D-001 — Chuẩn hoá webhook thanh toán trước khi ghi sổ quỹ

Tách khối chuẩn hoá payload khỏi khối ghi sổ quỹ — cổng đổi format thì chỉ sửa một chỗ.

## Phải đọc trước khi sửa gì

- `.ganas/designs/D-001.yaml`
  Design nói rõ vì sao tách khối chuẩn hoá khỏi khối ghi sổ quỹ

## Khối chạm tới (suy từ sơ đồ)

- `M-thanh-toan` — Chuẩn hoá payload webhook
  `src/webhook.js`, `parseWebhook`
- `M-so-quy` — Ghi nhận thanh toán vào sổ quỹ
  `src/ledger.js`

## Điều kiện hoàn thành

Stop hook sẽ chấm những mục dưới đây. **Chưa thoả thì phiên không kết thúc được.**

- [ ] bằng chứng `M-thanh-toan/V-chuan-hoa`
- [ ] bằng chứng `M-so-quy/V-ghi-so`
```

Ba chỗ đáng chú ý trong brief này:

1. **Mục phạm vi đứng trước mục tiêu**, có chủ đích — nó là khung để đọc mọi
   thứ phía sau. Câu *"Ra ngoài là chưa biết"* không phải khẩu hiệu: fact thuộc
   phạm vi khác sẽ hiện ở một mục riêng tên **"⚠ NGOÀI PHẠM VI"**, không bao
   giờ lẫn vào "Tri thức dùng được" — nhưng cũng **không bao giờ bị giấu**.
   Giấu đi là đổi "ảo giác" lấy "quên", cùng một tổn thất mà khó phát hiện hơn.
2. **"Khối chạm tới" suy từ sơ đồ**, không phải khai tay trong task — `paths`
   lấy thẳng từ `module.paths`.
3. **Điều kiện hoàn thành** là hai bằng chứng `kind: verification`, tương ứng
   đúng hai khối trong `touches`. Đây là luật `spine/task-missing-verification`:
   chạm khối nào thì phải để lại bằng chứng cho khối đó.

## 9. `ganas gate` trước khi có code

Task đã ghim (`current_task: T-001`), gọi trần không cần ID:

```
$ ganas gate
```

```
Điều kiện hoàn thành của T-001:
  ✗ bằng chứng `M-thanh-toan/V-chuan-hoa`
      chưa chạy lần nào — mới chỉ là niềm tin
  ✗ bằng chứng `M-so-quy/V-ghi-so`
      chưa chạy lần nào — mới chỉ là niềm tin

✗ Còn 2 tiêu chí chưa đạt.
```

(thoát mã 1) — đúng như kỳ vọng: hai khối chưa có bằng chứng nào từng chạy.
Đây là lúc thật sự bắt tay vào sửa code.

## 10. Sửa code

`src/webhook.js`:

```js
function parseWebhook(raw) {
  if (!raw || typeof raw.id !== "string") {
    throw new Error("payload thiếu id");
  }
  if (typeof raw.amount !== "number" || raw.amount < 0) {
    throw new Error("payload thiếu amount hợp lệ");
  }
  const status = raw.status === "paid" ? "paid" : "failed";
  return {
    id: raw.id,
    amount_cents: Math.round(raw.amount),
    status,
  };
}

module.exports = { parseWebhook };
```

`src/ledger.js`:

```js
function appendPayment(rows, payment) {
  if (!payment || typeof payment.id !== "string") {
    throw new Error("payment thiếu id");
  }
  rows.push({ ...payment, recorded_at: new Date().toISOString() });
  return rows;
}

module.exports = { appendPayment };
```

## 11. `ganas verify`

Chạy bằng chứng của từng khối đã chạm:

```
$ ganas verify M-thanh-toan
```

```
✓ M-thanh-toan/V-chuan-hoa     đạt
⚠ M-thanh-toan/V-hop-dong      chưa chứng minh được
    kiểm tương thích cạnh thuộc `ganas trace`

2 target · 1 đạt · 1 chưa chứng minh được
```

(thoát mã 1, vì còn một mục `⚠`) — đây KHÔNG phải lỗi cần sửa code: mục
`kind: contract` cố tình bị `ganas verify` từ chối chấm, vì nó thuộc phạm vi
của lệnh khác (mục 11). Probe thường (`V-chuan-hoa`) thì đã đạt.

```
$ ganas verify M-so-quy
```

```
✓ M-so-quy/V-ghi-so đạt

1 target · 1 đạt
```

(thoát mã 0). Mỗi lần `verify` chạy để lại một dòng trong
`.ganas/verify-ledger.jsonl` — đây là nơi DUY NHẤT `last_verified_at`/
`last_result` được ghi; sửa tay hai trường này bị `ganas validate` bắt là
`unbacked-verification`.

## 12. `ganas trace`

```
$ ganas trace
```

`````
✓ M-thanh-toan/V-hop-dong → M-so-quy

```mermaid
flowchart LR
  subgraph P_thanh_toan["P-thanh-toan (0.1.0)"]
    M_thanh_toan["M-thanh-toan<br/>io · implemented"]
    M_so_quy["M-so-quy<br/>data · implemented"]
  end
  M_thanh_toan --> M_so_quy
  M_thanh_toan -.->|hợp đồng ✓| M_so_quy
```

Không có nợ kiểm chứng nào trong sơ đồ.
`````

(thoát mã 0). Cạnh `depends_on` (nét liền) và cạnh đã kiểm hợp đồng (nét
đứt, nhãn `hợp đồng ✓`) cùng in ra — dán khối mermaid này thẳng vào một file
`.md` để xem trực quan. Vì hai cổng đã khớp tên+shape ở bước 5, `checkEdge`
không cần chạy thêm lệnh `run` nào (không khai `run:` trong verification này)
— kết quả `pass` chỉ từ so cổng khai báo.

## 13. `ganas gate` sau khi có code

```
$ ganas gate
```

```
Điều kiện hoàn thành của T-001:
  ✓ bằng chứng `M-thanh-toan/V-chuan-hoa`
  ✓ bằng chứng `M-so-quy/V-ghi-so`

✓ Mọi tiêu chí chấm tự động đều đạt.
```

(thoát mã 0). Cả hai tiêu chí giờ đọc `last_result` từ sổ cái đã ghi ở
bước 11 — `gate` không tự chạy lại verify, nó chỉ ĐỌC kết quả đã có (và sẽ
báo "chưa chạy lần nào" nếu bạn chưa từng `verify`, kể cả khi code đã đúng).

## 14. `ganas commit`

Xem trước message, KHÔNG commit:

```
$ ganas commit --dry-run
```

```
--- commit message (dry-run, chưa commit) ---
T-001: Viết parseWebhook + appendPayment cho webhook thanh toán

Điều kiện hoàn thành:
  ✓ bằng chứng `M-thanh-toan/V-chuan-hoa`
  ✓ bằng chứng `M-so-quy/V-ghi-so`

phục vụ G-001 · design D-001 — Chuẩn hoá payload trước khi ghi sổ quỹ · phạm vi P-thanh-toan
```

**Lưu ý một hành vi thật, dễ hiểu nhầm:** `--dry-run` chỉ bỏ qua bước
`git commit` cuối cùng — bước `git add` phạm vi task (`.ganas/` + `paths`
của mọi khối trong `touches`, ở đây là `src/webhook.js` và `src/ledger.js`)
vẫn chạy thật kể cả ở chế độ dry-run (`src/commands/commit.ts`). Không phải
lỗi — chỉ là dry-run ở đây nghĩa là "chưa tạo commit", không phải "không
đụng gì tới git".

Commit thật:

```
$ ganas commit
```

```
✓ Đã commit cho T-001.

T-001: Viết parseWebhook + appendPayment cho webhook thanh toán

Điều kiện hoàn thành:
  ✓ bằng chứng `M-thanh-toan/V-chuan-hoa`
  ✓ bằng chứng `M-so-quy/V-ghi-so`

phục vụ G-001 · design D-001 — Chuẩn hoá payload trước khi ghi sổ quỹ · phạm vi P-thanh-toan
```

`git log --oneline` sau lệnh này có đúng một commit mới:
`T-001: Viết parseWebhook + appendPayment cho webhook thanh toán`. Message
không có dòng "Co-Authored-By" hay nhắc AI/Claude — đây là quy ước cứng của
`ganas commit`, không phải tuỳ chọn. Phạm vi `git add` KHÔNG phải `-A`: file
scaffold của `init` (`CLAUDE.md`, `AGENTS.md`, `.claude/`, `.gitignore`) vẫn
đứng ngoài staging vì không nằm trong `touches` của T-001 — commit của một
task chỉ chứa đúng phạm vi task đó.

Nếu `ganas gate` chưa đạt, `ganas commit` từ chối luôn, không tạo commit
rỗng lỡ dở:

```
Chưa commit được — điều kiện hoàn thành của T-001 chưa thoả:
...
```

## 15. Đánh dấu task xong

Không có lệnh CLI riêng cho việc này — sau khi gate đạt và đã commit, sửa
tay `status`/`done_at` trong `.ganas/tasks/T-001.yaml`:

```yaml
status: done
done_at: 2026-08-01T17:30:00.000Z
```

(`ganas validate` bắt lỗi nếu `status: done` mà thiếu `done_at` —
`src/model/task.ts`). Chạy lại `ganas validate` để chắc chắn: vẫn chỉ còn
hai cảnh báo `spine/module-without-part` như bước 6, không lỗi mới.

Task `done` đủ tuổi (mặc định 7 ngày) sẽ được `ganas prune` archive sang
`.ganas/tasks/done/` ở một phiên dọn dẹp sau — không phải việc của hôm nay.

## Tổng kết trình tự

```
ganas init
  → ganas scope new        (bốn câu → phạm vi + khối đầu tiên)
  → sửa .ganas/goals/G-001.yaml (mục tiêu + approved_by/approved_at)
  → viết .ganas/designs/D-001.yaml (serves goal)
  → viết thêm khối nếu cần (contract vào/ra, verify, scope)
  → viết .ganas/tasks/T-001.yaml (scope + touches + exit_contract kind:verification)
  → ganas validate
  → ganas next             (mở phiên, đọc brief)
  → ganas gate              ✗ (chưa có code)
  → sửa code
  → ganas verify            (ghi sổ cái)
  → ganas trace             (kiểm cạnh contract, xem sơ đồ)
  → ganas gate              ✓ (đạt)
  → ganas commit
  → sửa status: done trong task YAML
```

Ba mẩu YAML vẫn phải viết tay — goal, design, task. `ganas scope new` mới phủ
được trục HỆ THỐNG (phạm vi + khối), chưa phủ trục XƯƠNG SỐNG. Đó là khoảng
trống đã biết, không phải chỗ bạn đọc sót.

Xem `docs/CONCEPTS.md` để hiểu SÂU từng khái niệm (Goal, Design, Task,
Scope/Module, Fact/Claim/Decision, sổ cái, freshness) và `docs/COMMANDS.md`
để tra đầy đủ cờ của từng lệnh dùng ở trên.
