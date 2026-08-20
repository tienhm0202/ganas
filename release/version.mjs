#!/usr/bin/env node
/**
 * Lệnh vận hành phát hành: MỘT chỗ biết version nằm ở đâu.
 *
 * Nguồn sự thật duy nhất là `package.json`. Số hiệu còn được khai lại ở bốn chỗ
 * nữa — `package-lock.json`, `plugin/.claude-plugin/plugin.json`, tiêu đề trên
 * cùng của `CHANGELOG.md`, và `__GANAS_VERSION__` nhúng vào `plugin/dist/*`
 * lúc build. Trước file này không lệnh nào bắt chúng khớp, nên lệch là IM
 * LẶNG: bản cài qua marketplace vẫn chạy, chỉ khai sai số hiệu.
 *
 * Dùng:
 *   node release/version.mjs check          # báo lệch, không sửa gì (exit 1)
 *   node release/version.mjs sync           # ghi manifest plugin theo package.json
 *   node release/version.mjs stamp          # "Chưa phát hành" → "vX.Y.Z — hôm nay"
 *   node release/version.mjs bump <minor>   # nâng version: test → sync → build → commit → tag
 *
 * Người chỉ cần nhớ `bump`. `check` và `sync` an toàn chạy lúc nào cũng được;
 * `stamp` thì KHÔNG — nó chỉ đúng ngay sau khi package.json vừa được bump, nên
 * chỉ lifecycle `version` của npm gọi nó.
 *
 * `bump` gọi thẳng `npm version`, không tự viết lại logic của nó: npm đã lo
 * package.json + package-lock + commit + tag `vX.Y.Z`, và chạy lifecycle
 * `preversion`/`version` khai trong package.json — vốn trỏ ngược về đúng file
 * này. Viết tay một bản thay thế là tạo con đường thứ hai để lệch.
 *
 * Lớp cưỡng chế nằm ở `release/version.test.ts`, chạy trong `npm test`.
 */
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const ROOT = new URL("../", import.meta.url);
const UNRELEASED = "## Chưa phát hành";
const MANIFEST = "plugin/.claude-plugin/plugin.json";

const read = (rel) => readFile(new URL(rel, ROOT), "utf8");

export async function projectVersion() {
  return JSON.parse(await read("package.json")).version;
}

/** Ghi `version` vào manifest plugin. Trả về true nếu file thật sự đổi. */
export async function syncPluginManifest(version) {
  const raw = await read(MANIFEST);
  if (JSON.parse(raw).version === version) return false;

  // Sửa theo DÒNG chứ không JSON.stringify lại cả file: manifest do người viết,
  // ghi đè bằng serializer là đổi thứ tự khoá và nuốt định dạng của họ.
  const next = raw.replace(
    /^(\s*"version"\s*:\s*)"[^"]*"/m,
    (_m, head) => `${head}${JSON.stringify(version)}`,
  );
  if (next === raw) {
    throw new Error(`không tìm thấy trường "version" trong ${MANIFEST} — sửa tay rồi chạy lại`);
  }
  await writeFile(new URL(MANIFEST, ROOT), next, "utf8");
  return true;
}

/**
 * Đổi tiêu đề "Chưa phát hành" thành `## vX.Y.Z — <ngày>`.
 *
 * Vì sao phải có mục "Chưa phát hành": tiêu đề CHANGELOG là chỗ DUY NHẤT không
 * suy được từ package.json, vì phần thân do người viết trong lúc làm — trước
 * lúc biết số phát hành. Bắt người viết gõ thẳng `## v0.6.0` thì suốt quãng
 * giữa hai lần release, CHANGELOG và package.json lệch nhau một cách HỢP LỆ,
 * và không test nào phân biệt được lệch hợp lệ với lệch do quên bump.
 */
export async function stampChangelog(version, today) {
  const raw = await read("CHANGELOG.md");
  if (!raw.includes(`${UNRELEASED}\n`)) return false;

  // Chặn đóng dấu HAI LẦN cùng một số: chạy `stamp` giữa chừng (không phải
  // ngay sau bump) sẽ nuốt mục "Chưa phát hành" đang viết dở vào một version
  // đã phát hành rồi, và CHANGELOG có hai mục cùng số mà không ai báo gì.
  if (new RegExp(`^## v${version.replace(/\./g, "\\.")}\\b`, "m").test(raw)) {
    throw new Error(
      `CHANGELOG đã có mục \`## v${version}\` — version này phát hành rồi.\n` +
        `  "Chưa phát hành" là của bản KẾ TIẾP: nâng số trước (\`bump\`), rồi mới đóng dấu.`,
    );
  }
  await writeFile(
    new URL("CHANGELOG.md", ROOT),
    raw.replace(`${UNRELEASED}\n`, `## v${version} — ${today}\n`),
    "utf8",
  );
  return true;
}

async function cmdCheck() {
  const version = await projectVersion();
  const manifest = JSON.parse(await read(MANIFEST)).version;
  if (manifest !== version) {
    console.error(
      `${MANIFEST} khai ${manifest} còn package.json khai ${version}.\n` +
        `  Chạy: node release/version.mjs sync`,
    );
    return 1;
  }
  console.log(`version khớp: ${version}`);
  return 0;
}

async function cmdSync() {
  const version = await projectVersion();
  const wrote = await syncPluginManifest(version);
  console.log(`version ${version}` + (wrote ? ` · đã ghi ${MANIFEST}` : " · manifest đã khớp"));
  return 0;
}

async function cmdStamp() {
  const version = await projectVersion();
  const today = new Date().toISOString().slice(0, 10);
  const stamped = await stampChangelog(version, today);
  console.log(
    stamped
      ? `CHANGELOG: "${UNRELEASED}" → "## v${version} — ${today}"`
      : `CHANGELOG không có mục "${UNRELEASED}" — không đóng dấu gì`,
  );
  return 0;
}

function cmdBump(bump) {
  if (!bump) {
    console.error(
      "thiếu mức nâng. Dùng: node release/version.mjs bump <patch|minor|major|X.Y.Z>\n" +
        "  Đây là lệnh DUY NHẤT nên dùng để nâng version — nó chạy test, đồng bộ\n" +
        "  mọi chỗ khai lại số hiệu, build lại bundle, rồi tạo commit + tag vX.Y.Z.",
    );
    return 1;
  }
  // Không tự tạo commit/tag ở đây: `npm version` đã làm đúng việc đó và còn
  // chạy lifecycle `preversion`/`version` — xem package.json.
  const r = spawnSync("npm", ["version", bump], {
    cwd: new URL(".", ROOT).pathname,
    stdio: "inherit",
  });
  return r.status ?? 1;
}

const [cmd, arg] = process.argv.slice(2);
const isDirectRun =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

async function run() {
  const code =
    cmd === "check"
      ? await cmdCheck()
      : cmd === "sync"
        ? await cmdSync()
        : cmd === "stamp"
          ? await cmdStamp()
          : cmd === "bump"
            ? cmdBump(arg)
            : (console.error(
                `lệnh "${cmd ?? ""}" không có. Dùng: check | sync | stamp | bump <patch|minor|major|X.Y.Z>`,
              ),
              1);
  return code;
}

if (isDirectRun) {
  // Lỗi ở đây là lỗi VẬN HÀNH của người đang gõ lệnh, không phải bug — in một
  // dòng đọc được thay vì stack trace của node.
  try {
    process.exit(await run());
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
