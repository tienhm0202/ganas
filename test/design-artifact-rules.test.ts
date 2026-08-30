import assert from "node:assert/strict";
import { test } from "node:test";

import { check, goal, moduleYaml, scope, task } from "./helpers.js";

function designWith(artifacts: string, status = "active"): string {
  return `id: D-001
title: "Design thử"
serves:
  - G-001
summary: "Cách tiếp cận"
status: ${status}
artifacts:
${artifacts}`;
}

/** Khối có một cổng ra `last_login` để bản vẽ neo vào. */
const MODULE_WITH_PORT = moduleYaml("M-a", {
  extra: `contract:
  outputs:
    - name: last_login
      shape: "(userId: string) => Date | null"
`,
});

const PROBE = `    probe:
      run: "grep -q lastLogin src/a/x.ts"
      expect: exit_zero`;

async function codesFor(designYaml: string, extra: Record<string, string> = {}) {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designYaml,
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": MODULE_WITH_PORT,
    ...extra,
  });
  return codes;
}

/* --- Bản vẽ hợp lệ không được đẻ ra cảnh báo nào ------------------------- */

test("bản vẽ đầy đủ, neo đúng cổng ⇒ sạch", async () => {
  const codes = await codesFor(
    designWith(`  - id: A-last-login
    kind: function
    module: M-a
    shape: "(userId: string) => Date | null"
    port: { side: out, name: last_login }
${PROBE}`),
  );
  assert.deepEqual(
    codes.filter((c) => c.startsWith("spine/design-artifact")),
    [],
  );
});

/* --- Mỗi luật: một ca dương ---------------------------------------------- */

test("trỏ khối không tồn tại ⇒ error", async () => {
  const codes = await codesFor(
    designWith(`  - id: A-x
    kind: schema
    module: M-khong-co
    shape: "users(id uuid pk)"
${PROBE}`),
  );
  assert.ok(codes.includes("spine/design-artifact-missing-module"));
});

test("chặng active mà bản vẽ thiếu probe ⇒ warning", async () => {
  const codes = await codesFor(
    designWith(`  - id: A-x
    kind: schema
    module: M-a
    shape: "users(id uuid pk)"`),
  );
  assert.ok(codes.includes("spine/design-artifact-missing-probe"));
});

test("chặng KHÔNG active thì thiếu probe không ồn — 9 design cũ phải adopt được", async () => {
  const codes = await codesFor(
    designWith(
      `  - id: A-x
    kind: schema
    module: M-a
    shape: "users(id uuid pk)"`,
      "archived",
    ),
  );
  assert.ok(!codes.includes("spine/design-artifact-missing-probe"));
});

test("neo vào cổng khối không khai ⇒ error", async () => {
  const codes = await codesFor(
    designWith(`  - id: A-x
    kind: function
    module: M-a
    shape: "(userId: string) => Date | null"
    port: { side: out, name: khong_co_cong_nay }
${PROBE}`),
  );
  assert.ok(codes.includes("spine/design-artifact-port-not-found"));
});

test("shape lệch shape của cổng ⇒ error, không phải cảnh báo", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designWith(`  - id: A-x
    kind: function
    module: M-a
    shape: "(userId: string) => Date"
    port: { side: out, name: last_login }
${PROBE}`),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": MODULE_WITH_PORT,
  });
  const drift = diagnostics.find((d) => d.code === "spine/design-artifact-shape-drift");
  assert.ok(drift, "phải bắt được shape lệch");
  // Error chứ không warning: hai nguồn sự thật cho cùng một câu hỏi, và cổng CI
  // chỉ đóng khi có error.
  assert.equal(drift.severity, "error");
});

test("khoảng trắng đầu/cuối không tính là lệch", async () => {
  const codes = await codesFor(
    designWith(`  - id: A-x
    kind: function
    module: M-a
    shape: "  (userId: string) => Date | null  "
    port: { side: out, name: last_login }
${PROBE}`),
  );
  assert.ok(!codes.includes("spine/design-artifact-shape-drift"));
});

test("hai bản vẽ trùng id là lỗi PARSE, không phải cảnh báo đọc sau", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": designWith(`  - id: A-x
    kind: schema
    module: M-a
    shape: "a"
${PROBE}
  - id: A-x
    kind: schema
    module: M-a
    shape: "b"
${PROBE}`),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": MODULE_WITH_PORT,
  });
  // Trùng id ⇒ hai Target.id giống hệt ⇒ dòng sổ cái đè nhau, câm lặng.
  assert.ok(codes.some((c) => c.startsWith("schema/")));
});

/* --- Bản vẽ phủ nghĩa vụ verification của khối --------------------------- */

test("task trỏ bản vẽ của khối mình chạm thì KHÔNG bị đòi thêm tiêu chí nữa", async () => {
  const codes = await codesFor(
    designWith(`  - id: A-x
    kind: function
    module: M-a
    shape: "(userId: string) => Date | null"
${PROBE}`),
    {
      ".ganas/tasks/T-001.yaml": task("T-001", {
        extra: `touches:
  - M-a
`,
      }).replace(
        `exit_contract:
  - kind: command
    run: "true"`,
        `exit_contract:
  - kind: verification
    target: "D-001/A-x"`,
      ),
    },
  );
  assert.ok(!codes.includes("spine/task-missing-verification"));
});

test("target verification gõ sai bị bắt ngay lúc validate, không đợi tới gate", async () => {
  const codes = await codesFor(
    designWith(`  - id: A-x
    kind: function
    module: M-a
    shape: "(userId: string) => Date | null"
${PROBE}`),
    {
      ".ganas/tasks/T-001.yaml": task().replace(
        `exit_contract:
  - kind: command
    run: "true"`,
        `exit_contract:
  - kind: verification
    target: "D-001/A-go-sai"`,
      ),
    },
  );
  assert.ok(codes.includes("spine/exit-verification-target-not-found"));
});
