# Plan

Không có `.ganas/` cho chính dự án ganas (chưa self-host được — công cụ chưa
xong). File này là chỗ duy nhất giữ lại roadmap giữa các phiên; cập nhật mỗi
khi một mục xong hoặc phạm vi đổi. Xem chi tiết từng phần đã làm trong commit
message tương ứng (`git log`), file này chỉ tóm và giữ TRẠNG THÁI KẾ HOẠCH.

## Đã xong

**P0 — spine.** Model goal/sprint/design/task, validator liên kết chéo,
`ganas init` / `ganas validate`.

**P1 — brief, hook, gate.** `render/brief.ts`, 5 hook Claude Code
(SessionStart/PostToolUse/Stop/PreCompact/SessionEnd), state đa phiên
(`src/state.ts`), `evaluateGate` (`src/gate.ts`), plugin.

**P2 N1 — sơ đồ khối.** Model `Part`/`Module`/`Verification` (gộp `Zone` cũ).
`Module` vừa là node kiến trúc vừa là vùng code thật (`paths`, `entrypoints`) —
chủ đích, không tách hai bản đồ song song.

**P2 N2 — sổ cái xác minh.** `verify-ledger.jsonl` append-only, commit vào
git. Hook chặn ghi thẳng vào sổ cái. Luật `knowledge/unbacked-verification`.

**P2 N3 — chống probe giả.** `lintProbe` (tautological/dangerous),
`proveCanFail` (mutation test — bóp méo probe, đòi nó PHẢI fail).

**P2 N4 — `ganas verify`.** Chạy probe/eval thật, adapter json/promptfoo,
`skip_if` → `unavailable` (không phải fail), margin → `marginal`,
`--max-cost-usd` chặn TRƯỚC khi chạy.

**P2 N5 — STALE mở rộng.** `definition_changed`, `model_changed`,
`prompt_changed`, `dataset_changed` — tách vân tay PHÉP ĐO khỏi vân tay ĐỐI
TƯỢNG được đo (`src/graph/freshness.ts`).

**P2 N6 — `ganas trace`.** Kiểm tương thích cạnh (`kind: contract`: cổng ra
khối nguồn phải phủ cổng vào bắt buộc khối đích), sơ đồ khối Mermaid,
`computeDebt()` (nợ kiểm chứng riêng cho sơ đồ: cạnh chưa có hợp đồng kiểm,
hợp đồng fail, khối chưa có bằng chứng). `validate.ts` bắt thêm liên kết treo
`to` của contract → `spine/contract-missing-target`.

**P2 N7 — nợ kiểm chứng ở mức task + brief tự suy paths + quy hoạch git.**
Ba việc gộp một đợt:
- `zExitCriterion` có thêm `kind: "verification"` (`{target}`) — đòi một
  target trong sổ cái phải FRESH, không chỉ "chạy lệnh gì đó thoát mã 0".
  Luật `spine/task-missing-verification`: `task.touches` khác rỗng thì mỗi
  khối phải có ít nhất một tiêu chí `verification` kiểm nó, kèm hint gợi ý
  đúng target. `gate.ts`/`evaluateGate` nhận thêm `freshness` để chấm được
  loại tiêu chí này (case mới trong `checkCriterion`).
- `renderBrief()` thêm mục "Khối chạm tới (suy từ sơ đồ)" — tự suy
  `paths`/`entrypoints` từ `task.touches`, không cần khai tay vào
  `must_read`.
- `LOCAL_ONLY` (`src/graph/paths.ts`) là nguồn duy nhất cho local-only qua
  git; `gitignoreAddition()` sinh từ đó (bỏ dòng `.ganas/.cache/` chết —
  không ai đọc/ghi). `Graph` có thêm `gitignoreRaw` (đọc lúc `loadGraph`).
  Luật `spine/gitignore-missing-local`: có `.git` mà `.gitignore` thiếu
  dòng nào trong `LOCAL_ONLY` → lỗi (bỏ qua nếu dự án không dùng git).

198 test pass (186 cũ + 12 mới).

**P2 N7.1 — `ganas commit`.** Logic git vào thẳng ganas thay vì làm tay:
`src/commit.ts` (`buildCommitMessage`, `pathsToStage` — thuần, không cần git
thật) + `src/commands/commit.ts` (CLI, gọi git thật). Từ chối commit nếu
`evaluateGate` chưa `ok` — không có commit nào cho task chưa xong. `git add`
chỉ đúng phạm vi task (`.ganas/` + `paths` của khối trong `touches`), không
`git add -A`. Message dựng TỪ kết quả gate thật (tiêu đề `<task id>: <tiêu
đề>`, thân liệt kê tiêu chí đã ✓, cuối là goal/design/sprint) — không phải
văn xuôi tự bịa, và **không bao giờ có dòng ghi công AI/trợ lý** (quy ước
cứng, không phải tuỳ chọn cấu hình). `--dry-run` chỉ in message. Idempotent:
gọi lại khi không có gì đổi thì không tạo commit rỗng.

204 test pass (198 + 6 mới, `test/commit.test.ts`).

**P2 N8 — handoff dẫn xuất từ transcript.** `src/handoff.ts`:
`parseTranscript()` đọc JSONL transcript của Claude Code, trích CƠ HỌC —
tin nhắn người dùng nguyên văn (lọc wrapper hệ thống như
`<local-command-...>`, `isMeta`), file bị Write/Edit/MultiEdit/NotebookEdit,
lệnh Bash đã chạy. **Cố ý bỏ qua mọi block `text` của assistant** — văn xuôi
model không được coi là tri thức của phiên, kể cả trích nguyên văn.
`renderHandoff()` ghép thêm fact/claim đã có bằng chứng gắn ĐÚNG session
(`verified_by`/`source_session`), `open_questions` của task, và kết quả
`evaluateGate` thật — không có bước "model đọc rồi tóm tắt lại".
`generateHandoff()` ghi `.ganas/runs/<session>.md` (đè, không phải
append-only — đây là tiện ích tiếp nối, không phải bằng chứng). Lệnh CLI
`ganas handoff --session <id>` bắt buộc phải có `--session` (không đoán được
phiên). Nối tự động vào hook `preCompact`/`sessionEnd` (đã có sẵn
`transcript_path`/`session_id` trong input) — hỏng thì bỏ qua lặng lẽ, không
chặn hook nào.

213 test pass (204 cũ + 9 mới, `test/handoff.test.ts`).

**P2 N9 — `ganas prune`.** `src/prune.ts`: `planPrune()` (thuần, không đụng
đĩa) + `applyPrune()`. Ba tầng đúng như thiết kế ban đầu, `proposals/` bị
loại khỏi tầng 2 vì **chưa có model `Proposal` nào được nạp vào `Graph`** —
không có schema thì không có gì để mà quyết "đã duyệt hay chưa", ghi nhận là
khoảng trống, không suy đoán:

| Tầng | Gồm | Hành động |
|---|---|---|
| Ephemeral, local | `runs/*.md` của phiên đã kết thúc (`sessionId` không còn trong `state.sessions`), session mồ côi trong `state.json` | Xoá thẳng |
| Shared, đã đóng | `tasks/` status `done` + đủ tuổi (theo `done_at`), `sprints/` status `closed` + đủ tuổi (theo `ends_at`) | Archive (`git mv` nếu có git, rơi về `rename()` thường) sang `tasks/done/`, `sprints/closed/` |
| Vĩnh viễn | `verify-ledger.jsonl`, `claims/`, `decisions/`, `facts/` | Không có đường code nào trong `prune.ts` chạm tới |

Hai guard chống liên kết treo, phát hiện được nhờ viết test trước khi tưởng
là xong:
- Task done nhưng còn task khác `blocked_by` nó → **giữ lại**. Archive xong
  thì `blocked_by` trỏ vào chỗ trống, `openBlockers()` coi là chặn VĨNH VIỄN
  — tệ hơn nhiều so với chưa dọn.
- Sprint closed chỉ archive được nếu không còn task SỐNG SÓT (sau khi đã trừ
  các task cũng bị archive trong CHÍNH lần chạy này) trỏ `sprint:` vào nó —
  nếu không gần như mọi sprint closed đều bị chặn vì luôn có ít nhất một task
  done trỏ vào.

Mặc định dry-run (chỉ in kế hoạch); `--yes` mới thực thi. `--older-than <ngày>`
(mặc định 7).

225 test pass (213 cũ + 12 mới, `test/prune.test.ts`).

**P2 N10 — chẻ plan (Claude Code Plan Mode) thành task, gán model ngay lúc
chẻ.** Deliverable chính là một SKILL, không phải lệnh CLI — Plan Mode là
tính năng của Claude Code, ganas không đọc file plan
(`/root/.claude/plans/*.md` là nội bộ harness, không phải API ổn định);
không cần đọc lại gì vì ngay sau khi duyệt qua `ExitPlanMode`, nội dung plan
đã nằm sẵn trong context phiên. `plugin/skills/plan-to-tasks/SKILL.md`
hướng dẫn agent: gắn vào Design có sẵn hoặc tạo mới, chẻ thành Task vừa một
phiên, mỗi task khai đủ `touches`+`exit_contract` (dùng luật
`task-missing-verification` đã có từ N7, không viết luật mới), **gán
`model` NGAY LÚC CHẺ** — quyết định của agent lúc thiết kế, cố ý KHÔNG suy
tự động từ `module.nature` (agent lúc đó hiểu độ khó rõ hơn heuristic nào
suy sau), rồi chạy `ganas validate` (validator hiện có đã đủ bắt lỗi chẻ
ẩu). Field mới `Task.model` (`src/model/task.ts`), optional, enum theo
đúng 3 tier `config.yaml` đã có sẵn từ P1 nhưng chưa dùng ở đâu
(`main`/`verifier`/`scribe`, gắn với `MODEL_TIER` export mới trong
`config.ts` để hai chỗ không lệch nhau). `renderBrief()` resolve tier thành
model id thật, in dòng "Gợi ý giao việc: model `<id>` (`<tier>`)" — không
gán thì brief không gợi ý gì, không đoán bừa.

Implement bởi sub-agent (theo quy trình mới), review + verify lại ở phiên
chính: đọc diff, `npm run typecheck`/test/build sạch, smoke test tay xác
nhận cả hai chiều (model hợp lệ → brief gợi ý đúng; model sai → `ganas
validate` bắt bằng `schema/invalid_enum_value`).

231 test pass (225 cũ + 6 mới, `test/spine.test.ts` + `test/staleness.test.ts`).

### N11 — skill đóng gói theo module, quyền sửa skill (main session có,
sub-agent không)

Xác nhận qua tài liệu Claude Code chính thức (2026-08-01):
- Hook `PreToolUse`/`PostToolUse` chạy y hệt bên trong sub-agent
  (`hooks.md`).
- Khi tool call đến từ sub-agent, input hook có thêm `agent_id` (và
  `agent_type`) — trường này CHỈ xuất hiện khi gọi từ sub-agent, main session
  không có. Đây chính là móc để phân biệt.
- Cơ chế khuyến nghị CHÍNH của Claude Code là giới hạn tool lúc spawn
  (`tools`/`disallowedTools` trên định nghĩa sub-agent) — nhưng ganas không
  spawn sub-agent nên không kiểm soát được bước đó. Hook-based là lớp phòng
  vệ ganas TỰ làm được, không phụ thuộc người spawn có nhớ giới hạn tool hay
  không.

**Việc cần làm:**
- `src/model/module.ts`: thêm `skills: z.array(zNonEmpty).default([])` —
  ngang hàng `paths`/`entrypoints`/`contract`/`verify`. Mỗi khối tự khai kỹ
  năng riêng cho nó (vd khối xử lý luật nội bộ AdFlex có skill mô tả cách
  chunking riêng).
- `src/render/brief.ts`: mục "Kỹ năng cần dùng cho task này" hiện chỉ đọc
  `task.skills` — gộp thêm skill của mọi khối trong `task.touches`, dedupe.
- `src/hooks/io.ts`: thêm field `agent_id?`/`agent_type?` vào `HookInput`.
- `src/hooks/handlers.ts`: `preToolUse()` thêm rule — `input.agent_id` có
  giá trị (tức đang chạy trong sub-agent) VÀ tool là Write/Edit/MultiEdit
  VÀ file đích nằm dưới `.claude/skills/` → deny, kèm lý do "skill chỉ được
  sửa bởi phiên chính". Main session (không có `agent_id`) không bị chặn.

### N12 — tiêu chuẩn code / test / document (chốt dựa trên nghiên cứu ngành)

Nghiên cứu: Anthropic "Building Effective Agents" / "Writing effective tools
for agents" / "Effective context engineering" (đơn giản hơn phức tạp; lỗi
phải actionable; context là tài nguyên hữu hạn — chỉ đưa smallest high-signal
tokens); Spec-Driven Development 2025-2026 (GitHub Spec Kit, AWS Kiro, Tessl —
spec là nguồn sự thật thực thi được, code là artifact tái tạo); agent eval
chấm TRAJECTORY chứ không chỉ câu trả lời cuối; ADR pattern
(Context/Decision/Consequence). Tìm về tiêu chuẩn kỹ thuật NỘI BỘ của các
công ty AI Trung Quốc (Alibaba Qwen-Agent, ByteDance Coze) không ra nguồn đủ
cụ thể — không suy đoán, để trống.

**Code:**
- Thêm ESLint (flat config, `typescript-eslint` recommended-type-checked) +
  Prettier — hiện KHÔNG có gì ngoài `tsc --strict`. Bắt riêng
  `no-floating-promises` (code toàn async) và import order.
- Chính thức hoá quy ước đang bất thành văn: không comment trừ khi giải
  thích WHY; docstring tiếng Việt; `.strict()` bắt buộc trên mọi zod object
  mới. Ghi thành checklist trong N13, không chỉ nằm trong đầu người viết.
- Liệt kê chính thức bảng tiền tố ID (`G-`, `S-`, `D-`, `T-`, `P-`, `M-`,
  `F-`, `C-`/`LC-`, `V-`) — hiện rải rác trong từng file model.

**Test:**
- Giữ `node:test` (đã nhất quán toàn repo) — không chuyển sang vitest/jest.
- Thêm coverage threshold (`c8`) cho `src/graph/` và `src/verify/` (phần lõi
  kiểm chứng — nơi một lỗ hổng nghĩa là bằng chứng giả lọt qua), KHÔNG bắt
  buộc cho `src/commands/` (I/O nhiều, integration/manual test quan trọng
  hơn coverage số).
- Ghi nhận, KHÔNG bắt buộc ở N12: mutation testing (Stryker) cho chính bộ
  test của ganas — `verify/mutate.ts` đã áp triết lý này cho probe của
  NGƯỜI DÙNG ganas, nhưng chưa áp cho test suite của chính ganas.

**Document:**
- Giữ nguyên triết lý hiện tại (`knowledgeRuleMd()`: không viết tổng kết văn
  xuôi, chỉ spine có cấu trúc) — đây chính là hướng SDD ngành đang hội tụ về,
  không cần đổi.
- Mở (quyết định lúc thực thi N12, không chốt ở đây): có nên thắt
  `contract.inputs/outputs.shape` từ chuỗi tự do thành JSON Schema không —
  chặt hơn, máy kiểm được, nhưng phải sửa `trace.ts` và tăng độ khó viết YAML
  tay. Đổi ngay bây giờ phá vỡ N6 vừa xong nên KHÔNG làm trong đợt này.
- Mở: có nên tách `Decision.rationale` thành `context`/`consequence` riêng
  cho khớp ADR chuẩn, hay giữ `rationale` tự do — quyết lúc làm.

**AI agent product practices — áp trực tiếp vào ganas:**
- "Context là tài nguyên hữu hạn" → đã đúng hướng (CLAUDE.md ngắn, brief theo
  từng task). Chốt thành tiêu chuẩn: đặt ngưỡng cảnh báo độ dài cho
  `renderBrief()` output, tương tự comment "giữ CLAUDE.md dưới ~200 dòng" đã
  có trong `templates/project.ts`.
- "Lỗi phải actionable" → đã đúng hướng (mọi `Diagnostic` có `hint`). Chốt
  thành luật: mọi `Diagnostic` MỚI thêm sau này bắt buộc có `hint`.
- "Eval chấm trajectory" → khớp triết lý `verify-ledger.jsonl` (ghi từng lần
  chạy, không chỉ kết quả cuối) — không cần đổi gì, chỉ xác nhận hướng đã
  chọn là đúng.

### N13 — hướng dẫn sử dụng chi tiết (người đọc + AI đọc)

Ganas hiện **không có tài liệu cấp cao nào** giải thích cách dùng — chỉ có
template ngắn sinh cho dự án CONSUMER (`CLAUDE.md`/`AGENTS.md`/`README.md`,
cố ý ngắn để không tốn context mỗi phiên) và `SKILL.md` rải rác theo lệnh.
Không có nơi nào giải thích toàn cảnh: triết lý, mô hình xương sống, workflow
đầu-cuối.

Phân biệt rõ với các file đã có: N13 là tài liệu THAM CHIẾU ĐẦY ĐỦ (cho người
tò mò đọc sâu, và cho AI cần hiểu toàn bộ hệ thống trước khi thao tác) — khác
với `CLAUDE.md`/`SKILL.md` (cố ý ngắn, chỉ đường). N13 không thay thế các file
ngắn đó.

**Cấu trúc đề xuất** (`docs/` ở gốc repo ganas):
- `docs/CONCEPTS.md` — mô hình xương sống bằng prose: Goal → Design → Task →
  Module/Part, Fact/Claim/Decision, ledger, freshness. Có sơ đồ mermaid.
- `docs/COMMANDS.md` — reference đầy đủ từng lệnh CLI. Nên có test đối chiếu
  với `HELP`/`COMMANDS` trong `src/cli.ts` để không lệch (chuẩn SDD: một
  nguồn sự thật, không hai bản copy rồi trôi dạt nhau).
- `docs/WORKFLOW.md` — "một ngày làm việc" đầu-cuối: init → viết
  goal/design/task → session mở (brief) → sửa code → verify → trace → gate →
  done. Có ví dụ YAML thật, chạy được.
- `llms.txt` ở gốc repo — theo đúng chuẩn (Jeremy Howard/Answer.AI, 2024):
  mỗi mục trong `docs/` tóm một câu + link. Đây là phần dành RIÊNG cho AI đọc
  thẳng, không phải crawl HTML — nhiều tool (Cursor, Copilot, Claude) đã hỗ
  trợ đọc file này.
- Cân nhắc: `docs/SCHEMA.md` sinh (không viết tay) từ `.describe()` đã có sẵn
  trên nhiều field zod — tránh đúng rủi ro N12 vừa cảnh báo (doc và schema
  thật lệch nhau). Có thể là script nhỏ chạy trong CI.

Trình tự: N12 nên đi trước N13 (hướng dẫn nên phản ánh tiêu chuẩn đã chốt,
không phải ngược lại), nhưng cả hai độc lập với N7/N8/N9 — có thể xen vào bất
cứ lúc nào.

## Ghi chú cho phiên sau

Nếu context bị `/clear` giữa chừng, đọc file này trước, không cần đào lại
từ code + `git log` như phiên trước đã phải làm.
