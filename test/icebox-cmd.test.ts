import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { overdueIceboxItems, run as runIcebox } from "../src/commands/icebox.js";
import { loadGraph } from "../src/graph/load.js";
import { bindSession } from "../src/state.js";
import type { Argv } from "../src/util/args.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope, task, validSpine } from "./helpers.js";

/**
 * Test cho `src/commands/icebox.ts` (lệnh `ganas icebox add|list|review|close|
 * promote`) — KHÁC `test/icebox-model.test.ts` (schema thuần) và
 * `test/icebox-validate.test.ts` (ba luật validate). Ở đây test CLI thật:
 * ghi file, đọc lại qua `loadGraph`, khoá/đặt-chỗ id, và output cho người.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

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

function iceboxArgv(
  root: string,
  positional: string[],
  opts: {
    options?: Record<string, string>;
    multi?: Record<string, string[]>;
    flags?: Record<string, boolean>;
  } = {},
): Argv {
  return {
    positional,
    options: { root, ...(opts.options ?? {}) },
    multi: opts.multi ?? {},
    flags: opts.flags ?? {},
    passthrough: [],
  };
}

async function runCli(
  root: string,
  positional: string[],
  opts: Parameters<typeof iceboxArgv>[2] = {},
): Promise<{ code: number; out: string }> {
  const { result, out } = await captureStdout(() => runIcebox(iceboxArgv(root, positional, opts)));
  return { code: result, out };
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthFile(root: string): string {
  return join(root, ".ganas", "icebox", `${currentMonth()}.yaml`);
}

/** Dự án spine hợp lệ tối thiểu (goal → design → task, phạm vi P-thu). */
function baseFiles(): Record<string, string> {
  return validSpine();
}

/* ------------------------------------------------------------------------- *
 * add
 * ------------------------------------------------------------------------- */

test("icebox add: ghi bản ghi parse lại được qua loadGraph, id đúng id đã đặt chỗ", async () => {
  const root = await makeProject(baseFiles());
  try {
    const res = await runCli(root, ["add"], {
      options: { title: "Cache miss lúc restart", weight: "3", ease: "4", why: "chưa gấp" },
      multi: { anchor: ["src/a.ts:1"] },
      flags: { json: true },
    });
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.out) as { id: string; file: string };
    assert.match(parsed.id, /^ICE-\d{3,}$/);

    const graph = await loadGraph(root);
    const rec = graph.icebox.get(parsed.id);
    assert.ok(rec, `${parsed.id} phải nạp lại được qua loadGraph`);
    assert.equal(rec.value.title, "Cache miss lúc restart");
    assert.equal(rec.value.weight, 3);
    assert.equal(rec.value.ease, 4);
    assert.equal(rec.value.why_deferred, "chưa gấp");
    assert.equal(rec.value.status, "open");
  } finally {
    await cleanup(root);
  }
});

test("icebox add: giữ nguyên comment sẵn có trong file YAML sau khi thêm mục thứ hai", async () => {
  const existing =
    `# ghi chú của người — đừng xoá dòng này\n` +
    `- id: ICE-001\n` +
    `  title: "Mục đầu tiên"\n` +
    `  found_at: "2026-01-01T00:00:00Z"\n` +
    `  review_after_days: 30\n` +
    `  weight: 3\n` +
    `  ease: 3\n` +
    `  why_deferred: "lý do đầu"\n` +
    `  anchors:\n` +
    `    - "src/a.ts:1"\n` +
    `  status: open\n`;
  const root = await makeProject({
    ...baseFiles(),
    [`.ganas/icebox/${currentMonth()}.yaml`]: existing,
  });
  const file = monthFile(root);

  try {
    const res = await runCli(root, ["add"], {
      options: { title: "Mục thứ hai", weight: "2", ease: "2", why: "lý do hai" },
      multi: { anchor: ["src/b.ts:2"] },
      flags: { json: true },
    });
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.out) as { id: string };
    assert.equal(parsed.id, "ICE-002", "phải nối tiếp sau ICE-001 đã có sẵn trong file");

    const raw = await readFile(file, "utf8");
    assert.match(raw, /# ghi chú của người — đừng xoá dòng này/, "comment sẵn có phải còn nguyên");
    assert.match(raw, /ICE-001/);
    assert.match(raw, /ICE-002/);
  } finally {
    await cleanup(root);
  }
});

test("icebox add: thiếu --why → lỗi", async () => {
  const root = await makeProject(baseFiles());
  try {
    await assert.rejects(
      () =>
        runIcebox(
          iceboxArgv(root, ["add"], {
            options: { title: "T", weight: "3", ease: "3" },
            multi: { anchor: ["src/a.ts:1"] },
          }),
        ),
      /--why/,
    );
  } finally {
    await cleanup(root);
  }
});

test("icebox add: thiếu --anchor → lỗi", async () => {
  const root = await makeProject(baseFiles());
  try {
    await assert.rejects(
      () =>
        runIcebox(
          iceboxArgv(root, ["add"], {
            options: { title: "T", weight: "3", ease: "3", why: "vì lý do" },
          }),
        ),
      /--anchor/,
    );
  } finally {
    await cleanup(root);
  }
});

test("icebox add: --weight 0 và --weight 6 → lỗi, nói rõ thang điểm", async () => {
  const root = await makeProject(baseFiles());
  try {
    for (const w of ["0", "6"]) {
      await assert.rejects(
        () =>
          runIcebox(
            iceboxArgv(root, ["add"], {
              options: { title: "T", weight: w, ease: "3", why: "vì lý do" },
              multi: { anchor: ["src/a.ts:1"] },
            }),
          ),
        /1-5/,
      );
    }
  } finally {
    await cleanup(root);
  }
});

test("icebox add: hai lần add liên tiếp → hai id khác nhau, cả hai còn trong file", async () => {
  const root = await makeProject(baseFiles());
  try {
    const opts = (title: string): Parameters<typeof runCli>[2] => ({
      options: { title, weight: "3", ease: "3", why: "vì lý do" },
      multi: { anchor: ["src/a.ts:1"] },
      flags: { json: true },
    });
    const first = await runCli(root, ["add"], opts("Mục A"));
    const second = await runCli(root, ["add"], opts("Mục B"));
    const idA = (JSON.parse(first.out) as { id: string }).id;
    const idB = (JSON.parse(second.out) as { id: string }).id;
    assert.notEqual(idA, idB);

    const graph = await loadGraph(root);
    assert.ok(graph.icebox.has(idA));
    assert.ok(graph.icebox.has(idB));
  } finally {
    await cleanup(root);
  }
});

/* ------------------------------------------------------------------------- *
 * close
 * ------------------------------------------------------------------------- */

function iceboxFileWith(records: string): Record<string, string> {
  return { ...baseFiles(), [`.ganas/icebox/${currentMonth()}.yaml`]: records };
}

/**
 * Bản ghi icebox `open` tối thiểu hợp lệ. `overrides` GHI ĐÈ giá trị mặc định
 * (không nối thêm dòng trùng khoá — YAML trùng khoá là lỗi âm thầm khó thấy),
 * và `scope` (nếu có trong `overrides`) được thêm như một dòng riêng.
 */
function openRecord(id: string, overrides: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    title: `"Mục thử"`,
    found_at: `"${new Date(Date.now() - DAY_MS).toISOString()}"`,
    review_after_days: "30",
    weight: "3",
    ease: "3",
    why_deferred: `"chưa tới lượt làm"`,
    status: "open",
    ...overrides,
  };
  const lines = [
    `- id: ${id}`,
    `  title: ${base.title}`,
    `  found_at: ${base.found_at}`,
    `  review_after_days: ${base.review_after_days}`,
    `  weight: ${base.weight}`,
    `  ease: ${base.ease}`,
    `  why_deferred: ${base.why_deferred}`,
    `  anchors:`,
    `    - "src/a.ts:1"`,
    `  status: ${base.status}`,
  ];
  if (overrides.scope) lines.push(`  scope: ${overrides.scope}`);
  return lines.join("\n") + "\n";
}

test("icebox close: không --reason → lỗi", async () => {
  const root = await makeProject(iceboxFileWith(openRecord("ICE-001")));
  try {
    await assert.rejects(() => runIcebox(iceboxArgv(root, ["close", "ICE-001"])), /--reason/);
  } finally {
    await cleanup(root);
  }
});

test("icebox close: đặt đủ ba trường, bản ghi vẫn nằm trong file (không bị xoá)", async () => {
  const root = await makeProject(iceboxFileWith(openRecord("ICE-001")));
  try {
    const res = await runCli(root, ["close", "ICE-001"], {
      options: { reason: "không còn cần nữa" },
    });
    assert.equal(res.code, 0);

    const graph = await loadGraph(root);
    const rec = graph.icebox.get("ICE-001");
    assert.ok(rec, "bản ghi phải vẫn còn trong file, không bị xoá");
    assert.equal(rec.value.status, "closed");
    assert.equal(rec.value.closed_reason, "không còn cần nữa");
    assert.ok(rec.value.closed_at, "closed_at phải được đặt");
  } finally {
    await cleanup(root);
  }
});

/* ------------------------------------------------------------------------- *
 * promote
 * ------------------------------------------------------------------------- */

test("icebox promote --task với task không tồn tại → lỗi", async () => {
  const root = await makeProject(iceboxFileWith(openRecord("ICE-001")));
  try {
    await assert.rejects(
      () => runIcebox(iceboxArgv(root, ["promote", "ICE-001"], { options: { task: "T-999" } })),
      /T-999/,
    );
  } finally {
    await cleanup(root);
  }
});

test("icebox promote không --task → in khung dán được, thoát mã 1", async () => {
  const root = await makeProject(iceboxFileWith(openRecord("ICE-001")));
  try {
    const res = await runCli(root, ["promote", "ICE-001"]);
    assert.equal(res.code, 1);
    assert.match(res.out, /id: T-xxx/);
    assert.match(res.out, /serves: \[\]/);
    assert.match(res.out, /ganas id task/i);
  } finally {
    await cleanup(root);
  }
});

test("icebox promote --task hợp lệ → status: promoted + promoted_to", async () => {
  const root = await makeProject(iceboxFileWith(openRecord("ICE-001", { scope: "P-thu" })));
  try {
    const res = await runCli(root, ["promote", "ICE-001"], { options: { task: "T-001" } });
    assert.equal(res.code, 0);

    const graph = await loadGraph(root);
    const rec = graph.icebox.get("ICE-001");
    assert.equal(rec!.value.status, "promoted");
    assert.equal(rec!.value.promoted_to, "T-001");
    assert.ok(rec!.value.closed_at);
  } finally {
    await cleanup(root);
  }
});

test("icebox promote --task: scope lệch nhau → lỗi", async () => {
  const files = {
    ...baseFiles(),
    [`.ganas/icebox/${currentMonth()}.yaml`]: openRecord("ICE-001", { scope: "P-khac" }),
  };
  const root = await makeProject(files);
  try {
    await assert.rejects(
      () => runIcebox(iceboxArgv(root, ["promote", "ICE-001"], { options: { task: "T-001" } })),
      /scope/,
    );
  } finally {
    await cleanup(root);
  }
});

/* ------------------------------------------------------------------------- *
 * review — pure function ghim `now`, cộng một lượt CLI smoke test
 * ------------------------------------------------------------------------- */

test("overdueIceboxItems: chỉ trả mục open đã quá hạn (ghim now)", () => {
  const FOUND_AT = "2026-01-01T00:00:00Z";
  const FOUND_AT_MS = Date.parse(FOUND_AT);
  const items = [
    {
      id: "ICE-001",
      title: "Quá hạn",
      found_at: FOUND_AT,
      review_after_days: 30,
      weight: 3 as const,
      ease: 3 as const,
      why_deferred: "vì lý do",
      anchors: [{ kind: "file" as const, path: "src/a.ts", line: 1 }],
      status: "open" as const,
    },
    {
      id: "ICE-002",
      title: "Chưa tới hạn",
      found_at: FOUND_AT,
      review_after_days: 365,
      weight: 3 as const,
      ease: 3 as const,
      why_deferred: "vì lý do",
      anchors: [{ kind: "file" as const, path: "src/b.ts", line: 1 }],
      status: "open" as const,
    },
    {
      id: "ICE-003",
      title: "Đã đóng, dù quá hạn",
      found_at: FOUND_AT,
      review_after_days: 1,
      weight: 3 as const,
      ease: 3 as const,
      why_deferred: "vì lý do",
      anchors: [{ kind: "file" as const, path: "src/c.ts", line: 1 }],
      status: "closed" as const,
      closed_at: "2026-02-01T00:00:00Z",
      closed_reason: "xong rồi",
    },
  ];

  const now = FOUND_AT_MS + 40 * DAY_MS;
  const overdue = overdueIceboxItems(items, now);
  assert.deepEqual(
    overdue.map((o) => o.item.id),
    ["ICE-001"],
  );
  assert.equal(overdue[0]!.overdueDays, 10);
});

test("ganas icebox review: output có why_deferred, và mục chưa tới hạn không xuất hiện", async () => {
  const files = {
    ...baseFiles(),
    [`.ganas/icebox/${currentMonth()}.yaml`]:
      openRecord("ICE-001", {
        found_at: `"${new Date(Date.now() - 40 * DAY_MS).toISOString()}"`,
        review_after_days: "30",
      }) + openRecord("ICE-002", { review_after_days: "3650" }),
  };
  const root = await makeProject(files);
  try {
    const res = await runCli(root, ["review"]);
    assert.equal(res.code, 0);
    assert.match(res.out, /ICE-001/);
    assert.match(res.out, /chưa tới lượt làm/, "why_deferred phải xuất hiện trong output");
    assert.doesNotMatch(res.out, /ICE-002/, "mục chưa tới hạn không được liệt kê");
  } finally {
    await cleanup(root);
  }
});

test("ganas icebox review --json: parse lại được", async () => {
  const root = await makeProject(
    iceboxFileWith(
      openRecord("ICE-001", { found_at: `"${new Date(Date.now() - 40 * DAY_MS).toISOString()}"` }),
    ),
  );
  try {
    const res = await runCli(root, ["review"], { flags: { json: true } });
    const parsed = JSON.parse(res.out) as { total: number; rows: Array<{ id: string }> };
    assert.equal(parsed.total, 1);
    assert.equal(parsed.rows[0]!.id, "ICE-001");
  } finally {
    await cleanup(root);
  }
});

/* ------------------------------------------------------------------------- *
 * list
 * ------------------------------------------------------------------------- */

function twoScopeFilesWithIcebox(): Record<string, string> {
  return {
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task("T-001", { scope: "P-thu" }),
    ".ganas/scopes/P-thu.yaml": scope("P-thu", { modules: ["M-a"] }),
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", { scope: "P-thu" }),
    [`.ganas/icebox/${currentMonth()}.yaml`]:
      openRecord("ICE-001", { scope: "P-thu" }) +
      `- id: ICE-002\n` +
      `  title: "Đã đóng"\n` +
      `  found_at: "2026-01-01T00:00:00Z"\n` +
      `  review_after_days: 30\n` +
      `  weight: 2\n` +
      `  ease: 2\n` +
      `  why_deferred: "không còn liên quan"\n` +
      `  anchors:\n` +
      `    - "src/a.ts:1"\n` +
      `  scope: P-thu\n` +
      `  status: closed\n` +
      `  closed_at: "2026-02-01T00:00:00Z"\n` +
      `  closed_reason: "đã lỗi thời"\n`,
  };
}

test("ganas icebox list: không biết task đang làm mà thiếu --all → lỗi", async () => {
  const root = await makeProject(twoScopeFilesWithIcebox());
  try {
    await assert.rejects(
      () => runIcebox(iceboxArgv(root, ["list"])),
      /chưa biết đang làm task nào/,
    );
  } finally {
    await cleanup(root);
  }
});

test("ganas icebox list --closed: in mục đã đóng kèm closed_reason", async () => {
  const root = await makeProject(twoScopeFilesWithIcebox());
  try {
    await bindSession(root, "sess-1", "T-001");
    const res = await runCli(root, ["list"], { options: { session: "sess-1" }, flags: { closed: true } });
    assert.equal(res.code, 0);
    assert.match(res.out, /ICE-002/);
    assert.match(res.out, /đã lỗi thời/, "closed_reason phải được in ra");
  } finally {
    await cleanup(root);
  }
});

test("ganas icebox list --json: parse lại được", async () => {
  const root = await makeProject(twoScopeFilesWithIcebox());
  try {
    const res = await runCli(root, ["list"], { flags: { all: true, json: true } });
    const parsed = JSON.parse(res.out) as { total: number; rows: Array<{ id: string }> };
    assert.equal(parsed.total, 1, "mặc định chỉ status open — ICE-002 (closed) bị lọc ra");
    assert.equal(parsed.rows[0]!.id, "ICE-001");
  } finally {
    await cleanup(root);
  }
});
