---
name: prune
description: Dọn dẹp .ganas/ — xoá handoff cũ và session mồ côi (local, không chia sẻ), archive task done/sprint closed đủ tuổi sang thư mục con (giữ git history, không xoá). Mặc định chỉ xem trước, không đụng đĩa. Dùng khi .ganas/ bắt đầu đầy task/sprint cũ hoặc runs/ chất đống.
when_to_use: "tasks/ hoặc runs/ có vẻ đầy đồ cũ, trước khi xem lại sprint kế tiếp, dọn định kỳ"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" *)
---

# Dọn dẹp

!`node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" prune`

---

## Ba tầng — không trộn lẫn

| Tầng | Gồm | Hành động |
|---|---|---|
| Ephemeral, local | `runs/*.md` của phiên đã kết thúc, session mồ côi trong `state.json` | **Xoá thẳng** — không chia sẻ, không phải bằng chứng |
| Shared, đã đóng | `tasks/` status `done`, `sprints/` status `closed`, đủ tuổi (mặc định 7 ngày) | **Archive** — dời sang `done/`/`closed/`, giữ trong git history |
| Vĩnh viễn | `verify-ledger.jsonl`, `claims/`, `decisions/`, `facts/` | Ngoài phạm vi lệnh này, tuyệt đối không đụng |

Task/sprint còn bị thứ khác tham chiếu tới (`blocked_by`, hoặc task khác vẫn
dùng sprint đó) thì **giữ lại**, không archive — tránh để lại liên kết treo.

## Luôn xem trước

Lệnh trên mặc định chỉ IN RA sẽ dọn gì, chưa đụng gì tới đĩa. Đồng ý thì
chạy thêm `--yes`:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" prune --yes
```

Đổi ngưỡng tuổi: `--older-than 14` (mặc định 7 ngày).

## Sau khi archive

Task/sprint bị dời file, không bị xoá — vẫn xem lại được trong
`tasks/done/`, `sprints/closed/`, hoặc qua git history. Chúng biến mất khỏi
`ganas validate`/`ganas next` vì không còn "đang hoạt động", không phải vì
mất dữ liệu.
