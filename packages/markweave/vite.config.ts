import { resolve } from "node:path";
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
  "@tiptap/starter-kit",
  "lowlight",
  "mermaid",
  "prosemirror-model",
  "prosemirror-state",
  "prosemirror-view",
];

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: (id) => externalPackages.some((packageName) => id === packageName || id.startsWith(`${packageName}/`)),
    },
  },
});
