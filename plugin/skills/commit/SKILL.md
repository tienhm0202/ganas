---
name: commit
description: Commit task đã đạt điều kiện hoàn thành — message dựng từ chính dữ liệu đã kiểm chứng (exit_contract, gate), không phải văn xuôi tự bịa. Từ chối commit nếu gate chưa đạt. Dùng khi task đã xong và muốn ghi lại thành một commit.
when_to_use: "task đã đạt gate, muốn commit lại việc vừa làm, sắp kết thúc phiên với task đã xong"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" *)
---

# Commit task đã đạt gate

!`node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" commit`

---

## Cách hoạt động

1. Chấm `exit_contract` của task (giống `ganas gate`). **Chưa đạt thì không
   commit gì cả** — không có commit nào được tạo cho một task chưa xong.
2. `git add` phạm vi của task: `.ganas/` + `paths` của mọi khối trong
   `touches`. Không `git add -A` — không đụng tới file ngoài phạm vi task.
3. Dựng commit message TỪ kết quả gate thật (không phải tự viết tổng kết):
   dòng đầu là `<task id>: <tiêu đề>`, thân liệt kê từng tiêu chí đã ✓, cuối
   là goal/design/scope task phục vụ.
4. Không có gì để commit (cây làm việc trong phạm vi task đã sạch) thì báo
   vậy, không tạo commit rỗng.

## Không bao giờ ghi công AI/trợ lý trong message

Đây là quy ước cứng của `ganas commit`, không phải tuỳ chọn — commit message
không bao giờ có dòng kiểu "Co-Authored-By" hay nhắc tới Claude/AI.

## Tuỳ chọn

| Lệnh | Việc |
|---|---|
| `ganas commit T-001` | Commit đúng task đó, bất kể đang làm task nào |
| `ganas commit --dry-run` | In message sẽ dùng, KHÔNG commit |

Nếu thấy `✗` sau khi chạy, làm nốt mục đó rồi chạy lại — đây chính là mấy
mục `ganas gate` đã báo.
