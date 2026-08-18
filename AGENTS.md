# ganas

Hướng dẫn chung cho các coding agent (Claude Code, Codex, Cursor…).

Dự án dùng **ganas**: trạng thái công việc và tri thức đã kiểm chứng nằm ở
`.ganas/`. Trước khi sửa gì, chạy `ganas next` để lấy task hiện tại và brief.

Luật ghi tri thức: xem `.claude/rules/ganas-knowledge.md`. Tóm tắt: mọi phát
biểu ghi vào `.ganas/` phải kèm bằng chứng (anchor `file:line`, commit, hoặc
URL kèm thời điểm lấy). Không có bằng chứng thì không ghi.

Trước khi commit: `ganas validate`.
