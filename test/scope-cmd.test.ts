import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { run as runScope } from "../src/commands/scope.js";
import { slugify } from "../src/commands/scope.js";
import { loadGraph } from "../src/graph/load.js";
import { parseArgs } from "../src/util/args.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

/** Chạy `ganas scope ...` và bắt stdout. */
async function runCli(root: string, args: string[]): Promise<{ out: string; code: number }> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: unknown }).write = (c: string | Uint8Array): boolean => {
    chunks.push(typeof c === "string" ? c : Buffer.from(c).toString("utf8"));
    return true;
  };
  try {
    const code = await runScope(parseArgs([...args, "--root", root], ["write", "yes"]));
    return { out: chunks.join(""), code };
  } finally {
    (process.stdout as { write: unknown }).write = original;
  }
}

async function baseProject(extra: Record<string, string> = {}): Promise<string> {
  return makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": task(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ...extra,
  });
}

/* --- slugify: id phải hợp lệ với tiêu đề tiếng Việt có dấu ---------------- */

test("slugify bỏ dấu tiếng Việt và cho ra slug hợp mẫu ID", () => {
  assert.equal(slugify("Đặt lịch qua Zalo"), "dat-lich-qua-zalo");
  assert.equal(slugify("Nhắc trước 1 tiếng!"), "nhac-truoc-1-tieng");
  // Không được bắt đầu bằng dấu gạch — mẫu ID đòi ký tự đầu là chữ/số.
  assert.match(`P-${slugify("---abc")}`, /^P-[a-z0-9][a-z0-9-]*$/);
  assert.match(`P-${slugify("!!!")}`, /^P-[a-z0-9][a-z0-9-]*$/);
});

/* --- scope (liệt kê) ------------------------------------------------------ */

test("dự án chưa có phạm vi nào thì nói cách tạo, không im lặng in rỗng", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const { out } = await runCli(root, []);
    assert.match(out, /Chưa có phạm vi công việc nào/);
    assert.match(out, /ganas scope new/, "phải chỉ đúng việc cần làm tiếp");
  } finally {
    await cleanup(root);
  }
});

test("liệt kê nêu người ký, số khối/task/fact và trạng thái nghiệm thu", async () => {
  const root = await baseProject();
  try {
    const { out } = await runCli(root, []);
    assert.match(out, /P-thu — Phạm vi thử/);
    assert.match(out, /nghiệm thu @nguoi-duyet/);
    assert.match(out, /1 khối/);
    assert.match(out, /1\/1 task chưa xong/);
    // Chưa verify lần nào ⇒ phải giục, không được im lặng coi như đạt.
    assert.match(out, /ganas verify --scope P-thu/);
  } finally {
    await cleanup(root);
  }
});

test("phạm vi active không có owner / không có nghiệm thu đều bị nêu", async () => {
  const root = await makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/scopes/P-tron.yaml": `id: P-tron
title: "Thùng rác"
version: 0.1.0
status: active
modules: [M-a]
entry: M-a
`,
    ".ganas/modules/M-a.yaml": moduleYaml("M-a", { scope: "P-tron" }),
  });
  try {
    const { out } = await runCli(root, []);
    assert.match(out, /⚠ chưa ai ký/);
    assert.match(out, /chưa có tiêu chí nghiệm thu/);
  } finally {
    await cleanup(root);
  }
});

/* --- scope new: bước dịch ------------------------------------------------- */

test("⭐ scope new sinh phạm vi HỢP LỆ và khối kèm theo, không cần gõ YAML", async () => {
  const root = await baseProject();
  try {
    const { code } = await runCli(root, [
      "new",
      "--yes",
      "--title",
      "Đặt lịch qua Zalo",
      "--paths",
      "src/zalo/**,src/booking/**",
      "--accept",
      "npm run test:booking",
      "--owner",
      "@tien",
    ]);
    assert.equal(code, 0);

    // Điều thật sự quan trọng: graph nạp lại được, tức YAML sinh ra hợp schema.
    const graph = await loadGraph(root);
    const sc = graph.scopes.get("P-dat-lich-qua-zalo");
    assert.ok(sc, "phạm vi mới phải nạp được vào graph");
    assert.equal(sc.value.owner, "@tien");
    assert.equal(sc.value.acceptance[0]!.kind, "probe");
    assert.equal(sc.value.modules.length, 1);

    // Khối đi kèm phải tồn tại và khớp hai chiều — nếu không thì phạm vi mới
    // vừa sinh ra đã sai luật `scope/module-scope-mismatch`.
    const mod = graph.modules.get(sc.value.modules[0]!);
    assert.ok(mod, "phải tạo khối kèm theo, không thì phạm vi không hợp lệ");
    assert.equal(mod.value.scope, "P-dat-lich-qua-zalo");
    assert.deepEqual(mod.value.paths, ["src/zalo/**", "src/booking/**"]);
  } finally {
    await cleanup(root);
  }
});

test("scope new dùng lại khối đã có nếu paths trùng, không đẻ khối chồng vùng", async () => {
  const root = await baseProject();
  try {
    await runCli(root, [
      "new",
      "--yes",
      "--title",
      "Việc mới",
      "--paths",
      "src/a/**", // trùng paths của M-a có sẵn
      "--accept",
      "true",
      "--owner",
      "@tien",
    ]);
    const graph = await loadGraph(root);
    assert.deepEqual(
      graph.scopes.get("P-viec-moi")!.value.modules,
      ["M-a"],
      "hai khối cùng trỏ một vùng code là hai bản đồ lệch nhau",
    );
  } finally {
    await cleanup(root);
  }
});

test("scope new nói rõ nature: code là mặc định và llm cần eval", async () => {
  const root = await baseProject();
  try {
    const { out } = await runCli(root, [
      "new",
      "--yes",
      "--title",
      "Phân loại ý định",
      "--paths",
      "src/intent/**",
      "--accept",
      "true",
      "--owner",
      "@tien",
    ]);
    assert.match(out, /nature: llm/, "không được im lặng chọn hộ nature");
    assert.match(out, /eval/);
  } finally {
    await cleanup(root);
  }
});

test("scope new thiếu câu nào cũng báo đúng câu đó, không tạo file dở dang", async () => {
  const root = await baseProject();
  try {
    await assert.rejects(() => runCli(root, ["new", "--yes", "--title", "X"]), /paths/);
    await assert.rejects(
      () => runCli(root, ["new", "--yes", "--title", "X", "--paths", "src/**"]),
      /accept/,
    );
    await assert.rejects(
      () =>
        runCli(root, [
          "new",
          "--yes",
          "--title",
          "X",
          "--paths",
          "src/**",
          "--accept",
          "true",
          "--owner",
          "tien",
        ]),
      /@ten/,
    );
    const graph = await loadGraph(root);
    assert.equal(graph.scopes.size, 1, "không được để lại phạm vi dở dang");
  } finally {
    await cleanup(root);
  }
});

test("khối mới bám theo id phạm vi, không theo tiêu đề", async () => {
  const root = await baseProject();
  try {
    // Gõ `--id P-ngan` mà nhận về `M-mot-tieu-de-rat-dai-...` là hai cách đặt
    // tên lệch nhau ngay trong cùng một lệnh.
    await runCli(root, [
      "new",
      "--yes",
      "--id",
      "P-ngan",
      "--title",
      "Một tiêu đề rất dài không nên thành id khối",
      "--paths",
      "src/ngan/**",
      "--accept",
      "true",
      "--owner",
      "@tien",
    ]);
    const graph = await loadGraph(root);
    assert.deepEqual(graph.scopes.get("P-ngan")!.value.modules, ["M-ngan"]);
    assert.ok(graph.modules.has("M-ngan"));
  } finally {
    await cleanup(root);
  }
});

test("scope new từ chối id đã tồn tại", async () => {
  const root = await baseProject();
  try {
    await assert.rejects(
      () =>
        runCli(root, [
          "new",
          "--yes",
          "--title",
          "X",
          "--paths",
          "src/x/**",
          "--accept",
          "true",
          "--id",
          "P-thu",
        ]),
      /đã tồn tại/,
    );
  } finally {
    await cleanup(root);
  }
});

/* --- scope assign: vá, nhưng không đoán ----------------------------------- */

const FACTS = `# Ghi chú của con người ở đầu file
- id: F-SUY-001
  # vì sao fact này tồn tại
  statement: "suy được từ depends_on"
  depends_on: ["src/a/**"]
  verify:
    run: "test -d src"
- id: F-MO-HO-001
  statement: "không khớp phạm vi nào"
  verify:
    run: "test -d src"
`;

test("⭐ assign mặc định DRY-RUN: in ra nhưng không đụng đĩa", async () => {
  const root = await baseProject({ ".ganas/facts/f.yaml": FACTS });
  try {
    const before = await readFile(join(root, ".ganas/facts/f.yaml"), "utf8");
    const { out } = await runCli(root, ["assign"]);
    assert.match(out, /F-SUY-001 \(fact\) → P-thu/);
    assert.match(out, /dry-run/);
    assert.equal(
      await readFile(join(root, ".ganas/facts/f.yaml"), "utf8"),
      before,
      "dry-run phải không đụng đĩa",
    );
  } finally {
    await cleanup(root);
  }
});

test("⭐ assign KHÔNG đoán khi mơ hồ, và --write chỉ ghi phần chắc chắn", async () => {
  const root = await baseProject({ ".ganas/facts/f.yaml": FACTS });
  try {
    const { out, code } = await runCli(root, ["assign", "--write"]);
    assert.match(out, /KHÔNG suy được — phải tự quyết/);
    assert.match(out, /F-MO-HO-001/);
    assert.equal(code, 1, "còn bản ghi phải người quyết ⇒ mã thoát khác 0");

    const after = await readFile(join(root, ".ganas/facts/f.yaml"), "utf8");
    assert.match(after, /scope: P-thu/, "phần suy được phải được ghi");
    // Gán bừa để hết cảnh báo là im lặng đặt phát biểu vào ngữ cảnh sai —
    // tệ hơn hẳn so với để trống và bị báo lỗi.
    const moHo = after.slice(after.indexOf("F-MO-HO-001"));
    assert.doesNotMatch(moHo, /scope:/, "bản ghi mơ hồ phải giữ nguyên");
  } finally {
    await cleanup(root);
  }
});

test("assign giữ nguyên comment trong YAML", async () => {
  const root = await baseProject({ ".ganas/facts/f.yaml": FACTS });
  try {
    await runCli(root, ["assign", "--write"]);
    const after = await readFile(join(root, ".ganas/facts/f.yaml"), "utf8");
    assert.match(after, /# Ghi chú của con người ở đầu file/);
    assert.match(after, /# vì sao fact này tồn tại/);
  } finally {
    await cleanup(root);
  }
});

test("assign suy phạm vi của task qua `touches`, không qua đường đoán path", async () => {
  const root = await baseProject();
  try {
    await writeFile(
      join(root, ".ganas/tasks/T-002.yaml"),
      `id: T-002
title: "Task quên khai phạm vi"
serves: [G-001]
implements: D-001
touches: [M-a]
exit_contract:
  - kind: command
    run: "true"
`,
      "utf8",
    );
    const { out } = await runCli(root, ["assign"]);
    assert.match(out, /T-002 \(task\) → P-thu/);
  } finally {
    await cleanup(root);
  }
});

test("assign khi không còn gì thiếu thì nói thẳng, không in danh sách rỗng", async () => {
  const root = await baseProject();
  try {
    const { out, code } = await runCli(root, ["assign"]);
    assert.match(out, /đều đã khai phạm vi/);
    assert.equal(code, 0);
  } finally {
    await cleanup(root);
  }
});

test("lệnh con lạ báo lỗi kèm danh sách lệnh con có thật", async () => {
  const root = await baseProject();
  try {
    await assert.rejects(() => runCli(root, ["khong-co"]), /new, assign/);
  } finally {
    await cleanup(root);
  }
});

/* --- Chi phí khởi động: thông điệp phải nói đúng sự thật ------------------- */

test("⭐ dự án 0 task: `next` nói 'chưa có task nào', KHÔNG nói 'không còn task nào chưa xong'", async () => {
  const root = await makeProject({ ".ganas/goals/G-001.yaml": goal() });
  try {
    const { run: runNext } = await import("../src/commands/next.js");
    const chunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    (process.stdout as { write: unknown }).write = (c: string | Uint8Array): boolean => {
      chunks.push(typeof c === "string" ? c : Buffer.from(c).toString("utf8"));
      return true;
    };
    try {
      await runNext(parseArgs(["--root", root]));
    } finally {
      (process.stdout as { write: unknown }).write = original;
    }
    const out = chunks.join("");
    // "Không còn task nào chưa xong" trên dự án 0 task là nói NGƯỢC sự thật, và
    // đó lại là câu đầu tiên người mới nhìn thấy sau `ganas init`.
    assert.match(out, /chưa có task nào/);
    assert.doesNotMatch(out, /Không còn task nào chưa xong/);
    assert.match(out, /ganas scope new/, "chưa có phạm vi thì phải chỉ việc đó trước");
  } finally {
    await cleanup(root);
  }
});
