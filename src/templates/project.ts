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
#   warn    — chỉ cảnh báo, không chặn (shadow mode; hợp khi mới bắt đầu)
#   enforce — chặn thao tác sai
# Dự án mới bắt đầu bằng enforce luôn: chưa có thói quen cũ nào để phá.
enforcement: enforce

# Bật/tắt riêng từng luật khi cần nới ở một chỗ mà vẫn giữ chặt chỗ khác.
enforcement_rules: {}
  # knowledge_anchor: enforce
  # schema: enforce
  # exit_contract: enforce
  # task_link: enforce

# Harness giao việc: claude-code | cursor | zed | windsurf | other
# Quyết định brief hướng dẫn giao task kiểu nào: claude-code thì tạo sub-agent
# với model của tier; các harness còn lại chỉ nối qua MCP nên brief chỉ khuyến
# nghị đổi model trong picker. Repo mở bằng nhiều editor thì khai cái bạn thật
# sự giao việc từ đó.
harness: claude-code

# Model thật cho từng tier. Task khai \`model: <tier>\` lúc chẻ, brief tra ở đây.
#   main     — việc khó/mơ hồ, cần phán đoán
#   verifier — khoảng giữa
#   scribe   — việc cơ học, ít quyết định (tier thấp để đỡ nghĩ quá tay)
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

Kiến trúc: đọc \`.claude/rules/architecture.md\` — tách lõi nghiệp vụ khỏi I/O.

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

export function architectureRuleMd(): string {
  // Không có frontmatter `paths:` — cùng lý do với knowledgeRuleMd(): đây là
  // hướng dẫn viết code, phải sống suốt phiên, không chỉ khi đang sửa một file cụ thể.
  return `# Luật kiến trúc: tách lõi khỏi I/O (ganas)

Lõi nghiệp vụ không được gọi thẳng ra ngoài (filesystem, network, DB, hàng đợi).
Muốn chạm ngoài thì đi qua một ranh giới rõ ràng — đây là hexagonal
architecture / ports & adapters, áp dụng bất kể ngôn ngữ.

## Ánh xạ vào sơ đồ khối của ganas

\`Module.nature\` đã sẵn có bốn giá trị, và chúng CHÍNH LÀ ranh giới này:

- \`code\` / \`data\` / \`llm\` — **lõi**. Không tự mở file, không tự gọi network,
  không tự query DB bên trong.
- \`io\` — **nơi CHẠM I/O thật**. API, hàng đợi, filesystem — đúng như docstring
  của \`MODULE_NATURE\` đã định nghĩa.

Khối lõi cần thứ gì ở ngoài thì khai \`depends_on\` một khối \`nature: io\`, không
nhét \`fetch\`/\`fs.readFile\`/query thẳng vào code của khối lõi.

## Vì sao

Lõi thuần thì test không cần mock hạ tầng thật. Đổi hạ tầng (đổi DB, đổi
provider, đổi API bên thứ ba) không đụng tới logic nghiệp vụ — chỉ thay
implementation ở phía \`io\`.

## Làm ở TypeScript

Định nghĩa \`interface\` cho "port" (vd \`interface UserRepo { findById(id): User }\`).
Lõi phụ thuộc vào interface đó, không phụ thuộc thư viện I/O cụ thể.
Implementation thật (đọc file, gọi API, query DB) nằm ở một module riêng, cài
đặt interface — đó là khối \`nature: io\`.

## Làm ở Python

Tương tự bằng \`Protocol\` hoặc \`ABC\` cho "port". Dependency injection: truyền
instance đã cấu hình sẵn vào hàm/lớp nghiệp vụ, không \`import\` trực tiếp thứ
chạm I/O (client HTTP, driver DB) ngay trong hàm nghiệp vụ.

## Đây là hướng dẫn, không phải luật máy kiểm

ganas không (và không thể kiểm đáng tin cậy) validator nào bắt vi phạm này —
khác với luật ghi tri thức (\`.claude/rules/ganas-knowledge.md\`), đây không có
hook nào chặn. Áp dụng khi viết code, và khi gán \`nature\` cho khối mới: hỏi
"khối này có tự chạm ra ngoài không" trước khi chọn \`io\` hay không.
`;
}

export function gitRuleMd(): string {
  // Không có frontmatter `paths:` — cùng lý do với knowledgeRuleMd()/
  // architectureRuleMd(): quy ước git áp dụng bất kể đang sửa file nào.
  return `# Luật git: tag, ký commit (ganas)

## Tag: semver trần, không ghép tên công cụ

Tag của DỰ ÁN NÀY là \`vX.Y.Z\` (semver) — vd \`v1.2.0\`. KHÔNG phải
\`<tên>--vX.Y.Z\`.

Định dạng \`<tên>--vX.Y.Z\` là quy ước RIÊNG của \`claude plugin tag\` — chỉ áp
dụng khi CHÍNH dự án này là một Claude Code plugin, dùng để marketplace phân
giải version (ganas dùng đúng cách này cho chính repo ganas). Dự án dùng
ganas không có nghĩa là phải tag theo kiểu đó.

\`\`\`
git tag -a v1.2.0 -m "..."
git push origin v1.2.0
\`\`\`

## Ký commit: cấu hình theo TỪNG repo, không \`--global\`

Có ganas ⇒ cấu hình ký commit cục bộ cho repo này. Không sửa \`--global\` —
mỗi repo có thể cần key/chính sách khác nhau, sửa global là ép mọi repo khác
trên máy dùng chung một quyết định không liên quan tới chúng.

\`\`\`
git config gpg.format ssh
git config user.signingkey <đường dẫn public key SSH đang dùng để push>
git config commit.gpgsign true
\`\`\`

Sau đó đăng ký ĐÚNG public key đó trên git host — GitHub: Settings → SSH and
GPG keys → New SSH key → **Key type: Signing Key** (mục riêng, khác
Authentication Key dù cùng một key). Thiếu bước này thì commit vẫn được ký
nhưng host vẫn báo "Unverified".

## Không có "Co-Authored-By" / nhắc AI trong commit

\`ganas commit\` không tự thêm dòng này. Khi commit trực tiếp bằng
\`git commit\` (không qua \`ganas commit\`), có hai lớp:

- \`attribution.commit: ""\` trong \`.claude/settings.json\` — chặn Claude Code
  TỰ ĐỘNG chèn dòng này.
- Hook \`.githooks/commit-msg\` (\`ganas init\` tự bật bằng
  \`git config core.hooksPath .githooks\`) — bắt và **tự xoá** dòng
  \`Co-Authored-By\` nhắc Claude/Anthropic khỏi MỌI commit, kể cả khi ai đó
  (người hoặc agent) gõ tay dòng đó vào message. Đây là lớp cưỡng chế thật:
  \`attribution.commit\` chỉ chặn được đường tự động, không chặn được người
  tự gõ — hook chặn được cả hai vì nó chạy sau cùng, trên chính nội dung
  message, bất kể nguồn.
`;
}

/**
 * Git hook thật (không phải Claude Code hook) — chạy trên MỌI commit của
 * repo, bất kể ai/công cụ nào tạo ra nó. Tự xoá dòng Co-Authored-By nhắc
 * Claude/Anthropic thay vì chặn commit: mục tiêu là message sạch, không phải
 * làm khó người đang commit.
 */
export function commitMsgHook(): string {
  return `#!/bin/sh
# ganas: cưỡng chế quy ước "không Co-Authored-By nhắc AI" bằng máy, không
# chỉ dựa vào agent nhớ đúng luật mỗi lần commit — xem
# .claude/rules/ganas-git.md. Tự động bỏ dòng vi phạm rồi cho commit tiếp
# tục (không chặn), vì mục tiêu là commit sạch, không phải làm khó người
# đang commit.

MSG_FILE="$1"

if grep -qiE '^Co-Authored-By:.*(claude|anthropic)' "$MSG_FILE" 2>/dev/null; then
  perl -0pi -e 's/^Co-Authored-By:.*(claude|anthropic).*\\n?//gim; s/\\n+\\z/\\n/' "$MSG_FILE"
  echo "ganas commit-msg hook: đã bỏ dòng Co-Authored-By nhắc AI (xem .claude/rules/ganas-git.md)" >&2
fi

exit 0
`;
}

/**
 * Git hook thật, chạy trên MỌI commit của repo — kiểm hash-chain của sổ cái
 * xác minh.
 *
 * Đây là lớp PHÁT HIỆN, không phải lớp cấm. `--no-verify` bỏ qua được, và
 * repo chưa cài ganas thì hook tự nhường đường (thoát 0) thay vì chặn người
 * ta commit. Giá trị nằm ở chỗ: sổ cái bị sửa tay thì ĐỨT CHAIN và lộ ra —
 * bất kể ai sửa, bằng công cụ gì, có gõ tên file hay không. Lớp cũ khớp tên
 * file trên chuỗi lệnh Bash làm phiền người trung thực mà không cản được
 * người không trung thực, nên đã bỏ.
 */
export function preCommitHook(): string {
  return `#!/bin/sh
# ganas: sổ cái .ganas/verify-ledger.jsonl là append-only và có hash-chain.
# Đứt chain nghĩa là có dòng bị sửa, xoá hoặc đảo thứ tự SAU khi ghi — tức
# bằng chứng "probe đã thật sự chạy" không còn đáng tin.

if command -v ganas >/dev/null 2>&1; then
  ganas ledger --check || exit 1
elif command -v bunx >/dev/null 2>&1 && [ -d node_modules/ganas ]; then
  bunx ganas ledger --check || exit 1
elif command -v npx >/dev/null 2>&1 && [ -d node_modules/ganas ]; then
  npx --no-install ganas ledger --check || exit 1
fi
# Không tìm thấy ganas: nhường đường. Hook không phải hàng rào an ninh —
# \`ganas validate\` và CI mới là chỗ chuyện này được chặn thật.

exit 0
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

export function readme(): string {
  return `# .ganas/

Kho trạng thái và tri thức của dự án, do \`ganas\` quản lý.

| Thư mục | Chứa gì |
|---|---|
| \`goals/\` | Mục tiêu — mỗi file một goal. Phải có người duyệt. |
| \`designs/\` | Cách tiếp cận. Bắt buộc khai \`serves\` — design không neo vào goal là không hợp lệ. |
| \`tasks/\` | Đơn vị việc vừa một phiên. Có context_contract và exit_contract. |
| \`scopes/\` | Phạm vi công việc — ranh giới code + người ký + nghiệm thu. Fact/claim chỉ đúng TRONG một phạm vi. |
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
