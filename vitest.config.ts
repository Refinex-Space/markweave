import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "markweave/styles.css",
        replacement: resolve(__dirname, "packages/markweave/src/editor-core/markweave-editor.css"),
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
