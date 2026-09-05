import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { matchesAny } from "../src/util/glob.js";
import { scanFiles, scanYamlDocs } from "./scan.js";

/**
 * Nhãn `nature` của khối phải khớp I/O THẬT của code trong khối đó.
 *
 * Không có test này thì bản đồ trôi âm thầm: nhãn được gán một lần lúc tạo
 * khối rồi không ai đọc lại, trong khi code bên dưới đổi hàng tuần. Chuyện đã
 * xảy ra thật — `M-hooks` khai `code` (lõi) suốt trong khi nó đọc stdin, ghi
 * stdout và ghi file handoff, và chỉ lộ ra khi có người ngồi viết tài liệu
 * vùng cho nó.
 *
 * Luật phân loại theo `.claude/rules/architecture.md`:
 *
 *  - Đọc/ghi NỘI DUNG file, sinh tiến trình con, nói chuyện qua stdin/stdout
 *    ⇒ CHẠM RA NGOÀI THẬT ⇒ khối phải khai `nature: io`.
 *  - Chỉ TRA trạng thái (`existsSync`/`stat`/`readdir`) ⇒ công cụ, không tính.
 *    Việc gom mấy phép tra đó về `src/util/fsprobe.ts` do
 *    `test/fsprobe.test.ts` canh riêng.
 *
 * Test đi MỘT CHIỀU: có bằng chứng io ⇒ phải khai io. Chiều ngược lại không
 * ép được — `M-fsprobe` và `M-exec` chính LÀ công cụ, chúng khai `io` mà theo
 * luật trên thì không có bằng chứng nào.
 */

const ROOT = join(import.meta.dirname, "..");

/** Hàm chỉ TRA trạng thái — theo luật, không làm khối thành `io`. */
const PROBE_ONLY = new Set(["existsSync", "stat", "statSync", "readdir", "readdirSync"]);

/**
 * Khối khai `io` mà không có bằng chứng nặng, HOẶC có bằng chứng nặng mà chưa
 * sửa được nhãn. Mỗi mục phải nói rõ vì sao — danh sách miễn trừ không giải
 * thích được thì test này chỉ là trang trí.
 */
const EXEMPT: Record<string, string> = {};

interface ModuleDoc {
  id: string;
  nature: string;
  paths?: string[];
}

async function modules(): Promise<ModuleDoc[]> {
  return scanYamlDocs<ModuleDoc>(ROOT, ".ganas/modules");
}

async function sourceFiles(dir = "src"): Promise<string[]> {
  return scanFiles(ROOT, dir);
}

/** Bằng chứng file này CHẠM RA NGOÀI thật — rỗng nghĩa là không có. */
function ioEvidence(text: string): string[] {
  const found = new Set<string>();

  for (const m of text.matchAll(/import \{([^}]*)\} from "node:(fs|fs\/promises|child_process)"/g)) {
    for (const raw of m[1]!.split(",")) {
      const name = raw.trim().split(" as ")[0]!.trim();
      if (name && !PROBE_ONLY.has(name)) found.add(name);
    }
  }
  if (/process\.(stdin|stdout|stderr)\b/.test(text)) found.add("process.std*");

  return [...found].sort();
}

test("⭐ khối có bằng chứng chạm I/O thật thì PHẢI khai nature: io", async () => {
  const mods = await modules();
  const files = await sourceFiles();

  const wrong: string[] = [];
  for (const m of mods) {
    if (EXEMPT[m.id]) continue;
    const mine = files.filter((f) => matchesAny(f, m.paths ?? []));

    const evidence: string[] = [];
    for (const f of mine) {
      const found = ioEvidence(await readFile(join(ROOT, f), "utf8"));
      if (found.length > 0) evidence.push(`${f} → ${found.join(" ")}`);
    }

    if (evidence.length > 0 && m.nature !== "io") {
      wrong.push(`${m.id} khai nature: ${m.nature} nhưng:\n    ${evidence.join("\n    ")}`);
    }
  }

  assert.deepEqual(
    wrong,
    [],
    `Nhãn \`nature\` lệch với I/O thật của code.\n` +
      `Hoặc sửa nhãn thành \`io\`, hoặc chẻ phần chạm ra ngoài sang một khối riêng.\n` +
      `Xem .claude/rules/architecture.md.\n\n` +
      wrong.join("\n"),
  );
});

test("⭐ mọi mục miễn trừ đều phải giải thích được, và phải là khối CÓ THẬT", async () => {
  // Miễn trừ trỏ vào một khối đã bị xoá/đổi tên là miễn trừ chết: nó không che
  // gì cả, chỉ làm người đọc tưởng còn một chỗ lệch đang được theo dõi.
  const ids = new Set((await modules()).map((m) => m.id));
  for (const [id, why] of Object.entries(EXEMPT)) {
    assert.ok(ids.has(id), `miễn trừ trỏ tới khối không tồn tại: ${id}`);
    assert.ok(why.trim().length > 20, `miễn trừ ${id} phải nói rõ vì sao`);
  }
});
