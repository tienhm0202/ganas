import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { test } from "node:test";

import { run as runId } from "../src/commands/id.js";
import { DIRS, ganasPath } from "../src/graph/paths.js";
import { parseArgs } from "../src/util/args.js";
import { GanasError } from "../src/util/errors.js";
import { cleanup, goal, makeProject, task } from "./helpers.js";

/** Chạy `ganas id ...` và bắt stdout, theo mẫu ở test/commit-staging.test.ts:386-398. */
async function runCli(root: string, args: string[]): Promise<{ out: string; code: number }> {
  const out: string[] = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    out.push(String(chunk));
    return true;
  });
  try {
    const code = await runId(parseArgs([...args, "--root", root]));
    return { out: out.join(""), code };
  } finally {
    process.stdout.write = write;
  }
}

/* --- task: lấy số lớn nhất đang dùng, không phải đếm ----------------------- */

test("kho chưa có task nào → T-001", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const { out, code } = await runCli(root, ["task"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "T-001");
  } finally {
    await cleanup(root);
  }
});

test("có T-001 và T-007 → T-008 (lấy max, không đếm số lượng)", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/tasks/T-001.yaml": task("T-001"),
    ".ganas/tasks/T-007.yaml": task("T-007"),
  });
  try {
    const { out, code } = await runCli(root, ["task"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "T-008");
  } finally {
    await cleanup(root);
  }
});

test("--count 3 → ba id liên tiếp, không trùng id đang có", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/tasks/T-001.yaml": task("T-001"),
    ".ganas/tasks/T-007.yaml": task("T-007"),
  });
  try {
    const { out, code } = await runCli(root, ["task", "--count", "3"]);
    assert.equal(code, 0);
    assert.deepEqual(
      out.trim().split("\n"),
      ["T-008", "T-009", "T-010"],
    );
  } finally {
    await cleanup(root);
  }
});

test("có T-1234 → T-1235 (số ≥ 1000 không bị cắt về 3 chữ số)", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/tasks/T-1234.yaml": task("T-1234"),
  });
  try {
    const { out, code } = await runCli(root, ["task"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "T-1235");
  } finally {
    await cleanup(root);
  }
});

/* --- fact: bắt buộc --group -------------------------------------------------- */

test("fact thiếu --group → mã thoát khác 0, thông điệp nói rõ", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await assert.rejects(
      () => runId(parseArgs(["fact", "--root", root])),
      (err: unknown) => {
        assert.ok(err instanceof GanasError, "phải là GanasError, không phải lỗi khác");
        assert.notEqual((err).exitCode, 0);
        assert.match((err).message, /--group/);
        return true;
      },
    );
  } finally {
    await cleanup(root);
  }
});

test("fact --group ACC khi đã có F-ACC-002 → F-ACC-003", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/facts/a.yaml": `- id: F-ACC-002
  scope: P-thu
  statement: "s"
  verify:
    run: "true"`,
  });
  try {
    const { out, code } = await runCli(root, ["fact", "--group", "ACC"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "F-ACC-003");
  } finally {
    await cleanup(root);
  }
});

test("fact --group XYZ khi chưa có group đó → F-XYZ-001", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/facts/a.yaml": `- id: F-ACC-002
  scope: P-thu
  statement: "s"
  verify:
    run: "true"`,
  });
  try {
    const { out, code } = await runCli(root, ["fact", "--group", "XYZ"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "F-XYZ-001");
  } finally {
    await cleanup(root);
  }
});

/* --- loại slug: không có số kế tiếp ---------------------------------------- */

test("module → mã thoát khác 0, thông điệp nhắc tới slug và scope new", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await assert.rejects(
      () => runId(parseArgs(["module", "--root", root])),
      (err: unknown) => {
        assert.ok(err instanceof GanasError);
        assert.notEqual((err).exitCode, 0);
        assert.match((err).message, /slug|Ý NGHĨA/i);
        assert.match((err).message, /ganas scope new/);
        return true;
      },
    );
  } finally {
    await cleanup(root);
  }
});

test("scope → mã thoát khác 0, thông điệp nhắc tới slug và scope new", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    await assert.rejects(
      () => runId(parseArgs(["scope", "--root", root])),
      (err: unknown) => {
        assert.ok(err instanceof GanasError);
        assert.notEqual((err).exitCode, 0);
        assert.match((err).message, /slug|Ý NGHĨA/i);
        assert.match((err).message, /ganas scope new/);
        return true;
      },
    );
  } finally {
    await cleanup(root);
  }
});

/* --- --json ------------------------------------------------------------------ */

test("--json parse được, có kind và ids", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/tasks/T-001.yaml": task("T-001"),
  });
  try {
    const { out, code } = await runCli(root, ["task", "--json"]);
    assert.equal(code, 0);
    const parsed = JSON.parse(out) as { kind: string; ids: string[] };
    assert.equal(parsed.kind, "task");
    assert.deepEqual(parsed.ids, ["T-002"]);
  } finally {
    await cleanup(root);
  }
});

test("--json cho fact có thêm trường group", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const { out, code } = await runCli(root, ["fact", "--group", "ACC", "--json"]);
    assert.equal(code, 0);
    const parsed = JSON.parse(out) as { kind: string; group: string; ids: string[] };
    assert.equal(parsed.kind, "fact");
    assert.equal(parsed.group, "ACC");
    assert.deepEqual(parsed.ids, ["F-ACC-001"]);
  } finally {
    await cleanup(root);
  }
});

/* --- đặt chỗ nguyên tử: vá lỗ đua giữa hai phiên gọi `ganas id` ------------ */

test("⭐ hai phiên gọi `ganas id task` (khác --session), chưa ai ghi file → nhận id KHÁC nhau", async () => {
  // Đây chính là kịch bản đua đã gây mất dữ liệu: hai phiên Claude Code song
  // song gọi gần như đồng thời. Mô phỏng bằng hai lời gọi TUẦN TỰ với danh
  // tính phiên khác nhau — vì graph trên đĩa không đổi giữa hai lời gọi (chưa
  // ai ghi file task nào ra đĩa), nếu không có đặt-chỗ thì cả hai sẽ tính ra
  // cùng T-001 y như lỗi đã xảy ra.
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const first = await runCli(root, ["task", "--session", "session-a"]);
    const second = await runCli(root, ["task", "--session", "session-b"]);
    assert.equal(first.code, 0);
    assert.equal(second.code, 0);
    assert.notEqual(first.out.trim(), second.out.trim(), "hai phiên khác nhau không được nhận cùng id");
    assert.equal(first.out.trim(), "T-001");
    assert.equal(second.out.trim(), "T-002");
  } finally {
    await cleanup(root);
  }
});

test("⭐ hai lời gọi `ganas id task` KHÔNG có --session (mô phỏng trung thực kịch bản đua thật — plan-to-tasks chạy lệnh trần, không cờ session nào) → vẫn phải nhận id KHÁC nhau", async () => {
  // Không lệnh nào trong repo truyền --session cho `ganas id` (hook chỉ truyền
  // session cho lệnh `hook`; skill plan-to-tasks dạy chạy `ganas id task
  // --count N` trần trong Bash). Nên trong thực tế, MỌI lời gọi `ganas id`
  // đều rơi vào cùng fallback "cli" — nếu `reserveId` coi cùng session_id là
  // "đã giữ, cho qua" (như claimTask), phiên gọi lần hai sẽ nhận LẠI đúng số
  // phiên đầu vừa đặt chỗ, tức là quay lại đúng lỗi ban đầu.
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const first = await runCli(root, ["task"]);
    const second = await runCli(root, ["task"]);
    assert.equal(first.code, 0);
    assert.equal(second.code, 0);
    assert.notEqual(
      first.out.trim(),
      second.out.trim(),
      "đặt chỗ id là TIÊU THỤ một con số — cấp lại cho ai (kể cả cùng fallback \"cli\") cũng là cấp trùng",
    );
    assert.equal(first.out.trim(), "T-001");
    assert.equal(second.out.trim(), "T-002");
  } finally {
    await cleanup(root);
  }
});

test("--count vẫn cấp đủ số lượng và nhảy qua id đã bị phiên khác đặt chỗ", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const first = await runCli(root, ["task", "--session", "session-a"]);
    assert.equal(first.out.trim(), "T-001", "T-001 đã bị session-a đặt chỗ");

    const second = await runCli(root, ["task", "--count", "3", "--session", "session-b"]);
    assert.equal(second.code, 0);
    assert.deepEqual(
      second.out.trim().split("\n"),
      ["T-002", "T-003", "T-004"],
      "T-001 đang bị giữ nên phải nhảy qua, không lấp lại lỗ hổng",
    );
  } finally {
    await cleanup(root);
  }
});

test("id đặt chỗ đã hết TTL thì phiên khác được cấp lại đúng số đó", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const lockFile = ganasPath(root, DIRS.locks, "T-001.id");
    await mkdir(ganasPath(root, DIRS.locks), { recursive: true });
    await writeFile(
      lockFile,
      JSON.stringify({ session_id: "session-cu", claimed_at: "2020-01-01T00:00:00.000Z" }),
      "utf8",
    );

    const { out, code } = await runCli(root, ["task", "--session", "session-moi"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "T-001", "claim quá hạn TTL phải được giành lại, không nhảy sang T-002");
  } finally {
    await cleanup(root);
  }
});

/* --- id đã khai trên đĩa nhưng graph không thấy: không được cấp lại ------- */

test("file task hỏng schema (thiếu trường bắt buộc) vẫn khai id T-001 → `ganas id task` phải trả T-002, không cấp lại T-001", async () => {
  // T-001.yaml có `id` nhưng thiếu title/serves/... nên zod loại cả bản ghi
  // khỏi graph.tasks — nếu id.ts chỉ tính max trên graph.tasks thì nó "thấy"
  // T-001 là TRỐNG và cấp lại đúng id đang nằm trên đĩa. Agent ghi đè thì hook
  // preToolUse chặn (file đã tồn tại), chạy lại `ganas id` vẫn ra T-001 — kẹt
  // vòng lặp không lối ra.
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/tasks/T-001.yaml": `id: T-001\ntitle: "thiếu trường bắt buộc"\n`,
  });
  try {
    const { out, code } = await runCli(root, ["task"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "T-002", "id T-001 đã khai trên đĩa (dù hỏng schema) không được cấp lại");
  } finally {
    await cleanup(root);
  }
});

test("file fact dạng mảng, một phần tử hỏng schema mà vẫn khai id F-ACC-002 → `ganas id fact --group ACC` không cấp lại F-ACC-002", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/facts/a.yaml": `- id: F-ACC-002
  scope: P-thu
  statement: "thiếu verify — hỏng schema"
`,
  });
  try {
    const { out, code } = await runCli(root, ["fact", "--group", "ACC"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "F-ACC-003", "id F-ACC-002 đã khai trên đĩa (dù hỏng schema) không được cấp lại");
  } finally {
    await cleanup(root);
  }
});

test("file task lỗi CÚ PHÁP YAML (thụt lề sai) → `ganas id task` không cấp lại id trùng tên file, và vẫn chạy được (không ném)", async () => {
  // Thụt lề sai khiến parseDocument ném ngay ở readYamlFile — file này KHÔNG
  // có trong graph.sources, chỉ để lại Diagnostic mã "load/yaml". Suy id từ
  // basename file (T-001.yaml → T-001).
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/tasks/T-001.yaml": "id: T-001\ntitle: \"x\"\n  bad_indent: true\n",
  });
  try {
    const { out, code } = await runCli(root, ["task"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "T-002", "id suy từ basename file lỗi cú pháp YAML không được cấp lại");
  } finally {
    await cleanup(root);
  }
});

test("⭐ guard chống lạm phát: task hợp lệ T-001 có blocked_by treo tới T-900 → `ganas id task` vẫn trả T-002, KHÔNG nhảy lên T-901", async () => {
  // Khoá quyết định "chỉ lấy id ở TẦNG TRÊN CÙNG, tuyệt đối không duyệt sâu".
  // T-900 chỉ xuất hiện trong trường THAM CHIẾU `blocked_by`, không phải một
  // bản ghi tự xưng id T-900 — duyệt sâu sẽ nhặt nhầm nó, đẩy max lên 900 vì
  // một tham chiếu treo (gõ nhầm hoặc trỏ tới id chưa tạo).
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/tasks/T-001.yaml": task("T-001", { extra: "blocked_by:\n  - T-900\n" }),
  });
  try {
    const { out, code } = await runCli(root, ["task"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "T-002", "tham chiếu treo blocked_by: [T-900] không được đẩy max lên 900");
  } finally {
    await cleanup(root);
  }
});

test("⭐ guard chống lạm phát: task hợp lệ T-001 có serves treo tới G-900 → `ganas id goal` vẫn trả G-002, KHÔNG nhảy lên G-901", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/tasks/T-001.yaml": task("T-001", { serves: ["G-001", "G-900"] }),
  });
  try {
    const { out, code } = await runCli(root, ["goal"]);
    assert.equal(code, 0);
    assert.equal(out.trim(), "G-002", "tham chiếu treo serves: [G-900] không được đẩy max lên 900");
  } finally {
    await cleanup(root);
  }
});

test("cùng một --session gọi `ganas id` hai lần liên tiếp (chưa ghi file giữa hai lần) → vẫn nhận id KHÁC nhau", async () => {
  // Đặt chỗ id là TIÊU THỤ một con số, không phải QUYỀN SỞ HỮU — khác
  // `claimTask`, nơi cùng phiên gọi lại claim một task thì vẫn là task đó.
  // Nếu `reserveId` coi cùng session là "đã giữ, cho qua" thì đúng chuỗi thao
  // tác `ganas id task --count N` rồi Write mà agent hay dùng (skill
  // plan-to-tasks) sẽ tự cấp trùng id cho chính nó ở lần gọi kế tiếp.
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const first = await runCli(root, ["task", "--session", "session-a"]);
    const second = await runCli(root, ["task", "--session", "session-a"]);
    assert.equal(first.code, 0);
    assert.equal(second.code, 0);
    assert.notEqual(
      first.out.trim(),
      second.out.trim(),
      "cùng phiên gọi lại vẫn phải nhận id mới, không phải id đã tiêu thụ rồi",
    );
    assert.equal(first.out.trim(), "T-001");
    assert.equal(second.out.trim(), "T-002");
  } finally {
    await cleanup(root);
  }
});

