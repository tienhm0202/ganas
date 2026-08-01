import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadGraph } from "../src/graph/load.js";
import { validateGraph } from "../src/graph/validate.js";
import type { Diagnostic } from "../src/graph/types.js";

const CONFIG = `version: 1
project: "test"
enforcement: enforce
`;

/**
 * Dựng một dự án .ganas/ tạm từ map đường-dẫn→nội-dung.
 * Đường dẫn tương đối so với gốc dự án, vd "\.ganas/goals/G-001.yaml".
 */
export async function makeProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ganas-test-"));
  const all: Record<string, string> = { ".ganas/config.yaml": CONFIG, ...files };
  for (const [rel, content] of Object.entries(all)) {
    const file = join(root, rel);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
  }
  return root;
}

export async function cleanup(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

/** Nạp + validate, trả về toàn bộ diagnostic. */
export async function check(files: Record<string, string>): Promise<{
  diagnostics: Diagnostic[];
  codes: string[];
  root: string;
}> {
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    const diagnostics = validateGraph(graph);
    return { diagnostics, codes: diagnostics.map((d) => d.code), root };
  } finally {
    await cleanup(root);
  }
}

/* --- Bộ dựng YAML: mặc định hợp lệ, ghi đè phần cần làm sai --------------- */

export const APPROVED = `approved_by: "@nguoi-duyet"\napproved_at: 2026-01-01T00:00:00Z`;

export function goal(id = "G-001", extra = ""): string {
  return `id: ${id}
title: "Mục tiêu thử"
outcome: "Kết quả cảm nhận được"
acceptance:
  - id: A-1
    kind: command
    run: "true"
status: active
${APPROVED}
${extra}`;
}

export function sprint(id = "S-2026-08", goals = ["G-001"], extra = ""): string {
  return `id: ${id}
title: "Sprint thử"
goals:
${goals.map((g) => `  - ${g}`).join("\n")}
starts_at: 2026-08-01T00:00:00Z
ends_at: 2026-08-15T00:00:00Z
status: active
${extra}`;
}

export function design(id = "D-001", serves = ["G-001"], extra = ""): string {
  return `id: ${id}
title: "Design thử"
serves:
${serves.map((g) => `  - ${g}`).join("\n")}
summary: "Cách tiếp cận"
status: active
${extra}`;
}

export function task(
  id = "T-001",
  opts: { serves?: string[]; implements?: string; sprint?: string; extra?: string } = {},
): string {
  const serves = opts.serves ?? ["G-001"];
  return `id: ${id}
title: "Task thử"
serves:
${serves.map((g) => `  - ${g}`).join("\n")}
implements: ${opts.implements ?? "D-001"}
sprint: ${opts.sprint ?? "S-2026-08"}
status: todo
exit_contract:
  - kind: command
    run: "true"
${opts.extra ?? ""}`;
}

/** Graph tối thiểu hợp lệ: goal → sprint → design → task. */
export function validSpine(): Record<string, string> {
  return {
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/sprints/S-2026-08.yaml": sprint(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
  };
}
