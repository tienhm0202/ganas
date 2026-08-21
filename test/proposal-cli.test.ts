import assert from "node:assert/strict";
import { test } from "node:test";

import { rankProposals, run as runProposal } from "../src/commands/proposal.js";
import { loadGraph } from "../src/graph/load.js";
import type { Proposal } from "../src/model/index.js";
import type { Argv } from "../src/util/args.js";
import { cleanup, makeProject, validSpine } from "./helpers.js";

/**
 * `ganas proposal` — CLI thật: ghi file, đọc lại qua `loadGraph`, và ranh giới
 * MÁY/NGƯỜI (approve/reject đòi `--by`).
 *
 * Khác `test/proposal-model.test.ts` (schema + luật validate).
 */

async function captureStdout<T>(fn: () => Promise<T>): Promise<{ result: T; out: string }> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: unknown }).write = (chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  };
  try {
    return { result: await fn(), out: chunks.join("") };
  } finally {
    (process.stdout as { write: unknown }).write = original;
  }
}

function argv(
  root: string,
  positional: string[],
  opts: { options?: Record<string, string>; multi?: Record<string, string[]>; flags?: Record<string, boolean> } = {},
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
  opts: Parameters<typeof argv>[2] = {},
): Promise<{ code: number; out: string }> {
  const { result, out } = await captureStdout(() => runProposal(argv(root, positional, opts)));
  return { code: result, out };
}

const NEW_OPTS = {
  options: {
    title: "Tách khối trùng vùng code",
    problem: "hai khối cùng trỏ src/a.ts",
    change: "tách src/a.ts ra khối riêng",
    weight: "4",
    ease: "3",
    scope: "P-thu",
  },
  multi: { anchor: ["src/a.ts:12"] },
  flags: { all: true },
};

/* --- Sắp xếp: chỗ DUY NHẤT weight/ease được đọc (quyết định PR-001) -------- */

test("rankProposals: sắp giảm dần theo weight + ease, tie-break theo id", () => {
  const p = (id: string, weight: number, ease: number): Proposal =>
    ({ id, weight, ease }) as unknown as Proposal;
  const ranked = rankProposals([p("PR-001", 1, 1), p("PR-003", 5, 4), p("PR-002", 4, 5)]);
  // PR-002 và PR-003 cùng tổng 9 → id nhỏ hơn đứng trước.
  assert.deepEqual(ranked.map((x) => x.id), ["PR-002", "PR-003", "PR-001"]);
});

/* --- new ------------------------------------------------------------------ */

test("new: ghi file đọc lại được qua loadGraph, mặc định pending", async () => {
  const root = await makeProject(validSpine());
  try {
    const { code, out } = await runCli(root, ["new"], NEW_OPTS);
    assert.equal(code, 0);
    assert.match(out, /PR-001/);

    const graph = await loadGraph(root);
    const p = graph.proposals.get("PR-001");
    assert.ok(p, "đề xuất phải nạp được vào graph");
    assert.equal(p.value.status, "pending");
    assert.equal(p.value.scope, "P-thu");
    assert.equal(p.value.weight + p.value.ease, 7);
  } finally {
    await cleanup(root);
  }
});

test("new: thiếu --anchor thì từ chối ghi — không bằng chứng thì chỉ là ý kiến", async () => {
  const root = await makeProject(validSpine());
  try {
    await assert.rejects(
      () => runCli(root, ["new"], { ...NEW_OPTS, multi: {} }),
      /anchor/,
    );
    const graph = await loadGraph(root);
    assert.equal(graph.proposals.size, 0, "không được ghi file nào khi thiếu bằng chứng");
  } finally {
    await cleanup(root);
  }
});

test("new: thiếu --problem thì từ chối — nêu giải pháp mà không nêu vấn đề", async () => {
  const root = await makeProject(validSpine());
  try {
    const opts = { ...NEW_OPTS, options: { ...NEW_OPTS.options } };
    delete (opts.options as Record<string, string>)["problem"];
    await assert.rejects(() => runCli(root, ["new"], opts), /--problem/);
  } finally {
    await cleanup(root);
  }
});

/* --- list ----------------------------------------------------------------- */

test("list: mặc định chỉ hiện pending, và in đúng tổng weight + ease", async () => {
  const root = await makeProject(validSpine());
  try {
    await runCli(root, ["new"], NEW_OPTS);
    const { out } = await runCli(root, ["list"], { flags: { all: true } });
    assert.match(out, /PR-001/);
    assert.match(out, /weight 4 \+ ease 3 = 7/);

    await runCli(root, ["reject", "PR-001"], {
      options: { by: "@nguoi-duyet", why: "hệ cũ đang chạy" },
    });
    const after = await runCli(root, ["list"], { flags: { all: true } });
    assert.doesNotMatch(after.out, /PR-001/, "đã từ chối thì rơi khỏi danh sách mặc định");

    const all = await runCli(root, ["list"], { flags: { all: true, "all-status": true } });
    assert.match(all.out, /PR-001/, "--all-status vẫn phải thấy");
    assert.match(all.out, /REJECTED/);
  } finally {
    await cleanup(root);
  }
});

/* --- approve / reject: ranh giới MÁY / NGƯỜI ------------------------------ */

test("approve KHÔNG có --by thì từ chối — duyệt là câu trả lời của người", async () => {
  const root = await makeProject(validSpine());
  try {
    await runCli(root, ["new"], NEW_OPTS);
    await assert.rejects(() => runCli(root, ["approve", "PR-001"]), /--by/);

    const graph = await loadGraph(root);
    assert.equal(graph.proposals.get("PR-001")?.value.status, "pending", "phải còn nguyên pending");
  } finally {
    await cleanup(root);
  }
});

test("reject KHÔNG có --why thì từ chối ghi", async () => {
  const root = await makeProject(validSpine());
  try {
    await runCli(root, ["new"], NEW_OPTS);
    await assert.rejects(
      () => runCli(root, ["reject", "PR-001"], { options: { by: "@nguoi-duyet" } }),
      /--why/,
    );
  } finally {
    await cleanup(root);
  }
});

test("reject ghi đủ decided_by/decided_at/why_rejected và vẫn hợp schema", async () => {
  const root = await makeProject(validSpine());
  try {
    await runCli(root, ["new"], NEW_OPTS);
    const { out } = await runCli(root, ["reject", "PR-001"], {
      options: { by: "@nguoi-duyet", why: "hệ cũ đang chạy, chưa đụng" },
    });
    assert.match(out, /icebox/, "phải chỉ đường giữ lại: từ chối không phải xoá");

    const graph = await loadGraph(root);
    const p = graph.proposals.get("PR-001")?.value;
    assert.equal(p?.status, "rejected");
    assert.equal(p?.decided_by, "@nguoi-duyet");
    assert.match(p?.why_rejected ?? "", /hệ cũ đang chạy/);
    assert.ok(p?.decided_at, "phải có decided_at");
  } finally {
    await cleanup(root);
  }
});

test("approve --promoted-to trỏ thực thể ma thì từ chối ngay, không ghi", async () => {
  const root = await makeProject(validSpine());
  try {
    await runCli(root, ["new"], NEW_OPTS);
    await assert.rejects(
      () =>
        runCli(root, ["approve", "PR-001"], {
          options: { by: "@nguoi-duyet", "promoted-to": "T-999" },
        }),
      /T-999/,
    );
    const graph = await loadGraph(root);
    assert.equal(graph.proposals.get("PR-001")?.value.status, "pending");
  } finally {
    await cleanup(root);
  }
});

test("đã quyết rồi thì không quyết lại — đổi ý phải là đề xuất mới", async () => {
  const root = await makeProject(validSpine());
  try {
    await runCli(root, ["new"], NEW_OPTS);
    await runCli(root, ["reject", "PR-001"], { options: { by: "@nguoi-duyet", why: "chưa cần" } });
    await assert.rejects(
      () => runCli(root, ["approve", "PR-001"], { options: { by: "@nguoi-duyet" } }),
      /supersedes/,
    );
  } finally {
    await cleanup(root);
  }
});

/* --- show ----------------------------------------------------------------- */

test("show: pending thì chỉ đường cho người quyết; id ma thì báo lỗi rõ", async () => {
  const root = await makeProject(validSpine());
  try {
    await runCli(root, ["new"], NEW_OPTS);
    const { out } = await runCli(root, ["show", "PR-001"]);
    assert.match(out, /## Vấn đề/);
    assert.match(out, /## Đề nghị/);
    assert.match(out, /approve PR-001 --by/);

    await assert.rejects(() => runCli(root, ["show", "PR-404"]), /PR-404/);
  } finally {
    await cleanup(root);
  }
});
