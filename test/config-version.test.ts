import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { loadGraph } from "../src/graph/load.js";
import { LATEST_SCHEMA_VERSION, zConfig } from "../src/model/index.js";
import { GanasError } from "../src/util/errors.js";
import { cleanup, makeProject } from "./helpers.js";

/**
 * Phiên bản schema `.ganas/` là thứ quyết định độ nghiêm của luật (v1 cảnh báo,
 * v2 chặn). Vì vậy nó phải mở được lên trước khi có luật nào dựa vào nó, và
 * phải từ chối version tương lai bằng thông điệp nói đúng việc cần làm.
 */

async function withConfig<T>(yaml: string, fn: (root: string) => Promise<T>): Promise<T> {
  const root = await makeProject({});
  try {
    await writeFile(join(root, ".ganas", "config.yaml"), yaml, "utf8");
    return await fn(root);
  } finally {
    await cleanup(root);
  }
}

test("config không khai version mặc định về 1 — dự án cũ không phải sửa gì", () => {
  const parsed = zConfig.parse({ project: "x" });
  assert.equal(parsed.version, 1);
});

test("version hiện hành hợp lệ", () => {
  assert.equal(
    zConfig.parse({ project: "x", version: LATEST_SCHEMA_VERSION }).version,
    LATEST_SCHEMA_VERSION,
  );
});

test("version 0 và version không phải số bị từ chối", () => {
  assert.equal(zConfig.safeParse({ project: "x", version: 0 }).success, false);
  assert.equal(zConfig.safeParse({ project: "x", version: "1" }).success, false);
});

test("⭐ version tương lai báo 'nâng cấp ganas', không phải 'config không hợp lệ'", async () => {
  const future = LATEST_SCHEMA_VERSION + 1;
  await withConfig(`version: ${future}\nproject: "tuong-lai"\n`, async (root) => {
    await assert.rejects(
      async () => loadGraph(root),
      (err: unknown) => {
        assert.ok(err instanceof GanasError, "phải là GanasError, không phải lỗi zod trần");
        assert.match(err.message, /nâng cấp ganas/, "phải nói thẳng việc cần làm");
        assert.match(err.message, new RegExp(`v${future}`), "phải nêu version của dự án");
        assert.doesNotMatch(
          err.message,
          /config không hợp lệ/,
          "đừng đổ lỗi cho file của người dùng",
        );
        return true;
      },
    );
  });
});

test("lỗi config khác version vẫn giữ thông điệp cũ", async () => {
  await withConfig(`version: 1\nproject: ""\n`, async (root) => {
    await assert.rejects(
      async () => loadGraph(root),
      (err: unknown) => {
        assert.ok(err instanceof GanasError);
        assert.match(err.message, /config không hợp lệ/);
        return true;
      },
    );
  });
});
