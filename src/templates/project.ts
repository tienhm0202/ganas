/**
 * Nội dung `ganas init` sinh ra.
 *
 * Nguyên tắc chia chỗ đặt:
 *  - CLAUDE.md: ngắn, chỉ đường. Nạp mọi phiên nên mỗi dòng đều tốn context.
 *  - .claude/rules/ganas-knowledge.md: luật ghi tri thức. KHÔNG có `paths:`
 *    frontmatter — rule path-scoped bị mất sau compaction, còn luật này phải
 *    sống suốt phiên.
 */

import { LOCAL_ONLY } from "../graph/paths.js";

export interface InitVars {
  project: string;
  owner?: string | undefined;
}

export function configYaml(v: InitVars): string {
  return `# ganas — cấu hình dự án
version: 1
project: ${JSON.stringify(v.project)}

# Mức cưỡng chế của hook.
#   warn    — chỉ cảnh báo, không chặn (shadow mode; mặc định khi adopt dự án cũ)
#   enforce — chặn thao tác sai
# Dự án mới bắt đầu bằng enforce luôn: chưa có thói quen cũ nào để phá.
enforcement: enforce

# Bật/tắt riêng từng luật khi cần nới ở một chỗ mà vẫn giữ chặt chỗ khác.
enforcement_rules: {}
  # knowledge_anchor: enforce
  # schema: enforce
  # exit_contract: enforce
  # task_link: enforce
  # zone_survey: warn

models:
  main: claude-opus-5
  verifier: claude-sonnet-5
  scribe: claude-haiku-4-5

embedder:
  provider: local
  model: multilingual-e5-small
`;
}

export function claudeMd(v: InitVars): string {
  return `# ${v.project}

Dự án này dùng **ganas** để kiểm soát phiên làm việc. Trạng thái công việc và tri
thức đã kiểm chứng nằm ở \`.ganas/\`, không nằm trong đầu bạn và không nằm trong
file tổng kết tự do.

## Bắt đầu một phiên

Brief của task hiện tại được bơm tự động lúc mở phiên. Nếu không thấy, chạy:

\`\`\`
ganas next
\`\`\`

## Luật quan trọng nhất

Đọc \`.claude/rules/ganas-knowledge.md\`. Tóm tắt một dòng: **không có bằng chứng
thì không được ghi vào kho tri thức**.

## Lệnh hay dùng

| Lệnh | Việc |
|---|---|
| \`ganas next\` | Task kế tiếp + brief đầy đủ |
| \`ganas validate\` | Kiểm tra graph trước khi commit |
| \`ganas verify <id>\` | Chạy probe của một fact |
| \`ganas gate\` | Chấm điều kiện hoàn thành của task đang làm |
| \`ganas commit\` | Commit task đã đạt gate — chỉ khi thật sự xong |

<!-- Giữ file này dưới ~200 dòng. Quy trình nhiều bước → chuyển thành skill.
     Luật theo vùng code → chuyển thành .claude/rules/*.md có \`paths:\`. -->
`;
}

export function knowledgeRuleMd(): string {
  // Không có frontmatter `paths:` — cố ý. Rule path-scoped bị compaction xoá
  // khỏi context cho tới khi đọc lại file khớp; luật này phải luôn còn.
  return `# Luật ghi tri thức (ganas)

Kho tri thức của dự án nằm ở \`.ganas/\`. Mọi thứ ghi vào đó đều thuộc đúng một
trong ba loại. Ghi sai loại là lỗi nghiêm trọng hơn là không ghi.

## Ba loại, không có loại thứ tư

**FACT** — điều kiểm chứng được bằng lệnh.
Bắt buộc có \`verify.run\` (lệnh shell chạy được) và \`verify.expect\`. Phiên sau
được phép tin, nhưng chỉ khi fact còn FRESH.

**CLAIM** — điều được tin nhưng chưa kiểm chứng.
Bắt buộc có \`anchors\` không rỗng. Phiên sau đối xử như **giả thuyết**: muốn dựa
vào thì phải verify trước, rồi ghi lại kết quả.

**DECISION** — điều người đã chốt.
Bắt buộc có \`decided_by\` và \`decided_at\`. Bạn **không được tạo hay sửa**
decision. Thấy mâu thuẫn thì nêu ra cho người xử lý.

## Anchor là bắt buộc

Anchor là bằng chứng. Chấp nhận:

- \`src/api/handler.ts#L42\` hoặc \`src/api/handler.ts:42\` — vị trí trong file
- \`commit:a1b2c3d\` — commit
- dạng object cho URL (**phải** có \`fetched_at\`) và cho người
  (\`kind: human\`, \`by\`, \`at\`)

Không có anchor thì không phải tri thức, chỉ là ý kiến — và hook sẽ chặn ghi.

## Điều tuyệt đối không làm

- ❌ Ghi kết luận suy ra từ trí nhớ hoặc từ kiến thức chung mà không chỉ được nguồn
- ❌ Nâng một claim lên fact mà không chạy probe
- ❌ Sửa \`last_verified_at\` bằng tay mà không thật sự chạy verify
- ❌ Viết tổng kết văn xuôi rồi coi đó là tri thức dự án

Điều cuối là nguồn gốc của việc một hiểu nhầm ở phiên này làm hỏng mọi phiên sau.

## Khi không chắc

Nói thẳng là không chắc, ghi vào \`open_questions\` của task. Một câu hỏi mở được
ghi lại có ích hơn một câu trả lời tự tin mà sai.
`;
}

export function agentsMd(v: InitVars): string {
  return `# ${v.project}

Hướng dẫn chung cho các coding agent (Claude Code, Codex, Cursor…).

Dự án dùng **ganas**: trạng thái công việc và tri thức đã kiểm chứng nằm ở
\`.ganas/\`. Trước khi sửa gì, chạy \`ganas next\` để lấy task hiện tại và brief.

Luật ghi tri thức: xem \`.claude/rules/ganas-knowledge.md\`. Tóm tắt: mọi phát
biểu ghi vào \`.ganas/\` phải kèm bằng chứng (anchor \`file:line\`, commit, hoặc
URL kèm thời điểm lấy). Không có bằng chứng thì không ghi.

Trước khi commit: \`ganas validate\`.
`;
}

export function gitignoreAddition(): string {
  const lines = LOCAL_ONLY.map((p) => `.ganas/${p}`).join("\n");
  return `\n# ganas — trạng thái phiên, không chia sẻ giữa các máy\n${lines}\n`;
}

export function sampleGoal(id: string, v: InitVars): string {
  const approved = v.owner
    ? `status: active\napproved_by: "${v.owner}"\napproved_at: ${new Date().toISOString()}\n`
    : `# Chưa có người duyệt ⇒ giữ ở draft. Điền approved_by + approved_at rồi\n` +
      `# chuyển sang active. Model không được tự chốt mục tiêu.\nstatus: draft\n`;

  return `id: ${id}
title: "Đặt tên mục tiêu ở đây"
outcome: "Kết quả người dùng cảm nhận được — không phải việc phải làm"

# Tiêu chí nghiệm thu. Bắt buộc có ít nhất một, và phải trả lời được có/không.
acceptance:
  - id: A-1
    kind: command
    run: "echo 'thay bằng lệnh kiểm tra thật'"
    expect: exit_zero
  # - id: A-2
  #   kind: manual
  #   check: "Kế toán trưởng xác nhận số liệu khớp sổ"
  #   owner: "@ke-toan-truong"

${approved}`;
}

export function sampleSprint(id: string, goalId: string): string {
  const now = new Date();
  const end = new Date(now.getTime() + 14 * 86_400_000);
  return `id: ${id}
title: "Sprint đầu tiên"
goals:
  - ${goalId}
starts_at: ${now.toISOString()}
ends_at: ${end.toISOString()}
status: active
`;
}

export function readme(): string {
  return `# .ganas/

Kho trạng thái và tri thức của dự án, do \`ganas\` quản lý.

| Thư mục | Chứa gì |
|---|---|
| \`goals/\` | Mục tiêu — mỗi file một goal. Phải có người duyệt. |
| \`sprints/\` | Lát cắt thời gian của goal |
| \`designs/\` | Cách tiếp cận. Bắt buộc khai \`serves\` — design không neo vào goal là không hợp lệ. |
| \`tasks/\` | Đơn vị việc vừa một phiên. Có context_contract và exit_contract. |
| \`parts/\` | Phần — đơn vị đóng gói bàn giao, có version và bộ nghiệm thu riêng |
| \`modules/\` | Khối của sơ đồ: contract vào/ra, \`depends_on\` = cạnh, \`verify\` = bằng chứng |
| \`facts/\` | Điều kiểm chứng được, có probe chạy lại được |
| \`claims/\` | Điều được tin nhưng chưa kiểm chứng, có anchor |
| \`decisions/\` | Điều người đã chốt |
| \`legacy/\` | Tri thức import từ tài liệu cũ — bị cách ly cho tới khi đối chất |
| \`map/\` | Bản đồ vùng code và survey |
| \`proposals/\` | Đề xuất chờ người duyệt (spine, pack) |
| \`runs/\` | Handoff record theo phiên (không commit) |

Sửa tay được — đều là YAML. Sau khi sửa chạy \`ganas validate\`.
`;
}
