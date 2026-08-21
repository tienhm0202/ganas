# src/verify/ — chạy bằng chứng và ghi sổ cái

<!-- Khối `M-verify`. File này chỉ được nạp khi agent đụng vào file trong thư
     mục này. Không chép lại luật gốc ở đây. -->

Khối này là `nature: io` — nơi CHẠM I/O thật. Nó chạy lệnh shell của người
dùng (`runShell`), đọc/ghi `verify-ledger.jsonl`, đọc/ghi ngược file fact
YAML. `depends_on: [M-model, M-graph-read, M-util, M-exec]` — chiều phụ thuộc
đúng luật kiến trúc: adapter (đây) phụ thuộc lõi, lõi không biết tới đây.

## Cổng vào

Ba cổng vào THẬT, gọi từ ngoài khối:

- `runTarget()` / `allTargets()` (`run.ts`) — orchestrator chính, gọi từ
  `src/commands/verify.ts` và `src/graph/freshness.ts` (tính độ tươi).
- `readLedger()` / `verifyChain()` / `appendEntry()` (`ledger.ts`) — gọi
  trực tiếp từ bốn nơi khác nhau: `src/commands/ledger.ts`,
  `src/commands/commit.ts`, `src/graph/load.ts` (nạp graph), và
  `src/graph/validate.ts` (đối chiếu chain trước khi cho commit).
- `lintProbe()` / `hasBlockingFinding()` (`lint.ts`) — KHÔNG chỉ dùng nội
  bộ trong `runTarget()`; `src/graph/validate.ts` và `src/graph/trace.ts`
  gọi thẳng để soi probe lúc validate/trace, trước khi probe đó từng được
  chạy.

`mutate.ts` (`proveCanFail`, `mutateProbe`) và `adapters.ts`
(`readEvalResult`) chỉ được gọi từ bên trong `run.ts` — không phải cổng vào
của khối.

## Bất biến dễ phá

- **Sổ cái (`verify-ledger.jsonl`) chỉ được ghi bằng `appendEntry()`, không
  bao giờ sửa tay.** Đây là append-only + hash-chain (`prev_hash`/`seq`,
  cùng lược đồ Secure Scuttlebutt / Certificate Transparency): sửa, xoá,
  hoặc đảo một dòng cũ làm lệch hash của mọi dòng sau nó, và `verifyChain()`
  bắt được ngay từ entry đầu tiên đứt chain. Dòng ghi trước khi có
  hash-chain (không có `prev_hash`) được bỏ qua khi tính, không được coi là
  đứt.
- **Vân tay định nghĩa (`defHash`) phải gồm cả `statement`, không chỉ định
  nghĩa probe.** Thiếu `statement` trong vân tay thì sửa nội dung phát biểu
  mà giữ nguyên probe vẫn qua được `ganas validate` sạch — probe cũ tiếp
  tục "chứng nhận" cho một câu nói khác hẳn (xem lịch sử ở mục dưới).
  `FINGERPRINT_FIELDS` (`model`/`prompt`/`dataset`) bị loại khỏi vân tay
  định nghĩa có chủ đích: chúng được theo dõi riêng thành
  `model_changed`/`prompt_changed`/`dataset_changed` để chẩn đoán không bị
  `definition_changed` nuốt mất.
- **`result: "pass"`/`"fail"` mới được ghi ngược `last_verified_at` vào
  YAML fact.** `unavailable` (skip_if khớp) và `unprovable` (lint chặn,
  dry-run, mutation cannot_fail) không được ghi ngược — nếu không fact
  chưa từng chạy thật sẽ trông như đã kiểm.
- **`proof` chỉ có ba trạng thái phân biệt được, không phải hai.** Vắng mặt
  = chưa chạy mutation test (`--no-mutation`); `"unproven"` = đã chạy nhưng
  không nhận ra dạng probe để bóp méo; `"proven"` = đã chạy và bản bóp méo
  thật sự fail. Gộp "vắng mặt" với "unproven" làm một thì `--no-mutation`
  trông y hệt một lần chạy đủ.
- **`Target.ttlDays` đọc từ cấp đúng, không suy từ `definition`.** Với fact,
  `definition` là `f.verify` (một `zProbe`, không có `ttl_days`) — `ttl_days`
  nằm ở cấp `Fact`, phải truyền tường minh khi dựng `Target` (`factTarget()`
  trong `run.ts`), không được ép kiểu đọc ra từ `definition`.

## Cạm bẫy đã trả giá

- **Vân tay chỉ gồm định nghĩa probe, thiếu `statement` (trước P2 N21).**
  Đường lách khai thác được thật: viết fact "file src/a.ts tồn tại" với
  probe `test -f src/a.ts`, verify pass, rồi sửa MỖI dòng `statement` thành
  một khẳng định hoàn toàn khác trong khi giữ nguyên probe — freshness vẫn
  `fresh`, `ganas validate` vẫn sạch. Một dòng sổ cái có thật, một probe có
  thật, chứng nhận cho một phát biểu khác hẳn. `defHash()` nay bắt buộc
  nhận `statement` — xem docstring ngay trên hàm đó trong `ledger.ts`.
- **Độ tươi từng tính bằng `mtime` của file phụ thuộc (trước P2 N24).**
  `touch -d '2020-01-01' <file>` đảo một fact từ `stale` về `fresh` mà
  không sửa một dòng code nào, và `touch` không nằm trong danh sách lệnh bị
  hook chặn. `deps` trong `LedgerEntry` nay là hash NỘI DUNG (`depsHash()`
  trong `run.ts`), không lùi được bằng cách chỉnh đồng hồ — xem comment
  trên trường `deps` trong `ledger.ts`.
- **`ttl_days` của fact đọc nhầm cấp object nên chưa từng hoạt động (trước
  P2 N26).** Chỗ đọc từng ép kiểu `(definition as { ttl_days?: number })`
  — đúng tên trường, sai cấp dữ liệu, luôn ra `undefined`. Ép kiểu `as` đã
  vô hiệu hoá đúng cái type checker lẽ ra phải bắt được lỗi này. Nay
  `Target` có trường `ttlDays` tường minh, gán lúc dựng target
  (`factTarget()`/`moduleTargets()`/`scopeTargets()`), không đọc lại từ
  `definition`.
- **Probe rỗng ruột qua được lint nhưng không bao giờ fail.** `lint.ts` bắt
  được kiểu lười lộ liễu (`true`, `echo ok`), nhưng `ls src >/dev/null`
  không tautological theo nghĩa đó mà vẫn không bao giờ fail. Đây là lý do
  `mutate.ts` tồn tại: bóp méo probe (đổi đường dẫn, đổi pattern grep) rồi
  bắt nó fail thật — probe pass mà bản bóp méo cũng pass (`cannot_fail`)
  nghĩa là "pass" ban đầu không mang thông tin gì.

## Chạy test riêng của vùng

```
npx tsx --test 'test/verify-run.test.ts'
```

## Tri thức kiểm chứng được

Đừng viết kết luận thành chữ ở đây — ghi fact có probe trong `.ganas/` rồi trỏ
id. Chữ ở file này không có `last_verified_at`, không hook nào bắt nó còn đúng.
