import type { Graph } from "./graph/types.js";
import type { Fact, Task } from "./model/index.js";

/**
 * BM25 trên fact — thuần túy, không I/O, không async. Cùng hạng với
 * `debt.ts`/`boundary.ts`: nhận graph đã nạp sẵn trong bộ nhớ, chấm điểm, trả
 * mảng. Việc đọc file/ghi kết quả là của lớp gọi (`src/commands/search.ts`).
 *
 * VÌ SAO BM25 trên kho có cấu trúc, không phải trên văn xuôi markdown/embeddings:
 * `loadGraph` đã nạp TOÀN BỘ fact vào `graph.facts` (một `Map`, không phân
 * trang) để phục vụ validate/brief — chấm điểm ở đây chỉ là duyệt lại đúng Map
 * đó, không thêm I/O, không thêm dependency. Embeddings cần một mô hình ngoài
 * (vi phạm "không dependency mới"); BM25 trên văn xuôi markdown thô đánh mất
 * cấu trúc trường (statement/notes/verify/depends_on có trọng lượng ngữ nghĩa
 * khác nhau, gộp phẳng thì lẫn lộn). Ba hướng này đã bị loại có lý do, đừng
 * đề xuất lại.
 *
 * CHỈ index fact — claim/decision không có `depends_on`/độ tươi, mà ràng buộc
 * cứng của việc này là mọi kết quả phải nói được độ tươi (xem
 * `src/commands/search.ts`, dùng `computeFreshness`).
 */

/* ------------------------------------------------------------------------- *
 * Tokenize — phải xử lý được tiếng Việt và đường dẫn/mã định danh
 * ------------------------------------------------------------------------- */

/**
 * Ký tự tổ hợp Unicode (dấu thanh, dấu mũ...) sau khi NFD tách chữ cái gốc ra
 * khỏi dấu. Bóc lớp này là cách tokenize tiếng Việt rẻ nhất không cần thư viện
 * ngoài: "khách" → NFD → "kha" + dấu sắc + "ch" → bỏ dấu → "khach".
 */
const COMBINING_MARKS = /\p{M}/gu;

/**
 * "đ"/"Đ" KHÔNG tách được bằng NFD — nó là một chữ cái riêng của tiếng Việt,
 * không phải "d" + dấu tổ hợp (khác hẳn "â", "ê", "ô"...). Không bù riêng chỗ
 * này thì "đường dẫn" và "duong dan" (ai gõ không dấu) không bao giờ khớp
 * nhau — chi phí gần như 0, lợi ích cho truy vấn gõ tay là thật, nên thêm dù
 * đề bài không nhắc tường minh.
 */
const D_WITH_STROKE = /đ/g;
const D_WITH_STROKE_UPPER = /Đ/g;

/**
 * Một "cụm" ký tự chữ/số, cho phép NỐI bằng `-`, `_`, `.`, `/` ở giữa (không ở
 * đầu/cuối) — đúng hình dạng của id (`T-017`), đường dẫn
 * (`src/graph/load.ts`), tên biến rắn (`zalo_oa`).
 */
const COMPOUND = /[a-z0-9]+(?:[-_./][a-z0-9]+)*/g;
const SEPARATOR = /[-_./]/;

/** Token dài 1 ký tự bị loại — quá nhiễu để mang tín hiệu (xem giải thích ở đầu file). */
const MIN_TOKEN_LEN = 2;

/**
 * Tách văn bản thành token, chuẩn hoá tiếng Việt (hạ chữ thường, bỏ dấu) và
 * SINH CẢ token nguyên lẫn các mảnh con của mọi cụm có gạch/gạch dưới/chấm/
 * gạch chéo — thiếu mảnh con thì tra theo đường dẫn file (`load.ts`, `graph`)
 * sẽ trượt vì tài liệu chỉ có bản nguyên `src/graph/load.ts`.
 *
 * Truy vấn và tài liệu (fact) đi qua ĐÚNG hàm này, không hàm nào khác, để hai
 * bên chuẩn hoá nhất quán — sai một ly ở đây (vd query bỏ dấu, doc không bỏ)
 * là toàn bộ điểm số vô nghĩa.
 *
 * CỐ TÌNH không dedupe: một từ lặp lại nhiều lần trong CÙNG một đoạn văn bản
 * phải trả về nhiều lần, vì tần suất trong tài liệu (term frequency) là đầu
 * vào trực tiếp của BM25 — dedupe ở đây sẽ làm mọi tài liệu trông như "mỗi từ
 * xuất hiện đúng 1 lần", triệt tiêu chính tín hiệu BM25 cần.
 */
export function tokenize(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(D_WITH_STROKE, "d")
    .replace(D_WITH_STROKE_UPPER, "d")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "");

  const tokens: string[] = [];
  for (const compound of normalized.match(COMPOUND) ?? []) {
    if (compound.length >= MIN_TOKEN_LEN) tokens.push(compound);
    if (SEPARATOR.test(compound)) {
      for (const frag of compound.split(SEPARATOR)) {
        if (frag.length >= MIN_TOKEN_LEN) tokens.push(frag);
      }
    }
  }
  return tokens;
}

/* ------------------------------------------------------------------------- *
 * Tài liệu của một fact
 * ------------------------------------------------------------------------- */

/**
 * Gộp mọi trường mang tín hiệu tra cứu của một fact thành một chuỗi.
 *
 * `statement` là trường chính (điều fact phát biểu). `notes` là ngữ cảnh
 * thêm, tuỳ chọn. `verify.run` là lệnh probe — thường chứa tên file/lệnh, tín
 * hiệu MẠNH cho truy vấn kiểu "cái gì kiểm chỗ này". `depends_on` là glob
 * đường dẫn — cực mạnh cho câu hỏi "fact nào liên quan tới file tôi đang
 * sửa", đúng nhu cầu chính của việc này (README hứa: phiên sau không phải
 * khám phá lại điều phiên trước đã kiểm chứng TRONG CÙNG PHẠM VI).
 */
function factDocument(fact: Fact): string {
  const parts = [fact.statement, fact.notes ?? "", fact.verify.run, ...fact.depends_on];
  return parts.join(" \n ");
}

/* ------------------------------------------------------------------------- *
 * BM25
 * ------------------------------------------------------------------------- */

/**
 * Hằng số kinh điển (Robertson/Sparck Jones, dùng lại nguyên trong Lucene/
 * Elasticsearch mặc định) — KHÔNG tự chỉnh: kho fact ở đây nhỏ và không có
 * benchmark riêng để tune, tự đặt số khác chỉ là đoán mò trông có vẻ khoa học
 * hơn. `k1` = độ bão hoà của tần suất từ trong tài liệu (từ lặp thêm vẫn tăng
 * điểm nhưng giảm dần). `b` = mức phạt tài liệu dài hơn trung bình.
 */
const K1 = 1.2;
const B = 0.75;

interface FactDoc {
  factId: string;
  fact: Fact;
  file: string;
  /** term → số lần xuất hiện trong tài liệu của fact này. */
  termFreq: Map<string, number>;
  length: number;
}

function buildDoc(factId: string, fact: Fact, file: string): FactDoc {
  const tokens = tokenize(factDocument(fact));
  const termFreq = new Map<string, number>();
  for (const t of tokens) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
  return { factId, fact, file, termFreq, length: tokens.length };
}

/**
 * IDF dạng Lucene/Elasticsearch: `ln(1 + (N - df + 0.5) / (df + 0.5))`.
 *
 * Cộng thêm `1` TRONG log so với công thức Robertson gốc
 * (`ln((N - df + 0.5) / (df + 0.5))`) để tránh IDF ÂM khi một term xuất hiện
 * trong hơn nửa số tài liệu — với kho fact nhỏ (vài chục, vài trăm bản ghi),
 * một từ phổ biến (vd tên dự án lặp trong mọi statement) rất dễ rơi vào ca
 * này; IDF âm sẽ làm term đó KÉO điểm xuống thay vì chỉ không cộng gì, một
 * hành vi phản trực giác mà dạng cộng-1 tránh được.
 */
function idf(df: number, n: number): number {
  return Math.log(1 + (n - df + 0.5) / (df + 0.5));
}

/* ------------------------------------------------------------------------- *
 * API công khai
 * ------------------------------------------------------------------------- */

export interface SearchHit {
  factId: string;
  score: number;
  /** Các token truy vấn thực sự khớp — dùng để giải thích và để lọc ngưỡng. */
  matchedTerms: string[];
  fact: Fact;
  /** `Sourced.file`, để in cho người tra. */
  file: string;
}

const DEFAULT_LIMIT = 10;
/**
 * Mặc định 2 — LÝ DO không dùng ngưỡng điểm tuyệt đối: điểm BM25 không chuẩn
 * hoá (phụ thuộc N và độ dài trung bình tài liệu), nên một hằng số kiểu
 * "score >= 3.0" sẽ vỡ ngay khi kho fact to lên hay nhỏ đi — dự án 20 fact và
 * dự án 2000 fact cho ra thang điểm khác hẳn nhau cho CÙNG một mức liên quan.
 * "Khớp ít nhất 2 từ truy vấn khác nhau" thì ổn định theo kích thước kho VÀ
 * giải thích được cho người đọc kết quả ("vì sao hit này lọt vào") — cả hai
 * điều mà một ngưỡng điểm tuyệt đối không cho được.
 */
const DEFAULT_MIN_MATCHED_TERMS = 2;

export interface SearchOptions {
  /** Mặc định 10. */
  limit?: number;
  /** Chỉ fact thuộc scope này. */
  scope?: string;
  /** id fact bỏ qua (brief dùng để loại fact đã khai tay trong context_contract.facts). */
  exclude?: readonly string[];
  /** Mặc định 2 — xem `DEFAULT_MIN_MATCHED_TERMS`. */
  minMatchedTerms?: number;
}

/**
 * BM25 trên `graph.facts`, lọc theo `scope`/`exclude`, sắp giảm dần theo
 * điểm, tie-break bằng `factId` để TẤT ĐỊNH (cùng graph + cùng truy vấn phải
 * luôn ra đúng một thứ tự — test và cache prompt của phiên sau đều dựa vào
 * điều này).
 *
 * Thống kê BM25 (IDF, độ dài trung bình tài liệu) tính TRÊN TẬP ĐÃ LỌC theo
 * `scope`/`exclude`, không phải trên toàn graph: đây chính là không gian đang
 * được tìm, và một scope nhỏ có phân bố từ khác hẳn toàn dự án — tính IDF
 * trên tập không liên quan sẽ chấm điểm sai lệch cho đúng tập đang cần đúng.
 */
export function searchFacts(graph: Graph, query: string, opts: SearchOptions = {}): SearchHit[] {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const exclude = new Set(opts.exclude ?? []);

  const docs: FactDoc[] = [];
  for (const [factId, sourced] of graph.facts) {
    if (exclude.has(factId)) continue;
    if (opts.scope !== undefined && sourced.value.scope !== opts.scope) continue;
    docs.push(buildDoc(factId, sourced.value, sourced.file));
  }
  if (docs.length === 0) return [];

  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) return [];

  // Truy vấn một token: hạ ngưỡng xuống 1, không thì MỌI truy vấn một từ đều
  // câm (không có gì "khớp ít nhất 2 từ khác nhau" khi truy vấn chỉ có 1 từ).
  const minMatched =
    opts.minMatchedTerms ?? (queryTerms.length === 1 ? 1 : DEFAULT_MIN_MATCHED_TERMS);

  const n = docs.length;
  const avgLength = docs.reduce((sum, d) => sum + d.length, 0) / n;

  const df = new Map<string, number>();
  for (const term of queryTerms) {
    let count = 0;
    for (const doc of docs) if (doc.termFreq.has(term)) count++;
    df.set(term, count);
  }

  const hits: SearchHit[] = [];
  for (const doc of docs) {
    let score = 0;
    const matchedTerms: string[] = [];

    for (const term of queryTerms) {
      const f = doc.termFreq.get(term) ?? 0;
      if (f === 0) continue;
      matchedTerms.push(term);

      const termIdf = idf(df.get(term)!, n);
      const denom = f + K1 * (1 - B + B * (doc.length / (avgLength || 1)));
      score += termIdf * ((f * (K1 + 1)) / denom);
    }

    if (matchedTerms.length < minMatched) continue;

    hits.push({ factId: doc.factId, score, matchedTerms, fact: doc.fact, file: doc.file });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.factId < b.factId ? -1 : a.factId > b.factId ? 1 : 0;
  });

  return hits.slice(0, limit);
}

/**
 * Dựng chuỗi truy vấn từ một task — dùng chung cho `ganas search --task` VÀ
 * brief (agent nối brief vào ngay sau việc này), để hai nơi không lỡ nói lệch
 * nhau về "truy vấn của một task nghĩa là gì".
 *
 * Gộp `title` (mô tả việc cần làm), đường dẫn trong `context_contract.
 * must_read` (những gì phiên NÀY đã biết là phải đọc — fact liên quan tới
 * cùng file rất đáng chú ý), và `open_questions` (câu hỏi treo — fact trả lời
 * được câu hỏi này chính là thứ đang tìm).
 */
export function taskQuery(task: Task): string {
  const parts = [
    task.title,
    ...task.context_contract.must_read.map((m) => m.path),
    ...task.context_contract.open_questions,
  ];
  return parts.join(" \n ");
}
