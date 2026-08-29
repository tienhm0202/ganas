import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type Diagnostic,
  knowledgeWriteBody,
  ruleForDiagnostics,
} from "../src/hooks/policy/index.js";

/**
 * Test nối dây luật `task_link` — T-066.
 *
 * `task_link` là một enforcement rule được khai nhưng không có code nào gọi.
 * Test này kiểm tra rằng:
 * 1. `ruleForDiagnostics` trả `"task_link"` cho diagnostic có mã liên kết task
 * 2. Luật nặng hơn vẫn thắng: `knowledge_anchor` ưu tiên trước `task_link`
 * 3. Schema error vẫn trả `"schema"`
 */

function diag(
  code: string,
  message: string = "error message",
): Diagnostic {
  return {
    severity: "error",
    code,
    message,
    file: "test.yaml",
  };
}

/* --- Luật task_link: diagnostic mã liên kết task ---------------------- */

test('ruleForDiagnostics trả "task_link" cho diagnostic spine/task-missing-goal', () => {
  assert.equal(ruleForDiagnostics([diag("spine/task-missing-goal")]), "task_link");
});

test('ruleForDiagnostics trả "task_link" cho diagnostic spine/task-missing-design', () => {
  assert.equal(ruleForDiagnostics([diag("spine/task-missing-design")]), "task_link");
});

test('ruleForDiagnostics trả "task_link" cho diagnostic spine/task-goal-not-in-design', () => {
  assert.equal(ruleForDiagnostics([diag("spine/task-goal-not-in-design")]), "task_link");
});

test('ruleForDiagnostics trả "task_link" cho diagnostic scope/task-scope-not-found', () => {
  assert.equal(ruleForDiagnostics([diag("scope/task-scope-not-found")]), "task_link");
});

test('ruleForDiagnostics trả "task_link" cho diagnostic scope/task-touches-outside-scope', () => {
  assert.equal(ruleForDiagnostics([diag("scope/task-touches-outside-scope")]), "task_link");
});

/* --- Luật nặng hơn thắng: knowledge_anchor ưu tiên trước task_link ---- */

test('ruleForDiagnostics trả "knowledge_anchor" khi vừa có lỗi anchor vừa có lỗi task_link', () => {
  assert.equal(
    ruleForDiagnostics([
      diag("spine/task-missing-design", "task vừa ghi"),
      diag("anchors.0", "anchors: cần bằng chứng"),
    ]),
    "knowledge_anchor",
  );
});

test('ruleForDiagnostics trả "knowledge_anchor" nếu chỉ có lỗi anchor, không quan tâm task_link', () => {
  assert.equal(
    ruleForDiagnostics([diag("anchors", "anchors: phải có bằng chứng")]),
    "knowledge_anchor",
  );
});

/* --- Schema error vẫn là schema ----------------------------------------- */

test('ruleForDiagnostics trả "schema" cho lỗi schema thường', () => {
  assert.equal(ruleForDiagnostics([diag("schema", "sai schema")]), "schema");
});

test('ruleForDiagnostics trả "schema" cho lỗi không phải anchor hay task_link', () => {
  assert.equal(ruleForDiagnostics([diag("validate/unknown")]), "schema");
});

/**
 * Nối dây một luật mà không đổi lời khuyên đi kèm là nối nửa vời: người đang
 * khai `implements: D-999` không tồn tại sẽ bị chặn kèm câu "sửa lại cho đúng
 * schema", trong khi schema của họ vốn đúng. Chuỗi này đi thẳng vào `reason`
 * của hook nên nó quyết định model có tự sửa được không.
 */
test("knowledgeWriteBody nói đúng đường sửa cho từng luật, không dồn về schema", () => {
  const d: Diagnostic = {
    severity: "error",
    code: "spine/task-missing-design",
    message: "task T-001 hiện thực design D-999 không tồn tại",
    file: ".ganas/tasks/T-001.yaml",
  };

  const forTaskLink = knowledgeWriteBody(".ganas/tasks/T-001.yaml", [d], "task_link", "");
  assert.match(forTaskLink, /implements/);
  assert.match(forTaskLink, /scope\.modules/);
  assert.doesNotMatch(forTaskLink, /đúng schema/);

  const forSchema = knowledgeWriteBody(".ganas/tasks/T-001.yaml", [d], "schema", "");
  assert.match(forSchema, /đúng schema/);

  const forAnchor = knowledgeWriteBody(".ganas/claims/C-001.yaml", [d], "knowledge_anchor", "");
  assert.match(forAnchor, /anchor/);
  assert.doesNotMatch(forAnchor, /đúng schema/);
});
