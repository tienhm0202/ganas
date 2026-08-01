import { readFile } from "node:fs/promises";

import { type Document, isNode, parseDocument } from "yaml";

import { GanasError } from "./errors.js";

export interface LoadedYaml {
  /** Giá trị JS thuần đã parse. */
  value: unknown;
  /** Document giữ vị trí node — dùng để quy lỗi về đúng dòng. */
  doc: Document;
  source: string;
  file: string;
}

/**
 * Đọc file YAML, giữ lại Document để báo lỗi kèm số dòng.
 *
 * Thông báo lỗi trỏ đúng `file:line` là điều kiện để hook PostToolUse hữu ích:
 * Claude bị chặn phải biết sửa ở đâu, không phải đoán.
 */
export async function readYamlFile(file: string): Promise<LoadedYaml> {
  let source: string;
  try {
    source = await readFile(file, "utf8");
  } catch (err) {
    throw new GanasError(`không đọc được ${file}: ${(err as Error).message}`);
  }

  const doc = parseDocument(source, { keepSourceTokens: false });
  if (doc.errors.length > 0) {
    const first = doc.errors[0]!;
    const line = offsetToLine(source, first.pos[0]);
    throw new GanasError(`${file}:${line}: YAML không hợp lệ — ${first.message}`);
  }

  return { value: doc.toJS({ maxAliasCount: 100 }), doc, source, file };
}

/** Đổi offset ký tự thành số dòng 1-indexed. */
export function offsetToLine(source: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, source.length);
  for (let i = 0; i < end; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * Tìm dòng của một đường dẫn trong Document (vd ["acceptance", 0, "run"]).
 * Trả về undefined nếu không định vị được — người gọi vẫn báo lỗi, chỉ thiếu dòng.
 */
export function lineOfPath(
  loaded: LoadedYaml,
  path: readonly (string | number)[],
): number | undefined {
  const { doc, source } = loaded;

  // Thu ngắn dần đường dẫn cho tới khi tìm được node thật: lỗi ở key chưa tồn
  // tại (vd thiếu field) vẫn quy được về node cha.
  for (let len = path.length; len >= 0; len--) {
    const sub = path.slice(0, len);
    const node = sub.length === 0 ? doc.contents : doc.getIn(sub, true);
    if (isNode(node) && node.range) return offsetToLine(source, node.range[0]);
  }
  return undefined;
}
