import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "markweave/styles.css",
        replacement: resolve(__dirname, "../../packages/markweave/src/editor-core/markweave-editor.css"),
      },
      {
        find: "markweave/react",
        replacement: resolve(__dirname, "../../packages/markweave/src/react/index.ts"),
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
    port: 5173,
  },
});
