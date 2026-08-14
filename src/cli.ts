/**
 * ganas CLI — router.
 *
 * KHÔNG có shebang ở đây: bản ship là bundle do `scripts/build.mjs` sinh, và
 * shebang được banner của nó thêm vào đúng dòng 1. Để shebang ở nguồn thì
 * esbuild giữ lại và output có HAI dòng `#!` — dòng thứ hai là lỗi cú pháp,
 * khiến file không `import()` được và plugin im lặng chết.
 *
 * Hook gọi CLI này nhiều lần mỗi phiên, nên module lệnh được nạp bằng dynamic
 * import: chạy `ganas brief` không kéo theo code của init/pack/kb.
 */
import { type Argv, parseArgs } from "./util/args.js";
import { GanasError } from "./util/errors.js";

/** Nhúng lúc build (scripts/build.mjs). */
declare const __GANAS_VERSION__: string;

type CommandModule = { run: (argv: Argv) => Promise<number> | number };

const COMMANDS: Record<string, () => Promise<CommandModule>> = {
  flow: () => import("./commands/flow.js"),
  init: () => import("./commands/init.js"),
  validate: () => import("./commands/validate.js"),
  scope: () => import("./commands/scope.js"),
  id: () => import("./commands/id.js"),
  brief: () => import("./commands/brief.js"),
  next: () => import("./commands/next.js"),
  gate: () => import("./commands/gate.js"),
  verify: () => import("./commands/verify.js"),
  trace: () => import("./commands/trace.js"),
  debt: () => import("./commands/debt.js"),
  commit: () => import("./commands/commit.js"),
  note: () => import("./commands/note.js"),
  handoff: () => import("./commands/handoff.js"),
  prune: () => import("./commands/prune.js"),
  ledger: () => import("./commands/ledger.js"),
  hook: () => import("./commands/hook.js"),
};

const HELP = `ganas — control layer cho các phiên Claude Code

Cách dùng:
  ganas <lệnh> [tuỳ chọn]

Lệnh:
  flow                 Bước kế tiếp của dòng chảy (cũng là \`ganas\` không tham số)
  init                 Khởi tạo .ganas/ cho dự án mới (greenfield)
  validate             Kiểm tra graph: schema, liên kết, luật spine
  scope [new|assign]   Phạm vi công việc: liệt kê, tạo mới (phỏng vấn), vá chỗ quên khai
  id <loại>            Cấp id kế tiếp (goal/design/task/claim/decision/fact)
  next                 Chọn task kế tiếp và in brief đầy đủ
  brief [task]         In brief của một task
  gate [task]          Chấm điều kiện hoàn thành của task
  verify [target...]   Chạy bằng chứng: probe và eval, ghi sổ cái (--scope lọc theo phạm vi)
  trace                Kiểm tương thích cạnh (contract), in sơ đồ khối, báo nợ kiểm chứng (--scope)
  debt [--all]         Bảng xếp hạng nợ theo phạm vi task đang làm (--all: toàn dự án)
  commit [task]        Commit task đã đạt gate — message dựng từ dữ liệu đã kiểm chứng
  note "..."           Ghi chú thô của phiên vào .ganas/runs/notes/ (chưa kiểm, không phải fact)
  handoff --session id Ghi bản ghi tiếp nối của phiên, dẫn xuất từ transcript
  prune                Dọn ephemeral cũ, archive task done (mặc định dry-run)
  ledger --check       Kiểm hash-chain của sổ cái xác minh (dùng trong hook pre-commit)
  hook <event>         Điểm vào cho hook Claude Code (đọc JSON ở stdin)

Tuỳ chọn chung:
  -C, --cwd <path>     Chạy như thể đang ở thư mục này
      --session <id>   Gắn thao tác với một phiên cụ thể
      --json           Xuất JSON thay vì văn bản
  -h, --help           Hiện trợ giúp
  -v, --version        Hiện phiên bản
`;

async function main(): Promise<number> {
  const raw = process.argv.slice(2);
  const argv = parseArgs(raw);

  if (argv.flags["version"] || argv.flags["v"]) {
    // Nhúng lúc build (`--define:__GANAS_VERSION__`), không đọc package.json:
    // bản ship là một file bundle nằm trong `plugin/dist/`, cạnh nó không có
    // package.json nào. Đọc file ở đây từng đúng khi build ra `dist/` ở gốc.
    process.stdout.write(`${__GANAS_VERSION__}\n`);
    return 0;
  }

  if (argv.flags["help"] || argv.flags["h"]) {
    process.stdout.write(HELP);
    return 0;
  }

  // `ganas` trần in ĐÚNG MỘT bước kế tiếp, không in menu 12 lệnh: mỗi lựa chọn
  // đẩy sang người dùng là một chỗ đi lạc. Muốn menu thì `ganas --help`.
  const name = argv.positional[0] ?? "flow";

  const load = COMMANDS[name];
  if (!load) {
    process.stderr.write(`ganas: không có lệnh "${name}"\n\n${HELP}`);
    return 1;
  }

  const cwd = argv.options["cwd"] ?? argv.options["C"];
  if (cwd) process.chdir(cwd);

  const mod = await load();
  return await mod.run({ ...argv, positional: argv.positional.slice(1) });
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    if (err instanceof GanasError) {
      process.stderr.write(`ganas: ${err.message}\n`);
      process.exitCode = err.exitCode;
      return;
    }
    process.stderr.write(
      `ganas: lỗi không lường trước\n${String(err instanceof Error ? err.stack : err)}\n`,
    );
    process.exitCode = 70;
  });
