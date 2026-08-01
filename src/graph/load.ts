import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import type { z, ZodIssue, ZodTypeAny } from "zod";

import {
  zClaimFile,
  zConfig,
  zDecisionFile,
  zDesign,
  zFactFile,
  zGoal,
  zModule,
  zPart,
  zSprint,
  zTask,
} from "../model/index.js";
import { GanasError } from "../util/errors.js";
import { lineOfPath, type LoadedYaml, readYamlFile } from "../util/yaml.js";
import { indexByTarget, readLedger } from "../verify/ledger.js";
import { CONFIG_FILE, DIRS, ganasPath } from "./paths.js";
import type { Diagnostic, Graph, Sourced } from "./types.js";

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

/** Nạp thư mục mà mỗi file chứa đúng một bản ghi (goal, sprint, design, task). */
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

/** Nạp thư mục mà mỗi file chứa một mảng bản ghi (facts, claims, decisions). */
async function collectArray<S extends ZodTypeAny>(
  dirs: string[],
  schema: S,
  root: string,
  kind: string,
): Promise<CollectResult<z.infer<S>[number]>> {
  const items = new Map<string, Sourced<z.infer<S>[number]>>();
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

      const parsed = schema.safeParse(loaded.value);
      if (!parsed.success) {
        diagnostics.push(...issuesToDiagnostics(loaded, parsed.error.issues, root));
        continue;
      }

      const rel = relative(root, file) || file;
      (parsed.data as { id: string }[]).forEach((record, index) => {
        const existing = items.get(record.id);
        if (existing) {
          diagnostics.push({
            severity: "error",
            code: "load/duplicate-id",
            message: `${kind} ${record.id} khai hai lần (lần trước ở ${existing.file})`,
            file: rel,
            line: lineOfPath(loaded, [index, "id"]),
            hint: "Mỗi ID chỉ được định nghĩa ở một chỗ.",
          });
          return;
        }
        items.set(record.id, { value: record, file: rel, index });
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
    const first = parsedConfig.error.issues[0]!;
    const line = lineOfPath(loadedConfig, first.path);
    throw new GanasError(
      `${relative(root, configFile)}${line ? `:${line}` : ""}: config không hợp lệ — ` +
        `${first.path.join(".")}: ${first.message}`,
    );
  }

  const ledger = indexByTarget(await readLedger(root));

  const gitignoreFile = join(root, ".gitignore");
  const gitignoreRaw = existsSync(gitignoreFile) ? await readFile(gitignoreFile, "utf8") : null;

  const [goals, sprints, designs, tasks, parts, modules, facts, claims, decisions] =
    await Promise.all([
      collectSingle(ganasPath(root, DIRS.goals), zGoal, root, "goal"),
      collectSingle(ganasPath(root, DIRS.sprints), zSprint, root, "sprint"),
      collectSingle(ganasPath(root, DIRS.designs), zDesign, root, "design"),
      collectSingle(ganasPath(root, DIRS.tasks), zTask, root, "task"),
      collectSingle(ganasPath(root, DIRS.parts), zPart, root, "phần"),
      collectSingle(ganasPath(root, DIRS.modules), zModule, root, "khối"),
      collectArray([ganasPath(root, DIRS.facts)], zFactFile, root, "fact"),
      collectArray(
        [ganasPath(root, DIRS.claims), ganasPath(root, DIRS.legacyImported)],
        zClaimFile,
        root,
        "claim",
      ),
      collectArray([ganasPath(root, DIRS.decisions)], zDecisionFile, root, "decision"),
    ]);

  return {
    root,
    config: parsedConfig.data,
    goals: goals.items,
    sprints: sprints.items,
    designs: designs.items,
    tasks: tasks.items,
    parts: parts.items,
    modules: modules.items,
    facts: facts.items,
    claims: claims.items,
    decisions: decisions.items,
    ledger,
    gitignoreRaw,
    sources: new Map([
      ...goals.sources,
      ...sprints.sources,
      ...designs.sources,
      ...tasks.sources,
      ...parts.sources,
      ...modules.sources,
      ...facts.sources,
      ...claims.sources,
      ...decisions.sources,
    ]),
    loadDiagnostics: [
      ...goals.diagnostics,
      ...sprints.diagnostics,
      ...designs.diagnostics,
      ...tasks.diagnostics,
      ...parts.diagnostics,
      ...modules.diagnostics,
      ...facts.diagnostics,
      ...claims.diagnostics,
      ...decisions.diagnostics,
    ],
  };
}
