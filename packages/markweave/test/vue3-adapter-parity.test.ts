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

describe("Vue3 adapter parity source contract", () => {
  it("keeps floating toolbar DOM hooks aligned with the React adapter", () => {
    const source = readWorkspaceFile("packages/markweave-vue3/src/MarkweaveEditor.ts");

    expectSourceContract(source, [
      "getFloatingToolbarTurnIntoOptions",
      "getFloatingToolbarTextColorOptions",
      "getFloatingToolbarHighlightColorOptions",
      "runFloatingToolbarMoreAction",
      "markweave-floating-toolbar",
      "markweave-floating-toolbar-content",
      "markweave-floating-toolbar-button-",
      "markweave-floating-toolbar-turn-menu",
      "markweave-floating-toolbar-link-popover",
      "markweave-floating-toolbar-link-input",
      "markweave-floating-toolbar-link-apply",
      "markweave-floating-toolbar-link-open",
      "markweave-floating-toolbar-link-remove",
      "markweave-floating-toolbar-color-menu",
      "markweave-floating-toolbar-more-menu",
      "markweave-floating-toolbar-more-",
      "markweave-floating-toolbar-tooltip",
      "markweave-floating-toolbar-tooltip--more",
      "markweave-floating-toolbar-tooltip-left",
      "data-tooltip-active",
      "data-markweave-theme",
      "setMarkweaveMermaidTheme",
      "data-button-id",
      "setAnchoredTooltip",
      "onMouseenter",
      "onMouseleave",
    ]);
  });

  it("keeps slash command menu DOM hooks and input panels aligned with the React adapter", () => {
    const source = readWorkspaceFile("packages/markweave-vue3/src/MarkweaveEditor.ts");

    expectSourceContract(source, [
      "Text as TextIcon",
      "Info",
      "Lightbulb",
      "AlertTriangle",
      "CircleX",
      "Minus",
      "left: `${props.position.left}px`",
      "top: `${props.position.top}px`",
      "maxHeight: `${props.position.maxHeight}px`",
      "markweave-slash-trigger",
      "markweave-slash-menu",
      "markweave-slash-command-list",
      "markweave-slash-group",
      "markweave-slash-command-",
      "markweave-slash-emoji-picker",
      "markweave-slash-emoji-grid",
      "markweave-slash-upload-panel",
      "markweave-slash-upload-field",
      "markweave-slash-upload-actions",
      "markweave-slash-upload-error",
    ]);
  });

  it("keeps table and code block controls on the shared editor DOM contract", () => {
    const source = readWorkspaceFile("packages/markweave-vue3/src/MarkweaveEditor.ts");

    expectSourceContract(source, [
      "markweave-table-controls",
      "markweave-table-hover-row-handle",
      "markweave-table-hover-column-handle",
      "markweave-table-cell-handle",
      "markweave-table-menu",
      "markweave-table-menu-command-",
      "markweave-table-copy-feedback",
      "VueTableSelectionOverlay",
      "markweave-table-selection-overlay",
      "interactionState: render.tableInteractionState.value",
      "executeTableMenuCommand",
      "measureTableSelectionOverlay",
      "getTableControlAxisSelectionModel",
      "data-command-enabled",
      "data-axis-index",
      "markweave-codeblock-overlay",
      "markweave-codeblock-controls",
      "markweave-codeblock-language",
      "markweave-codeblock-language-menu",
      "markweave-codeblock-language-search",
      "markweave-codeblock-language-option-",
      "markweave-codeblock-collapse",
      "markweave-codeblock-copy",
      "markweave-codeblock-copy-tooltip",
      "markweave-mermaid-tabs",
      "markweave-mermaid-mode-",
      "markweave-mermaid-preview-actions",
      "markweave-mermaid-fullscreen",
      "markweave-mermaid-download",
      "markweave-mermaid-fullscreen-layer",
      "markweave-mermaid-fullscreen-toolbar",
      "markweave-mermaid-fullscreen-zoom-out",
      "markweave-mermaid-fullscreen-zoom-label",
      "markweave-mermaid-fullscreen-zoom-in",
      "markweave-mermaid-fullscreen-reset",
      "markweave-mermaid-fullscreen-tooltip",
      "markweave-mermaid-fullscreen-close",
      "markweave-mermaid-fullscreen-viewport",
      "markweave-mermaid-fullscreen-content",
      "getMarkweaveMathTargetFromDomEvent",
      "setMarkweaveMathEditingDomState",
      "setMarkweaveMathEditingDomStateInView(view, nextMathTarget, true)",
      "setMarkweaveMathSelectionInView",
      "VueMathEditorPopover",
      "markweave-math-editor-popover",
      "markweave-math-editor-input",
      "markweave-math-inline-source",
      "markweave-math-inline-preview",
      "markweave-math-block-source",
      "markweave-math-block-preview",
    ]);
  });

  it("keeps Vue3 media NodeViews on the React-compatible media DOM contract", () => {
    const source = readWorkspaceFile("packages/markweave-vue3/src/media-nodeviews.ts");

    expectSourceContract(source, [
      "MarkweaveCoreImage",
      "MarkweaveCoreVideo",
      "attrsFromMarkweaveVideoUrl",
      "markweave-image-node",
      "markweave-image-toolbar",
      "markweave-image-preview",
      "openMarkweaveImagePreview",
      "markweave-image-align-left",
      "markweave-image-align-center",
      "markweave-image-align-right",
      "markweave-image-tooltip",
      "markweave-image-box",
      "markweave-image-resize-handle",
      "markweave-image-resize-left",
      "markweave-image-resize-right",
      "data-side",
      "markweave-image-caption-input",
      "markweave-image-caption",
      "markweave-image-upload-placeholder",
      "markweave-image-upload-submit",
      "markweave-video-node",
      "markweave-video-upload-placeholder",
      "markweave-video-selection-layer",
      "markweave-video-readonly-empty",
      "markweave-video-embed",
      "markweave-video-box",
      "markweaveVideoIframeAllow",
      "normalizeMarkweaveVideoEmbedUrl",
      "iframe[data-markweave-video-embed], video[data-markweave-video]",
      "data-markweave-image-ui",
      "data-markweave-video-ui",
      "markweave-link-card",
      "MarkweaveVueLinkCard",
    ]);
    expect(source).not.toContain("markweave-video-delete");
    expect(source).not.toContain("markweave-media-placeholder");
  });
});
