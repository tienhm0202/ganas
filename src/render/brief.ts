import { existsSync } from "node:fs";
import { join } from "node:path";
import { formatAnchor, enforcementFor, type Claim, type Task } from "../model/index.js";
import type { Graph, Sourced } from "../graph/types.js";
import type { FactFreshness } from "../graph/freshness.js";
import { openBlockers } from "../graph/select.js";

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

/** Legacy claim liên quan tới task: anchor trỏ vào file mà task phải đọc. */
export function relevantLegacyClaims(graph: Graph, task: Task): Claim[] {
  const paths = new Set(task.context_contract.must_read.map((m) => m.path));
  const out: Claim[] = [];
  for (const sourced of graph.claims.values()) {
    const c = sourced.value;
    if (c.provenance !== "imported" || c.trust !== "unverified") continue;
    const touches = c.anchors.some((a) => a.kind === "file" && paths.has(a.path));
    if (touches) out.push(c);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function bullet(lines: string[]): string {
  return lines.map((l) => `- ${l}`).join("\n");
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
      `sprint \`${t.sprint}\` · design \`${t.implements}\` · phục vụ ${t.serves.map((g) => `\`${g}\``).join(", ")}` +
      (t.status === "in_progress" ? `\n\n**Đây là việc đang dở** — nối tiếp, đừng bắt đầu lại.` : ""),
  );

  const blockers = openBlockers(graph, t);
  if (blockers.length > 0) {
    parts.push(
      `> ⛔ Task này đang bị chặn bởi: ${blockers.join(", ")}.\n` +
        `> Làm xong những task đó trước, hoặc báo lại cho người phụ trách.`,
    );
  }

  /* --- Mục tiêu -------------------------------------------------------- */

  const goalBlocks: string[] = [];
  for (const goalId of t.serves) {
    const goal = graph.goals.get(goalId)?.value;
    if (!goal) {
      goalBlocks.push(`### ${goalId} — ⚠ KHÔNG TÌM THẤY (graph đang hỏng, chạy \`ganas validate\`)`);
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
    const decisions = design.value.decisions
      .map((id) => graph.decisions.get(id)?.value)
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .map((d) => `${d.id} — ${d.statement} *(${d.decided_by}, ${d.decided_at.slice(0, 10)})*`);

    parts.push(
      `## Design đang hiện thực\n\n` +
        `### ${design.value.id} — ${design.value.title}\n\n${design.value.summary}` +
        (decisions.length
          ? `\n\n**Quyết định đã chốt — không được đi ngược:**\n${bullet(decisions)}`
          : ""),
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

  for (const factId of t.context_contract.facts) {
    const info = freshness.get(factId);
    if (!info) {
      needsRecheck.push(`\`${factId}\` — ⚠ **KHÔNG TÌM THẤY** trong kho tri thức`);
      continue;
    }
    const f = info.fact;
    if (!f) continue;

    const anchors = f.anchors.length ? `  nguồn: ${f.anchors.map(formatAnchor).join(", ")}\n` : "";

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

  const legacy = relevantLegacyClaims(graph, t);
  const totalUnverifiedLegacy = [...graph.claims.values()].filter(
    (c) => c.value.provenance === "imported" && c.value.trust === "unverified",
  ).length;
  const otherLegacy = totalUnverifiedLegacy - legacy.length;

  if (legacy.length > 0 || otherLegacy > 0) {
    const items = legacy.map(
      (c) => `\`${c.id}\` — ${c.statement}\n  tài liệu cũ nói vậy: ${c.anchors.map(formatAnchor).join(", ")}`,
    );
    // Nêu cả phần KHÔNG hiển thị: im lặng bỏ qua tri thức kế thừa sẽ tạo cảm
    // giác sai rằng tài liệu cũ đã được xử lý hết.
    const rest =
      otherLegacy > 0
        ? `\n\nCòn ${otherLegacy} phát biểu kế thừa khác chưa được đối chất, không liên quan trực tiếp ` +
          `tới task này. Xem toàn bộ: \`ganas adopt --audit\`.`
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

  /* --- Kỹ năng + model gợi ý -------------------------------------------- */

  if (t.skills.length > 0 || t.model) {
    const modelLine = t.model
      ? `Gợi ý giao việc: model \`${graph.config.models[t.model]}\` (${t.model})`
      : "";
    const skillList = t.skills.length > 0 ? bullet(t.skills.map((s) => `\`/${s}\``)) : "";
    const body = [modelLine, skillList].filter((s) => s.length > 0).join("\n\n");
    parts.push(`## Kỹ năng cần dùng cho task này\n\n${body}`);
  }

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
          `file \`${c.path}\`` + (c.must_contain ? ` phải chứa \`${c.must_contain}\`` : " phải tồn tại"),
        );
        break;
      case "handoff":
        if (c.required) auto.push(`handoff record của phiên này`);
        break;
      case "manual":
        manual.push(c.check);
        break;
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

  /* --- Phần biến động: luôn ở CUỐI -------------------------------------- */

  if (input.volatile) {
    parts.push(`---\n\n${input.volatile}`);
  }

  return parts.join("\n\n");
}
