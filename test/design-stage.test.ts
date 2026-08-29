import assert from "node:assert/strict";
import { test } from "node:test";

import { zDesign, zTask } from "../src/model/index.js";
import { check, goal, moduleYaml, scope } from "./helpers.js";

/* ------------------------------------------------------------------------- *
 * Chặng DỮ LIỆU: design có hợp đồng ra và trạng thái đóng được
 *
 * Ca gốc là T-039 (xem `.ganas/tasks/T-048.yaml`): design còn dở, nợ tiếp nối
 * chỉ sống trong `notes` văn xuôi, task cuối chưa bao giờ được tạo — và
 * `ganas validate` vẫn sạch suốt nhiều tuần.
 * ------------------------------------------------------------------------- */

const BASE = {
  ".ganas/goals/G-001.yaml": goal(),
  ".ganas/scopes/P-thu.yaml": scope(),
  ".ganas/modules/M-a.yaml": moduleYaml(),
};

function designYaml(extra = ""): string {
  return `id: D-001
title: "Design thử"
serves:
  - G-001
summary: "Cách tiếp cận"
status: active
${extra}`;
}

function taskYaml(id: string, status: string, extra = ""): string {
  return `id: ${id}
title: "Task thử"
serves:
  - G-001
implements: D-001
scope: P-thu
status: ${status}
exit_contract:
  - kind: command
    run: "true"
${extra}`;
}

const DONE = `done_at: 2026-01-02T00:00:00Z`;

/* --- Luật spine/design-stalled ------------------------------------------- */

test("design active mà mọi task của nó đã done → spine/design-stalled", async () => {
  const { diagnostics } = await check({
    ...BASE,
    ".ganas/designs/D-001.yaml": designYaml(),
    ".ganas/tasks/T-001.yaml": taskYaml("T-001", "done", DONE),
    ".ganas/tasks/T-002.yaml": taskYaml("T-002", "done", DONE),
  });
  const err = diagnostics.find((d) => d.code === "spine/design-stalled");
  assert.ok(err, `phải bắt chặng bỏ dở: ${JSON.stringify(diagnostics, null, 2)}`);
  assert.equal(err.severity, "error");
  assert.equal(err.file, ".ganas/designs/D-001.yaml");
  assert.equal(typeof err.line, "number", "diagnostic phải có số dòng để sửa được ngay");
  assert.ok(err.hint, "mọi diagnostic phải kèm hint (CONTRIBUTING mục 4)");
});

test("design active chưa có task nào là chặng CHƯA BẮT ĐẦU, không phải bỏ dở", async () => {
  // Không chỉ là chuyện ngữ nghĩa: `fix-graph` (src/flow.ts) đứng TRƯỚC chặng
  // `task` và chỉ qua khi graph không còn lỗi nào. Bắt design 0 task là lỗi thì
  // repo trống quẩn vĩnh viễn ở `design → fix-graph`, vì thuốc chữa nằm ở chặng
  // sau. Xem test/flow.test.ts.
  const { codes, diagnostics } = await check({
    ...BASE,
    ".ganas/designs/D-001.yaml": designYaml(),
  });
  assert.ok(
    !codes.includes("spine/design-stalled"),
    `chặng chưa có bước nào thì chưa bắt đầu: ${JSON.stringify(diagnostics, null, 2)}`,
  );
});

test("một task duy nhất và nó đã done → vẫn là chặng bỏ dở", async () => {
  const { codes } = await check({
    ...BASE,
    ".ganas/designs/D-001.yaml": designYaml(),
    ".ganas/tasks/T-001.yaml": taskYaml("T-001", "done", DONE),
  });
  assert.ok(codes.includes("spine/design-stalled"), "ca T-039: bước xong hết mà chặng chưa đóng");
});

test("còn một task chưa done thì design không bị coi là bỏ dở", async () => {
  const { codes } = await check({
    ...BASE,
    ".ganas/designs/D-001.yaml": designYaml(),
    ".ganas/tasks/T-001.yaml": taskYaml("T-001", "done", DONE),
    ".ganas/tasks/T-002.yaml": taskYaml("T-002", "todo"),
  });
  assert.ok(!codes.includes("spine/design-stalled"));
});

test("design đã đóng (status: done) không bị coi là bỏ dở", async () => {
  const { codes, diagnostics } = await check({
    ...BASE,
    ".ganas/designs/D-001.yaml": `id: D-001
title: "Design thử"
serves:
  - G-001
summary: "Cách tiếp cận"
status: done
${DONE}
exit_contract:
  - kind: command
    run: "true"
    expect: exit_zero`,
    ".ganas/tasks/T-001.yaml": taskYaml("T-001", "done", DONE),
  });
  assert.ok(
    !codes.includes("spine/design-stalled"),
    `không mong đợi design-stalled: ${JSON.stringify(diagnostics, null, 2)}`,
  );
});

/* --- Luật spine/design-missing-exit-contract ----------------------------- */

test("design active mà exit_contract rỗng → warning, KHÔNG phải error", async () => {
  const { diagnostics } = await check({
    ...BASE,
    ".ganas/designs/D-001.yaml": designYaml(),
    ".ganas/tasks/T-001.yaml": taskYaml("T-001", "todo"),
  });
  const warn = diagnostics.find((d) => d.code === "spine/design-missing-exit-contract");
  assert.ok(warn, `phải cảnh báo design thiếu hợp đồng ra: ${JSON.stringify(diagnostics)}`);
  assert.equal(warn.severity, "warning", "warning để 7 design cũ adopt được, không hồi tố");
  assert.ok(warn.hint);
});

test("design đã khai exit_contract thì không còn cảnh báo", async () => {
  const { codes } = await check({
    ...BASE,
    ".ganas/designs/D-001.yaml": designYaml(`exit_contract:
  - kind: manual
    check: "người ký nghiệm thu chặng"`),
    ".ganas/tasks/T-001.yaml": taskYaml("T-001", "todo"),
  });
  assert.ok(!codes.includes("spine/design-missing-exit-contract"));
});

/* --- Schema zDesign ------------------------------------------------------ */

const design = {
  id: "D-001",
  title: "Design thử",
  serves: ["G-001"],
  summary: "Cách tiếp cận",
};

test("exit_contract của design dùng CHUNG zExitCriterion của task", () => {
  const parsed = zDesign.parse({
    ...design,
    exit_contract: [
      { kind: "command", run: "npm test", expect: "exit_zero" },
      { kind: "verification", target: "M-a/V-thu-smoke" },
      { kind: "handoff" },
    ],
  });
  assert.equal(parsed.exit_contract.length, 3);
  assert.equal(zDesign.safeParse({ ...design, exit_contract: [{ kind: "bịa" }] }).success, false);
});

test("exit_contract mặc định rỗng — design cũ vẫn parse được", () => {
  assert.deepEqual(zDesign.parse(design).exit_contract, []);
});

test("design status: done bắt buộc kèm done_at", () => {
  assert.equal(zDesign.safeParse({ ...design, status: "done" }).success, false);
  assert.equal(
    zDesign.safeParse({ ...design, status: "done", done_at: "2026-01-02T00:00:00Z" }).success,
    true,
  );
});

test("trường lạ trong design bị từ chối — .strict()", () => {
  assert.equal(zDesign.safeParse({ ...design, exit_contrct: [] }).success, false);
});

/* --- TASK_STATUS: `blocked` đã gỡ ---------------------------------------- */

test("status: blocked bị từ chối — trạng thái chặn suy từ blocked_by, không khai tay", () => {
  const task = {
    id: "T-001",
    title: "Task thử",
    serves: ["G-001"],
    implements: "D-001",
    scope: "P-thu",
    exit_contract: [{ kind: "command", run: "true", expect: "exit_zero" }],
  };
  assert.equal(zTask.safeParse(task).success, true);
  assert.equal(zTask.safeParse({ ...task, status: "blocked" }).success, false);
});
