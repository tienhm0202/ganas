import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { computeFreshness } from "../src/graph/freshness.js";
import { loadGraph } from "../src/graph/load.js";
import { runShell } from "../src/util/exec.js";
import { commitStatus } from "../src/verify/ledger.js";
import { factTarget, runTarget } from "../src/verify/run.js";
import { cleanup, goal, makeProject } from "./helpers.js";

/**
 * T-081: trường `git` của sổ cái (`src/verify/ledger.ts:292`) nối dây vào độ
 * tươi — một bằng chứng chứng tại commit đã rời lịch sử của HEAD thì hết hiệu
 * lực. BA trạng thái, không phải hai (xem docstring `CommitStatus` ở
 * `verify/ledger.ts`):
 *
 *   1. "ancestor"  — commit nằm trong lịch sử HEAD  → bằng chứng còn hiệu lực
 *   2. "rewritten" — repo BIẾT commit, không phải tổ tiên → hết hiệu lực
 *   3. "unknown"   — repo KHÔNG BIẾT commit → IM LẶNG bỏ qua (fail open)
 *
 * Mọi test dựng repo git THẬT trong thư mục tạm — không chấm trên chính repo
 * ganas, vì kết quả sẽ đổi theo lịch sử của máy chạy (không tất định).
 */

const RUN = (root: string) => ({ root, by: "test", skipMutation: true });

async function gitProject(files: Record<string, string>): Promise<string> {
  const root = await makeProject(files);
  await runShell("git init -q", { cwd: root });
  await runShell('git config user.email "test@ganas.local"', { cwd: root });
  await runShell('git config user.name "ganas test"', { cwd: root });
  await runShell("git config commit.gpgsign false", { cwd: root });
  return root;
}

async function commitAll(root: string, message: string): Promise<void> {
  await runShell("git add -A", { cwd: root });
  const r = await runShell(`git commit -q -m "${message}" --allow-empty`, { cwd: root });
  assert.equal(r.code, 0, `commit "${message}" phải thành công: ${r.stderr}`);
}

async function headSha(root: string): Promise<string> {
  const r = await runShell("git rev-parse HEAD", { cwd: root });
  assert.equal(r.code, 0, r.stderr);
  return r.stdout.trim();
}

async function factProject(): Promise<string> {
  const root = await gitProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/facts/a.yaml": `- id: F-A-001
  scope: P-thu
  statement: "file src/a.ts tồn tại"
  verify:
    run: "test -f src/a.ts"
  depends_on: ["src/**"]
`,
  });
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "a.ts"), "export const X = 1;\n", "utf8");
  return root;
}

async function verifyFact(root: string): Promise<void> {
  const graph = await loadGraph(root);
  const outcome = await runTarget(factTarget(graph.facts.get("F-A-001")!), RUN(root));
  assert.equal(outcome.result, "pass", JSON.stringify(outcome));
}

async function stateOf(root: string): Promise<{ freshness: string; reason: string }> {
  const graph = await loadGraph(root);
  const s = (await computeFreshness(graph)).get("F-A-001")!;
  return { freshness: s.freshness, reason: s.reason };
}

/** Sửa trường `git` của dòng CUỐI sổ cái — mô phỏng một entry chứng tại sha bất kỳ. */
async function patchLastLedgerGit(root: string, sha: string | undefined): Promise<void> {
  const file = join(root, ".ganas", "verify-ledger.jsonl");
  const lines = (await readFile(file, "utf8")).split("\n").filter((l) => l.trim() !== "");
  const last = JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>;
  if (sha === undefined) delete last["git"];
  else last["git"] = sha;
  lines[lines.length - 1] = JSON.stringify(last);
  await writeFile(file, lines.join("\n") + "\n", "utf8");
}

/* ------------------------------------------------------------------------- *
 * `commitStatus()` trực tiếp — ba trạng thái, ở đúng cấp io/M-verify.
 * ------------------------------------------------------------------------- */

test("⭐ commitStatus: HEAD là tổ tiên của chính nó → ancestor", async () => {
  const root = await gitProject({});
  try {
    await commitAll(root, "base");
    const sha = await headSha(root);
    assert.equal(await commitStatus(root, sha), "ancestor");
  } finally {
    await cleanup(root);
  }
});

test("⭐ commitStatus: sha có thật nhưng bị bỏ lại sau reset/rẽ nhánh → rewritten", async () => {
  const root = await gitProject({});
  try {
    await commitAll(root, "genesis");
    const genesis = await headSha(root);

    await writeFile(join(root, "marker-a.txt"), "a\n", "utf8");
    await commitAll(root, "nhanh A");
    const shaA = await headSha(root);

    // Quay lại genesis rồi rẽ nhánh khác — A vẫn còn TỒN TẠI (object chưa gc)
    // nhưng không còn nằm trong lịch sử của HEAD mới.
    await runShell(`git reset --hard ${genesis}`, { cwd: root });
    await writeFile(join(root, "marker-b.txt"), "b\n", "utf8");
    await commitAll(root, "nhanh B");

    assert.equal(await commitStatus(root, shaA), "rewritten");
  } finally {
    await cleanup(root);
  }
});

test("⭐ commitStatus: sha đúng hình dạng nhưng repo chưa từng biết → unknown (fail open)", async () => {
  const root = await gitProject({});
  try {
    await commitAll(root, "base");
    // Đủ hình dạng hex hợp lệ, gần như chắc chắn không khớp object nào trong
    // một repo vài commit vừa dựng.
    assert.equal(await commitStatus(root, "deadbeef01"), "unknown");
  } finally {
    await cleanup(root);
  }
});

test("commitStatus: sha sai hình dạng (không phải hex) → unknown, không chạm shell", async () => {
  const root = await gitProject({});
  try {
    await commitAll(root, "base");
    assert.equal(await commitStatus(root, "khong-phai-sha"), "unknown");
  } finally {
    await cleanup(root);
  }
});

/* ------------------------------------------------------------------------- *
 * Nối dây thật: `computeFreshness` phải phản ứng đúng với cả ba ca.
 * ------------------------------------------------------------------------- */

test("⭐ nối dây — ca 1: verify tại HEAD hiện tại → vẫn fresh (ancestor không hạ bậc)", async () => {
  const root = await factProject();
  try {
    await commitAll(root, "base");
    await verifyFact(root);

    const s = await stateOf(root);
    assert.equal(s.freshness, "fresh");
    assert.doesNotMatch(s.reason, /lịch sử của HEAD/);
  } finally {
    await cleanup(root);
  }
});

test("⭐ nối dây — ca 2: commit rewritten (rebase/amend/đổi nhánh) → stale, lý do nêu rõ commit", async () => {
  const root = await factProject();
  try {
    await commitAll(root, "genesis"); // .ganas/facts + src/a.ts nằm trong genesis, chung cho mọi nhánh
    const genesis = await headSha(root);

    await writeFile(join(root, "marker-a.txt"), "a\n", "utf8");
    await commitAll(root, "nhanh A"); // HEAD = A, con của genesis

    await verifyFact(root); // entry.git = A (HEAD lúc verify)
    assert.equal((await stateOf(root)).freshness, "fresh", "phải fresh ngay sau khi verify tại A");

    // Bỏ lại A: quay về genesis rồi rẽ nhánh khác — A vẫn tồn tại (chưa gc)
    // nhưng không còn là tổ tiên của HEAD mới.
    await runShell(`git reset --hard ${genesis}`, { cwd: root });
    await writeFile(join(root, "marker-b.txt"), "b\n", "utf8");
    await commitAll(root, "nhanh B"); // HEAD = B, sibling của A

    const s = await stateOf(root);
    assert.equal(s.freshness, "stale", JSON.stringify(s));
    assert.match(s.reason, /không còn nằm trong lịch sử của HEAD/);
    assert.match(s.reason, /rebase\/amend\/đổi nhánh/);
  } finally {
    await cleanup(root);
  }
});

test("⭐ nối dây — ca 3: sha ledger repo không biết (clone nông/gc) → IM LẶNG bỏ qua, vẫn fresh", async () => {
  const root = await factProject();
  try {
    await commitAll(root, "base");
    await verifyFact(root);
    assert.equal((await stateOf(root)).freshness, "fresh");

    // Giả lập một sổ cái ghi sha mà repo hiện tại chưa từng nghe tới — clone
    // nông, đã gc, hoặc chưa fetch nhánh chứa commit đó.
    await patchLastLedgerGit(root, "deadbeef01");

    const s = await stateOf(root);
    assert.equal(
      s.freshness,
      "fresh",
      "ca 3 phải fail open — gộp vào rewritten thì mọi clone nông đỏ rực",
    );
  } finally {
    await cleanup(root);
  }
});

test("nối dây — entry không có trường `git` (bản ghi cũ) → không bị commit-check chạm tới", async () => {
  const root = await factProject();
  try {
    await commitAll(root, "base");
    await verifyFact(root);

    await patchLastLedgerGit(root, undefined);

    const s = await stateOf(root);
    assert.equal(s.freshness, "fresh");
  } finally {
    await cleanup(root);
  }
});
