import { mkdir, open, readdir, readFile, rm } from "node:fs/promises";
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

function isStale(claim: Claim, ttlMinutes: number): boolean {
  const claimedAt = new Date(claim.claimed_at).getTime();
  if (Number.isNaN(claimedAt)) return true; // file hỏng — coi như không còn giữ được nữa
  return Date.now() - claimedAt > ttlMinutes * 60_000;
}

/** Ai đang giữ task này, null nếu không ai giữ (hoặc chưa từng bị giữ). */
export async function claimOwner(root: string, taskId: string): Promise<Claim | null> {
  try {
    const raw = await readFile(claimFile(root, taskId), "utf8");
    return JSON.parse(raw) as Claim;
  } catch {
    return null;
  }
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
 * Giữ một task cho một phiên.
 *
 * `open(file, "wx")` là nguyên tử ở tầng filesystem — tạo file chỉ khi nó
 * chưa tồn tại, và khi hai tiến trình gọi cùng lúc, hệ điều hành đảm bảo chỉ
 * một cái thắng (không phải kỹ thuật tự chế: đây là primitive chuẩn mà các
 * thư viện lock file trong Node vẫn dựa vào).
 *
 * Trả `true` nếu phiên này (đang) giữ được task, `false` nếu một phiên khác
 * còn giữ và chưa hết TTL.
 */
export async function claimTask(
  root: string,
  taskId: string,
  sessionId: string,
  ttlMinutes: number,
): Promise<boolean> {
  const file = claimFile(root, taskId);
  await mkdir(dirname(file), { recursive: true });
  const claim: Claim = { session_id: sessionId, claimed_at: new Date().toISOString() };

  if (await createClaimFile(file, claim)) return true;

  const existing = await claimOwner(root, taskId);
  if (!existing) return createClaimFile(file, claim); // vừa bị giải phóng giữa hai bước đọc — thử lại
  if (existing.session_id === sessionId) return true; // chính phiên này giữ tiếp
  if (!isStale(existing, ttlMinutes)) return false; // phiên khác đang giữ thật

  // Claim cũ quá hạn — có thể phiên trước đã crash. Giành lại.
  await rm(file, { force: true });
  return createClaimFile(file, claim);
}

export async function releaseClaim(root: string, taskId: string): Promise<void> {
  await rm(claimFile(root, taskId), { force: true });
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

/** Giải phóng mọi claim mà một phiên đang giữ — gọi lúc SessionEnd. */
export async function releaseClaimsForSession(root: string, sessionId: string): Promise<void> {
  const dir = ganasPath(root, DIRS.locks);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return; // chưa có lock nào
  }

  await Promise.all(
    entries
      .filter((name) => name.endsWith(".claim"))
      .map(async (name) => {
        const taskId = name.slice(0, -".claim".length);
        const claim = await claimOwner(root, taskId);
        if (claim?.session_id === sessionId) await releaseClaim(root, taskId);
      }),
  );
}
