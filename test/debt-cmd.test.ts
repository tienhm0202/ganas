import assert from "node:assert/strict";
import { test } from "node:test";

import { run as ganasCommit } from "../src/commands/commit.js";
import { commitDebtSummary, renderDebtSection, run as runDebt } from "../src/commands/debt.js";
import type { DebtRow } from "../src/debt.js";
import type { Graph } from "../src/graph/types.js";
import { bindSession } from "../src/state.js";
import { type Argv } from "../src/util/args.js";
import { runShell } from "../src/util/exec.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

/**
 * Test cho `src/commands/debt.ts` (lệnh `ganas debt`) và phần nối vào
 * `ganas commit` — KHÁC `test/debt.test.ts`, vốn test `src/debt.ts` thuần
 * (chấm điểm/gộp/sắp xếp, không I/O, không CLI). Đặt tên `debt-cmd` theo
 * đúng quy ước đã có của `scope-cmd.test.ts` (test lệnh) so với
 * `scope-brief.test.ts` (test module khác) — hai file test cùng chủ đề
 * "debt" nhưng khác tầng, không trùng tên.
 */

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

function debtArgv(root: string, opts: { session?: string; all?: boolean; json?: boolean } = {}): Argv {
  return {
    positional: [],
    options: { root, ...(opts.session ? { session: opts.session } : {}) },
    flags: { ...(opts.all ? { all: true } : {}), ...(opts.json ? { json: true } : {}) },
    passthrough: [],
  };
}

async function runDebtCli(
  root: string,
  opts: { session?: string; all?: boolean; json?: boolean } = {},
): Promise<{ code: number; out: string }> {
  const { result, out } = await captureStdout(() => runDebt(debtArgv(root, opts)));
  return { code: result, out };
}

/**
 * Hai phạm vi (P-thu, P-khac), mỗi phạm vi một task + một khối.
 *
 * Nợ tự sinh KHÔNG cần dàn dựng gì thêm, nhờ vào chính các luật đã có:
 *  - `task()` (test/helpers.ts) không khai `model` ⇒ `spine/task-missing-model`
 *    (scoped qua chính file task).
 *  - Khối `status: implemented` + `verify: []` (mặc định) ⇒ `unverified-module`
 *    của `computeDebt` (scoped qua `module.scope`). Cố tình dùng `implemented`
 *    chứ không phải `unmapped` (mặc định của `moduleYaml()`) — `computeDebt`
 *    bỏ qua khối `unmapped`, và không dùng `verified` vì trạng thái đó đòi
 *    `verify` phải khác rỗng (một luật validate khác, không liên quan ở đây).
 */
function twoScopeFiles(): Record<string, string> {
  return {
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task("T-001", { scope: "P-thu" }),
    ".ganas/scopes/P-thu.yaml": scope("P-thu", { modules: ["M-a"] }),
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", { scope: "P-thu", extra: "status: implemented\n" }),
    ".ganas/tasks/T-002.yaml": task("T-002", { scope: "P-khac" }),
    ".ganas/scopes/P-khac.yaml": scope("P-khac", { modules: ["M-b"] }),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", {
      scope: "P-khac",
      paths: ["src/b/**"],
      extra: "status: implemented\n",
    }),
  };
}

/* --- `ganas debt`: phạm vi, --all, --json ---------------------------------- */

test("ganas debt: không biết task đang làm thì báo lỗi rõ ràng, không âm thầm trả rỗng", async () => {
  const root = await makeProject(twoScopeFiles());
  try {
    await assert.rejects(() => runDebt(debtArgv(root)), /chưa biết đang làm task nào/);
  } finally {
    await cleanup(root);
  }
});

test("ganas debt: lọc đúng phạm vi task đang làm; --all in nhiều hơn hoặc bằng", async () => {
  const root = await makeProject(twoScopeFiles());
  try {
    await bindSession(root, "sess-1", "T-001");

    const scopedJson = await runDebtCli(root, { session: "sess-1", json: true });
    assert.equal(scopedJson.code, 0);
    const scoped = JSON.parse(scopedJson.out) as { scope: string; rows: DebtRow[] };
    assert.equal(scoped.scope, "P-thu");
    assert.ok(scoped.rows.length > 0, "phải có ít nhất nợ task-missing-model + unverified-module");
    for (const r of scoped.rows) assert.equal(r.scopeId, "P-thu", `hàng ${r.code} lẫn phạm vi khác`);

    const allJson = await runDebtCli(root, { all: true, json: true });
    const all = JSON.parse(allJson.out) as { rows: DebtRow[] };
    assert.ok(
      all.rows.length >= scoped.rows.length,
      "--all phải in nhiều hơn hoặc bằng bản đã lọc phạm vi",
    );

    const scopedText = await runDebtCli(root, { session: "sess-1" });
    assert.match(scopedText.out, /Nợ trong phạm vi P-thu/);
    // Có nợ ở P-khac ⇒ phải có dòng đếm phần còn lại, không im lặng.
    assert.match(scopedText.out, /Ngoài phạm vi này: còn \d+ mục — `ganas debt --all`/);
  } finally {
    await cleanup(root);
  }
});

test("ganas debt --json: parse được, rows sắp giảm dần theo total", async () => {
  const root = await makeProject(twoScopeFiles());
  try {
    const { code, out } = await runDebtCli(root, { all: true, json: true });
    assert.equal(code, 0);
    const parsed = JSON.parse(out) as { rows: DebtRow[] };
    assert.ok(Array.isArray(parsed.rows));
    for (let i = 1; i < parsed.rows.length; i++) {
      assert.ok(
        parsed.rows[i - 1]!.total >= parsed.rows[i]!.total,
        `hàng ${i - 1} (${parsed.rows[i - 1]!.total}) phải >= hàng ${i} (${parsed.rows[i]!.total})`,
      );
    }
  } finally {
    await cleanup(root);
  }
});

/* --- Cắt bớt phải có ghi chú ------------------------------------------------ */

function fakeRow(i: number): DebtRow {
  const code = `demo/code-${String(i).padStart(2, "0")}`;
  return {
    code,
    score: { weight: 3, ease: 3 },
    total: 100 - i, // đã sắp giảm dần sẵn, khớp hợp đồng của debtRows()
    severity: "warning",
    scopeId: "P-thu",
    source: {
      origin: "diagnostic",
      diagnostic: { severity: "warning", code, message: `nợ demo ${i}`, file: `f${i}.yaml` },
    },
  };
}

/**
 * `rowLocation` (src/commands/debt.ts) chỉ tới được từ đây — nó không phải
 * API của `src/debt.ts` nên `test/debt.test.ts` không import được. Đi vòng
 * qua `renderDebtSection` (đã export) để quan sát output của nó thay vì gọi
 * hàm private trực tiếp.
 */
function fakeIceboxRow(): DebtRow {
  return {
    code: "icebox",
    score: { weight: 4, ease: 2 },
    total: 6,
    severity: undefined,
    scopeId: "P-thu",
    source: {
      origin: "icebox",
      file: ".ganas/icebox/2026-01.yaml",
      item: {
        id: "ICE-099",
        title: "Việc hoãn thử",
        found_at: "2026-01-01T00:00:00Z",
        review_after_days: 30,
        weight: 4,
        ease: 2,
        why_deferred: "chưa tới lượt làm",
        anchors: [{ kind: "file", path: "src/debt.ts", line: 1 }],
        status: "open",
      },
    },
  };
}

test("renderDebtSection: hàng icebox in vị trí bằng anchor đầu tiên (rowLocation), không phải đường dẫn file YAML của nó", () => {
  const out = renderDebtSection("Nợ demo:", [fakeIceboxRow()], 5);
  assert.match(out, /src\/debt\.ts:1/, "phải in anchor đã formatAnchor");
  assert.doesNotMatch(out, /2026-01\.yaml/, "không được in đường dẫn file YAML — anchor hữu ích hơn");
});

test("renderDebtSection: vượt ngưỡng thì có dòng nói rõ đã bỏ bao nhiêu", () => {
  const rows = Array.from({ length: 12 }, (_, i) => fakeRow(i));
  const out = renderDebtSection("Nợ demo:", rows, 5);

  const shown = out.split("\n").filter((l) => /^\s*\d+\s+demo\/code-/.test(l));
  assert.equal(shown.length, 5, "chỉ in đúng `limit` dòng");
  assert.match(out, /đã bỏ bớt 7 mục \(in 5\/12\)/, "phải nói rõ đã bỏ bao nhiêu, không cắt im lặng");
});

test("renderDebtSection: không vượt ngưỡng thì không có dòng cắt bớt", () => {
  const rows = Array.from({ length: 3 }, (_, i) => fakeRow(i));
  const out = renderDebtSection("Nợ demo:", rows, 5);
  assert.doesNotMatch(out, /đã bỏ bớt/);
});

/* --- Nối vào `ganas commit` ------------------------------------------------- */

async function gitProject(files: Record<string, string>): Promise<string> {
  const root = await makeProject(files);
  await runShell("git init -q", { cwd: root });
  await runShell('git config user.email "test@ganas.local"', { cwd: root });
  await runShell('git config user.name "ganas test"', { cwd: root });
  return root;
}

test("⭐ ganas commit vẫn trả 0 và vẫn tạo commit khi có nợ trong phạm vi task", async () => {
  const root = await gitProject(twoScopeFiles());
  try {
    const { result: code, out } = await captureStdout(() =>
      ganasCommit({ positional: ["T-001"], options: { root }, flags: {}, passthrough: [] }),
    );

    assert.equal(code, 0, "nợ là thông tin, không phải cổng — commit vẫn phải trả 0");
    assert.match(out, /✓ Đã commit cho T-001/);
    assert.match(out, /Nợ trong phạm vi P-thu/, "báo cáo nợ phải nối vào output của commit");

    const log = await runShell("git log --oneline", { cwd: root });
    assert.equal(log.stdout.trim().split("\n").length, 1, "phải có đúng một commit thật");
  } finally {
    await cleanup(root);
  }
});

test(
  "⭐ commitDebtSummary: lỗi khi dựng bảng nợ KHÔNG ném ra ngoài — " +
    "không được phép làm hỏng ganas commit sau khi git đã ghi xong",
  () => {
    // `SCORES` trong src/debt.ts được `test/debt.test.ts` khoá chặt (mọi mã tĩnh
    // grep được từ validate.ts/load.ts đều phải có điểm), nên không dựng được
    // MỘT graph hợp lệ tạo ra mã lạ để `scoreOf` ném lỗi qua đường load thật —
    // dựng cơ chế để giả mạo điều đó chỉ để test là quá phức tạp so với việc cần
    // chứng minh (đã cân nhắc và bỏ). Thay vào đó test thẳng đúng cái hợp đồng
    // `commitDebtSummary` phải giữ: BẤT KỲ lỗi nào ném ra trong lúc dựng bảng
    // (ở đây: graph hỏng khiến `validateGraph` ném ngay dòng đầu, khi spread
    // `graph.loadDiagnostics` vốn `undefined`) đều bị bắt và đổi thành một dòng
    // cảnh báo, không bao giờ thoát ra ngoài hàm.
    const broken = {} as unknown as Graph;
    const out = commitDebtSummary(broken, "P-thu");
    assert.match(out, /không dựng được bảng nợ/);
    assert.match(out, /ganas debt/);
  },
);
