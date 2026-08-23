# Luật kiến trúc: tách lõi khỏi I/O (ganas)

Lõi nghiệp vụ không được gọi thẳng ra ngoài (filesystem, network, DB, hàng đợi).
Muốn chạm ngoài thì đi qua một ranh giới rõ ràng — đây là hexagonal
architecture / ports & adapters, áp dụng bất kể ngôn ngữ.

## Ánh xạ vào sơ đồ khối của ganas

`Module.nature` đã sẵn có bốn giá trị, và chúng CHÍNH LÀ ranh giới này:

- `code` / `data` / `llm` — **lõi**. Không tự đọc/ghi nội dung file, không tự
  gọi network, không tự query DB bên trong. (Tra trạng thái qua công cụ dùng
  chung thì được — xem mục ngay dưới.)
- `io` — **nơi CHẠM I/O thật**. API, hàng đợi, filesystem — đúng như docstring
  của `MODULE_NATURE` đã định nghĩa.

Lõi **định nghĩa port** (interface/Protocol) và không nhét
`fetch`/`fs.readFile`/query thẳng vào code của mình. Khối `io` **cài đặt** port đó,
nên chính nó khai `depends_on: [<khối lõi>]` — adapter phụ thuộc lõi, không ngược
lại. Đó cũng là chiều mà `ganas scope new` sinh ra khi nó tự tách hai khối.

## Công cụ io dùng chung — dùng nó KHÔNG làm hàm gọi nó thành io

Ranh giới trên còn thiếu một vế, và thiếu vế đó thì luật tự mâu thuẫn: gần như
mọi hàm nghiệp vụ đều có lúc phải hỏi "chỗ này có tồn tại không".

| Tra trạng thái — **CÔNG CỤ** | Chạm ra ngoài thật — **I/O** |
|---|---|
| `existsSync`, `stat`, `readdir` | đọc/ghi NỘI DUNG file |
| hỏi có/không, hỏi danh sách tên | sinh tiến trình con |
| — | stdin/stdout, network, DB, hàng đợi |

Hàm nghiệp vụ gọi **công cụ** vẫn là hàm nghiệp vụ: nó đang DÙNG công cụ, không
phải đang LÀ chỗ chạm. Khối chứa nó không vì thế mà phải khai `io`.

Ranh giới nằm đúng chỗ đó vì nó là ranh giới của việc TEST. Hàm chỉ hỏi "có tồn
tại không" vẫn test được bằng một thư mục tạm, không phải dựng gì. Hàm đọc nội
dung thì kéo theo định dạng dữ liệu, lỗi phân tích cú pháp và phiên bản schema —
đó mới là thứ đáng nhốt sau một ranh giới để còn thay được.

Hai điều kiện, thiếu một là hỏng luật:

1. **Công cụ phải nằm MỘT chỗ dùng chung.** Mỗi nơi tự `import` một kiểu thì
   không còn gì để thay khi đổi nền tảng, và "công cụ" chỉ là tên gọi khác của
   "gọi thẳng".
2. **Luật này KHÔNG nới cho thứ khác.** Nạp cả một tài liệu, gọi mạng, query DB,
   chạy lệnh shell — vẫn là `io`, bọc đẹp đến đâu cũng vậy.

Đây là một nới lỏng CÓ CHỦ Ý so với hexagonal chặt. Bản chặt bắt mọi thứ chạm
đĩa đi qua port, kể cả một câu hỏi có/không — trả giá bằng một tầng interface
cho thứ không ai bao giờ thay. Nới đúng chỗ này giữ lại cái đắt (đổi hạ tầng
không đụng nghiệp vụ) và bỏ cái rẻ.

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

ganas không có validator nào bắt vi phạm này — khác luật ghi tri thức
(`.claude/rules/ganas-knowledge.md`), đây không có hook nào chặn. Áp dụng khi
viết code, và khi gán `nature` cho khối mới: hỏi "khối này có tự đọc/ghi nội
dung, tự gọi ra ngoài không" trước khi chọn `io`.

Dự án muốn cưỡng chế thật thì tự viết một test: duyệt `paths` của từng khối,
đếm xem file trong đó gọi hàm I/O nào, rồi đối chiếu với `nature` đã khai. Rẻ,
và bắt được đúng kiểu trôi âm thầm mà đọc code không thấy.
