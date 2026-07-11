import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const readWorkspaceFile = (path: string) => readFileSync(resolve(workspaceRoot, path), "utf8");

function expectSourceContract(source: string, selectors: readonly string[]) {
  const missing = selectors.filter((selector) => !source.includes(selector));
  expect(missing).toEqual([]);
}

describe("Vue2 adapter parity source contract", () => {
  it("keeps Vue2 extension composition on the shared media core", () => {
    const source = readWorkspaceFile("packages/markweave-vue2/src/create-editor-extensions.ts");

    expectSourceContract(source, [
      "createMarkweaveCoreEditorExtensions",
      "createMarkweaveAdapterMediaExtensions",
      "image: MarkweaveVueImage",
      "video: MarkweaveVueVideo",
      "onImageUpload",
      "onVideoUpload",
    ]);
  });

  it("keeps Vue2 editor shell on the same core runtime hooks as Vue3", () => {
    const source = readWorkspaceFile("packages/markweave-vue2/src/MarkweaveEditor.ts");

    expectSourceContract(source, [
      "@tiptap/vue-2",
      "@tiptap/vue-2/menus",
      "createMarkweaveVue2EditorExtensions",
      "createMarkweaveEditorUpdatePayload",
      "createMarkweaveEditorRuntimeSnapshot",
      "openMarkweaveReadonlyLinkFromEvent",
      "getFloatingToolbarTurnIntoOptions",
      "getFloatingToolbarTextColorOptions",
      "runFloatingToolbarMoreAction",
      "createSelectionSnapshot",
      "shouldShowFloatingToolbar",
      "getSlashCommandContext",
      "getSlashCommandAnchoredMenuPosition",
      "executeSlashCommand",
      "getTableFocusState",
      "getTableSelectionOverlayState",
      "getActiveCodeBlockState",
      "setMermaidInlinePreviewEditorMode",
      "getMarkweaveMathTargetFromDomEvent",
      "setMarkweaveMathEditingDomState",
      "setMarkweaveMathEditingDomStateInView(view, nextMathTarget, true)",
      "setMarkweaveMathSelectionInView",
      "VueMathEditorPopover",
      "getMarkweaveTocItems",
      "getActiveMarkweaveTocId",
      "markweave-floating-toolbar-tooltip",
      "markweave-slash-layer",
      "markweave-slash-menu",
      "markweave-table-controls",
      "markweave-codeblock-controls",
      "markweave-math-editor-popover",
      "markweave-math-editor-input",
      "markweave-math-inline-source",
      "markweave-math-inline-preview",
      "markweave-math-block-source",
      "markweave-math-block-preview",
      "markweave-inner-toc",
      "innerTocPlacement",
      "data-markweave-inner-toc-placement",
      "observeMarkweaveInnerTocContainerPosition",
      "data-markweave-mode",
      "data-markweave-theme",
      "setMarkweaveMermaidTheme",
      "data-testid\": \"markweave-editor-frame\"",
    ]);
    expect(source).not.toContain("@tiptap/vue-3");
    expect(source).not.toContain("lucide-vue-next");
    expect(source).not.toContain("useEditor");
  });

  it("keeps Vue2 render compatibility for component slots and reserved icon names", () => {
    const compatSource = readWorkspaceFile("packages/markweave-vue2/src/vue2-compat.ts");
    const iconsSource = readWorkspaceFile("packages/markweave-vue2/src/vue2-icons.ts");

    expectSourceContract(compatSource, [
      "isDefaultSlotObject",
      "children.default()",
      "typeof children === \"function\"",
      "children()",
      "normalizeSlotChildren",
      "isVNodeLike",
      "return [children]",
    ]);
    expectSourceContract(iconsSource, ["const lucideIcons", "iconName", "renderIconNode", "name: `MarkweaveVue2Icon${name}`"]);
    expect(iconsSource).not.toContain("pathForIcon");
    expect(iconsSource).not.toContain("name.includes");
  });

  it("keeps Vue2 media NodeViews on the React-compatible media DOM contract", () => {
    const source = readWorkspaceFile("packages/markweave-vue2/src/media-nodeviews.ts");

    expectSourceContract(source, [
      "@tiptap/vue-2",
      "MarkweaveCoreImage",
      "MarkweaveCoreVideo",
      "attrsFromMarkweaveImageUploadResult",
      "attrsFromMarkweaveVideoUrl",
      "markweave-image-node",
      "markweave-image-toolbar",
      "markweave-image-preview",
      "openMarkweaveImagePreview",
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
      "markweaveVideoIframeAllow",
      "normalizeMarkweaveVideoEmbedUrl",
      "iframe[data-markweave-video-embed], video[data-markweave-video]",
      "data-markweave-image-ui",
      "data-markweave-video-ui",
    ]);
    expect(source).not.toContain("@tiptap/vue-3");
    expect(source).not.toContain("lucide-vue-next");
    expect(source).not.toContain("markweave-video-delete");
  });
});
