import { basename } from "node:path";

import { reserveId } from "../graph/claim.js";
import type { Graph } from "../graph/types.js";
import { ID_PATTERNS } from "../model/index.js";
import { type Argv, flag, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { openProject } from "./_common.js";

/**
 * `ganas id <loại>` — cấp số ID kế tiếp cho một loại đánh số, để agent không
 * còn lý do đi bịa nhãn tạm ("Lô 3", "T4a") vì tự liệt kê `.ganas/tasks/` rồi
 * đoán số kế tiếp quá đắt.
 *
 * Chỉ nhận loại ĐÁNH SỐ: goal, design, task, claim, decision, fact, icebox — mỗi loại
 * có tiền tố cố định + số tăng dần (xem `ID_PATTERNS` ở `src/model/common.ts`,
 * dùng lại nguyên văn ở đây để trích số, không viết regex hình dạng ID mới).
 * Loại đặt tên theo NGHĨA (`module`, `scope`, `verification`) không có "số kế
 * tiếp" nào để cấp — lệnh từ chối và trỏ sang `ganas scope new`.
 *
 * ĐÃ CHỐNG ĐUA ở tầng đặt-chỗ: lệnh này không còn tính max+1 rồi in ra ngay —
 * mỗi ứng viên số đi qua `reserveId()` (src/graph/claim.ts), cùng cơ chế
 * `open(file, "wx")` + TTL đang phục vụ `claimTask`, nhưng KHÁC `claimTask`
 * ở một điểm cố ý: `reserveId` không coi cùng `session_id` là "đã giữ, cho
 * qua" (xem `sameSessionKeeps` trong docstring của nó) — vì đặt chỗ một id là
 * TIÊU THỤ một con số, cấp lại cho bất kỳ ai, kể cả chính phiên vừa xin, cũng
 * là cấp trùng. Ứng viên bị giữ (bởi phiên khác, HOẶC bởi chính phiên này ở
 * một lượt gọi trước) thì bị NHẢY QUA, không cấp lại — id chỉ ra khỏi lệnh
 * này khi phiên gọi đã thật sự giữ được chỗ MỚI cho nó trong `.ganas/.locks/`.
 *
 * Chỗ này quan trọng hơn nó nghe: không lệnh nào trong repo truyền `--session`
 * cho `ganas id` (hook chỉ truyền session cho lệnh `hook`; skill
 * `plan-to-tasks` dạy chạy `ganas id task --count N` TRẦN trong Bash — xem
 * `plugin/skills/plan-to-tasks/SKILL.md`). Nên trong thực tế MỌI lời gọi đều
 * rơi vào cùng fallback `"cli"` bên dưới — nếu `reserveId` xử lý như
 * `claimTask` thì fallback đó sẽ khiến MỌI lời gọi kế tiếp (dù của phiên khác
 * hay của chính phiên cũ) bị cấp trùng, tức là vô hiệu hoàn toàn lớp chống
 * đua ngay trong kịch bản nó sinh ra để chặn. Với `sameSessionKeeps: false`,
 * fallback `"cli"` không còn là điểm yếu: hai lời gọi bất kỳ — cùng phiên hay
 * khác phiên, có `--session` hay không — luôn nhận hai số khác nhau (có thể
 * có lỗ hổng số ở giữa — chấp nhận được, vô hại).
 *
 * Vẫn còn hai giới hạn phải biết:
 *
 *   1. `.ganas/.locks/` là `LOCAL_ONLY` (xem `graph/paths.ts`) — không commit,
 *      không đồng bộ qua git. Lớp này CHỈ chống đua giữa các phiên trên CÙNG
 *      một máy. Hai phiên trên hai máy khác nhau vẫn có thể được cấp cùng
 *      một id.
 *   2. Việc GHI file task/fact/... vẫn do agent tự làm bằng công cụ Write,
 *      lệnh này không ghi hộ. Chỗ còn hở đó do lớp thứ hai lo: `preToolUse`
 *      (src/hooks/handlers.ts) từ chối `Write` đè lên file thực thể đã tồn
 *      tại dưới `.ganas/`. Hàng rào đó CHỈ có hiệu lực khi plugin ganas được
 *      cài trong Claude Code — gọi `ganas` trần từ terminal (hoặc phiên
 *      không cài plugin) thì không có hook nào chặn, và việc ghi đè âm thầm
 *      vẫn có thể xảy ra nếu hai agent phối hợp sai (vd. cùng chạy `ganas id`
 *      rồi một phiên bỏ qua id được cấp, tự bịa số khác).
 */

const NUMBERED_KINDS = ["goal", "design", "task", "claim", "decision", "fact", "icebox"] as const;
type NumberedKind = (typeof NUMBERED_KINDS)[number];

function isNumberedKind(s: string): s is NumberedKind {
  return (NUMBERED_KINDS as readonly string[]).includes(s);
}

/** Loại slug — đặt tên theo nghĩa, không theo số. Không có "id kế tiếp". */
const SLUG_KINDS = new Set(["module", "scope", "verification"]);

/** Tiền tố ĐẦY ĐỦ (kèm dấu gạch) của các loại đánh số phẳng, không có nhóm con. */
const PREFIX: Record<Exclude<NumberedKind, "fact">, string> = {
  goal: "G-",
  design: "D-",
  task: "T-",
  claim: "C-",
  decision: "DEC-",
  icebox: "ICE-",
};

function idsOf(graph: Graph, kind: NumberedKind): Iterable<string> {
  switch (kind) {
    case "goal":
      return graph.goals.keys();
    case "design":
      return graph.designs.keys();
    case "task":
      return graph.tasks.keys();
    case "claim":
      return graph.claims.keys();
    case "decision":
      return graph.decisions.keys();
    case "fact":
      return graph.facts.keys();
    case "icebox":
      return graph.icebox.keys();
  }
}

/**
 * Giữ tối thiểu 3 chữ số (`8` → `"008"`), nhưng số ≥ 1000 không bị cắt —
 * `padStart` chỉ THÊM ký tự khi chuỗi ngắn hơn độ dài đích, không bao giờ cắt.
 */
function pad(n: number): string {
  return String(n).padStart(3, "0");
}

/**
 * Lấy `id` (kiểu string) ở TẦNG TRÊN CÙNG của một bản ghi, nếu có. CỐ Ý không
 * đi sâu hơn một tầng — xem lý do ở `rawDeclaredIds`.
 */
function topLevelId(record: unknown): string | undefined {
  if (record === null || typeof record !== "object" || Array.isArray(record)) return undefined;
  const id = (record as Record<string, unknown>).id;
  return typeof id === "string" ? id : undefined;
}

/**
 * Id đã KHAI trên đĩa nhưng graph không thấy, vì file hỏng theo một trong hai
 * cách — đây là nguồn của lỗi "ganas id cấp lại id đang bị chiếm":
 *
 *   1. Hỏng SCHEMA: file YAML đọc được, nhưng `schema.safeParse` loại cả bản
 *      ghi khỏi `graph.tasks`/`graph.facts`/... `collectSingle`/`collectArray`
 *      (graph/load.ts) gọi `sources.set(...)` TRƯỚC `safeParse`, nên bản ghi
 *      hỏng vẫn nằm trong `graph.sources: Map<string, LoadedYaml>` với
 *      `.value` là giá trị JS thô đã parse — lấy id thẳng từ đó.
 *
 *   2. Hỏng CÚ PHÁP YAML: `readYamlFile` ném ngay, `collectSingle`/`collectArray`
 *      `continue` TRƯỚC khi kịp `sources.set`, nên file này vắng mặt hoàn
 *      toàn trong `graph.sources`. Thứ duy nhất còn lại là một `Diagnostic`
 *      mã `load/yaml` với `file` là đường dẫn tương đối — suy id từ basename
 *      của đường dẫn đó (`.ganas/tasks/T-001.yaml` → `T-001`). Đây là ĐOÁN
 *      theo QUY ƯỚC đặt tên file, không có gì bắt buộc tên file phải trùng id
 *      bên trong file (file có thể tên `a.yaml`, không parse được thì không
 *      còn cách nào biết id thật). Chấp nhận được: đoán SAI (basename không
 *      khớp id thật, hoặc trùng ngẫu nhiên một id khác) chỉ bỏ qua/chiếm thêm
 *      một con số không liên quan — lỗ hổng số vốn đã được tuyên bố là vô hại
 *      (xem docstring đầu file). Đoán THIẾU (bỏ qua nguồn này) thì quay lại
 *      đúng lỗi đang bịt: agent kẹt vòng lặp không lối ra vì hook chặn ghi đè
 *      mà `ganas id` không có cách nào biết tại sao.
 *
 * CHỈ lấy `id` ở TẦNG TRÊN CÙNG của mỗi bản ghi — TUYỆT ĐỐI KHÔNG duyệt sâu.
 * Đây là ràng buộc quan trọng nhất của hàm này: duyệt sâu sẽ nhặt phải id nằm
 * trong các trường THAM CHIẾU (`serves: [G-001]`, `implements: D-001`,
 * `blocked_by: [T-002]`, `touches`, `promoted_from`, `supersedes`, ...). Một
 * tham chiếu TREO (gõ nhầm, hoặc trỏ tới id chưa tạo) tới `T-900` sẽ đẩy max
 * lên 900 và lệnh nhảy sang `T-901` — lỗ hổng số khổng lồ sinh ra từ một lỗi
 * gõ ở trường tham chiếu, đánh vào đúng chỗ mà lệnh này phải tin cậy nhất.
 * `id` tầng trên cùng là bản ghi TỰ XƯNG; mọi trường khác chỉ NÓI VỀ bản ghi
 * khác, không phải khai báo id của chính nó.
 */
function rawDeclaredIds(graph: Graph): Set<string> {
  const ids = new Set<string>();

  for (const loaded of graph.sources.values()) {
    const records = Array.isArray(loaded.value) ? loaded.value : [loaded.value];
    for (const record of records) {
      const id = topLevelId(record);
      if (id) ids.add(id);
    }
  }

  const idPatterns = Object.values(ID_PATTERNS);
  for (const diag of graph.loadDiagnostics) {
    if (diag.code !== "load/yaml") continue;
    const guess = basename(diag.file).replace(/\.ya?ml$/, "");
    if (idPatterns.some((pattern) => pattern.test(guess))) ids.add(guess);
  }

  return ids;
}

/**
 * Số lớn nhất ĐANG DÙNG của một loại đánh số phẳng, không phải số lượng bản
 * ghi — kho có T-001 và T-007 thì trả 7, để người gọi +1 ra T-008.
 *
 * Lọc bằng `pattern` (từ `ID_PATTERNS`) trước, rồi mới cắt tiền tố để lấy phần
 * số — id lạ hình dạng (nếu có) bị bỏ qua thay vì làm hỏng phép tính max.
 */
function maxNumber(ids: Iterable<string>, pattern: RegExp, prefix: string): number {
  let max = 0;
  for (const id of ids) {
    if (!pattern.test(id)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/**
 * Như `maxNumber`, nhưng cho fact — id có thêm đoạn nhóm ở giữa (F-<NHÓM>-003).
 * `extraIds` là id đã khai trên đĩa nhưng graph không thấy (xem `rawDeclaredIds`)
 * — hàm tự lọc lại bằng `ID_PATTERNS.fact` + tiền tố nhóm nên nguồn thêm vào
 * không cần lọc trước.
 */
function maxFactNumber(graph: Graph, group: string, extraIds: Iterable<string>): number {
  const prefix = `F-${group}-`;
  let max = 0;
  for (const id of [...graph.facts.keys(), ...extraIds]) {
    if (!ID_PATTERNS.fact.test(id) || !id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export async function run(argv: Argv): Promise<number> {
  const kindRaw = argv.positional[0];
  if (!kindRaw) {
    throw new GanasError(
      `thiếu loại ID — dùng: ganas id <goal|design|task|claim|decision|fact|icebox> ` +
        `[--count n] [--group nhóm]`,
    );
  }

  if (SLUG_KINDS.has(kindRaw)) {
    throw new GanasError(
      `"${kindRaw}" đặt tên theo Ý NGHĨA (slug), không theo số — không có "id kế tiếp" nào để cấp.\n` +
        `  Dùng \`ganas scope new\` — nó tự sinh slug qua slugify() (src/commands/scope.ts:161).`,
    );
  }

  if (!isNumberedKind(kindRaw)) {
    throw new GanasError(
      `không có loại "${kindRaw}" — nhận: goal, design, task, claim, decision, fact, icebox`,
    );
  }
  const kind = kindRaw;

  let group: string | undefined;
  if (kind === "fact") {
    group = option(argv, "group");
    if (!group) {
      throw new GanasError(
        `fact bắt buộc --group (id fact dạng F-<NHÓM>-003, xem ID_PATTERNS.fact) — ` +
          `vd: ganas id fact --group ACC`,
      );
    }
    if (!/^[A-Z0-9]+$/.test(group)) {
      throw new GanasError(`--group phải khớp ^[A-Z0-9]+$, nhận được "${group}"`);
    }
  }

  const countRaw = option(argv, "count");
  const count = countRaw === undefined ? 1 : Number(countRaw);
  if (!Number.isInteger(count) || count < 1) {
    throw new GanasError(`--count phải là số nguyên dương, nhận được "${countRaw}"`);
  }

  const { root, graph } = await openProject(argv);

  // Hợp của id ĐÃ DÙNG trong graph với id đã KHAI trên đĩa nhưng graph không
  // thấy (file hỏng schema hoặc hỏng cú pháp YAML — xem `rawDeclaredIds`).
  // Với file hợp lệ, hợp này đúng bằng chính graph — hành vi cũ không đổi.
  const rawIds = rawDeclaredIds(graph);
  const start =
    kind === "fact"
      ? maxFactNumber(graph, group!, rawIds) + 1
      : maxNumber([...idsOf(graph, kind), ...rawIds], ID_PATTERNS[kind], PREFIX[kind]) + 1;

  // "cli" là danh tính chung cho mọi lời gọi không có `--session` — trong
  // thực tế là HẦU HẾT lời gọi (xem docstring đầu file). Điều này an toàn vì
  // `reserveId` KHÔNG coi cùng session_id là "đã giữ, cho qua" như
  // `claimTask` — hai lời gọi cùng rơi vào "cli" vẫn không bao giờ nhận
  // trùng một id.
  const sessionId = option(argv, "session") ?? "cli";
  const ttlMinutes = graph.config.claim.ttl_minutes;

  const ids: string[] = [];
  // Lỗ hổng số (gap) là chấp nhận được và vô hại — ứng viên bị phiên khác
  // giữ chỗ thì bị NHẢY QUA, không cố lấp lại. Trần số lần thử để không lặp
  // vô hạn nếu `.locks/` bị kẹt đầy claim còn hạn (tình huống bất thường,
  // nhưng "im lặng treo mãi" còn tệ hơn báo lỗi rõ ràng).
  const maxAttempts = count + 1000;
  let n = start;
  for (let attempts = 0; attempts < maxAttempts && ids.length < count; attempts++, n++) {
    const candidate = kind === "fact" ? `F-${group}-${pad(n)}` : `${PREFIX[kind]}${pad(n)}`;
    if (await reserveId(root, candidate, sessionId, ttlMinutes)) ids.push(candidate);
  }

  if (ids.length < count) {
    throw new GanasError(
      `chỉ đặt chỗ được ${ids.length}/${count} id cho "${kind}" sau ${maxAttempts} lần thử — ` +
        `quá nhiều số ứng viên đang bị phiên khác giữ chỗ trong .ganas/.locks/. ` +
        `Thử lại sau, hoặc kiểm tra có phiên nào đang treo giữ chỗ hàng loạt không.`,
    );
  }

  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify({ kind, ...(group ? { group } : {}), ids }, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(ids.join("\n") + "\n");
  return 0;
}
