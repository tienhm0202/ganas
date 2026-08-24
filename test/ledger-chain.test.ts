import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
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
