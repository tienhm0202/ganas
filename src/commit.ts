import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evaluateTreeCriteria, type GateResult } from "./gate.js";
import type { Graph } from "./graph/types.js";
import type { Task } from "./model/index.js";
import { runShell } from "./util/exec.js";
import { exists } from "./util/fsprobe.js";

/**
 * Dựng commit message TỪ dữ liệu đã kiểm chứng, không phải văn xuôi tự bịa.
 *
 * "Làm việc gì" lấy từ chính spine (task/design/goal). "Test thế nào" lấy
 * nguyên kết quả `evaluateGate` — chỉ gọi được hàm này sau khi gate đã `ok`,
 * nên mọi mục hiện ra ở đây đều THẬT SỰ đã chấm qua, không phải khai suông.
 *
 * Không bao giờ có dòng ghi công AI/trợ lý — đây là quy ước cứng của ganas,
 * không phải tuỳ chọn cấu hình.
 */
export function buildCommitMessage(graph: Graph, task: Task, gate: GateResult): string {
  const lines: string[] = [`${task.id}: ${task.title}`, "", "Điều kiện hoàn thành:"];

  for (const r of gate.results) {
    const mark = r.status === "pass" ? "✓" : r.status === "pending_human" ? "…" : "✗";
    lines.push(`  ${mark} ${r.label}`);
  }

  const design = graph.designs.get(task.implements)?.value;
  const context = [
    `phục vụ ${task.serves.join(", ")}`,
    design ? `design ${design.id} — ${design.title}` : `design ${task.implements}`,
    `phạm vi ${task.scope}`,
  ].join(" · ");

  lines.push("", context);

  return lines.join("\n") + "\n";
}

/* ------------------------------------------------------------------------- *
 * Chấm lại trên CÂY SẮP ĐƯỢC COMMIT
 * ------------------------------------------------------------------------- */

/** Kết quả chấm lại. `skipped` là "không dựng được cây", KHÔNG phải "đã xanh". */
export interface StagedTreeCheck {
  status: "ok" | "failed" | "skipped" | "baseline-red";
  /** Tiêu chí đỏ trên cây đã stage — rỗng khi `ok` hoặc `skipped`. */
  failures: { label: string; reason: string }[];
  /** Vì sao bỏ qua. Chỉ có khi `skipped`. */
  reason?: string;
}

/** Bọc một đường dẫn cho shell. */
function shellQuote(p: string): string {
  return `'${p.split("'").join(`'\\''`)}'`;
}

/**
 * Chấm lại `exit_contract` trên chính nội dung ĐÃ STAGE, trước khi tạo commit.
 *
 * ## Vì sao cần
 *
 * `ganas gate` chạy các lệnh với cwd là gốc repo — tức trên WORKING TREE. Còn
 * `ganas commit` chỉ `git add` những file trong `taskBoundary()`. Chênh lệch
 * giữa hai tập đó trước đây không ai kiểm, nên gate xanh vẫn sinh ra được một
 * commit không biên dịch nổi: file trong ranh giới import một file NGOÀI ranh
 * giới đang sửa dở, working tree có đủ cả hai, commit thì chỉ có một.
 *
 * Đã xảy ra thật ở T-010 (`commit:fc99e87`, phải `--amend` mới vá được). Đây
 * đúng lớp lỗi "xanh ở máy tác giả, đỏ ở mọi máy khác" mà ganas tồn tại để
 * chặn, nên để nó lọt là mâu thuẫn với chính lý do dự án có mặt.
 *
 * ## Vì sao `write-tree` + `archive`, không phải `git stash --keep-index`
 *
 * `stash` đụng vào working tree THẬT của người dùng: tiến trình chết giữa
 * chừng thì phần chưa commit nằm lại trong stash, và người dùng phải tự biết
 * đường lấy ra. Một lệnh KIỂM TRA không được phép có chế độ hỏng kiểu đó.
 * `git write-tree` chỉ đọc index và không sửa gì; `git archive` bung bản sao ra
 * thư mục tạm.
 *
 * `node_modules` được mượn qua symlink chứ không chép: nó không nằm trong git
 * (nên không có trong cây đã stage), mà thiếu nó thì mọi lệnh `npm`/`npx` đều
 * đỏ vì lý do chẳng liên quan gì tới task.
 *
 * ## Dựng không được thì SKIPPED, không phải OK
 *
 * Không phải repo git, `git archive` lỗi, không có `tar` — mọi trường hợp đó
 * trả `skipped` kèm lý do, và nơi gọi phải NÓI RA. Im lặng coi như xanh là
 * dựng lại đúng cái lỗ này ở một chỗ khác.
 */
/**
 * Bung một cây git ra thư mục tạm, mượn `node_modules` của repo qua symlink.
 *
 * Dùng cho CẢ cây đã stage lẫn cây HEAD — hai lượt phải dựng y hệt nhau, nếu
 * không thì phép so mốc (xem `checkStagedTree`) so hai thứ khác nhau và kết
 * luận vô nghĩa.
 *
 * Trả `undefined` khi không dựng nổi. Nơi gọi phải hiểu đó là "không biết",
 * KHÔNG phải "xanh".
 */
async function materializeTree(root: string, treeish: string): Promise<string | undefined> {
  const dir = await mkdtemp(join(tmpdir(), "ganas-tree-"));
  const extract = await runShell(`git archive ${treeish} | tar -x -C ${shellQuote(dir)}`, {
    cwd: root,
    timeoutMs: 120_000,
  });
  if (extract.code !== 0) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    return undefined;
  }

  const modules = join(root, "node_modules");
  if (exists(modules)) {
    await symlink(modules, join(dir, "node_modules"), "dir").catch(() => undefined);
  }
  return dir;
}

/** Thời gian tối đa cho lệnh kiểm toàn dự án. Quá giờ ⇒ `skipped`, không bao giờ ⇒ chặn. */
const BUILD_CHECK_TIMEOUT_MS = 300_000;

export async function checkStagedTree(
  root: string,
  task: Task,
  buildCheck?: string  ,
): Promise<StagedTreeCheck> {
  const tree = await runShell("git write-tree", { cwd: root, timeoutMs: 30_000 });
  if (tree.code !== 0 || !tree.stdout.trim()) {
    return {
      status: "skipped",
      failures: [],
      reason: `\`git write-tree\` không chạy được: ${tree.stderr.trim() || "không rõ lý do"}`,
    };
  }

  const dir = await materializeTree(root, tree.stdout.trim());
  if (dir === undefined) {
    return {
      status: "skipped",
      failures: [],
      reason: "bung cây đã stage ra thư mục tạm thất bại",
    };
  }

  try {
    const results = await evaluateTreeCriteria(dir, task.exit_contract);
    const failures = results
      .filter((r) => r.status === "fail")
      .map((r) => ({ label: r.label, reason: r.reason ?? "không đạt" }));

    if (failures.length > 0) return { status: "failed", failures };

    // Lệnh kiểm TOÀN DỰ ÁN. Khác các tiêu chí trên: chúng chỉ kiểm phần task
    // chạm tới, còn cái này kiểm cả cây — chính chỗ mà một thay đổi trải sang
    // phạm vi khác làm gãy mà không tiêu chí nào của task nhìn thấy.
    if (!buildCheck) return { status: "ok", failures: [] };

    const staged = await runShell(buildCheck, { cwd: dir, timeoutMs: BUILD_CHECK_TIMEOUT_MS });
    if (staged.code === 0) return { status: "ok", failures: [] };

    // Quá giờ ⇒ KHÔNG kết luận. Chạy tiếp trên HEAD chỉ tốn thêm đúng ngần ấy
    // thời gian nữa để rồi cũng không biết gì thêm.
    if (staged.timedOut) {
      return {
        status: "skipped",
        failures: [],
        reason: `\`${buildCheck}\` quá ${BUILD_CHECK_TIMEOUT_MS / 1000}s trên cây đã stage — không kết luận`,
      };
    }

    // SO VỚI MỐC, không so với "xanh". Chỉ chặn khi commit này LÀM GÃY thứ
    // đang lành. Không có vế này thì: HEAD đỏ sẵn ⇒ cả đội không commit được
    // gì; dự án cũ chưa bao giờ sạch ⇒ không commit nổi commit đầu tiên; lệnh
    // kiểm sai/thiếu ⇒ đỏ ở mọi lượt. Xem PR-007 trong `.ganas/proposals/`.
    const headDir = await materializeTree(root, "HEAD");
    if (headDir === undefined) {
      return {
        status: "skipped",
        failures: [],
        reason: `\`${buildCheck}\` đỏ trên cây đã stage, nhưng không dựng được cây HEAD để đối chiếu`,
      };
    }

    try {
      const base = await runShell(buildCheck, { cwd: headDir, timeoutMs: BUILD_CHECK_TIMEOUT_MS });
      if (base.code !== 0) {
        return {
          status: "baseline-red",
          failures: [],
          reason: `\`${buildCheck}\` đỏ ở CẢ cây đã stage lẫn HEAD — commit này không làm gãy thêm`,
        };
      }
    } finally {
      await rm(headDir, { recursive: true, force: true }).catch(() => undefined);
    }

    return {
      status: "failed",
      failures: [
        {
          label: `lệnh kiểm toàn dự án \`${buildCheck}\``,
          reason: (staged.stderr.trim() || staged.stdout.trim() || "thoát khác 0").slice(0, 800),
        },
      ],
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/* ------------------------------------------------------------------------- *
 * File đã sửa theo GIT — nguồn sự thật cho outsideBoundary()
 * ------------------------------------------------------------------------- */

export interface PorcelainEntry {
  /** Cột index (đã stage). `?` = chưa track. */
  x: string;
  /** Cột working tree. Khác `" "` ⇒ trên đĩa còn khác với index. */
  y: string;
  path: string;
}

/**
 * Parse `git status --porcelain -z`.
 *
 * Dùng `-z` chứ không phải bản có xuống dòng: với `core.quotepath` bật (mặc
 * định), tên file có dấu bị escape thành `\303\251...` và mọi so khớp sau đó
 * đều trượt. `-z` không escape gì.
 *
 * Mục đổi tên/copy chiếm HAI trường (đường dẫn mới và cũ) — lấy cả hai, vì cả
 * hai đều là thứ cần vào commit.
 */
export function parsePorcelainZ(stdout: string): PorcelainEntry[] {
  const fields = stdout.split("\0");
  const entries: PorcelainEntry[] = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field || field.length < 4) continue;
    const x = field[0]!;
    const y = field[1]!;
    entries.push({ x, y, path: field.slice(3) });
    if (x === "R" || x === "C" || y === "R" || y === "C") {
      const other = fields[++i];
      if (other) entries.push({ x, y, path: other });
    }
  }
  return entries;
}

/**
 * `git status --porcelain -z -uall` giới hạn theo `pathspec`. `-uall`: mặc
 * định git gộp cả thư mục chưa track thành MỘT dòng `?? dir/`, gộp như thế
 * thì không phân loại được file nào thuộc phần nào — mà đó chính là việc cần
 * làm ở cả `commands/commit.ts` (lọc file `.ganas/` của task) lẫn
 * `gitTouchedPaths` dưới đây (đối chiếu ranh giới code).
 *
 * `pathspec` rỗng trả `[]` ngay — không gọi git cho một truy vấn vô nghĩa.
 */
export async function gitChangedPaths(
  root: string,
  pathspec: string[],
): Promise<PorcelainEntry[]> {
  if (pathspec.length === 0) return [];
  const spec = pathspec.map(shellQuote).join(" ");
  const res = await runShell(`git status --porcelain -z -uall -- ${spec}`, {
    cwd: root,
    timeoutMs: 15_000,
  });
  if (res.code !== 0) return [];
  return parsePorcelainZ(res.stdout);
}

/**
 * Mọi đường dẫn ĐÃ SỬA trong working tree, theo `git status` — KHÔNG phải sổ
 * phiên `.ganas/state.json`.
 *
 * ICE-008 (mức chữa gốc, xem `.ganas/icebox/2026-08.yaml`): `outsideBoundary()`
 * từng nhận `touched` từ `touchedPathsFor()` (sổ phiên), và sổ đó gần như luôn
 * RỖNG — gọi CLI không kèm `--session` thì không khớp bản ghi nào, và ngay cả
 * đúng session cũng mất vì `bindSession` thay cả bản ghi khi task đổi. Cảnh
 * báo "file ngoài ranh giới" vì vậy im suốt dù cơ chế đã tồn tại.
 *
 * Git luôn biết file nào đổi bất kể session id, bất kể hook ghi kịp hay
 * không, bất kể sub-agent hay phiên chính sửa — cùng nguồn mà
 * `commands/commit.ts` đã dùng cho riêng `.ganas/` (dựng `owned`/`foreign`),
 * ở đây chỉ nới pathspec ra toàn cây (`.`).
 *
 * Không lọc `.ganas/` ở đây — `outsideBoundary()` tự loại đường dẫn đó (xem
 * docstring của nó), lọc hai lần thì một bên đổi mà bên kia quên là chỗ lệch.
 *
 * Không phải repo git hoặc `git status` lỗi ⇒ `[]`. Đó là "không biết", không
 * phải "không có gì ngoài ranh giới" — `outsideBoundary()` còn vế
 * `boundary.length === 0` để không kết luận ẩu từ một danh sách rỗng đáng ngờ.
 */
export async function gitTouchedPaths(root: string): Promise<string[]> {
  const entries = await gitChangedPaths(root, ["."]);
  return [...new Set(entries.map((e) => e.path))];
}

/** In kết quả chấm lại thành chữ. Trả `""` khi xanh — không có gì để nói thì đừng nói. */
export function formatStagedTreeCheck(taskId: string, check: StagedTreeCheck): string {
  if (check.status === "ok") return "";

  if (check.status === "baseline-red") {
    // KHÔNG chặn: commit này không làm gãy thêm gì. Nhưng phải nói ra — im lặng
    // cho qua thì một dự án đỏ triền miên trông y hệt một dự án xanh.
    return `\n⚠ ${check.reason}\n  Commit vẫn đi tiếp. Chỗ đỏ sẵn đó là nợ của cả dự án, không phải của ${taskId}.\n`;
  }

  if (check.status === "skipped") {
    return (
      `\n⚠ KHÔNG chấm lại được trên cây sắp commit: ${check.reason}\n` +
      `  Gate đã xanh trên working tree, nhưng đó là một cây KHÁC với cây sắp đi vào commit.\n`
    );
  }

  return (
    `\n✗ ${taskId} xanh trên working tree nhưng ĐỎ trên cây sắp được commit:\n` +
    check.failures.map((f) => `    ${f.label}\n      ${f.reason}`).join("\n") +
    `\n\n  Gần như luôn cùng một nguyên nhân: file trong ranh giới của task phụ thuộc một\n` +
    `  file NGOÀI ranh giới đang sửa dở. Working tree có đủ cả hai, commit thì không.\n` +
    `  Hoặc khai thêm khối vào \`touches\`, hoặc commit file kia trước bằng task sở hữu nó.\n`
  );
}
