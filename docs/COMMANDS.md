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
(`goals/`, `designs/`, `tasks/`, `scopes/`, `modules/`, `facts/`,
`claims/`, `decisions/`, `domains/`, `legacy-imported/`, `map-surveys/`,
`proposals/`, `runs/`), `config.yaml`, `state.json`, `.ganas/README.md`,
`.claude/rules/ganas-knowledge.md`, `.claude/rules/architecture.md`,
`.claude/rules/ganas-git.md` (tag semver, ký commit local, không
Co-Authored-By), `.claude/rules/naming.md` (định danh tiếng Anh, văn xuôi
tiếng Việt), `.claude/rules/agent-guide.md` (viết file hướng dẫn cho agent:
ngắn ở gốc, đặt gần code), **file hướng dẫn tên theo `--harness`** —
`CLAUDE.md` cho `claude-code`, `AGENTS.md` cho `codex`/`cursor`/`zed`/
`windsurf`, `GEMINI.md` cho `gemini` — cộng một `AGENTS.md` **cửa trỏ** ngắn
khi tên file chính không phải `AGENTS.md`, một goal mẫu (`G-001`) — không sinh
phạm vi mẫu, nó cần ranh giới code thật mà chỉ `ganas scope new` mới hỏi
được — thêm mục `.ganas/runs/` vào `.gitignore` nếu dự án dùng git, và
— nếu dự án dùng git — sinh `.githooks/commit-msg` (tự xoá dòng
`Co-Authored-By` nhắc AI khỏi mọi commit) rồi bật bằng
`git config core.hooksPath .githooks`.

Không có đối số định vị.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--project <tên>` | Tên dự án điền vào template. Không truyền thì hỏi tương tác (TTY) hoặc lấy tên thư mục hiện tại (non-TTY/`--yes`). |
| `--owner <handle>` | Handle người duyệt mục tiêu (vd `@nguyen-a`, tự thêm `@` nếu thiếu). Không truyền thì hỏi tương tác hoặc để trống. |
| `--harness <tên>` | Harness giao việc: `claude-code` (mặc định), `codex`, `cursor`, `zed`, `windsurf`, `gemini`, `other`. Quyết định **tên file hướng dẫn** được sinh ra và cách brief dạy giao task. Tên ngoài danh sách thì báo lỗi, không đoán. |
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

Phỏng vấn **5 câu** rồi ghi `scopes/<id>.yaml`. Nếu chưa khối nào có `paths`
giao với glob vừa khai thì tạo luôn khối — nếu không, phạm vi mới không hợp lệ
(`modules` phải có ít nhất một phần tử) và người dùng lại phải gõ tay YAML,
đúng thứ lệnh này sinh ra để tránh.

Câu thứ 5 là **id**, gợi ý sẵn slug suy từ tiêu đề (Enter là nhận). Slug cắt ở
**biên từ** chứ không cắt cứng ở ký tự thứ 40: id xuất hiện trong mọi brief,
mọi commit message và mọi `depends_on`, nên một id cụt giữa từ làm hỏng khả
năng đọc của tất cả những chỗ đó.

Không có TTY (hoặc có `--yes`) thì năm câu phải đưa qua tuỳ chọn.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--title <chuỗi>` | *Bàn giao cái gì?* Cũng là nguồn để suy `id` (bỏ dấu tiếng Việt → slug). |
| `--paths <glob,glob>` | *Code nằm ở đâu?* Danh sách glob cách nhau bởi dấu phẩy. |
| `--accept <lệnh>` | *Làm sao biết là xong?* Thành `acceptance` mức phạm vi, chạy trên luồng đã ghép. |
| `--owner <@ten>` | *Ai ký nghiệm thu?* Bỏ trống thì `validate` cảnh báo `scope/without-owner`. |
| `--id <P-...>` | Ghi đè id tự suy. Nên dùng — id ngắn đọc tốt hơn slug suy từ tiêu đề dài. |
| `--yes, -y` | Không hỏi, đọc hết từ tuỳ chọn. |

**Mã thoát:** `0` nếu tạo được; `2` (GanasError) nếu thiếu một trong bốn câu,
`owner` sai dạng `@ten`, hoặc id đã tồn tại.

**Tách lõi khỏi I/O.** `--paths` chứa cả vùng lõi lẫn vùng chạm I/O (nhận theo
tên đoạn đường dẫn: `io`, `store`, `adapter`, `infra`, `repo`, `gateway`,
`client`…) thì lệnh sinh **hai** khối: `M-<ten>` (`nature: code` — lõi) và
`M-<ten>-io` (`nature: io`) khai `depends_on: [M-<ten>]`. Adapter cài đặt port
do lõi định nghĩa, nên adapter phụ thuộc lõi chứ không ngược lại.

Gộp cả hai vùng vào một khối `nature: code` là sinh ra một khối vi phạm ngay
lúc tạo đúng luật kiến trúc mà `ganas init` vừa phát cho dự án
(`.claude/rules/architecture.md`: khối `code` là **lõi**, không tự mở file,
không tự gọi network, không tự query DB).

Chỉ có một vùng thì vẫn một khối `nature: code`, và lệnh **nói thẳng** rằng
vùng chạm I/O phải là khối `nature: io` riêng, còn vùng có gọi LLM thì phải
`nature: llm` (khi đó bắt buộc có eval). `llm` là chỗ cố ý không đoán: đoán sai
nghĩa là bỏ qua lớp bằng chứng duy nhất kiểm được hành vi của LLM.

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

### `ganas id <loại>`

Cấp id kế tiếp cho một loại đánh số, để agent không còn lý do đi bịa nhãn tạm
("Lô 3", "T4a", "$3") — tự liệt kê `.ganas/tasks/` rồi đoán số kế tiếp quá đắt
để làm mỗi lần nhắc tới một task mới.

Chỉ nhận loại **đánh số** (tiền tố cố định + số tăng dần): `goal`, `design`,
`task`, `claim`, `decision`, `fact`. Loại **đặt tên theo nghĩa** (`module`,
`scope`, `verification`) không có "id kế tiếp" nào để cấp — lệnh từ chối và
trỏ sang `ganas scope new`, nơi id được suy từ tiêu đề.

**Đối số định vị:** `<loại>` — bắt buộc, một trong sáu loại đánh số ở trên.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--count <n>` | Số id liên tiếp cần cấp, mỗi id một dòng. Mặc định `1`. |
| `--group <nhóm>` | **Bắt buộc** khi `<loại>` là `fact` — id fact có thêm đoạn nhóm ở giữa (`F-<NHÓM>-003`), phải khớp `^[A-Z0-9]+$`. |
| `--json` | Xuất `{ kind, group?, ids: [...] }`. |

**Chống đua bằng đặt chỗ.** Id chỉ ra khỏi lệnh này khi phiên gọi đã thật sự
giữ được chỗ cho nó: mỗi số ứng viên đi qua `reserveId()`
(`src/graph/claim.ts`), tạo file `.ganas/.locks/<id>.id` bằng `open(file,
"wx")` — nguyên tử ở tầng filesystem, hai tiến trình gọi cùng lúc thì hệ điều
hành đảm bảo chỉ một cái thắng. Ứng viên đang bị phiên khác giữ thì bị **nhảy
qua**, không cấp lại. Vì vậy hai phiên gọi `ganas id task` đồng thời nhận **hai
số khác nhau**; lỗ hổng số ở giữa là chấp nhận được và không được lấp.

Đặt chỗ hết hạn theo `claim.ttl_minutes` (mặc định 240 phút, dùng chung với
claim task), và được dọn lúc `SessionEnd` cho đúng phiên đã giữ. Khác `ganas
next`: cùng một phiên gọi lại **không** nhận lại id cũ — claim task là quyền
sở hữu một thứ đã tồn tại, còn đặt chỗ id là tiêu thụ một con số, cấp lại cho
ai thì cũng là cấp trùng.

**Hai giới hạn còn lại, phải biết:**

1. `.ganas/.locks/` nằm trong `LOCAL_ONLY` — không commit, không đồng bộ qua
   git. Lớp này **chỉ** chống đua giữa các phiên trên **cùng một máy**.
2. Lệnh này vẫn không ghi file thực thể hộ bạn; việc đó do agent tự làm bằng
   Write. Chỗ hở đó do lớp thứ hai lo: hook `PreToolUse` từ chối `Write` ghi đè
   lên file thực thể `.ganas/` **đã tồn tại** (dùng `Edit` để sửa file có sẵn).
   Hàng rào đó chỉ có hiệu lực khi plugin ganas được cài trong Claude Code —
   gọi `ganas` trần từ terminal thì không có hook nào chặn.

**Id đã khai trên đĩa nhưng graph không thấy vẫn tính là ĐÃ DÙNG.** Số kế tiếp
không chỉ tính trên id đã qua được zod (`graph.tasks`/`graph.facts`/...) — id
khai trong một file **hỏng schema** (vẫn đọc được YAML nhưng thiếu trường bắt
buộc) hoặc **hỏng cú pháp YAML** (không parse được) cũng được gộp vào, nên lệnh
không cấp lại đúng id đang nằm trên đĩa. Không có lớp này thì một file hỏng sẽ
khiến id của nó vô hình với bộ cấp số — lệnh cấp lại id đó, agent ghi vào bị
hook `PreToolUse` từ chối (file đã tồn tại), chạy lại `ganas id` vẫn ra id cũ:
kẹt vòng lặp không lối ra.

**Mã thoát:** `0` khi cấp được id; `1` (`GanasError`) nếu thiếu `<loại>`,
loại không tồn tại, loại là slug (`module`/`scope`/`verification`), `fact`
thiếu `--group`, `--group` sai dạng, hoặc `--count` không phải số nguyên
dương.

**Ví dụ:**
```
ganas id task                  # T-017
ganas id task --count 4        # bốn id liên tiếp, mỗi id một dòng
ganas id fact --group ACC      # F-ACC-003
ganas id task --json           # {"kind":"task","ids":["T-017"]}
```

### `ganas next`

Chọn task kế tiếp nên làm và in brief đầy đủ của task đó. Ưu tiên task đang
`in_progress` (nối tiếp việc dở trước khi mở việc mới), rồi tới task thuộc
phạm vi đang `active`; task không còn `blocked_by` mở nào mới được xét. Ghi
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

**Dạng probe bóp méo được:** `test -f <path>` (và `-d -e -s -r`), `grep -q
'<pattern>' <file>` (kể cả `rg`/`ag`), **bộ chạy test kèm đường dẫn** (`bun test
<path>`, `vitest`, `jest`, `pytest`, `go test`, `cargo test`), hoặc bất kỳ lệnh nào
có chuỗi trong nháy. Không nhận ra dạng thì `ganas verify` nói thẳng "chưa
chứng minh được là có thể fail" chứ không im lặng coi như đã chứng minh.
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

### `ganas debt [--all]`

Bảng xếp hạng nợ, gộp hai nguồn: `validateGraph` (spine/scope/tri thức —
liên kết treo, thiếu verification, chu trình, sổ cái hỏng, ...) và
`computeDebt` của sơ đồ khối (cạnh chưa kiểm, hợp đồng trượt, khối chưa có
bằng chứng). Hai nguồn này mỗi bên nói một thứ nợ rời nhau, không cái nào
nói "làm cái nào trước" — `ganas debt` chấm điểm cả hai theo cùng một thang
rồi sắp chung một bảng (`src/debt.ts`).

**Thang điểm.** Mỗi mã nợ có hai trục, cùng thang **1 / 3 / 5**:

- **weight** (quan trọng đến đâu nếu bỏ qua) — 5 = mất dữ liệu/hỏng nền
  (vd sổ cái xác minh đứt chain), 3 = sinh kết luận sai (vd task "done" mà
  không ai verify khối nó chạm), 1 = chỉ là thông tin (vd một claim đã bị
  bác bỏ, giữ lại làm lời nhắc).
- **ease** (dễ sửa đến đâu) — 5 = sửa một dòng YAML (trỏ lại đúng id), 3 =
  phải chạy lệnh hoặc viết probe, 1 = phải thiết kế lại (vd một chu trình
  phụ thuộc, chỉ gỡ được bằng cách vẽ lại sơ đồ).

**total = weight + ease**, bảng sắp giảm dần theo `total` — số cao đứng đầu
nghĩa là "quan trọng VÀ dễ sửa", tức làm ngay có lãi nhất. Tổng cao nhất có
thể đạt là `10` (5 + 5); một dòng tổng thấp (vd `2`) không có nghĩa là
"không quan trọng" — có thể là quan trọng thấp NHƯNG cũng khó sửa (hai trục
cộng dồn, không nói riêng trục nào). Cần tách hai trục thì xem `--json`
(mỗi hàng có `score.weight`/`score.ease` riêng).

Mã lạ (luật mới thêm mà chưa chấm điểm trong `SCORES`/`NAMESPACE_DEFAULTS`
của `src/debt.ts`) làm `scoreOf` **ném lỗi** — cố tình, để guard test
(`test/debt.test.ts`) bắt được ngay lúc thêm luật, không âm thầm rơi khỏi
bảng xếp hạng.

**Phạm vi.** Mặc định lọc theo `scope` của task đang làm (tra như `commit`:
`--session`, rồi `current_task`) — cùng nguyên tắc `postToolUse` đã áp dụng
ở nơi khác trong ganas: chỉ báo nợ của phạm vi đang động vào, không đổ cả nợ
tồn kho của dự án lên đầu một task đang làm việc khác. Không xác định được
task đang làm thì lệnh **từ chối chạy** thay vì âm thầm trả bảng rỗng
(trông như "sạch nợ") — báo lỗi và gợi ý `--all` hoặc gắn task trước.

**Cắt bớt có ghi chú.** In tối đa 20 dòng đầu (đã sắp theo `total` nên luôn
là phần đáng làm nhất); vượt ngưỡng thì có một dòng nói rõ đã bỏ bao nhiêu
và trỏ sang `--json` để lấy đủ. Không có chuyện cắt im lặng.

Không có đối số định vị.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--all` | Bỏ lọc phạm vi, in nợ của toàn bộ dự án. |
| `--session <id>` | Tra task đang gắn với phiên để suy ra phạm vi (bỏ qua khi có `--all`). |
| `--json` | Xuất `{ scope, all, total, shown, outside, rows }` — `rows` KHÔNG bị cắt bớt. |

**Mã thoát:** luôn `0` — đây là báo cáo, không phải cổng (khác `ganas
trace`, vốn trả `1` khi còn nợ). Lỗi (`1`, `GanasError`) nếu không xác định
được task đang làm mà thiếu `--all`.

**Ví dụ:**
```
ganas debt                    # nợ trong phạm vi task đang làm
ganas debt --all              # toàn dự án
ganas debt --json | jq '.rows[0]'
```

### `ganas icebox [add|list|review|close|promote]`

Sổ **việc đã quyết CHƯA làm** (`src/model/icebox.ts`) — đối lập có chủ đích với
`Task`: `Task` đã quyết LÀM (có `exit_contract`, được `candidates()` chọn cho
một phiên), icebox là một phát hiện giữa phiên đã chấm điểm hai trục
(`weight`/`ease`, cùng thang `ganas debt`) nhưng chưa tới lượt làm. Mỗi bản
ghi bắt buộc có điểm số, lý do hoãn (`why_deferred`), và ngày xem lại
(`found_at` + `review_after_days`) — ba thứ phân biệt "hoãn có ý thức" với
"quên mất". Ghi vào `.ganas/icebox/<YYYY-MM>.yaml`, một file mảng theo tháng
(cùng khuôn `facts/`, `claims/`, `decisions/`).

#### `ganas icebox add`

Ghi một mục mới vào file tháng hiện tại (tạo file nếu chưa có). Id đặt chỗ
qua `reserveId()` (`src/graph/claim.ts`) — cùng cơ chế nguyên tử `ganas id`
dùng, không bịa tay. Ghi bằng `parseDocument` + `addIn` nên **comment sẵn có
trong file được giữ nguyên**.

**Khoá quanh lượt đọc-sửa-ghi.** `reserveId` chỉ bảo vệ CON SỐ, không bảo vệ
FILE — hai lượt `add` gần như đồng thời vào CÙNG tháng vẫn có thể cùng đọc
một nội dung rồi cùng ghi đè, một mục biến mất không tiếng động. `withFileLock`
(`src/graph/claim.ts`, sinh cho lệnh này) khoá mutex quanh trọn lượt đọc-sửa-ghi,
TTL tính bằng **mili giây** (không phải phút như `claim.ttl_minutes`) vì khoá
chỉ cần sống qua đúng một lượt ghi, và giải phóng trong `finally`.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--title <chuỗi>` | **Bắt buộc.** Tiêu đề ngắn. |
| `--weight <1-5>` | **Bắt buộc.** Quan trọng đến đâu nếu bỏ qua — cùng thang `ganas debt`. |
| `--ease <1-5>` | **Bắt buộc.** Dễ sửa đến đâu — cùng thang `ganas debt`. |
| `--why <chuỗi>` | **Bắt buộc.** Vì sao hoãn. Ghi nửa vời quay lại đúng bệnh "nằm trong chat mà không ai tìm được". |
| `--anchor <chuỗi>` | **Bắt buộc, lặp lại được** (`--anchor A --anchor B`). Bằng chứng cho phát hiện — ít nhất một. |
| `--scope <P-...>` | Phạm vi công việc, nếu đã biết. Thiếu thì luật `icebox/without-scope` sẽ nhắc. |
| `--review-after <n>` | Số ngày trước khi tính là quá hạn xem lại. Mặc định `30`. |
| `--json` | Xuất `{ id, file }`. |

**Mã thoát:** `0` nếu ghi được; `1` (`GanasError`) nếu thiếu một trong năm
tuỳ chọn bắt buộc, `--weight`/`--ease` ngoài thang 1-5, hoặc `--review-after`
không phải số nguyên ≥1.

#### `ganas icebox list`

Liệt kê. Mặc định lọc theo phạm vi của task đang claim — **cùng logic và
cùng thông điệp lỗi** với `ganas debt` khi không xác định được task đang làm
(`scopeFromClaimedTask()`, dùng chung giữa hai lệnh: một quy tắc trong repo,
không phải hai bản có thể trôi khỏi nhau). `--all` bỏ lọc.

Mặc định chỉ mục `status: open`; `--closed` in cả mục đã đóng/đã thăng cấp
(đây là nơi `closed_reason` được đọc, cho mục `closed`).

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--all` | Bỏ lọc phạm vi. |
| `--closed` | In cả mục `closed`/`promoted`, không chỉ `open`. |
| `--json` | Xuất `{ scope, closed, total, rows }`. |

**Mã thoát:** `0`; lỗi (`1`, `GanasError`) nếu không xác định được task đang
làm mà thiếu `--all`.

#### `ganas icebox review`

Mục `open` **đã quá hạn xem lại** (`found_at + review_after_days < now`).
`--older-than N` ghi đè ngưỡng cho lượt quét ad-hoc bằng một số ngày cố định
thay cho `review_after_days` riêng của từng mục — cùng tên và cùng nghĩa cờ
với `ganas prune`.

Mỗi mục in: số ngày quá hạn, `weight + ease`, **`why_deferred`** (điểm mấu
chốt của lệnh này — lý do hoãn, thứ `ganas icebox list` không in), anchors,
và hai lệnh bấm được (`ganas icebox close`, `ganas icebox promote`).
**Không sửa gì cả** — quá hạn là ĐỀ XUẤT xem lại, người bấm mới là hành động.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--older-than <ngày>` | Ghi đè `review_after_days` bằng một ngưỡng chung cho lượt quét này. |
| `--json` | Xuất `{ olderThan, total, rows }` — mỗi row là icebox kèm `overdue_days`. |

**Mã thoát:** luôn `0` — đây là báo cáo, không phải cổng. Lỗi (`1`,
`GanasError`) nếu `--older-than` không phải số ngày hợp lệ.

#### `ganas icebox close <ICE-id>`

Đặt `status: closed` + `closed_at` + `closed_reason`, giữ nguyên comment
(cùng kỹ thuật `add`). **Không dry-run** — khác `ganas prune` (mặc định
dry-run vì nó đụng NHIỀU thứ do máy chọn trong một lượt): `close` đụng ĐÚNG
MỘT id do người gõ, kèm lý do bắt buộc, nên không cần bước xem trước.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--reason <chuỗi>` | **Bắt buộc.** Vì sao đóng — thiếu thì phiên sau đề xuất lại đúng thứ vừa bị loại. |

**Mã thoát:** `0` nếu đóng được; `1` (`GanasError`) nếu thiếu `<ICE-id>`, id
không tồn tại, hoặc thiếu `--reason`.

#### `ganas icebox promote <ICE-id>`

**Không tạo Task hộ.** Thiếu `--task`: in khung YAML dán được (title từ mục,
`context_contract.must_read` suy từ `anchors`, `scope` nếu có), để trống
`serves`/`implements`/`exit_contract` kèm chú thích (đó là thứ chỉ người
quyết được), gợi `ganas id task`, rồi thoát mã `1`.

Có `--task T-042`: kiểm `graph.tasks.has(...)` — task sai schema thì không
vào graph nên tự động bị từ chối (cưỡng chế miễn phí, không validate lại
tay); kiểm `scope` khớp khi cả hai cùng khai; rồi đặt `status: promoted` +
`promoted_to` + `closed_at`.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--task <T-id>` | Task đích. Thiếu thì in khung dán được thay vì ghi. |

**Mã thoát:** `0` nếu thăng cấp được; `1` (`GanasError`) nếu thiếu `<ICE-id>`,
id không tồn tại, `--task` trỏ task không tồn tại, hoặc `scope` hai bên lệch
nhau; `1` (không phải lỗi) khi thiếu `--task` — đã in khung, chờ người điền.

**Ví dụ:**
```
ganas icebox add --title "Cache miss khi restart" --weight 3 --ease 4 \
  --why "chưa gấp, chờ đo lại sau khi tối ưu DB" --anchor src/cache.ts:88
ganas icebox list                       # phạm vi task đang làm
ganas icebox list --all --closed --json
ganas icebox review                     # mục quá hạn xem lại
ganas icebox review --older-than 14
ganas icebox close ICE-003 --reason "không còn cần nữa, đã đổi thiết kế"
ganas icebox promote ICE-004            # in khung, chưa có --task
ganas icebox promote ICE-004 --task T-042
```

### `ganas proposal [new|list|show|approve|reject]`

**Chỗ lệch CHƯA ai quyết** (`src/model/proposal.ts`). Ba thực thể "việc chưa
làm" của ganas khác nhau ở chỗ AI đã quyết cái gì:

| Thực thể | Ai đã quyết gì |
|---|---|
| `Task` | người đã quyết **LÀM** — có `exit_contract`, được `candidates()` giao |
| `Icebox` | người đã quyết **CHƯA làm** — có `why_deferred` và ngày xem lại |
| `Proposal` | **chưa ai quyết gì** — đang chờ một con người trả lời có/không |

Trước khi có nó, câu "chỗ này lệch, nên refactor" chỉ tồn tại trong chat và
chết theo context, nên agent chỉ còn hai đường đều sai: im lặng bỏ qua, hoặc
tự refactor thứ không ai duyệt. Ghi vào `.ganas/proposals/PR-00N.yaml` — **một
file một đề xuất**, nạp bằng `collectSingle` như goal/design/task.

**Cạnh chỉ đi MỘT CHIỀU.** `promoted_to` trỏ tới thực thể sinh ra từ đề xuất
(`D-`/`T-`/`ICE-`); design/task/icebox **không** có trường nào trỏ ngược lại.
Muốn hỏi "design này sinh từ đề xuất nào" thì duyệt proposals — lưu cả hai
chiều là tạo hai nguồn sự thật cho cùng một quan hệ, và chúng lệch nhau ngay
lần sửa tay đầu tiên.

**`scope` bắt buộc** (khác `Icebox.scope` tuỳ chọn): brief chỉ nhắc đề xuất
cùng phạm vi với task đang làm, nên đề xuất không khai phạm vi thì không bao
giờ tới tay phiên nào — ghi mà không ai đọc còn tệ hơn không ghi.

#### `ganas proposal new`

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--title <chuỗi>` | **Bắt buộc.** Tiêu đề ngắn. |
| `--problem <chuỗi>` | **Bắt buộc.** Chỗ LỆCH là gì. Tách khỏi `--change` có chủ đích: nêu giải pháp mà không nêu vấn đề thì mọi đề xuất đều "nghe hợp lý". |
| `--change <chuỗi>` | **Bắt buộc.** Đề nghị làm gì. |
| `--anchor <chuỗi>` | **Bắt buộc, lặp lại được.** Bằng chứng — không chỉ được nguồn thì không phải phát hiện, chỉ là ý kiến. |
| `--weight <1-5>` | **Bắt buộc.** Bỏ qua thì hại đến đâu. |
| `--ease <1-5>` | **Bắt buộc.** Sửa dễ đến đâu. |
| `--scope <P-...>` | Phạm vi. Thiếu thì suy từ task đang claim (`scopeFromClaimedTask()`, dùng chung với `ganas debt`). |
| `--json` | Xuất `{ id, file }`. |

#### `ganas proposal list`

Mặc định chỉ hiện `pending`, lọc theo phạm vi của task đang claim (`--all` để
xem toàn dự án, `--all-status` để thấy cả cái đã quyết).

**Sắp giảm dần theo `weight + ease`**, tie-break theo id. Đây là chỗ **duy
nhất** hai điểm đó được đọc: PR-001 (bị từ chối 2026-08-21) chốt rằng đề xuất
KHÔNG vào bảng `ganas debt`, vì bảng nợ chứa thứ đã được **công nhận** là nợ
còn đề xuất thì chưa ai công nhận. Bỏ phép sắp này đi là biến `weight`/`ease`
thành hai trường người dùng phải điền mà không có tác dụng gì.

#### `ganas proposal show <id>`

In đủ: vấn đề, đề nghị, bằng chứng, và — nếu đã quyết — ai quyết, lúc nào, lý
do từ chối. Còn `pending` thì in luôn hai lệnh bấm được cho người quyết.

#### `ganas proposal approve <id>` / `ganas proposal reject <id>`

Ranh giới MÁY/NGƯỜI: cả hai đòi `--by @ai-đó`, **không có mặc định và không
suy từ `git config`** — suy từ đó thì mọi lượt agent chạy sẽ mang tên chủ máy,
và bản ghi "ai duyệt" mất nghĩa đúng lúc nó cần có nghĩa nhất.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--by <@ten>` | **Bắt buộc cho cả hai.** Người trả lời. |
| `--why <chuỗi>` | **Bắt buộc cho `reject`.** Từ chối không nói lý do thì phiên sau đề xuất lại đúng thứ vừa bị loại — và luật `knowledge/proposal-repeats-rejected` sẽ trả lại nguyên văn lý do này. |
| `--promoted-to <id>` | Chỉ cho `approve`. Thực thể sinh ra từ đề xuất; phải TỒN TẠI THẬT trong graph. |

Đã quyết rồi thì **không quyết lại**: đổi ý là một đề xuất MỚI khai
`supersedes: [PR-cũ]`, để lịch sử giữ đủ cả hai lần quyết.

```bash
ganas proposal new --title "Tách khối trùng vùng code" \
  --problem "M-a và M-b cùng trỏ src/a.ts" \
  --change "tách src/a.ts ra khối riêng" \
  --anchor src/a.ts:12 --weight 4 --ease 3
ganas proposal list                     # pending trong phạm vi task đang làm
ganas proposal list --all --all-status
ganas proposal show PR-001
ganas proposal reject PR-001 --by @tienhm --why "hệ cũ đang chạy, chưa đụng"
ganas proposal approve PR-002 --by @tienhm --promoted-to D-007
```

### `ganas search <chuỗi>`

BM25 trên fact (`src/search.ts`) — trả lời câu hỏi mà `context_contract.facts`
không trả lời được: "phiên trước có kiểm chứng điều gì LIÊN QUAN tới việc tôi
đang làm mà không ai khai tay?" Trước lệnh này, đường duy nhất là grep YAML.

Chấm điểm trên `statement`, `notes`, `verify.run` (lệnh probe — chứa tên
file/lệnh), và `depends_on` (glob đường dẫn — mạnh nhất cho câu hỏi "fact nào
liên quan tới file tôi đang sửa"). Tokenize xử lý được tiếng Việt (bỏ dấu) và
sinh cả token nguyên lẫn mảnh con cho id/đường dẫn (`T-017` → `t-017` + `017`;
`src/graph/load.ts` → cả cụm lẫn `src`, `graph`, `load`, `ts`) — tra theo tên
file vẫn khớp dù fact không chép nguyên văn đường dẫn đó.

Chỉ nhận hit khớp **ít nhất 2 token truy vấn khác nhau** (`minMatchedTerms`,
hạ xuống 1 nếu truy vấn chỉ có một từ) — điểm BM25 không chuẩn hoá theo kích
thước kho, nên một ngưỡng điểm tuyệt đối sẽ vỡ khi kho fact to/nhỏ đi; "khớp
≥2 từ" thì ổn định và giải thích được.

**Mỗi kết quả PHẢI nói độ tươi** (`computeFreshness`, dùng lại nguyên, không
tự tính lại) — nhãn `[FRESH]`/`[STALE]`/... đứng NGAY ĐẦU dòng, không chìm ở
cuối. Một cỗ máy tìm kiếm trả fact đã mục mà không nói nó mục chỉ là máy phát
ảo giác tốc độ cao.

**Phạm vi.** Có `--task` (không kèm `--scope`) thì search cả graph rồi LABEL
hit khác phạm vi task (⚠ NGOÀI PHẠM VI ĐANG XÉT) thay vì giấu nó — cùng cách
`ganas brief` xử lý fact khai tay khác phạm vi: không giấu, chỉ cảnh báo.
`--scope` tường minh thì hard-filter thật, chỉ trả fact thuộc đúng phạm vi đó.

Dùng `--task <id>`: truy vấn dựng từ `title` + đường dẫn trong
`context_contract.must_read` + `open_questions` của task (`taskQuery()` trong
`src/search.ts` — cùng hàm brief dùng, không có hai bản logic lệch nhau); fact
đã khai tay trong `context_contract.facts` của task đó bị loại khỏi kết quả
(đã có trong brief rồi, search chỉ có giá trị thêm khi trả về thứ CHƯA khai).

**Cắt bớt có ghi chú**, cùng nguyên tắc `ganas debt`: vượt `--limit` thì có
một dòng nói rõ đã bỏ bao nhiêu.

| Đối số / Tuỳ chọn | Ý nghĩa |
|---|---|
| `<chuỗi>` | Truy vấn thô. Bắt buộc trừ khi dùng `--task`. |
| `--task <id>` | Dùng chính task này làm truy vấn thay vì gõ tay. |
| `--scope <id>` | Bó cứng kết quả trong một phạm vi (khác `--task` một mình: đây là lọc thật, không phải label). |
| `--limit <n>` | Số kết quả in ra tối đa. Mặc định 10. |
| `--json` | Xuất `{ query, task, scope, total, shown, omitted, hits[] }` — mỗi hit có `factId`, `score`, `matchedTerms`, `freshness`, `freshnessReason`, `scope`, `file`, `outOfScope`. |

**Mã thoát:** luôn `0` — không tìm thấy kết quả không phải lỗi, chỉ là một sự
thật cần biết. Lỗi (`1`, `GanasError`) nếu thiếu cả `<chuỗi>` lẫn `--task`,
task không tồn tại, hoặc `--limit` không phải số nguyên dương.

**Ví dụ:**
```
ganas search "webhook zalo timeout"
ganas search --task T-017              # truy vấn suy từ chính task
ganas search "auth token" --scope P-checkout --limit 5
ganas search "..." --json | jq '.hits[0]'
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

### `ganas note "..."`

Ghi một ghi chú thô, tức thời — thứ đáng lẽ chảy vào một file `NOTES.md` tự
chế nào đó. Lý do lệnh này tồn tại: ganas cưỡng chế rất chặt bên trong
`.ganas/` (claim bắt buộc anchor, hook chặn ghi, sổ cái hash-chain), và đúng
sự cưỡng chế đó đẩy văn xuôi sang một kênh không ai gác — agent bị chặn vì
thiếu anchor không đi tìm bằng chứng, nó viết một đoạn văn xuôi vào chỗ miễn
phí, rồi phiên sau đọc và tin. `ganas note` không rào chặt hơn — nó làm cho
đường đúng (gõ một dòng, lệnh tự đóng dấu phần còn lại) RẺ hơn đường sai (mở
file ra gõ tay).

Chỉ cần gõ nội dung. Lệnh tự đóng dấu session id (từ `--session`, hoặc nhãn
`manual` khi gọi tay), task đang bind (`taskForSession`), sha ngắn của commit
hiện tại (bỏ qua nếu không phải git repo), thời điểm ISO, và
`touched_paths` của phiên (file phiên này thật sự đã đụng — một cái neo gần
đúng, không bắt người viết khai gì). Ghi **nối thêm** vào
`.ganas/runs/notes/<session>.md`, không ghi đè — mỗi lần gọi là một mẩu mới,
mẩu cũ không mất.

**Note KHÔNG BAO GIỜ là fact.** Không có anchor thì không phải tri thức đã
kiểm — `loadGraph` không đọc `runs/` nên note không thể lẫn vào graph dưới bất
kỳ hình thức nào. Muốn nâng cấp một điều trong note thành tri thức thì đi
đường `claim → verify → fact` sẵn có, không có lối tắt nào ở đây. `ganas
prune` dọn được note cũ giống hệt handoff cũ (cùng thư mục `runs/`, khác
subdirectory `notes/` để không bị handoff ghi đè mất).

**Đối số định vị:** nội dung ghi chú — mọi token không phải cờ được nối lại
bằng dấu cách; nên quote nếu có nhiều từ.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--session <id>` | Gắn note với đúng một phiên. Không truyền thì dùng nhãn `manual`. |

**Mã thoát:** `1` (`GanasError`) nếu thiếu nội dung; `0` khi ghi thành công.

**Ví dụ:**
```
ganas note "chưa rõ vì sao webhook retry 3 lần"
ganas note --session sess-42 "đã thử tắt cache, không đổi kết quả"
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
file, giữ git history) task `done` sang `tasks/done/` nếu đủ tuổi và không
còn bị tham chiếu (`blocked_by`). Không đụng tới dữ liệu vĩnh viễn
(`verify-ledger.jsonl`, `claims/`, `decisions/`, `facts/`, phạm vi công việc
dù đã `delivered`). **Mặc định chỉ xem trước (dry-run)**, không đụng đĩa.

Không có đối số định vị.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--older-than <ngày>` | Ngưỡng tuổi để coi là "cũ" đủ để dọn/archive. Mặc định `7`. |
| `--yes, -y` | Thực thi thật kế hoạch dọn dẹp thay vì chỉ in ra (mặc định). |
| `--json` | Xuất kế hoạch dọn dẹp (`staleRuns`, `deadSessions`, `doneTasks`) kèm `applied`. |

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
