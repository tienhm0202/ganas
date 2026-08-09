# Tham chiếu lệnh `ganas`

Tài liệu THAM CHIẾU ĐẦY ĐỦ cho CLI `ganas` — dành cho người đọc sâu và cho AI
cần biết chính xác từng cờ trước khi gõ lệnh. Khác với `SKILL.md` rải rác
theo lệnh trong `plugin/skills/*` (cố ý ngắn, chỉ đường cho một tình huống cụ
thể) — file này liệt kê đầy đủ, không rút gọn.

Nguồn sự thật duy nhất là `src/cli.ts` (bảng lệnh `COMMANDS`, chuỗi `HELP`)
và từng file dưới `src/commands/*.ts`. File này được đối chiếu bằng test
(`test/cli-help.test.ts`) để không trôi dạt khỏi source — sửa lệnh trong code
mà quên sửa ở đây thì test đỏ.

## Cách gọi

```
ganas <lệnh> [tuỳ chọn] [đối số định vị...]
```

Không gõ lệnh, hoặc gõ kèm `-h`/`--help`, in ra trợ giúp tóm tắt. `-v`/
`--version` in số phiên bản từ `package.json` rồi thoát — bỏ qua mọi tuỳ
chọn/lệnh khác trên dòng lệnh.

## Tuỳ chọn chung

Mọi lệnh đều nhận các tuỳ chọn sau (được `main()` trong `src/cli.ts` xử lý
trước khi giao cho từng lệnh, hoặc được chính lệnh đọc qua `option()`/
`flag()`):

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `-C, --cwd <path>` | Chạy như thể đang đứng ở thư mục này (gọi `process.chdir` trước khi nạp module lệnh). Mọi đường dẫn tương đối sau đó tính từ đây. |
| `--session <id>` | Gắn thao tác với một phiên cụ thể — quyết định task nào đang "đang làm" khi không có đối số task, và gắn `session_id` khi ghi vào sổ cái/ledger. |
| `--json` | Xuất JSON có cấu trúc ra stdout thay vì văn bản cho người đọc. Mọi lệnh có nội dung để in đều hỗ trợ cờ này (trừ `hook`, vốn luôn xuất JSON theo giao thức hook của Claude Code). |
| `-h, --help` | In trợ giúp rồi thoát mã 0 (nếu đi kèm tên lệnh) hoặc mã 1 (nếu gõ trần không có lệnh). |
| `-v, --version` | In số phiên bản (đọc từ `package.json`) rồi thoát mã 0. |

**Ghi chú về `--root <path>`:** một số lệnh (`init`, `validate`, và mọi lệnh
đi qua `openProject()` trong `src/commands/_common.ts` — tức `brief`, `next`,
`gate`, `verify`, `trace`, `commit`, `handoff`, `prune`) còn đọc thêm tuỳ
chọn `--root <path>` để xác định gốc dự án trực tiếp, không qua
`process.chdir`. Tuỳ chọn này **không xuất hiện trong `--help`** — nó tồn
tại chủ yếu để gọi hàm `run()` của từng lệnh trực tiếp (test nội bộ dùng
theo cách này) mà không cần đổi thư mục làm việc thật của tiến trình. Người
dùng CLI bình thường nên dùng `-C`/`--cwd`; `--root` vẫn hoạt động nếu gõ
tay nhưng coi như chi tiết triển khai, không phải giao diện công khai.

## Mã thoát chung

Ngoài mã thoát riêng của từng lệnh (ghi ở mục "Mã thoát" bên dưới mỗi lệnh),
có ba mã dùng xuyên suốt toàn bộ CLI (`src/util/errors.ts`, `src/cli.ts`):

| Mã | Khi nào |
|---|---|
| `0` | Thành công / điều kiện đạt. |
| `1` | Lỗi người dùng thông thường (`GanasError` mặc định — vd chưa biết đang làm task nào, task không tồn tại), hoặc một lệnh chấm điều kiện (`gate`, `verify`, `trace`, `commit`, `validate --strict`) báo **chưa đạt**. |
| `2` | Không tìm thấy `.ganas/` từ thư mục hiện tại trở lên (`NotInitializedError`) — dự án chưa `ganas init`. |
| `70` | Lỗi lập trình không lường trước (exception không phải `GanasError`) — kèm stack trace ra stderr. |

## Danh sách lệnh

### `ganas flow`

**Cũng chính là `ganas` không tham số.** In ĐÚNG MỘT bước kế tiếp cho trạng thái
hiện tại của dự án — không phải menu 12 lệnh, vì mỗi lựa chọn đẩy sang người
dùng là một chỗ đi lạc. Muốn xem toàn bộ lệnh thì `ganas --help`.

Bước kế tiếp = chặng **đầu tiên chưa xong** trong bảng `STAGES` (`src/flow.ts`):

```
init → fix-graph → scope → goal → design → evidence → task
     → work → verify → gate → commit → close ⤾
```

Thứ tự là thứ tự *phụ thuộc*: graph hỏng thì mọi kết luận phía sau không tin
được nên nó chặn trước; không có phạm vi thì task không neo vào đâu.

Chặng nào có lệnh thì in lệnh; chặng nào phải viết YAML tay (`goal`, `design`,
`evidence`, `task`) thì in **khung dán được** với ID đã điền sẵn từ graph hiện
tại — không bắt người dùng đi tra tài liệu giữa chừng.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--all` | In toàn bộ chặng kèm dấu ✓ / → để thấy mình đang ở đâu. |
| `--json` | Xuất `{stage, action, command, at, total, stages[]}`. |

**Mã thoát:** luôn `0` — kể cả khi mọi chặng đã xong. Dòng chảy hết chặng không
phải lỗi, nó là "vòng này khép, viết task mới cho vòng sau".

**Ví dụ:**
```
ganas                 # bước kế tiếp
ganas flow --all      # toàn cảnh
ganas --help          # menu lệnh đầy đủ
```

### `ganas init`

Khởi tạo `.ganas/` cho dự án mới (greenfield): tạo cây thư mục con
(`goals/`, `sprints/`, `designs/`, `tasks/`, `parts/`, `modules/`, `facts/`,
`claims/`, `decisions/`, `domains/`, `legacy-imported/`, `map-surveys/`,
`proposals/`, `runs/`), `config.yaml`, `state.json`, `.ganas/README.md`,
`.claude/rules/ganas-knowledge.md`, `.claude/rules/architecture.md`,
`.claude/rules/ganas-git.md` (tag semver, ký commit local, không
Co-Authored-By), `CLAUDE.md`/`AGENTS.md`, một goal mẫu (`G-001`) và một
sprint mẫu, thêm mục `.ganas/runs/` vào `.gitignore` nếu dự án dùng git, và
— nếu dự án dùng git — sinh `.githooks/commit-msg` (tự xoá dòng
`Co-Authored-By` nhắc AI khỏi mọi commit) rồi bật bằng
`git config core.hooksPath .githooks`.

Không có đối số định vị.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--project <tên>` | Tên dự án điền vào template. Không truyền thì hỏi tương tác (TTY) hoặc lấy tên thư mục hiện tại (non-TTY/`--yes`). |
| `--owner <handle>` | Handle người duyệt mục tiêu (vd `@nguyen-a`, tự thêm `@` nếu thiếu). Không truyền thì hỏi tương tác hoặc để trống. |
| `--force` | Cho phép chạy dù `.ganas/` đã tồn tại, và **đè** lên các file đã có thay vì giữ nguyên. |
| `--yes, -y` | Không hỏi tương tác — dùng giá trị mặc định/suy ra cho mọi câu hỏi (tự động bật khi stdin không phải TTY, vd chạy trong CI). |

Không hỗ trợ `--json`.

**Mã thoát:** `0` khi thành công. Ném lỗi (mã `1`) nếu `.ganas/` đã tồn tại
mà thiếu `--force`.

**Ví dụ:**
```
ganas init --project "checkout-service" --owner @nguyen-a
ganas init --yes                      # CI, dùng toàn giá trị mặc định
ganas init --force                    # khởi tạo lại từ đầu, đè file cũ
```

### `ganas validate`

Kiểm tra graph `.ganas/`: schema từng file YAML, liên kết chéo (tham chiếu
tới id không tồn tại), và các luật riêng của "spine" (goal → design → task →
part/module). In từng chẩn đoán (`Diagnostic`) kèm file, dòng (nếu có), mức
độ (`lỗi`/`cảnh báo`/`ghi chú`), mã lỗi, và gợi ý sửa nếu có.

Không có đối số định vị.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--strict` | Coi cảnh báo (`warning`) là lỗi khi tính mã thoát — không chỉ `error` mới làm lệnh thất bại. |
| `--quiet, -q` | Chỉ in các chẩn đoán mức `error`, ẩn `warning`/`info` (chỉ ảnh hưởng phần in ra dạng văn bản, không ảnh hưởng `--json`). |
| `--json` | Xuất `{ root, counts, diagnostics }`. |

**Mã thoát:** `1` nếu có ít nhất một `error` (hoặc, kèm `--strict`, ít nhất
một `warning`); ngược lại `0`.

**Ví dụ:**
```
ganas validate
ganas validate --strict --json | jq '.counts'
```

### `ganas scope [new|assign]`

Phạm vi công việc — đơn vị mà một câu nói của người dùng được **dịch** sang
ngôn ngữ quản lý dự án: bàn giao cái gì, code nằm ở đâu, làm sao biết là
xong, ai ký. Task/fact/claim đều phải thuộc về đúng một phạm vi, và **fact
chỉ được coi là đúng bên trong phạm vi của nó** — ra ngoài là chưa biết.

Không có lệnh con ⇒ **liệt kê**: mỗi phạm vi kèm người ký, số khối/task/fact,
trạng thái nghiệm thu luồng ghép, và nợ kiểm chứng.

```
P-dat-lich — Đặt lịch qua Zalo
  active · nghiệm thu @tien · 1 khối · 1/1 task chưa xong · 1 fact · 0 claim
  ✓ nghiệm thu: 1/1 còn tươi
```

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--json` | Xuất mảng phạm vi (`id`, `title`, `status`, `owner`, số khối/task/fact/claim, `acceptance` kèm freshness, `debt`). |

#### `ganas scope new`

Phỏng vấn **4 câu** rồi ghi `scopes/<id>.yaml`. Nếu chưa khối nào có `paths`
giao với glob vừa khai thì tạo luôn một khối — nếu không, phạm vi mới không
hợp lệ (`modules` phải có ít nhất một phần tử) và người dùng lại phải gõ tay
YAML, đúng thứ lệnh này sinh ra để tránh.

Không có TTY (hoặc có `--yes`) thì bốn câu phải đưa qua tuỳ chọn.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--title <chuỗi>` | *Bàn giao cái gì?* Cũng là nguồn để suy `id` (bỏ dấu tiếng Việt → slug). |
| `--paths <glob,glob>` | *Code nằm ở đâu?* Danh sách glob cách nhau bởi dấu phẩy. |
| `--accept <lệnh>` | *Làm sao biết là xong?* Thành `acceptance` mức phạm vi, chạy trên luồng đã ghép. |
| `--owner <@ten>` | *Ai ký nghiệm thu?* Bỏ trống thì `validate` cảnh báo `scope/without-owner`. |
| `--id <P-...>` | Ghi đè id tự suy. |
| `--yes, -y` | Không hỏi, đọc hết từ tuỳ chọn. |

**Mã thoát:** `0` nếu tạo được; `2` (GanasError) nếu thiếu một trong bốn câu,
`owner` sai dạng `@ten`, hoặc id đã tồn tại.

Khối mới luôn được tạo với `nature: code` và lệnh **nói thẳng** rằng nếu vùng
đó có gọi LLM thì phải đổi sang `nature: llm` (khi đó bắt buộc có eval). Đây
là chỗ cố ý không đoán: đoán sai `nature` nghĩa là bỏ qua lớp bằng chứng duy
nhất kiểm được hành vi của LLM.

#### `ganas scope assign`

Tìm fact/claim/task **quên khai `scope`** và gợi ý cái đúng. Quét YAML thô
chứ không qua graph — vì `scope` là trường bắt buộc, bản ghi thiếu nó không
nạp được vào graph, mà đó chính là lúc cần lệnh này nhất.

Suy phạm vi bằng `depends_on`/`anchors` giao với `module.paths` (task thì ưu
tiên `touches`, vì khối đã khai phạm vi rồi nên chắc chắn hơn). Khớp **0 hoặc
≥2** phạm vi thì **không đoán** — in ra để người quyết. Ghi bằng
`parseDocument` nên **comment trong YAML được giữ nguyên**.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--write` | Ghi thật. Mặc định là dry-run, không đụng đĩa. |

**Mã thoát:** `0` nếu không còn bản ghi mơ hồ nào; `1` nếu còn bản ghi phải
người quyết (kể cả khi đã ghi xong phần suy được).

**Ví dụ:**
```
ganas scope
ganas scope new --yes --title "Đặt lịch qua Zalo" \
  --paths "src/zalo/**,src/booking/**" --accept "npm run test:booking" --owner "@tien"
ganas scope assign          # xem trước
ganas scope assign --write  # ghi thật
```

### `ganas next`

Chọn task kế tiếp nên làm và in brief đầy đủ của task đó. Ưu tiên task đang
`in_progress` (nối tiếp việc dở trước khi mở việc mới), rồi tới task thuộc
sprint đang `active`; task không còn `blocked_by` mở nào mới được xét. Ghi
lại lựa chọn vào `state.json` (hoặc gắn với `--session` nếu có) để `ganas
brief`/`gate`/hook sau đó biết đang làm task nào.

Không có đối số định vị.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--session <id>` | Gắn lựa chọn task với phiên này thay vì `state.json` chung của dự án. |
| `--no-volatile` | Bỏ phần "trạng thái lúc mở phiên" (nhánh git, file đang sửa dở, timestamp) ở cuối brief — dùng khi cần brief thuần xác định để so sánh/kiểm thử, hoặc để tối ưu prompt cache (phần biến động luôn ở cuối). |
| `--json` | Xuất `{ task, brief }` khi chọn được task; nếu không còn task nào (hết việc, hoặc mọi task còn lại đều bị chặn) xuất `{ task: null, blocked: [...] }`. |

**Mã thoát:** luôn `0` — kể cả khi không còn task nào để chọn (đó là trạng
thái hợp lệ, không phải lỗi).

**Ví dụ:**
```
ganas next --no-volatile
ganas next --session sess-42 --json
```

### `ganas brief [task]`

In brief của một task cụ thể (mục tiêu đang phục vụ, tài liệu phải đọc, tri
thức dùng được/cần verify lại/kế thừa, câu hỏi còn mở, điều kiện hoàn
thành) mà không đổi lựa chọn "đang làm task nào" như `next` làm.

**Đối số định vị:** `[task]` — id task (vd `T-001`). Không truyền thì lấy
theo thứ tự: `--task`, rồi task đang gắn với `--session` (nếu có), rồi báo
lỗi nếu vẫn không xác định được.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--task <id>` | Chỉ định task tường minh — cách khác của việc gõ id làm đối số định vị. |
| `--session <id>` | Dùng để tra task đang gắn với phiên này khi không truyền `task`/`--task`. |
| `--no-volatile` | Giống `next` — bỏ phần trạng thái biến động ở cuối brief. |
| `--json` | Xuất `{ task, brief }`. |

**Mã thoát:** `0` khi in được brief; `1` (qua `GanasError`) nếu chưa xác
định được task đang làm, hoặc task được chỉ định không tồn tại trong graph.

**Ví dụ:**
```
ganas brief T-014
ganas brief --session sess-42 --json
```

### `ganas gate [task]`

Chấm điều kiện hoàn thành (`exit_contract`) của một task — chạy thật các
tiêu chí có thể chấm tự động (lệnh, kiểm chứng đã ghi sổ) và báo mục nào
`✓` đạt, `✗` chưa đạt, và mục nào `…` cần người xác nhận (không chặn việc
làm tiếp, nhưng chặn đánh dấu task `done`).

**Đối số định vị:** `[task]` — cùng quy tắc suy ra như `brief`: đối số định
vị → `--task` → task gắn với `--session` → lỗi nếu vẫn không có.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--task <id>` | Chỉ định task tường minh. |
| `--session <id>` | Tra task đang gắn với phiên, và gắn phiên vào kết quả chấm. |
| `--json` | Xuất `{ task, ok, unmet: [{label, reason}], pending_human: [label] }`. |

**Mã thoát:** `0` nếu mọi tiêu chí chấm tự động đều đạt (dù còn tiêu chí chờ
người xác nhận); `1` nếu còn tiêu chí chưa đạt.

**Ví dụ:**
```
ganas gate
ganas gate T-014 --json
```

### `ganas verify [target...]`

Chạy bằng chứng: probe (tất định — lệnh shell) và eval (thống kê, cho khối
gọi LLM), rồi ghi mỗi lần chạy vào `.ganas/verify-ledger.jsonl`. Không gõ
target nào thì tự chọn theo tier + độ tươi (đã chạy chưa, định nghĩa đổi
chưa, quá hạn `ttl_days` chưa); gõ target cụ thể thì luôn chạy lại bất kể
tươi hay cũ.

**Đối số định vị:** `[target...]` — không, một, hoặc nhiều id/tiền tố (vd
`F-ACC-001`, `M-intent`, `M-intent/V-smoke`, `P-chat`) khớp theo đúng id
hoặc theo tiền tố `id/`.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--all` | Khi không gõ target: chạy lại **mọi** target tier đã chọn, kể cả những cái còn tươi (mặc định chỉ chạy cái cần chạy lại). |
| `--tier <smoke\|full\|all>` | Chọn tầng bằng chứng. Mặc định `smoke`. `full` bao gồm cả `smoke`; `all` không lọc theo tier. |
| `--dry-run` | Chỉ in ra sẽ chạy gì (và ước tính chi phí nếu có), không chạy thật, không ghi sổ. |
| `--no-mutation` | Bỏ bước kiểm mutation (bóp méo probe rồi chạy lại để xem probe có bắt được lỗi không) khi chạy target. |
| `--max-cost-usd <n>` | Hạn mức chi phí (USD) cho lần chạy này — dừng **trước khi** chạy target sẽ vượt hạn mức (chặn trước, không hoàn tiền sau). Target chưa có lịch sử chi phí không bị chặn ở lần chạy đầu (chưa đoán được). |
| `--session <id>` | Gắn `by: session:<id>` vào các dòng ghi sổ thay vì `by: cli`. |
| `--json` | Xuất `{ ran, cost_usd, stopped_for_budget, results: [{target, result, score, proof, reason}] }`. |

**Mã thoát:** `1` nếu có target `fail`/`marginal` (sát ngưỡng không tính là
đạt), hoặc có probe `unprovable` (rỗng ruột/nguy hiểm, bị chặn không chạy)
ngoài `--dry-run`; ngược lại `0`. Không có gì để verify trong graph (chưa
khai `verify:` nào) cũng thoát `0`.

**Ví dụ:**
```
ganas verify                          # mọi target smoke cần chạy lại
ganas verify F-ACC-001                # đúng một target, bất kể tươi hay cũ
ganas verify M-intent --tier full
ganas verify --all --dry-run
ganas verify --max-cost-usd 2
```

### `ganas trace`

Kiểm tương thích cạnh contract giữa các khối (cổng ra của khối nguồn có phủ
cổng vào bắt buộc của khối đích không — khai bằng `verify` với `kind:
contract` ở khối nguồn), in sơ đồ khối dạng Mermaid (`flowchart`, mỗi phần
là một subgraph), và liệt kê nợ kiểm chứng: cạnh `depends_on` chưa có hợp
đồng kiểm, hợp đồng đã trượt, hoặc khối chưa có bằng chứng nào.

Không có đối số định vị.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--dry-run` | Chỉ tính và in kết quả, không ghi vào `.ganas/verify-ledger.jsonl`. |
| `--no-diagram` | Bỏ phần in khối `mermaid`, chỉ in danh sách cạnh và nợ kiểm chứng. |
| `--session <id>` | Gắn `by: session:<id>` khi ghi sổ (giống `verify`). |
| `--json` | Xuất `{ edges: [{from, to, verification, result, reason}], debt }`. |

**Mã thoát:** `1` nếu còn nợ kiểm chứng hoặc có cạnh `fail`; ngược lại `0`.

**Ví dụ:**
```
ganas trace
ganas trace --dry-run --no-diagram
ganas trace --json | jq '.debt'
```

### `ganas commit [task]`

Commit task đã đạt điều kiện hoàn thành: kiểm hash-chain của sổ cái, chấm
gate (như `ganas gate`) — chưa đạt thì **không tạo commit nào**; `git add`
đúng phạm vi task (không `git add -A`); dựng commit message từ chính dữ liệu
gate đã kiểm chứng (dòng đầu `<task id>: <tiêu đề>`, thân liệt kê tiêu chí đã
đạt, cuối là goal/design/phạm vi task phục vụ) — không phải văn xuôi tự bịa,
và **không bao giờ** thêm dòng kiểu "Co-Authored-By" hay nhắc AI/Claude.

**Cái gì được stage.** Ba nhóm, không hơn:

1. Đường dẫn của mọi khối trong `touches`.
2. **Đường dẫn mà chính `exit_contract` chạy** — `bun test tests/e2e/x.ts` thì
   `tests/e2e/x.ts` vào commit, dù nó nằm ngoài `paths` của mọi khối. Thiếu
   bước này thì gate xanh ở máy tác giả và đỏ ở mọi máy khác.
3. File `.ganas/` mà task **sở hữu**: file task đó, các khối trong `touches`,
   fact trong `context_contract.facts`, và `verify-ledger.jsonl`.

File `.ganas/` đang đổi mà không thuộc nhóm nào thì **để lại và in ra**, không
nuốt im — nhờ vậy commit mang nhãn `T-005` không chứa graph của `T-007`.

**Đóng task.** Commit thành công thì ghi luôn `status: done` + `done_at` vào
file task (giữ nguyên comment), và thay đổi đó nằm trong chính commit đó. Còn
tiêu chí `kind: manual` chưa ai xác nhận thì **không** đóng, chỉ báo.

**Đối số định vị:** `[task]` — cùng quy tắc suy ra như `brief`/`gate`.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--task <id>` | Chỉ định task tường minh. |
| `--session <id>` | Tra task đang gắn với phiên; cũng là nguồn của cảnh báo baseline. |
| `--dry-run` | In kế hoạch stage, phần bỏ lại và commit message. **Không** `git add`/`git commit` gì cả. |
| `--no-close` | Không ghi `status: done`/`done_at` — tự quyết bằng tay. |
| `--all-ganas` | Stage cả `.ganas/` như bản cũ, không lọc theo task. |

Không hỗ trợ `--json`.

**Mã thoát:** `1` nếu gate của task chưa đạt (không có gì được commit); `0`
nếu commit thành công **hoặc** nếu phạm vi của task đã sạch (không có gì để
commit — không phải lỗi). Lỗi (`1`) nếu hash-chain của sổ cái đứt.

**Ví dụ:**
```
ganas commit                          # task đang làm (theo state.json)
ganas commit T-014 --dry-run          # xem sẽ stage gì, chưa đụng index
ganas commit T-014 --no-close         # commit nhưng tự đánh dấu done sau
```

### `ganas handoff --session <id>`

Ghi bản ghi tiếp nối của phiên vào `.ganas/runs/` — dẫn xuất **cơ học** từ
transcript (tin nhắn người dùng nguyên văn, file đã Edit/Write, lệnh Bash đã
chạy), cộng tri thức đã ghi có bằng chứng (fact/claim gắn đúng
`session_id`), **không** phải văn xuôi do model tự tóm tắt. Thường được tự
động gọi ở hook `PreCompact`/`SessionEnd` — ít khi cần gõ tay.

Không có đối số định vị — task xác định qua `--task` hoặc phiên.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--session <id>` | **Bắt buộc** — handoff luôn gắn với đúng một phiên, ganas không tự đoán. Thiếu cờ này lệnh báo lỗi ngay. |
| `--task <id>` | Task để chấm gate kèm vào handoff. Không truyền thì tra theo task đang gắn với `--session`. |
| `--transcript <path>` | Đường dẫn transcript để đọc thay vì đường dẫn mặc định của phiên. |
| `--json` | Xuất `{ path, ok }` (`ok` là kết quả gate của task tại thời điểm ghi). |

**Mã thoát:** `0` khi ghi thành công. Lỗi (`1`) nếu thiếu `--session`, hoặc
không xác định được task đang làm của phiên đó.

**Ví dụ:**
```
ganas handoff --session sess-42
ganas handoff --session sess-42 --task T-014 --transcript ./transcript.jsonl
```

### `ganas prune`

Dọn `.ganas/`: **xoá thẳng** ephemeral cục bộ (handoff cũ của phiên đã kết
thúc trong `runs/`, session mồ côi trong `state.json`); **archive** (dời
file, giữ git history) task `done` sang `tasks/done/` và sprint `closed`
sang `sprints/closed/` nếu đủ tuổi và không còn bị tham chiếu (`blocked_by`,
sprint đang dùng). Không đụng tới dữ liệu vĩnh viễn (`verify-ledger.jsonl`,
`claims/`, `decisions/`, `facts/`). **Mặc định chỉ xem trước (dry-run)**,
không đụng đĩa.

Không có đối số định vị.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--older-than <ngày>` | Ngưỡng tuổi để coi là "cũ" đủ để dọn/archive. Mặc định `7`. |
| `--yes, -y` | Thực thi thật kế hoạch dọn dẹp thay vì chỉ in ra (mặc định). |
| `--json` | Xuất kế hoạch dọn dẹp (`staleRuns`, `deadSessions`, `doneTasks`, `closedSprints`) kèm `applied`. |

**Mã thoát:** luôn `0` — kể cả dry-run và kể cả khi không có gì cần dọn.

**Ví dụ:**
```
ganas prune                           # chỉ xem trước
ganas prune --yes                     # dọn thật
ganas prune --older-than 14 --yes
```

### `ganas ledger`

Kiểm toàn vẹn sổ cái xác minh `.ganas/verify-ledger.jsonl`: tính lại
hash-chain và đối chiếu với `prev_hash` đã ghi. Sổ cái là append-only, nên
bất kỳ dòng nào bị sửa, xoá hoặc đảo thứ tự **sau khi ghi** đều làm đứt chain.

Cố tình không nạp graph — lệnh này chạy trong git hook `pre-commit` (do
`ganas init` cài), tức trên mọi commit của repo, nên phải nhanh.

Đây là lớp **phát hiện**, không phải lớp cấm: `--no-verify` bỏ qua được git
hook, và repo chưa cài ganas thì hook tự nhường đường. Giá trị nằm ở chỗ sổ
cái bị sửa tay thì **lộ ra** — bất kể ai sửa, bằng công cụ gì. Đây là thứ
thay cho lớp cũ khớp tên file trên chuỗi lệnh Bash, vốn chặn nhầm lệnh chỉ
đọc mà không cản được người chỉ cần không gõ tên file.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--check` | Kiểm chain (hành vi mặc định — cờ này để đọc lệnh cho rõ nghĩa trong hook). |
| `--json` | Xuất `{ entries, corrupt_lines, chain_ok, broken_at }`. |

**Mã thoát:** `0` khi chain liền và không có dòng hỏng; `1` khi đứt chain
hoặc có dòng không đọc được.

**Ví dụ:**
```
ganas ledger --check
ganas ledger --json
```

### `ganas hook <event>`

Điểm vào cho hook Claude Code: đọc một JSON ở stdin theo giao thức hook,
gọi handler tương ứng, ghi JSON kết quả ra stdout. **Luôn thoát mã `0`** —
kể cả khi có lỗi lập trình bên trong (chuyển thành phản hồi "degraded" thay
vì mã lỗi), vì mã khác 0 bị Claude Code hiểu là chặn hành động của người
dùng, và một lỗi trong ganas không được phép biến thành hàng rào chặn họ.

**Đối số định vị:** `<event>` — bắt buộc, một trong:

| Event | Tương ứng hook Claude Code |
|---|---|
| `session-start` | `SessionStart` |
| `pre-tool-use` | `PreToolUse` |
| `post-tool-use` | `PostToolUse` |
| `stop` | `Stop` |
| `pre-compact` | `PreCompact` |
| `session-end` | `SessionEnd` |

Không nhận `--json` (đầu ra luôn là JSON theo giao thức hook, đọc từ
stdin/ghi ra stdout, không phải tuỳ chọn của người dùng). Không nhận
`--session` qua dòng lệnh — session id nằm trong JSON ở stdin.

**Mã thoát:** luôn `0`.

**Ví dụ (thường do Claude Code gọi tự động, không gõ tay):**
```
echo '{"session_id":"sess-42",...}' | ganas hook session-start
```

## Bảng tra nhanh

| Lệnh | Đối số định vị | Đọc/ghi sổ (`verify-ledger.jsonl`) | Có `--json` |
|---|---|---|---|
| `init` | — | không | không |
| `validate` | — | không | có |
| `next` | — | ghi `state.json` | có |
| `brief [task]` | task | không | có |
| `gate [task]` | task | không | có |
| `verify [target...]` | target... | ghi | có |
| `trace` | — | ghi (trừ `--dry-run`) | có |
| `commit [task]` | task | không (đọc gate) | không |
| `handoff` | — | không | có |
| `prune` | — | không | có |
| `hook <event>` | event (bắt buộc) | tuỳ handler | luôn JSON |
