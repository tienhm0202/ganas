/** Lỗi có thông điệp dành cho người dùng và mã thoát xác định. */
export class GanasError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "GanasError";
    this.exitCode = exitCode;
  }
}

/** Không tìm thấy thư mục .ganas/ — dự án chưa được init/adopt. */
export class NotInitializedError extends GanasError {
  constructor(from: string) {
    super(
      `không tìm thấy .ganas/ từ "${from}" trở lên.\n` +
        `  Dự án mới:  ganas init\n` +
        `  Dự án cũ:   ganas adopt`,
      2,
    );
    this.name = "NotInitializedError";
  }
}
