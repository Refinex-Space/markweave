import { resolve } from "node:path";
import { defineConfig } from "vite";
import { createLegacyRuntimeExternal, legacyMermaidSingleFile } from "../../scripts/legacy-vite-config";

export default defineConfig({
  plugins: [
    legacyMermaidSingleFile(resolve(__dirname, "node_modules/mermaid/dist/mermaid.min.js")),
  ],
  build: {
    target: "es2019",
    outDir: "dist/legacy",
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: createLegacyRuntimeExternal(),
      output: {
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        polyfillRequire: false,
      },
    },
  },
});
