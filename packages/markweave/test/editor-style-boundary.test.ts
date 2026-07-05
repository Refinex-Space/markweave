import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readProjectFile = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const editorCss = readProjectFile("src/editor-core/markweave-editor.css");
const packageJson = JSON.parse(readProjectFile("package.json")) as {
  style?: string;
  exports?: Record<string, string | { import?: string; types?: string }>;
  sideEffects?: string[];
};

const editorRuntimeSelectors = [
  ".markweave-editor-frame",
  ".markweave-editor-surface",
  ".markweave-floating-toolbar",
  ".markweave-floating-toolbar-popover",
  ".markweave-floating-toolbar-turn-menu",
  ".markweave-floating-toolbar-link-popover",
  ".markweave-floating-toolbar-color-popover",
  ".markweave-floating-toolbar-more-menu",
  ".markweave-slash-menu",
  ".markweave-slash-trigger",
  ".markweave-slash-command-list",
  ".markweave-slash-emoji-grid",
  ".markweave-slash-upload-field",
  ".markweave-image-node",
  ".markweave-image-toolbar",
  ".markweave-image-upload-placeholder",
  ".markweave-image-resize-handle",
  ".markweave-video-node",
  ".markweave-video-upload-placeholder",
  ".markweave-video-embed",
  ".markweave-video-iframe",
  ".markweave-video-selection-layer",
  ".markweave-table-controls",
  ".markweave-table-selection-overlay",
  ".markweave-codeblock-overlay",
  ".markweave-codeblock-controls",
  ".markweave-codeblock-language-menu",
  ".markweave-mermaid-tabs",
  ".markweave-mermaid-preview",
  ".markweave-link",
  ".markweave-highlight",
  ".markweave-callout",
  ".markweave-video",
  ".markweave-attachment",
  ".markweave-separator",
  ".tiptap-mathematics-render",
];

describe("editor style boundary", () => {
  it("keeps editor runtime selectors in the editor-core stylesheet", () => {
    for (const selector of editorRuntimeSelectors) {
      expect(editorCss).toContain(selector);
    }
  });

  it("exposes the editor stylesheet as the package style entry", () => {
    expect(packageJson.style).toBe("./dist/styles.css");
    expect(packageJson.exports?.["./styles.css"]).toBe("./dist/styles.css");
    expect(packageJson.sideEffects).toContain("**/*.css");
  });

  it("keeps code block controls compact and Mermaid source readable in the core stylesheet", () => {
    expect(editorCss).toContain(".markweave-floating-toolbar");
    expect(editorCss).toContain("z-index: 40");
    expect(editorCss).toContain("overflow-anchor: none");
    expect(editorCss).toContain("scrollbar-gutter: stable");
    expect(editorCss).toContain(".markweave-floating-toolbar-turn-menu");
    expect(editorCss).toContain(".markweave-floating-toolbar-link-popover");
    expect(editorCss).toContain(".markweave-floating-toolbar-color-popover");
    expect(editorCss).toContain(".markweave-floating-toolbar-more-menu");
    expect(editorCss).toContain(".markweave-slash-trigger");
    expect(editorCss).toContain(".markweave-slash-emoji-grid");
    expect(editorCss).toContain(".markweave-slash-upload-field");
    expect(editorCss).toContain('[data-disabled="true"]');
    expect(editorCss).toContain(".markweave-image-node");
    expect(editorCss).toContain(".markweave-image-toolbar");
    expect(editorCss).toContain(".markweave-image-upload-placeholder");
    expect(editorCss).toContain(".markweave-image-resize-handle");
    expect(editorCss).toContain(".markweave-video-node");
    expect(editorCss).toContain(".markweave-video-upload-placeholder");
    expect(editorCss).toContain(".markweave-video-embed");
    expect(editorCss).toContain(".markweave-video-iframe");
    expect(editorCss).toContain(".markweave-video-selection-layer");
    expect(editorCss).toContain('.markweave-video-node[data-selected="true"]');
    expect(editorCss).toContain("z-index: 58");
    expect(editorCss).toContain("scrollbar-color: #d7d7d7 transparent");
    expect(editorCss).toContain(".markweave-video");
    expect(editorCss).toContain(".markweave-attachment");
    expect(editorCss).toContain(".markweave-separator");
    expect(editorCss).toContain('[data-markweave-indent-level="1"]');
    expect(editorCss).toContain(".markweave-codeblock-language-menu");
    expect(editorCss).toContain("width: 228px");
    expect(editorCss).toContain("max-height: 220px");
    expect(editorCss).toContain("height: 30px");
    expect(editorCss).toContain("height: 24px");
    expect(editorCss).toContain("font-size: 13px");
    expect(editorCss).toContain("scrollbar-color: #c6c6c6 transparent");
    expect(editorCss).toContain("background: transparent");
    expect(editorCss).toContain(".markweave-codeblock-tooltip");
    expect(editorCss).toContain("font-size: 12px");
    expect(editorCss).toContain('pre.markweave-code-block[data-markweave-collapsed="true"]:hover');
    expect(editorCss).toContain("data-markweave-collapsed-language");
    expect(editorCss).toContain("data-markweave-collapsed-lines");
    expect(editorCss).toContain("border-bottom: 1.5px solid #3f4650");
    expect(editorCss).toContain("transform: rotate(45deg)");
    expect(editorCss).toContain('pre.markweave-code-block[data-markweave-mermaid-block="true"]');
    expect(editorCss).toContain("padding-top: 42px");
    expect(editorCss).toContain(".markweave-mermaid-preview");
    expect(editorCss).toContain("width: 100%");
  });
});
