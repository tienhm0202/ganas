import { test } from "node:test";
import assert from "node:assert/strict";
import { check, goal, sprint, design, task } from "./helpers.js";
import { zModule, zPart, zVerification } from "../src/model/index.js";

/* --- Bộ dựng YAML cho sơ đồ khối ------------------------------------------ */

function part(id = "P-chat", modules = ["M-a", "M-b"], entry = "M-a", exit = "M-b"): string {
  return `id: ${id}
title: "Phần thử"
version: 0.1.0
modules:
${modules.map((m) => `  - ${m}`).join("\n")}
entry: ${entry}
exit: ${exit}
`;
}

function moduleYaml(
  id = "M-a",
  opts: { part?: string; nature?: string; dependsOn?: string[]; verify?: string; status?: string } = {},
): string {
  return `id: ${id}
title: "Khối thử"
${opts.part === null ? "" : `part: ${opts.part ?? "P-chat"}\n`}nature: ${opts.nature ?? "code"}
paths: ["src/${id}/**"]
status: ${opts.status ?? "implemented"}
depends_on:
${(opts.dependsOn ?? []).map((d) => `  - ${d}`).join("\n") || "  []"}
${opts.verify ?? `verify:
  - id: V-${id}-probe
    kind: probe
    run: "test -f src/${id}/index.ts"`}
`;
}

/** Sơ đồ hợp lệ tối thiểu: P-chat gồm M-a → M-b. */
function validDiagram(): Record<string, string> {
  return {
    ".ganas/parts/P-chat.yaml": part(),
    ".ganas/modules/M-a.yaml": moduleYaml("M-a"),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", { dependsOn: ["M-a"] }),
  };
}

/* --- Sơ đồ hợp lệ ---------------------------------------------------------- */

test("sơ đồ khối hợp lệ không có lỗi", async () => {
  const { diagnostics } = await check(validDiagram());
  const errors = diagnostics.filter((d) => d.severity === "error");
  assert.deepEqual(errors, [], JSON.stringify(errors, null, 2));
});

/* --- Liên kết treo --------------------------------------------------------- */

test("khối trỏ phần không tồn tại → lỗi có file:line", async () => {
  const { diagnostics } = await check({
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", { part: "P-khong-co" }),
  });
  const err = diagnostics.find((d) => d.code === "spine/module-missing-part");
  assert.ok(err, JSON.stringify(diagnostics, null, 2));
  assert.equal(typeof err.line, "number", "phải chỉ được dòng để sửa ngay");
});

test("phần liệt kê khối không tồn tại → lỗi", async () => {
  const { codes } = await check({
    ".ganas/parts/P-chat.yaml": part("P-chat", ["M-a", "M-khong-co"], "M-a", "M-a"),
    ".ganas/modules/M-a.yaml": moduleYaml("M-a"),
  });
  assert.ok(codes.includes("spine/part-missing-module"));
});

test("khối khai thuộc phần nhưng phần không liệt kê nó → hai chiều lệch nhau", async () => {
  const { diagnostics } = await check({
    ".ganas/parts/P-chat.yaml": part("P-chat", ["M-a"], "M-a", "M-a"),
    ".ganas/modules/M-a.yaml": moduleYaml("M-a"),
    ".ganas/modules/M-lac.yaml": moduleYaml("M-lac", { part: "P-chat" }),
  });
  const err = diagnostics.find((d) => d.code === "spine/module-part-mismatch");
  assert.ok(err, "sơ đồ nói một đằng, khối nói một nẻo thì phải bắt được");
});

test("depends_on trỏ khối không tồn tại → lỗi", async () => {
  const { codes } = await check({
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", { part: null as never, dependsOn: ["M-ma"] }),
  });
  assert.ok(codes.includes("spine/module-missing-dependency"));
});

test("cạnh contract trỏ khối đích không tồn tại → lỗi", async () => {
  const { diagnostics } = await check({
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", {
      part: null as never,
      verify: `verify:
  - id: V-a-probe
    kind: probe
    run: "true"
  - id: V-a-to-ghost
    kind: contract
    to: M-ghost`,
    }),
  });
  const err = diagnostics.find((d) => d.code === "spine/contract-missing-target");
  assert.ok(err, JSON.stringify(diagnostics, null, 2));
  assert.equal(typeof err.line, "number");
});

test("task chạm khối không tồn tại → lỗi", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/sprints/S-2026-08.yaml": sprint(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task("T-001", { extra: "touches:\n  - M-khong-co" }),
  });
  assert.ok(codes.includes("spine/task-missing-module"));
});

/* --- Nợ kiểm chứng ở mức task ------------------------------------------- */

function taskTouching(moduleId: string, exitContract: string): string {
  return `id: T-001
title: "t"
serves:
  - G-001
implements: D-001
sprint: S-2026-08
status: todo
touches:
  - ${moduleId}
exit_contract:
${exitContract}
`;
}

test("task chạm khối mà exit_contract không có tiêu chí verification → lỗi", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/sprints/S-2026-08.yaml": sprint(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", { part: null as never }),
    ".ganas/tasks/T-001.yaml": taskTouching("M-a", `  - kind: command\n    run: "true"`),
  });
  const err = diagnostics.find((d) => d.code === "spine/task-missing-verification");
  assert.ok(err, JSON.stringify(diagnostics, null, 2));
  assert.match(err.hint!, /V-M-a-probe/, "hint phải gợi ý đúng target đã có sẵn của khối");
});

test("task chạm khối, exit_contract có verification đúng target → không lỗi", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/sprints/S-2026-08.yaml": sprint(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", { part: null as never }),
    ".ganas/tasks/T-001.yaml": taskTouching(
      "M-a",
      `  - kind: verification\n    target: M-a/V-M-a-probe`,
    ),
  });
  assert.ok(!codes.includes("spine/task-missing-verification"), JSON.stringify(codes));
});

test("task chạm khối, verification trỏ SAI khối khác → vẫn lỗi", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/sprints/S-2026-08.yaml": sprint(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", { part: null as never }),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", { part: null as never }),
    ".ganas/tasks/T-001.yaml": taskTouching(
      "M-a",
      `  - kind: verification\n    target: M-b/V-M-b-probe`,
    ),
  });
  assert.ok(codes.includes("spine/task-missing-verification"));
});

test("task chạm khối chưa có verify nào → hint bảo thêm bằng chứng trước", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/sprints/S-2026-08.yaml": sprint(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối chưa kiểm"
nature: code
paths: ["src/a/**"]
status: implemented
`,
    ".ganas/tasks/T-001.yaml": taskTouching("M-a", `  - kind: command\n    run: "true"`),
  });
  const err = diagnostics.find((d) => d.code === "spine/task-missing-verification");
  assert.ok(err);
  assert.match(err.hint!, /chưa có `verify` nào/);
});

/* --- Chu trình ------------------------------------------------------------- */

test("vòng lặp phụ thuộc giữa các khối bị bắt", async () => {
  const { diagnostics } = await check({
    ".ganas/parts/P-chat.yaml": part("P-chat", ["M-a", "M-b"], "M-a", "M-b"),
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", { dependsOn: ["M-b"] }),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", { dependsOn: ["M-a"] }),
  });
  const err = diagnostics.find((d) => d.code === "spine/module-cycle");
  assert.ok(err, "sơ đồ có chu trình thì không lan truyền được độ tin");
  assert.match(err.message, /M-[ab] → M-[ab]/);
});

test("khối tự phụ thuộc chính nó bị từ chối ở schema", () => {
  const parsed = zModule.safeParse({
    id: "M-a",
    title: "t",
    nature: "code",
    depends_on: ["M-a"],
  });
  assert.equal(parsed.success, false);
});

/* --- Khối mồ côi ----------------------------------------------------------- */

test("khối không tới được từ entry → cảnh báo mồ côi", async () => {
  const { codes } = await check({
    ".ganas/parts/P-chat.yaml": part("P-chat", ["M-a", "M-b", "M-le"], "M-a", "M-b"),
    ".ganas/modules/M-a.yaml": moduleYaml("M-a"),
    ".ganas/modules/M-b.yaml": moduleYaml("M-b", { dependsOn: ["M-a"] }),
    ".ganas/modules/M-le.yaml": moduleYaml("M-le"),
  });
  assert.ok(codes.includes("spine/module-orphaned"));
});

/* --- Bằng chứng ------------------------------------------------------------ */

test("khối chưa có bằng chứng nào → cảnh báo unverified", async () => {
  const { diagnostics } = await check({
    ".ganas/modules/M-a.yaml": `id: M-a
title: "Khối chưa kiểm"
nature: code
paths: ["src/a/**"]
status: implemented
`,
  });
  const warn = diagnostics.find((d) => d.code === "verify/module-unverified");
  assert.ok(warn, "khối không có bằng chứng thì luồng qua nó không tin được");
  assert.match(warn.hint!, /probe/);
});

test("khối gọi LLM thì gợi ý đòi EVAL, không phải probe", async () => {
  const { diagnostics } = await check({
    ".ganas/modules/M-intent.yaml": `id: M-intent
title: "Phân loại ý định"
nature: llm
paths: ["src/intent/**"]
status: implemented
`,
  });
  const warn = diagnostics.find((d) => d.code === "verify/module-unverified");
  assert.match(warn!.hint!, /eval/, "khối LLM cần eval — probe không kiểm được hành vi");
});

test("khối LLM chỉ có probe, không có eval → bị từ chối ở schema", () => {
  const parsed = zModule.safeParse({
    id: "M-intent",
    title: "t",
    nature: "llm",
    paths: ["src/intent/**"],
    status: "implemented",
    verify: [{ id: "V-x", kind: "probe", run: "test -f src/intent/index.ts" }],
  });
  assert.equal(parsed.success, false, "probe kiểm cấu trúc, không kiểm được hành vi LLM");
});

test('khai status "verified" mà verify rỗng → bị từ chối', () => {
  const parsed = zModule.safeParse({
    id: "M-a",
    title: "t",
    nature: "code",
    paths: ["src/a/**"],
    status: "verified",
    verify: [],
  });
  assert.equal(parsed.success, false);
});

test("eval ngưỡng quá thấp → cảnh báo eval_weak", async () => {
  const { diagnostics } = await check({
    ".ganas/modules/M-intent.yaml": `id: M-intent
title: "Phân loại ý định"
nature: llm
paths: ["src/intent/**"]
status: implemented
verify:
  - id: V-yeu
    kind: eval
    run: "npm run eval"
    threshold: 0.3
`,
  });
  const warn = diagnostics.find((d) => d.code === "verify/eval-weak");
  assert.ok(warn, "ngưỡng 0.3 thì đoán bừa cũng qua — pass không mang thông tin");
});

/* --- Schema của Verification ----------------------------------------------- */

test("eval mặc định adapter json, tier smoke, margin 0", () => {
  const v = zVerification.parse({ id: "V-a", kind: "eval", run: "x", threshold: 0.9 });
  assert.equal(v.kind, "eval");
  if (v.kind === "eval") {
    assert.equal(v.adapter, "json");
    assert.equal(v.tier, "smoke");
    assert.equal(v.margin, 0);
  }
});

test("probe nhận skip_if — dùng cho khối cần môi trường ngoài", () => {
  const v = zVerification.parse({
    id: "V-a",
    kind: "probe",
    run: "psql -c 'select 1'",
    skip_if: "! command -v psql",
  });
  assert.equal(v.skip_if, "! command -v psql");
});

/* --- Schema của Part -------------------------------------------------------- */

test("phần khai entry không nằm trong modules → bị từ chối", () => {
  const parsed = zPart.safeParse({
    id: "P-chat",
    title: "t",
    version: "0.1.0",
    modules: ["M-a"],
    entry: "M-ngoai",
    exit: "M-a",
  });
  assert.equal(parsed.success, false);
});

test("version phải theo semver", () => {
  const base = { id: "P-chat", title: "t", modules: ["M-a"], entry: "M-a", exit: "M-a" };
  assert.equal(zPart.safeParse({ ...base, version: "0.1.0" }).success, true);
  assert.equal(zPart.safeParse({ ...base, version: "v1" }).success, false);
});

/* --- Module.skills (N11) ---------------------------------------------------- */

test("Module.skills mặc định rỗng khi không khai", () => {
  const m = zModule.parse({ id: "M-a", title: "t", nature: "code" });
  assert.deepEqual(m.skills, []);
});

test("Module.skills nhận mảng chuỗi", () => {
  const m = zModule.parse({
    id: "M-a",
    title: "t",
    nature: "code",
    skills: ["adflex-legal-chunking", "another-skill"],
  });
  assert.deepEqual(m.skills, ["adflex-legal-chunking", "another-skill"]);
});
