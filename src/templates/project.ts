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
import { guideFileName, type Harness } from "../model/config.js";

export interface InitVars {
  project: string;
  owner?: string | undefined;
  /** Harness khai lúc init — quyết định tên file hướng dẫn và dòng `harness:`. */
  harness?: Harness | undefined;
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

# Harness giao việc:
#   claude-code | codex | cursor | zed | windsurf | gemini | other
# Quyết định HAI thứ. Một: brief hướng dẫn giao task kiểu nào — claude-code thì
# tạo sub-agent với model của tier; các harness còn lại chỉ nối qua MCP nên
# brief chỉ khuyến nghị đổi model trong picker. Hai: TÊN FILE HƯỚNG DẪN mà
# \`ganas init\` sinh (CLAUDE.md / AGENTS.md / GEMINI.md) — mỗi công cụ đọc một
# tên khác nhau. Repo mở bằng nhiều editor thì khai cái bạn thật sự giao việc
# từ đó, rồi trỏ công cụ còn lại sang đúng file đó thay vì chép file thứ hai.
harness: ${v.harness ?? "claude-code"}

# Model thật cho từng tier. Task khai \`model: <tier>\` lúc chẻ, brief tra ở đây.
#   main     — việc khó/mơ hồ, cần phán đoán
#   verifier — khoảng giữa
#   scribe   — việc cơ học, ít quyết định (tier thấp để đỡ nghĩ quá tay)
models:
  main: claude-opus-5
  verifier: claude-sonnet-5
  scribe: claude-haiku-4-5
`;
}

/**
 * File hướng dẫn ở gốc dự án — TÊN FILE phụ thuộc harness (`guideFileName()`).
 *
 * Ngắn, chỉ đường. Nạp mọi phiên nên mỗi dòng đều tốn context; luật đầy đủ nằm
 * ở `.claude/rules/*.md`, không nhét vào đây.
 */
export function guideMd(v: InitVars): string {
  const guide = guideFileName(v.harness ?? "claude-code");
  return `# ${v.project}

Dự án này dùng **ganas** để kiểm soát phiên làm việc. Trạng thái công việc và tri
thức đã kiểm chứng nằm ở \`.ganas/\`, không nằm trong đầu bạn và không nằm trong
file tổng kết tự do.

## Bắt đầu một phiên

Brief của task hiện tại được bơm tự động lúc mở phiên. Nếu không thấy, chạy:

\`\`\`
ganas next
\`\`\`

## Luật

Đọc trước khi sửa gì — mỗi file một luật, đều nằm ở \`.claude/rules/\`:

| File | Luật |
|---|---|
| \`ganas-knowledge.md\` | **Không có bằng chứng thì không được ghi vào kho tri thức.** Luật quan trọng nhất, và là luật duy nhất có hook chặn. |
| \`architecture.md\` | Tách lõi nghiệp vụ khỏi I/O. |
| \`naming.md\` | Định danh trong code bằng tiếng Anh, văn xuôi bằng tiếng Việt. |
| \`agent-guide.md\` | Viết file hướng dẫn cho agent: ngắn ở gốc, đặt gần code. |
| \`ganas-git.md\` | Tag semver, ký commit theo repo, không nhắc AI trong commit. |

## Lệnh hay dùng

| Lệnh | Việc |
|---|---|
| \`ganas next\` | Task kế tiếp + brief đầy đủ |
| \`ganas validate\` | Kiểm tra graph trước khi commit |
| \`ganas verify <id>\` | Chạy probe của một fact |
| \`ganas gate\` | Chấm điều kiện hoàn thành của task đang làm |
| \`ganas commit\` | Commit task đã đạt gate — chỉ khi thật sự xong |

<!-- Giữ ${guide} dưới ~200 dòng. Thông tin riêng một vùng code → ${guide}
     trong chính thư mục đó. Quy trình nhiều bước → chuyển thành skill.
     Xem .claude/rules/agent-guide.md. -->
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

Lõi **định nghĩa port** (interface/Protocol) và không nhét
\`fetch\`/\`fs.readFile\`/query thẳng vào code của mình. Khối \`io\` **cài đặt** port đó,
nên chính nó khai \`depends_on: [<khối lõi>]\` — adapter phụ thuộc lõi, không ngược
lại. Đó cũng là chiều mà \`ganas scope new\` sinh ra khi nó tự tách hai khối.

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

/**
 * Luật viết file hướng dẫn cho agent — TÊN FILE do harness quyết định, nên
 * luật phải nhận `harness` chứ không nói chung chung "CLAUDE.md".
 *
 * Không có frontmatter `paths:` — cùng lý do với các luật khác: luật phải sống
 * suốt phiên, không chỉ khi đang đọc một file khớp pattern.
 */
export function guideRuleMd(harness: Harness): string {
  const guide = guideFileName(harness);
  return `# Luật viết file hướng dẫn cho agent (ganas)

File hướng dẫn là thứ agent đọc TRƯỚC KHI đọc code. Nó không phải kho tri thức,
và không phải chỗ chép lại những gì đọc code là biết.

## Tên file phụ thuộc môi trường, không đóng cứng

Dự án này khai \`harness: ${harness}\` trong \`.ganas/config.yaml\`, nên file
hướng dẫn của nó tên \`${guide}\`. Không có tên nào dùng chung được cho mọi
công cụ:

| Harness | File nó TỰ đọc |
|---|---|
| \`claude-code\` | \`CLAUDE.md\` — **không** đọc \`AGENTS.md\`, kể cả ở thư mục con |
| \`codex\`, \`cursor\`, \`zed\`, \`windsurf\` | \`AGENTS.md\` |
| \`gemini\` | \`GEMINI.md\` (đổi được bằng \`context.fileName\`) |

Muốn công cụ thứ hai đọc được thì **cấu hình công cụ đó**, đừng chép file:
Codex có \`project_doc_fallback_filenames\`, Gemini có \`context.fileName\`, VS
Code Copilot có \`chat.useClaudeMdFile\`. Hai bản đầy đủ song song thì bản sai
luôn là bản không ai đọc.

## Ba chỗ đặt, ba loại nội dung

- **\`${guide}\` ở gốc** — bảng chỉ đường. Nạp MỌI phiên nên mỗi dòng đều tốn
  context. Giữ dưới **200 dòng**. Chỉ nói: dự án là gì, gõ gì để bắt đầu, luật
  nằm ở đâu.
- **\`${guide}\` trong THƯ MỤC CON** — đúng vai \`README.md\` ngày xưa. Chỉ
  được nạp khi agent đụng vào file trong thư mục đó, nên phiên không liên quan
  không phải trả context cho nó.
- **\`.claude/rules/*.md\` không có \`paths:\`** — luật phải sống suốt phiên.

## Đặt ở thư mục nào thì hết mơ hồ

Ranh giới đã có sẵn trong graph: \`paths\` của khối trong \`.ganas/modules/\`. Một
khối → một \`${guide}\` ở thư mục gốc của khối đó. Chưa có khối thì chưa cần file.

## Viết gì

Cổng vào thật của vùng (hàm nào là entry), bất biến dễ phá, cạm bẫy đã trả giá
bằng một lần hỏng, lệnh chạy test riêng của vùng.

## Không viết gì

- Thứ đọc code ba mươi giây là biết.
- Danh sách file — lệch ngay hôm sau.
- Tổng kết văn xuôi của phiên trước.
- Điều kiểm chứng được: cái đó ghi thành fact có probe trong \`.ganas/\`, ở đây
  chỉ trỏ id.

## Vì sao nhồi hết vào file gốc thì sinh ảo giác

Chữ trong file hướng dẫn không có anchor, không có \`last_verified_at\`, không
hook nào bắt nó phải còn đúng. Càng dài thì càng nhiều dòng đã lỗi thời được
trình cho mọi phiên như sự thật — trong khi Codex cắt cứng ở 32 KiB và Windsurf
ở 12.000 ký tự mỗi file, **cắt im lặng, không báo lỗi**. **File hướng dẫn không
phải kho tri thức**; kho ở \`.ganas/\` — xem \`.claude/rules/ganas-knowledge.md\`.

## Cái giá của việc đặt gần code, phải biết trước

File ở thư mục con **không được nạp lại sau khi context bị nén** — phải đọc lại
một file trong vùng đó thì nó mới quay về. Nên chia đúng: thứ chỉ đúng khi đang
sửa vùng đó thì đặt gần code; thứ phải LUÔN đúng thì để ở \`.claude/rules/\`
không có \`paths:\`.

Chưa xác minh được: import \`@file\` trong file hướng dẫn ở thư mục con nạp lười
hay nạp ngay lúc mở phiên — tài liệu không nói. Đừng dựa vào nó để tiết kiệm
context.

## Đây là hướng dẫn, không phải luật máy kiểm

Không lệnh nào chấm được "thông tin có vừa đủ không" — khác luật ghi tri thức,
ở đây không có hook nào chặn. Tự kiểm rẻ nhất: \`wc -l ${guide}\`.
`;
}

export function gitRuleMd(): string {
  // Không có frontmatter `paths:` — cùng lý do với knowledgeRuleMd()/
  // architectureRuleMd(): quy ước git áp dụng bất kể đang sửa file nào.
  return `# Luật git: tag, ký commit (ganas)

## Tag: semver trần, không ghép tên công cụ

Tag của DỰ ÁN NÀY là \`vX.Y.Z\` (semver) — vd \`v1.2.0\`. KHÔNG phải
\`<tên>--vX.Y.Z\`.

Định dạng \`<tên>--vX.Y.Z\` là quy ước RIÊNG của \`claude plugin tag\`. Ngay cả
repo ganas — bản thân nó LÀ một Claude Code plugin — cũng không tag kiểu đó:
entry marketplace của nó khai \`source: ./plugin\` (đường dẫn trong chính repo),
nên version lấy từ \`plugin/.claude-plugin/plugin.json\`, không phải từ tag. Mọi
tag của ganas đều trần. Dự án chỉ DÙNG ganas thì lại càng không có lý do gì.

\`\`\`
git tag -a v1.2.0 -m "..."
git push origin v1.2.0
\`\`\`

Tốt hơn: đừng gõ tay. Cho lệnh nâng version của dự án tạo tag (\`npm version\`
tạo đúng \`vX.Y.Z\`), để số hiệu trong code và tag không thể lệch nhau — gõ tay
thì lệch là chuyện sớm muộn, và tag đã đẩy đi thì không rút lại sạch được.

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

export function namingRuleMd(): string {
  // Không có frontmatter `paths:` — cùng lý do với ba luật trên: quy ước đặt
  // tên áp dụng cho mọi file code, không riêng một vùng.
  return `# Luật đặt tên: nói tiếng Việt, viết code tiếng Anh (ganas)

Chat, tài liệu và commit message bằng tiếng Việt. Mọi ĐỊNH DANH trong code bằng
tiếng Anh. Đây là hai chuyện khác nhau; trộn chúng lại chính là chỗ hỏng.

## Ranh giới

| Tiếng Anh — định danh | Tiếng Việt có dấu — văn xuôi và dữ liệu |
|---|---|
| tên biến, hàm, lớp, kiểu | comment, docstring |
| tên file và thư mục | tài liệu, commit message |
| bảng và cột DB, khoá JSON/YAML | chuỗi hiển thị cho người dùng |
| biến môi trường, đường dẫn API | thông báo lỗi |
| tên nhánh git, tên hàm test | mọi văn bản trong \`.ganas/\` |

## Vì sao: bỏ dấu là MẤT THÔNG TIN, không phải đổi kiểu chữ

\`thuoc\` là thuốc, thước, hay thuộc? Ba nghĩa không liên quan gì tới nhau, và
định danh thì không có chỗ nào mang dấu quay về. Người đọc sau phải đoán; agent
đọc code cũng đoán; đoán sai thì **không có lỗi nào nổi lên** — chỉ có một hàm
làm việc khác điều tên nó hứa. Tiếng Anh không có chuyện đó: \`ruler\`,
\`medicine\`, \`belongsTo\` mỗi cái đúng một nghĩa.

## Ba dạng sai

\`\`\`ts
// Chiều dài thước đo, đơn vị mm
const rulerLengthMm = 300;   // ✅
const thuocLengthMm = 300;   // ❌ thuốc? thước? thuộc?
const chiềuDàiThước = 300;   // ❌ dấu trong định danh
function getDonHang() {}     // ❌ nửa Anh nửa Việt

throw new Error("Không tìm thấy đơn hàng"); // ✅ chuỗi hiển thị là dữ liệu
\`\`\`

## Không có ngoại lệ cho định danh

Thuật ngữ nghiệp vụ Việt Nam vẫn dịch: \`taxCode\`, \`citizenId\`,
\`redInvoice\`. Bản dịch làm mất một sắc thái pháp lý thì ghi comment tiếng
Việt giải nghĩa **ngay chỗ khai báo lần đầu** — đừng giữ tên phiên âm để "cho
sát nghiệp vụ". Tên phiên âm không giữ được nghiệp vụ; nó chỉ giấu nghiệp vụ
đi, kể cả khỏi chính người viết sáu tháng sau.

## Chuỗi hiển thị là dữ liệu, không phải định danh

ganas in tiếng Việt có dấu ra terminal, và điều đó đúng luật. Ranh giới nằm ở
chỗ: thứ MÁY tra cứu bằng tên (biến, khoá, cột) thì tiếng Anh; thứ NGƯỜI đọc
(nội dung) thì tiếng Việt.

## Máy kiểm được tới đâu

Chữ CÓ DẤU trong định danh thì grep ra được. Chữ BỎ DẤU thì không — không lệnh
nào phân biệt nổi \`thuoc\` với một từ viết tắt tiếng Anh. Nên đây là hướng
dẫn, **không có hook nào chặn**; chỗ bắt thật là lúc review.
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

/**
 * File CỬA TRỎ — ghi khi file hướng dẫn chính không tên `AGENTS.md`.
 *
 * CỐ Ý ngắn và CỐ Ý không chép nội dung: hai bản hướng dẫn đầy đủ song song thì
 * bản sai luôn là bản không ai đọc. Nó chỉ tồn tại để một agent đọc `AGENTS.md`
 * (Codex, Cursor, Zed…) tìm được file thật thay vì kết luận dự án không có
 * hướng dẫn nào.
 */
export function guidePointerMd(v: InitVars, guide: string): string {
  return `# ${v.project}

Hướng dẫn thật cho agent nằm ở **\`${guide}\`** — đọc file đó trước khi sửa gì.
File này chỉ là cửa trỏ, cố ý không chép lại nội dung để hai bản không trôi
lệch nhau.

Dự án dùng **ganas**: trạng thái công việc và tri thức đã kiểm chứng nằm ở
\`.ganas/\`. Chạy \`ganas next\` để lấy task hiện tại, \`ganas validate\` trước
khi commit. Luật ghi tri thức: \`.claude/rules/ganas-knowledge.md\` — mọi phát
biểu ghi vào \`.ganas/\` phải kèm bằng chứng.

Dùng Codex và muốn nó đọc thẳng \`${guide}\`: khai
\`project_doc_fallback_filenames = ["${guide}"]\` trong \`~/.codex/config.toml\`.
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
| \`icebox/\` | Việc đã quyết CHƯA làm — phát hiện giữa phiên, chấm điểm, chưa tới lượt làm |
| \`legacy/\` | Tri thức import từ tài liệu cũ — bị cách ly cho tới khi đối chất |
| \`map/\` | Bản đồ vùng code và survey |
| \`proposals/\` | Đề xuất chờ người duyệt (spine, pack) |
| \`runs/\` | Handoff record theo phiên (không commit) |

Sửa tay được — đều là YAML. Sau khi sửa chạy \`ganas validate\`.
`;
}

/**
 * Khung file hướng dẫn cho MỘT KHỐI, đặt tại thư mục gốc của khối đó
 * (`moduleGuideDir()`, src/model/module.ts).
 *
 * ## Vì sao khung này thiếu vài mục mà người ta hay muốn thêm
 *
 * Không có mục "tổng quan dự án", không có mục "quy ước chung", không có chỗ
 * liệt kê file. Ba thứ đó là ba cách làm hỏng cùng một thứ:
 *
 *  - Tổng quan/quy ước đã nằm ở file hướng dẫn GỐC và ở `.claude/rules/`.
 *    Chép lại ở đây là dựng bản thứ hai, và bản thứ hai luôn là bản lỗi thời
 *    trước — nhưng người đọc không biết bản nào mới.
 *  - Danh sách file lệch ngay hôm sau, còn `ls` thì không bao giờ lệch.
 *
 * Tham chiếu chỉ đi MỘT CHIỀU: gốc → khối. File này nói về vùng của chính nó,
 * không mô tả khối khác và không nhắc lại luật gốc. Muốn nói về khối khác thì
 * trỏ ID (`M-xxx`) để người đọc tự mở, đừng tóm tắt hộ.
 *
 * Thứ KIỂM CHỨNG ĐƯỢC thì không viết thành chữ ở đây — ghi thành fact có probe
 * trong `.ganas/` rồi trỏ id, vì chữ trong file hướng dẫn không có
 * `last_verified_at` và không hook nào bắt nó phải còn đúng.
 */
export function moduleGuideMd(v: {
  /** ID khối, vd `M-render`. */
  id: string;
  title: string;
  /** Thư mục gốc của khối — cũng là chỗ file này nằm. */
  dir: string;
  /** `Module.nature`: code | data | llm | io. */
  nature: string;
  /** Lệnh probe của khối, nếu đã khai. */
  probes: readonly string[];
}): string {
  const io =
    v.nature === "io"
      ? `Khối này là \`nature: io\` — **đây là nơi chạm ra ngoài thật** (file, mạng, tiến ` +
        `trình con, DB). Lõi không được tự làm việc đó; nếu bạn thấy một khối lõi gọi thẳng ` +
        `ra ngoài, đó là chỗ lệch đáng ghi \`ganas proposal new\`.
`
      : `Khối này là \`nature: ${v.nature}\` — **lõi**. Không tự mở file, không tự gọi mạng, ` +
        `không tự query DB ở đây; chạm ra ngoài thì đi qua một khối \`io\`.
`;

  const testBlock = v.probes.length
    ? v.probes.map((run) => `${run}`).join("\n")
    : `# khối này chưa khai probe nào — \`ganas validate\` đang báo verify/module-unverified`;

  return `# ${v.dir}/ — ${v.title}

<!-- Khối \`${v.id}\`. File này chỉ được nạp khi agent đụng vào file trong thư mục
     này, nên nó KHÔNG phải chỗ chép lại luật gốc hay tổng quan dự án. Viết ở đây
     đúng thứ chỉ đúng khi đang sửa vùng này. -->

${io}
## Cổng vào

<!-- Hàm/file nào là cửa vào thật của vùng, và ai gọi nó. Một đoạn, không phải
     danh sách file — \`ls\` làm việc đó tốt hơn và không bao giờ lệch. -->

TODO

## Bất biến dễ phá

<!-- Điều phải luôn đúng ở vùng này mà code không tự bảo vệ được. Mỗi mục một
     dòng, nói rõ HỎNG RA SAO nếu phá — "phải cẩn thận" thì không ai làm gì được. -->

TODO

## Cạm bẫy đã trả giá

<!-- CHỈ ghi thứ đã hỏng thật một lần. Cạm bẫy tưởng tượng làm loãng cạm bẫy
     thật, và người đọc sẽ ngừng đọc cả hai. -->

TODO

## Chạy test riêng của vùng

\`\`\`
${testBlock}
\`\`\`

## Tri thức kiểm chứng được

<!-- Đừng viết kết luận thành chữ ở đây. Ghi fact có probe trong \`.ganas/\` rồi
     trỏ id — chữ ở file này không có last_verified_at, không ai bắt nó còn đúng. -->

- (chưa có — \`ganas search\` để tìm fact của phạm vi này)
`;
}
