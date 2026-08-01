import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { formatGate, type GateResult } from "./gate.js";
import { DIRS, ganasPath } from "./graph/paths.js";
import type { Graph } from "./graph/types.js";
import type { Task } from "./model/index.js";

/**
 * Handoff — bản ghi tiếp nối giữa các phiên, DẪN XUẤT từ transcript thật.
 *
 * Cố ý không dùng model tóm tắt: một bản tóm tắt văn xuôi là chỗ một hiểu nhầm
 * dễ lẻn vào rồi được phiên sau tin làm sự thật (chính luật cấm trong
 * `knowledgeRuleMd()`). Mọi thứ ở đây trích CƠ HỌC — tin nhắn người dùng gõ
 * nguyên văn, tool nào chạy với input gì — hoặc lấy thẳng từ graph đã có bằng
 * chứng (fact/claim gắn đúng phiên, kết quả gate thật). Không có bước nào
 * "model đọc rồi diễn giải lại".
 */

/* ------------------------------------------------------------------------- *
 * Transcript: trích cơ học
 * ------------------------------------------------------------------------- */

export interface TranscriptSummary {
  startedAt?: string | undefined;
  endedAt?: string | undefined;
  turnCount: number;
  /** Tin nhắn người dùng gõ, nguyên văn — đã lọc bỏ wrapper hệ thống. */
  userMessages: string[];
  filesWritten: string[];
  filesRead: string[];
  commandsRun: string[];
  toolCounts: Record<string, number>;
}

const WRITE_TOOL_NAMES = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
/** Tin nhắn "user" nhưng thực ra là wrapper hệ thống, không phải người gõ. */
const SYNTHETIC_PREFIXES = ["<local-command-", "<command-name>", "<system-reminder>"];

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b): b is { type: string; text: string } =>
        typeof b === "object" && b !== null && (b as { type?: unknown }).type === "text",
    )
    .map((b) => b.text)
    .join("\n");
}

function pushUnique(list: string[], seen: Set<string>, value: string): void {
  if (!value || seen.has(value)) return;
  seen.add(value);
  list.push(value);
}

/**
 * Đọc transcript JSONL (định dạng bản ghi phiên của Claude Code) và trích ra
 * đúng những gì THẬT SỰ xảy ra. Dòng hỏng bị bỏ qua, không làm sập — giống
 * cách đọc sổ cái xác minh.
 */
export function parseTranscript(raw: string): TranscriptSummary {
  const userMessages: string[] = [];
  const filesWritten: string[] = [];
  const filesRead: string[] = [];
  const commandsRun: string[] = [];
  const seenWritten = new Set<string>();
  const seenRead = new Set<string>();
  const seenCommands = new Set<string>();
  const toolCounts: Record<string, number> = {};
  let startedAt: string | undefined;
  let endedAt: string | undefined;
  let turnCount = 0;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const timestamp = typeof obj["timestamp"] === "string" ? obj["timestamp"] : undefined;
    if (timestamp) {
      if (!startedAt || timestamp < startedAt) startedAt = timestamp;
      if (!endedAt || timestamp > endedAt) endedAt = timestamp;
    }

    if (obj["type"] !== "user" && obj["type"] !== "assistant") continue;
    const message = obj["message"] as { content?: unknown } | undefined;
    if (!message) continue;
    turnCount++;

    if (obj["type"] === "user") {
      if (obj["isMeta"] === true) continue;
      const text = textOf(message.content).trim();
      if (!text || SYNTHETIC_PREFIXES.some((p) => text.startsWith(p))) continue;
      userMessages.push(text.replace(/\s*\n\s*/g, " "));
      continue;
    }

    // assistant: chỉ lấy tool_use — KHÔNG lấy "text". Văn xuôi của model
    // không được coi là tri thức của phiên, dù có trích nguyên văn hay không.
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (typeof block !== "object" || block === null) continue;
      const b = block as Record<string, unknown>;
      if (b["type"] !== "tool_use") continue;
      const name = typeof b["name"] === "string" ? b["name"] : "?";
      toolCounts[name] = (toolCounts[name] ?? 0) + 1;

      const input = b["input"] as Record<string, unknown> | undefined;
      const filePath = input?.["file_path"];
      const command = input?.["command"];
      if (WRITE_TOOL_NAMES.has(name) && typeof filePath === "string") {
        pushUnique(filesWritten, seenWritten, filePath);
      } else if (name === "Read" && typeof filePath === "string") {
        pushUnique(filesRead, seenRead, filePath);
      } else if ((name === "Bash" || name === "PowerShell") && typeof command === "string") {
        pushUnique(commandsRun, seenCommands, command);
      }
    }
  }

  return {
    startedAt,
    endedAt,
    turnCount,
    userMessages,
    filesWritten,
    filesRead,
    commandsRun,
    toolCounts,
  };
}

/* ------------------------------------------------------------------------- *
 * Dựng nội dung handoff
 * ------------------------------------------------------------------------- */

function bulletOrNote(items: string[], note: string): string {
  return items.length ? items.map((i) => `- ${i}`).join("\n") : note;
}

export function renderHandoff(args: {
  sessionId: string;
  task: Task;
  gate: GateResult;
  graph: Graph;
  transcript: TranscriptSummary | null;
}): string {
  const { sessionId, task, gate, graph, transcript: t } = args;

  const claims = [...graph.claims.values()]
    .filter((c) => c.value.source_session === sessionId)
    .map((c) => `\`${c.value.id}\` — ${c.value.statement} (${c.value.trust})`);
  const facts = [...graph.facts.values()]
    .filter((f) => f.value.verified_by === sessionId)
    .map((f) => `\`${f.value.id}\` — ${f.value.statement} (${f.value.last_result})`);

  const head = [`# Handoff — ${sessionId}`, "", `- task: \`${task.id}\` — ${task.title}`];
  if (t?.startedAt) head.push(`- bắt đầu: ${t.startedAt}`);
  if (t?.endedAt) head.push(`- kết thúc: ${t.endedAt}`);
  head.push(`- ${t?.turnCount ?? 0} lượt trong transcript`);

  const actions = [
    t && t.filesWritten.length
      ? `- Sửa/tạo: ${t.filesWritten.map((f) => `\`${f}\``).join(", ")}`
      : "- (không có file nào bị sửa)",
  ];
  if (t && t.commandsRun.length) {
    actions.push(`- Lệnh đã chạy: ${t.commandsRun.map((c) => `\`${c}\``).join(", ")}`);
  }

  const lines: string[] = [
    ...head,
    "",
    "## Yêu cầu trong phiên (nguyên văn người dùng, trích từ transcript)",
    "",
    bulletOrNote(
      t?.userMessages ?? [],
      t
        ? "(không có tin nhắn nào ngoài lệnh hệ thống)"
        : "(không đọc được transcript của phiên này)",
    ),
    "",
    "## Hành động (trích cơ học từ transcript, không phải tường thuật)",
    "",
    actions.join("\n"),
    "",
    "## Tri thức đã ghi trong phiên (có bằng chứng, tra được trong .ganas/)",
    "",
    bulletOrNote([...facts, ...claims], "(không có fact/claim nào gắn với phiên này)"),
  ];

  if (task.context_contract.open_questions.length > 0) {
    lines.push("", "## Câu hỏi còn mở", "", bulletOrNote(task.context_contract.open_questions, ""));
  }

  lines.push("", `## Điều kiện hoàn thành của ${task.id}`, "", formatGate(gate));

  return lines.join("\n") + "\n";
}

/* ------------------------------------------------------------------------- *
 * Ghi file
 * ------------------------------------------------------------------------- */

export interface HandoffResult {
  path: string;
  content: string;
}

export function runsPath(root: string, sessionId: string): string {
  return ganasPath(root, DIRS.runs, `${sessionId}.md`);
}

/**
 * Sinh và ghi handoff cho một phiên. Không đọc được transcript (thiếu path,
 * hoặc file không còn) thì vẫn ghi — chỉ là thiếu phần trích transcript,
 * KHÔNG chặn. Handoff là tiện ích nối tiếp, không phải bằng chứng cần
 * append-only, nên ghi đè mỗi lần gọi là an toàn.
 */
export async function generateHandoff(
  root: string,
  graph: Graph,
  task: Task,
  gate: GateResult,
  opts: { sessionId: string; transcriptPath?: string | undefined },
): Promise<HandoffResult> {
  let transcript: TranscriptSummary | null = null;
  if (opts.transcriptPath && existsSync(opts.transcriptPath)) {
    try {
      transcript = parseTranscript(await readFile(opts.transcriptPath, "utf8"));
    } catch {
      transcript = null;
    }
  }

  const content = renderHandoff({ sessionId: opts.sessionId, task, gate, graph, transcript });
  const path = runsPath(root, opts.sessionId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return { path, content };
}
