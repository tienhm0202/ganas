import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { NotInitializedError } from "../util/errors.js";

export const GANAS_DIR = ".ganas";

/** Thư mục con trong .ganas/ — một chỗ khai báo duy nhất để lệnh khác dùng lại. */
export const DIRS = {
  goals: "goals",
  sprints: "sprints",
  designs: "designs",
  tasks: "tasks",
  /** Sơ đồ khối — cũng chính là bản đồ hệ thống (thay cho `zones` cũ). */
  parts: "parts",
  modules: "modules",
  facts: "facts",
  claims: "claims",
  decisions: "decisions",
  domains: "domains",
  legacy: "legacy",
  legacyImported: join("legacy", "imported"),
  map: "map",
  mapSurveys: join("map", "surveys"),
  proposals: "proposals",
  runs: "runs",
} as const;

export const CONFIG_FILE = "config.yaml";
export const STATE_FILE = "state.json";

/** Đi ngược lên tìm thư mục chứa .ganas/. Trả về null nếu không có. */
export function findGanasRoot(from = process.cwd()): string | null {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, GANAS_DIR, CONFIG_FILE))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Như findGanasRoot nhưng ném lỗi có hướng dẫn thay vì trả null. */
export function requireGanasRoot(from = process.cwd()): string {
  const root = findGanasRoot(from);
  if (!root) throw new NotInitializedError(resolve(from));
  return root;
}

export function ganasPath(root: string, ...parts: string[]): string {
  return join(root, GANAS_DIR, ...parts);
}
