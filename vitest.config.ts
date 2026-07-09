import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: "markweave/styles.css",
        replacement: resolve(__dirname, "packages/markweave/src/editor-core/markweave-editor.css"),
      },
      {
        find: "markweave/react",
        replacement: resolve(__dirname, "packages/markweave/src/react/index.ts"),
      },
      {
        find: "markweave/vue3",
        replacement: resolve(__dirname, "packages/markweave/src/vue3/index.ts"),
      },
      {
        find: "@markweave/playground-fixtures",
        replacement: resolve(__dirname, "apps/playground-fixtures/src/index.ts"),
      },
      {
        find: "markweave",
        replacement: resolve(__dirname, "packages/markweave/src/index.ts"),
      },
    ],
  },
  test: {
    globals: true,
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
  },
});
