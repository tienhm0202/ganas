import assert from "node:assert/strict";
import { test } from "node:test";

import * as gate from "../src/commands/gate.js";
import { bindSession } from "../src/state.js";
import { cleanup, design, goal, makeProject, moduleYaml, scope, task } from "./helpers.js";

/**
 * T-096 (sửa ICE-033): cảnh báo giao việc ("... khai tier `scribe`/`verifier`
 * nhưng cả phiên không có lượt sửa nào từ sub-agent") chỉ có nghĩa khi TASK
 * ĐANG CHẤM đúng là task mà phiên này đã **bind** vào. Chấm gate cho một task
 * ĐI NGANG — phiên bind vào task khác — thì ganas không biết gì về việc giao
 * sub-agent cho task đó, nên phải im, không được đoán.
 *
 * Chỗ sai KHÔNG nằm ở `subagentTouchedFor` (nó trả `false` cho task đi ngang
 * một cách có chủ ý, xem docstring trong `src/state.ts`) — chỗ sai là nơi gọi
 * ở `src/commands/gate.ts`, phát cảnh báo bất kể có đúng là task phiên bind
 * vào hay không.
 */

const TASK_TIER = (id: string) =>
  task(id, {
    extra: "model: scribe\n",
  });

async function project(): Promise<string> {
  return makeProject({
    ".ganas/goals/G-001.yaml": goal(),
    ".ganas/scopes/P-thu.yaml": scope(),
    ".ganas/modules/M-a.yaml": moduleYaml(),
    ".ganas/designs/D-001.yaml": design(),
    ".ganas/tasks/T-001.yaml": TASK_TIER("T-001"),
    ".ganas/tasks/T-002.yaml": TASK_TIER("T-002"),
  });
}

async function runGateCaptured(argv: Parameters<typeof gate.run>[0]): Promise<string> {
  const out: string[] = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await gate.run(argv);
  } finally {
    process.stdout.write = write;
  }
  return out.join("");
}

const DISPATCH_WARNING_RE = /cả phiên không có lượt sửa nào từ sub-agent/;

test("⭐ [hồi quy] gate chấm ĐÚNG task phiên bind vào ⇒ cảnh báo giao việc vẫn nổ", async () => {
  const root = await project();
  try {
    await bindSession(root, "s1", "T-001");

    const text = await runGateCaptured({
      positional: ["T-001"],
      options: { root, session: "s1" },
      flags: {},
      passthrough: [],
    });

    assert.match(
      text,
      DISPATCH_WARNING_RE,
      `chấm đúng task phiên bind vào, tier scribe, chưa sub-agent nào sửa ⇒ phải cảnh báo. Đã in:\n${text}`,
    );
  } finally {
    await cleanup(root);
  }
});

test("gate chấm task ĐI NGANG — khác task phiên bind vào ⇒ im lặng, không đoán", async () => {
  const root = await project();
  try {
    // Phiên s1 bind vào T-001, nhưng lệnh gate lại chấm T-002 — đúng ca ngày
    // 2026-09-05: phiên chính bind T-080 rồi chấm gate T-083/T-084/....
    await bindSession(root, "s1", "T-001");

    const text = await runGateCaptured({
      positional: ["T-002"],
      options: { root, session: "s1" },
      flags: {},
      passthrough: [],
    });

    assert.doesNotMatch(
      text,
      DISPATCH_WARNING_RE,
      `T-002 không phải task phiên s1 bind vào — ganas không biết gì về việc giao sub-agent cho nó, phải im. Đã in:\n${text}`,
    );
  } finally {
    await cleanup(root);
  }
});

test("gate không có --session (không phiên nào để nói 'đã bind') ⇒ im lặng, không rơi về hành vi cũ", async () => {
  const root = await project();
  try {
    const text = await runGateCaptured({
      positional: ["T-001"],
      options: { root },
      flags: {},
      passthrough: [],
    });

    assert.doesNotMatch(
      text,
      DISPATCH_WARNING_RE,
      `không có session thì không có phiên nào để khẳng định "đã bind vào T-001". Đã in:\n${text}`,
    );
  } finally {
    await cleanup(root);
  }
});
