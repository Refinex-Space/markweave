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
  '.markweave-editor-frame[data-markweave-mode="view"]',
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
  ".markweave-image-readonly-empty",
  ".markweave-image-caption",
  ".markweave-video-node",
  ".markweave-video-upload-placeholder",
  ".markweave-video-readonly-empty",
  ".markweave-video-embed",
  ".markweave-video-iframe",
  ".markweave-video-selection-layer",
  ".markweave-table-controls",
  ".markweave-table-selection-overlay",
  ".markweave-inner-toc",
  ".markweave-inner-toc-rail",
  ".markweave-inner-toc-panel",
  ".markweave-inner-toc-item",
  ".markweave-codeblock-overlay",
  ".markweave-codeblock-controls",
  ".markweave-codeblock-language-label",
  ".markweave-codeblock-language-menu",
  ".markweave-mermaid-tabs",
  ".markweave-mermaid-preview",
  ".markweave-math-editor-popover",
  ".markweave-math-inline-source",
  ".markweave-math-inline-preview",
  ".markweave-math-block-source",
  ".markweave-math-block-preview",
  ".markweave-link",
  ".markweave-link-card",
  ".markweave-link-card-composer",
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
    expect(editorCss).toContain('[data-markweave-mode="view"]');
    expect(editorCss).toContain('[data-markweave-theme="dark"]');
    expect(editorCss).toContain("--markweave-canvas");
    expect(editorCss).toContain('.markweave-editor-frame[data-markweave-theme="dark"] .markweave-editor-surface');
    expect(editorCss).toContain("--markweave-focus");
    expect(editorCss).toContain("--markweave-code-surface");
    expect(editorCss).toContain('.markweave-editor-surface blockquote');
    expect(editorCss).toContain('.markweave-table-controls button');
    expect(editorCss).toContain('.markweave-table-menu button[data-starts-group="true"]');
    expect(editorCss).toContain('.markweave-inner-toc-item:focus-visible');
    expect(editorCss).toContain('.markweave-floating-toolbar-turn-menu button[data-active="true"]');
    expect(editorCss).toContain('.markweave-codeblock-language-list button[data-active="true"]');
    expect(editorCss).toContain('.markweave-mermaid-preview svg');
    expect(editorCss).toContain('.tiptap-mathematics-render[data-type="block-math"]');
    expect(editorCss).toContain('.hljs-attr');
    expect(editorCss).toContain('.markweave-callout[data-markweave-callout-type="tip"]');
    expect(editorCss).toContain('border-left-color: #bd95ff');
    expect(editorCss).toContain('border-left-color: #e7b657');
    expect(editorCss).toContain('border-left-color: #ff9299');
    expect(editorCss).toContain('border-left-color: #72d6a3');
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
    expect(editorCss).toContain(".markweave-image-toolbar::after");
    expect(editorCss).toContain("height: 8px");
    expect(editorCss).toContain(".markweave-image-upload-placeholder");
    expect(editorCss).toContain(".markweave-image-resize-handle");
    expect(editorCss).toContain(".markweave-image-readonly-empty");
    expect(editorCss).toContain(".markweave-image-caption");
    expect(editorCss).toContain(".markweave-video-node");
    expect(editorCss).toContain(".markweave-video-upload-placeholder");
    expect(editorCss).toContain(".markweave-video-readonly-empty");
    expect(editorCss).toContain(".markweave-video-embed");
    expect(editorCss).toContain(".markweave-video-iframe");
    expect(editorCss).toContain(".markweave-video-selection-layer");
    expect(editorCss).toContain('.markweave-video-node[data-selected="true"]');
    expect(editorCss).toContain(".markweave-inner-toc");
    expect(editorCss).toContain(".markweave-inner-toc-rail");
    expect(editorCss).toContain(".markweave-inner-toc-panel");
    expect(editorCss).toContain(".markweave-inner-toc-item");
    expect(editorCss).toContain(".markweave-inner-toc:hover .markweave-inner-toc-panel");
    expect(editorCss).toContain("right: 28px");
    expect(editorCss).toContain('data-markweave-inner-toc-placement="container"');
    expect(editorCss).toContain("--markweave-inner-toc-gutter: 232px");
    expect(editorCss).toContain("--markweave-inner-toc-panel-width: 184px");
    expect(editorCss).toContain("padding-inline: var(--markweave-inner-toc-gutter)");
    expect(editorCss).toContain("@container (max-width: 900px)");
    expect(editorCss).toContain("position: fixed;");
    expect(editorCss).toContain("right: var(--markweave-inner-toc-right, 28px);");
    expect(editorCss).toContain("font-size: 16px");
    expect(editorCss).toContain("z-index: 58");
    expect(editorCss).toContain("scrollbar-color: #d7d7d7 transparent");
    expect(editorCss).toContain(".markweave-video");
    expect(editorCss).toContain(".markweave-attachment");
    expect(editorCss).toContain(".markweave-separator");
    expect(editorCss).toContain("--markweave-link-card-height: 118px");
    expect(editorCss).toContain("--markweave-link-card-height: 102px");
    expect(editorCss).toContain("object-fit: cover");
    expect(editorCss).toContain('[data-markweave-indent-level="1"]');
    expect(editorCss).toContain(".markweave-codeblock-language-menu");
    expect(editorCss).toContain(".markweave-codeblock-language-label");
    expect(editorCss).toContain(".markweave-codeblock-controls");
    expect(editorCss).toContain("background: #ffffff");
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
    expect(editorCss).toContain(".markweave-math-editor-popover");
    expect(editorCss).toContain('[data-markweave-math-editing="true"]');
    expect(editorCss).toContain(".markweave-math-inline-preview");
    expect(editorCss).toContain(".markweave-math-block-preview");
    expect(editorCss).toContain(".markweave-math-inline-source input, .markweave-math-block-source textarea");
    expect(editorCss).toContain("box-shadow: none");
    expect(editorCss).toContain("counter-increment: markweave-math-block");
    expect(editorCss).toContain(".katex .katex-mathml");
    expect(editorCss).toContain(".katex .hide-tail");
    expect(editorCss).toContain("width: 100%");
  });

  it("keeps XML, Bash, and Shell syntax tokens visibly themed", () => {
    const requiredSyntaxSelectors = [
      ".hljs-name",
      ".hljs-tag",
      ".hljs-meta",
      ".hljs-built_in",
      ".hljs-keyword",
      ".hljs-string",
      ".hljs-variable",
      ".hljs-attribute",
      ".hljs-operator",
      ".hljs-property",
      ".hljs-selector-class",
      ".hljs-section",
      ".hljs-addition",
      ".hljs-deletion",
    ];

    for (const selector of requiredSyntaxSelectors) {
      expect(editorCss).toContain(selector);
    }

    expect(editorCss).toContain("--markweave-syntax-tag: #237a45");
    expect(editorCss).toContain("--markweave-syntax-constant: #2468a8");
    expect(editorCss).toContain("--markweave-syntax-tag: #7ee787");
    expect(editorCss).toContain("--markweave-syntax-constant: #79b8ff");
    expect(editorCss).toContain("color: var(--markweave-syntax-tag)");
    expect(editorCss).toContain("color: var(--markweave-syntax-constant)");
    expect(editorCss).toMatch(/\.hljs-tag\.hljs-name\s*\{\s*color: var\(--markweave-syntax-tag\);\s*\}/);
  });

  it("scopes ordinary list markers and compact callout spacing inside the editor", () => {
    expect(editorCss).toContain(".markweave-editor-surface ul:not(.markweave-task-list)");
    expect(editorCss).toContain("list-style-type: disc");
    expect(editorCss).toContain("list-style-type: decimal");
    expect(editorCss).toContain(".markweave-callout>p");
    expect(editorCss).toContain("line-height: 1.55");
  });

  it("allows italic synthesis only for inline emphasis in fallback fonts", () => {
    expect(editorCss).toContain(".markweave-editor-surface em,");
    expect(editorCss).toContain(".markweave-editor-surface i {");
    expect(editorCss).toContain("font-style: italic");
    expect(editorCss).toContain("font-synthesis: style");
  });
});
