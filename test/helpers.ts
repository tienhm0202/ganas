import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { loadGraph } from "../src/graph/load.js";
import type { Diagnostic } from "../src/graph/types.js";
import { validateGraph } from "../src/graph/validate.js";

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

/**
 * Phạm vi công việc mặc định. Kèm sẵn một khối để `modules`/`entry` hợp lệ —
 * phạm vi rỗng không phải phạm vi.
 */
export function scope(
  id = "P-thu",
  opts: { modules?: string[]; entry?: string; status?: string; extra?: string } = {},
): string {
  const modules = opts.modules ?? ["M-a"];
  return `id: ${id}
title: "Phạm vi thử"
version: 0.1.0
owner: "@nguoi-duyet"
status: ${opts.status ?? "active"}
modules:
${modules.map((m) => `  - ${m}`).join("\n")}
entry: ${opts.entry ?? modules[0]}
acceptance:
  - id: V-thu-smoke
    kind: probe
    run: "test -d src"
${opts.extra ?? ""}`;
}

/** Khối tối thiểu hợp lệ, khai `scope` khớp hai chiều với `scope()`. */
export function moduleYaml(
  id = "M-a",
  opts: { scope?: string; paths?: string[]; extra?: string } = {},
): string {
  const paths = opts.paths ?? ["src/a/**"];
  return `id: ${id}
title: "Khối thử"
scope: ${opts.scope ?? "P-thu"}
nature: code
paths:
${paths.map((x) => `  - "${x}"`).join("\n")}
${opts.extra ?? ""}`;
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
  opts: { serves?: string[]; implements?: string; scope?: string; extra?: string } = {},
): string {
  const serves = opts.serves ?? ["G-001"];
  return `id: ${id}
title: "Task thử"
serves:
${serves.map((g) => `  - ${g}`).join("\n")}
implements: ${opts.implements ?? "D-001"}
scope: ${opts.scope ?? "P-thu"}
status: todo
exit_contract:
  - kind: command
    run: "true"
${opts.extra ?? ""}`;
}

/** Graph tối thiểu hợp lệ: goal → design → task, neo trong phạm vi P-thu. */
export function validSpine(): Record<string, string> {
  return {
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
  };
}
