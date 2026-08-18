import assert from "node:assert/strict";
import { test } from "node:test";

import { run as runSearch } from "../src/commands/search.js";
import { loadGraph } from "../src/graph/load.js";
import type { Graph } from "../src/graph/types.js";
import { searchFacts, taskQuery, tokenize } from "../src/search.js";
import type { Argv } from "../src/util/args.js";
import { GanasError } from "../src/util/errors.js";
import { cleanup, makeProject } from "./helpers.js";

/**
 * Test cho `src/search.ts` (module thuần — BM25 trên fact) và
 * `src/commands/search.ts` (lệnh `ganas search`). Cùng file, theo khuôn
 * `debt-cmd.test.ts` trộn cả hai tầng khi việc đủ nhỏ để không cần tách.
 */

/* ------------------------------------------------------------------------- *
 * Dựng graph tối thiểu, không qua validateGraph — searchFacts chỉ đọc
 * `graph.facts`, không cần spine (goal/design) hợp lệ.
 * ------------------------------------------------------------------------- */

async function graphFrom(files: Record<string, string>): Promise<Graph> {
  const root = await makeProject(files);
  try {
    return await loadGraph(root);
  } finally {
    await cleanup(root);
  }
}

const WEBHOOK_TIMEOUT = "Webhook Zalo OA bị timeout khi gọi API gửi tin nhắn xác nhận.";
const WEBHOOK_NO_TIMEOUT = "Webhook Zalo OA đã tích hợp xong, hoạt động ổn định.";
const ONLY_ZALO = "Tài liệu chung về Zalo, không nói gì cụ thể hơn.";

function factYaml(
  id: string,
  statement: string,
  opts: { scope?: string; dependsOn?: string[]; run?: string } = {},
): string {
  const deps = opts.dependsOn ?? [];
  return `- id: ${id}
  scope: ${opts.scope ?? "P-thu"}
  statement: "${statement}"
  verify:
    run: "${opts.run ?? "true"}"
${deps.length ? `  depends_on:\n${deps.map((d) => `    - "${d}"`).join("\n")}\n` : ""}`;
}

/**
 * F-A-001: khớp cả 3 từ truy vấn "webhook zalo timeout".
 * F-A-002: khớp đúng 2 từ ("webhook", "zalo"), không "timeout".
 * F-C-003: khớp đúng 1 từ ("zalo").
 * F-D-004: khớp cả 3 từ, nhưng ở phạm vi KHÁC (P-khac).
 */
function baseFacts(): Record<string, string> {
  return {
    ".ganas/facts/a.yaml": [
      factYaml("F-A-001", WEBHOOK_TIMEOUT, { dependsOn: ["src/integrations/zalo.ts"] }),
      factYaml("F-A-002", WEBHOOK_NO_TIMEOUT),
    ].join("\n"),
    ".ganas/facts/c.yaml": factYaml("F-C-003", ONLY_ZALO),
    ".ganas/facts/d.yaml": factYaml("F-D-004", WEBHOOK_TIMEOUT, { scope: "P-khac" }),
  };
}

/* ------------------------------------------------------------------------- *
 * tokenize
 * ------------------------------------------------------------------------- */

test("tokenize bóc dấu tiếng Việt", () => {
  const tokens = tokenize("Khách hàng đã xác nhận đổi địa chỉ");
  assert.ok(tokens.includes("khach"), tokens.join(","));
  assert.ok(tokens.includes("hang"), tokens.join(","));
  assert.ok(tokens.includes("da"), tokens.join(","));
  assert.ok(tokens.includes("xac"), tokens.join(","));
  assert.ok(tokens.includes("nhan"), tokens.join(","));
  assert.ok(tokens.includes("doi"), tokens.join(","));
});

test("tokenize sinh cả token nguyên lẫn mảnh con cho id/đường dẫn", () => {
  const tokens = tokenize("Xem T-017 và src/graph/load.ts, cũng liên quan zalo_oa");
  assert.ok(tokens.includes("t-017"), tokens.join(","));
  assert.ok(tokens.includes("017"), tokens.join(","));
  assert.ok(tokens.includes("src/graph/load.ts"), tokens.join(","));
  assert.ok(tokens.includes("src"), tokens.join(","));
  assert.ok(tokens.includes("graph"), tokens.join(","));
  assert.ok(tokens.includes("load"), tokens.join(","));
  assert.ok(tokens.includes("ts"), tokens.join(","));
  assert.ok(tokens.includes("zalo_oa"), tokens.join(","));
  assert.ok(tokens.includes("zalo"), tokens.join(","));
  assert.ok(tokens.includes("oa"), tokens.join(","));
  // token dài 1 ký tự bị loại — "t" (mảnh của "t-017") không xuất hiện riêng.
  assert.ok(!tokens.includes("t"), tokens.join(","));
});

/* ------------------------------------------------------------------------- *
 * searchFacts
 * ------------------------------------------------------------------------- */

test("xếp hạng đúng khi một fact khớp nhiều từ truy vấn hơn", async () => {
  const graph = await graphFrom(baseFacts());
  const hits = searchFacts(graph, "webhook zalo timeout");
  const ids = hits.map((h) => h.factId);
  assert.ok(ids.includes("F-A-001"));
  assert.ok(ids.includes("F-A-002"));
  const iA = ids.indexOf("F-A-001");
  const iB = ids.indexOf("F-A-002");
  assert.ok(
    iA < iB,
    `F-A-001 khớp 3/3 từ, F-A-002 khớp 2/3 — phải xếp trước. Thứ tự thực tế: ${ids.join(",")}`,
  );
});

test("minMatchedTerms mặc định (2) loại hit chỉ khớp một từ", async () => {
  const graph = await graphFrom(baseFacts());
  const hits = searchFacts(graph, "webhook zalo timeout");
  assert.ok(
    !hits.some((h) => h.factId === "F-C-003"),
    "F-C-003 chỉ khớp 'zalo' (1/3 từ) — không được lọt qua ngưỡng mặc định",
  );

  const loose = searchFacts(graph, "webhook zalo timeout", { minMatchedTerms: 1 });
  assert.ok(
    loose.some((h) => h.factId === "F-C-003"),
    "hạ ngưỡng minMatchedTerms:1 thì F-C-003 phải xuất hiện",
  );
});

test("exclude loại đúng id, không đụng id khác", async () => {
  const graph = await graphFrom(baseFacts());
  const hits = searchFacts(graph, "webhook zalo timeout", { exclude: ["F-A-001"] });
  assert.ok(!hits.some((h) => h.factId === "F-A-001"));
  assert.ok(hits.some((h) => h.factId === "F-A-002"));
});

test("scope bó kết quả đúng phạm vi", async () => {
  const graph = await graphFrom(baseFacts());
  const inThu = searchFacts(graph, "webhook zalo timeout", { scope: "P-thu" });
  assert.ok(!inThu.some((h) => h.factId === "F-D-004"));

  const inKhac = searchFacts(graph, "webhook zalo timeout", { scope: "P-khac" });
  assert.ok(inKhac.some((h) => h.factId === "F-D-004"));
  assert.ok(!inKhac.some((h) => h.factId === "F-A-001"));
});

test("tie-break bằng factId cho kết quả tất định", async () => {
  // Hai fact CÙNG nội dung (cùng điểm BM25 tuyệt đối), khai trong file theo
  // thứ tự NGƯỢC bảng chữ cái (F-E-005 trước F-E-002) — nếu không tie-break
  // chủ động, thứ tự ra sẽ theo thứ tự nạp (sai), không phải bảng chữ cái.
  const files = {
    ".ganas/facts/e.yaml": [
      factYaml("F-E-005", WEBHOOK_TIMEOUT),
      factYaml("F-E-002", WEBHOOK_TIMEOUT),
    ].join("\n"),
  };
  const graph = await graphFrom(files);

  const run1 = searchFacts(graph, "webhook zalo timeout").map((h) => h.factId);
  const run2 = searchFacts(graph, "webhook zalo timeout").map((h) => h.factId);
  assert.deepEqual(run1, run2, "hai lần chạy phải ra cùng thứ tự");
  assert.deepEqual(run1, ["F-E-002", "F-E-005"], "cùng điểm thì tie-break tăng dần theo factId");
});

test("kho rỗng không nổ", async () => {
  const graph = await graphFrom({});
  assert.deepEqual(searchFacts(graph, "bất cứ điều gì"), []);
});

test("truy vấn một token vẫn ra kết quả (ngưỡng tự hạ xuống 1)", async () => {
  const graph = await graphFrom(baseFacts());
  const hits = searchFacts(graph, "zalo");
  assert.ok(hits.length > 0, "truy vấn 1 từ không được câm");
  assert.ok(hits.every((h) => h.matchedTerms.length >= 1));
});

test("taskQuery gộp title, must_read.path, open_questions", () => {
  const task = {
    title: "Sửa lỗi webhook Zalo timeout",
    context_contract: {
      must_read: [{ path: "src/integrations/zalo.ts", why: "vì lý do" }],
      facts: [],
      open_questions: ["Vì sao webhook chạy chậm?"],
    },
  } as unknown as Parameters<typeof taskQuery>[0];
  const q = taskQuery(task);
  assert.match(q, /Sửa lỗi webhook Zalo timeout/);
  assert.match(q, /src\/integrations\/zalo\.ts/);
  assert.match(q, /Vì sao webhook chạy chậm/);
});

/* ------------------------------------------------------------------------- *
 * `ganas search` (CLI)
 * ------------------------------------------------------------------------- */

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

function searchArgv(
  root: string,
  query: string[],
  opts: { task?: string; scope?: string; limit?: string; json?: boolean } = {},
): Argv {
  const options: Record<string, string> = { root };
  if (opts.task) options["task"] = opts.task;
  if (opts.scope) options["scope"] = opts.scope;
  if (opts.limit) options["limit"] = opts.limit;
  return {
    positional: query,
    options,
    flags: opts.json ? { json: true } : {},
    passthrough: [],
  };
}

test("CLI: thiếu cả chuỗi lẫn --task thì báo GanasError", async () => {
  const root = await makeProject(baseFacts());
  try {
    await assert.rejects(() => runSearch(searchArgv(root, [])), GanasError);
  } finally {
    await cleanup(root);
  }
});

test("CLI: không có kết quả thì in một dòng và thoát mã 0", async () => {
  const root = await makeProject(baseFacts());
  try {
    const { result, out } = await captureStdout(() =>
      runSearch(searchArgv(root, ["khongtontaicutu"])),
    );
    assert.equal(result, 0);
    assert.match(out, /không tìm thấy/i);
  } finally {
    await cleanup(root);
  }
});

test("CLI: in nhãn độ tươi cho fact chưa verify bao giờ, không chìm cuối dòng", async () => {
  const root = await makeProject(baseFacts());
  try {
    const { out } = await captureStdout(() =>
      runSearch(searchArgv(root, ["webhook", "zalo", "timeout"])),
    );
    // F-A-001 chưa có last_verified_at ⇒ never_verified.
    const line = out.split("\n").find((l) => l.includes("F-A-001"));
    assert.ok(line, `không thấy dòng của F-A-001 trong:\n${out}`);
    assert.match(line, /^⚠ \[NEVER_VERIFIED\]/, `nhãn phải đứng đầu dòng, thực tế: "${line}"`);
    assert.match(out, /chưa chạy lần nào/);
  } finally {
    await cleanup(root);
  }
});

test("CLI: --json xuất cấu trúc parse lại được", async () => {
  const root = await makeProject(baseFacts());
  try {
    const { out } = await captureStdout(() =>
      runSearch(searchArgv(root, ["webhook", "zalo", "timeout"], { json: true })),
    );
    const data = JSON.parse(out) as {
      query: string;
      total: number;
      hits: Array<{ factId: string; score: number; freshness: string | null }>;
    };
    assert.equal(data.query, "webhook zalo timeout");
    assert.ok(data.total >= 2);
    assert.ok(data.hits.some((h) => h.factId === "F-A-001"));
    const a001 = data.hits.find((h) => h.factId === "F-A-001")!;
    assert.equal(a001.freshness, "never_verified");
    assert.equal(typeof a001.score, "number");
  } finally {
    await cleanup(root);
  }
});

test("CLI: --limit cắt bớt và ghi chú phần còn lại", async () => {
  const root = await makeProject(baseFacts());
  try {
    const { out } = await captureStdout(() =>
      runSearch(searchArgv(root, ["webhook", "zalo", "timeout"], { limit: "1" })),
    );
    const lines = out.split("\n").filter((l) => /^⚠|^✓/.test(l));
    assert.equal(lines.length, 1, `--limit 1 phải in đúng 1 kết quả, thực tế:\n${out}`);
    assert.match(out, /đã bỏ bớt \d+ mục/);
  } finally {
    await cleanup(root);
  }
});

test("CLI: --task không làm vỡ header dù must_read/open_questions dài nhiều dòng", async () => {
  // taskQuery() nối title + must_read + open_questions bằng " \n " — task
  // thật (nhiều must_read, nhiều open_questions) cho ra `query` nhiều dòng.
  // Header PHẢI vẫn gọn một dòng, không được vỡ dấu nháy giữa chừng.
  const files: Record<string, string> = {
    ...baseFacts(),
    ".ganas/tasks/T-002.yaml": `id: T-002
title: "Sua loi webhook Zalo timeout"
serves:
  - G-001
implements: D-001
scope: P-thu
status: todo
exit_contract:
  - kind: command
    run: "true"
context_contract:
  facts: []
  must_read:
    - path: "src/integrations/zalo.ts"
      why: "noi phat sinh loi"
    - path: "src/pay/style.ts"
      why: "khong lien quan nhung van khai"
  open_questions:
    - "Vi sao webhook chay cham?"
`,
  };
  const root = await makeProject(files);
  try {
    const { out } = await captureStdout(() =>
      runSearch(searchArgv(root, [], { task: "T-002" })),
    );
    const lines = out.split("\n");
    assert.match(
      lines[0]!,
      /^\d+ kết quả cho task T-002 — "Sua loi webhook Zalo timeout"/,
      `header phải gọn một dòng dạng "task <id> — <title>", thực tế: "${lines[0]}"`,
    );
    assert.ok(lines[0]!.endsWith(":"), `header phải kết thúc bằng ":" trên cùng dòng: "${lines[0]}"`);
    assert.equal(
      lines[1],
      "",
      `header phải chỉ chiếm ĐÚNG 1 dòng (dòng 2 phải là dòng trống ngăn cách) — thực tế toàn bộ:\n${out}`,
    );
  } finally {
    await cleanup(root);
  }
});

test("CLI: --task không có kết quả thì thông báo vẫn gọn một dòng", async () => {
  const files: Record<string, string> = {
    ...baseFacts(),
    ".ganas/tasks/T-003.yaml": `id: T-003
title: "Zzqx Vbnm Asdf"
serves:
  - G-001
implements: D-001
scope: P-thu
status: todo
exit_contract:
  - kind: command
    run: "true"
context_contract:
  facts: []
  must_read:
    - path: "config/settings-panel.yaml"
      why: "chi de test"
  open_questions:
    - "Why does zzqx fail?"
`,
  };
  const root = await makeProject(files);
  try {
    const { out } = await captureStdout(() =>
      runSearch(searchArgv(root, [], { task: "T-003" })),
    );
    const lines = out.split("\n").filter((l) => l.length > 0);
    assert.equal(lines.length, 1, `thông báo "không tìm thấy" phải gọn 1 dòng, thực tế:\n${out}`);
    assert.match(lines[0]!, /^Không tìm thấy fact nào khớp truy vấn task T-003 — "/);
  } finally {
    await cleanup(root);
  }
});

test("CLI: --task dùng chính task làm truy vấn, loại fact đã khai tay, label fact ngoài phạm vi", async () => {
  const files: Record<string, string> = {
    ...baseFacts(),
    ".ganas/tasks/T-001.yaml": `id: T-001
title: "Sửa lỗi webhook Zalo timeout"
serves:
  - G-001
implements: D-001
scope: P-thu
status: todo
exit_contract:
  - kind: command
    run: "true"
context_contract:
  facts:
    - F-A-002
  must_read: []
  open_questions: []
`,
  };
  const root = await makeProject(files);
  try {
    const { out } = await captureStdout(() =>
      runSearch(searchArgv(root, [], { task: "T-001" })),
    );
    // F-A-002 đã khai tay trong context_contract.facts ⇒ bị loại khỏi kết quả.
    assert.ok(!out.includes("F-A-002"), `F-A-002 đã khai tay, không được xuất hiện lại:\n${out}`);
    // F-A-001 cùng phạm vi P-thu, khớp truy vấn (title task) ⇒ phải có mặt.
    assert.ok(out.includes("F-A-001"), `thiếu F-A-001 trong:\n${out}`);
    // F-D-004 khớp nội dung nhưng ở P-khac ≠ P-thu (scope task) ⇒ phải bị label.
    const dLine = out
      .split("\n\n")
      .find((block) => block.includes("F-D-004"));
    assert.ok(dLine, `thiếu F-D-004 trong:\n${out}`);
    assert.match(dLine, /NGOÀI PHẠM VI/);
  } finally {
    await cleanup(root);
  }
});

test("CLI: task không tồn tại thì báo GanasError", async () => {
  const root = await makeProject(baseFacts());
  try {
    await assert.rejects(
      () => runSearch(searchArgv(root, [], { task: "T-999" })),
      GanasError,
    );
  } finally {
    await cleanup(root);
  }
});
