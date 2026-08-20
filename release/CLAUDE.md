# release/

Mọi thứ về SỐ HIỆU phát hành nằm ở đây: lệnh vận hành và lớp cưỡng chế của nó.

| File | Việc |
|---|---|
| `version.mjs` | Lệnh vận hành: `check` / `sync` / `stamp` / `bump <mức>` |
| `version.test.ts` | Lớp cưỡng chế — chạy trong `npm test`, chặn mọi kiểu lệch |

## Nâng version

```
npm run release -- bump minor
```

Chỉ dùng lệnh này. Nó gọi `npm version`, và `npm version` chạy tiếp
`preversion`/`version` khai trong `package.json` — test, đồng bộ manifest, đóng
dấu CHANGELOG, build lại bundle, rồi tạo commit + tag `vX.Y.Z`.

## Bất biến: `package.json` là nguồn duy nhất

Số hiệu còn được khai lại ở bốn chỗ, và **không chỗ nào được sửa tay**:

- `package-lock.json` — npm ghi
- `plugin/.claude-plugin/plugin.json` — `version.mjs sync` ghi (và
  `scripts/build.mjs` gọi nó mỗi lần build)
- tiêu đề trên cùng `CHANGELOG.md` — `version.mjs stamp` ghi
- `__GANAS_VERSION__` trong `plugin/dist/*` — nhúng lúc build

## Cạm bẫy đã trả giá

`stamp` **chỉ đúng ngay sau khi `package.json` vừa bump**. Gọi nó giữa chừng
thì mục "Chưa phát hành" đang viết dở bị nuốt vào một version đã phát hành, và
CHANGELOG có hai mục cùng số mà không ai báo gì. Chuyện này đã xảy ra thật một
lần trong lúc dựng lệnh; nay `stamp` từ chối, và có test giữ.

Chỗ lệch nguy hiểm nhất là quên `npm run build`: bản người dùng cài vẫn chạy
bình thường, chỉ khai sai số hiệu — nên báo lỗi cũng kèm số không tồn tại.

## Chạy test của riêng vùng này

```
npx tsx --test release/version.test.ts
```
