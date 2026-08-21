# src/model/ — kiểu dữ liệu lõi của graph (schema Zod)

<!-- Khối `M-model`. File này chỉ được nạp khi agent đụng vào file trong thư
     mục này. Không chép lại luật gốc ở đây. -->

Khối này là `nature: code` — **lõi**. Nó không mở file, không gọi network,
không query DB; nó chỉ khai `z.object` và các hàm thuần tính trên dữ liệu đã
có trong tay (`freshnessOf`, `moduleGuideDir`, `modulePathsOverlap`,
`parseAnchorString`). Đọc/ghi YAML thật nằm ở `src/graph/` — khối đó phụ
thuộc vào đây, không ngược lại.

## Cổng vào

`index.ts` re-export mọi schema và type; nơi khác trong repo luôn `import
{...} from "../model/index.js"`, không bao giờ trỏ thẳng vào từng file. Bốn
schema mang tri thức dự án (`zFact`, `zClaim`, `zDecision`, `zIcebox`,
`zProposal`) sống ở `knowledge.ts`/`icebox.ts`/`proposal.ts` vì chúng chia sẻ
luật với nhau (thang điểm `zScoreValue`, hằng `CLOCK_SKEW_MS`); các thực thể
trục VIỆC/HỆ THỐNG (`zGoal`, `zDesign`, `zTask`, `zModule`, `zScope`,
`zVerification`) mỗi cái một file riêng theo đúng tên thực thể.

## Bất biến dễ phá

- **Mọi `z.object` ở đây phải `.strict()`.** Trường lạ là lỗi, không bị Zod
  âm thầm vứt đi — xem comment ở `zProbe` (`common.ts`) và `zDecision`
  (`knowledge.ts`) giải thích đúng lý do này.
- **Trạng thái bất khả thi phải thành lỗi parse, không phải một cảnh báo đọc
  sau.** Đây là việc của `superRefine`, không phải của `validate.ts`: ví dụ
  `Icebox.promoted_to` chỉ hợp lệ khi `status === "promoted"`
  (`icebox.ts`), `Proposal` ở `status: "pending"` mà đã có `decided_by` là
  lỗi (`proposal.ts`), `Goal.status === "active"` mà thiếu `approved_by` là
  lỗi (`goal.ts`). Thêm một trường mới phụ thuộc trạng thái thì phải thêm
  cùng kiểu ràng buộc ở `superRefine`, không phải hy vọng người viết YAML tự
  nhớ.
- **Mọi trường schema phải có người đọc ngoài `src/model/`.** Guard test
  (xem dưới) chặn việc khai một trường rồi không nối dây cho nó — một lời
  hứa suông mà người dùng điền vào tưởng có tác dụng.
- **`zAnchors`/`zScopeId` bắt buộc trên fact/claim/proposal không phải tuỳ
  chọn thẩm mỹ.** Đây là chỗ luật `.claude/rules/ganas-knowledge.md` được
  cưỡng chế ở tầng schema, trước khi hook PostToolUse kịp chạy.

## Cạm bẫy đã trả giá

Guard test `test/no-dead-ends.test.ts` ("mọi trường schema đều có ít nhất
một người đọc ngoài `src/model/`") tồn tại vì lớp lỗi này đã xảy ra thật
nhiều lần trên chính repo: `zone_survey` (luật cưỡng chế không hook nào
đọc), `part.exit` (trường bắt buộc không nơi nào dùng), `Fact.ttl_days`
(đọc nhầm cấp nên chưa từng chạy — xem thêm chú thích ở
`src/verify/run.ts` về `Target.ttlDays`), `Probe.cwd` (khai rồi bị nuốt),
`LedgerEntry.n`/`passed` (không bao giờ được ghi). Thêm một trường mới vào
schema ở đây mà chưa có chỗ đọc thật thì `npx tsx --test
test/no-dead-ends.test.ts` đỏ, không đợi tới lúc ai đó phát hiện bằng tay.

## Chạy test riêng của vùng

```
npx tsx --test 'test/icebox-model.test.ts'
```

## Tri thức kiểm chứng được

Đừng viết kết luận thành chữ ở đây — ghi fact có probe trong `.ganas/` rồi trỏ
id. Chữ ở file này không có `last_verified_at`, không hook nào bắt nó còn đúng.
