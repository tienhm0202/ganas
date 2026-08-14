# Changelog

Ghi theo tính năng, không theo từng commit — xem `git log` nếu cần chi tiết
từng bước (`P2 N<số>` trong commit message khớp số thứ tự trong lịch sử phát
triển thật, không phải số phát minh ra sau).

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
