import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const externalPackages = [
  "@tiptap/core",
  "@tiptap/extension-image",
  "@tiptap/pm",
  "@tiptap/react",
  "lucide-react",
  "markweave",
  "react",
  "react-dom",
];
const bundledAdapterSubpaths = new Set(["@tiptap/react/menus"]);

export default defineConfig({
  plugins: [react()],
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
