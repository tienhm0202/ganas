import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { matchesAny } from "../src/util/glob.js";
import { scanFiles, scanYamlDocs } from "./scan.js";

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

async function modules(): Promise<ModuleDoc[]> {
  return scanYamlDocs<ModuleDoc>(ROOT, ".ganas/modules");
}

/** Mọi file `.ts` trong `src/`, đường dẫn tương đối gốc repo, dấu `/`. */
async function sourceFiles(dir = "src"): Promise<string[]> {
  return scanFiles(ROOT, dir);
}

test("mọi file trong src/ đều thuộc ít nhất một khối", async () => {
  const mods = await modules();
  const orphans = (await sourceFiles()).filter(
    (f) => !mods.some((m) => matchesAny(f, m.paths ?? [])),
  );

  assert.deepEqual(
    orphans,
    [],
    `những file này không thuộc khối nào, nên không task nào commit được chúng:\n` +
      orphans.map((f) => `  ${f}`).join("\n"),
  );
});

test("không file nào thuộc hai khối — hai bản đồ lệch nhau là hai sự thật", async () => {
  const mods = await modules();
  const shared: string[] = [];

  for (const f of await sourceFiles()) {
    const owners = mods.filter((m) => matchesAny(f, m.paths ?? [])).map((m) => m.id);
    if (owners.length > 1) shared.push(`${f} → ${owners.join(", ")}`);
  }

  assert.deepEqual(shared, [], `file bị hai khối cùng nhận:\n${shared.join("\n")}`);
});
