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

## Đang làm / tiếp theo

### N8 — handoff dẫn xuất từ transcript Claude Code

`gate.ts` đã có `kind: "handoff"` trong `exit_contract`, trỏ tới
`.ganas/runs/<session>.md`, nhưng chưa có gì SINH ra file đó. Cần: đọc
transcript phiên, dựng handoff record (việc đã làm, quyết định, câu hỏi mở)
— tự động, không phải model tự viết tổng kết văn xuôi rồi coi là tri thức
(luật cấm trong `knowledgeRuleMd()`).

### N9 — công cụ dọn dẹp (`ganas prune` / `ganas clean`)

Làm SAU N8 — `runs/` phải có nội dung thật thì mới biết pattern dọn thế nào,
tránh đoán trước rồi phải sửa lại.

Ba tầng, không được trộn lẫn:

| Tầng | Ví dụ | Hành động |
|---|---|---|
| Ephemeral, local | `.ganas/runs/*.md` cũ, session chết trong `state.json` | Xoá thẳng — không chia sẻ, không phải bằng chứng |
| Shared nhưng đã đóng | `tasks/` status `done`, `sprints/` status `closed`, `proposals/` đã duyệt/từ chối | Archive (dời sang thư mục con, vd `tasks/done/`) — `listYaml()` không đệ quy nên tự động biến mất khỏi graph mà không cần sửa `load.ts`. Giữ trong git history, không xoá. |
| Vĩnh viễn, không đụng | `verify-ledger.jsonl`, `claims/` (kể cả `trust: refuted`), `decisions/`, `facts/` | Ngoài phạm vi tool này. `claims` refuted đặc biệt: `validate.ts` giữ nó lại CÓ CHỦ ĐÍCH ("để phiên sau không tin lại") — xoá là quay lại đúng hiểu nhầm cũ. |

Mặc định `--dry-run`; phải gõ thêm cờ mới thực thi.

### N10 — tiêu chuẩn code / test / document (chốt dựa trên nghiên cứu ngành)

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
  mới. Ghi thành checklist trong N11, không chỉ nằm trong đầu người viết.
- Liệt kê chính thức bảng tiền tố ID (`G-`, `S-`, `D-`, `T-`, `P-`, `M-`,
  `F-`, `C-`/`LC-`, `V-`) — hiện rải rác trong từng file model.

**Test:**
- Giữ `node:test` (đã nhất quán toàn repo) — không chuyển sang vitest/jest.
- Thêm coverage threshold (`c8`) cho `src/graph/` và `src/verify/` (phần lõi
  kiểm chứng — nơi một lỗ hổng nghĩa là bằng chứng giả lọt qua), KHÔNG bắt
  buộc cho `src/commands/` (I/O nhiều, integration/manual test quan trọng
  hơn coverage số).
- Ghi nhận, KHÔNG bắt buộc ở N10: mutation testing (Stryker) cho chính bộ
  test của ganas — `verify/mutate.ts` đã áp triết lý này cho probe của
  NGƯỜI DÙNG ganas, nhưng chưa áp cho test suite của chính ganas.

**Document:**
- Giữ nguyên triết lý hiện tại (`knowledgeRuleMd()`: không viết tổng kết văn
  xuôi, chỉ spine có cấu trúc) — đây chính là hướng SDD ngành đang hội tụ về,
  không cần đổi.
- Mở (quyết định lúc thực thi N10, không chốt ở đây): có nên thắt
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

### N11 — hướng dẫn sử dụng chi tiết (người đọc + AI đọc)

Ganas hiện **không có tài liệu cấp cao nào** giải thích cách dùng — chỉ có
template ngắn sinh cho dự án CONSUMER (`CLAUDE.md`/`AGENTS.md`/`README.md`,
cố ý ngắn để không tốn context mỗi phiên) và `SKILL.md` rải rác theo lệnh.
Không có nơi nào giải thích toàn cảnh: triết lý, mô hình xương sống, workflow
đầu-cuối.

Phân biệt rõ với các file đã có: N11 là tài liệu THAM CHIẾU ĐẦY ĐỦ (cho người
tò mò đọc sâu, và cho AI cần hiểu toàn bộ hệ thống trước khi thao tác) — khác
với `CLAUDE.md`/`SKILL.md` (cố ý ngắn, chỉ đường). N11 không thay thế các file
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
  trên nhiều field zod — tránh đúng rủi ro N10 vừa cảnh báo (doc và schema
  thật lệch nhau). Có thể là script nhỏ chạy trong CI.

Trình tự: N10 nên đi trước N11 (hướng dẫn nên phản ánh tiêu chuẩn đã chốt,
không phải ngược lại), nhưng cả hai độc lập với N7/N8/N9 — có thể xen vào bất
cứ lúc nào.

## Ghi chú cho phiên sau

Nếu context bị `/clear` giữa chừng, đọc file này trước, không cần đào lại
từ code + `git log` như phiên trước đã phải làm.
