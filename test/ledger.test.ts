import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { loadGraph } from "../src/graph/load.js";
import { validateGraph } from "../src/graph/validate.js";
import * as handlers from "../src/hooks/handlers.js";
import {
  appendEntry,
  defHash,
  definitionHash,
  entryAt,
  historyFor,
  indexByTarget,
  lastFor,
  type LedgerEntry,
  ledgerPath,
  readLedger,
} from "../src/verify/ledger.js";
import { cleanup, goal, makeProject } from "./helpers.js";

const PROBE = { run: "test -f src/a.ts", expect: "exit_zero" as const };
const STATEMENT = "file a.ts tồn tại";
const VERIFIED_AT = "2025-06-01T00:00:00.000Z";

function factYaml(over: { at?: string; result?: string } = {}): string {
  return `- id: F-A-001
  scope: P-thu
  statement: "${STATEMENT}"
  verify:
    run: "test -f src/a.ts"
  last_verified_at: ${over.at ?? VERIFIED_AT}
  last_result: ${over.result ?? "pass"}
`;
}

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    target: "F-A-001",
    kind: "probe",
    at: VERIFIED_AT,
    def: defHash(PROBE, STATEMENT),
    result: "pass",
    by: "session:test",
    ...over,
  };
}

async function projectWithFact(
  ledgerEntries: LedgerEntry[],
  factOver: { at?: string; result?: string } = {},
): Promise<string> {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/facts/a.yaml": factYaml(factOver),
  });
  for (const e of ledgerEntries) await appendEntry(root, e);
  return root;
}

async function codesOf(root: string): Promise<string[]> {
  const graph = await loadGraph(root);
  return validateGraph(graph).map((d) => d.code);
}

/* --- BÀI KIỂM QUAN TRỌNG NHẤT CỦA P2 -------------------------------------- */

test("⭐ sửa tay last_verified_at mà sổ cái không có bản ghi → BỊ BẮT", async () => {
  // Ngày quá khứ hoàn toàn hợp lệ — luật chặn-ngày-tương-lai của P1 không đỡ được.
  const root = await projectWithFact([]);
  try {
    const graph = await loadGraph(root);
    const diags = validateGraph(graph);
    const err = diags.find((d) => d.code === "knowledge/unbacked-verification");
    assert.ok(err, `lần verify đó không xảy ra thì phải bị bắt: ${JSON.stringify(diags, null, 2)}`);
    assert.equal(err.severity, "error");
    assert.match(err.hint!, /ganas verify/, "phải nói rõ cách làm đúng");
  } finally {
    await cleanup(root);
  }
});

test("có bản ghi sổ cái khớp thời điểm → hợp lệ", async () => {
  const root = await projectWithFact([entry()]);
  try {
    const codes = await codesOf(root);
    assert.ok(!codes.includes("knowledge/unbacked-verification"));
  } finally {
    await cleanup(root);
  }
});

test("copy thời điểm của một bản ghi KHÁC target → vẫn bị bắt", async () => {
  const root = await projectWithFact([entry({ target: "F-B-002" })]);
  try {
    const codes = await codesOf(root);
    assert.ok(
      codes.includes("knowledge/unbacked-verification"),
      "sổ cái phải khớp cả target lẫn thời điểm, không chỉ thời điểm",
    );
  } finally {
    await cleanup(root);
  }
});

test("sổ cái ghi fail mà fact khai pass → bị bắt", async () => {
  const root = await projectWithFact([entry({ result: "fail" })], { result: "pass" });
  try {
    const codes = await codesOf(root);
    assert.ok(
      codes.includes("knowledge/result-mismatch"),
      "không thể mượn bản ghi fail để tuyên bố pass",
    );
  } finally {
    await cleanup(root);
  }
});

test("xoá dòng sổ cái → fact quay lại trạng thái unbacked", async () => {
  const root = await projectWithFact([entry()]);
  try {
    assert.ok(!(await codesOf(root)).includes("knowledge/unbacked-verification"));
    await writeFile(ledgerPath(root), "", "utf8");
    assert.ok((await codesOf(root)).includes("knowledge/unbacked-verification"));
  } finally {
    await cleanup(root);
  }
});

test("fact chưa từng verify thì không đòi sổ cái", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/facts/a.yaml": `- id: F-A-001
  scope: P-thu
  statement: "s"
  verify:
    run: "test -f src/a.ts"
`,
  });
  try {
    const codes = await codesOf(root);
    assert.ok(!codes.includes("knowledge/unbacked-verification"));
    assert.ok(codes.includes("knowledge/fact-never-verified"), "vẫn cảnh báo là chưa kiểm");
  } finally {
    await cleanup(root);
  }
});

/* --- Hook PreToolUse giữ sổ cái -------------------------------------------- */

async function emptyProject(): Promise<string> {
  return makeProject({ ".ganas/goals/G-001.yaml": goal() });
}

test("Claude ghi thẳng vào sổ cái bằng Write → DENY trước khi ghi", async () => {
  const root = await emptyProject();
  try {
    const out = await handlers.preToolUse({
      cwd: root,
      tool_name: "Write",
      tool_input: { file_path: ledgerPath(root) },
    });
    const h = out.hookSpecificOutput as Record<string, string>;
    assert.equal(h["permissionDecision"], "deny");
    assert.match(h["permissionDecisionReason"]!, /ganas verify/);
  } finally {
    await cleanup(root);
  }
});

test("đường dẫn tương đối tới sổ cái cũng bị chặn", async () => {
  const root = await emptyProject();
  try {
    const out = await handlers.preToolUse({
      cwd: root,
      tool_name: "Edit",
      tool_input: { file_path: ".ganas/verify-ledger.jsonl" },
    });
    assert.equal((out.hookSpecificOutput as Record<string, string>)["permissionDecision"], "deny");
  } finally {
    await cleanup(root);
  }
});

test("Bash KHÔNG còn bị chặn theo tên file — lớp đó đã bỏ", async () => {
  const root = await emptyProject();
  try {
    // Lớp cũ khớp `command.includes("verify-ledger.jsonl")` trên chuỗi lệnh thô.
    // Nó sai cả hai chiều: chặn nhầm lệnh chỉ đọc có kèm dấu chuyển hướng, mà
    // không cản được ai chỉ cần không gõ tên file (`git add .ganas`, hoặc nối
    // chuỗi trong script). Lớp cưỡng chế thật là hash-chain của chính sổ cái.
    const out = await handlers.preToolUse({
      cwd: root,
      tool_name: "Bash",
      tool_input: { command: 'echo "{}" >> .ganas/verify-ledger.jsonl' },
    });
    assert.equal(out.hookSpecificOutput, undefined, "không còn quyết định deny nào ở nhánh Bash");
  } finally {
    await cleanup(root);
  }
});

test("Bash chỉ ĐỌC sổ cái thì cho qua", async () => {
  const root = await emptyProject();
  try {
    const out = await handlers.preToolUse({
      cwd: root,
      tool_name: "Bash",
      tool_input: { command: "cat .ganas/verify-ledger.jsonl | head" },
    });
    assert.deepEqual(out, {}, "đọc sổ cái là hợp lệ và cần thiết");
  } finally {
    await cleanup(root);
  }
});

test("ghi vào file .ganas khác thì PreToolUse không đụng vào", async () => {
  const root = await emptyProject();
  try {
    const out = await handlers.preToolUse({
      cwd: root,
      tool_name: "Write",
      tool_input: { file_path: ".ganas/facts/a.yaml" },
    });
    assert.deepEqual(out, {}, "PostToolUse mới là chỗ gác nội dung tri thức");
  } finally {
    await cleanup(root);
  }
});

/* --- Hook PreToolUse chặn sub-agent sửa skill (N11) ------------------------ */

test("sub-agent ghi vào .claude/skills/ bằng Write → DENY", async () => {
  const root = await emptyProject();
  try {
    const out = await handlers.preToolUse({
      cwd: root,
      tool_name: "Write",
      tool_input: { file_path: ".claude/skills/foo/SKILL.md" },
      agent_id: "sub-1",
    });
    const h = out.hookSpecificOutput as Record<string, string>;
    assert.equal(h["permissionDecision"], "deny");
    assert.match(h["permissionDecisionReason"]!, /sub-agent/i);
    assert.match(h["permissionDecisionReason"]!, /skill/i);
  } finally {
    await cleanup(root);
  }
});

test("main session (không có agent_id) ghi vào .claude/skills/ thì cho qua", async () => {
  const root = await emptyProject();
  try {
    const out = await handlers.preToolUse({
      cwd: root,
      tool_name: "Write",
      tool_input: { file_path: ".claude/skills/foo/SKILL.md" },
    });
    assert.deepEqual(out, {}, "chỉ sub-agent bị chặn, phiên chính vẫn sửa skill được");
  } finally {
    await cleanup(root);
  }
});

test("sub-agent ghi file NGOÀI .claude/skills/ thì không bị chặn", async () => {
  const root = await emptyProject();
  try {
    const out = await handlers.preToolUse({
      cwd: root,
      tool_name: "Write",
      tool_input: { file_path: "src/foo.ts" },
      agent_id: "sub-1",
    });
    assert.deepEqual(out, {}, "guard chỉ chặn skill, không chặn mọi ghi của sub-agent");
  } finally {
    await cleanup(root);
  }
});

test("sub-agent sửa skill bằng Edit (không chỉ Write) cũng bị chặn", async () => {
  const root = await emptyProject();
  try {
    const out = await handlers.preToolUse({
      cwd: root,
      tool_name: "Edit",
      tool_input: { file_path: ".claude/skills/foo/SKILL.md" },
      agent_id: "sub-1",
    });
    assert.equal(
      (out.hookSpecificOutput as Record<string, string>)["permissionDecision"],
      "deny",
      "guard phải bao trùm mọi tool trong WRITE_TOOLS, không riêng Write",
    );
  } finally {
    await cleanup(root);
  }
});

/* --- Vân tay định nghĩa ---------------------------------------------------- */

test("definitionHash ổn định với thứ tự field khác nhau", () => {
  const a = definitionHash({ run: "x", expect: "exit_zero", ttl_days: 3 });
  const b = definitionHash({ ttl_days: 3, expect: "exit_zero", run: "x" });
  assert.equal(a, b, "format lại YAML không được làm fact thành stale vô cớ");
});

test("definitionHash đổi khi nội dung probe đổi", () => {
  const a = definitionHash({ run: "test -f src/a.ts" });
  const b = definitionHash({ run: "true" });
  assert.notEqual(a, b, "thay ruột probe phải nhìn ra được");
});

test("definitionHash bỏ qua field undefined", () => {
  assert.equal(definitionHash({ run: "x" }), definitionHash({ run: "x", model: undefined }));
});

/* --- Đọc/ghi sổ cái -------------------------------------------------------- */

test("sổ cái là append-only, đọc lại đúng thứ tự", async () => {
  const root = await emptyProject();
  try {
    await appendEntry(root, entry({ at: "2025-01-01T00:00:00.000Z" }));
    await appendEntry(root, entry({ at: "2025-02-01T00:00:00.000Z", result: "fail" }));
    const index = indexByTarget(await readLedger(root));

    assert.equal(lastFor(index, "F-A-001")!.at, "2025-02-01T00:00:00.000Z");
    assert.equal(historyFor(index, "F-A-001").length, 2);
    assert.equal(entryAt(index, "F-A-001", "2025-01-01T00:00:00.000Z")!.result, "pass");
    assert.equal(entryAt(index, "F-A-001", "2099-01-01T00:00:00.000Z"), undefined);
  } finally {
    await cleanup(root);
  }
});

test("dòng hỏng trong sổ cái không làm sập việc đọc", async () => {
  const root = await emptyProject();
  try {
    await appendEntry(root, entry());
    const path = ledgerPath(root);
    await writeFile(path, (await readFile(path, "utf8")) + "{ hỏng\n", "utf8");
    await appendEntry(root, entry({ at: "2025-07-01T00:00:00.000Z" }));

    const all = await readLedger(root);
    assert.equal(all.length, 2, "bỏ qua dòng hỏng, giữ dòng hợp lệ — sổ cái là file cộng dồn");
  } finally {
    await cleanup(root);
  }
});

test("sổ cái nằm trong .ganas/ và KHÔNG bị gitignore", async () => {
  const root = await emptyProject();
  try {
    assert.ok(ledgerPath(root).endsWith(join(".ganas", "verify-ledger.jsonl")));
    const { gitignoreAddition } = await import("../src/templates/project.js");
    assert.ok(
      !gitignoreAddition().includes("verify-ledger"),
      "sổ cái phải commit được — cả team và CI đối chiếu chung",
    );
  } finally {
    await cleanup(root);
  }
});
