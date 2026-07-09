import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: "markweave/styles.css",
        replacement: resolve(__dirname, "../../packages/markweave/src/editor-core/markweave-editor.css"),
      },
      {
        find: "@markweave/vue3",
        replacement: resolve(__dirname, "../../packages/markweave-vue3/src/index.ts"),
      },
      {
        find: "markweave/internal",
        replacement: resolve(__dirname, "../../packages/markweave/src"),
      },
      {
        find: "@markweave/playground-fixtures",
        replacement: resolve(__dirname, "../playground-fixtures/src/index.ts"),
      },
      {
        find: "markweave",
        replacement: resolve(__dirname, "../../packages/markweave/src/index.ts"),
      },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
  },
});
