# Luật viết file hướng dẫn cho agent (ganas)

File hướng dẫn là thứ agent đọc TRƯỚC KHI đọc code. Nó không phải kho tri thức,
và không phải chỗ chép lại những gì đọc code là biết.

## Tên file phụ thuộc môi trường, không đóng cứng

Dự án này khai `harness: claude-code` trong `.ganas/config.yaml`, nên file
hướng dẫn của nó tên `CLAUDE.md`. Không có tên nào dùng chung được cho mọi
công cụ:

| Harness | File nó TỰ đọc |
|---|---|
| `claude-code` | `CLAUDE.md` — **không** đọc `AGENTS.md`, kể cả ở thư mục con |
| `codex`, `cursor`, `zed`, `windsurf` | `AGENTS.md` |
| `gemini` | `GEMINI.md` (đổi được bằng `context.fileName`) |

Muốn công cụ thứ hai đọc được thì **cấu hình công cụ đó**, đừng chép file:
Codex có `project_doc_fallback_filenames`, Gemini có `context.fileName`, VS
Code Copilot có `chat.useClaudeMdFile`. Hai bản đầy đủ song song thì bản sai
luôn là bản không ai đọc.

## Ba chỗ đặt, ba loại nội dung

- **`CLAUDE.md` ở gốc** — bảng chỉ đường. Nạp MỌI phiên nên mỗi dòng đều tốn
  context. Giữ dưới **200 dòng**. Chỉ nói: dự án là gì, gõ gì để bắt đầu, luật
  nằm ở đâu.
- **`CLAUDE.md` trong THƯ MỤC CON** — đúng vai `README.md` ngày xưa. Chỉ
  được nạp khi agent đụng vào file trong thư mục đó, nên phiên không liên quan
  không phải trả context cho nó.
- **`.claude/rules/*.md` không có `paths:`** — luật phải sống suốt phiên.

## Đặt ở thư mục nào thì hết mơ hồ

Ranh giới đã có sẵn trong graph: `paths` của khối trong `.ganas/modules/`. Một
khối → một `CLAUDE.md` ở thư mục gốc của khối đó. Chưa có khối thì chưa cần file.

## Viết gì

Cổng vào thật của vùng (hàm nào là entry), bất biến dễ phá, cạm bẫy đã trả giá
bằng một lần hỏng, lệnh chạy test riêng của vùng.

## Không viết gì

- Thứ đọc code ba mươi giây là biết.
- Danh sách file — lệch ngay hôm sau.
- Tổng kết văn xuôi của phiên trước.
- Điều kiểm chứng được: cái đó ghi thành fact có probe trong `.ganas/`, ở đây
  chỉ trỏ id.

## Vì sao nhồi hết vào file gốc thì sinh ảo giác

Chữ trong file hướng dẫn không có anchor, không có `last_verified_at`, không
hook nào bắt nó phải còn đúng. Càng dài thì càng nhiều dòng đã lỗi thời được
trình cho mọi phiên như sự thật — trong khi Codex cắt cứng ở 32 KiB và Windsurf
ở 12.000 ký tự mỗi file, **cắt im lặng, không báo lỗi**. **File hướng dẫn không
phải kho tri thức**; kho ở `.ganas/` — xem `.claude/rules/ganas-knowledge.md`.

## Cái giá của việc đặt gần code, phải biết trước

File ở thư mục con **không được nạp lại sau khi context bị nén** — phải đọc lại
một file trong vùng đó thì nó mới quay về. Nên chia đúng: thứ chỉ đúng khi đang
sửa vùng đó thì đặt gần code; thứ phải LUÔN đúng thì để ở `.claude/rules/`
không có `paths:`.

Chưa xác minh được: import `@file` trong file hướng dẫn ở thư mục con nạp lười
hay nạp ngay lúc mở phiên — tài liệu không nói. Đừng dựa vào nó để tiết kiệm
context.

## Đây là hướng dẫn, không phải luật máy kiểm

Không lệnh nào chấm được "thông tin có vừa đủ không" — khác luật ghi tri thức,
ở đây không có hook nào chặn. Tự kiểm rẻ nhất: `wc -l CLAUDE.md`.
