import { freshnessMark, type VerificationState } from "../graph/freshness.js";
import type { Task } from "../model/index.js";
import { searchFacts, type SearchHit, taskQuery } from "../search.js";
import { type Argv, flag, option } from "../util/args.js";
import { GanasError } from "../util/errors.js";
import { openProject } from "./_common.js";

/**
 * `ganas search <chuỗi>` — BM25 trên fact (`src/search.ts`), để trả lời câu
 * hỏi mà `context_contract.facts` không trả lời được: "phiên trước có kiểm
 * chứng điều gì LIÊN QUAN tới việc tôi đang làm mà không ai khai tay?" Xem
 * module doc của `src/search.ts` cho lý do chọn BM25 trên kho có cấu trúc.
 *
 * Mọi kết quả PHẢI nói độ tươi (`computeFreshness`, dùng lại nguyên — không
 * tự tính lại một nửa, xem cảnh báo ở `src/commands/verify.ts`): một cỗ máy
 * tìm kiếm trả fact đã mục mà không nói nó mục chỉ là máy phát ảo giác tốc độ
 * cao.
 */

const DEFAULT_LIMIT = 10;

/**
 * Chuỗi ngắn gọn để IN cho người đọc — KHÁC `query` thật đưa vào `searchFacts`
 * (giữ nguyên, kể cả nhiều dòng, để `--json` phản ánh đúng thứ đã chấm điểm).
 *
 * `taskQuery()` nối title + must_read + open_questions bằng `" \n "` — với
 * `--task` thật (nhiều must_read, nhiều open_questions) chuỗi này dài nhiều
 * dòng, nhét thẳng vào header/thông báo sẽ vỡ dấu nháy và xuống dòng giữa
 * câu. Có task thì in nhãn gọn `task <id> — "<title>"` thay vì dán khối truy
 * vấn thô; không có task (truy vấn người gõ) thì gộp mọi khoảng trắng/xuống
 * dòng về MỘT dòng — người gõ `--task` không quan tâm nội dung truy vấn suy
 * ra, người gõ chuỗi thì có quan tâm nhưng không được vỡ dòng.
 */
function displayQuery(query: string, task: Task | undefined): string {
  // Trả về chuỗi ĐÃ đóng nháy sẵn, không để chỗ gọi tự bọc thêm: nhãn của
  // `--task` vốn đã chứa title trong nháy, bọc lần nữa ở header thì ra hai
  // lớp nháy lồng nhau (`"task T-017 — "tiêu đề""`) — đọc như output hỏng.
  if (task) return `task ${task.id} — "${task.title}"`;
  return `"${query.replace(/\s+/g, " ").trim()}"`;
}

function renderHit(
  hit: SearchHit,
  freshness: Map<string, VerificationState>,
  referenceScope: string | undefined,
): string {
  const state = freshness.get(hit.factId);
  const mark = freshnessMark(state);
  // Dòng đầu CHỈ có nhãn + id + điểm — id không được dính vào câu văn của lý
  // do (đọc lướt cần chép được `factId` ngay, không phải bóc nó ra khỏi một
  // câu). Lý do (nếu không fresh) xuống dòng riêng, thụt lề, tiền tố `LÝ DO:`
  // — cùng khuôn `src/render/brief.ts` đang dùng cho fact khác phạm vi.
  const reasonLine = state && state.freshness !== "fresh" ? `\n  LÝ DO: ${state.reason}` : "";

  const outOfScope =
    referenceScope !== undefined && hit.fact.scope !== referenceScope
      ? `\n  ⚠ NGOÀI PHẠM VI ĐANG XÉT: fact thuộc \`${hit.fact.scope}\`, không phải \`${referenceScope}\` — ` +
        "chưa chắc đúng ở đây, tự kiểm lại trước khi dựa vào"
      : "";

  return (
    `${mark} ${hit.factId}  (điểm ${hit.score.toFixed(2)})` +
    reasonLine +
    `\n  ${hit.fact.statement}\n` +
    `  file: ${hit.file}  ·  khớp: ${hit.matchedTerms.join(", ")}` +
    outOfScope
  );
}

export async function run(argv: Argv): Promise<number> {
  const { graph, freshness } = await openProject(argv);

  const taskId = option(argv, "task");
  const queryArg = argv.positional.join(" ").trim();

  let query: string;
  let task: Task | undefined;

  if (taskId) {
    const sourced = graph.tasks.get(taskId);
    if (!sourced) throw new GanasError(`không có task ${taskId}`);
    task = sourced.value;
    query = taskQuery(task);
  } else if (queryArg) {
    query = queryArg;
  } else {
    throw new GanasError(
      `thiếu truy vấn — dùng \`ganas search "<chuỗi>"\` để tra theo chuỗi, ` +
        "hoặc `ganas search --task <id>` để dùng chính task làm truy vấn.",
    );
  }

  const explicitScope = option(argv, "scope");
  // Phạm vi THAM CHIẾU để label "ngoài phạm vi": ưu tiên `--scope` tường minh
  // (người dùng chủ động chọn), rồi mới tới scope của task (`--task`). Không
  // có cái nào thì không có gì để so — mọi hit đều "trong phạm vi của chính
  // nó", không label.
  const referenceScope = explicitScope ?? task?.scope;

  // Không hard-filter theo scope khi chỉ có `--task` (không có `--scope`
  // tường minh, xem cách dùng `explicitScope` — không phải `referenceScope`
  // — trong lời gọi `searchFacts` bên dưới): search cả graph rồi LABEL hit
  // khác phạm vi bằng `referenceScope`, thay vì giấu nó. `src/render/brief.ts`
  // đã chọn đúng cách này cho fact khai tay (phạm vi xét TRƯỚC độ tươi, nhưng
  // không giấu) — nguyên tắc "một phát biểu chỉ đúng trong ranh giới phạm vi
  // của nó" không có nghĩa là fact ngoài phạm vi vô dụng, nó vẫn có thể là
  // gợi ý tốt, người đọc chỉ cần biết để tự kiểm lại.
  //
  // `--scope` tường minh thì NGƯỢC LẠI: hard-filter thật (đúng nghĩa "bó
  // trong một phạm vi" mà người dùng chủ động yêu cầu).

  const limitRaw = option(argv, "limit");
  const limit = limitRaw !== undefined ? Number(limitRaw) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new GanasError(`--limit phải là số nguyên dương, nhận được "${limitRaw}"`);
  }

  // Fact đã khai tay trong context_contract của task thì đã nằm trong brief
  // rồi — search chỉ có giá trị thêm khi trả về thứ CHƯA khai. exclude rỗng
  // khi không có --task, đúng ý "brief dùng để loại fact đã khai tay" của
  // module doc searchFacts.
  const exclude = task ? task.context_contract.facts : [];

  // Lấy TOÀN BỘ hit đạt ngưỡng (không giới hạn `limit` ở lớp search) rồi lớp
  // lệnh mới cắt + ghi chú phần còn lại — cùng khuôn `buildDebtRows` +
  // `renderDebtSection` ở `ganas debt`: cắt bớt PHẢI có ghi chú, không được
  // cắt im lặng.
  const all = searchFacts(graph, query, {
    scope: explicitScope,
    exclude,
    limit: Number.MAX_SAFE_INTEGER,
  });
  const shown = all.slice(0, limit);
  const omitted = all.length - shown.length;

  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          query,
          task: task?.id ?? null,
          scope: referenceScope ?? null,
          total: all.length,
          shown: shown.length,
          omitted,
          hits: shown.map((h) => {
            const state = freshness.get(h.factId);
            return {
              factId: h.factId,
              score: h.score,
              matchedTerms: h.matchedTerms,
              statement: h.fact.statement,
              scope: h.fact.scope,
              file: h.file,
              outOfScope: referenceScope !== undefined && h.fact.scope !== referenceScope,
              freshness: state?.freshness ?? null,
              freshnessReason: state?.reason ?? null,
            };
          }),
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  const shownQuery = displayQuery(query, task);

  if (shown.length === 0) {
    process.stdout.write(`Không tìm thấy fact nào khớp truy vấn ${shownQuery}.\n`);
    return 0;
  }

  const header = `${all.length} kết quả cho ${shownQuery}${referenceScope ? ` (phạm vi tham chiếu: ${referenceScope})` : ""}:\n\n`;
  const body = shown.map((h) => renderHit(h, freshness, referenceScope)).join("\n\n");
  let out = header + body + "\n";
  if (omitted > 0) {
    out += `\n… đã bỏ bớt ${omitted} mục (in ${shown.length}/${all.length}) — dùng \`--limit\` lớn hơn hoặc \`--json\` để lấy đủ.\n`;
  }
  process.stdout.write(out);
  return 0;
}
