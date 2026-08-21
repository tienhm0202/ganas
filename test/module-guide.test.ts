import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { run as runScope } from "../src/commands/scope.js";
import { moduleGuideMd } from "../src/templates/project.js";
import type { Argv } from "../src/util/args.js";
import { cleanup, makeProject, validSpine } from "./helpers.js";

/**
 * Tài liệu vùng nằm TRONG thư mục code: khung (`moduleGuideMd`) và chỗ sinh ra
 * nó (`ganas scope new`).
 */

async function captureStdout<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: unknown }).write = (): boolean => true;
  try {
    return await fn();
  } finally {
    (process.stdout as { write: unknown }).write = original;
  }
}

function argv(root: string, options: Record<string, string>): Argv {
  return {
    positional: ["new"],
    options: { root, ...options },
    multi: {},
    flags: { yes: true },
    passthrough: [],
  };
}

const guideOf = (dir: string): string =>
  moduleGuideMd({ id: "M-a", title: "Khối thử", dir, nature: "code", probes: [] });

/* --- Khung: một chiều, không mời chép lại luật gốc ------------------------- */

test("khung có đủ bốn mục mà luật agent-guide đòi", () => {
  const md = guideOf("src/vung-a");
  for (const heading of ["## Cổng vào", "## Bất biến dễ phá", "## Cạm bẫy đã trả giá", "## Chạy test riêng của vùng"]) {
    assert.match(md, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `thiếu mục ${heading}`);
  }
});

test("khung KHÔNG có mục nào mời chép lại tổng quan dự án hay quy ước chung", () => {
  // Đây là chỗ cấu trúc mất một chiều: file khối chép lại file gốc thì sinh ra
  // bản thứ hai, và bản thứ hai luôn lỗi thời trước.
  const md = guideOf("src/vung-a");
  for (const forbidden of ["## Tổng quan", "## Quy ước chung", "## Danh sách file", "## Kiến trúc dự án"]) {
    assert.doesNotMatch(md, new RegExp(forbidden), `khung không được có mục "${forbidden}"`);
  }
});

test("khối io được nói thẳng nó là chỗ chạm ra ngoài; khối lõi thì ngược lại", () => {
  const io = moduleGuideMd({ id: "M-a", title: "x", dir: "src/a", nature: "io", probes: [] });
  const core = moduleGuideMd({ id: "M-a", title: "x", dir: "src/a", nature: "code", probes: [] });
  assert.match(io, /nơi chạm ra ngoài thật/);
  assert.match(core, /\*\*lõi\*\*/);
});

test("khối chưa có probe thì khung nói thẳng là chưa có, không bịa lệnh test", () => {
  assert.match(guideOf("src/a"), /chưa khai probe nào/);
});

/* --- `ganas scope new` sinh khung ----------------------------------------- */

test("scope new: khối nhận cả thư mục ĐÃ TỒN TẠI → sinh khung file hướng dẫn", async () => {
  const root = await makeProject(validSpine());
  try {
    await mkdir(join(root, "src", "thanh-toan"), { recursive: true });
    await writeFile(join(root, "src", "thanh-toan", "index.ts"), "export const x = 1;\n", "utf8");

    await captureStdout(() =>
      runScope(
        argv(root, {
          title: "Thanh toán",
          paths: "src/thanh-toan/**",
          accept: "npm test",
          owner: "@nguoi-duyet",
          id: "P-thanh-toan",
        }),
      ),
    );

    const guide = join(root, "src", "thanh-toan", "CLAUDE.md");
    assert.ok(existsSync(guide), "phải sinh CLAUDE.md trong thư mục của khối");
    const body = await readFile(guide, "utf8");
    assert.match(body, /M-thanh-toan/);
    assert.match(body, /## Cổng vào/);
  } finally {
    await cleanup(root);
  }
});

test("scope new: KHÔNG đè file hướng dẫn viết tay đã có", async () => {
  const root = await makeProject(validSpine());
  try {
    await mkdir(join(root, "src", "thanh-toan"), { recursive: true });
    await writeFile(join(root, "src", "thanh-toan", "index.ts"), "export const x = 1;\n", "utf8");
    await writeFile(join(root, "src", "thanh-toan", "CLAUDE.md"), "# viết tay, đừng đè\n", "utf8");

    await captureStdout(() =>
      runScope(
        argv(root, {
          title: "Thanh toán",
          paths: "src/thanh-toan/**",
          accept: "npm test",
          owner: "@nguoi-duyet",
          id: "P-thanh-toan",
        }),
      ),
    );

    const body = await readFile(join(root, "src", "thanh-toan", "CLAUDE.md"), "utf8");
    assert.equal(body, "# viết tay, đừng đè\n");
  } finally {
    await cleanup(root);
  }
});

test("scope new: thư mục CHƯA tồn tại thì không bày ra cây rỗng chỉ để chứa file TODO", async () => {
  const root = await makeProject(validSpine());
  try {
    await captureStdout(() =>
      runScope(
        argv(root, {
          title: "Chưa có code",
          paths: "src/chua-co/**",
          accept: "npm test",
          owner: "@nguoi-duyet",
          id: "P-chua-co",
        }),
      ),
    );
    assert.ok(!existsSync(join(root, "src", "chua-co")), "không được tạo thư mục rỗng");
  } finally {
    await cleanup(root);
  }
});

test("scope new: khối chỉ trỏ file lẻ thì không sinh gì", async () => {
  const root = await makeProject(validSpine());
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "le.ts"), "export const x = 1;\n", "utf8");

    await captureStdout(() =>
      runScope(
        argv(root, {
          title: "File lẻ",
          paths: "src/le.ts",
          accept: "npm test",
          owner: "@nguoi-duyet",
          id: "P-le",
        }),
      ),
    );
    assert.ok(!existsSync(join(root, "src", "CLAUDE.md")), "không được đặt file hướng dẫn ở thư mục dùng chung");
  } finally {
    await cleanup(root);
  }
});
