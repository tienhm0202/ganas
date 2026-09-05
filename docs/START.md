# Bắt đầu ở đây — ganas làm được gì, và tra ở đâu

Tài liệu của ganas dày (~3000 dòng, 6 file). File này là **cửa vào**: đọc 5 phút
là biết ganas giải vấn đề gì, hiện có những gì, và câu hỏi của bạn nằm ở file
nào.

## Vấn đề nó giải

Một phiên Claude Code kết thúc là mọi thứ nó học được biến mất. Phiên sau mở
lên, khám phá lại từ đầu, và đôi khi khám phá ra điều ngược lại. Cách chữa quen
thuộc — bắt model viết một bản tóm tắt văn xuôi — làm mọi thứ tệ hơn: một hiểu
nhầm ở phiên này được trình cho phiên sau như sự thật, và không ai kiểm được.

Ganas không chữa bằng cách bắt model nhớ giỏi hơn. Nó chuyển trạng thái ra khỏi
đầu model, vào `.ganas/` trên đĩa, và **chặn ở tầng hook** những gì ghi vào đó
mà không có bằng chứng.

Hai điều nó bảo đảm, phát biểu đúng bằng thứ code làm được:

1. Không có thứ gì chưa kiểm chứng được trình cho phiên sau như là sự thật.
2. Phiên sau không phải khám phá lại những gì phiên trước đã kiểm chứng được —
   trong cùng một phạm vi công việc.

## Năm phút đầu

```bash
ganas init                  # dựng .ganas/, CLAUDE.md, rules, git hook
ganas scope new             # phỏng vấn: bàn giao gì, code ở đâu, ai ký
ganas                       # in ĐÚNG MỘT bước kế tiếp
```

Lệnh thứ ba là lệnh đáng nhớ nhất. `ganas` trần không in menu — nó in **một**
việc phải làm, kèm lý do và khung dán được. Bí lúc nào thì gõ nó.

## Câu hỏi của bạn nằm ở file nào

| Bạn đang hỏi | Đọc |
|---|---|
| Cài thế nào (plugin / MCP / editor khác) | [INSTALL.md](INSTALL.md) |
| Vì sao ganas làm thế này mà không làm thế kia | [CONCEPTS.md](CONCEPTS.md) |
| Một ngày làm việc thật trông ra sao | [WORKFLOW.md](WORKFLOW.md) |
| Vừa duyệt xong plan trong Plan Mode, giờ làm gì | [PLAN-TO-LOOP.md](PLAN-TO-LOOP.md) |
| Luồng phiên, luồng dịch yêu cầu, luồng kiểm chứng | [FLOWS.md](FLOWS.md) |
| Lệnh này có cờ gì, mã thoát nào | [COMMANDS.md](COMMANDS.md) |
| Ganas hiện có những gì | file này, phần dưới |

## Ganas đang có gì

**18 lệnh** (cộng `hook`, điểm vào nội bộ), **6 hook** cưỡng chế, **10 skill**,
**7 MCP tool**, **49 mã luật** kiểm graph, **9 loại bản ghi**.

### Định hướng — "giờ làm gì"

| Lệnh | Việc |
|---|---|
| `ganas` / `ganas flow` | Đúng một bước kế tiếp, trong 12 chặng cố định |
| `ganas next` | Chọn task kế tiếp và giữ chỗ nó cho phiên này, in brief đầy đủ |
| `ganas brief [task]` | In brief của một task cụ thể |

12 chặng: `init → fix-graph → scope → goal → design → evidence → task → work →
verify → gate → commit → close`. Thứ tự là thứ tự *phụ thuộc*, không phải quy
trình hình thức: graph hỏng thì mọi kết luận phía sau không tin được, nên nó
chặn trước.

### Dịch yêu cầu thành cấu trúc

| Lệnh | Việc |
|---|---|
| `ganas scope new` | Phỏng vấn để biến một câu nói thành phạm vi có ranh giới code, tiêu chí nghiệm thu, người ký |
| `ganas scope assign` | Vá chỗ quên khai phạm vi |
| `ganas id <loại>` | Cấp id kế tiếp, có đặt chỗ nguyên tử — hai phiên song song không nhận trùng số |

### Tri thức

| Lệnh | Việc |
|---|---|
| `ganas verify [target...]` | Chạy bằng chứng thật (probe/eval), ghi vào sổ cái append-only |
| `ganas search <chuỗi>` | Tìm fact liên quan bằng BM25; `--task` dùng chính task làm truy vấn |
| `ganas note "..."` | Ghi chú thô của phiên — **chưa kiểm, không phải fact** |

`ganas verify` không chỉ chạy probe rồi báo pass. Nó còn **bóp méo probe** để
xem probe có khả năng trượt không. Probe pass mà bản bóp méo cũng pass thì kết
quả bị đánh dấu `unprovable` — vì một dấu xanh không thể đỏ là dấu xanh rỗng.

### Sơ đồ khối

| Lệnh | Việc |
|---|---|
| `ganas trace` | Kiểm tương thích cạnh giữa các khối, in sơ đồ Mermaid, báo nợ kiểm chứng |

### Nợ và việc hoãn

| Lệnh | Việc |
|---|---|
| `ganas debt [--all]` | Bảng xếp hạng nợ, chấm **hai trục cùng thang 1–5 rồi cộng** |
| `ganas icebox add` | Ghi một phát hiện đã quyết CHƯA làm, kèm điểm, lý do, anchor |
| `ganas icebox review` | Liệt kê mục đã tới hạn xem lại |
| `ganas icebox close/promote` | Đóng kèm lý do bắt buộc, hoặc thăng cấp thành Task thật |

Hai trục: *quan trọng* (1 chỉ là thông tin · 5 mất dữ liệu, hỏng nền) và *dễ
làm* (1 phải thiết kế lại · 5 sửa một dòng YAML). Tổng cao là làm ngay.

**Task là đã quyết LÀM. Icebox là đã quyết CHƯA làm.** Thứ ganas không cho phép
tồn tại là một việc chưa quyết gì cả, nằm lơ lửng trong đoạn chat.

### Kết thúc một việc

| Lệnh | Việc |
|---|---|
| `ganas gate [task]` | Chấm `exit_contract` bằng cách chạy thật, không hỏi ý kiến model |
| `ganas commit [task]` | Commit task đã đạt gate; message dựng từ dữ liệu đã kiểm chứng |
| `ganas handoff --session <id>` | Bản ghi tiếp nối, **dẫn xuất cơ học** từ transcript |

### Bảo trì

| Lệnh | Việc |
|---|---|
| `ganas init` | Dựng `.ganas/` cho dự án mới |
| `ganas validate` | 49 mã luật: schema, liên kết treo, chu trình, lệch sổ cái |
| `ganas prune` | Dọn ephemeral cũ, archive task done — **mặc định dry-run** |
| `ganas ledger --check` | Kiểm hash-chain của sổ cái |

## Cưỡng chế: cái gì thật sự bị chặn

Sáu hook Claude Code. Đây là phần khiến ganas khác một bộ template YAML:

| Hook | Làm gì |
|---|---|
| `SessionStart` | Bơm brief của task đang làm vào đầu phiên |
| `PreToolUse` | **Chặn trước khi ghi**: sổ cái, `config.yaml`, và `Write` đè file thực thể đã tồn tại |
| `PostToolUse` | Chặn ghi tri thức sai schema hoặc thiếu anchor |
| `Stop` | Chặn kết thúc phiên khi `exit_contract` chưa đạt — **đúng một lần**, rồi nhả ra: chặn tiếp là nhốt người dùng trong vòng lặp họ không thoát được |
| `PreCompact` | Nhắc ghi tri thức ra file trước khi context bị nén — nén xong là thứ chưa ghi biến mất, hoặc tệ hơn: bị tóm tắt thành một phiên bản méo |
| `SessionEnd` | Giải phóng claim task của phiên |

Bốn luật có thể chỉnh riêng mức cưỡng chế (`warn` hoặc `enforce`) trong
`config.yaml`: `knowledge_anchor`, `schema`, `exit_contract`, `task_link`.

Vài thứ **không** theo cờ `warn`/`enforce` — chúng luôn chặn, vì thứ bị đe doạ
là dữ liệu chứ không phải thói quen: ghi thẳng vào sổ cái, và `Write` đè lên
file thực thể đã tồn tại.

## Chín loại bản ghi trong `.ganas/`

| Loại | Bắt buộc có | Ý nghĩa |
|---|---|---|
| Goal | tiêu chí nghiệm thu, người duyệt | Vì sao làm |
| Design | phục vụ goal nào | Cách làm, có thể bị `superseded` |
| Task | `serves`, `implements`, `scope`, `exit_contract` | Đơn vị vừa một phiên |
| Scope | `modules`, `entry`, phiên bản | Ranh giới mà một phát biểu còn đúng |
| Module | `nature` | Khối trên sơ đồ, có cổng vào/ra |
| **Fact** | `verify` probe chạy được | Kiểm chứng được bằng lệnh |
| **Claim** | `anchors` không rỗng | Tin nhưng chưa kiểm — phiên sau phải verify trước khi dựa vào |
| **Decision** | `decided_by`, `decided_at` | Người đã chốt. Model không được tạo hay sửa |
| **Icebox** | điểm, lý do hoãn, anchor, ngày | Việc đã quyết CHƯA làm |

Ba loại in đậm giữa là **ba loại tri thức, không có loại thứ tư**. Icebox không
phải loại thứ tư — nó là *việc*, không phải tri thức: nó không bao giờ được
trình cho phiên sau như sự thật.

## Ganas KHÔNG làm gì

Nói thẳng để bạn không trông đợi nhầm:

- **Không bảo đảm mọi thứ phiên trước học được đều tới tay phiên sau.** Không
  hook nào kiểm được sự tồn tại của thứ đã không được ghi.
- **Không kiểm được kiến trúc.** Luật tách lõi khỏi I/O là hướng dẫn cho người
  viết code, không có validator nào bắt vi phạm.
- **Không chấm được điểm SAI.** Guard bắt được mã luật *thiếu* điểm, không bắt
  được điểm chấm sai. Cách duy nhất là dùng rồi chỉnh.
- **Hook chỉ chạy khi plugin được cài trong Claude Code.** Gọi `ganas` trần từ
  terminal thì lớp đặt chỗ id vẫn hoạt động đầy đủ, nhưng không có gì chặn việc
  ghi đè.
- **Chống đua id chỉ trong phạm vi một máy** — `.ganas/.locks/` không commit.
  Hai máy vẫn có thể tính ra cùng một id; va chạm đó không im lặng, git báo
  `CONFLICT` lúc gộp.

## Ganas tự dùng ganas

Repo này có `.ganas/` của chính nó. Muốn xem một kho tri thức thật trông ra sao
thì đọc `.ganas/facts/` — đặc biệt `F-LOCK-001` và `F-HOOK-002`: hai fact có
probe khẳng định *"giới hạn này VẪN CÒN"*. Ngày ai đó vá, probe trượt và brief
nói "phát biểu này đang SAI" — tức là tín hiệu xoá bản ghi đi, không phải tín
hiệu sửa code.

Và `.ganas/icebox/` có những việc đã được chấm điểm rồi cố ý gác lại.

## Khi bí

```bash
ganas              # bước kế tiếp là gì
ganas flow --all   # toàn cảnh 12 chặng, đang ở đâu
ganas validate     # graph có hỏng chỗ nào không
ganas debt --all   # dự án đang nợ gì, sắp theo mức đáng làm
ganas --help       # danh sách lệnh đầy đủ
```
