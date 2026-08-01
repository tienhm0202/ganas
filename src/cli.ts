#!/usr/bin/env node
/**
 * ganas CLI — router.
 *
 * Hook gọi CLI này nhiều lần mỗi phiên, nên module lệnh được nạp bằng dynamic
 * import: chạy `ganas brief` không kéo theo code của init/pack/kb.
 */
import { type Argv, parseArgs } from "./util/args.js";
import { GanasError } from "./util/errors.js";

type CommandModule = { run: (argv: Argv) => Promise<number> | number };

const COMMANDS: Record<string, () => Promise<CommandModule>> = {
  init: () => import("./commands/init.js"),
  validate: () => import("./commands/validate.js"),
  brief: () => import("./commands/brief.js"),
  next: () => import("./commands/next.js"),
  gate: () => import("./commands/gate.js"),
  verify: () => import("./commands/verify.js"),
  trace: () => import("./commands/trace.js"),
  commit: () => import("./commands/commit.js"),
  handoff: () => import("./commands/handoff.js"),
  prune: () => import("./commands/prune.js"),
  hook: () => import("./commands/hook.js"),
};

const HELP = `ganas — control layer cho các phiên Claude Code

Cách dùng:
  ganas <lệnh> [tuỳ chọn]

Lệnh:
  init                 Khởi tạo .ganas/ cho dự án mới (greenfield)
  validate             Kiểm tra graph: schema, liên kết, luật spine
  next                 Chọn task kế tiếp và in brief đầy đủ
  brief [task]         In brief của một task
  gate [task]          Chấm điều kiện hoàn thành của task
  verify [target...]   Chạy bằng chứng: probe và eval, ghi sổ cái
  trace                Kiểm tương thích cạnh (contract), in sơ đồ khối, báo nợ kiểm chứng
  commit [task]        Commit task đã đạt gate — message dựng từ dữ liệu đã kiểm chứng
  handoff --session id Ghi bản ghi tiếp nối của phiên, dẫn xuất từ transcript
  prune                Dọn ephemeral cũ, archive task done/sprint closed (mặc định dry-run)
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
    const fs = await import("node:fs/promises");
    const url = await import("node:url");
    const path = await import("node:path");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const raw = await fs.readFile(path.join(here, "..", "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { version: string };
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }

  const name = argv.positional[0];
  if (!name || argv.flags["help"] || argv.flags["h"]) {
    process.stdout.write(HELP);
    return name ? 0 : 1;
  }

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
