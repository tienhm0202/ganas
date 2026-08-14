import { existsSync } from "node:fs";
import { join } from "node:path";

import type { FactFreshness } from "../graph/freshness.js";
import { openBlockers, parallelCandidates } from "../graph/select.js";
import type { Graph, Sourced } from "../graph/types.js";
import {
  agentModelAlias,
  canDispatchSubagent,
  type Claim,
  enforcementFor,
  formatAnchor,
  type Task,
} from "../model/index.js";
import { renderGroupedByScope } from "./group.js";

export interface BriefInput {
  graph: Graph;
  task: Sourced<Task>;
  freshness: Map<string, FactFreshness>;
  /**
   * Phần trạng thái biến động (nhánh git, thời điểm). Đặt CUỐI brief và tách
   * hẳn ra: prompt cache khớp theo tiền tố, một mốc thời gian ở đầu sẽ làm mọi
   * phiên miss cache.
   */
  volatile?: string | undefined;
}

const RULE_REMINDER = `## Luật ghi tri thức

Ghi vào \`.ganas/\` thì phải kèm bằng chứng: anchor \`file:line\`, \`commit:sha\`,
hoặc URL kèm \`fetched_at\`. Không có bằng chứng thì không ghi — nói thẳng là
chưa biết và đưa vào \`open_questions\`.

Không nâng claim thành fact nếu chưa chạy probe. Không sửa \`last_verified_at\`
bằng tay.`;

/**
 * Ngưỡng cảnh báo độ dài brief, tính theo ký tự (proxy thô cho token — văn
 * bản tiếng Việt/Anh/code lẫn lộn rơi vào khoảng 3-4 ký tự/token). Đo thực tế
 * trên fixture giàu nội dung trong test: task với 25 must_read + 20
 * open_questions + 8 module chạm tới ra ~10.8K ký tự (dưới ngưỡng); nhân đôi
 * số mục (50/40/15) ra ~20.5K (vượt rõ). 14K nằm giữa hai mốc đó — đủ cao để
 * không báo động với task có vài must_read/open_question bình thường, đủ
 * thấp để bắt được task đang phình to thật sự trước khi nó ăn hết context
 * mỗi phiên.
 */
const BRIEF_LENGTH_WARNING_CHARS = 14_000;

/**
 * Legacy claim liên quan tới task: cùng phạm vi VÀ anchor trỏ vào file mà task
 * phải đọc. Lọc phạm vi trước — một hiểu nhầm cũ về vùng code khác không phải
 * thứ phiên này cần cân nhắc.
 */
export function relevantLegacyClaims(graph: Graph, task: Task): Claim[] {
  const paths = new Set(task.context_contract.must_read.map((m) => m.path));
  const out: Claim[] = [];
  for (const sourced of graph.claims.values()) {
    const c = sourced.value;
    if (c.provenance !== "imported" || c.trust !== "unverified") continue;
    if (c.scope !== task.scope) continue;
    const touches = c.anchors.some((a) => a.kind === "file" && paths.has(a.path));
    if (touches) out.push(c);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function bullet(lines: string[]): string {
  return lines.map((l) => `- ${l}`).join("\n");
}

/**
 * Mục "Giao việc": biến `task.model` (một tier) thành hành động cụ thể của
 * harness đang dùng (`config.harness`).
 *
 * Tách hẳn khỏi mục kỹ năng vì đây không phải gợi ý mềm nữa: phiên chính đọc
 * brief là phiên ĐIỀU PHỐI. Trước đây brief chỉ in một dòng "Gợi ý giao việc:
 * model X" lẫn trong danh sách skill — và hệ quả quan sát được là task nào
 * cũng chạy thẳng ở phiên chính bằng model mạnh nhất, kể cả việc cơ học.
 */
function dispatchSection(graph: Graph, t: Task): string {
  const H = `## Giao việc`;

  if (!t.model) {
    return (
      `${H} — ⚠ chưa ai quyết ai làm\n\n` +
      `Task này chưa gán \`model\`. Nghĩa là lúc chẻ task không ai quyết nó khó tới đâu, ` +
      `nên mặc định phiên chính ôm hết bằng model mạnh nhất — kể cả việc cơ học.\n\n` +
      `Sửa file task trong \`.ganas/tasks/\`, thêm một dòng:\n\n` +
      `\`\`\`yaml\nmodel: main   # main = khó/mơ hồ · verifier = khoảng giữa · scribe = cơ học\n\`\`\`\n\n` +
      `Rồi \`ganas validate\` (luật \`spine/task-missing-model\`). ` +
      `Không đoán hộ ở đây: heuristic suy tier không đáng tin bằng người vừa chẻ task.`
    );
  }

  const modelId = graph.config.models[t.model];

  if (!canDispatchSubagent(graph.config.harness)) {
    return (
      `${H}\n\n` +
      `Tier \`${t.model}\` → model \`${modelId}\`.\n\n` +
      `Harness khai trong \`config.yaml\` là \`${graph.config.harness}\`: ganas nối vào đó qua MCP, ` +
      `mà MCP không tạo được agent con và không đổi được model của phiên. ` +
      `Đổi model sang \`${modelId}\` trong picker trước khi làm, hoặc mở một phiên riêng bằng model đó.\n\n` +
      `> **Đây là khuyến nghị, không phải hàng rào** — ganas không kiểm được bạn có đổi hay không. ` +
      `Đừng ghi vào \`.ganas/\` rằng task đã chạy đúng tier.`
    );
  }

  const alias = agentModelAlias(modelId);
  const modelArg = alias ? `\`model: "${alias}"\`` : `model \`${modelId}\``;

  return (
    `${H} — task này KHÔNG chạy thẳng ở phiên chính\n\n` +
    `Tier \`${t.model}\` → model \`${modelId}\` (${modelArg}).\n\n` +
    `Phiên chính là người ĐIỀU PHỐI: chọn task, đọc brief, giao việc, chấm gate, commit. ` +
    `Phần sửa code của task này chạy trong sub-agent riêng:\n\n` +
    bullet([
      `Tạo sub-agent với ${modelArg}.`,
      `Prompt mở đầu bằng \`ganas brief ${t.id}\` — để sub-agent tự lấy đúng brief này, ` +
        `đừng chép tay lại (chép tay là chỗ brief bị bóp méo).`,
      `Sub-agent xong thì phiên chính chạy \`ganas gate\` để chấm. ` +
        `Chấm bằng lệnh, không bằng lời tổng kết của sub-agent.`,
    ]) +
    `\n\nHai lý do, không phải một: context phiên chính không bị chi tiết thực thi nuốt mất, ` +
    `và tier thấp không nghĩ quá tay cho việc cơ học.\n\n` +
    parallelBlock(graph, t) +
    `> Nếu BẠN ĐANG LÀ sub-agent nhận chính task này: làm luôn, đừng giao tiếp nữa.`
  );
}

/**
 * Danh sách task giao song song được — chỉ dựng cho harness tạo được sub-agent.
 *
 * Điều kiện an toàn do `parallelCandidates()` quyết (vùng code rời nhau, không
 * chặn nhau). Ở đây chỉ trình bày, KHÔNG nới thêm: một task không nằm trong
 * danh sách này thì không được giao kèm, kể cả khi trông có vẻ độc lập.
 */
function parallelBlock(graph: Graph, t: Task): string {
  const others = parallelCandidates(graph, t);
  if (others.length === 0) return "";

  const grouped = renderGroupedByScope(
    graph,
    others,
    (o) => o.value,
    (o) => {
      const task = o.value;
      const tier = task.model ? `tier \`${task.model}\`` : `⚠ chưa gán model`;
      const alias = task.model ? agentModelAlias(graph.config.models[task.model]) : undefined;
      return (
        `\`${task.id}\` — ${task.title}\n  ${tier}${alias ? ` → \`model: "${alias}"\`` : ""} · ` +
        `khối ${task.touches.map((m) => `\`${m}\``).join(", ")}`
      );
    },
  );

  return (
    `**Giao được song song ngay bây giờ** — các task dưới đây không chặn nhau và ` +
    `KHÔNG đụng cùng vùng code với task này. Mở mỗi cái một sub-agent riêng, cùng lúc, ` +
    `mỗi sub-agent tự chạy \`ganas brief <id>\` trước khi sửa gì:\n\n` +
    grouped +
    `\nChấm từng cái bằng \`ganas gate <id>\` sau khi sub-agent tương ứng xong. ` +
    `**Chỉ những task có tên ở đây** — task khác chạm cùng vùng code, giao song song thì ` +
    `sửa đổi của agent này bị agent kia đè mà không ai thấy.\n\n`
  );
}

/**
 * Dựng brief cho một task.
 *
 * Bố cục cố định và không phụ thuộc thời gian: cùng một task + cùng một trạng
 * thái kho tri thức ⇒ cùng một chuỗi. Đó là điều kiện để `SessionStart` bơm
 * được vào context mà không phá prompt cache.
 */
export function renderBrief(input: BriefInput): string {
  const { graph, task: sourced, freshness } = input;
  const t = sourced.value;
  const parts: string[] = [];

  /* --- Đầu đề ---------------------------------------------------------- */

  const design = graph.designs.get(t.implements);
  parts.push(
    `# ${t.id} — ${t.title}\n\n` +
      `phạm vi \`${t.scope}\` · design \`${t.implements}\` · phục vụ ${t.serves.map((g) => `\`${g}\``).join(", ")}` +
      (t.status === "in_progress"
        ? `\n\n**Đây là việc đang dở** — nối tiếp, đừng bắt đầu lại.`
        : ""),
  );

  const blockers = openBlockers(graph, t);
  if (blockers.length > 0) {
    parts.push(
      `> ⛔ Task này đang bị chặn bởi: ${blockers.join(", ")}.\n` +
        `> Làm xong những task đó trước, hoặc báo lại cho người phụ trách.`,
    );
  }

  /* --- Mục tiêu -------------------------------------------------------- */

  /* --- Phạm vi công việc: ranh giới của cả việc lẫn tri thức -------------- */

  const scope = graph.scopes.get(t.scope);
  if (!scope) {
    parts.push(
      `## Phạm vi công việc\n\n` +
        `⚠ Task khai \`scope: ${t.scope}\` nhưng phạm vi đó **KHÔNG TỒN TẠI** ` +
        `(graph đang hỏng, chạy \`ganas validate\`).`,
    );
  } else {
    const sc = scope.value;
    const members = sc.modules.map((id) => {
      const mod = graph.modules.get(id)?.value;
      const where = mod ? [...mod.paths, ...mod.entrypoints] : [];
      return (
        `\`${id}\`${mod ? ` — ${mod.title}` : " — ⚠ KHÔNG TÌM THẤY"}` +
        (where.length ? `\n  ${where.map((p) => `\`${p}\``).join(", ")}` : "")
      );
    });

    const acceptance = sc.acceptance.map((a) => {
      const info = freshness.get(`${sc.id}/${a.id}`);
      const state = info ? `${info.freshness} — ${info.reason}` : "chưa tính được độ tươi";
      return `\`${a.id}\` (${a.kind}) — ${state}`;
    });

    parts.push(
      `## Phạm vi công việc\n\n` +
        `### ${sc.id} — ${sc.title}\n\n` +
        `phiên bản \`${sc.version}\` · trạng thái \`${sc.status}\`` +
        (sc.owner ? ` · nghiệm thu: ${sc.owner}` : " · ⚠ chưa ai ký nghiệm thu") +
        // Bối cảnh phạm vi — cái gì trong, cái gì ngoài, đã hỏi ai. Đặt TRƯỚC
        // ranh giới code: nó là thứ định khung cho mọi thứ đọc sau đó.
        (sc.notes ? `\n\n${sc.notes.trim()}` : "") +
        `\n\n**Ranh giới code:**\n${bullet(members)}` +
        (acceptance.length
          ? `\n\n**Nghiệm thu luồng ghép:**\n${bullet(acceptance)}`
          : `\n\n⚠ Phạm vi này chưa có tiêu chí nghiệm thu nào — "bàn giao xong" sẽ là ý kiến.`) +
        `\n\n> Mọi phát biểu bên dưới chỉ được coi là đúng **trong phạm vi này**.\n` +
        `> Ra ngoài là **chưa biết** — không phải sai, mà là chưa ai kiểm.`,
    );
  }

  const goalBlocks: string[] = [];
  for (const goalId of t.serves) {
    const goal = graph.goals.get(goalId)?.value;
    if (!goal) {
      goalBlocks.push(
        `### ${goalId} — ⚠ KHÔNG TÌM THẤY (graph đang hỏng, chạy \`ganas validate\`)`,
      );
      continue;
    }
    const criteria = goal.acceptance.map((a) =>
      a.kind === "command" ? `\`${a.run}\`` : `${a.check} — người xác nhận: ${a.owner}`,
    );
    goalBlocks.push(
      `### ${goal.id} — ${goal.title}\n\n` +
        `Kết quả mong đợi: ${goal.outcome}\n\n` +
        `Nghiệm thu:\n${bullet(criteria)}`,
    );
  }
  parts.push(`## Mục tiêu đang phục vụ\n\n${goalBlocks.join("\n\n")}`);

  /* --- Design ---------------------------------------------------------- */

  if (design) {
    parts.push(
      `## Design đang hiện thực\n\n` +
        `### ${design.value.id} — ${design.value.title}\n\n${design.value.summary}`,
    );
  }

  /* --- Quyết định đã chốt ------------------------------------------------ *
   * Hai đường vào, hợp lại: design dẫn tường minh, VÀ mọi decision áp cho
   * phạm vi này (kể cả decision không scope — thiếu scope = áp toàn dự án).
   * Trước N15 chỉ có đường qua `design.decisions`, nên một ràng buộc người đã
   * chốt mà design quên dẫn thì không bao giờ tới được phiên làm việc. */

  const decisionIds = new Set(design?.value.decisions ?? []);
  for (const sourced of graph.decisions.values()) {
    const d = sourced.value;
    if (d.scope === undefined || d.scope === t.scope) decisionIds.add(d.id);
  }

  const decisions = [...decisionIds]
    .sort((a, b) => a.localeCompare(b))
    .map((id) => graph.decisions.get(id)?.value)
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .map((d) => {
      // Bộ ba ADR: `context` (điều gì buộc phải chọn) và `consequence` (phải
      // sống với gì) được thêm ở N12 nhưng chưa bao giờ được in ra — tức là
      // người viết bỏ công ghi mà phiên làm việc không bao giờ đọc được.
      // Không có chúng, model chỉ thấy KẾT LUẬN mà không thấy ràng buộc sinh ra
      // nó, nên rất dễ đề xuất lại đúng cái đã bị loại.
      const detail: string[] = [];
      if (d.context) detail.push(`  vì: ${d.context}`);
      if (d.consequence) detail.push(`  đánh đổi: ${d.consequence}`);
      if (d.link) detail.push(`  nguồn: ${d.link}`);
      return (
        `\`${d.id}\` — ${d.statement} *(${d.decided_by}, ${d.decided_at.slice(0, 10)}` +
        `${d.scope === undefined ? ", toàn dự án" : ""})*` +
        (detail.length ? `\n${detail.join("\n")}` : "")
      );
    });

  if (decisions.length > 0) {
    parts.push(
      `## Quyết định đã chốt — không được đi ngược\n\n` +
        `Người đã quyết. Model không được tạo, không được sửa — chỉ tuân theo, ` +
        `hoặc nêu mâu thuẫn để người xử lý.\n\n` +
        bullet(decisions),
    );
  }

  /* --- Phải đọc -------------------------------------------------------- */

  if (t.context_contract.must_read.length > 0) {
    const items = t.context_contract.must_read.map((m) => {
      const missing = !existsSync(join(graph.root, m.path));
      return `\`${m.path}\`${missing ? " — ⚠ **KHÔNG TỒN TẠI**" : ""}\n  ${m.why}`;
    });
    parts.push(`## Phải đọc trước khi sửa gì\n\n${bullet(items)}`);
  }

  /* --- Khối chạm tới: suy từ sơ đồ, không phải tay khai ----------------- */

  if (t.touches.length > 0) {
    const items = t.touches.map((moduleId) => {
      const mod = graph.modules.get(moduleId)?.value;
      if (!mod) return `\`${moduleId}\` — ⚠ **KHÔNG TÌM THẤY** trong sơ đồ khối`;
      const locations = [...mod.paths, ...mod.entrypoints];
      return (
        `\`${moduleId}\` — ${mod.title}` +
        (locations.length
          ? `\n  ${locations.map((p) => `\`${p}\``).join(", ")}`
          : "\n  (chưa khai paths/entrypoints)")
      );
    });
    parts.push(`## Khối chạm tới (suy từ sơ đồ)\n\n${bullet(items)}`);
  }

  /* --- Tri thức: ba mục tách bạch --------------------------------------- */

  const usable: string[] = [];
  const needsRecheck: string[] = [];
  const outOfScope: string[] = [];

  for (const factId of t.context_contract.facts) {
    const info = freshness.get(factId);
    if (!info) {
      needsRecheck.push(`\`${factId}\` — ⚠ **KHÔNG TÌM THẤY** trong kho tri thức`);
      continue;
    }
    const f = info.fact;
    if (!f) continue;

    const anchors = f.anchors.length ? `  nguồn: ${f.anchors.map(formatAnchor).join(", ")}\n` : "";

    // Phạm vi xét TRƯỚC độ tươi: một fact tươi nhưng thuộc phạm vi khác vẫn
    // không nói gì về vùng đang làm. Nhưng nó KHÔNG bị giấu — đổi "ảo giác"
    // lấy "quên" là cùng một tổn thất, chỉ khó phát hiện hơn.
    if (f.scope !== t.scope) {
      outOfScope.push(
        `\`${f.id}\` — ${f.statement}\n${anchors}` +
          `  LÝ DO: phạm vi \`${f.scope}\` ≠ \`${t.scope}\` — chưa chắc đúng ở đây` +
          (info.freshness === "fresh" ? "" : ` (và: ${info.reason})`) +
          `\n  kiểm lại trong phạm vi này rồi hãy dựa vào: \`ganas verify ${f.id}\``,
      );
      continue;
    }

    if (info.freshness === "fresh") {
      usable.push(`\`${f.id}\` — ${f.statement}\n${anchors}  ${info.reason}`);
      continue;
    }

    // Nói ĐÚNG lý do, không nói chung chung "đã cũ": "model đã đổi" và "file đã
    // sửa" dẫn tới hai hành động khác nhau.
    const trend =
      info.recentScores && info.recentScores.length > 1
        ? `\n  điểm các lần gần đây: ${info.recentScores.map((s) => s.toFixed(2)).join(" → ")}`
        : "";

    needsRecheck.push(
      `\`${f.id}\` — ${f.statement}\n${anchors}` +
        `  LÝ DO: ${info.reason}${trend}\n` +
        `  ${info.action ?? `chạy: \`ganas verify ${f.id}\``}`,
    );
  }

  if (usable.length > 0) {
    parts.push(`## Tri thức dùng được (đã kiểm chứng, còn tươi)\n\n${bullet(usable)}`);
  }

  if (needsRecheck.length > 0) {
    parts.push(
      `## ⚠ CẦN VERIFY LẠI TRƯỚC KHI DÙNG\n\n` +
        `Những điều dưới đây **không** được coi là sự thật cho tới khi chạy lại probe.\n` +
        `Nếu công việc phụ thuộc vào chúng, verify trước rồi hãy sửa code.\n\n` +
        bullet(needsRecheck),
    );
  }

  if (outOfScope.length > 0) {
    parts.push(
      `## ⚠ NGOÀI PHẠM VI — CHƯA CHẮC ĐÚNG Ở ĐÂY\n\n` +
        `Những điều dưới đây đã được kiểm chứng, nhưng **trong một phạm vi khác**.\n` +
        `Chúng không sai — chỉ là chưa ai kiểm rằng chúng còn đúng trong \`${t.scope}\`.\n` +
        `Đừng dựa vào chúng như sự thật ở đây; muốn dùng thì kiểm lại trong phạm vi này.\n\n` +
        bullet(outOfScope),
    );
  }

  const legacy = relevantLegacyClaims(graph, t);
  const totalUnverifiedLegacy = [...graph.claims.values()].filter(
    (c) => c.value.provenance === "imported" && c.value.trust === "unverified",
  ).length;
  const otherLegacy = totalUnverifiedLegacy - legacy.length;

  if (legacy.length > 0 || otherLegacy > 0) {
    const items = legacy.map(
      (c) =>
        `\`${c.id}\` — ${c.statement}\n  tài liệu cũ nói vậy: ${c.anchors.map(formatAnchor).join(", ")}`,
    );
    // Nêu cả phần KHÔNG hiển thị: im lặng bỏ qua tri thức kế thừa sẽ tạo cảm
    // giác sai rằng tài liệu cũ đã được xử lý hết.
    const rest =
      otherLegacy > 0
        ? `\n\nCòn ${otherLegacy} phát biểu kế thừa khác chưa được đối chất, không liên quan trực tiếp ` +
          // Phải nêu CẢ HAI thư mục: claim `imported` được nạp từ `claims/` lẫn
          // `legacy/imported/` (graph/load.ts) và không luật nào ép nó nằm ở
          // đâu. Chỉ một chỗ là chỉ sai chỗ cho một nửa trường hợp — cùng loại
          // lỗi với việc trỏ vào một lệnh không tồn tại, chỉ nhẹ hơn.
          `tới task này (xem \`.ganas/claims/\` và \`.ganas/legacy/imported/\`).`
        : "";

    parts.push(
      `## ⚠ TRI THỨC KẾ THỪA — CHƯA KIỂM CHỨNG\n\n` +
        `Đây là điều **tài liệu cũ** nói. Chưa ai đối chất với code thật. ` +
        `Có thể đúng, có thể là hiểu nhầm đã tồn tại lâu.\n` +
        `Dùng thì phải kiểm trước, và ghi lại kết quả kiểm.` +
        (items.length ? `\n\n${bullet(items)}` : "") +
        rest,
    );
  }

  if (t.context_contract.open_questions.length > 0) {
    parts.push(
      `## Câu hỏi còn mở\n\n` +
        `Chưa ai trả lời. **Đừng tự quyết** — hỏi lại, hoặc ghi giả định vào handoff.\n\n` +
        bullet(t.context_contract.open_questions),
    );
  }

  /* --- Kỹ năng ---------------------------------------------------------- */

  const skillSet = new Set(t.skills);
  for (const moduleId of t.touches) {
    const mod = graph.modules.get(moduleId)?.value;
    if (!mod) continue;
    for (const s of mod.skills) skillSet.add(s);
  }

  if (skillSet.size > 0) {
    parts.push(
      `## Kỹ năng cần dùng cho task này\n\n${bullet([...skillSet].map((s) => `\`/${s}\``))}`,
    );
  }

  /* --- Giao việc -------------------------------------------------------- */

  parts.push(dispatchSection(graph, t));

  /* --- Điều kiện hoàn thành -------------------------------------------- */

  const auto: string[] = [];
  const manual: string[] = [];
  for (const c of t.exit_contract) {
    switch (c.kind) {
      case "command":
        auto.push(`lệnh \`${c.run}\``);
        break;
      case "artifact":
        auto.push(
          `file \`${c.path}\`` +
            (c.must_contain ? ` phải chứa \`${c.must_contain}\`` : " phải tồn tại"),
        );
        break;
      case "handoff":
        if (c.required) auto.push(`handoff record của phiên này`);
        break;
      case "manual":
        manual.push(c.check);
        break;
      case "verification":
        auto.push(`bằng chứng \`${c.target}\``);
        break;
      default:
        // Bắt buộc TS báo lỗi biên dịch nếu `ExitCriterion` thêm `kind` mới mà
        // quên xử lý ở đây — đúng lỗi vừa xảy ra với `verification` (N7 thêm
        // kind mới, switch này không được cập nhật, brief âm thầm bỏ sót tiêu
        // chí mà không ai biết cho tới khi đọc kỹ).
        c satisfies never;
    }
  }

  const mode = enforcementFor(graph.config, "exit_contract");
  const gateNote =
    mode === "enforce"
      ? `Stop hook sẽ chấm những mục dưới đây. **Chưa thoả thì phiên không kết thúc được.**`
      : `Stop hook sẽ chấm những mục dưới đây và cảnh báo nếu chưa thoả (chế độ warn — chưa chặn).`;

  parts.push(
    `## Điều kiện hoàn thành\n\n${gateNote}\n\n` +
      bullet(auto.map((a) => `[ ] ${a}`)) +
      (manual.length
        ? `\n\nCần người xác nhận (không chặn phiên, nhưng chặn việc đánh dấu task done):\n` +
          bullet(manual)
        : ""),
  );

  parts.push(RULE_REMINDER);

  /* --- Cảnh báo độ dài: đo trên phần ỔN ĐỊNH, trước khi thêm phần biến động,
   * chèn ngay sau đầu đề để không bị chôn dưới cả chục mục khác ------------ */

  const stable = parts.join("\n\n");
  if (stable.length > BRIEF_LENGTH_WARNING_CHARS) {
    const approxLines = stable.split("\n").length;
    parts.splice(
      1,
      0,
      `> ⚠ Brief này dài ~${stable.length} ký tự (~${approxLines} dòng) — cân nhắc chẻ nhỏ task/design, hoặc\n` +
        `> gọn bớt \`context_contract.must_read\`.`,
    );
  }

  /* --- Phần biến động: luôn ở CUỐI -------------------------------------- */

  if (input.volatile) {
    parts.push(`---\n\n${input.volatile}`);
  }

  return parts.join("\n\n");
}
