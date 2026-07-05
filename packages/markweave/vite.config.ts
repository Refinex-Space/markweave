import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const externalPackages = [
  "@tiptap/core",
  "@tiptap/extension-code-block-lowlight",
  "@tiptap/extension-emoji",
  "@tiptap/extension-highlight",
  "@tiptap/extension-horizontal-rule",
  "@tiptap/extension-image",
  "@tiptap/extension-link",
  "@tiptap/extension-mathematics",
  "@tiptap/extension-subscript",
  "@tiptap/extension-superscript",
  "@tiptap/extension-table",
  "@tiptap/extension-table-cell",
  "@tiptap/extension-table-header",
  "@tiptap/extension-table-row",
  "@tiptap/extension-task-item",
  "@tiptap/extension-task-list",
  "@tiptap/extension-text-align",
  "@tiptap/extension-text-style",
  "@tiptap/extension-underline",
  "@tiptap/pm",
  "@tiptap/react",
  "@tiptap/starter-kit",
  "lowlight",
  "lucide-react",
  "mermaid",
  "prosemirror-model",
  "prosemirror-state",
  "prosemirror-view",
  "react",
  "react-dom",
];

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: (id) => externalPackages.some((packageName) => id === packageName || id.startsWith(`${packageName}/`)),
    },
  },
});
