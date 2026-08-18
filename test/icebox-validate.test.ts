import assert from "node:assert/strict";
import { test } from "node:test";

import { loadGraph } from "../src/graph/load.js";
import { validateGraph } from "../src/graph/validate.js";
import { cleanup, makeProject, validSpine } from "./helpers.js";

/**
 * Ba luật validate mới cho Icebox (`src/graph/validate.ts`, khối sau `claim`):
 * `icebox/promoted-missing-task`, `icebox/review-overdue`,
 * `icebox/without-scope`.
 *
 * `review-overdue` phụ thuộc đồng hồ — MỌI test ở đây ghim `now` qua
 * `validateGraph(graph, { now })`, không phụ thuộc `Date.now()` thật (xem doc
 * comment của `validateGraph`).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const FOUND_AT = "2026-01-01T00:00:00Z";
const FOUND_AT_MS = Date.parse(FOUND_AT);
const REVIEW_AFTER_DAYS = 30;
const DEADLINE_MS = FOUND_AT_MS + REVIEW_AFTER_DAYS * DAY_MS;

/** Ghi giả định NOW không vượt CLOCK_SKEW so với found_at (zIcebox chặn found_at ở tương lai so với Date.now() thật lúc parse). */

interface IceboxOpts {
  status?: "open" | "closed" | "promoted";
  scope?: string;
  promotedTo?: string;
  foundAt?: string;
  reviewAfterDays?: number;
  extra?: string;
}

/** Một bản ghi icebox tối thiểu hợp lệ theo `zIcebox`, dạng phần tử mảng YAML. */
function iceboxRecord(id: string, opts: IceboxOpts = {}): string {
  const status = opts.status ?? "open";
  const lines = [
    `- id: ${id}`,
    `  title: "Icebox ${id}"`,
    `  found_at: "${opts.foundAt ?? FOUND_AT}"`,
    `  review_after_days: ${opts.reviewAfterDays ?? REVIEW_AFTER_DAYS}`,
    `  weight: 3`,
    `  ease: 3`,
    `  why_deferred: "chưa tới lượt làm"`,
    `  anchors:`,
    `    - "src/debt.ts#L1"`,
    `  status: ${status}`,
  ];
  if (opts.scope) lines.push(`  scope: ${opts.scope}`);
  if (status === "closed") {
    lines.push(`  closed_at: "2026-02-01T00:00:00Z"`, `  closed_reason: "không còn cần nữa"`);
  } else if (status === "promoted") {
    lines.push(`  closed_at: "2026-02-01T00:00:00Z"`, `  promoted_to: ${opts.promotedTo ?? "T-001"}`);
  }
  if (opts.extra) lines.push(opts.extra);
  return lines.join("\n");
}

function iceboxFile(records: string[]): string {
  return records.join("\n") + "\n";
}

/* --- icebox/promoted-missing-task ------------------------------------------- */

test("promoted_to trỏ task có thật → không diagnostic", async () => {
  const files = validSpine();
  files[".ganas/icebox/2026-01.yaml"] = iceboxFile([
    iceboxRecord("ICE-001", { status: "promoted", promotedTo: "T-001" }),
  ]);
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    const codes = validateGraph(graph, { now: FOUND_AT_MS }).map((d) => d.code);
    assert.ok(
      !codes.includes("icebox/promoted-missing-task"),
      `không mong đợi lỗi khi promoted_to trỏ task có thật: ${JSON.stringify(codes)}`,
    );
  } finally {
    await cleanup(root);
  }
});

test("promoted_to trỏ task ma → icebox/promoted-missing-task", async () => {
  const files = validSpine();
  files[".ganas/icebox/2026-01.yaml"] = iceboxFile([
    iceboxRecord("ICE-002", { status: "promoted", promotedTo: "T-999" }),
  ]);
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    const diags = validateGraph(graph, { now: FOUND_AT_MS });
    const err = diags.find((d) => d.code === "icebox/promoted-missing-task");
    assert.ok(err, `phải bắt được task ma: ${JSON.stringify(diags.map((d) => d.code))}`);
    assert.equal(err.severity, "error");
    assert.match(err.message, /T-999/);
    assert.equal(err.file, ".ganas/icebox/2026-01.yaml");
    assert.equal(typeof err.line, "number", "diagnostic phải có số dòng để sửa được ngay");
  } finally {
    await cleanup(root);
  }
});

/* --- icebox/review-overdue: hai phía biên --------------------------------- */

test("review-overdue: found_at + review_after_days VỪA CHƯA qua now → im lặng", async () => {
  const files = validSpine();
  files[".ganas/icebox/2026-01.yaml"] = iceboxFile([iceboxRecord("ICE-003", { status: "open" })]);
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    const codes = validateGraph(graph, { now: DEADLINE_MS - 1 }).map((d) => d.code);
    assert.ok(!codes.includes("icebox/review-overdue"), `chưa tới hạn thì phải im: ${JSON.stringify(codes)}`);
  } finally {
    await cleanup(root);
  }
});

test("review-overdue: found_at + review_after_days VỪA qua now → báo, kèm đúng số ngày", async () => {
  const files = validSpine();
  files[".ganas/icebox/2026-01.yaml"] = iceboxFile([iceboxRecord("ICE-004", { status: "open" })]);
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    const diags = validateGraph(graph, { now: DEADLINE_MS });
    const err = diags.find((d) => d.code === "icebox/review-overdue");
    assert.ok(err, `vừa tới hạn phải báo: ${JSON.stringify(diags.map((d) => d.code))}`);
    assert.equal(err.severity, "warning");
    assert.match(err.message, /30 ngày/, `thông điệp phải nêu đúng số ngày: "${err.message}"`);
  } finally {
    await cleanup(root);
  }
});

test("review-overdue: KHÔNG báo cho bản ghi closed dù đã quá hạn từ lâu", async () => {
  const files = validSpine();
  files[".ganas/icebox/2026-01.yaml"] = iceboxFile([iceboxRecord("ICE-005", { status: "closed" })]);
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    const codes = validateGraph(graph, { now: DEADLINE_MS + 365 * DAY_MS }).map((d) => d.code);
    assert.ok(!codes.includes("icebox/review-overdue"), `closed không còn là nợ: ${JSON.stringify(codes)}`);
  } finally {
    await cleanup(root);
  }
});

test("review-overdue: KHÔNG báo cho bản ghi promoted dù đã quá hạn từ lâu", async () => {
  const files = validSpine();
  files[".ganas/icebox/2026-01.yaml"] = iceboxFile([
    iceboxRecord("ICE-006", { status: "promoted", promotedTo: "T-001" }),
  ]);
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    const codes = validateGraph(graph, { now: DEADLINE_MS + 365 * DAY_MS }).map((d) => d.code);
    assert.ok(!codes.includes("icebox/review-overdue"), `promoted không còn là nợ: ${JSON.stringify(codes)}`);
  } finally {
    await cleanup(root);
  }
});

/* --- icebox/without-scope --------------------------------------------------- */

test("without-scope: mục open thiếu scope → báo", async () => {
  const files = validSpine();
  files[".ganas/icebox/2026-01.yaml"] = iceboxFile([iceboxRecord("ICE-007", { status: "open" })]);
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    const diags = validateGraph(graph, { now: FOUND_AT_MS });
    const err = diags.find((d) => d.code === "icebox/without-scope");
    assert.ok(err, `open thiếu scope phải báo: ${JSON.stringify(diags.map((d) => d.code))}`);
    assert.equal(err.severity, "warning");
  } finally {
    await cleanup(root);
  }
});

test("without-scope: mục open có scope → im lặng", async () => {
  const files = validSpine();
  files[".ganas/icebox/2026-01.yaml"] = iceboxFile([
    iceboxRecord("ICE-008", { status: "open", scope: "P-thu" }),
  ]);
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    const codes = validateGraph(graph, { now: FOUND_AT_MS }).map((d) => d.code);
    assert.ok(!codes.includes("icebox/without-scope"), `có scope thì phải im: ${JSON.stringify(codes)}`);
  } finally {
    await cleanup(root);
  }
});

test("without-scope: mục closed thiếu scope → im lặng — đã đóng thì không còn là nợ", async () => {
  const files = validSpine();
  files[".ganas/icebox/2026-01.yaml"] = iceboxFile([iceboxRecord("ICE-009", { status: "closed" })]);
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    const codes = validateGraph(graph, { now: FOUND_AT_MS }).map((d) => d.code);
    assert.ok(!codes.includes("icebox/without-scope"), `closed không còn là nợ: ${JSON.stringify(codes)}`);
  } finally {
    await cleanup(root);
  }
});

/* --- file:line trỏ đúng bản ghi thứ hai trong file mảng --------------------- */

test("diagnostic trỏ đúng file, và line hợp lý cho bản ghi thứ hai trong file mảng", async () => {
  const files = validSpine();
  files[".ganas/icebox/2026-01.yaml"] = iceboxFile([
    iceboxRecord("ICE-010", { status: "open", scope: "P-thu" }), // bản ghi thứ nhất: hợp lệ, không báo gì
    iceboxRecord("ICE-011", { status: "open" }), // bản ghi thứ hai: thiếu scope → phải báo, line > 1
  ]);
  const root = await makeProject(files);
  try {
    const graph = await loadGraph(root);
    const diags = validateGraph(graph, { now: FOUND_AT_MS });
    const err = diags.find((d) => d.code === "icebox/without-scope");
    assert.ok(err, `bản ghi thứ hai thiếu scope phải báo: ${JSON.stringify(diags.map((d) => d.code))}`);
    assert.equal(err.file, ".ganas/icebox/2026-01.yaml");
    assert.equal(typeof err.line, "number");
    assert.ok(err.line! > 1, `bản ghi thứ hai không thể ở dòng 1, nhận được ${err.line}`);
    // Diagnostic không được lẫn sang bản ghi thứ nhất (ICE-010, có scope).
    assert.ok(
      !diags.some((d) => d.code === "icebox/without-scope" && d.message.includes("ICE-010")),
      "bản ghi thứ nhất có scope, không được bị báo",
    );
  } finally {
    await cleanup(root);
  }
});
