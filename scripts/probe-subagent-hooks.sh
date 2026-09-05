#!/bin/sh
# Bằng chứng CODE cho claim C-003 (.ganas/claims/C-003.yaml) — KHÔNG chứng
# minh được hành vi của harness Claude Code lúc sub-agent dừng, chỉ chứng
# minh được cấu hình và code hiện có trong REPO NÀY. Đọc C-003 trước khi dựa
# vào script này: ba câu hỏi mở của T-082 là hành vi harness, và không script
# nào chạy trong sandbox này quan sát được harness thật — xem notes của
# C-003 về giới hạn đó.
#
# Ba khẳng định, exit 0 = còn đúng lúc viết C-003:
#
# (a) Plugin CHƯA đăng ký handler nào cho sự kiện `SubagentStop` — cả ở
#     manifest (`plugin/hooks/hooks.json`) lẫn ở bảng lệnh CLI
#     (`src/commands/hook.ts`). Claude Code chỉ gọi lệnh `ganas hook <event>`
#     khi CHÍNH `<event>` đó có mặt trong manifest; `SubagentStop` không có
#     mặt, nên `ganas hook stop` — và do đó `handlers.stop` — không được
#     harness gọi lúc một sub-agent dừng, THEO CẤU HÌNH HIỆN TẠI. Ngày ai
#     thêm khoá `SubagentStop` vào hooks.json thì khẳng định này sai, và đó
#     đúng là lúc `if (input.agent_id !== undefined) return ALLOW;` (nêu
#     trong context_contract của T-082) trở thành bắt buộc chứ không phải
#     tuỳ chọn.
#
# (b) Ngay cả nếu MỘT NGÀY NÀO ĐÓ `handlers.stop` bị gọi với `agent_id` (vd:
#     ai đó nối `SubagentStop` thẳng vào cùng handler `stop` thay vì viết
#     handler riêng), code HIỆN TẠI không phân biệt gì: cùng session, cùng
#     trạng thái gate, chỉ khác có `agent_id` hay không — vẫn ra đúng một
#     `decision`. Đây là hai hàm hàng xóm (`preToolUse`, `postToolUse`) ĐÃ
#     kiểm `agent_id !== undefined` (xem `fromSubagent` ở
#     src/hooks/io/handlers.ts) mà `stop` thì chưa — chỗ lệch đáng nhớ.
#
# (c) `stop_hook_active` vẫn là short-circuit ĐẦU TIÊN của `stop`: có nó thì
#     ALLOW ngay, bất kể gate đang đỏ cỡ nào và bất kể `agent_id`.
set -e
D=$(mktemp -d)
trap 'rm -rf "$D"' EXIT
CLI="node plugin/dist/cli.js"

# --- (a) cấu hình chưa đăng ký SubagentStop ở đâu cả ------------------------
grep -q "SubagentStop" plugin/hooks/hooks.json && exit 1
grep -qF '"subagent-stop"' src/commands/hook.ts && exit 1

# --- dựng một dự án tối thiểu có gate ĐANG ĐỎ để (b) và (c) có gì mà so ----
mkdir -p "$D/.ganas/goals" "$D/.ganas/scopes" "$D/.ganas/modules" \
  "$D/.ganas/designs" "$D/.ganas/tasks" "$D/src/a"

cat > "$D/.ganas/goals/G-001.yaml" <<'YAML'
id: G-001
title: "Muc tieu thu"
outcome: "Ket qua"
acceptance:
  - id: A-1
    kind: command
    run: "true"
status: active
approved_by: "@nguoi-duyet"
approved_at: 2026-01-01T00:00:00Z
YAML

cat > "$D/.ganas/scopes/P-thu.yaml" <<'YAML'
id: P-thu
title: "Pham vi thu"
version: 0.1.0
owner: "@nguoi-duyet"
status: active
modules:
  - M-a
entry: M-a
acceptance:
  - id: V-thu-smoke
    kind: probe
    run: "test -d src"
YAML

cat > "$D/.ganas/modules/M-a.yaml" <<'YAML'
id: M-a
title: "Khoi thu"
scope: P-thu
nature: code
paths:
  - "src/a/**"
YAML

cat > "$D/.ganas/designs/D-001.yaml" <<'YAML'
id: D-001
title: "Design thu"
serves:
  - G-001
summary: "Cach tiep can"
status: active
YAML

# exit_contract cố ý luôn FAIL (`run: "false"`) — gate đỏ là điều kiện để (b)
# và (c) có nghĩa: so hai lượt gọi `stop` ra cùng một `decision:block` thật,
# không phải cùng một `{}` rỗng vô nghĩa.
cat > "$D/.ganas/tasks/T-001.yaml" <<'YAML'
id: T-001
title: "Task thu"
serves:
  - G-001
implements: D-001
scope: P-thu
status: todo
exit_contract:
  - kind: command
    run: "false"
YAML

$CLI -C "$D" init --yes --project probe >/dev/null 2>&1
# `init` sinh sẵn G-001/config riêng của nó — đè lại bằng bộ tối thiểu ở trên
# rồi mới bind session, để nội dung khớp đúng ba tệp vừa viết.
$CLI --cwd "$D" --session sess-main next >/dev/null 2>&1

write_and_touch() {
  printf '{"cwd":"%s","session_id":"sess-main","tool_name":"Write","tool_input":{"file_path":"%s/src/a/x.ts"}}' "$D" "$D" \
    | $CLI hook post-tool-use >/dev/null
}

# --- (b) agent_id không đổi được quyết định của stop() hiện tại ------------
write_and_touch
OUT_MAIN=$(printf '{"cwd":"%s","session_id":"sess-main"}' "$D" | $CLI hook stop)
echo "$OUT_MAIN" | grep -q '"decision":"block"' || exit 1

write_and_touch
OUT_SUB=$(printf '{"cwd":"%s","session_id":"sess-main","agent_id":"fake-agent","agent_type":"fake"}' "$D" | $CLI hook stop)
[ "$OUT_MAIN" = "$OUT_SUB" ] || exit 1

# --- (c) stop_hook_active thắng bất kể agent_id và gate --------------------
write_and_touch
OUT_ACTIVE=$(printf '{"cwd":"%s","session_id":"sess-main","stop_hook_active":true,"agent_id":"fake-agent"}' "$D" | $CLI hook stop)
[ "$OUT_ACTIVE" = "{}" ] || exit 1

exit 0
