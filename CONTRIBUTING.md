# Đóng góp code cho ganas

Tài liệu này dành cho người (hoặc agent) sửa code trong repo `ganas` này.
Không phải hướng dẫn dùng ganas trong dự án khác — cái đó ở `docs/`
(`CONCEPTS.md`, `COMMANDS.md`, `WORKFLOW.md`).

## 1. Quy ước comment/docstring

Mặc định **không viết comment**. Tên định danh tốt (hàm, biến, field) đã tự
nói WHAT nó làm — comment lặp lại điều đó chỉ là nhiễu, tốn context của người
đọc lẫn của agent.

Chỉ viết comment khi giải thích **WHY**, cụ thể là một trong:

- Một ràng buộc ẩn không nhìn thấy được từ code (vd tại sao dùng `.strict()`
  thay vì để zod bỏ qua field lạ).
- Một invariant tinh vi mà vi phạm nó không lộ lỗi ngay.
- Workaround cho một lỗi/hạn chế cụ thể (của thư viện, môi trường, v.v.).
- Hành vi sẽ khiến người đọc bất ngờ nếu không được cảnh báo trước.

Không viết comment giải thích WHAT. Ví dụ đúng, từ `src/verify/mutate.ts`:

```ts
/**
 * Mutation test cho probe.
 *
 * Lint bắt được kiểu lười lộ liễu (`true`, `echo ok`). Nhưng `ls src >/dev/null`
 * thì qua lint mà vẫn không bao giờ fail. Cách duy nhất chứng minh một probe CÓ
 * KHẢ NĂNG fail là bóp méo nó rồi bắt nó fail thật.
 *
 * Không nhận ra dạng ⇒ nói thẳng là "chưa chứng minh được", chứ không im lặng
 * coi như đã chứng minh.
 */
```

Đây là WHY (tại sao cần mutation test, tại sao không im lặng khi không nhận
dạng được), không phải liệt kê hàm làm gì. So sánh với `src/graph/freshness.ts`:
mỗi hằng số/hàm nhỏ chỉ có một dòng comment nếu có lý do thật sự cần nói, đa
số hàm phụ hoàn toàn không có comment.

Docstring viết bằng **tiếng Việt** — nhất quán với toàn bộ codebase hiện tại.

## 2. `.strict()` bắt buộc trên zod object mới

Mọi `z.object({...})` mới thêm vào `src/model/` phải kết thúc bằng
`.strict()`. Lý do, nguyên văn từ comment ở `src/model/common.ts` (áp cho
`zProbe`, cùng lý do áp dụng cho mọi schema khác):

> `.strict()`: trường lạ là LỖI, không bị bỏ qua im lặng. Viết nhầm `skipif:`
> hay `verifiy:` mà zod lặng lẽ vứt đi thì người viết tưởng mình có guard,
> thực ra không có — đúng kiểu ảo giác mà ganas sinh ra để chống, chỉ khác là
> lần này do công cụ gây ra.

Nói cách khác: không có `.strict()`, một lỗi gõ tên field (rất dễ xảy ra khi
model sinh YAML) sẽ bị zod âm thầm bỏ qua thay vì báo lỗi — field coi như
không tồn tại, và không ai biết cho tới khi hành vi sai lệch xuất hiện ở xa
chỗ gõ nhầm. Mọi schema object mới trong `src/model/*.ts` (goal, scope,
design, task, module, part, v.v.) đều tuân theo cùng một khuôn: object trước,
`.strict()` ngay sau.

## 3. Bảng tiền tố ID

Mọi ID trong ganas có tiền tố cố định, định nghĩa ở `src/model/common.ts`
(`ID_PATTERNS`) và `src/model/verification.ts` (`zVerificationId`).

| Tiền tố | Loại | Ví dụ |
| --- | --- | --- |
| `G-` | Goal | `G-001` |
| `D-` | Design | `D-001` |
| `T-` | Task | `T-001` |
| `F-` | Fact | `F-ACC-007` |
| `C-` | Claim | `C-031` |
| `LC-` | Legacy claim | `LC-007` |
| `DEC-` | Decision | `DEC-004` |
| `M-` | Module | `M-intent` |
| `P-` | Phạm vi công việc (Scope) | `P-chat-core` |
| `V-` | Verification | `V-intent-smoke` |

Lưu ý: **Decision dùng `DEC-`, không phải `D-`** — `D-` đã là tiền tố của
Design. Dễ nhầm nếu nhớ theo trực giác, luôn kiểm lại `ID_PATTERNS` trong
`src/model/common.ts` khi không chắc.

## 4. Luật bắt buộc `hint` cho `Diagnostic` mới

`Diagnostic` (`src/graph/types.ts`) có field `hint?: string`. Convention hiện
tại trong `src/graph/validate.ts`: **mọi** `diags.push({...})` đều kèm `hint`
nói cách sửa, không chỉ báo có lỗi. Ví dụ:

```ts
diags.push({
  severity: "error",
  code: "spine/design-missing-goal",
  message: `design ${d.id} phục vụ goal ${goalId} nhưng goal đó không tồn tại`,
  file: design.file,
  line: at(graph, design, "serves", i),
  hint: `Tạo .ganas/goals/${goalId}.yaml, hoặc sửa lại serves.`,
});
```

**Luật**: mọi validator rule mới thêm vào `validate.ts` (hoặc bất kỳ nơi nào
sinh `Diagnostic`) bắt buộc phải có `hint`. Lỗi phải actionable — hook trả
`hint` này lại cho Claude qua `reason`, nên nó chính là thứ quyết định model
có tự sửa được hay không, không phải chỉ để người đọc log.

## 5. Tooling hiện có

Script trong `package.json`:

- `npm run typecheck` — `tsc --noEmit`, kiểm kiểu không build ra `dist/`.
- `npm run lint` / `npm run lint:fix` — ESLint (flat config,
  `typescript-eslint` type-checked); `lint:fix` tự sửa những gì sửa được.
- `npm run format` / `npm run format:check` — Prettier ghi đè / chỉ kiểm tra
  không sửa.
- `npm test` — chạy toàn bộ test bằng `node:test` (`tsx --test test/**/*.test.ts`).
- `npm run test:coverage` — chạy test qua `c8` với ngưỡng coverage
  (`--lines 88 --branches 80`); **hiện chỉ gate `src/graph/` và `src/verify/`**
  (phần lõi kiểm chứng), không bắt buộc cho `src/commands/`.
- `npm run build` — biên dịch ra `dist/` (`tsc -p tsconfig.json`).

## 6. Test convention

Dùng `node:test` — không dùng vitest/jest. Helper dựng project test nằm ở
`test/helpers.ts`: `makeProject()` dựng một `.ganas/` tạm từ map
đường-dẫn→nội-dung, `check()` nạp + validate rồi trả về toàn bộ diagnostic,
và các builder YAML mặc định-hợp-lệ `goal()`/`scope()`/`design()`/`task()`/`moduleYaml()`
(ghi đè phần cần làm sai để test ca lỗi). Pattern chuẩn: dựng project tạm
trong thư mục temp, dọn bằng `cleanup(root)` trong khối `finally` (xem
`check()` trong `test/helpers.ts`) để không rò thư mục tạm khi test throw.
Xem `test/spine.test.ts` để có ví dụ đầy đủ, đại diện cho cách viết test
trong repo.
