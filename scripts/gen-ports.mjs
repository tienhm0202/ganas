#!/usr/bin/env node
/**
 * Sinh bảng cổng (`contract.inputs` / `contract.outputs`) cho khối, TỪ CHÍNH CODE.
 *
 * Vì sao có script này: `portIssues()` so `shape` KHỚP TỪNG KÝ TỰ. Chép tay vài
 * trăm cổng qua nhiều phạm vi thì lệch là chắc chắn, và một `shape` lệch làm
 * cạnh đỏ ở chỗ không ai ngờ. Ở đây chữ ký được đọc bằng TypeScript compiler
 * API (đúng bộ kiểm mà `npm run typecheck` dùng), nên YAML không thể "trôi" xa
 * khỏi code mà không ai thấy.
 *
 * Script KHÔNG ghi đè file YAML — nó in ra khối YAML để người dán vào, và in
 * cả `depends_on` lẫn mục `verify` (`kind: contract`) tương ứng.
 *
 * Dùng:
 *   node scripts/gen-ports.mjs                      # chỉ những cạnh ĐÃ khai depends_on
 *   node scripts/gen-ports.mjs --scope P-graph-core # + mọi cạnh code THẬT có đích trong phạm vi
 *   node scripts/gen-ports.mjs --edge M-a->M-b      # + một cạnh cụ thể (lặp được)
 *   node scripts/gen-ports.mjs --scope P-x --print M-y,M-z
 *   node scripts/gen-ports.mjs --scope P-x --json
 *
 * "Cạnh A → B" ở đây đọc là: B `depends_on` A, tức file của B import từ file
 * của A — cùng chiều với `MISSING_EDGES` trong `test/module-deps.test.ts`.
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------------- *
 * Glob tối giản — bản .mjs của `matchesAny` trong src/util/glob.ts.
 *
 * Cố tình KHÔNG import từ `src/`: mọi file `.ts` nằm trong `paths` của một khối
 * đều được `loadGraph` tính vào sơ đồ, nên script tự nhập lõi sẽ đẻ ra cạnh
 * khối giả. Script là `.mjs` và tự cài phép khớp cũng vì lý do đó.
 * ------------------------------------------------------------------------- */

function expandBraces(pattern) {
  const open = pattern.indexOf("{");
  if (open === -1) return [pattern];
  let depth = 0;
  let close = -1;
  for (let i = open; i < pattern.length; i++) {
    if (pattern[i] === "{") depth++;
    else if (pattern[i] === "}" && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close === -1) return [pattern];
  const prefix = pattern.slice(0, open);
  const suffix = pattern.slice(close + 1);
  return pattern
    .slice(open + 1, close)
    .split(",")
    .flatMap((p) => expandBraces(prefix + p + suffix));
}

function patternToRegex(pattern) {
  const segments = pattern.split("/");
  const parts = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === "**") {
      parts.push(i === segments.length - 1 ? "(?:.*)?" : "(?:.*/)?");
      continue;
    }
    parts.push(
      seg
        .replace(/[.+^${}()|\\]/g, "\\$&")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]"),
    );
    if (i < segments.length - 1 && segments[i + 1] !== "**") parts.push("/");
  }
  return new RegExp(`^${parts.join("")}$`);
}

function matchesAny(path, patterns) {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return patterns.some((p) => expandBraces(p).some((e) => patternToRegex(e).test(normalized)));
}

/* ------------------------------------------------------------------------- *
 * Bản đồ khối
 * ------------------------------------------------------------------------- */

async function loadModules() {
  const dir = join(ROOT, ".ganas", "modules");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".yaml"));
  const modules = [];
  for (const f of files) {
    const value = parseYaml(await readFile(join(dir, f), "utf8"));
    if (!value?.id) continue;
    modules.push({
      id: value.id,
      scope: value.scope,
      paths: value.paths ?? [],
      dependsOn: value.depends_on ?? [],
    });
  }
  return modules.sort((a, b) => a.id.localeCompare(b.id));
}

/* ------------------------------------------------------------------------- *
 * Chữ ký thật, đọc bằng compiler API
 * ------------------------------------------------------------------------- */

/** Gọn một dòng: chữ ký nhiều dòng trong code vẫn là MỘT `shape`. */
function oneLine(text) {
  return text.replace(/\s+/g, " ").trim();
}

/** Bỏ comment khỏi thân interface — JSDoc không phải một phần chữ ký. */
function memberText(member) {
  const name = member.name?.getText() ?? "";
  const optional = member.questionToken ? "?" : "";
  const readonlyMod = member.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword)
    ? "readonly "
    : "";
  const type = member.type ? oneLine(member.type.getText()) : "unknown";
  return `${readonlyMod}${name}${optional}: ${type}`;
}

/**
 * Interface nhỏ khai NGUYÊN thân; interface lớn khai "interface".
 *
 * Ngưỡng có lý do, không phải tuỳ hứng: `shape` so khớp từng ký tự, nên chép cả
 * một interface hàng chục field vào YAML khiến mọi lần thêm field không liên
 * quan cũng làm cạnh đỏ oan. Ngưỡng 3 là ranh giới mà bảng cổng đã duyệt bằng
 * tay đang dùng (`Sourced`, `TokenSpan` khai nguyên; `Graph`, `LedgerEntry`,
 * `Target` khai "interface").
 */
const INLINE_MEMBER_LIMIT = 3;

/** Kiểu Zod đầy đủ dài hàng chục dòng — phân loại thật, không phải "dữ liệu". */
const ZOD_SHAPE = "ZodTypeAny";

function shapeOfDeclaration(decl, checker, symbol) {
  // Union viết nhiều dòng trong code mở đầu bằng `|` — dấu đó là cách xuống
  // dòng, không phải một phần của kiểu.
  if (ts.isTypeAliasDeclaration(decl)) return oneLine(decl.type.getText()).replace(/^\|\s*/, "");

  if (ts.isInterfaceDeclaration(decl)) {
    const members = decl.members;
    if (members.length > 0 && members.length <= INLINE_MEMBER_LIMIT) {
      return `{ ${members.map(memberText).join("; ")} }`;
    }
    return "interface";
  }

  if (ts.isClassDeclaration(decl)) return "class";
  if (ts.isEnumDeclaration(decl)) return "enum";

  if (ts.isVariableDeclaration(decl) || ts.isFunctionDeclaration(decl)) {
    const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
    const text = oneLine(
      checker.typeToString(
        type,
        decl,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType,
      ),
    );
    // `UseFullyQualifiedType` cho ra `z.ZodEffects<...>` — bắt cả dạng có tiền tố.
    if (/^(?:[A-Za-z_$][\w$]*\.)?Zod/.test(text)) return ZOD_SHAPE;
    return collapseWide(text);
  }

  return "unknown";
}

/**
 * Kiểu cấu trúc RỘNG thì khai nhãn LOẠI, không chép nguyên thân.
 *
 * Cùng lý do với ngưỡng của interface: `{ readonly goals: "goals"; ... }` mười
 * bảy field chép vào YAML thì mỗi lần thêm một field không liên quan cũng làm
 * cạnh đỏ oan, mà cạnh đỏ oan thì lần sau không ai tin cạnh đỏ nữa.
 */
function collapseWide(text) {
  const tidy = text.replace(/;\s*\}$/, " }");
  if (!tidy.startsWith("{")) return tidy;
  const body = tidy.slice(1, -1);
  let depth = 0;
  let members = 1;
  for (const ch of body) {
    if ("({[<".includes(ch)) depth++;
    else if (")}]>".includes(ch)) depth--;
    else if (ch === ";" && depth === 0) members++;
  }
  return members > INLINE_MEMBER_LIMIT ? "object" : tidy;
}

/** Dòng khai báo dùng làm mẫu grep cho `run` của cạnh. */
function greppableLine(decl) {
  const sf = decl.getSourceFile();
  const node = ts.isVariableDeclaration(decl) ? decl.parent.parent : decl;
  const start = node.getStart(sf); // bỏ JSDoc/comment đứng trước
  const lineStart = sf.getLineAndCharacterOfPosition(start).line;
  const full = sf.text.split("\n")[lineStart].replace(/\r$/, "").trim();
  // Chữ ký một dòng thì grep cả dòng; chữ ký nhiều dòng thì grep tới dấu `(`.
  const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
  const multiline = end > lineStart;
  if (!multiline) return full.replace(/\s*\{\s*$/, " {");
  const paren = full.indexOf("(");
  return paren === -1 ? full : full.slice(0, paren + 1);
}

/* ------------------------------------------------------------------------- *
 * Đọc import xuyên khối
 * ------------------------------------------------------------------------- */

function ownerFactory(modules) {
  const cache = new Map();
  return (relPath) => {
    if (cache.has(relPath)) return cache.get(relPath);
    const id = modules.find((m) => matchesAny(relPath, m.paths))?.id;
    cache.set(relPath, id);
    return id;
  };
}

function relOf(fileName) {
  return relative(ROOT, fileName).split("\\").join("/");
}

/**
 * Quét mọi file `.ts` thuộc một khối, trả về danh sách
 * `{ from, to, port, shape, file, line }` — `from` là khối CẤP cổng
 * (chủ của file được import), `to` là khối TIÊU THỤ.
 *
 * Chủ cạnh tính theo file trong `import ... from`, KHÔNG theo nơi khai báo gốc:
 * đó đúng là phép đo mà `codeModuleEdges()` dùng, nên một tên được TÁI XUẤT
 * vẫn tính về khối tái xuất nó. Còn `shape` thì lấy ở nơi khai báo gốc (qua
 * `getAliasedSymbol`), vì chỉ chỗ đó mới có chữ ký thật.
 */
function collectPorts(program, checker, ownerOf) {
  const ports = [];
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    const file = relOf(sf.fileName);
    if (file.startsWith("..") || file.startsWith("node_modules/")) continue;
    const to = ownerOf(file);
    if (!to) continue;

    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      const spec = stmt.moduleSpecifier;
      if (!ts.isStringLiteral(spec) || !spec.text.startsWith(".")) continue;
      const targetFile = relOf(resolve(dirname(sf.fileName), spec.text.replace(/\.js$/, ".ts")));
      const from = ownerOf(targetFile);
      if (!from || from === to) continue;

      const bindings = stmt.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      for (const el of bindings.elements) {
        const local = checker.getSymbolAtLocation(el.name);
        if (!local) continue;
        let target = local;
        try {
          if (local.flags & ts.SymbolFlags.Alias) target = checker.getAliasedSymbol(local);
        } catch {
          /* không lần được về khai báo gốc — dùng chính symbol đang có */
        }
        const decl = target.declarations?.[0];
        if (!decl) continue;
        const port = (el.propertyName ?? el.name).getText();
        ports.push({
          from,
          to,
          port,
          shape: shapeOfDeclaration(decl, checker, target),
          file: relOf(decl.getSourceFile().fileName),
          grep: greppableLine(decl),
        });
      }
    }
  }
  return ports;
}

/* ------------------------------------------------------------------------- *
 * In ra
 * ------------------------------------------------------------------------- */

function yamlString(s) {
  // `shape` luôn để trong nháy — chuỗi kiểu `"verify-ledger.jsonl"` mà để trần
  // thì YAML đọc thành chuỗi khác.
  if (!s.includes('"')) return `"${s}"`;
  return `'${s.replace(/'/g, "''")}'`;
}

function shortId(id) {
  return id.replace(/^M-/, "");
}

/**
 * Escape một dòng khai báo thành đối số của `grep -qF`.
 *
 * Dùng `-F` (chuỗi CỐ ĐỊNH) chứ không phải biểu thức chính quy, và đó là quyết
 * định chứ không phải thói quen: chữ ký thật đầy `[` `]` `(` `{` `|` `?` — mỗi
 * ký tự là một siêu ký tự của regex, mà các bản grep khác nhau (GNU, BSD,
 * ugrep) lại thoát chúng khác nhau. Đã trả giá một lần: mẫu BRE cho
 * `LOCAL_ONLY: readonly string[] = [...]` không khớp gì trên ugrep dù dòng đó
 * nằm nguyên trong file. `-F` thì chỉ còn MỘT lớp thoát phải lo — lớp của
 * shell bên trong nháy kép: `\` `"` `$` và dấu huyền.
 */
function grepPattern(line) {
  return line.replace(/([\\"$`])/g, "\\$1");
}

function printModule(mod, inbound, outbound) {
  const lines = [];
  lines.push(`# ===== ${mod.id} =====`);
  if (inbound.size > 0 || outbound.size > 0) lines.push("contract:");

  if (inbound.size > 0) {
    lines.push("  inputs:");
    for (const [src, list] of [...inbound].sort()) {
      const files = [...new Set(list.map((p) => p.file))].sort().join(", ");
      lines.push(`    # từ ${src} (${files})`);
      for (const p of list) {
        lines.push(`    - name: ${p.port}`);
        lines.push(`      shape: ${yamlString(p.shape)}`);
      }
    }
  }

  if (outbound.size > 0) {
    lines.push("  outputs:");
    const seen = new Map();
    for (const list of outbound.values()) for (const p of list) seen.set(p.port, p);
    for (const p of [...seen.values()].sort((a, b) => a.port.localeCompare(b.port))) {
      lines.push(`    - name: ${p.port}`);
      lines.push(`      shape: ${yamlString(p.shape)}`);
    }
  }

  if (inbound.size > 0) {
    lines.push("");
    lines.push("depends_on:");
    for (const src of [...inbound.keys()].sort()) lines.push(`  - ${src}`);
  }

  if (outbound.size > 0) {
    lines.push("");
    lines.push("# verify (kind: contract) — mỗi cạnh grep ĐÚNG chữ ký của cổng nó cấp");
    for (const [dst, list] of [...outbound].sort()) {
      lines.push(`  - id: V-${shortId(mod.id)}-to-${shortId(dst)}`);
      lines.push(`    kind: contract`);
      lines.push(`    to: ${dst}`);
      lines.push(`    run: >-`);
      const greps = [...new Set(list.map((p) => `grep -qF "${grepPattern(p.grep)}" ${p.file}`))];
      greps.forEach((g, i) => lines.push(`      ${g}${i < greps.length - 1 ? " &&" : ""}`));
    }
  }

  return lines.join("\n");
}

/* ------------------------------------------------------------------------- *
 * main
 * ------------------------------------------------------------------------- */

async function main() {
  const argv = process.argv.slice(2);
  const opt = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const all = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));

  const scope = opt("--scope");
  const printOnly = opt("--print")
    ?.split(",")
    .map((s) => s.trim());
  const asJson = argv.includes("--json");
  const extraEdges = all("--edge").map((e) => {
    const [from, to] = e.split("->").map((s) => s.trim());
    return `${from} → ${to}`;
  });

  const modules = await loadModules();
  const ownerOf = ownerFactory(modules);
  const byId = new Map(modules.map((m) => [m.id, m]));

  const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();

  const ports = collectPorts(program, checker, ownerOf);

  // Tập cạnh được khai: đã có trong `depends_on`, cộng cạnh code thật có đích
  // trong phạm vi được chọn, cộng cạnh chỉ định tay.
  const declared = new Set(extraEdges);
  for (const m of modules) for (const d of m.dependsOn) declared.add(`${d} → ${m.id}`);
  if (scope) {
    for (const p of ports) if (byId.get(p.to)?.scope === scope) declared.add(`${p.from} → ${p.to}`);
  }

  const inbound = new Map(); // moduleId -> Map<fromId, port[]>
  const outbound = new Map(); // moduleId -> Map<toId, port[]>
  const dedup = new Set();
  for (const p of ports) {
    const key = `${p.from} → ${p.to}`;
    if (!declared.has(key)) continue;
    if (dedup.has(`${key}#${p.port}`)) continue;
    dedup.add(`${key}#${p.port}`);
    if (!inbound.has(p.to)) inbound.set(p.to, new Map());
    if (!inbound.get(p.to).has(p.from)) inbound.get(p.to).set(p.from, []);
    inbound.get(p.to).get(p.from).push(p);
    if (!outbound.has(p.from)) outbound.set(p.from, new Map());
    if (!outbound.get(p.from).has(p.to)) outbound.get(p.from).set(p.to, []);
    outbound.get(p.from).get(p.to).push(p);
  }

  for (const map of [inbound, outbound]) {
    for (const inner of map.values()) {
      for (const list of inner.values()) list.sort((a, b) => a.port.localeCompare(b.port));
    }
  }

  const wanted = modules.filter((m) => {
    if (printOnly) return printOnly.includes(m.id);
    if (scope) return m.scope === scope;
    return inbound.has(m.id) || outbound.has(m.id);
  });

  if (asJson) {
    console.log(
      JSON.stringify(
        wanted.map((m) => ({
          id: m.id,
          inputs: Object.fromEntries(inbound.get(m.id) ?? []),
          outputs: Object.fromEntries(outbound.get(m.id) ?? []),
        })),
        null,
        2,
      ),
    );
    return;
  }

  for (const m of wanted) {
    console.log(printModule(m, inbound.get(m.id) ?? new Map(), outbound.get(m.id) ?? new Map()));
    console.log("");
  }
}

await main();
