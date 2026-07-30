import { resolve } from "node:path";
import { createRequire } from "node:module";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const { createOpenRouterDevMiddleware } = require("../playground-fixtures/openrouter-dev-proxy.cjs") as {
  createOpenRouterDevMiddleware(options: { readonly workspaceRoot: string }): (
    request: import("node:http").IncomingMessage,
    response: import("node:http").ServerResponse,
    next: () => void,
  ) => void;
};
const workspaceRoot = resolve(__dirname, "../..");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "markweave-openrouter-dev-proxy",
      configureServer(server) {
        server.middlewares.use(createOpenRouterDevMiddleware({ workspaceRoot }));
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: "markweave/styles.css",
        replacement: resolve(__dirname, "../../packages/markweave/src/editor-core/markweave-editor.css"),
      },
      {
        find: "@markweave/react",
        replacement: resolve(__dirname, "../../packages/markweave-react/src/index.ts"),
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
    port: 5173,
  },
});
