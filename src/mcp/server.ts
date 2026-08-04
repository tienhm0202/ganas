/**
 * MCP server cho editor khác Claude Code (Cursor, Windsurf, …).
 *
 * Không viết lại logic: mỗi tool ở đây gọi thẳng `run(argv)` của đúng command
 * CLI đã có (`src/commands/*.ts`), y hệt cách `src/cli.ts` gọi — chỉ khác
 * nguồn argv (JSON từ MCP tool call, không phải `process.argv`) và cách lấy
 * kết quả (chụp lại `process.stdout.write` thay vì để nó in thẳng ra
 * terminal). Vì vậy MCP server này không có hành vi riêng để lệch khỏi CLI.
 *
 * KHÔNG có cưỡng chế `PreToolUse`/`Stop` như hook Claude Code — MCP không có
 * khái niệm tương đương, đây chỉ là gọi tool theo yêu cầu. Editor khác dùng
 * ganas qua đường này được brief/gate/verify/… nhưng KHÔNG được hàng rào chặn
 * ghi tri thức sai hay chặn kết thúc phiên sớm.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import * as commit from "../commands/commit.js";
import * as flow from "../commands/flow.js";
import * as gate from "../commands/gate.js";
import * as next from "../commands/next.js";
import * as scope from "../commands/scope.js";
import * as trace from "../commands/trace.js";
import * as verify from "../commands/verify.js";
import { type Argv, parseArgs } from "../util/args.js";
import { GanasError } from "../util/errors.js";

/** Nhúng lúc build (scripts/build.mjs), giống cli.ts. */
declare const __GANAS_VERSION__: string;

type CommandRun = (argv: Argv) => Promise<number> | number;

/** Chụp `process.stdout.write` thay vì để nó in thẳng — MCP tool trả text, không phải stdout thật. */
async function captureStdout(fn: () => Promise<number> | number): Promise<{
  code: number;
  output: string;
}> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array, ...rest: unknown[]): boolean => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    const cb = rest.find((a): a is () => void => typeof a === "function");
    cb?.();
    return true;
  };

  try {
    const code = await fn();
    return { code, output: chunks.join("") };
  } finally {
    process.stdout.write = original;
  }
}

/**
 * Mỗi tool call chạy tuần tự, không xen kẽ — chụp stdout bằng cách thay tạm
 * `process.stdout.write` là thao tác toàn cục trên process, hai lệnh chạy
 * song song sẽ lẫn output vào nhau nếu không serialize.
 */
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function runTool(
  run: CommandRun,
  rawArgs: string[],
): Promise<{ content: [{ type: "text"; text: string }]; isError?: boolean }> {
  return serialize(async () => {
    let code: number;
    let output: string;
    try {
      ({ code, output } = await captureStdout(() => run(parseArgs(rawArgs))));
    } catch (err) {
      const message =
        err instanceof GanasError ? err.message : String(err instanceof Error ? err.message : err);
      return { content: [{ type: "text", text: `ganas: ${message}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: output || "(không có output)" }],
      isError: code !== 0,
    };
  });
}

const ARGS_SCHEMA = {
  args: z
    .array(z.string())
    .default([])
    .describe(
      "Tham số dòng lệnh, đúng như gõ sau `ganas <lệnh>` (không gồm tên lệnh). " +
        'Ví dụ verify: ["F-ACC-001", "--scope", "P-thanh-toan"].',
    ),
};

interface ToolDef {
  name: string;
  description: string;
  run: CommandRun;
}

const TOOLS: ToolDef[] = [
  {
    name: "ganas_flow",
    description: "Bước kế tiếp của dòng chảy 12 chặng — đúng một bước, không phải menu.",
    run: flow.run,
  },
  {
    name: "ganas_next",
    description: "Chọn task kế tiếp (có claim, tránh đụng phiên khác) và in brief đầy đủ.",
    run: next.run,
  },
  {
    name: "ganas_gate",
    description: "Chấm điều kiện hoàn thành (exit_contract) của một task.",
    run: gate.run,
  },
  {
    name: "ganas_verify",
    description: "Chạy bằng chứng (probe/eval) cho fact hoặc khối, ghi sổ cái.",
    run: verify.run,
  },
  {
    name: "ganas_trace",
    description: "Kiểm tương thích cạnh giữa các khối, in sơ đồ Mermaid, liệt kê nợ kiểm chứng.",
    run: trace.run,
  },
  {
    name: "ganas_scope",
    description:
      'Phạm vi công việc: liệt kê ("[]"), tạo mới ("new"), hoặc vá chỗ quên khai ("assign").',
    run: scope.run,
  },
  {
    name: "ganas_commit",
    description: "Commit task đã đạt gate — message dựng từ dữ liệu đã kiểm chứng.",
    run: commit.run,
  },
];

export function createServer(): McpServer {
  const server = new McpServer({
    name: "ganas",
    version: typeof __GANAS_VERSION__ === "string" ? __GANAS_VERSION__ : "0.0.0",
  });

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: ARGS_SCHEMA },
      async ({ args }: { args: string[] }) => runTool(tool.run, args),
    );
  }

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  process.stderr.write(`ganas-mcp: lỗi không lường trước\n${String(err)}\n`);
  process.exitCode = 70;
});
