// @ts-check
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettierConfig from "eslint-config-prettier";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

/**
 * `tsconfig.json` loại `test/` (chỉ build `src/`), nên linting kiểu-hoá cho cả
 * `test/**\/*.ts` cần một tsconfig riêng bao trọn cả hai — xem tsconfig.eslint.json.
 */
export default defineConfig([
  globalIgnores([
    "dist/**",
    "node_modules/**",
    "plugin/bin/**",
    // Đang có task riêng sửa hai file này (ADR fields / brief length warning) —
    // không chạm, kể cả qua lint autofix.
    "src/model/knowledge.ts",
    "src/render/brief.ts",
  ]),
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      // Codebase rất async (runShell, loadGraph, hook handlers…) — promise rơi
      // rớt không await là lỗi thật, im lặng nuốt exception.
      "@typescript-eslint/no-floating-promises": "error",
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
  },
  {
    // `node:test`: gọi `test(name, async fn)` ở top-level KHÔNG await là đúng
    // idiom — test runner tự quản lý việc chạy/tuần tự hoá, không phải promise
    // bị rơi. Bật `no-floating-promises` ở đây chỉ tạo hàng trăm false positive.
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
  // Tắt mọi rule ESLint có thể đụng độ với Prettier — Prettier lo format, ESLint lo đúng/sai.
  prettierConfig,
]);
