# Luật đặt tên: nói tiếng Việt, viết code tiếng Anh (ganas)

Chat, tài liệu và commit message bằng tiếng Việt. Mọi ĐỊNH DANH trong code bằng
tiếng Anh. Đây là hai chuyện khác nhau; trộn chúng lại chính là chỗ hỏng.

## Ranh giới

| Tiếng Anh — định danh | Tiếng Việt có dấu — văn xuôi và dữ liệu |
|---|---|
| tên biến, hàm, lớp, kiểu | comment, docstring |
| tên file và thư mục | tài liệu, commit message |
| bảng và cột DB, khoá JSON/YAML | chuỗi hiển thị cho người dùng |
| biến môi trường, đường dẫn API | thông báo lỗi |
| tên nhánh git, tên hàm test | mọi văn bản trong `.ganas/` |

## Vì sao: bỏ dấu là MẤT THÔNG TIN, không phải đổi kiểu chữ

`thuoc` là thuốc, thước, hay thuộc? Ba nghĩa không liên quan gì tới nhau, và
định danh thì không có chỗ nào mang dấu quay về. Người đọc sau phải đoán; agent
đọc code cũng đoán; đoán sai thì **không có lỗi nào nổi lên** — chỉ có một hàm
làm việc khác điều tên nó hứa. Tiếng Anh không có chuyện đó: `ruler`,
`medicine`, `belongsTo` mỗi cái đúng một nghĩa.

## Ba dạng sai

```ts
// Chiều dài thước đo, đơn vị mm
const rulerLengthMm = 300;   // ✅
const thuocLengthMm = 300;   // ❌ thuốc? thước? thuộc?
const chiềuDàiThước = 300;   // ❌ dấu trong định danh
function getDonHang() {}     // ❌ nửa Anh nửa Việt

throw new Error("Không tìm thấy đơn hàng"); // ✅ chuỗi hiển thị là dữ liệu
```

## Không có ngoại lệ cho định danh

Thuật ngữ nghiệp vụ Việt Nam vẫn dịch: `taxCode`, `citizenId`,
`redInvoice`. Bản dịch làm mất một sắc thái pháp lý thì ghi comment tiếng
Việt giải nghĩa **ngay chỗ khai báo lần đầu** — đừng giữ tên phiên âm để "cho
sát nghiệp vụ". Tên phiên âm không giữ được nghiệp vụ; nó chỉ giấu nghiệp vụ
đi, kể cả khỏi chính người viết sáu tháng sau.

## Chuỗi hiển thị là dữ liệu, không phải định danh

ganas in tiếng Việt có dấu ra terminal, và điều đó đúng luật. Ranh giới nằm ở
chỗ: thứ MÁY tra cứu bằng tên (biến, khoá, cột) thì tiếng Anh; thứ NGƯỜI đọc
(nội dung) thì tiếng Việt.

## Máy kiểm được tới đâu

Chữ CÓ DẤU trong định danh thì grep ra được. Chữ BỎ DẤU thì không — không lệnh
nào phân biệt nổi `thuoc` với một từ viết tắt tiếng Anh. Nên đây là hướng
dẫn, **không có hook nào chặn**; chỗ bắt thật là lúc review.
