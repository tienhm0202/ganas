# Luật kiến trúc: tách lõi khỏi I/O (ganas)

Lõi nghiệp vụ không được gọi thẳng ra ngoài (filesystem, network, DB, hàng đợi).
Muốn chạm ngoài thì đi qua một ranh giới rõ ràng — đây là hexagonal
architecture / ports & adapters, áp dụng bất kể ngôn ngữ.

## Ánh xạ vào sơ đồ khối của ganas

`Module.nature` đã sẵn có bốn giá trị, và chúng CHÍNH LÀ ranh giới này:

- `code` / `data` / `llm` — **lõi**. Không tự mở file, không tự gọi network,
  không tự query DB bên trong.
- `io` — **nơi CHẠM I/O thật**. API, hàng đợi, filesystem — đúng như docstring
  của `MODULE_NATURE` đã định nghĩa.

Lõi **định nghĩa port** (interface/Protocol) và không nhét
`fetch`/`fs.readFile`/query thẳng vào code của mình. Khối `io` **cài đặt** port đó,
nên chính nó khai `depends_on: [<khối lõi>]` — adapter phụ thuộc lõi, không ngược
lại. Đó cũng là chiều mà `ganas scope new` sinh ra khi nó tự tách hai khối.

## Vì sao

Lõi thuần thì test không cần mock hạ tầng thật. Đổi hạ tầng (đổi DB, đổi
provider, đổi API bên thứ ba) không đụng tới logic nghiệp vụ — chỉ thay
implementation ở phía `io`.

## Làm ở TypeScript

Định nghĩa `interface` cho "port" (vd `interface UserRepo { findById(id): User }`).
Lõi phụ thuộc vào interface đó, không phụ thuộc thư viện I/O cụ thể.
Implementation thật (đọc file, gọi API, query DB) nằm ở một module riêng, cài
đặt interface — đó là khối `nature: io`.

## Làm ở Python

Tương tự bằng `Protocol` hoặc `ABC` cho "port". Dependency injection: truyền
instance đã cấu hình sẵn vào hàm/lớp nghiệp vụ, không `import` trực tiếp thứ
chạm I/O (client HTTP, driver DB) ngay trong hàm nghiệp vụ.

## Đây là hướng dẫn, không phải luật máy kiểm

ganas không (và không thể kiểm đáng tin cậy) validator nào bắt vi phạm này —
khác với luật ghi tri thức (`.claude/rules/ganas-knowledge.md`), đây không có
hook nào chặn. Áp dụng khi viết code, và khi gán `nature` cho khối mới: hỏi
"khối này có tự chạm ra ngoài không" trước khi chọn `io` hay không.
