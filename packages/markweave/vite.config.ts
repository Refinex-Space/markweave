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
  "@tiptap/react",
  "@tiptap/starter-kit",
  "@tiptap/vue-2",
  "@tiptap/vue-3",
  "lowlight",
  "lucide-react",
  "lucide-vue-next",
  "mermaid",
  "prosemirror-model",
  "prosemirror-state",
  "prosemirror-view",
  "react",
  "react-dom",
  "vue",
];

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        react: resolve(__dirname, "src/react/index.ts"),
        vue2: resolve(__dirname, "src/vue2/index.ts"),
        vue3: resolve(__dirname, "src/vue3/index.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: (id) => externalPackages.some((packageName) => id === packageName || id.startsWith(`${packageName}/`)),
    },
  },
});
