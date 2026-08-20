import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { runShell } from "../src/util/exec.js";
import { cleanup } from "../test/helpers.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * VERSION CHỈ CÓ MỘT NGUỒN: `package.json`.
 *
 * Trước test này, số hiệu được khai ở bốn chỗ độc lập — `package.json`,
 * `package-lock.json`, `plugin/.claude-plugin/plugin.json`, tiêu đề CHANGELOG —
 * cộng một chỗ thứ năm nhúng lúc build (`__GANAS_VERSION__` trong
 * `plugin/dist/cli.js`). Không lệnh nào bắt chúng khớp, nên lệch là IM LẶNG:
 * bản cài qua marketplace vẫn chạy, chỉ khai sai số hiệu — và người báo lỗi sẽ
 * báo kèm một số version không tồn tại.
 *
 * `scripts/sync-version.mjs` sinh lại những chỗ suy được. Test này là lớp cưỡng
 * chế: chỗ nào không sinh được, hoặc sinh rồi mà quên build, thì `npm test` đỏ.
 */

async function readJson(rel: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(ROOT, rel), "utf8")) as Record<string, unknown>;
}

async function projectVersion(): Promise<string> {
  const v = (await readJson("package.json"))["version"];
  assert.equal(typeof v, "string", "package.json phải khai version");
  return v as string;
}

test("version: manifest plugin khớp package.json", async () => {
  const version = await projectVersion();
  const manifest = await readJson("plugin/.claude-plugin/plugin.json");

  assert.equal(
    manifest["version"],
    version,
    "plugin.json là số marketplace đọc — lệch thì bản cài mang số khác bản npm. " +
      "Chạy `node scripts/sync-version.mjs` (hoặc `npm run build`).",
  );
});

test("version: package-lock khớp package.json ở cả hai chỗ nó khai", async () => {
  const version = await projectVersion();
  const lock = await readJson("package-lock.json");
  const packages = lock["packages"] as Record<string, { version?: string }> | undefined;

  assert.equal(lock["version"], version, "package-lock.json lệch — chạy `npm install`");
  assert.equal(
    packages?.[""]?.version,
    version,
    'package-lock.json packages[""] lệch — chạy `npm install`',
  );
});

test("⭐ version: bundle đã build khai đúng số — bắt được lỗi 'quên npm run build'", async () => {
  const version = await projectVersion();

  // Chạy CHÍNH file sẽ được ship, không import source: `__GANAS_VERSION__`
  // nhúng lúc build, nên đây là cách duy nhất thấy được số mà người dùng thấy.
  const out = await runShell(`node ${JSON.stringify(join(ROOT, "plugin/dist/cli.js"))} --version`, {
    cwd: ROOT,
    timeoutMs: 20_000,
  });

  assert.equal(out.code, 0, `chạy bundle lỗi: ${out.stderr}`);
  assert.equal(
    out.stdout.trim(),
    version,
    "bundle trong plugin/dist/ còn mang số cũ — package.json đã bump mà chưa `npm run build`. " +
      "Đây là chỗ lệch nguy hiểm nhất: bản người dùng cài chạy bình thường, chỉ khai sai số.",
  );
});

test("version: tiêu đề trên cùng của CHANGELOG là 'Chưa phát hành' hoặc đúng version hiện tại", async () => {
  const version = await projectVersion();
  const changelog = await readFile(join(ROOT, "CHANGELOG.md"), "utf8");

  const firstHeading = /^## (.+)$/m.exec(changelog)?.[1];
  assert.ok(firstHeading, "CHANGELOG phải có ít nhất một mục `## ...`");

  // Hai trạng thái hợp lệ, không có trạng thái thứ ba. Đang làm dở thì mục trên
  // cùng là "Chưa phát hành"; vừa phát hành xong thì nó mang đúng số hiện tại.
  // Một số KHÁC ở trên cùng nghĩa là ai đó gõ tay số version — đúng thứ
  // `npm version` sinh ra để khỏi phải gõ.
  const released = new RegExp(`^v${version.replace(/\./g, "\\.")} — \\d{4}-\\d{2}-\\d{2}$`);
  assert.ok(
    firstHeading === "Chưa phát hành" || released.test(firstHeading),
    `tiêu đề trên cùng là "${firstHeading}" — phải là "Chưa phát hành" hoặc ` +
      `"v${version} — YYYY-MM-DD". Đừng gõ tay số: dùng \`npm version <bump>\`.`,
  );
});

test("version: version hiện tại đã có mục trong CHANGELOG", async () => {
  const version = await projectVersion();
  const changelog = await readFile(join(ROOT, "CHANGELOG.md"), "utf8");

  assert.ok(
    new RegExp(`^## v${version.replace(/\./g, "\\.")}\\b`, "m").test(changelog),
    `CHANGELOG không có mục \`## v${version}\` — bản đã phát hành mà không ai ghi nó thay đổi gì.`,
  );
});

test("version: tag trỏ vào HEAD (nếu có) phải là v<version>", async () => {
  const version = await projectVersion();
  const out = await runShell("git tag --points-at HEAD", { cwd: ROOT, timeoutMs: 10_000 });
  if (out.code !== 0) return; // không phải repo git (bản tarball) — không có gì để kiểm

  const versionTags = out.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^v\d+\.\d+\.\d+$/.test(l));

  for (const tag of versionTags) {
    assert.equal(
      tag,
      `v${version}`,
      `commit này mang tag ${tag} nhưng package.json khai ${version} — ` +
        `tag và version phải là một; \`npm version\` tạo cả hai cùng lúc.`,
    );
  }
});

test("version: npm version có lifecycle script đồng bộ, không dựa vào người nhớ", async () => {
  const pkg = await readJson("package.json");
  const scripts = pkg["scripts"] as Record<string, string>;

  assert.match(
    scripts["version"] ?? "",
    /release\/version\.mjs sync/,
    "`npm version` phải chạy `release/version.mjs sync`, nếu không thì bump xong manifest vẫn lệch",
  );
  assert.match(
    scripts["version"] ?? "",
    /release\/version\.mjs stamp/,
    '`npm version` phải đóng dấu CHANGELOG, nếu không mục "Chưa phát hành" nằm lại mãi',
  );
  assert.match(
    scripts["preversion"] ?? "",
    /test/,
    "phải chạy test TRƯỚC khi bump — tag đã đẩy đi thì không rút lại được",
  );
  assert.match(
    scripts["version"] ?? "",
    /build/,
    "`npm version` phải build lại, nếu không bundle đã ship mang số cũ",
  );
  assert.match(
    scripts["version"] ?? "",
    /git add/,
    "file sinh ra phải được git add, nếu không chúng nằm ngoài commit version (npm docs)",
  );
});

/* --- Chính lệnh vận hành --------------------------------------------------- */

const VERSION_CLI = JSON.stringify(join(ROOT, "release/version.mjs"));

test("release/version.mjs check: exit 0 khi mọi chỗ đã khớp", async () => {
  const out = await runShell(`node ${VERSION_CLI} check`, { cwd: ROOT, timeoutMs: 20_000 });

  assert.equal(out.code, 0, out.stderr);
  assert.match(out.stdout, /version khớp/);
});

/**
 * `stamp` GHI VÀO FILE, nên nó phải được thử trên một cây thư mục tạm — không
 * phải trên chính repo.
 *
 * Đây là lỗi đã xảy ra thật trong lúc dựng test này: bản đầu chạy `stamp` thẳng
 * trên repo, và khi version bị lệch (đúng tình huống test muốn dựng) thì hàng
 * rào không bắn, `stamp` đóng dấu thật, CHANGELOG của repo bị sửa. Một test làm
 * đổi trạng thái nó đang kiểm là test không kiểm được gì.
 *
 * `version.mjs` giải đường dẫn theo vị trí CHÍNH NÓ (`new URL("../", import.meta.url)`),
 * không theo cwd — nên fixture phải dựng lại đúng hình dạng cây thư mục.
 */
async function fixtureRepo(version: string, changelog: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ganas-release-"));
  await mkdir(join(dir, "release"), { recursive: true });
  await mkdir(join(dir, "plugin", ".claude-plugin"), { recursive: true });

  await cp(join(ROOT, "release/version.mjs"), join(dir, "release/version.mjs"));
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "x", version }, null, 2));
  await writeFile(join(dir, "CHANGELOG.md"), changelog);
  await writeFile(
    join(dir, "plugin/.claude-plugin/plugin.json"),
    JSON.stringify({ name: "x", version }, null, 2),
  );
  return dir;
}

const stampIn = (dir: string) =>
  runShell(`node ${JSON.stringify(join(dir, "release/version.mjs"))} stamp`, {
    cwd: dir,
    timeoutMs: 20_000,
  });

test("⭐ release/version.mjs stamp: đổi 'Chưa phát hành' thành đúng số + ngày", async () => {
  const dir = await fixtureRepo(
    "0.9.0",
    "# Changelog\n\n## Chưa phát hành\n\n- việc a\n\n## v0.8.0 — 2026-01-01\n",
  );
  try {
    const out = await stampIn(dir);
    assert.equal(out.code, 0, out.stderr);

    const changelog = await readFile(join(dir, "CHANGELOG.md"), "utf8");
    assert.match(changelog, /^## v0\.9\.0 — \d{4}-\d{2}-\d{2}$/m);
    assert.doesNotMatch(changelog, /Chưa phát hành/);
    assert.match(changelog, /- việc a/, "thân mục phải giữ nguyên, chỉ tiêu đề đổi");
  } finally {
    await cleanup(dir);
  }
});

test("⭐ release/version.mjs stamp: từ chối đóng dấu hai lần cùng một số", async () => {
  // Gọi `stamp` giữa chừng (không phải ngay sau bump) sẽ nuốt mục "Chưa phát
  // hành" đang viết dở vào một version đã phát hành rồi, và CHANGELOG có hai
  // mục cùng số mà không ai báo gì.
  const before = "# Changelog\n\n## Chưa phát hành\n\n- việc b\n\n## v0.9.0 — 2026-01-01\n";
  const dir = await fixtureRepo("0.9.0", before);
  try {
    const out = await stampIn(dir);

    assert.equal(out.code, 1, "phải từ chối, không im lặng đóng dấu đè");
    assert.match(out.stderr, /phát hành rồi/);
    assert.doesNotMatch(
      out.stderr,
      /node:internal/,
      "lỗi vận hành thì in một dòng, không phải stack trace",
    );
    assert.equal(await readFile(join(dir, "CHANGELOG.md"), "utf8"), before, "phải không đụng file");
  } finally {
    await cleanup(dir);
  }
});

test("release/version.mjs: lệnh lạ thì báo lỗi kèm danh sách lệnh đúng", async () => {
  const out = await runShell(`node ${VERSION_CLI} nangcap`, { cwd: ROOT, timeoutMs: 20_000 });

  assert.equal(out.code, 1);
  assert.match(out.stderr, /check \| sync \| stamp \| bump/);
});
