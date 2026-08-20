# ganas

Hướng dẫn thật cho agent nằm ở **`CLAUDE.md`** — đọc file đó trước khi sửa gì.
File này chỉ là cửa trỏ, cố ý không chép lại nội dung để hai bản không trôi
lệch nhau.

Dự án dùng **ganas**: trạng thái công việc và tri thức đã kiểm chứng nằm ở
`.ganas/`. Chạy `ganas next` để lấy task hiện tại, `ganas validate` trước
khi commit. Luật ghi tri thức: `.claude/rules/ganas-knowledge.md` — mọi phát
biểu ghi vào `.ganas/` phải kèm bằng chứng.

Dùng Codex và muốn nó đọc thẳng `CLAUDE.md`: khai
`project_doc_fallback_filenames = ["CLAUDE.md"]` trong `~/.codex/config.toml`.
