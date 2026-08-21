import { resolve } from "node:path";
import { defineConfig } from "vite";
import { createLegacyRuntimeExternal, legacyMermaidSingleFile } from "../../scripts/legacy-vite-config";

const coreSourceRoot = resolve(__dirname, "../markweave/src");

export default defineConfig({
  plugins: [
    legacyMermaidSingleFile(resolve(__dirname, "../markweave/node_modules/mermaid/dist/mermaid.min.js")),
  ],
  resolve: {
    alias: [
      {
        find: /^markweave\/internal/,
        replacement: coreSourceRoot,
      },
      {
        find: /^markweave$/,
        replacement: resolve(coreSourceRoot, "index.ts"),
      },
    ],
  },
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
      external: createLegacyRuntimeExternal(["@tiptap/vue-2", "vue"]),
      output: {
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        polyfillRequire: false,
      },
    },
  },
});
