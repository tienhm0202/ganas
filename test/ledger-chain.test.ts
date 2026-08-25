import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { loadGraph } from "../src/graph/load.js";
import type { LedgerEntry } from "../src/graph/types.js";
import { validateGraph } from "../src/graph/validate.js";
import {
  appendEntry,
  CHAIN_GENESIS,
  ledgerPath,
  readLedger,
  verifyChain,
} from "../src/verify/ledger.js";
import { cleanup, makeProject } from "./helpers.js";

/**
 * Hash-chain giữ dấu vết cho MỌI dòng sau một chỗ bị sửa — lược đồ giống
 * Secure Scuttlebutt / Certificate Transparency: mỗi dòng giữ hash của toàn
 * bộ chain tính tới ngay trước nó, nên sửa một dòng cũ làm lệch hash của mọi
 * dòng ghi sau nó, đọc lại là phát hiện được, không cần gì ngoài chính file.
 */

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    target: "F-A-001",
    kind: "probe",
    at: "2025-06-01T00:00:00.000Z",
    def: "abc123",
    result: "pass",
    by: "session:test",
    ...over,
  };
}

test("appendEntry gán seq tăng dần và prev_hash nối tiếp nhau", async () => {
  const root = await makeProject({});
  try {
    await appendEntry(root, entry({ at: "2025-01-01T00:00:00.000Z" }));
    await appendEntry(root, entry({ at: "2025-01-02T00:00:00.000Z" }));
    await appendEntry(root, entry({ at: "2025-01-03T00:00:00.000Z" }));

    const entries = await readLedger(root);
    assert.deepEqual(
      entries.map((e) => e.seq),
      [1, 2, 3],
    );
    assert.equal(entries[0]!.prev_hash, CHAIN_GENESIS);
    assert.notEqual(entries[1]!.prev_hash, CHAIN_GENESIS);
    assert.notEqual(entries[1]!.prev_hash, entries[2]!.prev_hash);
  } finally {
    await cleanup(root);
  }
});

test("⭐ chain nguyên vẹn → verifyChain ok", async () => {
  const root = await makeProject({});
  try {
    for (let i = 0; i < 5; i++) {
      await appendEntry(root, entry({ at: `2025-01-0${i + 1}T00:00:00.000Z` }));
    }
    const verdict = verifyChain(await readLedger(root));
    assert.equal(verdict.ok, true);
  } finally {
    await cleanup(root);
  }
});

test("⭐ sửa một dòng cũ sau khi ghi → verifyChain bắt được, chỉ đúng vị trí", async () => {
  const root = await makeProject({});
  try {
    for (let i = 0; i < 5; i++) {
      await appendEntry(root, entry({ at: `2025-01-0${i + 1}T00:00:00.000Z`, result: "pass" }));
    }

    const file = ledgerPath(root);
    const lines = (await readFile(file, "utf8")).trim().split("\n");
    // Sửa dòng thứ 3 (index 2) — đổi "pass" thành "fail", giữ nguyên seq/prev_hash
    // như cách một người sửa tay bằng editor sẽ làm (không tính lại hash).
    const tampered = JSON.parse(lines[2]!) as LedgerEntry;
    tampered.result = "fail";
    lines[2] = JSON.stringify(tampered);
    await writeFile(file, lines.join("\n") + "\n", "utf8");

    const verdict = verifyChain(await readLedger(root));
    assert.equal(verdict.ok, false);
    // Nội dung dòng 3 đổi ⇒ hash chain nó sinh ra lệch ⇒ dòng 4 (index 3) là nơi
    // đối chiếu `prev_hash` đầu tiên thất bại.
    assert.equal(verdict.brokenAt, 3);
  } finally {
    await cleanup(root);
  }
});

test("xoá một dòng ở giữa → verifyChain bắt được (không chỉ sửa mới bắt được)", async () => {
  const root = await makeProject({});
  try {
    for (let i = 0; i < 4; i++) {
      await appendEntry(root, entry({ at: `2025-01-0${i + 1}T00:00:00.000Z` }));
    }

    const file = ledgerPath(root);
    const lines = (await readFile(file, "utf8")).trim().split("\n");
    lines.splice(1, 1); // xoá dòng thứ 2
    await writeFile(file, lines.join("\n") + "\n", "utf8");

    const verdict = verifyChain(await readLedger(root));
    assert.equal(verdict.ok, false);
  } finally {
    await cleanup(root);
  }
});

test("dòng cũ không có prev_hash (trước migration) không bị coi là đứt chain", async () => {
  const root = await makeProject({});
  try {
    // Ghi thẳng một dòng "cũ" không qua appendEntry — mô phỏng dữ liệu từ
    // trước khi hash-chain tồn tại.
    const file = ledgerPath(root);
    await writeFile(file, JSON.stringify(entry({ at: "2024-01-01T00:00:00.000Z" })) + "\n", "utf8");

    // Từ đây trở đi ghi qua appendEntry như bình thường — chain bắt đầu lại.
    await appendEntry(root, entry({ at: "2025-01-01T00:00:00.000Z" }));
    await appendEntry(root, entry({ at: "2025-01-02T00:00:00.000Z" }));

    const verdict = verifyChain(await readLedger(root));
    assert.equal(verdict.ok, true);
  } finally {
    await cleanup(root);
  }
});

test("⭐ chain đứt → ganas validate báo knowledge/ledger-chain-broken", async () => {
  const root = await makeProject({});
  try {
    for (let i = 0; i < 3; i++) {
      await appendEntry(root, entry({ at: `2025-01-0${i + 1}T00:00:00.000Z` }));
    }

    const file = ledgerPath(root);
    const lines = (await readFile(file, "utf8")).trim().split("\n");
    const tampered = JSON.parse(lines[0]!) as LedgerEntry;
    tampered.def = "da-bi-doi";
    lines[0] = JSON.stringify(tampered);
    await writeFile(file, lines.join("\n") + "\n", "utf8");

    const graph = await loadGraph(root);
    const codes = validateGraph(graph).map((d) => d.code);
    assert.ok(codes.includes("knowledge/ledger-chain-broken"), JSON.stringify(codes));
  } finally {
    await cleanup(root);
  }
});

/* --- Đua: hai lượt append chạy CHỒNG nhau (ICE-014) ----------------------- */

/**
 * `appendEntry` ĐỌC toàn bộ sổ cái để tính `seq` và `prev_hash` rồi mới ghi.
 * Không có khoá thì hai lượt chạy chồng nhau đọc CÙNG một trạng thái rồi cùng
 * ghi: dòng sau nhận `seq` trùng dòng trước và `prev_hash` tính thiếu một
 * dòng — tức đứt đúng chuỗi hash mà mấy test trên vừa dựng lên để chứng minh
 * sổ cái không bị sửa tay.
 *
 * Hai test dưới đây ép đúng tình huống đó ở hai tầng khác nhau, vì hai tầng
 * hỏng theo hai kiểu: xen kẽ trong MỘT tiến trình (nhiều lời gọi `verify` của
 * cùng một lệnh) và hai TIẾN TRÌNH thật (`ganas verify` chạy song song, đúng
 * cảnh mà ICE-014 đo được). Bỏ `withFileLock` khỏi `appendEntry` là cả hai đỏ.
 */

/** Không dòng nào trùng `seq`, và `seq` phủ đúng 1..n — không hụt, không lặp. */
function assertSeqIntact(entries: readonly LedgerEntry[], expected: number): void {
  const seqs = entries.map((e) => e.seq);
  assert.equal(entries.length, expected, `thiếu dòng: ghi ${expected}, đọc lại ${entries.length}`);
  assert.deepEqual(
    [...seqs].sort((a, b) => (a ?? 0) - (b ?? 0)),
    Array.from({ length: expected }, (_, i) => i + 1),
    `seq trùng hoặc hụt: ${JSON.stringify(seqs)}`,
  );
}

test("⭐ nhiều appendEntry chạy chồng trong một tiến trình → chain liền, seq không trùng", async () => {
  const root = await makeProject({});
  try {
    const n = 12;
    // KHÔNG await từng cái: `readLedger` là I/O bất đồng bộ, nên `Promise.all`
    // cho phép lượt sau đọc trước khi lượt trước kịp ghi — đúng cửa sổ đua.
    await Promise.all(
      Array.from({ length: n }, (_, i) =>
        appendEntry(root, entry({ at: `2025-02-01T00:00:${String(i).padStart(2, "0")}.000Z` })),
      ),
    );

    const entries = await readLedger(root);
    assertSeqIntact(entries, n);
    assert.equal(verifyChain(entries).ok, true, "hash-chain đứt sau khi ghi chồng");
  } finally {
    await cleanup(root);
  }
});

test("⭐ hai TIẾN TRÌNH cùng ghi sổ cái → chain liền, seq không trùng", async () => {
  const root = await makeProject({});
  try {
    const repoRoot = join(import.meta.dirname, "..");
    const worker = join(root, "append-worker.mts");
    // Worker nằm NGOÀI `src/` (trong chính thư mục dự án tạm) để không lọt vào
    // bản đồ khối — `test/module-map.test.ts` đòi mọi file `src/**` thuộc một khối.
    await writeFile(
      worker,
      `import { appendEntry } from ${JSON.stringify(join(repoRoot, "src/verify/ledger.js"))};\n` +
        `const [root, tag] = process.argv.slice(2);\n` +
        `for (let i = 0; i < 6; i++) {\n` +
        `  await appendEntry(root!, { target: "F-A-001", kind: "probe", at: \`2025-03-0\${i + 1}T00:00:00.000Z\`, def: tag!, result: "pass", by: "session:" + tag });\n` +
        `}\n`,
      "utf8",
    );

    const runWorker = (tag: string): Promise<{ code: number; stderr: string }> =>
      new Promise((done, fail) => {
        const child = spawn(
          process.execPath,
          [join(repoRoot, "node_modules/tsx/dist/cli.mjs"), worker, root, tag],
          { cwd: repoRoot, stdio: ["ignore", "ignore", "pipe"] },
        );
        let stderr = "";
        child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
        child.on("error", fail);
        child.on("close", (code) => done({ code: code ?? 1, stderr }));
      });

    const results = await Promise.all([runWorker("aaa"), runWorker("bbb")]);
    for (const r of results) assert.equal(r.code, 0, `worker lỗi: ${r.stderr}`);

    const entries = await readLedger(root);
    assertSeqIntact(entries, 12);
    assert.equal(verifyChain(entries).ok, true, "hash-chain đứt sau khi hai tiến trình ghi chồng");
  } finally {
    await cleanup(root);
  }
});
