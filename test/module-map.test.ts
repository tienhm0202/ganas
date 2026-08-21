import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parse } from "yaml";

import { matchesAny } from "../src/util/glob.js";

/**
 * Bản đồ code phải PHỦ HẾT `src/`.
 *
 * Không phải chuyện gọn gàng: `taskBoundary()` (`src/boundary.ts`) dựng ranh
 * giới của một task từ `paths` của những khối nó chạm, và `ganas commit` chỉ
 * `git add` đúng ranh giới đó. File nằm ngoài mọi khối thì không task nào sở
 * hữu được nó — sửa xong vẫn ở lại working tree, không vào commit nào, không
 * ai nghiệm thu. Hỏng im lặng, đúng loại mà ganas tồn tại để chặn.
 *
 * Test này là lớp cưỡng chế: thêm thư mục mới trong `src/` mà quên khai khối
 * thì đỏ ngay, chứ không đợi tới lúc một commit bị hụt file.
 */

const ROOT = join(import.meta.dirname, "..");

interface ModuleDoc {
  id: string;
  paths?: string[];
}

function modules(): ModuleDoc[] {
  const dir = join(ROOT, ".ganas", "modules");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => parse(readFileSync(join(dir, f), "utf8")) as ModuleDoc);
}

/** Mọi file `.ts` trong `src/`, đường dẫn tương đối gốc repo, dấu `/`. */
function sourceFiles(dir = "src"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sourceFiles(rel));
    else if (entry.name.endsWith(".ts")) out.push(rel);
  }
  return out;
}

test("mọi file trong src/ đều thuộc ít nhất một khối", () => {
  const mods = modules();
  const orphans = sourceFiles().filter(
    (f) => !mods.some((m) => matchesAny(f, m.paths ?? [])),
  );

  assert.deepEqual(
    orphans,
    [],
    `những file này không thuộc khối nào, nên không task nào commit được chúng:\n` +
      orphans.map((f) => `  ${f}`).join("\n"),
  );
});

test("không file nào thuộc hai khối — hai bản đồ lệch nhau là hai sự thật", () => {
  const mods = modules();
  const shared: string[] = [];

  for (const f of sourceFiles()) {
    const owners = mods.filter((m) => matchesAny(f, m.paths ?? [])).map((m) => m.id);
    if (owners.length > 1) shared.push(`${f} → ${owners.join(", ")}`);
  }

  assert.deepEqual(shared, [], `file bị hai khối cùng nhận:\n${shared.join("\n")}`);
});
