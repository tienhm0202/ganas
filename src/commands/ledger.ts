import { requireGanasRoot } from "../graph/paths.js";
import { type Argv, flag } from "../util/args.js";
import { ledgerCorruption, readLedger, verifyChain } from "../verify/ledger.js";

/**
 * Kiểm toàn vẹn sổ cái xác minh.
 *
 * Cố tình KHÔNG nạp graph: lệnh này chạy trong git hook `pre-commit`, tức trên
 * mọi commit của repo. Đọc đúng một file rồi tính lại hash-chain là đủ, và đủ
 * nhanh để không ai thấy phiền mà đi tắt nó.
 *
 * Đây là lớp PHÁT HIỆN, không phải lớp cấm: `--no-verify` bỏ qua được git hook,
 * và điều đó không sao. Giá trị nằm ở chỗ sổ cái bị sửa tay thì đứt chain và
 * LỘ RA — bất kể ai sửa, bằng công cụ gì, có gõ tên file hay không.
 */
export async function run(argv: Argv): Promise<number> {
  const root = requireGanasRoot(process.cwd());
  const entries = await readLedger(root);
  const corrupt = ledgerCorruption(root);
  const chain = verifyChain(entries);

  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        { entries: entries.length, corrupt_lines: corrupt, chain_ok: chain.ok, broken_at: chain.brokenAt ?? null },
        null,
        2,
      ) + "\n",
    );
    return chain.ok && corrupt === 0 ? 0 : 1;
  }

  if (!chain.ok) {
    process.stderr.write(
      `✗ Hash-chain của sổ cái xác minh ĐỨT ở dòng ${(chain.brokenAt ?? 0) + 1}/${entries.length}.\n` +
        `  .ganas/verify-ledger.jsonl là append-only. Đứt chain nghĩa là có dòng bị sửa,\n` +
        `  xoá hoặc đảo thứ tự SAU khi ghi.\n\n` +
        `  Phục hồi từ git (\`git checkout -- .ganas/verify-ledger.jsonl\`) rồi chạy lại\n` +
        `  \`ganas verify\` cho những gì thật sự cần kiểm.\n`,
    );
    return 1;
  }

  if (corrupt > 0) {
    process.stderr.write(
      `✗ Sổ cái có ${corrupt} dòng không đọc được. Hash-chain của phần đọc được vẫn liền,\n` +
        `  nhưng dòng hỏng là chỗ bằng chứng biến mất mà không để lại dấu vết.\n`,
    );
    return 1;
  }

  process.stdout.write(`✓ Sổ cái liền chain — ${entries.length} dòng.\n`);
  return 0;
}
