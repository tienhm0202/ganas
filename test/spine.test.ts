import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { loadGraph } from "../src/graph/load.js";
import { validateGraph } from "../src/graph/validate.js";
import { zTask } from "../src/model/index.js";
import { check, cleanup, design, goal, makeProject, task, validSpine } from "./helpers.js";

test("graph hợp lệ không có lỗi", async () => {
  const { diagnostics } = await check(validSpine());
  const errors = diagnostics.filter((d) => d.severity === "error");
  assert.deepEqual(errors, [], `không mong đợi lỗi: ${JSON.stringify(errors, null, 2)}`);
});

test("design thiếu serves bị từ chối — đây là luật chặn '20 design trôi nổi'", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": `id: D-001
title: "Design không neo vào đâu"
summary: "..."
status: active`,
  });
  const err = diagnostics.find((d) => d.severity === "error" && d.message.includes("serves"));
  assert.ok(err, `phải báo lỗi thiếu serves, nhận được: ${JSON.stringify(diagnostics)}`);
  assert.equal(err.file, ".ganas/designs/D-001.yaml");
});

test("design serves rỗng cũng bị từ chối", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": `id: D-001
title: "Design serves rỗng"
serves: []
summary: "..."
status: active`,
  });
  assert.ok(diagnostics.some((d) => d.severity === "error" && d.message.includes("serves")));
});

test("design trỏ vào goal không tồn tại → dangling ref có file:line", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design("D-001", ["G-099"]),
  });
  const err = diagnostics.find((d) => d.code === "spine/design-missing-goal");
  assert.ok(err, "phải bắt được goal treo");
  assert.match(err.message, /G-099/);
  assert.equal(typeof err.line, "number", "diagnostic phải có số dòng để sửa được ngay");
});

test("goal thiếu tiêu chí nghiệm thu bị từ chối", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": `id: G-001
title: "Mục tiêu không đo được"
outcome: "Mọi thứ tốt hơn"
acceptance: []
status: draft`,
  });
  assert.ok(
    diagnostics.some((d) => d.severity === "error" && d.message.includes("nghiệm thu")),
    "goal không có tiêu chí kiểm chứng được thì không phải mục tiêu",
  );
});

test("goal active mà chưa có người duyệt bị từ chối — model không được tự chốt mục tiêu", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": `id: G-001
title: "Mục tiêu model tự đặt"
outcome: "..."
acceptance:
  - id: A-1
    kind: command
    run: "true"
status: active`,
  });
  const err = diagnostics.find((d) => d.message.includes("approved_by"));
  assert.ok(err, `phải chặn goal active thiếu approved_by: ${JSON.stringify(diagnostics)}`);
});

test("goal draft chưa duyệt thì vẫn hợp lệ, chỉ cảnh báo khi có design phục vụ", async () => {
  const { diagnostics, codes } = await check({
    ".ganas/goals/G-001.yaml": `id: G-001
title: "Mục tiêu nháp"
outcome: "..."
acceptance:
  - id: A-1
    kind: command
    run: "true"
status: draft`,
    ".ganas/designs/D-001.yaml": design(),
  });
  assert.deepEqual(
    diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  assert.ok(codes.includes("spine/design-serves-draft-goal"));
});

test("task phục vụ goal mà design của nó không phục vụ → spine đứt", async () => {
  const { diagnostics } = await check({
    ".ganas/goals/G-001.yaml": goal("G-001"),
    ".ganas/goals/G-002.yaml": goal("G-002"),
    ".ganas/designs/D-001.yaml": design("D-001", ["G-001"]),
    ".ganas/tasks/T-001.yaml": task("T-001", { serves: ["G-002"] }),
  });
  const err = diagnostics.find((d) => d.code === "spine/task-goal-not-in-design");
  assert.ok(err, "task không được phục vụ goal mà design của nó không phục vụ");
  assert.match(err.message, /G-002/);
});

test("task thiếu exit_contract bị từ chối — không có cách nào biết nó xong", async () => {
  const files = validSpine();
  files[".ganas/tasks/T-001.yaml"] = `id: T-001
title: "Task không có điều kiện done"
serves:
  - G-001
implements: D-001
scope: P-thu
status: todo`;
  const { diagnostics } = await check(files);
  assert.ok(diagnostics.some((d) => d.severity === "error" && d.message.includes("exit_contract")));
});

test("vòng lặp phụ thuộc giữa task bị bắt", async () => {
  const files = validSpine();
  files[".ganas/tasks/T-001.yaml"] = task("T-001", { extra: "blocked_by:\n  - T-002" });
  files[".ganas/tasks/T-002.yaml"] = task("T-002", { extra: "blocked_by:\n  - T-001" });
  const { diagnostics } = await check(files);
  const err = diagnostics.find((d) => d.code === "spine/task-cycle");
  assert.ok(err, "phải bắt được vòng lặp");
  assert.match(err.message, /T-00\d → T-00\d/);
});

/* --- Chu trình supersedes giữa decision (N1) -------------------------------
 *
 * Trước đây một chu trình giữa các decision vô hại — không ai đọc
 * `Decision.supersedes` cả. Từ khi brief loại khỏi bàn giao MỌI decision nằm
 * trong tập "bị supersede", một chu trình đưa cả cụm vào tập chết đó cùng
 * lúc: brief nuốt mất cả cụm, phiên làm việc không thấy một mệnh lệnh nào,
 * im lặng hoàn toàn. Đây không còn là dữ liệu xấu đơn thuần.
 */

function decisionsYaml(...decisions: Array<{ id: string; supersedes?: string[] }>): string {
  return decisions
    .map(
      (d) =>
        `- id: ${d.id}
  statement: "Quyết định thử"
  decided_by: "@tien"
  decided_at: 2026-01-01T00:00:00Z` +
        (d.supersedes ? `\n  supersedes: [${d.supersedes.join(", ")}]` : ""),
    )
    .join("\n");
}

test("chu trình hai đời giữa decision (DEC-A supersedes DEC-B, DEC-B supersedes DEC-A) bị bắt", async () => {
  const { codes } = await check({
    ".ganas/decisions/d.yaml": decisionsYaml(
      { id: "DEC-001", supersedes: ["DEC-002"] },
      { id: "DEC-002", supersedes: ["DEC-001"] },
    ),
  });
  assert.ok(codes.includes("spine/decision-cycle"), `phải bắt được vòng lặp: ${JSON.stringify(codes)}`);
});

test("chuỗi thẳng DEC-003 → DEC-002 → DEC-001 không phải chu trình — không báo nhầm", async () => {
  const { codes } = await check({
    ".ganas/decisions/d.yaml": decisionsYaml(
      { id: "DEC-001" },
      { id: "DEC-002", supersedes: ["DEC-001"] },
      { id: "DEC-003", supersedes: ["DEC-002"] },
    ),
  });
  assert.ok(!codes.includes("spine/decision-cycle"), `chuỗi thẳng không phải chu trình: ${JSON.stringify(codes)}`);
});

test("chu trình ba đời giữa decision vẫn bị bắt", async () => {
  const { codes } = await check({
    ".ganas/decisions/d.yaml": decisionsYaml(
      { id: "DEC-001", supersedes: ["DEC-003"] },
      { id: "DEC-002", supersedes: ["DEC-001"] },
      { id: "DEC-003", supersedes: ["DEC-002"] },
    ),
  });
  assert.ok(codes.includes("spine/decision-cycle"), `phải bắt được vòng lặp ba đời: ${JSON.stringify(codes)}`);
});

test("thông điệp chu trình decision nêu đúng các id trong chuỗi", async () => {
  const { diagnostics } = await check({
    ".ganas/decisions/d.yaml": decisionsYaml(
      { id: "DEC-001", supersedes: ["DEC-002"] },
      { id: "DEC-002", supersedes: ["DEC-001"] },
    ),
  });
  const err = diagnostics.find((d) => d.code === "spine/decision-cycle");
  assert.ok(err, "phải có diagnostic chu trình decision");
  assert.match(err.message, /DEC-001/);
  assert.match(err.message, /DEC-002/);
  assert.match(err.message, /→/);
});

test("design mồ côi khi mọi goal nó phục vụ đã closed", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal("G-001", "closed_at: 2026-02-01T00:00:00Z").replace(
      "status: active",
      "status: closed",
    ),
    ".ganas/designs/D-001.yaml": design("D-001", ["G-001"]),
  });
  assert.ok(codes.includes("spine/design-orphaned"));
});

test("design status: done dưới goal đã closed KHÔNG bị báo mồ côi — đó là kết thúc đúng", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal("G-001", "closed_at: 2026-02-01T00:00:00Z").replace(
      "status: active",
      "status: closed",
    ),
    ".ganas/designs/D-001.yaml": `id: D-001
title: "Design thử"
serves:
  - G-001
summary: "Cách tiếp cận"
status: done
done_at: 2026-02-02T00:00:00Z`,
  });
  assert.ok(!codes.includes("spine/design-orphaned"));
});

test("task ước lượng large bị cảnh báo phải chẻ nhỏ", async () => {
  const files = validSpine();
  files[".ganas/tasks/T-001.yaml"] = task("T-001", { extra: "estimated_context: large" });
  const { codes } = await check(files);
  assert.ok(codes.includes("spine/task-too-large"));
});

test("ID trùng giữa hai file bị bắt", async () => {
  const files = validSpine();
  files[".ganas/tasks/T-001-copy.yaml"] = task("T-001");
  const { diagnostics } = await check(files);
  const err = diagnostics.find((d) => d.code === "load/duplicate-id");
  assert.ok(err, "cùng một ID ở hai file phải bị từ chối");
});

test("task trỏ design/scope không tồn tại đều bị bắt", async () => {
  const { codes } = await check({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/tasks/T-001.yaml": task("T-001", { implements: "D-999", scope: "P-thu" }),
  });
  assert.ok(codes.includes("spine/task-missing-design"));
  assert.ok(codes.includes("scope/task-scope-not-found"));
});

/* --- .gitignore: local-only phải được loại trừ ---------------------------- */

async function projectWithGit(gitignore?: string): Promise<string> {
  const root = await makeProject(validSpine());
  await mkdir(join(root, ".git"), { recursive: true });
  if (gitignore !== undefined) await writeFile(join(root, ".gitignore"), gitignore, "utf8");
  return root;
}

test("không có .git thì không kiểm .gitignore — luật vô nghĩa với dự án không dùng git", async () => {
  const root = await makeProject(validSpine());
  try {
    const graph = await loadGraph(root);
    const codes = validateGraph(graph).map((d) => d.code);
    assert.ok(!codes.includes("spine/gitignore-missing-local"));
  } finally {
    await cleanup(root);
  }
});

test("có .git nhưng chưa có .gitignore → lỗi liệt kê đủ mục local-only", async () => {
  const root = await projectWithGit();
  try {
    const graph = await loadGraph(root);
    const err = validateGraph(graph).find((d) => d.code === "spine/gitignore-missing-local");
    assert.ok(err, "thiếu .gitignore thì trạng thái riêng của máy có thể bị commit nhầm");
    assert.match(err.message, /\.ganas\/runs\//);
    assert.match(err.message, /\.ganas\/state\.json/);
    assert.match(err.message, /\.ganas\/\.locks\//);
  } finally {
    await cleanup(root);
  }
});

test(".gitignore đủ ba dòng local-only → không lỗi", async () => {
  const root = await projectWithGit(".ganas/runs/\n.ganas/.locks/\n.ganas/state.json\n");
  try {
    const graph = await loadGraph(root);
    const codes = validateGraph(graph).map((d) => d.code);
    assert.ok(!codes.includes("spine/gitignore-missing-local"), JSON.stringify(codes));
  } finally {
    await cleanup(root);
  }
});

test(".gitignore thiếu MỘT trong ba dòng → lỗi chỉ nêu đúng dòng thiếu", async () => {
  const root = await projectWithGit(".ganas/runs/\n.ganas/.locks/\n");
  try {
    const graph = await loadGraph(root);
    const err = validateGraph(graph).find((d) => d.code === "spine/gitignore-missing-local");
    assert.ok(err);
    assert.doesNotMatch(err.message, /\.ganas\/runs\//);
    assert.doesNotMatch(err.message, /\.ganas\/\.locks\//);
    assert.match(err.message, /\.ganas\/state\.json/);
  } finally {
    await cleanup(root);
  }
});

/* --- Schema của Task.model (N10) ------------------------------------------ */

function minimalTaskInput(extra: Record<string, unknown> = {}) {
  return {
    id: "T-001",
    title: "t",
    serves: ["G-001"],
    implements: "D-001",
    scope: "P-thu",
    exit_contract: [{ kind: "command", run: "true" }],
    ...extra,
  };
}

test("task.model chấp nhận đúng ba tier main/verifier/scribe", () => {
  for (const tier of ["main", "verifier", "scribe"] as const) {
    const t = zTask.parse(minimalTaskInput({ model: tier }));
    assert.equal(t.model, tier);
  }
});

test("task.model từ chối giá trị không phải một trong ba tier", () => {
  const parsed = zTask.safeParse(minimalTaskInput({ model: "not-a-tier" }));
  assert.equal(parsed.success, false);
});

test("task.model vắng mặt vẫn hợp lệ — không gán thì thôi, không bắt buộc", () => {
  const t = zTask.parse(minimalTaskInput());
  assert.equal(t.model, undefined);
});
