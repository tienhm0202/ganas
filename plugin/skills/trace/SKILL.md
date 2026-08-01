---
name: trace
description: Kiểm tương thích cạnh giữa các khối (output khối nguồn có phủ input khối đích không), in sơ đồ khối dạng Mermaid, và liệt kê nợ kiểm chứng — cạnh chưa có hợp đồng kiểm, hợp đồng trượt, khối chưa có bằng chứng. Dùng sau khi sửa `contract` hoặc `depends_on` của khối, hoặc khi cần nhìn toàn cảnh sơ đồ.
when_to_use: "vừa sửa cổng vào/ra của khối, vừa nối lại depends_on, muốn xem sơ đồ khối hiện tại, muốn biết sơ đồ còn hở ở đâu"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" *)
---

# Cạnh, sơ đồ, nợ kiểm chứng

!`node "${CLAUDE_PLUGIN_ROOT}/bin/ganas.mjs" trace`

---

## Đọc kết quả

| Dấu | Nghĩa |
|---|---|
| `✓` | Cổng khớp (và lệnh kiểm thêm, nếu có, cũng đạt) |
| `✗` | Cổng lệch tên/kiểu, hoặc lệnh kiểm thêm trượt |
| `⚠` | Không kiểm được — khối biến mất, hoặc lệnh kiểm thêm rỗng ruột/nguy hiểm |

Cạnh contract chỉ khai được ở khối **nguồn** (khối chạy trước): thêm một mục
`verify` với `kind: contract` và `to: <khối đích>`. ganas so cổng ra của khối
này với cổng vào bắt buộc của khối đích; khớp tên chưa đủ, kiểu (`shape`)
cũng phải khớp.

## Nợ kiểm chứng

Ba loại, khác `ganas validate` ở chỗ đây là góc nhìn RIÊNG cho sơ đồ:

- **Cạnh chưa có hợp đồng kiểm** — `depends_on` khai cạnh nhưng không có
  `kind: contract` nào kiểm nó. Sơ đồ có cạnh không có nghĩa là cạnh đó đã
  được kiểm tương thích.
- **Hợp đồng trượt** — cổng đã lệch, hoặc lệnh kiểm thêm fail.
- **Khối chưa có bằng chứng** — `verify` rỗng, mọi luồng qua nó không tin được.

Nợ không tự hết khi ignore. Ưu tiên xử lý cạnh trên đường `entry → exit` của
phần đang động tới trước.

## Sơ đồ

Khối mermaid in ra dán thẳng được vào file `.md` để xem trực quan. Mỗi phần
là một subgraph; cạnh nét đứt có nhãn `hợp đồng ✓/✗` là cạnh đã kiểm, cạnh
nét liền không nhãn là `depends_on` chưa có hợp đồng nào kiểm nó.

## Không tự ghi kết quả

Cũng như `ganas verify`, mỗi lần `ganas trace` chạy thật để lại một dòng
trong `.ganas/verify-ledger.jsonl`. Dùng `ganas trace --dry-run` để xem mà
không ghi sổ.
