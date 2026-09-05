import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { scanFilesWithText } from "./scan.js";

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

async function srcFiles(): Promise<Array<{ path: string; text: string }>> {
  return scanFilesWithText(ROOT, "src");
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

/**
 * Tên trường khai trong các `z.object({...})` của một file model.
 *
 * Thụt lề `{2,}`, KHÔNG phải `{4}`. Bản cũ đòi đúng bốn dấu cách nên chỉ thấy
 * schema khai LỒNG trong một biến, và bỏ sót sạch schema khai ở cấp cao nhất —
 * cả chín trường của `zConfig` chưa bao giờ được soi tới, cho tới khi
 * `build_check` được thêm vào mà guard vẫn xanh (PR-008).
 *
 * Nếu về sau phép trích bắt nhầm khoá trong object literal của một giá trị mặc
 * định (`.default({ … })`), cách sửa KHÔNG phải nhét tên đó vào `EXEMPT` — mà
 * là dạy hàm này bỏ qua thân `.default(...)`. Nhét vào miễn trừ là giấu một
 * khiếm khuyết của phép trích dưới danh nghĩa một quyết định.
 */
function schemaFields(text: string): string[] {
  const fields = new Set<string>();
  for (const m of text.matchAll(/z\s*\n?\s*\.object\(\{([\s\S]*?)\n\s*\}\)/g)) {
    const body = m[1]!;
    // Chỉ lấy trường ở CẤP NGOÀI CÙNG của khối, suy bằng thụt lề nhỏ nhất gặp
    // được. Lấy mọi cấp thì vơ luôn khoá của object tuỳ chọn zod
    // (`{ required_error: … }`) — thứ không phải trường schema, và báo chúng là
    // "không ai đọc" thì cảnh báo mất nghĩa ngay từ ngày đầu.
    const indents = [...body.matchAll(/^( +)\w+:/gm)].map((x) => x[1]!.length);
    if (indents.length === 0) continue;
    const outer = Math.min(...indents);
    for (const f of body.matchAll(new RegExp(`^ {${outer}}(\\w+):`, "gm"))) fields.add(f[1]!);
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
    note: "ghi chú tự do cho người trên anchor commit — cùng loại `notes`, cố ý không code nào đọc",
    quote: "trích dẫn của anchor URL, HIỆN chưa nối dây ở đâu — xem PR-009, không phải chuyện cố ý",
  };

  /**
   * Trường không ai chạm THẲNG, nhưng được đọc qua một accessor công khai của
   * chính model — cả dự án gọi hàm đó thay vì với tay vào trường.
   *
   * KHÁC `EXEMPT`: đây không phải miễn trừ mà là một LỜI KHAI về đường đọc
   * gián tiếp, và ba vế của lời khai đều bị kiểm ở test ngay dưới. Vế thứ ba
   * (accessor phải được gọi từ NGOÀI src/model/) là vế dễ quên nhất: thiếu nó
   * thì trường vẫn chết, chỉ chết chậm hơn đúng một tầng.
   */
  const READ_VIA: Record<string, string> = {
    enforcement: "enforcementFor",
    enforcement_rules: "enforcementFor",
    url: "formatAnchor",
    fetched_at: "formatAnchor",
    line_end: "formatAnchor",
    // Bản vẽ: `graph/validate.ts` và `commands/design.ts` gọi `artifactIssues()`
    // thay vì với tay vào từng trường — một nơi quyết một bản vẽ có lệch không.
    port: "artifactIssues",
    side: "artifactIssues",
    // Bản giao việc cho sub-agent: người đọc thật là brief (`src/render/**`,
    // thuộc phạm vi khác nên không ship cùng task với schema). Cả sáu trường đi
    // qua `agentDispatchLines()` — một nơi quyết duy nhất bản giao việc trông
    // thế nào, và cũng là nơi luật `spine/agent-empty` chấm "khai mà rỗng ruột".
    persona: "agentDispatchLines",
    objective: "agentDispatchLines",
    steps: "agentDispatchLines",
    self_check: "agentDispatchLines",
    guardrails: "agentDispatchLines",
    tools: "agentDispatchLines",
  };
  const modelText = all
    .filter((x) => x.path.startsWith("src/model/"))
    .map((f) => f.text)
    .join("\n");

  const dead: string[] = [];
  for (const f of all.filter((x) => x.path.startsWith("src/model/"))) {
    for (const field of schemaFields(f.text)) {
      if (EXEMPT[field]) continue;

      // Đọc gián tiếp: trường phải xuất hiện đâu đó trong src/model/, và
      // accessor phải có thật. Vế "accessor được gọi từ ngoài" kiểm ở test riêng.
      const via = READ_VIA[field];
      if (via && new RegExp(`\\.${field}\\b|\\["${field}"\\]`).test(modelText)) continue;
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
      `rằng nó có tác dụng. Ba đường hợp lệ: nối dây cho nó, khai đường đọc gián\n` +
      `tiếp trong READ_VIA, hoặc xoá đi.\n` +
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

/* ------------------------------------------------------------------------- *
 * Luật 5: mỗi câu hỏi chỉ một NGƯỜI QUYẾT
 * ------------------------------------------------------------------------- */

test("⭐ không ai đọc thẳng sổ cái để tự kết luận độ tươi", async () => {
  // Lớp lỗi khác hẳn luật 1–4: không tên nào sai cả, chỉ là HAI chỗ cùng trả
  // lời một câu hỏi rồi một chỗ trôi đi. `needsRun()` từng tự soi sổ cái và bỏ
  // qua file phụ thuộc, nên brief báo "CẦN VERIFY LẠI" trong khi `ganas verify`
  // báo "không có gì cần chạy" — suốt từ N4 tới N24.
  //
  // Luật: `graph.ledger` là dữ liệu THÔ của quyết định "còn dùng được không".
  // Chỉ `computeFreshness` được đọc nó cho câu hỏi đó. Ai cần biết độ tươi thì
  // hỏi nó, đừng tự tính lại một nửa.
  const ALLOWED: Record<string, string> = {
    "src/graph/freshness.ts": "người quyết duy nhất của câu hỏi 'còn dùng được không'",
    "src/graph/validate.ts":
      "câu hỏi KHÁC: 'YAML khai có bản ghi thật chống lưng không' (unbacked-verification)",
    "src/commands/verify.ts":
      "câu hỏi KHÁC: 'lần trước có qua mutation test không' và 'lần trước tốn bao nhiêu'",
  };

  const offenders: string[] = [];
  for (const { path, text } of await srcFiles()) {
    if (path === "src/verify/ledger.ts" || ALLOWED[path]) continue;
    if (/\bgraph\.ledger\b|\blastFor\(|\bhistoryFor\(|\bentryAt\(/.test(text)) {
      offenders.push(path);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Đọc thẳng sổ cái ngoài danh sách cho phép — nhiều khả năng đang tự tính lại\n` +
      `độ tươi thay vì hỏi computeFreshness(). Nếu đây thật sự là câu hỏi khác,\n` +
      `thêm vào ALLOWED kèm LÝ DO nói rõ đó là câu hỏi gì.\n` +
      offenders.join("\n"),
  );
});

test("⭐ mọi accessor khai trong READ_VIA đều có thật và được gọi từ NGOÀI src/model/", async () => {
  // Vế dễ quên nhất của một lời khai đường-đọc-gián-tiếp. Accessor không ai gọi
  // thì trường vẫn chết, chỉ chết chậm hơn đúng một tầng — và lời khai lúc đó
  // thành tấm bình phong, tệ hơn không khai gì.
  const all = await srcFiles();
  const modelText = all
    .filter((f) => f.path.startsWith("src/model/"))
    .map((f) => f.text)
    .join("\n");
  const outside = all
    .filter((f) => !f.path.startsWith("src/model/"))
    .map((f) => f.text)
    .join("\n");

  // Giữ ĐỒNG BỘ với READ_VIA của test trên. Hai chỗ khai vì hai test chạy độc
  // lập; lệch nhau thì test này đỏ trước, đó là chủ ý.
  const ACCESSORS = ["enforcementFor", "formatAnchor", "artifactIssues", "agentDispatchLines"];

  const broken: string[] = [];
  for (const fn of ACCESSORS) {
    if (!new RegExp(`export function ${fn}\\b`).test(modelText)) {
      broken.push(`${fn} — không phải hàm export trong src/model/`);
    }
    if (!new RegExp(`\\b${fn}\\b`).test(outside)) {
      broken.push(`${fn} — không nơi nào ngoài src/model/ gọi tới`);
    }
  }

  assert.deepEqual(broken, [], `READ_VIA khai một đường đọc không tồn tại:\n${broken.join("\n")}`);
});
