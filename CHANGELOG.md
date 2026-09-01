# Changelog

Ghi theo tính năng, không theo từng commit — xem `git log` nếu cần chi tiết
từng bước (`P2 N<số>` trong commit message khớp số thứ tự trong lịch sử phát
triển thật, không phải số phát minh ra sau).

Việc đang làm ghi dưới `## Chưa phát hành`. Đừng gõ tay số version vào tiêu đề:
`npm version <bump>` tự đổi tiêu đề đó thành `## vX.Y.Z — <ngày>` bằng
`scripts/sync-version.mjs`, và `test/version-sync.test.ts` chặn mọi trường hợp
lệch giữa CHANGELOG, `package.json`, manifest plugin và bundle đã build.

## Chưa phát hành

- **Design không nối tới code, nên thiết kế và code trôi khỏi nhau mà không ai
  báo.** Xương sống Goal→Design→Task vốn chỉ có một cạnh đi xuống, và nó ngược
  chiều: `task.implements`. Design vì thế không nói được nó CHỐT cái gì, chỉ nói
  được ai đang làm nó — nội dung thiết kế phải nhét vào `summary` văn xuôi, và
  D-008/D-009 đã nhét ~30 dòng vào đúng một trường. Nặng hơn: `portIssues()` chỉ
  so `shape` khối này với `shape` khối kia, **chưa bao giờ so với code thật**.
  `scripts/gen-ports.mjs` có đọc chữ ký bằng TypeScript compiler API nhưng cố ý
  chỉ IN RA để người dán — sau lúc dán thì không còn gì canh.

  Nay Design có **`artifacts`**: mỗi bản vẽ khai `kind`, khối (hoặc `path` với
  `kind: doc`), `shape`, và một `probe` đối chiếu bản vẽ với CODE THẬT. Toàn bộ
  điểm nối là **một hàm** `artifactTargets()` cắm vào `allTargets()` — khe duy
  nhất mà `computeFreshness()` lấy đầu vào — nên `ganas verify D-010` chạy được
  ngay và nhánh `verification` của gate không phải sửa một dòng.

  Điểm làm tính năng này rẻ: `defHash(definition, statement)` băm **cả**
  `statement`. Đưa `shape` vào đó thì **ba loại lệch tự phân biệt, không một
  dòng code so sánh nào**: code trong khối đổi ⇒ `stale`; `shape` trong YAML đổi
  ⇒ `definition_changed`; code lệch thật bản vẽ ⇒ `failing`. Đó đúng là phân
  biệt "sửa code giữ hợp đồng" với "sửa hợp đồng".

  Cạm bẫy đã trả giá ngay trong chặng: ba probe dogfood đầu tiên chỉ `grep` TÊN
  hàm, nên đổi chữ ký mà giữ tên thì bản vẽ vẫn xanh — bản vẽ nói dối mà chính
  cơ chế chống nói dối không bắt được. Siết thành khớp nguyên chữ ký, kiểm ngược
  bằng cách thêm một tham số: probe đỏ đúng như phải thế.

- **Task không đủ để giao việc cho một agent.** `context_contract.must_read` đưa
  agent một danh sách ĐƯỜNG DẪN rồi bắt nó mở cả file: với một design mười bản
  vẽ, agent đọc cả mười để dùng hai, tám cái còn lại là nhiễu mà nó vẫn suy diễn
  theo. `consumes` khai địa chỉ bản vẽ (`D-010/A-x`, cùng khuôn địa chỉ với
  `M-intent/V-intent-smoke`) và brief bơm thẳng `shape` — **hợp đồng, không phải
  file**; có test riêng khẳng định brief KHÔNG in shape của bản vẽ khác cùng
  design. `produces` là vế ngược, và nhờ hai trường đó câu "bước sau là task
  nào" **suy được**, nên không có trường `next` khai tay.

  Cộng khối `agent` (persona, objective, steps, self_check, guardrails, tools)
  và `Task.role` (`design`/`build`). Vai `design` không cần hook mới: `touches`
  rỗng cộng một tiêu chí `kind: artifact` trỏ file design làm `taskBoundary`
  khác rỗng mà không chứa dòng code nào. `tools` khai được nhưng brief **tự khai
  là không cưỡng chế được** — tool sinh sub-agent không nhận allowlist từ ganas.

- **Vòng đời: dọn dàn giáo, giữ hàng rào.** Task `done` thuộc phạm vi
  `status: delivered` archive được ngay, không đợi `--older-than`; `ganas prune
  --scope P-x` quét đúng một phạm vi vừa release. Ngữ nghĩa lọc chốt theo CODE:
  `Task.scope` và `Proposal.scope` đều bắt buộc nên lọc được, còn file icebox
  theo tháng và ephemeral thì bị LOẠI HẲN chứ không im lặng dọn kèm.

  **Design thì không bao giờ archive** — ý định ban đầu có, và đã bỏ sau khi cài
  ra: đường DUY NHẤT để một design thành `superseded` là được design khác khai
  `supersedes`, mà archive nó lại làm chính luật `spine/design-missing-supersede`
  báo lỗi. Muốn chạy thật thì loader cộng ba validator phải cùng biết một tập
  "đã archive" — hai bản đồ song song, đúng thứ repo này tránh. Bất biến đó nay
  là một test: kế hoạch dọn không được nhắc tới `designs/`.

- Lệnh mới `ganas design [list|new|show|check]`; 11 luật validate mới; mã chẩn
  đoán tĩnh 62 → 69. Bộ test 838 → 911.

## v1.0.0 — 2026-08-25

- **Sơ đồ khối thôi là niềm tin có cấu trúc.** Lần chẻ bản đồ ở bản trước để
  lại một trạng thái mà `ganas debt` chỉ ra được nhưng không ai chữa: **14 cạnh,
  không cạnh nào có bằng chứng `kind: contract`**, và không khối nào khai
  `contract.inputs`/`outputs` — tất cả để rỗng mặc định. `depends_on` chỉ khai
  THỨ TỰ; nó không nói output khối nguồn có phủ được input khối đích không. Một
  sơ đồ đủ cạnh vẫn có thể là sơ đồ chưa ai kiểm.

  Nay, đo trên HEAD: **22 khối, 4 phạm vi, 94 cạnh — cạnh nào cũng `hợp đồng ✓`**,
  và `ganas trace` in *"Không có nợ kiểm chứng nào trong sơ đồ"*. Cổng khai bằng
  chính chữ ký thật của hàm được export: 228 cổng đầu ra và 361 cổng đầu vào
  trong `.ganas/modules/`. `portIssues()` so `shape` **khớp từng ký tự**, nên
  chữ ký trong code đổi mà YAML không đổi thì cạnh đỏ — đó là toàn bộ giá trị
  của việc khai, và cũng là lý do không được khai một nửa cho đẹp bảng.

  Chép tay vài trăm cổng thì lệch là chắc chắn, nên bảng cổng do **máy sinh**:
  `scripts/gen-ports.mjs` đọc chữ ký bằng TypeScript compiler API — đúng bộ kiểm
  mà `npm run typecheck` dùng — rồi in ra khối YAML để người dán. Script cố ý
  KHÔNG ghi đè file, vì nó mù với import động và namespace import: dán nguyên
  bản máy sinh sẽ xoá mất cổng đang có.

  Lần thử đầu tiên thất bại, và cách nó thất bại đáng ghi lại: khai đủ cổng cho
  một cạnh ĐƠN thì cơ chế chạy đúng (làm lệch một `shape` thì cạnh đỏ như mong
  đợi), nhưng `portIssues()` duyệt TOÀN BỘ `inputs` của khối đích và đòi khối
  nguồn xuất hết — nên khối có từ hai phụ thuộc trở lên, tức phần lớn khối ở
  đây, thì mọi cạnh đều trượt. Hai đường vòng đều bị loại: `optional: true` làm
  vòng lặp bỏ qua input, để lại một cạnh rỗng ruột; khai một nửa số cổng thì
  `contract.inputs` nói dối về khối. Contract đã khai được **hoàn nguyên**, đồ
  thị giữ 14 cạnh trần — trạng thái trung thực — cho tới khi phép kiểm được chẻ
  làm hai tầng: từng cạnh kiểm **GIAO**, toàn sơ đồ kiểm **PHỦ**
  (`uncovered-port`).

- **`depends_on` lệch khỏi import thật, và hai chu trình sống nhiều tuần dưới
  một `ganas validate` sạch không một lỗi.** `computeDebt` chỉ kiểm cạnh ĐÃ
  KHAI, nên cạnh không khai thì không sinh nợ — bản đồ càng thiếu càng trông
  sạch, chiều khuyến khích đang ngược. Ba cạnh sai lộ ra trong lúc khai hợp
  đồng, cả ba đều im lặng: `M-fsprobe → M-util` và `M-cli → M-commands` sai
  chiều, `M-render → M-workflow` lỗi thời từ lần một file đổi khối.

  `test/module-deps.test.ts` nay đối chiếu `depends_on` với import thật **hai
  vế** — cạnh khai mà code không có là cạnh chết, cạnh code có mà không ai khai
  là chu trình vô hình — và giữ phần chưa khai trong một **tập đóng** phải khớp
  từng dòng. Tập đó lên đỉnh **74 dòng** rồi về **0**.

  Áp bảng cổng sinh bằng máy làm lộ hai chu trình có thật mà bản đồ đang giấu:
  `{M-graph-read, M-load, M-verify}` và `{M-hook-io, M-hook-policy}` — cái sau
  sinh ra từ chính lần chẻ khối trước đó. Cắt bằng hai nước rẻ nhất: đưa kiểu
  `HookInput`/`HookOutput` về lõi (kiểu biến mất sau khi biên dịch, nên chuyển
  nó xuống là xong, luồng chạy không đổi), và tách khối lá `M-graph-base`. Rồi
  chu trình **suy từ import thật** thành lỗi `spine/module-cycle-code` của
  `ganas validate`, kèm gợi ý chỉ thẳng vào cạnh chỉ mang `import type` để cắt.

  Cái giá của lần cắt đó không bị để trôi mà được ghi thành đề xuất rồi dọn:
  bốn file ở hai phạm vi khác vẫn nhập `LEDGER_FILE`/`LedgerResult` qua ba dòng
  tái xuất của `verify/ledger.ts`, giữ sống hai cạnh không còn lý do nào đỡ. Dọn
  hết người dùng trước, gỡ tái xuất sau.

- **Đề xuất là thực thể, không phải một đoạn văn trong sổ phiên.** Một hướng đi
  agent nghĩ ra giữa phiên trước đây không có chỗ nào để đậu: hoặc bịa thành
  Task — giả vờ đã có người quyết — hoặc mất theo context. Nay `.ganas/proposals/`
  là thực thể đủ vòng đời: `zProposal` có schema, loader và luật validate riêng
  (`spine/proposal-missing-target`, `spine/proposal-duplicate-target`,
  `spine/proposal-cycle`, `spine/proposal-missing-supersede`,
  `scope/proposal-scope-not-found`, `knowledge/proposal-problem-equals-change` —
  chép cùng một câu vào cả `problem` lẫn `change` là dấu hiệu chưa tách rời hai
  thứ — và `knowledge/proposal-repeats-rejected`).

  Lệnh `ganas proposal new | list | show | approve | reject`. `list` tự sắp theo
  `weight` + `ease`, vì đó là chỗ DUY NHẤT hai trường đó được đọc. `approve` trỏ
  `promoted_to` sang task sinh ra từ đề xuất, đúng như lời lệnh tự hứa.

  Vế cưỡng chế: **một hook chặn model tự đặt `status: approved`**. Duyệt là
  quyết định của người; thiếu lớp này thì "đề xuất" chỉ là một cách dài dòng để
  agent tự cho phép mình.

  Brief in **một dòng** đếm đề xuất pending cùng phạm vi, cố ý không in nội
  dung — nội dung thì `ganas proposal show` có, còn mỗi phiên đều phải trả
  context cho những dòng đó.

- **`existsSync` rải rác thành một công cụ dùng chung, và nhãn `nature` có test
  canh.** Luật kiến trúc nói lõi không được chạm I/O, nhưng gần như mọi hàm
  nghiệp vụ đều có lúc phải hỏi *"chỗ này có tồn tại không"* — luật im về chỗ đó
  thì nó tự mâu thuẫn, và cái tự mâu thuẫn thì không ai áp được.
  `.claude/rules/architecture.md` nay tách rõ: tra trạng thái (`existsSync`,
  `stat`, `readdir`) là **CÔNG CỤ**, dùng nó không làm hàm gọi nó thành `io`;
  đọc/ghi NỘI DUNG, sinh tiến trình con, stdin/stdout, network, DB thì vẫn là
  `io`, bọc đẹp đến đâu cũng vậy. Ranh giới nằm đúng đó vì nó là ranh giới của
  việc TEST. Luật được viết vào cả file luật lẫn template `ganas init` phát cho
  dự án khác.

  Nới lỏng chỉ có nghĩa khi kèm điều kiện: công cụ phải nằm MỘT chỗ, nếu không
  "công cụ" chỉ là tên gọi khác của "gọi thẳng". Chỗ đó là `src/util/fsprobe.ts`
  (`exists`, `existsAsync`, `listDir`, `mtimeMs`), và `test/fsprobe.test.ts` giữ
  danh sách file được phép tra thẳng.

  Cả bản đồ được rà bằng script đếm hàm `node:fs` / `child_process` /
  `process.std*` **thật sự được gọi** trong từng file, không đoán bằng mắt. Quá
  nửa số cảnh báo biến mất dưới luật mới; phần còn lại là chỗ trộn thật, và chữa
  bằng chẻ khối chứ không bằng đổi nhãn — đề xuất đổi `M-hooks` sang `nature: io`
  đã bị **từ chối** vì nó đi tìm nhãn vừa với chỗ trộn thay vì sửa chỗ trộn.
  `src/hooks/` chẻ thành `M-hook-policy` (quyết định thuần) và `M-hook-io`;
  `boundary.ts` và `search.ts` rời `M-workflow` sang khối lõi `M-cli-core`.

  `test/module-nature.test.ts` nay đối chiếu nhãn `nature` đã khai với I/O thật
  trong `paths` của khối. Danh sách miễn trừ của nó **rỗng**.

- **Tài liệu vùng nằm trong thư mục của khối.** Luật `agent-guide.md` ở v0.6.0
  đã nói thông tin riêng một vùng phải nằm cạnh code, nhưng không gì sinh ra hay
  canh việc đó — và một luật không ai canh thì chỉ đúng ở chỗ nó được viết. Nay
  `ganas scope new` sinh sẵn khung (`moduleGuideMd`) cho khối mới, và
  `ganas validate` có hai cảnh báo mức warning: `scope/module-missing-guide`
  (khối chưa có tài liệu vùng) và `scope/module-paths-overlap` (hai khối chung
  một vùng code). Ranh giới lấy từ `paths` của khối, không lấy từ cảm tính. Bản
  này thêm tám tài liệu vùng trong `src/`.

  Cạm bẫy đã trả giá một lần: chẻ một thư mục thành hai khối làm **mồ côi** file
  hướng dẫn của thư mục đó — `src/hooks/CLAUDE.md` không khối nào nhận, nên
  không task nào commit được nó bằng `ganas commit`. Chẩn đoán đầu tiên đổ lỗi
  cho `moduleGuideDir`; sai, thứ đó hành xử đúng thiết kế. Lỗi là chẻ nửa vời:
  tách hai khối nhưng để chung một thư mục, nên không khối nào NHẬN thư mục.
  Chữa bằng chẻ **thư mục** theo ranh giới khối (`src/hooks/policy/`,
  `src/hooks/io/`), mỗi khối một tài liệu vùng.

- **`ganas commit` chấm lại `exit_contract` trên CÂY SẮP COMMIT, đỏ thì không
  commit.** `ganas gate` chạy trên working tree, còn `ganas commit` chỉ stage
  file trong ranh giới của task. Hai tập đó khác nhau, và chênh lệch giữa chúng
  đã sinh ra một commit không biên dịch được: file trong ranh giới phụ thuộc một
  file NGOÀI ranh giới đang sửa dở — working tree có đủ cả hai, commit thì
  không. Phải amend tay mới gỡ được. Đây đúng lớp lỗi *"xanh ở máy tác giả, đỏ ở
  mọi máy khác"* mà ganas tồn tại để chặn.

  Nay `commit` dựng cây bằng `git write-tree` + `git archive` — chỉ đọc index,
  không đụng working tree, khác `git stash --keep-index` ở chỗ đó — rồi chấm lại
  `exit_contract` trên chính cây ấy. Đỏ thì file task được trả về nguyên trạng
  (đánh dấu done là nói dối), nhưng index **giữ nguyên**: sửa xong chạy lại là
  đi tiếp, không phải stage lại từ đầu. Cửa thoát có, kèm giá ghi rõ trong thông
  báo: `ganas commit <id> --no-recheck`.

  Phép chấm lại chỉ mạnh bằng `exit_contract` của task, nên thêm trường
  `config.build_check` — một lệnh kiểm toàn dự án chạy trên cây stage. Nó so với
  **MỐC**, không so với "xanh": chỉ chặn khi HEAD xanh mà cây stage đỏ, tức khi
  commit này làm gãy thứ đang lành. Bản đòi cây stage phải xanh đã bị loại vì
  kẹt cứng ba chỗ — HEAD đỏ sẵn thì cả đội không commit được gì, dự án cũ chưa
  bao giờ sạch thì không commit nổi commit đầu, lệnh chập chờn thì kẹt ngẫu
  nhiên. Mọi trường hợp không kết luận được là `skipped`, không phải đỏ.

- **Cảnh báo "file ngoài ranh giới" thôi im.** Chẩn đoán đầu tiên sai — tưởng
  thiếu cảnh báo. `outsideBoundary()` vốn đã có, và vốn được cả `gate` lẫn
  `commit` gọi; nó chỉ hỏi nhầm nguồn: danh sách file đã sửa lấy từ **sổ phiên**
  (`touchedPathsFor`), nên rỗng khi chạy không có `--session` và cả khi
  `bindSession` đã thay bản ghi. Một cảnh báo gần như luôn im thì tệ hơn không
  có cảnh báo, vì nó làm người ta tin là đã kiểm. Nay nguồn sự thật là
  `git status` trên toàn cây — đúng cách `commit.ts` đã dùng sẵn cho `.ganas/`.

- **`ganas prune` thôi archive task mà đề xuất đang trỏ `promoted_to` tới.**
  Tầng archive gom `blocked_by`/`promoted_to` từ task, và bỏ qua proposal. Dời
  24 task done làm bảy tham chiếu thành treo, `ganas validate` từ 0 lên 7 lỗi —
  trong khi prune báo đã dọn xong, và `--dry-run` cũng không cảnh báo. Đã hoàn
  lại rồi vá đúng chỗ hẹp: tập tham chiếu nay đếm cả `promoted_to` của đề xuất.
  Chạy lại cùng lệnh đó: validate 0 lỗi, bảy task được giữ lại đúng như mong đợi.

- **Lệnh trượt in được thân xác.** `judge()` chỉ đính `stderr` vào lý do thất
  bại, mà `npm test` báo lỗi ra `stdout` — nên một lệnh đỏ chạy trong tiến trình
  con của ganas chỉ nói `thoát với mã 1`, không để lại gì để truy. Đó là lý do
  ba lần `npm test` đỏ chập chờn bên trong `gate`/`commit` không truy được
  nguyên nhân, và một trong ba lần làm `ganas commit` từ chối nhầm một task đã
  xanh. Nay `stderr` rỗng thì lấy **đuôi `stdout`**, và cả hai đường đều bỏ dòng
  trống với khung ngăn xếp `at ...` trước khi cắt: giữ chúng lại thì hạn mức
  dòng bị khung ngăn xếp ăn hết, đúng phần người đọc cần — tên ca đỏ, câu
  assert — bị đẩy ra ngoài.

- **Ba probe nghiệm thu luồng ghép thôi chạy `npm test`.** Ba phạm vi khai lệnh
  nghiệm thu luồng ghép là `npm test`, một lệnh chung chung. Vấn đề không phải
  thiếu độ phủ mà là **bản ghi nói quá**: `npm test` đỏ không chứng minh gì về
  luồng ghép của riêng phạm vi đó, vì hàng trăm test khác cũng làm nó đỏ. Nay
  mỗi phạm vi một test e2e riêng — `test/e2e-cli.test.ts`, `test/e2e-hook.test.ts`,
  `test/e2e-graph-core.test.ts` — chạy luồng thật trên một dự án tạm, và kiểm cả
  **chiều phải-đỏ**: gate phải báo đỏ TRƯỚC khi tiêu chí thật sự đạt, không phải
  chấm một tiêu chí đã xanh sẵn.

- **Sổ cái xác minh ghi dưới khoá.** `appendEntry` ghi `.ganas/verify-ledger.jsonl`
  không khoá, mà chuỗi hash của sổ cái chính là thứ chứng minh nó không bị sửa
  tay. ganas thì chủ động khuyến khích chạy sub-agent song song: hai `ganas verify`
  chồng nhau có thể làm đứt chuỗi. Chưa gãy lần nào — nhưng đó là may, không
  phải an toàn.

  `withFileLock` đang nằm trong `M-claim` (phạm vi `P-hook`), nên dùng lại nó
  sẽ bắt lõi đồ thị phụ thuộc ngược lên vỏ. Dựng khối nền `M-lock`
  (`src/util/lock.ts`) làm chỗ DUY NHẤT khoá mutex quanh một lượt đọc-sửa-ghi
  file dùng chung; `M-claim` bỏ bản riêng và nhập từ đó. Không nới vai
  `M-fsprobe` cho việc này, vì nó tự khai là chỗ duy nhất TRA TRẠNG THÁI — mà
  khoá thì tạo và xoá file.

- **Hai chỗ vá cùng một lớp lỗi: thứ có trong schema mà không code nào đọc.**
  `zUrlAnchor` có trường `quote` mà `formatAnchor` chưa bao giờ in — đúng chỗ
  đau nhất để bỏ sót, vì lý do anchor URL bắt buộc `fetched_at` là web đổi, và
  thứ duy nhất còn lại khi trang đã đổi chính là `quote`. Nay trích dẫn hiện ra,
  và `validate` nhắc `knowledge/url-anchor-without-quote` khi thiếu.

  Còn chính cái guard sinh ra để bắt lớp lỗi đó thì chưa bao giờ soi tới
  `zConfig`: regex trích tên trường đòi đúng 4 dấu cách thụt lề, mà `zConfig`
  khai ở cấp cao nhất nên trường của nó thụt 2 — chín trường lọt lưới, và guard
  vẫn xanh. Vá đi kèm nới luật cho **đường đọc gián tiếp** (`READ_VIA`), nếu
  không nó đẻ hai báo sai: `enforcement` và `enforcement_rules` không ai đọc
  trực tiếp ngoài `src/model/`, nhưng chúng được đọc qua accessor công khai
  `enforcementFor()`.

- **Thay đổi phá vỡ tương thích với 0.6.0.** Bề mặt lệnh và schema `.ganas/`
  chỉ được THÊM: `git diff v0.6.0..HEAD` trên `src/cli.ts`, `src/model/config.ts`
  và `docs/COMMANDS.md` không có một dòng xoá nào, và `build_check` là trường
  `optional`. Hai chỗ vẫn phá, cả hai là **hành vi** chứ không phải cú pháp:

  1. `spine/module-cycle-code` là **lỗi**, không phải cảnh báo. Dự án có chu
     trình import thật giữa các khối trước đây `ganas validate` sạch, nay đỏ.
     Không có cờ tắt — chữa là cắt chu trình. (Mọi mã lỗi mới khác trong bản này
     đều nằm trên thực thể `proposal`, vốn chưa tồn tại ở 0.6.0, nên không dự án
     nào đang chạy có thể vấp phải.)
  2. `ganas commit` **từ chối** khi `exit_contract` đỏ trên cây đã stage — cùng
     một cây đó ở 0.6.0 vẫn commit được. Cửa thoát:
     `ganas commit <id> --no-recheck`.

## v0.6.0 — 2026-08-21

- **Luật tag thôi mô tả sai chính repo này.** `.claude/rules/ganas-git.md` khai
  *"ganas dùng đúng cách này [`<tên>--vX.Y.Z`] cho chính repo ganas"* — sai, và
  sai ngược cả lịch sử của chính nó: `ganas--v0.1.0` từng tag nhầm rồi đổi lại
  thành `v0.1.0` từ v0.1.1, mọi tag từ đó tới nay đều trần. Một luật mô tả sai
  thực tế tệ hơn không có luật: người đọc làm theo rồi phải quay lại sửa tag đã
  push.

  Nay luật nói đúng thứ kiểm được trong repo: entry marketplace khai
  `source: ./plugin`, nên version phân giải từ `plugin/.claude-plugin/plugin.json`
  chứ không từ tag — kể cả khi dự án CHÍNH LÀ một Claude Code plugin. Thêm một
  đoạn chỉ đường: đừng gõ tay `git tag`, để lệnh nâng version tạo tag, cho số
  hiệu trong code và tag không thể lệch nhau. Có test chặn bản khai sai quay lại.

- **Version thôi có bốn nguồn sự thật.** Số hiệu đang được khai độc lập ở
  `package.json`, `package-lock.json`, `plugin/.claude-plugin/plugin.json` và
  tiêu đề `CHANGELOG.md`, cộng một chỗ thứ năm nhúng lúc build
  (`__GANAS_VERSION__` trong `plugin/dist/*`) — mà **không lệnh nào bắt chúng
  khớp**. Lệch thì im lặng: bản cài qua marketplace vẫn chạy, chỉ khai sai số,
  nên người báo lỗi báo kèm một version không tồn tại.

  Nay `package.json` là nguồn duy nhất. Chỗ suy được thì **sinh ra**: manifest
  plugin do `release/version.mjs sync` ghi (và `scripts/build.mjs` gọi nó mỗi
  lần build, nên nó không thể trôi sau một bản ship), bundle do build nhúng.
  Chỗ không suy được vì người viết — tiêu đề CHANGELOG — thì để mục
  **`## Chưa phát hành`** trong lúc làm, và `npm version` tự đổi tên nó thành
  `## vX.Y.Z — <ngày>`. Không còn quãng nào mà lệch là "hợp lệ".

  Lệnh vận hành và lớp cưỡng chế của nó nằm chung một thư mục `release/`, kèm
  `release/CLAUDE.md` mô tả bất biến và cạm bẫy của vùng:
  `npm run release -- bump minor` là đường DUY NHẤT để nâng version — nó chạy
  test, đồng bộ, build, rồi tạo commit và tag `vX.Y.Z`.
  `release/version.test.ts` chạy trong `npm test` và bắt cả trường hợp khó
  nhất: bump rồi **quên `npm run build`**, khiến bundle đã ship vẫn in số cũ.
  Đo thật: sửa `package.json` lên `0.6.0` mà chưa làm gì khác thì năm test đỏ.

- **Tên file hướng dẫn cho agent thôi bị đóng cứng là `CLAUDE.md`.** `ganas
  init` trước đây luôn ghi cả `CLAUDE.md` lẫn `AGENTS.md`, với hai nội dung
  khác nhau và không gì giữ chúng khớp. Hai hệ quả thật: người dùng Codex nhận
  một `CLAUDE.md` mà Codex **không bao giờ đọc**, và hai file hướng dẫn song
  song thì bản sai luôn là bản không ai đọc.

  Nay `harness` trong `.ganas/config.yaml` quyết định luôn tên file: `CLAUDE.md`
  cho `claude-code`, `AGENTS.md` cho `codex`/`cursor`/`zed`/`windsurf`,
  `GEMINI.md` cho `gemini`. Enum `HARNESS` được bổ sung `codex` và `gemini` —
  `codex` trước đây **thiếu hẳn**. Thêm cờ `ganas init --harness <tên>`; tên
  ngoài danh sách thì báo lỗi chứ không đoán.

  Không chọn `AGENTS.md` làm chuẩn chung, dù nó là tên nhiều công cụ đọc nhất,
  vì cơ chế nạp **không giống nhau**: Claude Code chỉ tự tìm `CLAUDE.md` và
  `CLAUDE.local.md` — không đọc `AGENTS.md` ở bất kỳ cấp thư mục nào, kể cả
  thư mục con, là đúng chỗ luật mới cần nó nhất; Zed lấy FILE ĐẦU TIÊN khớp
  trong danh sách fallback nên `AGENTS.md` có thể bị bỏ qua im lặng; và luật
  ghép cũng khác nhau (Codex/Cursor: file gần hơn ĐÈ; Claude Code/Gemini: NỐI
  vào nhau). Bằng chứng từng dòng nằm ở claim `C-002`, có URL và `fetched_at`.

  Khi tên file chính không phải `AGENTS.md`, `init` ghi thêm một `AGENTS.md`
  **cửa trỏ** dài bốn dòng — cố ý không chép nội dung, chỉ để agent đọc
  `AGENTS.md` tìm ra file thật thay vì kết luận dự án không có hướng dẫn.

- **Hai luật mới, phát kèm `ganas init` như ba luật cũ.**

  `.claude/rules/naming.md` — nói tiếng Việt, viết code tiếng Anh. Định danh
  (biến, hàm, file, cột DB, khoá JSON, nhánh git) bằng tiếng Anh; comment, tài
  liệu, commit message, chuỗi hiển thị và mọi văn bản trong `.ganas/` bằng
  tiếng Việt có dấu. Lý do là mất thông tin, không phải thẩm mỹ: `thuoc` có thể
  là thuốc, thước hay thuộc, và đoán sai thì **không có lỗi nào nổi lên**.

  `.claude/rules/agent-guide.md` — file hướng dẫn ngắn ở gốc, đặt gần code.
  Thông tin riêng một vùng nằm trong file hướng dẫn của chính thư mục đó (đúng
  vai `README.md` ngày xưa), ranh giới lấy từ `paths` của khối trong
  `.ganas/modules/`. Nhồi hết vào file gốc là đường sinh ảo giác: chữ ở đó
  không có anchor, không có `last_verified_at`, không hook nào bắt nó phải còn
  đúng — mà Codex còn cắt cứng ở 32 KiB và Windsurf ở 12.000 ký tự, **cắt im
  lặng**. Luật này tự khai là **không có hook cưỡng chế**, giống
  `architecture.md`.

## v0.5.0 — 2026-08-18

- **`ganas id` thôi cấp trùng số cho hai phiên song song.** Lệnh này trước đây
  chỉ tính số lớn nhất trong graph rồi +1 và in ra, không giữ chỗ gì cả — hai
  phiên gọi gần như đồng thời nhận **cùng một** `T-017`, phiên ghi file sau
  **ghi đè âm thầm** lên file phiên trước, và `load/duplicate-id` không bắt
  được vì trên đĩa rốt cuộc chỉ còn một file. Đây là mất dữ liệu, không phải
  phiền toái.

  Nay mỗi số ứng viên đi qua `reserveId()`, dùng lại nguyên cơ chế
  `open(file, "wx")` + TTL đã phục vụ claim task: nguyên tử ở tầng
  filesystem, hai tiến trình gọi cùng lúc thì chỉ một cái thắng. Ứng viên
  đang bị giữ thì bị nhảy qua. Đo thật: sáu tiến trình `ganas id task` chạy
  đồng thời cho ra sáu số khác nhau.

  Khác claim task một điểm cố ý: cùng một phiên gọi lại **không** nhận lại id
  cũ. Claim là quyền sở hữu một thứ đã tồn tại, đặt chỗ id là tiêu thụ một
  con số — cấp lại cho ai thì cũng là cấp trùng. (Không có đường nào trong
  repo truyền `--session` cho `ganas id`, nên nếu giữ ngữ nghĩa "cùng phiên
  thì giữ tiếp" thì mọi lời gọi thật đều rơi vào chung một danh tính và bản
  vá sẽ vô hiệu đúng chỗ nó cần có tác dụng.)

  Vá thêm một nguồn cấp trùng khác, tinh vi hơn: số kế tiếp trước đây chỉ
  tính trên id đã qua được zod, nên một file thực thể **hỏng schema** (thiếu
  trường bắt buộc) hoặc **hỏng cú pháp YAML** khiến id của nó **vô hình** với
  bộ cấp số — `ganas id task` cấp lại đúng `T-001` đang nằm trên đĩa. Agent
  ghi vào thì hook `PreToolUse` từ chối (file đã tồn tại), chạy lại `ganas id`
  vẫn ra `T-001`: kẹt vòng lặp không lối ra, không mất dữ liệu nhưng không ai
  nói cho agent biết nguyên nhân thật. Nay số kế tiếp tính trên hợp của id
  trong graph **và** id đã khai trên đĩa (kể cả trong file hỏng) — chỉ lấy
  `id` ở tầng trên cùng của mỗi bản ghi, cố ý không duyệt sâu vào các trường
  tham chiếu (`serves`, `blocked_by`, ...), để một tham chiếu treo tới
  `T-900` không thổi max lên 900.

- **Hook từ chối `Write` ghi đè file thực thể `.ganas/` đã tồn tại.** Lớp thứ
  hai, bắt đúng khoảnh khắc mất dữ liệu bất kể id tới từ đâu — kể cả id bịa
  tay hay lấy lại từ context cũ sau compact. Chỉ áp cho `Write`; `Edit` sửa
  file có sẵn vẫn cho qua, và thông điệp từ chối trỏ thẳng sang `Edit`. Không
  theo cờ `warn`/`enforce`: thứ bị đe doạ là dữ liệu, không phải thói quen.

  **Giới hạn đã biết:** `.ganas/.locks/` là `LOCAL_ONLY` nên lớp đặt chỗ chỉ
  chống đua trên **cùng một máy**. Lớp 2 thì chỉ tồn tại bên trong Claude Code
  có cài plugin — không phải vì ganas không đọc được `.locks` từ terminal (lớp
  1 chạy đầy đủ ở đó), mà vì ghi file bằng editor hay `cat >` không đi qua
  điểm chặn nào cả.

  Và lớp 2 **không đọc `.locks`** — nó chỉ hỏi file đã tồn tại chưa. Nên nếu
  một phiên ghi vào id mà phiên khác đang đặt chỗ (id bịa tay, hoặc lấy lại từ
  context cũ) thì cú ghi đó được cho qua, còn chủ đặt chỗ hợp lệ mới là người
  bị chặn sau đó. Không mất dữ liệu — nhưng đúng ra người bị chặn phải là kẻ
  chiếm chỗ. Vá được điều này đòi `session_id` của hook và danh tính ghi trong
  file đặt chỗ khớp nhau, mà hiện không đường nào truyền `--session` cho
  `ganas id`.

- **`ganas search` — BM25 trên fact, cộng gợi ý tự động trong brief.** Lời hứa
  số 2 của README ("phiên sau không phải khám phá lại những gì phiên trước đã
  kiểm chứng được") trước nay chỉ giao được qua `context_contract.facts` —
  một mảng id khai tay. Task không khai id thì fact không bao giờ tới tay
  phiên sau, dù cùng phạm vi và liên quan trực tiếp; đường duy nhất còn lại
  là grep YAML. Khoảng cách nằm ở GIAO HÀNG, không ở việc ghi.

  BM25 hợp bất thường ở đây vì `loadGraph` vốn đã nạp toàn bộ fact vào bộ
  nhớ: chấm điểm chỉ là duyệt lại đúng `Map` đó — không đọc thêm file, không
  dependency mới. Tokenizer bóc dấu tiếng Việt (kể cả `đ`, thứ NFD không tách
  được) và tách cả đường dẫn/id thành mảnh con, nên tra theo tên file cũng
  trúng.

  Brief in tối đa **3** fact cùng phạm vi mà task không khai tay, mỗi fact một
  dòng **kèm nhãn độ tươi**, và mục biến mất hoàn toàn khi không có gì vượt
  ngưỡng — không tiêu đề rỗng. Ngưỡng là "khớp ít nhất 2 từ truy vấn khác
  nhau", không phải một mốc điểm tuyệt đối: điểm BM25 không chuẩn hoá nên mốc
  cứng sẽ vỡ khi kho fact to lên hay nhỏ đi.

  Mọi kết quả PHẢI nói độ tươi, dùng `computeFreshness` sẵn có. Một cỗ máy
  tìm kiếm trả về fact đã mục mà không nói nó mục thì chỉ là máy phát ảo giác
  tốc độ cao.

  **Giới hạn đã biết:** chỉ index fact, không index claim/decision — ràng
  buộc "phải nói độ tươi" không áp được cho hai loại đó. Và khớp theo đường
  dẫn nghĩa là task sửa trong `src/pay/` sẽ thấy fact về `src/pay/` kể cả khi
  nội dung không liên quan; dòng `khớp:` nói rõ nó khớp bằng gì để người đọc
  tự trừ hao.

- **Một bản ghi hỏng schema không còn làm rụng CẢ FILE facts/claims/decisions
  khỏi graph.** `collectArray` trước đây parse cả mảng bằng một lời gọi
  `safeParse` với schema cấp file — một fact thiếu `scope` giữa file khiến
  `safeParse` fail cho toàn mảng, và MỌI fact khác cùng file (kể cả đã kiểm
  chứng xong) biến mất khỏi `graph.facts` mà `ganas validate` chỉ in một dòng
  lỗi schema, không nói "bạn vừa mất N bản ghi". Tri thức đã kiểm chứng rụng
  im lặng khỏi brief, `ganas search`, và mọi validator chéo.

  Nay mỗi phần tử được `safeParse` RIÊNG: phần tử hỏng bị loại một mình, phần
  còn lại của file vào graph bình thường. Path lỗi của zod được gắn tiền tố
  chỉ số phần tử (`[index, ...issue.path]`) trước khi tính số dòng, nên
  diagnostic vẫn trỏ đúng vùng của phần tử hỏng thay vì luôn báo về đầu file.

- **Sổ icebox — việc đã quyết CHƯA làm.** Một phát hiện giữa phiên (đọc code
  thấy vấn đề, nhưng không nằm trong phạm vi task đang chạy) trước nay chỉ có
  hai lối: chẻ ngay thành Task cho đủ bộ — bịa `serves`/`implements`/
  `exit_contract` để hợp lệ hoá một việc chưa ai duyệt — hoặc nói miệng rồi
  mất theo context. Không lối nào đi vào repo. Đây là lời hứa số 2 của README
  ("phiên sau không phải khám phá lại những gì phiên trước đã kiểm chứng
  được") thủng đúng ở loại tri thức ganas sinh ra nhiều nhất: nhận định về
  chính source code.

  Thiết kế: **hai sổ tách nhau** cho hai câu hỏi khác nhau. "Giới hạn đã biết"
  của một fact đã có sẵn đường đi — không cần thực thể mới: probe khẳng định
  "vấn đề VẪN CÒN" gắn `ttl_days`, ai sửa code thì lần verify sau probe trượt
  và brief tự nói phát biểu đang SAI. Nhưng "việc nên làm mà chưa tới lượt"
  không có chỗ nào chứa — icebox là thực thể nhẹ mới, lặp lại đúng khuôn
  Claim (nhẹ, chưa kiểm chứng) → Fact (nặng, đã kiểm chứng): `Task` không đổi
  một dòng nào để dựng khuôn này.

  Vì sao không nới `Task` thay vì thêm thực thể mới: bốn bất biến
  `serves`/`implements`/`scope`/`exit_contract` là cột sống của mọi thứ đọc
  `Task` — `select`, `brief`, `gate`, `commit`. Nới chúng thành tuỳ chọn có
  điều kiện nghĩa là cả bốn nơi đó phải tự xử thêm một nhánh rỗng, và sót một
  chỗ là một việc chưa quyết gì cả lọt vào hàng chờ giao cho phiên thật — coi
  như nó đã được duyệt trong khi chưa ai duyệt.

  Điểm hai trục (`weight`/`ease`) lần đầu vào được YAML thay vì hardcode
  trong `src/debt.ts` theo mã chẩn đoán — icebox mang điểm ngay trên bản ghi
  của chính nó.

  Hết hạn xem lại là **đề xuất, không phải lệnh tự động dọn**: `ganas icebox
  review` liệt kê mục quá hạn, `close` bắt buộc kèm lý do, bản ghi giữ
  nguyên trên đĩa chứ không xoá. Vì sao không tự hết hạn: một mục hôm nay
  chấm `weight: 2` có thể thành `weight: 5` sau khi kiến trúc xung quanh đổi
  — nếu để tự động rụng, đúng lúc nó đáng nhìn lại nhất thì nó đã biến mất
  rồi.

  **Giới hạn đã biết:** điểm là người tự chấm, không probe nào kiểm được một
  phán đoán về việc chưa xảy ra — `why_deferred` và `anchors` bắt buộc chỉ
  làm lời khai soi được (ai đọc cũng thấy lý do và trỏ đúng chỗ), không
  cưỡng chế được lời khai đó đúng. Và `ease` của một mục icebox ("làm việc
  thật này khó đến đâu") không cùng thang đo với `ease` của một mã chẩn đoán
  trong `src/debt.ts` ("sửa lỗi sổ sách này khó đến đâu") dù hai thứ nằm
  chung một cột trong bảng `ganas debt`.

## v0.4.0 — 2026-08-14

- **`ganas debt` — xếp hạng nợ hai trục.** Nợ vốn nằm ở hai nguồn rời nhau và
  không cái nào chấm điểm: `validateGraph` trả `Diagnostic` (46 mã, chỉ sort một
  trục theo severity, chỉ trong lệnh `validate`) và `computeDebt` trả `DebtItem`
  (3 loại, không severity, không sort). Đọc xong không biết làm gì trước.

  Mỗi mục giờ chấm hai trục **cùng thang 1–5** rồi cộng: *quan trọng* (1 chỉ là
  thông tin · 5 mất dữ liệu, hỏng nền) và *dễ làm* (1 phải thiết kế lại · 5 sửa
  một dòng YAML). Tổng cao là làm ngay. Bảng lọc theo phạm vi của task vừa
  commit, phần còn lại gộp một dòng đếm — bám nguyên tắc đã có ở `postToolUse`:
  không bắt chịu trách nhiệm cho mọi lỗi sẵn có trong repo. `ganas commit` in
  bảng này sau khi commit thành công; `ganas debt --all` xem toàn dự án.

  Điểm là phán đoán của người viết luật, khai một lần. Guard grep `validate.ts`
  và `load.ts` bắt mọi mã tĩnh phải có điểm — thêm luật mà quên chấm thì test
  đỏ, không phải im lặng biến mất khỏi báo cáo.

  **Giới hạn đã biết:** guard bắt được điểm THIẾU, không bắt được điểm SAI. Điểm
  chấm sai thì im lặng mãi. Cách duy nhất là dùng rồi chỉnh.

- **`spine/decision-cycle`.** Design đã có luật chống chu trình `supersedes`,
  Decision thì chưa. Từ khi brief loại decision đã bị thay thế (v0.3.x), một
  chu trình khiến CẢ CỤM biến mất khỏi mục "không được đi ngược" — phiên làm
  việc không thấy một ràng buộc nào, và không dấu hiệu nào cho biết có thứ đã bị
  nuốt.

- **Cảnh báo khoá lạ trong `config.yaml`.** `zConfig` là schema duy nhất không
  `.strict()`, nên gõ `enforcment:` thiếu một chữ thì zod bỏ qua im lặng và dự
  án chạy không hàng rào trong khi người viết tin là đang cưỡng chế. Nay có
  cảnh báo `spine/config-unknown-key`, lấy danh sách khoá hợp lệ từ
  `Object.keys(zConfig.shape)` nên tự đúng theo schema. Field đã bỏ (`embedder`)
  có thông điệp riêng thay vì bị báo như khoá lạ vô danh.

- **Brief nói khi task hiện thực một Design đã `superseded`/`archived`**, kèm tên
  design đã thay thế nó nếu tra ngược được.

- **`computeFreshness` thôi spawn `git ls-files` cho mỗi target.** Đo được: 11
  target trước là 11 lần spawn, nay 1; kiểm lại từ ngoài với 41 target vẫn giữ
  nguyên số lần. Chạy ở mọi `SessionStart`.

## v0.3.0 — 2026-08-14

- **Cảnh báo file sửa ngoài ranh giới code của task** — `postToolUse` giờ ghi
  mọi đường dẫn phiên đã sửa vào `state.sessions[id].touched_paths`
  (`.ganas/state.json`, trần 200 đường dẫn khác nhau). `ganas gate` đối chiếu
  danh sách đó với `taskBoundary()` (`src/boundary.ts`) — CHÍNH ranh giới mà
  `ganas commit` đem đi `git add`, dùng chung một hàm — qua `outsideBoundary()`
  để tìm file lệch ra ngoài. File `.ganas/` không bao giờ bị báo (đã có
  `ownsGanasFile` lo); ranh giới rỗng (task không khai `touches` và
  `exit_contract` không nhắc đường dẫn nào) thì không kết luận gì, in một cảnh
  báo khác. `ganas gate` in khối `⚠`, `ganas gate --json` thêm field
  `outside_boundary`, và `ganas commit` in cùng cảnh báo ở cả ba đường ra
  (dry-run, commit thành công, và "không có gì để commit"). **Chỉ cảnh báo,
  không bao giờ chặn, không đổi mã thoát của lệnh nào.**

  Hai giới hạn đã biết:
  - Sửa file qua Bash (`sed -i`, `>`) chỉ dựng cờ `touched_at` chứ KHÔNG góp
    đường dẫn vào `touched_paths` — ganas cố ý không parse chuỗi lệnh shell để
    đoán file (sai nhiều hơn đúng). Những đợt sửa qua Bash vô hình với kiểm
    này.
  - `.ganas/state.json` là file local, không commit. Clone mới, máy thứ hai,
    hay phiên mở trước khi có tính năng này đều không có lịch sử
    `touched_paths` — kiểm này im lặng. Vắng cảnh báo không phải bằng chứng đã
    ở trong ranh giới.

- **`plan-to-tasks` dạy luật "tiêu chí phải ĐỎ lúc viết task"** — luật này vốn
  đã được cưỡng chế bằng máy (`recordBaseline` chụp baseline lúc `ganas next
  --session`, `alreadyGreen` đối chiếu lúc chấm gate), nhưng chỉ nổ ra SAU KHI
  task đã viết xong. Giờ nó được nói ngay ở chỗ chẻ task, kèm ca hay gặp nhất:
  task sửa bug mà tiêu chí là `npm test` — cả bộ test đang xanh sẵn nên tiêu
  chí đó không gác gì cả. `docs/CONCEPTS.md` mô tả cơ chế baseline tương ứng.

## v0.2.2 — 2026-08-09

Năm mục nhẹ còn lại của cùng đợt báo cáo đã vá ở `v0.2.1`. Cả năm đều được kiểm
chứng lại bằng source và chạy thử trước khi sửa — mục 5 hoá ra hẹp hơn báo cáo
mô tả (`--id` vốn đã tồn tại và đã có trong tài liệu).

- **`ganas verify` bóp méo được probe dạng bộ chạy test** — trước đây
  `mutateProbe` chỉ nhận `test -f`, `grep -q` và chuỗi trong nháy, nên
  `bun test <thư mục>`, `vitest`, `jest`, `pytest`, `go test`, `cargo test` đều
  trả `null` ⇒ **đa số probe của một dự án thật chỉ "đạt yếu"**: chạy pass nhưng
  chưa bao giờ chứng minh được là CÓ THỂ fail. Giờ nhận bộ chạy kèm đối số đường
  dẫn và bóp méo bằng đúng thủ thuật của `test -f` — nối `.ganas-mutant` vào
  đường dẫn. Cờ ăn giá trị (`-c`, `-k`, `-t`…) được liệt kê tường minh để cờ
  boolean (`-v`, `--lib`) không nuốt mất chính đường dẫn cần bóp méo. Bộ chạy
  **không** có đối số đường dẫn vẫn báo "chưa chứng minh được": cố tình không
  thêm mẹo `-t <chuỗi vô lý>`, vì `go test -run` thoát 0 khi không khớp test nào
  và mẹo đó sẽ kết luận `cannot_fail` SAI.
- **`scope/module-orphaned` hết dương tính giả** — luật cũ BFS một chiều từ một
  `entry`, nên mọi phạm vi có từ hai khối nguồn trở lên (khối không `depends_on`
  ai) đều luôn có khối bị báo mồ côi dù sơ đồ hoàn toàn đúng; đổi `entry` chỉ
  đổi khối nào bị báo, có khi còn nhiều hơn. Dự án buộc phải sống chung với một
  cảnh báo vĩnh viễn — mà cảnh báo thường trực là thứ người ta quen mắt rồi
  ngừng đọc, nên cảnh báo thật tiếp theo bị bỏ qua cùng. Giờ kiểm **liên thông
  trên đồ thị vô hướng**: vẫn bắt đúng lỗi thật (khối bị ném vào `modules` mà
  không có cạnh nào), hết báo nhầm với sơ đồ nhiều nguồn.
- **`scope` nhận `notes`** — nó là schema DUY NHẤT thiếu trường này, nên bối
  cảnh của phạm vi (cái gì trong, cái gì ngoài, đã hỏi ai) phải nhét vào comment
  YAML, mà comment thì `ganas brief` không đọc được — đúng chỗ đáng ghi nhất lại
  là chỗ không lên được brief. `renderBrief` in nó ngay dưới dòng phiên bản/trạng
  thái, trước ranh giới code.
- **`ganas scope new` tách lõi khỏi I/O** — `--paths` chứa cả vùng lõi lẫn vùng
  chạm I/O (nhận theo tên đoạn đường dẫn: `io`, `store`, `adapter`, `infra`,
  `repo`, `gateway`, `client`…) thì sinh **hai** khối: `M-<ten>` (`nature: code`)
  và `M-<ten>-io` (`nature: io`) khai `depends_on: [M-<ten>]`. Trước đây mọi
  glob gộp vào một khối `nature: code`, tức lệnh sinh ra một khối vi phạm ngay
  lúc tạo đúng luật kiến trúc mà `ganas init` vừa phát cho dự án. Dòng gợi ý
  cuối lệnh trước chỉ nhắc `llm`, giờ nhắc cả `io`.
- **Chiều `depends_on` giữa lõi và io hết mâu thuẫn** — `architectureRuleMd()`
  từng viết "khối lõi khai `depends_on` một khối `nature: io`", ngược với ports
  & adapters và ngược với thứ một dự án thật đang làm. Adapter cài đặt port do
  lõi định nghĩa ⇒ **io phụ thuộc lõi**. Sửa câu đó, và đó cũng là chiều
  `scope new` sinh ra.
- **Id phạm vi cắt ở biên từ** — `slugify` cắt cứng ở ký tự thứ 40 nên một tiêu
  đề dài ra id cụt giữa từ (`...-console-va-ch`). Id xuất hiện trong mọi brief,
  mọi commit message và mọi `depends_on`. Kèm theo: phỏng vấn `scope new` giờ
  hỏi **5 câu**, câu thứ 5 là id (gợi ý sẵn slug, Enter là nhận) — trước đây chỉ
  hỏi 4 và người dùng TTY không có đường đặt id trừ khi biết cờ `--id`.
- Nội bộ: `tokenizeShell`/`looksLikePath` chuyển từ `src/commit.ts` sang
  `src/util/shell.ts` — `commit` và `verify/mutate` hỏi cùng một câu ("token nào
  là đường dẫn") mà trước đó chỉ một chỗ có lời giải.

## v0.2.1 — 2026-08-09

Vá bốn lỗi tìm thấy khi dùng thật trên một dự án ngoài, cộng một tính năng mà
chính những lỗi đó chỉ ra là còn thiếu. Bốn lỗi đầu đều làm hỏng đúng thứ ganas
sinh ra để bảo vệ.

- **`ganas commit` stage cả file mà `exit_contract` chạy** — trước đây nó chỉ
  lấy `paths` của các khối trong `touches`, nên một tiêu chí
  `run: "bun test tests/e2e/domain.test.ts"` với khối khai
  `paths: ["src/domain/core/**"]` khiến file test KHÔNG vào commit. Gate xanh ở
  máy tác giả, đỏ ở mọi máy khác — đúng thứ ganas tồn tại để chặn.
  `contractPathRefs()` (`src/commit.ts`) nhặt đường dẫn từ chuỗi lệnh
  (tokenizer tôn trọng nháy, nên `-t 'tên test'` không bị nhầm là path) và từ
  `path` của tiêu chí `kind: artifact`. Kèm lưới an toàn: file trong
  `exit_contract` mà sau commit vẫn chưa vào git thì cảnh báo, nêu rõ tiêu chí
  nào đã nhắc tới nó.
- **`ganas commit` không còn nuốt cả `.ganas/`** — `new Set([".ganas"])` cũ
  stage nguyên thư mục bất kể task nào, nên commit mang nhãn `T-005` chứa graph
  của `T-007` và của phiên trước; đọc lại lịch sử sau này không biết thay đổi
  nào thuộc task nào, mà lịch sử graph chính là thứ ganas dùng để trả lời "vì
  sao chỗ này thành ra thế". `ownsGanasFile()` xác định quyền sở hữu theo đúng
  liên kết task tự khai: file task, khối trong `touches`, fact trong
  `context_contract.facts`, design/goal/phạm vi nó `implements`/`serves`/
  `scope`, và sổ cái. File `.ganas/` đang đổi mà không thuộc nhóm nào thì để
  lại và **in ra**, không nuốt im. `--all-ganas` giữ hành vi cũ.
- **Bỏ lớp chặn sổ cái khớp trên chuỗi lệnh Bash** — nó sai cả hai chiều: chặn
  nhầm lệnh chỉ ĐỌC có kèm dấu chuyển hướng (`grep … verify-ledger.jsonl >
  /tmp/x`), mà không cản được ai chỉ cần không gõ tên file (`git add .ganas`,
  hay `python3 -c "open('.ganas/'+'verify-ledger'+'.jsonl','a')"`). Làm phiền
  người trung thực và không cản người không trung thực. Nhánh `Write`/`Edit`
  giữ nguyên — nó khớp trên đường dẫn tuyệt đối đã resolve, nên vốn đã đúng.
- **Lệnh mới `ganas ledger --check`** thay vào chỗ đó: đọc đúng một file, tính
  lại hash-chain của sổ cái. `ganas init` cài nó thành git hook `pre-commit`
  (nhường đường bằng `exit 0` nếu repo chưa có ganas), và `ganas commit` từ
  chối commit khi chain đứt. Sổ cái sửa bằng cách nào cũng lộ ra — đúng nghĩa
  tamper-**evident**.
- **`ganas commit` đóng task** — trước đây nó không đụng tới file task, nên
  `ganas next` phát lại việc đã xong, nguy hiểm hơn là phát lại **kèm brief
  cũ** có thể chứa giả định đã bị một decision sau đó bác bỏ. Giờ commit ghi
  `status: done` + `done_at` bằng `Document` của `yaml` (giữ nguyên comment),
  ghi TRƯỚC khi stage nên thay đổi nằm trong chính commit đó, và khôi phục nếu
  `git commit` fail. Còn tiêu chí `kind: manual` chưa ai xác nhận thì không
  đóng, chỉ báo. `--no-close` để tự quyết.
- **Baseline gate: cảnh báo tiêu chí xanh SẴN trước khi bắt đầu** — quan sát
  thật: một task sửa bug được tạo với `exit_contract` chép lại probe của task
  trước, và gate đạt **2/2 với zero dòng code mới**. Gate của một task sửa bug
  mà tự xanh trước khi sửa thì gate đó không tồn tại. `ganas next --session`
  chấm các tiêu chí tự động (`command`, `artifact`, `verification`) ngay lúc
  nhận task, lưu theo `criterionKey()` vào `state.json`; `ganas gate` và
  `ganas commit` cảnh báo tiêu chí nào đã xanh từ đầu. Chỉ cảnh báo, không
  chặn — và không có baseline thì im lặng, không đoán bừa. `--no-baseline` để
  bỏ qua khi bộ test đắt.
- **`ganas commit --dry-run` không còn `git add`** — vòng `git add` chạy trước
  early-return của `--dry-run`, nên chính lệnh dùng để xem thử đã làm bẩn
  index. Giờ dry-run in kế hoạch stage, phần bỏ lại và commit message mà không
  đụng gì. Kèm theo: `--dry-run`/`--all-ganas` vào `KNOWN_BOOLEAN_FLAGS`, nếu
  không `ganas commit --dry-run T-005` nuốt `T-005` làm GIÁ TRỊ của cờ và im
  lặng chạy trên task khác.

- **Stop hook thôi làm phiền lượt hỏi đáp** — trước đây hook chấm
  `exit_contract` ở cuối **mọi** lượt trả lời, kể cả lượt người dùng chỉ hỏi
  một câu và không file nào đổi. Gate đương nhiên trượt, nên mỗi câu hỏi tốn
  thêm một lượt trả lời để thoát khỏi `decision: "block"`, và mọi tiêu chí
  `kind: command` (`npm test`, `tsc`…) chạy lại từ đầu cho một lượt không đụng
  tới code. Giờ `postToolUse` đặt cờ `touched_at` vào bản ghi phiên khi có ghi
  file (`preToolUse` làm tương tự cho `sed -i`, `>` qua Bash), `stop` chỉ chấm
  khi thấy cờ rồi hạ nó xuống: một đợt sửa được chấm đúng một lần, hỏi bao
  nhiêu câu sau đó cũng không đánh thức gate.
- **Stop hook không mượn task của phiên khác** — nó đọc thẳng
  `state.sessions[id]` thay vì `taskForSession()`, hàm này rơi về
  `current_task` khi phiên chưa bind. Cú rơi đó vẫn giữ cho CLI/MCP (nơi không
  có session id), nhưng với hook thì nó khiến một phiên mở lên chỉ để hỏi bị
  chấm theo `exit_contract` của việc nó không hề làm.

## v0.2.0 — 2026-08-04

- **Tier model ra thành chỉ dẫn giao việc, không còn là dòng gợi ý** — brief
  có mục **Giao việc** riêng. Trước đây `task.model` chỉ in một dòng "Gợi ý
  giao việc: model X" lẫn trong danh sách skill, và hệ quả quan sát được là
  task nào cũng chạy thẳng ở phiên chính bằng model mạnh nhất, kể cả việc cơ
  học. Giờ với `harness: claude-code`, brief nói rõ: phiên chính điều phối,
  phần sửa code giao cho sub-agent với alias model của tier (`scribe` →
  `haiku`, `verifier` → `sonnet`, `main` → `opus` — suy bằng
  `agentModelAlias()` từ `config.models`), prompt sub-agent mở đầu bằng
  `ganas brief <id>` để nó tự lấy brief thay vì bị chép tay lại.
- **Giao song song, suy từ sơ đồ khối** — `parallelCandidates()`
  (`src/graph/select.ts`) liệt kê task giao song song được với task hiện tại:
  không chặn nhau theo cả hai chiều VÀ vùng code rời nhau (glob của các khối
  không lồng nhau). Brief in kèm model từng cái để mở nhiều sub-agent cùng
  lúc. Luật cố ý sai theo hướng "không song song": task chưa khai `touches`
  bị loại, glob lồng nhau (`src/a/**` vs `src/a/deep/**`) coi như chồng —
  hai agent sửa cùng file thì cái sau đè cái trước và không ai thấy.
- **`config.harness` mới** (`claude-code` | `cursor` | `zed` | `windsurf` |
  `other`, mặc định `claude-code`) — vì tier chỉ là dữ liệu, còn cách biến nó
  thành hành động thì tuỳ harness: chỉ Claude Code mới tạo được sub-agent và
  chỉ định model cho nó; Cursor/Zed/Windsurf nối qua MCP nên brief chỉ khuyến
  nghị đổi model trong picker và **tự khai là không cưỡng chế được** thay vì
  dạy một thao tác không tồn tại. `install-target.mjs` ghi field này khi cài
  đúng một harness (sửa theo dòng, giữ nguyên comment); cài nhiều cờ cùng lúc
  thì nhắc khai tay chứ không đoán.
- **Luật `spine/task-missing-model`** (cảnh báo) — task chưa `done` mà không
  gán `model` thì `ganas validate` nhắc, và brief mở mục Giao việc bằng "⚠
  chưa ai quyết ai làm". Skill `plan-to-tasks` và `scope` cập nhật theo: gán
  tier cho MỌI task lúc chẻ, và đừng gán `main` cho cả loạt — plan chẻ đúng
  thì phần lớn task là việc cơ học.

## v0.1.2 — 2026-08-04

- **Cài không qua Claude Code plugin system** — `scripts/install-target.mjs`
  mới, dùng khi ganas được thêm bằng package manager
  (`bun add github:tienhm0202/ganas`) và muốn mọi thứ nằm 100% trong
  `node_modules/` của project, không đụng `~/.claude/plugins/` (cố định,
  không đổi được dù chọn scope nào lúc cài qua `claude plugin install`).
  Script đọc thẳng `plugin/hooks/hooks.json` làm nguồn (không lặp tay 6
  hook), sinh hook thật vào `.claude/settings.json` + skill vào
  `.claude/skills/`, và MCP config project-local cho Zed/Cursor
  (`--claude-code`, `--zed`, `--cursor`, `--windsurf`). Cưỡng chế
  `PreToolUse`/`Stop` hoạt động y hệt cài qua plugin. `docs/INSTALL.md` thêm
  mục 3 + bảng so sánh 3 cách cài. Bỏ luôn khuyến nghị `npm link` (global,
  ngược hướng scope project).
- **Cưỡng chế "không Co-Authored-By" bằng git hook thật** —
  `.githooks/commit-msg` mới, `ganas init` tự sinh và bật bằng
  `git config core.hooksPath .githooks` khi dự án dùng git. Rule
  `.claude/rules/ganas-git.md` chỉ là văn bản (dựa vào agent nhớ đọc đúng
  lúc — đã chứng minh không đủ tin cậy qua sự cố thật trong quá trình phát
  triển bản này); hook chạy trên MỌI commit bất kể ai/công cụ nào tạo ra,
  tự xoá dòng `Co-Authored-By` nhắc Claude/Anthropic thay vì chặn commit.

## v0.1.1 — 2026-08-04

- **README.md ở gốc repo** — trước bản này chỉ có `docs/` và `llms.txt`,
  không có gì tóm tắt "ganas là gì" ngay khi mở repo trên GitHub.
- **`.claude/rules/ganas-git.md`** — `ganas init` giờ sinh thêm rule này cho
  mọi dự án dùng ganas: tag = semver trần (`vX.Y.Z`), không ghép tên công cụ
  kiểu `<tên>--vX.Y.Z` (đó là quy ước riêng của `claude plugin tag`, chỉ
  đúng khi CHÍNH dự án là Claude Code plugin); ký commit cấu hình theo TỪNG
  repo (không `--global`); không `Co-Authored-By`. Bịt đúng nhầm lẫn vừa gặp
  khi tag chính repo ganas.
- Tag của chính repo ganas cũng đổi theo luật trên: `v0.1.0` (semver trần),
  thay cho `ganas--v0.1.0` đã tag/push nhầm trước đó.

## v0.1.0 — 2026-08-04

Bản phát hành đầu tiên. Dưới đây là toàn bộ năng lực đã có tính tới tag này,
gom theo mảng, không phải danh sách 27 commit rời rạc.

### Lõi: đồ thị tri thức có bằng chứng

- **Spine** hai trục: `Goal → Design → Task` (vì sao làm) cắt ngang
  `Scope → Module` (làm ở đâu, có bằng chứng gì) — nối bằng `task.touches` và
  `exit_contract`.
- **Ba loại tri thức tách biệt rạch ròi**, không lẫn vào nhau: **Fact** (đã
  re-run bằng probe), **Claim** (mới tin, bắt buộc có `anchor`), **Decision**
  (người quyết, có chữ ký, không kiểm bằng máy được).
- **Freshness 11 trạng thái** (`src/graph/freshness.ts`) — mỗi trạng thái là
  một LÝ DO khác nhau khiến một fact hết dùng được (định nghĩa đổi, model
  đổi, prompt đổi, dataset đổi, fail, marginal, unavailable, unprovable,
  stale-by-age…), không phải một thang "cũ dần".
- `ganas validate` — kiểm tra chéo toàn đồ thị: cycle, orphan,
  `task.serves ⊆ design.serves`, mọi `task.touches` phải có tiêu chí
  `kind: verification`, `.gitignore` đủ mục local-only.

### Sổ cái xác minh chống giả mạo

- `verify-ledger.jsonl` — append-only, commit vào git, chỉ `ganas verify`
  được ghi (hook `PreToolUse` chặn mọi đường ghi thẳng khác, kể cả qua Bash).
- `defHash`/`definitionHash` — vân tay của CẢ phép kiểm lẫn điều được khẳng
  định (`statement`), không chỉ phép kiểm — chặn đường lách "giữ probe cũ,
  đổi ý nghĩa fact".
- **Hash-chain** (`seq`, `prev_hash`) — mỗi dòng giữ hash của toàn bộ chain
  tính tới ngay trước nó, đúng lược đồ Secure Scuttlebutt / Certificate
  Transparency (RFC 6962). `verifyChain()` phát hiện sửa/xoá/đảo một dòng cũ
  bằng công cụ ngoài git, không chỉ dựa vào "append-only + hook chặn".
- Mutation-test guard (`proof: proven/unproven`) — probe rỗng ruột (không
  thể fail) không được tính là bằng chứng thật.

### Cưỡng chế qua hook Claude Code

- 6 hook: `SessionStart` (nạp brief đúng 1 task), `PreToolUse` (chặn ghi
  thẳng ledger/config), `PostToolUse` (chặn ghi tri thức sai schema hoặc
  thiếu anchor), `Stop` (chặn kết thúc phiên khi `exit_contract` chưa đạt),
  `PreCompact` (nhắc ghi ra trước khi mất context), `SessionEnd` (handoff +
  giải phóng session/claim).
- Enforcement 2 mức (`warn`/`enforce`), bật/tắt riêng theo từng luật
  (`knowledge_anchor`, `schema`, `exit_contract`, `task_link`).
- Tự nhận là **tamper-evident, không phải tamper-proof** — hook là lớp
  nhắc, `.ganas/config.yaml` không được bảo vệ khỏi bị hạ `enforcement`
  bằng tay; cổng thật phải là CI chạy `ganas validate`.

### Dòng chảy một-bước-một-lúc

- `ganas` trần in **đúng một** bước kế tiếp trong 12 chặng cố định
  (`init → fix-graph → scope → goal → design → evidence → task → work →
  verify → gate → commit → close`), không đưa menu — mỗi lựa chọn đẩy sang
  người dùng là một chỗ đi lạc.
- Bộ dò ngõ cụt (`test/flow.test.ts`): đi hết dòng chảy từ repo trống như
  người dùng thật, kẹt ở đâu là test đỏ ở đó — ngõ cụt thành lỗi thấy trước,
  không phải phát hiện muộn qua đo chi phí khởi động bằng tay.

### Multi-agent — claim task theo phiên

- `graph/claim.ts` — lock file `.ganas/.locks/<task>.claim` tạo bằng
  `fs.open(..., "wx")` (nguyên tử ở tầng filesystem), có TTL chống claim mồ
  côi khi phiên crash. Hai phiên `next` gần như cùng lúc chỉ một phiên nhận
  được một task — trước bản này, `selectNextTask` thuần không biết task đã
  bị phiên khác giữ.
- `scope new` chuyển sang ghi file mới bằng `wx`: hai phiên chọn trùng ID
  không còn âm thầm ghi đè nhau, mà báo lỗi rõ ràng.

### Lệnh / skill

13 subcommand CLI (`flow`, `init`, `validate`, `scope`, `brief`, `next`,
`gate`, `verify`, `trace`, `commit`, `handoff`, `prune`, `hook`), lộ ra
Claude Code dưới dạng 9 skill: `commit`, `gate`, `handoff`, `next`,
`plan-to-tasks`, `prune`, `scope`, `trace`, `verify`.

### Đa nền tảng

- **Plugin tự chứa cho Claude Code** — `plugin/dist/cli.js` là một bundle
  esbuild duy nhất (gói cả `yaml`, `zod`), commit vào git; cài qua
  marketplace là chạy được ngay, không cần build lại trên máy người dùng.
  `test/plugin-selfcontained.test.ts` giữ bất biến này: copy riêng
  `plugin/` sang thư mục tạm rồi chạy như Claude Code chạy thật.
- Cài theo scope `project` (khuyến nghị, `.claude/settings.json` commit
  git, cả team tự có) thay vì `user` mặc định (dễ ghi đè marketplace giữa
  các dự án khác nhau).
- **MCP server** (`plugin/bin/ganas-mcp.mjs`, transport `stdio`) — 7 tool
  (`ganas_flow/next/gate/verify/trace/scope/commit`) cho editor không phải
  Claude Code (Zed, Cursor, Windsurf). Gọi thẳng `run(argv)` của command
  CLI có sẵn, không viết lại logic. **Không có** cưỡng chế
  `PreToolUse`/`Stop` — MCP không có khái niệm tương đương, nên chỉ Claude
  Code mới có lớp chặn thật.

### Docs

`docs/CONCEPTS.md` (mô hình dữ liệu), `docs/COMMANDS.md` (từng lệnh),
`docs/FLOWS.md` (5 luồng + lỗ đã bịt/còn nợ), `docs/WORKFLOW.md` (câu
chuyện đầu-cuối), `docs/INSTALL.md` (cài theo từng editor: Claude Code /
Zed / Cursor / Windsurf), `llms.txt`.
