import { resolve } from "node:path";
import { defineConfig } from "vite";

const externalPackages = [
  "@tiptap/core",
  "@tiptap/extension-image",
  "@tiptap/pm",
  "@tiptap/vue-2",
  "markweave",
  "vue",
];
const bundledAdapterSubpaths = new Set(["@tiptap/vue-2/menus"]);

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: (id) => !bundledAdapterSubpaths.has(id)
        && externalPackages.some((packageName) => id === packageName || id.startsWith(`${packageName}/`)),
    },
  },
});
