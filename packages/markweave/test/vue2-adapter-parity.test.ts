import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readProjectFile = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

function expectSourceContract(source: string, selectors: readonly string[]) {
  const missing = selectors.filter((selector) => !source.includes(selector));
  expect(missing).toEqual([]);
}

describe("Vue2 adapter parity source contract", () => {
  it("keeps Vue2 extension composition on the shared media core", () => {
    const source = readProjectFile("src/vue2/create-editor-extensions.ts");

    expectSourceContract(source, [
      "createMarkweaveCoreEditorExtensions",
      "getMarkweaveMessages",
      "MarkweaveVueImage.configure",
      "MarkweaveVueVideo.configure",
      "onImageUpload",
      "onVideoUpload",
      "class: \"markweave-image\"",
      "class: \"markweave-video\"",
    ]);
  });

  it("keeps Vue2 editor shell on the same core runtime hooks as Vue3", () => {
    const source = readProjectFile("src/vue2/MarkweaveEditor.ts");

    expectSourceContract(source, [
      "@tiptap/vue-2",
      "@tiptap/vue-2/menus",
      "createMarkweaveVue2EditorExtensions",
      "createSelectionSnapshot",
      "shouldShowFloatingToolbar",
      "getSlashCommandContext",
      "getSlashCommandAnchoredMenuPosition",
      "executeSlashCommand",
      "getTableFocusState",
      "getTableSelectionOverlayState",
      "getActiveCodeBlockState",
      "setMermaidInlinePreviewEditorMode",
      "getMarkweaveTocItems",
      "getActiveMarkweaveTocId",
      "markweave-floating-toolbar-tooltip",
      "markweave-slash-layer",
      "markweave-slash-menu",
      "markweave-table-controls",
      "markweave-codeblock-controls",
      "markweave-inner-toc",
      "data-markweave-mode",
      "data-testid\": \"markweave-editor-frame\"",
    ]);
    expect(source).not.toContain("@tiptap/vue-3");
    expect(source).not.toContain("lucide-vue-next");
    expect(source).not.toContain("useEditor");
  });

  it("keeps Vue2 render compatibility for component slots and reserved icon names", () => {
    const compatSource = readProjectFile("src/vue2/vue2-compat.ts");
    const iconsSource = readProjectFile("src/vue2/vue2-icons.ts");

    expectSourceContract(compatSource, ["isDefaultSlotObject", "children.default()", "return [slotChildren]", "isVNodeLike", "return [children]"]);
    expectSourceContract(iconsSource, ["const lucideIcons", "iconName", "renderIconNode", "name: `MarkweaveVue2Icon${name}`"]);
    expect(iconsSource).not.toContain("pathForIcon");
    expect(iconsSource).not.toContain("name.includes");
  });

  it("keeps Vue2 media NodeViews on the React-compatible media DOM contract", () => {
    const source = readProjectFile("src/vue2/media-nodeviews.ts");

    expectSourceContract(source, [
      "@tiptap/vue-2",
      "MarkweaveCoreImage",
      "MarkweaveCoreVideo",
      "attrsFromMarkweaveImageUploadResult",
      "attrsFromMarkweaveVideoUrl",
      "markweave-image-node",
      "markweave-image-toolbar",
      "markweave-image-tooltip",
      "markweave-image-box",
      "markweave-image-resize-handle",
      "markweave-image-caption-input",
      "markweave-image-caption",
      "markweave-image-upload-placeholder",
      "markweave-video-node",
      "markweave-video-upload-placeholder",
      "markweave-video-selection-layer",
      "markweave-video-readonly-empty",
      "data-markweave-image-ui",
      "data-markweave-video-ui",
    ]);
    expect(source).not.toContain("@tiptap/vue-3");
    expect(source).not.toContain("lucide-vue-next");
    expect(source).not.toContain("markweave-video-delete");
  });
});
