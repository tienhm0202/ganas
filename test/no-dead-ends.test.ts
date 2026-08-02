import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * BỘ DÒ NGÕ CỤT.
 *
 * Lịch sử của repo này có một lớp lỗi lặp đi lặp lại: code nhắc tới một thứ
 * KHÔNG TỒN TẠI, hoặc khai một thứ KHÔNG AI ĐỌC. Đã gặp ít nhất mười ca —
 * `ganas adopt` (lệnh ma in vào brief mỗi phiên), `zone_survey` (luật cưỡng chế
 * không hook nào đọc), `part.exit` (trường bắt buộc không nơi nào dùng),
 * `Fact.ttl_days` (đọc nhầm cấp nên chưa từng chạy), `Probe.cwd` (khai rồi bị
 * nuốt), `LedgerEntry.n/passed` (không bao giờ được ghi).
 *
 * Với một công cụ mà toàn bộ thông điệp là "đừng khẳng định thứ chưa kiểm
 * chứng", đây là mâu thuẫn nội tại — nó tự sinh ảo giác về chính nó.
 *
 * Lời hứa "sẽ cẩn thận hơn" không chặn được lớp lỗi này: nó mục ngay khi người
 * viết đổi, và không ai đối chiếu lại. Ba luật dưới đây chặn được BẰNG MÁY, và
 * đó là lý do chúng nằm trong test chứ không nằm trong CONTRIBUTING.md.
 *
 * Giới hạn thành thật: đây là phép dò theo văn bản, không phải phân tích luồng
 * dữ liệu. Nó bắt được "nhắc tên thứ không có" và "khai rồi không ai đọc";
 * KHÔNG bắt được "đọc đúng tên nhưng sai ngữ nghĩa" (ví dụ `ttl_days` đọc từ
 * đúng chữ nhưng sai cấp object). Ca đó cần type thật — xem mục cuối file.
 */

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

async function srcFiles(): Promise<Array<{ path: string; text: string }>> {
  const files = await walk(join(ROOT, "src"));
  return Promise.all(
    files.map(async (path) => ({ path: relative(ROOT, path), text: await readFile(path, "utf8") })),
  );
}

async function knownCommands(): Promise<string[]> {
  const cli = await readFile(join(ROOT, "src", "cli.ts"), "utf8");
  const body = cli.match(/const COMMANDS:[^\n]*=\s*{([\s\S]*?)\n};/)![1]!;
  return [...body.matchAll(/^\s*([a-z-]+):\s*\(\)\s*=>\s*import\(/gm)].map((m) => m[1]!);
}

/* ------------------------------------------------------------------------- *
 * Luật 1: mọi lệnh `ganas <x>` được nhắc trong code phải TỒN TẠI
 * ------------------------------------------------------------------------- */

test("⭐ không chuỗi nào trong src/ nhắc một lệnh ganas không tồn tại", async () => {
  const commands = await knownCommands();
  // "ganas" cũng là một từ trong văn xuôi tiếng Việt ("ganas không chạy được").
  // Token lệnh phải kết thúc ở một RANH GIỚI — nếu ngay sau nó còn chữ (kể cả
  // chữ có dấu) thì đó là văn xuôi, không phải lệnh.
  const subcommands = new Set(["new", "assign"]);
  const offenders: string[] = [];

  for (const { path, text } of await srcFiles()) {
    for (const m of text.matchAll(/`ganas ([a-z][a-z-]*)(?=[\s`"'.,)\\]|$)/g)) {
      const name = m[1]!;
      if (commands.includes(name) || subcommands.has(name)) continue;
      const line = text.slice(0, m.index).split("\n").length;
      offenders.push(`${path}:${line} — \`ganas ${name}\``);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Code đang chỉ người dùng tới lệnh không tồn tại.\n` +
      `Lệnh có thật: ${commands.join(", ")}\n` +
      offenders.join("\n"),
  );
});

/* ------------------------------------------------------------------------- *
 * Luật 2: mọi đường dẫn `.ganas/<x>/` được nhắc phải là thư mục CÓ THẬT
 * ------------------------------------------------------------------------- */

test("⭐ không chuỗi nào trong src/ trỏ vào thư mục .ganas/ không tồn tại", async () => {
  const paths = await readFile(join(ROOT, "src", "graph", "paths.ts"), "utf8");
  const body = paths.match(/export const DIRS = {([\s\S]*?)\n} as const;/)![1]!;
  const dirs = new Set<string>();
  for (const m of body.matchAll(/^\s*\w+:\s*(?:"([^"]+)"|join\("([^"]+)",\s*"([^"]+)"\))/gm)) {
    if (m[1]) dirs.add(m[1]);
    else if (m[2] && m[3]) {
      dirs.add(m[2]);
      dirs.add(`${m[2]}/${m[3]}`);
    }
  }

  const offenders: string[] = [];
  for (const { path, text } of await srcFiles()) {
    if (path.endsWith("graph/paths.ts")) continue;
    for (const m of text.matchAll(/\.ganas\/([a-z][a-z/-]*?)\//g)) {
      const d = m[1]!;
      if (dirs.has(d)) continue;
      const line = text.slice(0, m.index).split("\n").length;
      offenders.push(`${path}:${line} — .ganas/${d}/`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Code đang chỉ người dùng tới thư mục không có trong DIRS.\n` +
      `Thư mục có thật: ${[...dirs].sort().join(", ")}\n` +
      offenders.join("\n"),
  );
});

/* ------------------------------------------------------------------------- *
 * Luật 3: mọi trường schema phải có NGƯỜI ĐỌC ngoài src/model/
 * ------------------------------------------------------------------------- */

/** Tên trường khai trong các `z.object({...})` của một file model. */
function schemaFields(text: string): string[] {
  const fields = new Set<string>();
  for (const m of text.matchAll(/z\s*\n?\s*\.object\(\{([\s\S]*?)\n\s*\}\)/g)) {
    for (const f of m[1]!.matchAll(/^\s{4}(\w+):/gm)) fields.add(f[1]!);
  }
  return [...fields];
}

test("⭐ mọi trường schema đều có ít nhất một người đọc ngoài src/model/", async () => {
  const all = await srcFiles();
  const consumers = all.filter((f) => !f.path.startsWith("src/model/"));
  const haystack = consumers.map((f) => f.text).join("\n");

  /**
   * Miễn trừ, mỗi cái một LÝ DO cụ thể — không phải danh sách để nhét cho xanh.
   * Thêm vào đây là một quyết định phải giải thích được, y như thêm một `hint`.
   */
  const EXEMPT: Record<string, string> = {
    notes: "ô ghi chú tự do cho người, cố ý không có code nào đọc",
    id: "khoá của mọi Map trong graph — đọc gián tiếp qua .get()/.keys()",
  };

  const dead: string[] = [];
  for (const f of all.filter((x) => x.path.startsWith("src/model/"))) {
    for (const field of schemaFields(f.text)) {
      if (EXEMPT[field]) continue;
      // Ba cách một trường được đọc: `.x`, `["x"]`, hoặc destructure `{ x }`.
      const re = new RegExp(`\\.${field}\\b|\\["${field}"\\]|\\{[^}]*\\b${field}\\b[^}]*\\}\\s*=`);
      if (!re.test(haystack)) dead.push(`${f.path} — \`${field}\``);
    }
  }

  assert.deepEqual(
    dead,
    [],
    `Trường khai trong schema nhưng KHÔNG code nào ngoài src/model/ đọc.\n` +
      `Một trường không ai đọc là một lời hứa suông: người dùng điền vào rồi tin\n` +
      `rằng nó có tác dụng. Hoặc nối dây cho nó, hoặc xoá đi.\n` +
      dead.join("\n"),
  );
});

/* ------------------------------------------------------------------------- *
 * Luật 4: docs/FLOWS.md chỉ được nhắc hàm/file CÓ THẬT
 * ------------------------------------------------------------------------- */

test("⭐ mọi hàm và file mà docs/FLOWS.md nhắc tới đều tồn tại", async () => {
  // Tài liệu mô tả luồng là thứ mục nhanh nhất khi code đổi, và mục một cách
  // im lặng — không ai chạy tài liệu. Nó phải chịu đúng luật mà nó đặt ra cho
  // code: không được nhắc thứ không tồn tại.
  const doc = await readFile(join(ROOT, "docs", "FLOWS.md"), "utf8");
  const src = (await srcFiles()).map((f) => f.text).join("\n");
  const missing: string[] = [];

  for (const m of doc.matchAll(/\b([a-zA-Z][a-zA-Z0-9_]*)\(\)/g)) {
    const fn = m[1]!;
    if (!new RegExp(`\\b(function|const)\\s+${fn}\\b`).test(src)) missing.push(`hàm ${fn}()`);
  }

  for (const m of doc.matchAll(/\b((?:src|plugin)\/[\w./-]+\.(?:ts|json|mjs|md))\b/g)) {
    const { existsSync } = await import("node:fs");
    if (!existsSync(join(ROOT, m[1]!))) missing.push(`file ${m[1]}`);
  }

  assert.deepEqual(
    [...new Set(missing)],
    [],
    `docs/FLOWS.md nhắc tới thứ không tồn tại:\n${[...new Set(missing)].join("\n")}`,
  );
});
