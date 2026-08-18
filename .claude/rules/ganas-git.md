# Luật git: tag, ký commit (ganas)

## Tag: semver trần, không ghép tên công cụ

Tag của DỰ ÁN NÀY là `vX.Y.Z` (semver) — vd `v1.2.0`. KHÔNG phải
`<tên>--vX.Y.Z`.

Định dạng `<tên>--vX.Y.Z` là quy ước RIÊNG của `claude plugin tag` — chỉ áp
dụng khi CHÍNH dự án này là một Claude Code plugin, dùng để marketplace phân
giải version (ganas dùng đúng cách này cho chính repo ganas). Dự án dùng
ganas không có nghĩa là phải tag theo kiểu đó.

```
git tag -a v1.2.0 -m "..."
git push origin v1.2.0
```

## Ký commit: cấu hình theo TỪNG repo, không `--global`

Có ganas ⇒ cấu hình ký commit cục bộ cho repo này. Không sửa `--global` —
mỗi repo có thể cần key/chính sách khác nhau, sửa global là ép mọi repo khác
trên máy dùng chung một quyết định không liên quan tới chúng.

```
git config gpg.format ssh
git config user.signingkey <đường dẫn public key SSH đang dùng để push>
git config commit.gpgsign true
```

Sau đó đăng ký ĐÚNG public key đó trên git host — GitHub: Settings → SSH and
GPG keys → New SSH key → **Key type: Signing Key** (mục riêng, khác
Authentication Key dù cùng một key). Thiếu bước này thì commit vẫn được ký
nhưng host vẫn báo "Unverified".

## Không có "Co-Authored-By" / nhắc AI trong commit

`ganas commit` không tự thêm dòng này. Khi commit trực tiếp bằng
`git commit` (không qua `ganas commit`), có hai lớp:

- `attribution.commit: ""` trong `.claude/settings.json` — chặn Claude Code
  TỰ ĐỘNG chèn dòng này.
- Hook `.githooks/commit-msg` (`ganas init` tự bật bằng
  `git config core.hooksPath .githooks`) — bắt và **tự xoá** dòng
  `Co-Authored-By` nhắc Claude/Anthropic khỏi MỌI commit, kể cả khi ai đó
  (người hoặc agent) gõ tay dòng đó vào message. Đây là lớp cưỡng chế thật:
  `attribution.commit` chỉ chặn được đường tự động, không chặn được người
  tự gõ — hook chặn được cả hai vì nó chạy sau cùng, trên chính nội dung
  message, bất kể nguồn.
