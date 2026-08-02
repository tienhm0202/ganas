import { flowContext, nextStep, STAGES } from "../flow.js";
import { type Argv, flag, option } from "../util/args.js";

/**
 * `ganas` (không tham số) — in ĐÚNG MỘT bước kế tiếp.
 *
 * Cố ý không in danh sách lựa chọn: một danh sách 12 lệnh là 12 quyết định đẩy
 * sang người dùng, và mỗi quyết định là một chỗ đi lạc. Muốn xem toàn bộ lệnh
 * thì `ganas --help`.
 */
export async function run(argv: Argv): Promise<number> {
  const cwd = option(argv, "root") ?? process.cwd();
  const ctx = await flowContext(cwd);
  const step = nextStep(ctx);

  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          stage: step?.stage.id ?? null,
          action: step?.action ?? null,
          command: step?.command ?? null,
          at: step?.at ?? STAGES.length,
          total: STAGES.length,
          stages: STAGES.map((s) => ({ id: s.id, done: s.done(ctx) })),
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  if (flag(argv, "all")) {
    process.stdout.write("Dòng chảy — chặng đầu tiên chưa xong là bước kế tiếp:\n\n");
    for (const s of STAGES) {
      const mark = s.done(ctx) ? "✓" : step?.stage.id === s.id ? "→" : " ";
      process.stdout.write(`  ${mark} ${s.id}\n`);
    }
    process.stdout.write("\n");
  }

  if (!step) {
    // Không phải ngõ cụt: mọi chặng xong nghĩa là task hiện tại đã khép, và
    // vòng sau bắt đầu ở chặng `task`. Nói rõ điều đó thay vì im lặng.
    process.stdout.write(
      `✓ Mọi chặng đều xong cho task hiện tại.\n\n` +
        `Vòng tiếp theo bắt đầu bằng một task mới — viết vào .ganas/tasks/ rồi chạy lại \`ganas\`.\n`,
    );
    return 0;
  }

  process.stdout.write(
    `Bước kế tiếp (${step.at}/${step.total} · ${step.stage.id})\n\n` +
      `  ${step.action}\n\n` +
      `  Vì sao: ${step.stage.why}\n`,
  );

  if (step.command) {
    process.stdout.write(`\n  Chạy:\n    ${step.command}\n`);
  }
  if (step.template) {
    process.stdout.write(
      `\n  Chưa có lệnh cho bước này — viết tay. Khung dán được:\n\n` +
        step.template
          .split("\n")
          .map((l) => `    ${l}`)
          .join("\n") +
        "\n",
    );
  }

  process.stdout.write(`\n  Xem toàn bộ chặng: ganas flow --all\n`);
  return 0;
}
