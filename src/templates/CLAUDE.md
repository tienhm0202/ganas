# src/templates/ — chữ mà `ganas init` ghi ra đĩa

<!-- Khối `M-templates`. File này chỉ được nạp khi agent đụng vào file trong thư
     mục này. Không chép lại luật gốc ở đây. -->

Khối này là `nature: code` — **lõi**, và lõi ở đây có nghĩa rất hẹp: mọi hàm
trong này là **hàm thuần trả về chuỗi**. Không `fs`, không `path`, không đọc
gì. Việc ghi đĩa là của `src/commands/init.ts`.

Ranh giới đó không phải hình thức: nhờ nó, test nội dung template không cần
dựng thư mục tạm nào.

## Cổng vào

`project.ts` export một hàm cho mỗi file mà `ganas init` sinh ra
(`configYaml`, `guideMd`, các `*RuleMd`, `sampleGoal`, `readme`…), cộng
`moduleGuideMd` — khung file hướng dẫn cấp THƯ MỤC, do `ganas scope new` gọi
chứ không phải `init`.

## Bất biến dễ phá

- **Không đóng cứng tên `CLAUDE.md` ở bất cứ đâu.** Tên file hướng dẫn phụ
  thuộc `harness` và chỉ được lấy từ `guideFileName(harness)`
  (`src/model/config.ts`). Codex/Cursor/Zed đọc `AGENTS.md`, Gemini đọc
  `GEMINI.md`. Đóng cứng một tên là sinh ra một file mà công cụ của người dùng
  không bao giờ mở.
- **Template dạy luật phải khớp luật đang thi hành.** Mấy hàm `*RuleMd` sinh ra
  `.claude/rules/*.md` cho dự án khác. Sửa hành vi của ganas mà quên sửa chữ ở
  đây thì mọi dự án `init` từ nay được phát một luật sai — và không ai báo, vì
  không hook nào chấm được văn xuôi.
- **Khung `moduleGuideMd` cố tình THIẾU vài mục.** Không có "tổng quan dự án",
  không có "quy ước chung", không có danh sách file. Thêm vào là dựng bản thứ
  hai của thứ đã nằm ở file hướng dẫn gốc, và bản thứ hai luôn lỗi thời trước
  trong khi người đọc không biết bản nào mới. Có test chặn.

## Cạm bẫy đã trả giá

`init` **không bao giờ được đè** file người dùng đã có: `writeNew()` dùng
`flag: "wx"` và báo "kept" khi file tồn tại. Chuỗi ở đây có thể dài và trông vô
hại, nhưng ghi đè một `CLAUDE.md` viết tay là mất chữ không lấy lại được.

## Chạy test riêng của vùng

```
npx tsx --test 'test/init.test.ts' 'test/module-guide.test.ts'
```

## Tri thức kiểm chứng được

Đừng viết kết luận thành chữ ở đây — ghi fact có probe trong `.ganas/` rồi trỏ
id. Chữ ở file này không có `last_verified_at`, không hook nào bắt nó còn đúng.
