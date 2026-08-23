import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { exists, existsAsync, listDir } from "../src/util/fsprobe.js";
import { cleanup } from "./helpers.js";

/**
 * `src/util/fsprobe.ts` — công cụ tra trạng thái dùng chung.
 *
 * Test này canh hai thứ: hành vi của công cụ, VÀ điều kiện (1) của luật kiến
 * trúc — "công cụ phải nằm một chỗ". Không có vế thứ hai thì luật chỉ là một
 * đoạn văn, và `existsSync` lại rải ra khắp nơi sau vài tháng.
 */

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ganas-fsprobe-"));
}

test("exists / existsAsync: có thì true, không thì false", async () => {
  const dir = await tempDir();
  try {
    const file = join(dir, "co-that.txt");
    await writeFile(file, "x", "utf8");

    assert.equal(exists(file), true);
    assert.equal(exists(join(dir, "khong-co.txt")), false);
    assert.equal(await existsAsync(file), true);
    assert.equal(await existsAsync(join(dir, "khong-co.txt")), false);
  } finally {
    await cleanup(dir);
  }
});

test("listDir: trả đúng tên và phân biệt được file với thư mục", async () => {
  const dir = await tempDir();
  try {
    await writeFile(join(dir, "a.txt"), "x", "utf8");
    await mkdir(join(dir, "con"));

    const entries = await listDir(dir);
    const names = entries.map((e) => e.name).sort();
    assert.deepEqual(names, ["a.txt", "con"]);
    assert.equal(entries.find((e) => e.name === "a.txt")!.isFile(), true);
    assert.equal(entries.find((e) => e.name === "con")!.isDirectory(), true);
  } finally {
    await cleanup(dir);
  }
});

test("listDir: thư mục không tồn tại → mảng rỗng, KHÔNG ném", async () => {
  // Mọi nơi gọi trong ganas đều đang duyệt cây: gặp nhánh không vào được thì bỏ
  // qua rồi đi tiếp. Ném ở đây là huỷ cả lượt duyệt vì một thư mục lạ.
  assert.deepEqual(await listDir(join(tmpdir(), "ganas-khong-bao-gio-co-thu-muc-nay")), []);
});

/* --- Điều kiện (1) của luật: công cụ phải nằm MỘT chỗ --------------------- */

test("⭐ chỉ fsprobe.ts và các khối io được import thẳng node:fs để TRA trạng thái", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const root = join(import.meta.dirname, "..");

  /**
   * Khối `nature: io` được phép chạm thẳng — chúng CHÍNH LÀ chỗ chạm. Luật chỉ
   * cấm phần lõi tự gọi. Danh sách này phải khớp `nature` trong
   * `.ganas/modules/`, và test `module-nature` (T-022) mới là chỗ canh điều đó.
   */
  const ALLOWED = new Set([
    "src/util/fsprobe.ts",
    "src/util/exec.ts",
    "src/graph/load.ts",
    "src/util/yaml.ts",
    "src/graph/claim.ts",
    "src/state.ts",
    "src/hooks/io.ts",
    "src/mcp/server.ts",
  ]);

  const walk = async (dir: string): Promise<string[]> => {
    const out: string[] = [];
    for (const e of await readdir(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) out.push(...(await walk(rel)));
      else if (e.name.endsWith(".ts")) out.push(rel);
    }
    return out;
  };

  /**
   * Chưa chuyển sang `fsprobe`, và mỗi dòng nợ một task cụ thể.
   *
   * Tập này là TẬP ĐÓNG, so bằng `deepEqual`: thêm một chỗ tra thẳng mới thì
   * test đỏ vì nó không có trong danh sách; chuyển xong một chỗ mà quên xoá
   * dòng tương ứng cũng đỏ. Nên danh sách chỉ đi một chiều — ngắn dần.
   *
   * Khác hẳn một danh sách "bỏ qua": bỏ qua thì im lặng phình ra, còn cái này
   * mỗi lần đụng vào đều phải sửa bằng tay và giải thích được vì sao.
   */
  const PENDING = [
    // T-021 — chẻ M-workflow (PR-005)
    "src/commit.ts — existsSync",
    "src/flow.ts — existsSync",
    "src/gate.ts — existsSync",
    "src/handoff.ts — existsSync",
    "src/prune.ts — existsSync",
    "src/prune.ts — readdir, stat",
    // Chưa có task: lớp lệnh CLI và hai khối còn lại của D-006
    "src/commands/commit.ts — existsSync",
    "src/commands/icebox.ts — existsSync",
    "src/commands/init.ts — existsSync",
    "src/commands/note.ts — existsSync",
    "src/commands/scope.ts — existsSync",
    "src/commands/scope.ts — readdir",
    "src/graph/freshness.ts — stat",
    "src/render/brief.ts — existsSync",
    "src/verify/ledger.ts — existsSync",
  ].sort();

  const offenders: string[] = [];
  for (const f of await walk("src")) {
    if (ALLOWED.has(f)) continue;
    const text = await readFile(join(root, f), "utf8");
    // Chỉ bắt phép TRA. Đọc/ghi nội dung là chuyện của luật khác (`nature`).
    for (const m of text.matchAll(/import \{([^}]*)\} from "node:fs(?:\/promises)?"/g)) {
      const probes = m[1]!
        .split(",")
        .map((x) => x.trim().split(" as ")[0]!.trim())
        .filter((x) => ["existsSync", "stat", "statSync", "readdir", "readdirSync"].includes(x));
      if (probes.length > 0) offenders.push(`${f} — ${probes.join(", ")}`);
    }
  }

  assert.deepEqual(
    offenders.sort(),
    PENDING,
    `Danh sách chỗ tra filesystem thẳng đã LỆCH khỏi tập đã khai.\n` +
      `Thêm chỗ mới: đi qua src/util/fsprobe.ts. Vừa chuyển xong một chỗ: xoá dòng\n` +
      `tương ứng khỏi PENDING. Luật "công cụ io dùng chung"\n` +
      `(.claude/rules/architecture.md) chỉ đứng được khi công cụ nằm MỘT chỗ.`,
  );
});
