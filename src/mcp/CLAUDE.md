# src/mcp/ — adapter MCP: phát lệnh ganas ra ngoài qua stdio

<!-- Khối `M-mcp`. File này chỉ được nạp khi agent đụng vào file trong thư
     mục này. Không chép lại luật gốc ở đây. -->

Khối này là `nature: io` — adapter, nơi CHẠM I/O thật: mở một kết nối stdio và
để một MCP host bên ngoài (Cursor, Windsurf, editor khác Claude Code) gọi vào.
Đúng chiều hexagonal: `depends_on: M-commands` — adapter phụ thuộc lõi điều
phối lệnh, không ngược lại. Bản thân file không có logic nghiệp vụ riêng: mỗi
tool chỉ gọi thẳng `run(argv)` của đúng command CLI đã có trong
`src/commands/*.ts`, y hệt cách `src/cli.ts` gọi.

## Cổng vào

`createServer(): McpServer` (`server.ts`) — đăng ký bảy tool trong bảng
`TOOLS` lên một `McpServer`; mỗi tool khai `description` + `inputSchema`
(`ARGS_SCHEMA`, đúng một field `args: string[]` — gõ y hệt sau `ganas <lệnh>`)
rồi chạy qua `runTool`. `main()` là entry tiến trình thật, nối
`StdioServerTransport` — nhưng KHÔNG phải chỗ Claude Code hay MCP host nào
nạp trực tiếp: chúng gọi `plugin/bin/ganas-mcp.mjs`, file đó `import()` bundle
đã build sẵn ở `plugin/dist/mcp.js` (`scripts/build.mjs`), không phải
`server.ts` gốc.

## Bất biến dễ phá

- **Tool ở đây không được có hành vi riêng lệch khỏi CLI.** Khác biệt hợp lệ
  duy nhất là NGUỒN argv (JSON từ MCP tool call, không phải `process.argv`)
  và cách LẤY kết quả (`captureStdout` chụp lại thay vì để in thẳng ra
  terminal) — xem docstring đầu `server.ts`. Thêm rẽ nhánh riêng cho MCP là
  tạo ra hai hành vi khác nhau cho cùng một lệnh `ganas`.
- **Editor nối qua MCP KHÔNG có hàng rào `PreToolUse`/`Stop` như Claude
  Code.** MCP không có khái niệm tương đương — server này chỉ chạy tool theo
  yêu cầu. Brief/gate/verify vẫn dùng được, nhưng KHÔNG có gì chặn ghi tri
  thức sai hay chặn kết thúc phiên sớm cho đường vào này (comment đầu
  `server.ts`). Đừng viết test hay tài liệu ngụ ý MCP có cùng mức cưỡng chế.
- **Tool call phải chạy TUẦN TỰ, không xen kẽ.** `captureStdout` thay tạm
  `process.stdout.write` — một thao tác TOÀN CỤC trên `process`. Hai lệnh
  chạy song song sẽ ghi lẫn output vào nhau nếu không qua hàng đợi
  `serialize()` ở cuối file.

## Cạm bẫy đã trả giá

Trước P2 N30, bundle build ra ngoài `plugin/` — Claude Code (và mọi MCP host)
cài plugin bằng cách copy ĐÚNG thư mục `plugin/`, nên bản cài qua marketplace
báo "cài thành công" rồi **im lặng không làm gì**, chế độ hỏng tệ nhất cho một
công cụ mà giá trị là cưỡng chế (`scripts/build.mjs:2-8`). MCP entry đi đúng
khuôn đó: build ra `plugin/dist/mcp.js` NGAY TRONG `plugin/`, và
`plugin/bin/ganas-mcp.mjs` chỉ resolve đường dẫn bên trong `plugin/`, không
trỏ ra `dist/` ở gốc repo hay `node_modules/` (comment đầu
`plugin/bin/ganas-mcp.mjs`). `test/plugin-selfcontained.test.ts` dựng lại
đúng điều kiện đó — copy riêng `plugin/` sang thư mục tạm, không kèm gì khác —
và có test riêng cho đúng MCP server (`⭐ MCP server chạy được khi copy RIÊNG
thư mục plugin/, trả lời tools/list`).

## Chạy test riêng của vùng

```
npx tsx --test 'test/plugin-selfcontained.test.ts'
```

## Tri thức kiểm chứng được

Đừng viết kết luận thành chữ ở đây — ghi fact có probe trong `.ganas/` rồi trỏ
id. Bằng chứng của khối này: `V-mcp-selfcontained` (`.ganas/modules/M-mcp.yaml`).
