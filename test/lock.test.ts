import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { withFileLock } from "../src/util/lock.js";

/**
 * `withFileLock` — mutex quanh một lượt ĐỌC-SỬA-GHI vào file dùng chung.
 *
 * Ba tính chất dưới đây là toàn bộ hợp đồng của nó, và mỗi cái đã có một chỗ
 * hỏng thật đứng sau: loại trừ lẫn nhau (ICE-014, `appendEntry` sinh `seq`
 * trùng), nhả khoá khi `fn` ném (lỗi ứng dụng không được biến thành khoá treo
 * vĩnh viễn), và giành lại khoá bỏ hoang theo TTL MILI GIÂY (tiến trình giữ
 * khoá crash thì file khoá ở lại — TTL dài kiểu `claim.ttl_minutes` sẽ khoá
 * cả file hàng giờ).
 */

const TTL_MS = 1000;

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ganas-lock-"));
}

test("⭐ hai lượt chạy chồng KHÔNG chồng lấn nhau trong vùng găng", async () => {
  const dir = await tempDir();
  try {
    const lock = join(dir, "sub", "a.lock"); // thư mục chưa có — withFileLock phải tự tạo
    let inside = 0;
    let maxInside = 0;

    const critical = async (): Promise<void> => {
      inside++;
      maxInside = Math.max(maxInside, inside);
      await new Promise((r) => setTimeout(r, 30));
      inside--;
    };

    await Promise.all(Array.from({ length: 5 }, () => withFileLock(lock, TTL_MS, critical)));

    assert.equal(maxInside, 1, "hai lượt đã cùng ở trong vùng găng — khoá không loại trừ được");
    assert.deepEqual(await readdir(join(dir, "sub")), [], "khoá chưa được nhả sau khi xong");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("fn ném lỗi thì khoá vẫn được nhả, và lỗi vẫn nổi lên nguyên vẹn", async () => {
  const dir = await tempDir();
  try {
    const lock = join(dir, "b.lock");
    await assert.rejects(
      withFileLock(lock, TTL_MS, () => Promise.reject(new Error("hỏng trong vùng găng"))),
      /hỏng trong vùng găng/,
    );

    // Lượt sau phải vào được ngay — nếu khoá còn treo thì nó sẽ phải đợi hết TTL.
    const startedAt = Date.now();
    const got = await withFileLock(lock, TTL_MS, () => Promise.resolve("vào được"));
    assert.equal(got, "vào được");
    assert.ok(Date.now() - startedAt < TTL_MS, "lượt sau phải vào ngay, không phải đợi hết TTL");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("⭐ khoá bỏ hoang quá TTL bị giành lại — TTL tính bằng MILI GIÂY", async () => {
  const dir = await tempDir();
  try {
    const lock = join(dir, "c.lock");
    // File khoá còn nguyên nhưng không ai giữ — đúng thứ một tiến trình crash
    // giữa chừng để lại.
    await writeFile(lock, "", "utf8");

    const startedAt = Date.now();
    const got = await withFileLock(lock, 50, () => Promise.resolve("giành lại được"));
    const waited = Date.now() - startedAt;

    assert.equal(got, "giành lại được");
    assert.ok(waited < 2000, `đợi ${waited}ms — TTL phải là mili giây, không phải phút`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("giữ khoá lâu bất thường thì ném lỗi có tên file, không treo vô hạn", async () => {
  const dir = await tempDir();
  try {
    const lock = join(dir, "d.lock");
    const ttlMs = 60;

    // Một lượt giữ khoá lâu hơn cả `ttlMs * 5` mà vẫn CHẠM vào file khoá liên
    // tục (mtime luôn mới) — lượt thứ hai không được coi nó là bỏ hoang, mà
    // phải bỏ cuộc kèm chẩn đoán.
    let acquired!: () => void;
    const holding = new Promise<void>((r) => (acquired = r));
    const holder = withFileLock(lock, ttlMs, async () => {
      acquired();
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 40));
        await writeFile(lock, "", "utf8"); // làm mới mtime, như một tiến trình còn sống
      }
    });
    await holding; // lượt thứ hai chỉ được bắt đầu khi khoá CHẮC CHẮN đã có chủ

    await assert.rejects(
      withFileLock(lock, ttlMs, () => Promise.resolve("không được vào")),
      (err: Error) => err.message.includes(lock) && /không giành được khoá/.test(err.message),
    );

    await holder;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
