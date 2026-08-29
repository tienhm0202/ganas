import assert from "node:assert/strict";
import { test } from "node:test";

import { run as runGate } from "../src/commands/gate.js";
import { evaluateExitContract, evaluateGate } from "../src/gate.js";
import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import type { ExitCriterion } from "../src/model/index.js";
import { renderBrief } from "../src/render/brief.js";
import type { Argv } from "../src/util/args.js";
import { GanasError } from "../src/util/errors.js";
import { cleanup, goal, makeProject, moduleYaml, scope } from "./helpers.js";

/* ------------------------------------------------------------------------- *
 * Chấm và TRÌNH hợp đồng của một CHẶNG (Design)
 *
 * T-062 cho `zDesign` một `exit_contract`; nếu không có đường chấm và đường
 * trình thì trường đó chỉ là chữ trong YAML. Hai bất biến file này giữ:
 *
 *  1. MỘT đường chấm cho cả task lẫn design — `evaluateExitContract` nhận
 *     `readonly ExitCriterion[]`, hai lối vào chỉ khác nhau ở chỗ lấy mảng đó
 *     từ đâu. Hai đường chấm là hai nguồn sự thật cho cùng một câu hỏi.
 *  2. Brief nói chặng đang ở đâu — còn mấy task mở, hợp đồng chặng đạt tới
 *     đâu, và nếu chặng đã đóng thì đóng NGÀY NÀO (`Design.done_at`).
 * ------------------------------------------------------------------------- */

const BASE = {
  ".ganas/goals/G-001.yaml": goal(),
  ".ganas/scopes/P-thu.yaml": scope(),
  ".ganas/modules/M-a.yaml": moduleYaml(),
};

function designYaml(extra = ""): string {
  return `id: D-001
title: "Design thử"
serves:
  - G-001
summary: "Cách tiếp cận"
status: active
${extra}`;
}

function taskYaml(id: string, status: string, extra = ""): string {
  return `id: ${id}
title: "Task thử"
serves:
  - G-001
implements: D-001
scope: P-thu
status: ${status}
exit_contract:
  - kind: command
    run: "true"
${extra}`;
}

const DONE_AT = `done_at: 2026-01-02T00:00:00Z`;

/** Bắt stdout của một lệnh CLI — lệnh ở `src/commands/` ghi thẳng process.stdout. */
async function captureStdout<T>(fn: () => Promise<T>): Promise<{ result: T; out: string }> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: unknown }).write = (chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  };
  try {
    const result = await fn();
    return { result, out: chunks.join("") };
  } finally {
    (process.stdout as { write: unknown }).write = original;
  }
}

function gateArgv(root: string, opts: { design?: string; json?: boolean } = {}): Argv {
  return {
    positional: [],
    options: { root, ...(opts.design ? { design: opts.design } : {}) },
    multi: {},
    flags: { ...(opts.json ? { json: true } : {}) },
    passthrough: [],
  };
}

async function runGateCli(
  root: string,
  opts: { design?: string; json?: boolean } = {},
): Promise<{ code: number; out: string }> {
  const { result, out } = await captureStdout(() => runGate(gateArgv(root, opts)));
  return { code: result, out };
}

/* --- Lõi chấm dùng chung -------------------------------------------------- */

test("⭐ evaluateExitContract chấm một mảng ExitCriterion rời, không cần Task", async () => {
  const root = await makeProject(BASE);
  try {
    const criteria: ExitCriterion[] = [
      { kind: "command", run: "true", expect: "exit_zero" },
      { kind: "command", run: "false", expect: "exit_zero" },
    ];
    const result = await evaluateExitContract("D-001", criteria, { root, freshness: new Map() });

    assert.equal(result.subject, "D-001", "kết quả phải nói nó đang chấm CÁI GÌ");
    assert.equal(result.ok, false);
    assert.equal(result.results.length, 2);
    assert.equal(result.unmet.length, 1);
    assert.equal(result.unmet[0]!.criterion.kind, "command");
  } finally {
    await cleanup(root);
  }
});

test("evaluateGate của task đi qua đúng lõi đó — không có đường chấm thứ hai", async () => {
  const root = await makeProject({
    ...BASE,
    ".ganas/designs/D-001.yaml": designYaml(),
    ".ganas/tasks/T-001.yaml": taskYaml("T-001", "todo"),
  });
  try {
    const graph = await loadGraph(root);
    const freshness = await computeFreshness(graph);
    const result = await evaluateGate(graph, graph.tasks.get("T-001")!.value, freshness);
    assert.equal(result.subject, "T-001");
    assert.equal(result.ok, true);
  } finally {
    await cleanup(root);
  }
});

/* --- `ganas gate --design <id>` ------------------------------------------ */

test("⭐ `gate --design` chấm exit_contract của chặng — mọi tiêu chí đạt thì mã thoát 0", async () => {
  const root = await makeProject({
    ...BASE,
    ".ganas/designs/D-001.yaml": designYaml(`exit_contract:
  - kind: command
    run: "true"
`),
    ".ganas/tasks/T-001.yaml": taskYaml("T-001", "todo"),
  });
  try {
    const { code, out } = await runGateCli(root, { design: "D-001" });
    assert.equal(code, 0, out);
    assert.match(out, /D-001/);
  } finally {
    await cleanup(root);
  }
});

test("`gate --design` mã thoát 1 khi còn tiêu chí đỏ, và nêu tiêu chí nào", async () => {
  const root = await makeProject({
    ...BASE,
    ".ganas/designs/D-001.yaml": designYaml(`exit_contract:
  - kind: command
    run: "true"
  - kind: command
    run: "false"
`),
    ".ganas/tasks/T-001.yaml": taskYaml("T-001", "todo"),
  });
  try {
    const { code, out } = await runGateCli(root, { design: "D-001" });
    assert.equal(code, 1);
    assert.match(out, /false/, "phải in ra tiêu chí trượt, không chỉ đếm");
  } finally {
    await cleanup(root);
  }
});

test("`gate --design` với id không có trong graph → GanasError, không phải stack trace", async () => {
  const root = await makeProject({
    ...BASE,
    ".ganas/designs/D-001.yaml": designYaml(),
    ".ganas/tasks/T-001.yaml": taskYaml("T-001", "todo"),
  });
  try {
    await assert.rejects(() => runGateCli(root, { design: "D-999" }), GanasError);
  } finally {
    await cleanup(root);
  }
});

test("⭐ chặng chưa khai exit_contract KHÔNG được tự xanh — mã thoát 1", async () => {
  const root = await makeProject({
    ...BASE,
    ".ganas/designs/D-001.yaml": designYaml(),
    ".ganas/tasks/T-001.yaml": taskYaml("T-001", "todo"),
  });
  try {
    const { code, out } = await runGateCli(root, { design: "D-001" });
    assert.equal(code, 1, "gate tự xanh vì rỗng là gate không tồn tại");
    assert.match(out, /exit_contract/);
  } finally {
    await cleanup(root);
  }
});

test("`gate --design --json` xuất subject + ok + unmet", async () => {
  const root = await makeProject({
    ...BASE,
    ".ganas/designs/D-001.yaml": designYaml(`exit_contract:
  - kind: command
    run: "false"
`),
    ".ganas/tasks/T-001.yaml": taskYaml("T-001", "todo"),
  });
  try {
    const { code, out } = await runGateCli(root, { design: "D-001", json: true });
    assert.equal(code, 1);
    const parsed = JSON.parse(out) as { subject: string; ok: boolean; unmet: unknown[] };
    assert.equal(parsed.subject, "D-001");
    assert.equal(parsed.ok, false);
    assert.equal(parsed.unmet.length, 1);
  } finally {
    await cleanup(root);
  }
});

/* --- Brief: chặng đang ở đâu --------------------------------------------- */

async function briefOf(root: string, taskId: string): Promise<string> {
  const graph = await loadGraph(root);
  const freshness = await computeFreshness(graph);
  return renderBrief({ graph, task: graph.tasks.get(taskId)!, freshness });
}

test("⭐ brief nói chặng còn mấy task mở và hợp đồng chặng có mấy tiêu chí", async () => {
  const root = await makeProject({
    ...BASE,
    ".ganas/designs/D-001.yaml": designYaml(`exit_contract:
  - kind: command
    run: "true"
  - kind: command
    run: "false"
`),
    ".ganas/tasks/T-001.yaml": taskYaml("T-001", "todo"),
    ".ganas/tasks/T-002.yaml": taskYaml("T-002", "done", DONE_AT),
  });
  try {
    const brief = await briefOf(root, "T-001");
    assert.match(brief, /Tiến độ chặng/);
    assert.match(brief, /1\/2 task/, `phải đếm task mở trên tổng:\n${brief}`);
    assert.match(brief, /T-001/);
    assert.match(brief, /2 tiêu chí/, "phải nói hợp đồng chặng lớn cỡ nào");
    assert.match(brief, /ganas gate --design D-001/, "phải chỉ đường chấm hợp đồng đó");
  } finally {
    await cleanup(root);
  }
});

test("⭐ chặng đã đóng thì brief trình NGÀY đóng — Design.done_at có người đọc", async () => {
  const root = await makeProject({
    ...BASE,
    ".ganas/designs/D-001.yaml": `id: D-001
title: "Design thử"
serves:
  - G-001
summary: "Cách tiếp cận"
status: done
done_at: 2026-03-04T05:06:07Z
exit_contract:
  - kind: command
    run: "true"
`,
    ".ganas/tasks/T-001.yaml": taskYaml("T-001", "todo"),
  });
  try {
    const brief = await briefOf(root, "T-001");
    assert.match(brief, /2026-03-04/, `ngày đóng chặng phải có mặt:\n${brief}`);
  } finally {
    await cleanup(root);
  }
});

test("dòng tiến độ chặng KHÔNG mang thứ biến động — brief hai lần liền phải giống hệt", async () => {
  const root = await makeProject({
    ...BASE,
    ".ganas/designs/D-001.yaml": designYaml(`exit_contract:
  - kind: command
    run: "true"
`),
    ".ganas/tasks/T-001.yaml": taskYaml("T-001", "todo"),
  });
  try {
    const a = await briefOf(root, "T-001");
    const b = await briefOf(root, "T-001");
    assert.equal(a, b);
  } finally {
    await cleanup(root);
  }
});
