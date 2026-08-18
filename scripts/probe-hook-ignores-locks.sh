#!/bin/sh
# Khẳng định GIỚI HẠN VẪN CÒN: preToolUse quyết định chỉ dựa trên sự TỒN TẠI
# của file, không đọc .ganas/.locks/ — nên một phiên KHÁC với phiên đã đặt chỗ
# id vẫn được phép ghi. Exit 0 = giới hạn còn. Ngày hook biết đọc lock, lệnh
# này exit 1 và fact chuyển FAILING.
set -e
D=$(mktemp -d)
trap 'rm -rf "$D"' EXIT
node plugin/dist/cli.js -C "$D" init --yes --project probe >/dev/null 2>&1
node plugin/dist/cli.js --cwd "$D" --session sess-A id task >/dev/null
printf '{"cwd":"%s","session_id":"sess-B","tool_name":"Write","tool_input":{"file_path":"%s/.ganas/tasks/T-001.yaml"}}' "$D" "$D" \
  | node plugin/dist/cli.js hook pre-tool-use | grep -q deny && exit 1
exit 0
