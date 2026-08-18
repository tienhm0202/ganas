import { mkdir, open, readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";

import { DIRS, ganasPath } from "./paths.js";
import { type Candidate, rankedCandidates, type SelectOptions } from "./select.js";
import type { Graph } from "./types.js";

export interface Claim {
  session_id: string;
  claimed_at: string;
}

function claimFile(root: string, taskId: string): string {
  return ganasPath(root, DIRS.locks, `${taskId}.claim`);
}

/** Đặt chỗ id — cùng thư mục `.locks/`, khác đuôi để không đụng `claimFile`. */
function idFile(root: string, id: string): string {
  return ganasPath(root, DIRS.locks, `${id}.id`);
}

function isStale(claim: Claim, ttlMinutes: number): boolean {
  const claimedAt = new Date(claim.claimed_at).getTime();
  if (Number.isNaN(claimedAt)) return true; // file hỏng — coi như không còn giữ được nữa
  return Date.now() - claimedAt > ttlMinutes * 60_000;
}

async function readClaimFile(file: string): Promise<Claim | null> {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as Claim;
  } catch {
    return null;
  }
}

/** Ai đang giữ task này, null nếu không ai giữ (hoặc chưa từng bị giữ). */
export async function claimOwner(root: string, taskId: string): Promise<Claim | null> {
  return readClaimFile(claimFile(root, taskId));
}

async function createClaimFile(file: string, claim: Claim): Promise<boolean> {
  try {
    const handle = await open(file, "wx");
    try {
      await handle.writeFile(JSON.stringify(claim));
    } finally {
      await handle.close();
    }
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
}

/**
 * Giành một file khoá cho một phiên — dùng chung cho cả claim task lẫn đặt
 * chỗ id, chỉ khác nhau ở ĐƯỜNG DẪN file khoá và ở `sameSessionKeeps`.
 *
 * `open(file, "wx")` là nguyên tử ở tầng filesystem — tạo file chỉ khi nó
 * chưa tồn tại, và khi hai tiến trình gọi cùng lúc, hệ điều hành đảm bảo chỉ
 * một cái thắng (không phải kỹ thuật tự chế: đây là primitive chuẩn mà các
 * thư viện lock file trong Node vẫn dựa vào).
 *
 * `sameSessionKeeps` quyết định phiên ĐÃ giữ khoá này gọi lại thì thế nào:
 *   - `true`  (claim task) — khoá là QUYỀN SỞ HỮU một thứ đã tồn tại, phiên
 *     đang giữ gọi lại thì vẫn là của nó. Trả `true`, không tạo gì thêm.
 *   - `false` (đặt chỗ id) — khoá TIÊU THỤ một con số. Cấp lại con số đó cho
 *     bất kỳ ai, kể cả chính phiên vừa xin, cũng là cấp TRÙNG — hai lần gọi
 *     `ganas id task` liên tiếp của cùng một phiên (chưa ghi file giữa hai
 *     lần) phải ra hai số khác nhau. Trả `false` để người gọi (`id.ts`) nhảy
 *     sang ứng viên kế tiếp, y hệt như gặp một phiên khác đang giữ.
 *
 * Trả `true` nếu phiên này (đang) giữ được khoá, `false` nếu khoá đã bị giữ
 * (bởi phiên khác, hoặc bởi chính phiên này khi `sameSessionKeeps: false`) và
 * chưa hết TTL.
 */
async function acquireLock(
  file: string,
  sessionId: string,
  ttlMinutes: number,
  sameSessionKeeps: boolean,
): Promise<boolean> {
  await mkdir(dirname(file), { recursive: true });
  const claim: Claim = { session_id: sessionId, claimed_at: new Date().toISOString() };

  if (await createClaimFile(file, claim)) return true;

  const existing = await readClaimFile(file);
  if (!existing) return createClaimFile(file, claim); // vừa bị giải phóng giữa hai bước đọc — thử lại
  if (existing.session_id === sessionId && sameSessionKeeps) return true; // chính phiên này giữ tiếp
  if (!isStale(existing, ttlMinutes)) return false; // còn bị giữ thật (kể cả bởi chính phiên này, khi !sameSessionKeeps)

  // Claim cũ quá hạn — có thể phiên trước đã crash (hoặc, với đặt-chỗ id, phiên
  // trước xin xong rồi bỏ mà không ghi file). Giành lại.
  await rm(file, { force: true });
  return createClaimFile(file, claim);
}

/** Giữ một task cho một phiên. Xem `acquireLock` cho cơ chế nguyên tử + TTL. */
export async function claimTask(
  root: string,
  taskId: string,
  sessionId: string,
  ttlMinutes: number,
): Promise<boolean> {
  return acquireLock(claimFile(root, taskId), sessionId, ttlMinutes, true);
}

export async function releaseClaim(root: string, taskId: string): Promise<void> {
  await rm(claimFile(root, taskId), { force: true });
}

/**
 * Đặt chỗ một id trước khi ghi file thực thể — vá lỗ đua của `ganas id`
 * (id.ts trước bản này chỉ tính max+1 rồi IN RA, không giữ chỗ gì cả: hai
 * phiên gọi gần như đồng thời nhận CÙNG một số, phiên ghi file sau GHI ĐÈ ÂM
 * THẦM lên phiên trước).
 *
 * Cùng cơ chế `wx` + TTL của `claimTask`, chỉ khác đuôi file (`.id` thay vì
 * `.claim`) để không đụng độ nếu một chuỗi số trùng cả tên task lẫn tên
 * đang được đặt chỗ (không xảy ra trong thực tế vì tiền tố khác nhau, nhưng
 * tách file rõ ràng hơn là dựa vào đó).
 *
 * CỐ Ý khác `claimTask` ở `sameSessionKeeps: false` — claim là quyền SỞ HỮU
 * (phiên đang giữ gọi lại vẫn là của nó), còn đặt chỗ id là TIÊU THỤ một con
 * số (cấp lại cho bất kỳ ai, kể cả chính phiên vừa xin, cũng là cấp trùng).
 * Không có nó thì hai lời gọi liên tiếp của CÙNG một phiên (chưa ghi file thực
 * thể giữa hai lần — đúng cách `ganas id task --count N` rồi Write được dùng
 * trong thực tế) sẽ nhận lại đúng một số, không phải hai số khác nhau. Sự
 * kiện này không phải giả thuyết: hầu hết lời gọi `ganas id` trong thực tế
 * KHÔNG có `--session` (không lệnh nào trong repo truyền cờ đó cho `id.ts` —
 * xem docstring ở đầu `commands/id.ts`), nên chúng đều rơi vào cùng fallback
 * `"cli"`; nếu coi cùng session_id là "đã giữ, cho qua" thì MỌI lời gọi kế
 * tiếp — dù của phiên khác hay của chính phiên cũ — đều bị cấp trùng.
 *
 * CHỈ chống đua giữa các phiên trên CÙNG một máy — `.ganas/.locks/` là
 * `LOCAL_ONLY` (xem `paths.ts`), không đồng bộ qua git. Hai phiên trên hai
 * máy khác nhau vẫn có thể tính ra cùng một id; lớp 2 (`preToolUse` chặn
 * `Write` đè file thực thể đã tồn tại) là hàng rào còn lại cho trường hợp đó.
 */
export async function reserveId(
  root: string,
  id: string,
  sessionId: string,
  ttlMinutes: number,
): Promise<boolean> {
  return acquireLock(idFile(root, id), sessionId, ttlMinutes, false);
}

const LOCK_POLL_MS = 20;

/**
 * Khoá MUTEX ngắn hạn quanh một đoạn code — khác hẳn `reserveId`/`claimTask`
 * ở BẢN CHẤT thứ được bảo vệ: hai hàm đó bảo vệ một CON SỐ/một TASK (quyền sở
 * hữu một thực thể), còn `withFileLock` bảo vệ một LƯỢT ĐỌC-SỬA-GHI vào một
 * FILE dùng chung. `ganas icebox add` cần đúng cái này: `reserveId` chỉ đảm
 * bảo hai lời gọi không nhận trùng ID, nó không đảm bảo gì về việc hai tiến
 * trình cùng đọc → sửa → ghi file tháng `.ganas/icebox/YYYY-MM.yaml` — phiên
 * ghi SAU cùng thắng, đè mất mục mà phiên ghi TRƯỚC vừa thêm, không một tiếng
 * động (đúng lỗi `reserveId` đã vá cho id.ts, nhưng ở tầng NỘI DUNG file, không
 * phải ở tầng con số).
 *
 * Cùng primitive nguyên tử `open(file, "wx")` với `acquireLock` ở trên, nhưng
 * vòng đời khác hẳn nên viết thành hàm riêng thay vì tái dùng `acquireLock`:
 *   - `acquireLock` trả `boolean` NGAY, để người gọi tự quyết nhảy sang ứng
 *     viên khác (đúng nhu cầu của `reserveId`/`claimTask`). `withFileLock`
 *     ĐỢI (poll ngắn) tới khi giành được khoá rồi mới chạy `fn` — người gọi
 *     không có "ứng viên khác" để nhảy sang, chỉ có một file duy nhất cần ghi.
 *   - TTL của `withFileLock` tính bằng MILI GIÂY, không phải phút: khoá này
 *     chỉ sống trong đúng một lượt đọc-sửa-ghi (vài chục mili giây), không
 *     phải một phiên làm việc. TTL dài như `claim.ttl_minutes` sẽ khiến một
 *     tiến trình crash giữa chừng khoá cả file hàng giờ.
 *   - Không cần `Claim` (session_id + claimed_at): đây là mutex thuần, không
 *     ai "sở hữu" khoá theo nghĩa `sameSessionKeeps` — chỉ cần biết khoá còn
 *     mới hay đã bỏ hoang, nên dùng `mtime` của chính file khoá rỗng thay vì
 *     ghi/đọc JSON.
 *
 * Khoá bị bỏ hoang (tiến trình giữ nó crash) được nhận ra qua `mtime` cũ hơn
 * `ttlMs` và bị giành lại — cùng lý lẽ "claim cũ quá hạn" của `acquireLock`.
 * Giải phóng trong `finally`: `fn` ném lỗi thì khoá vẫn phải được nhả, nếu
 * không lỗi ứng dụng biến thành khoá treo vĩnh viễn.
 */
export async function withFileLock<T>(lockFile: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(lockFile), { recursive: true });

  const giveUpAfterMs = ttlMs * 5; // vài chu kỳ TTL — đủ để một khoá bỏ hoang được giành lại và dùng, không treo vô hạn.
  const waitStartedAt = Date.now();

  for (;;) {
    try {
      const handle = await open(lockFile, "wx");
      await handle.close();
      break; // giành được khoá
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      const info = await stat(lockFile).catch(() => null);
      if (!info || Date.now() - info.mtimeMs > ttlMs) {
        // Không còn file (vừa được giải phóng giữa hai bước đọc), hoặc khoá đã
        // bỏ hoang quá TTL — giành lại ngay, không cần đợi thêm.
        await rm(lockFile, { force: true });
        continue;
      }

      if (Date.now() - waitStartedAt > giveUpAfterMs) {
        throw new Error(
          `withFileLock: không giành được khoá ${lockFile} sau ${giveUpAfterMs}ms — ` +
            `có tiến trình khác đang giữ nó lâu bất thường.`,
          { cause: err },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
    }
  }

  try {
    return await fn();
  } finally {
    await rm(lockFile, { force: true });
  }
}

/**
 * Chọn task kế tiếp VÀ giữ nó cho phiên này trong một bước.
 *
 * Duyệt danh sách xếp hạng, bỏ qua ứng viên nào một phiên khác đang giữ thật
 * (chưa hết TTL) — không dừng lại ở ứng viên đầu như `selectNextTask` thuần
 * túy vẫn làm, vì hai phiên gọi gần như đồng thời không được phép cùng nhận
 * một task.
 */
export async function claimNextTask(
  graph: Graph,
  root: string,
  sessionId: string,
  opts: SelectOptions = {},
): Promise<Candidate | null> {
  const ttlMinutes = graph.config.claim.ttl_minutes;
  for (const candidate of rankedCandidates(graph, opts)) {
    if (await claimTask(root, candidate.task.value.id, sessionId, ttlMinutes)) return candidate;
  }
  return null;
}

/** Đuôi file khoá đang tồn tại trong `.locks/` — claim task và đặt-chỗ id. */
const LOCK_SUFFIXES = [".claim", ".id"] as const;

/**
 * Giải phóng mọi claim VÀ mọi id đã đặt chỗ mà một phiên đang giữ — gọi lúc
 * SessionEnd.
 *
 * Dọn cả hai loại file trong cùng một lượt quét thư mục thay vì gọi riêng
 * từng loại: `readdir` là chi phí chính, không đáng trả hai lần cho cùng một
 * thư mục nhỏ. Chỉ xoá file mà `session_id` bên trong khớp — claim/id của
 * phiên khác giữ nguyên.
 */
export async function releaseClaimsForSession(root: string, sessionId: string): Promise<void> {
  const dir = ganasPath(root, DIRS.locks);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return; // chưa có lock nào
  }

  await Promise.all(
    entries.map(async (name) => {
      const suffix = LOCK_SUFFIXES.find((s) => name.endsWith(s));
      if (!suffix) return; // không phải file khoá ganas biết — bỏ qua

      const file = ganasPath(root, DIRS.locks, name);
      const claim = await readClaimFile(file);
      if (claim?.session_id === sessionId) await rm(file, { force: true });
    }),
  );
}
