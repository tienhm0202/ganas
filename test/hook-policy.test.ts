import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyEnforcement,
  decideEntityOverwrite,
  decideProposalWrite,
  decideWriteEarly,
  inRepoTree,
  locate,
  ruleForDiagnostics,
  shellLooksLikeWrite,
  type WriteTarget,
} from "../src/hooks/policy/index.js";

/**
 * Phán quyết của hook, test THUẦN.
 *
 * Đây là cái được của việc chẻ khối (PR-004): trước đó, muốn kiểm một luật
 * chặn thì phải dựng cả một dự án giả trên đĩa rồi chạy handler end-to-end.
 * Giờ luật kiểm được bằng một object — không đĩa, không tiến trình con, không
 * thư mục tạm. Test end-to-end trong `test/hooks.test.ts` vẫn giữ nguyên vai
 * của nó: canh phần GOM dữ liệu và nối dây.
 */

const ROOT = "/repo";

function target(over: Partial<WriteTarget> = {}): WriteTarget {
  return {
    toolName: "Write",
    abs: "/repo/src/a.ts",
    rel: "src/a.ts",
    ledgerAbs: "/repo/.ganas/verify-ledger.jsonl",
    configAbs: "/repo/.ganas/config.yaml",
    fromSubagent: false,
    toolInput: undefined,
    ...over,
  };
}

/* --- Bốn luật chặn, và THỨ TỰ giữa chúng ---------------------------------- */

test("ghi vào sổ cái xác minh → chặn", () => {
  const step = decideWriteEarly(target({ abs: "/repo/.ganas/verify-ledger.jsonl" }));
  assert.equal(step.kind, "deny");
  assert.match(step.reason, /ganas verify/);
});

test("ghi vào config.yaml → chặn, và nói rõ mức cưỡng chế là việc của người", () => {
  const step = decideWriteEarly(target({ abs: "/repo/.ganas/config.yaml" }));
  assert.equal(step.kind, "deny");
  assert.match(step.reason, /quyết định của NGƯỜI/);
});

test("sub-agent ghi vào .claude/skills/ → chặn; phiên chính thì không", () => {
  const rel = ".claude/skills/x/SKILL.md";
  assert.equal(decideWriteEarly(target({ rel, fromSubagent: true })).kind, "deny");
  assert.equal(decideWriteEarly(target({ rel, fromSubagent: false })).kind, "allow");
});

test("sổ cái thắng trước cả khi đường dẫn cũng là file thực thể", () => {
  // Thứ tự luật là hợp đồng: đảo nó thì người dùng nhận thông điệp khác trong
  // ca chồng luật, mà không test end-to-end nào bắt được.
  const step = decideWriteEarly(
    target({ abs: "/repo/.ganas/verify-ledger.jsonl", rel: ".ganas/tasks/T-001.yaml" }),
  );
  assert.equal(step.kind, "deny");
  assert.match(step.reason, /sổ cái xác minh/);
});

/* --- Phép lười: policy HỎI dữ liệu thay vì bắt io gom sẵn ----------------- */

test("Write đè file thực thể → HỎI đĩa, không tự kết luận", () => {
  const step = decideWriteEarly(target({ rel: ".ganas/tasks/T-001.yaml" }));
  assert.deepEqual(step, { kind: "need", probe: "entity-exists" });
});

test("Edit file thực thể → không hỏi gì, cho qua ngay", () => {
  // `Edit` vốn đòi file phải tồn tại; chặn nó là chặn việc sửa hợp lệ.
  const step = decideWriteEarly(target({ toolName: "Edit", rel: ".ganas/tasks/T-001.yaml" }));
  assert.equal(step.kind, "allow");
});

test("file thực thể đã có → chặn; chưa có → cho qua", () => {
  assert.equal(decideEntityOverwrite(true).kind, "deny");
  assert.equal(decideEntityOverwrite(false).kind, "allow");
});

test("ghi proposal mà KHÔNG đặt quyết định → không nạp graph làm gì", () => {
  const step = decideWriteEarly(
    target({ rel: ".ganas/proposals/PR-001.yaml", toolInput: { content: "title: x\n" } }),
  );
  assert.equal(step.kind, "allow");
});

test("ghi proposal có đặt status: approved → HỎI mức cưỡng chế", () => {
  const step = decideWriteEarly(
    target({ rel: ".ganas/proposals/PR-001.yaml", toolInput: { content: "status: approved\n" } }),
  );
  assert.deepEqual(step, { kind: "need", probe: "proposal-mode" });
});

test("né luật bằng cách ghi decided_by ở một lượt Edit riêng vẫn bị bắt", () => {
  const step = decideWriteEarly(
    target({
      toolName: "Edit",
      rel: ".ganas/proposals/PR-001.yaml",
      toolInput: { new_string: 'decided_by: "@ai-do"' },
    }),
  );
  assert.deepEqual(step, { kind: "need", probe: "proposal-mode" });
});

test("MultiEdit: quét MỌI mẩu new_string, không chỉ mẩu đầu", () => {
  const step = decideWriteEarly(
    target({
      toolName: "MultiEdit",
      rel: ".ganas/proposals/PR-001.yaml",
      toolInput: { edits: [{ new_string: "title: x" }, { new_string: "status: rejected" }] },
    }),
  );
  assert.deepEqual(step, { kind: "need", probe: "proposal-mode" });
});

test("enforce thì chặn, warn thì chỉ nhắc — dự án cũ hạ được xuống", () => {
  assert.ok("hookSpecificOutput" in decideProposalWrite("enforce"));
  const warned = decideProposalWrite("warn");
  assert.match(warned.systemMessage ?? "", /chế độ warn/);
});

/* --- Phân loại lỗi và hình dạng đầu ra ------------------------------------ */

test("chỉ cần MỘT lỗi dạng anchor là cả lượt tính theo knowledge_anchor", () => {
  const d = (message: string) => ({ severity: "error" as const, code: "x", message, file: "f" });
  assert.equal(ruleForDiagnostics([d("sai schema")]), "schema");
  assert.equal(ruleForDiagnostics([d("sai schema"), d("anchors: phải có bằng chứng")]), "knowledge_anchor");
  assert.equal(ruleForDiagnostics([d("anchors.0: anchor không nhận dạng được")]), "knowledge_anchor");
});

test("applyEnforcement: enforce → block, warn → systemMessage", () => {
  assert.equal(applyEnforcement("enforce", "x").decision, "block");
  assert.equal(applyEnforcement("warn", "x").decision, undefined);
});

/* --- Phép tính đường dẫn (không chạm đĩa) --------------------------------- */

test("locate: đường dẫn tương đối quy về gốc repo, luôn dùng dấu /", () => {
  assert.deepEqual(locate("src/a.ts", "/repo", ROOT), { abs: "/repo/src/a.ts", rel: "src/a.ts" });
  assert.equal(locate("/repo/src/b.ts", "/somewhere", ROOT).rel, "src/b.ts");
});

test("inRepoTree: file ngoài cây repo không đối chiếu được với ranh giới task", () => {
  assert.equal(inRepoTree("src/a.ts"), true);
  assert.equal(inRepoTree("../ngoai.ts"), false);
  assert.equal(inRepoTree(""), false);
  assert.equal(inRepoTree(undefined), false);
});

test("shellLooksLikeWrite: bắt dấu hiệu ghi trong lệnh shell", () => {
  assert.equal(shellLooksLikeWrite("sed -i s/a/b/ x"), true);
  assert.equal(shellLooksLikeWrite("echo x > f"), true);
  assert.equal(shellLooksLikeWrite("grep foo bar"), false);
});
