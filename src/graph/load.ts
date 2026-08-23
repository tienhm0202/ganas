import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import type { ZodIssue, ZodTypeAny } from "zod";
import { z } from "zod";

import {
  LATEST_SCHEMA_VERSION,
  zClaim,
  zConfig,
  zDecision,
  zDesign,
  zFact,
  zGoal,
  zIcebox,
  zModule,
  zProposal,
  zScope,
  zTask,
} from "../model/index.js";
import { GanasError } from "../util/errors.js";
import { lineOfPath, readYamlFile } from "../util/yaml.js";
import { indexByTarget, readLedger } from "../verify/ledger.js";
import { CONFIG_FILE, DIRS, ganasPath } from "./paths.js";
import type { Diagnostic, Graph, LoadedYaml, Sourced } from "./types.js";

/** Đổi issue của zod thành Diagnostic có `file:line`. */
function issuesToDiagnostics(
  loaded: LoadedYaml,
  issues: readonly ZodIssue[],
  root: string,
): Diagnostic[] {
  return issues.map((issue) => ({
    severity: "error" as const,
    code: `schema/${issue.code}`,
    message: issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    file: relative(root, loaded.file) || loaded.file,
    line: lineOfPath(loaded, issue.path),
  }));
}

/**
 * Field từng có trong `zConfig`, đã bị bỏ khỏi schema — báo khác với khoá lạ
 * vô danh, vì người đọc không gõ sai, họ đang mang một config từ bản cũ.
 *
 * `embedder` bị xoá ở commit 7c62e28 (v0.3.x). Không xoá lịch sử ở đây khi
 * field mới bị bỏ tiếp — danh sách chỉ lớn dần, và mỗi dòng cứu một dự án cũ
 * khỏi bị coi là gõ sai.
 */
const REMOVED_CONFIG_KEYS: Record<string, string> = {
  embedder: "field này đã bỏ ở v0.3.x, không còn tác dụng — xoá dòng đó đi cho sạch.",
};

/**
 * Đối chiếu khoá thật trong config.yaml với `zConfig.shape` — nơi DUY NHẤT
 * còn thấy object YAML thô của config, trước khi `zConfig.safeParse` lọc
 * sạch khoá lạ (`zConfig` không `.strict()`, cố ý — xem test/config-version.test.ts).
 *
 * Khoá lạ là CẢNH BÁO, không phải lỗi chặn: config cũ vẫn phải load được.
 * Nhưng im lặng bỏ qua thì `enforcment: enforce` (thiếu một chữ `e`) không ai
 * biết — dự án chạy không hàng rào trong khi người viết tin là đang cưỡng chế.
 */
function configKeyDiagnostics(loaded: LoadedYaml, root: string, configFile: string): Diagnostic[] {
  const raw = loaded.value;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];

  const known = new Set(Object.keys(zConfig.shape));
  const file = relative(root, configFile) || configFile;
  const diagnostics: Diagnostic[] = [];

  for (const key of Object.keys(raw)) {
    if (known.has(key)) continue;

    const removed = REMOVED_CONFIG_KEYS[key];
    diagnostics.push({
      severity: "warning",
      code: "spine/config-unknown-key",
      message: removed
        ? `config.yaml có field \`${key}\`: ${removed}`
        : `config.yaml có khoá lạ \`${key}\` — ganas không nhận ra, có thể do gõ sai tên field.`,
      file,
      line: lineOfPath(loaded, [key]),
      hint: removed ?? `Khoá hợp lệ: ${[...known].sort().join(", ")}.`,
    });
  }

  return diagnostics;
}

async function listYaml(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && (e.name.endsWith(".yaml") || e.name.endsWith(".yml")))
    .map((e) => join(dir, e.name))
    .sort();
}

interface CollectResult<T> {
  items: Map<string, Sourced<T>>;
  diagnostics: Diagnostic[];
  /** Document đã parse, theo đường dẫn tương đối — validator chéo dùng để định vị dòng. */
  sources: Map<string, LoadedYaml>;
}

/** Nạp thư mục mà mỗi file chứa đúng một bản ghi (goal, design, task, phạm vi, khối). */
async function collectSingle<S extends ZodTypeAny>(
  dir: string,
  schema: S,
  root: string,
  kind: string,
): Promise<CollectResult<z.infer<S>>> {
  const items = new Map<string, Sourced<z.infer<S>>>();
  const diagnostics: Diagnostic[] = [];
  const sources = new Map<string, LoadedYaml>();

  for (const file of await listYaml(dir)) {
    let loaded: LoadedYaml;
    try {
      loaded = await readYamlFile(file);
    } catch (err) {
      diagnostics.push({
        severity: "error",
        code: "load/yaml",
        message: err instanceof GanasError ? err.message : String(err),
        file: relative(root, file) || file,
      });
      continue;
    }
    sources.set(relative(root, file) || file, loaded);

    const parsed = schema.safeParse(loaded.value);
    if (!parsed.success) {
      diagnostics.push(...issuesToDiagnostics(loaded, parsed.error.issues, root));
      continue;
    }

    const value = parsed.data as { id: string };
    const rel = relative(root, file) || file;
    const existing = items.get(value.id);
    if (existing) {
      diagnostics.push({
        severity: "error",
        code: "load/duplicate-id",
        message: `${kind} ${value.id} khai hai lần (lần trước ở ${existing.file})`,
        file: rel,
        line: lineOfPath(loaded, ["id"]),
        hint: "Mỗi ID chỉ được định nghĩa ở một file.",
      });
      continue;
    }
    items.set(value.id, { value: parsed.data as z.infer<S>, file: rel });
  }

  return { items, diagnostics, sources };
}

/**
 * Nạp thư mục mà mỗi file chứa một mảng bản ghi (facts, claims, decisions).
 *
 * `schema` là schema của MỘT PHẦN TỬ (`zFact`/`zClaim`/`zDecision`), không
 * phải schema cấp file. Từng phần tử được `safeParse` RIÊNG: một phần tử hỏng
 * chỉ loại chính nó, các phần tử còn lại trong cùng file vẫn vào graph bình
 * thường. Trước đây hàm này nhận schema cấp file (`z.array(zFact)`) và parse
 * cả mảng bằng một lời gọi — một fact thiếu `scope` giữa file làm rụng luôn
 * mọi fact hợp lệ khác cùng file khỏi brief/search, mà không một dòng log nào
 * nói "bạn vừa mất N bản ghi". Xem test/knowledge.test.ts.
 */
async function collectArray<S extends ZodTypeAny>(
  dirs: string[],
  schema: S,
  root: string,
  kind: string,
): Promise<CollectResult<z.infer<S>>> {
  const items = new Map<string, Sourced<z.infer<S>>>();
  const diagnostics: Diagnostic[] = [];
  const sources = new Map<string, LoadedYaml>();

  for (const dir of dirs) {
    for (const file of await listYaml(dir)) {
      let loaded: LoadedYaml;
      try {
        loaded = await readYamlFile(file);
      } catch (err) {
        diagnostics.push({
          severity: "error",
          code: "load/yaml",
          message: err instanceof GanasError ? err.message : String(err),
          file: relative(root, file) || file,
        });
        continue;
      }
      sources.set(relative(root, file) || file, loaded);

      // File rỗng là hợp lệ (thư mục vừa khởi tạo).
      if (loaded.value === null || loaded.value === undefined) continue;

      // Kiểm "file phải là một mảng" TRƯỚC KHI parse từng phần tử — không đẻ
      // mã chẩn đoán mới, cố tình dùng lại `issuesToDiagnostics` (sinh
      // `schema/${issue.code}` bằng template literal) để giữ đúng
      // `schema/invalid_type` mà hành vi cũ (parse cả mảng bằng schema cấp
      // file) vẫn sinh ra cho file không phải mảng.
      const shape = z.array(z.unknown()).safeParse(loaded.value);
      if (!shape.success) {
        diagnostics.push(...issuesToDiagnostics(loaded, shape.error.issues, root));
        continue;
      }

      const rel = relative(root, file) || file;
      shape.data.forEach((element, index) => {
        const parsed = schema.safeParse(element);
        if (!parsed.success) {
          // zod trả `issue.path` TƯƠNG ĐỐI tới phần tử (vd ["scope"]) vì ta
          // parse riêng từng phần tử — vị trí THẬT trong file là
          // [index, ...issue.path]. Không gắn tiền tố này thì lineOfPath quy
          // sai dòng (trỏ về đầu file) và thông điệp mất ngữ cảnh vị trí.
          const issues = parsed.error.issues.map((issue) => ({
            ...issue,
            path: [index, ...issue.path],
          }));
          diagnostics.push(...issuesToDiagnostics(loaded, issues, root));
          return;
        }

        const value = parsed.data as { id: string };
        const existing = items.get(value.id);
        if (existing) {
          diagnostics.push({
            severity: "error",
            code: "load/duplicate-id",
            message: `${kind} ${value.id} khai hai lần (lần trước ở ${existing.file})`,
            file: rel,
            line: lineOfPath(loaded, [index, "id"]),
            hint: "Mỗi ID chỉ được định nghĩa ở một chỗ.",
          });
          return;
        }
        items.set(value.id, { value: parsed.data as z.infer<S>, file: rel, index });
      });
    }
  }

  return { items, diagnostics, sources };
}

/** Nạp toàn bộ .ganas/ thành graph. Lỗi được gom lại, không ném giữa chừng. */
export async function loadGraph(root: string): Promise<Graph> {
  const configFile = ganasPath(root, CONFIG_FILE);
  const loadedConfig = await readYamlFile(configFile);
  const parsedConfig = zConfig.safeParse(loadedConfig.value);
  if (!parsedConfig.success) {
    const where = (path: readonly (string | number)[]): string => {
      const line = lineOfPath(loadedConfig, path);
      return `${relative(root, configFile)}${line ? `:${line}` : ""}`;
    };

    // Version tương lai phải nói thẳng là "nâng cấp ganas". Để zod báo
    // "expected 1 | 2" thì người đọc tưởng file của mình hỏng, và cách sửa sai
    // nhất — hạ số version xuống — là cách phá dữ liệu nhanh nhất.
    const declared = (loadedConfig.value as { version?: unknown } | null)?.version;
    if (typeof declared === "number" && declared > LATEST_SCHEMA_VERSION) {
      throw new GanasError(
        `${where(["version"])}: dự án này dùng schema .ganas v${declared}, ` +
          `bản ganas đang chạy chỉ hiểu tới v${LATEST_SCHEMA_VERSION} — nâng cấp ganas.\n` +
          `  Đừng hạ \`version\` trong config.yaml để chạy tạm: bản cũ sẽ đọc sai ` +
          `những trường nó chưa biết.`,
      );
    }

    const first = parsedConfig.error.issues[0]!;
    throw new GanasError(
      `${where(first.path)}: config không hợp lệ — ` + `${first.path.join(".")}: ${first.message}`,
    );
  }

  const configDiagnostics = configKeyDiagnostics(loadedConfig, root, configFile);

  const ledgerRaw = await readLedger(root);
  const ledger = indexByTarget(ledgerRaw);

  const gitignoreFile = join(root, ".gitignore");
  const gitignoreRaw = existsSync(gitignoreFile) ? await readFile(gitignoreFile, "utf8") : null;

  const [goals, designs, tasks, scopes, modules, proposals, facts, claims, decisions, icebox] =
    await Promise.all([
      collectSingle(ganasPath(root, DIRS.goals), zGoal, root, "goal"),
      collectSingle(ganasPath(root, DIRS.designs), zDesign, root, "design"),
      collectSingle(ganasPath(root, DIRS.tasks), zTask, root, "task"),
      collectSingle(ganasPath(root, DIRS.scopes), zScope, root, "phạm vi"),
      collectSingle(ganasPath(root, DIRS.modules), zModule, root, "khối"),
      collectSingle(ganasPath(root, DIRS.proposals), zProposal, root, "đề xuất"),
      collectArray([ganasPath(root, DIRS.facts)], zFact, root, "fact"),
      collectArray(
        [ganasPath(root, DIRS.claims), ganasPath(root, DIRS.legacyImported)],
        zClaim,
        root,
        "claim",
      ),
      collectArray([ganasPath(root, DIRS.decisions)], zDecision, root, "decision"),
      collectArray([ganasPath(root, DIRS.icebox)], zIcebox, root, "icebox"),
    ]);

  return {
    root,
    config: parsedConfig.data,
    goals: goals.items,
    designs: designs.items,
    tasks: tasks.items,
    scopes: scopes.items,
    modules: modules.items,
    proposals: proposals.items,
    facts: facts.items,
    claims: claims.items,
    decisions: decisions.items,
    icebox: icebox.items,
    ledger,
    ledgerRaw,
    gitignoreRaw,
    sources: new Map([
      ...goals.sources,
      ...designs.sources,
      ...tasks.sources,
      ...scopes.sources,
      ...modules.sources,
      ...facts.sources,
      ...claims.sources,
      ...decisions.sources,
      ...icebox.sources,
    ]),
    loadDiagnostics: [
      ...configDiagnostics,
      ...goals.diagnostics,
      ...designs.diagnostics,
      ...tasks.diagnostics,
      ...scopes.diagnostics,
      ...modules.diagnostics,
      ...proposals.diagnostics,
      ...facts.diagnostics,
      ...claims.diagnostics,
      ...decisions.diagnostics,
      ...icebox.diagnostics,
    ],
  };
}
