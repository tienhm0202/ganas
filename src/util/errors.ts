/** Lỗi có thông điệp dành cho người dùng và mã thoát xác định. */
export class GanasError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "GanasError";
    this.exitCode = exitCode;
  }
}

/** Không tìm thấy thư mục .ganas/ — dự án chưa được init. */
export class NotInitializedError extends GanasError {
  constructor(from: string) {
    super(
      `không tìm thấy .ganas/ từ "${from}" trở lên.\n` +
        `  Khởi tạo:   ganas init\n` +
        `  Dự án đã có code: ganas init rồi \`ganas scope new\` — trỏ paths vào code\n` +
        `              hiện có, ganas sẽ dựng khối tương ứng.`,
      2,
    );
    this.name = "NotInitializedError";
  }
}
