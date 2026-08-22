import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readProjectFile = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const editorCss = readProjectFile("src/editor-core/markweave-editor.css");
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  ".markweave-slash-trigger-active",
  ".markweave-slash-empty-line-placeholder",
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
  ".markweave-inline-link-source",
  ".markweave-inline-link-source-target",
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

  it("renders inline link source as text without input chrome", () => {
    const sourceRule = editorCss.match(/\.markweave-inline-link-source\s*\{([\s\S]*?)\n\}/)?.[1];
    const targetRule = editorCss.match(/\.markweave-inline-link-source-target\s*\{([\s\S]*?)\n\}/)?.[1];
    const focusRule = editorCss.match(/\.markweave-inline-link-source-target:focus\s*\{([\s\S]*?)\n\}/)?.[1];

    expect(sourceRule).toContain("display: inline;");
    expect(targetRule).toContain("display: inline;");
    expect(targetRule).toContain("border: 0;");
    expect(targetRule).toContain("background: transparent;");
    expect(targetRule).toContain("padding: 0;");
    expect(targetRule).toContain("box-shadow: none;");
    expect(targetRule).toContain("white-space: pre;");
    expect(focusRule).toContain("background: transparent;");
    expect(focusRule).toContain("box-shadow: none;");
  });

  it("uses one border layer for table cell selections without synthetic grid lines", () => {
    const nativeSelectedCellRule = editorCss.match(/\.markweave-editor-surface \.selectedCell\s*\{([\s\S]*?)\n\}/)?.[1];
    const selectionCellRule = editorCss.match(
      /\.markweave-editor-surface th\.markweave-selection-cell,\s*\.markweave-editor-surface td\.markweave-selection-cell\s*\{([\s\S]*?)\n\}/,
    )?.[1];
    const overlayRule = editorCss.match(/\.markweave-table-selection-overlay\s*\{([\s\S]*?)\n\}/)?.[1];

    expect(nativeSelectedCellRule).toContain("background: transparent;");
    expect(nativeSelectedCellRule).toContain("outline: none;");
    expect(selectionCellRule).toContain("background: var(--markweave-selection);");
    expect(selectionCellRule).toContain("box-shadow: none;");
    expect(overlayRule).toBeDefined();
    expect(overlayRule).toContain("border: 2px solid var(--markweave-table-selection-border);");
    expect(overlayRule).toContain("background: transparent;");
    expect(overlayRule).not.toContain("linear-gradient");
    expect(editorCss).not.toContain(".markweave-selection-cell::after");
    expect(editorCss).not.toContain(".markweave-selection-anchor-cell");
    expect(editorCss).not.toContain(".markweave-selection-head-cell");
  });

  it("keeps table headers on the same background as regular cells", () => {
    const tableHeaderRule = editorCss.match(/\.markweave-editor-surface th\s*\{([\s\S]*?)\n\}/)?.[1];

    expect(tableHeaderRule).toBeDefined();
    expect(tableHeaderRule).not.toContain("background");
    expect(editorCss).not.toContain('.markweave-editor-frame[data-markweave-theme="dark"] .markweave-editor-surface th');
  });

  it("lets axis overlays own merged-cell selection paint and suppresses expanded native selected cells", () => {
    const axisSelectionFillValues = [
      ...editorCss.matchAll(/--markweave-table-axis-selection-fill:\s*rgba\([^;]+,\s*(0?\.\d+)\);/g),
    ];

    expect(editorCss).toContain(".selectedCell.markweave-axis-selection-cell");
    expect(editorCss).toContain(".selectedCell.markweave-selection-excluded-cell");
    expect(editorCss).toContain('.markweave-table-selection-overlay[data-axis-target="row"]');
    expect(editorCss).toContain('.markweave-table-selection-overlay[data-axis-target="column"]');
    expect(editorCss).toContain("background-color: var(--markweave-table-axis-selection-fill);");
    expect(editorCss).not.toContain("background-color: var(--markweave-selection);");
    expect(axisSelectionFillValues).toHaveLength(2);
    axisSelectionFillValues.forEach((match) => {
      expect(Number(match[1])).toBeGreaterThan(0);
      expect(Number(match[1])).toBeLessThan(0.5);
    });
  });

  it("keeps an open table menu above the inner table of contents and below the floating toolbar", () => {
    const innerTocZIndex = Number(editorCss.match(/\.markweave-inner-toc\s*\{[^}]*z-index:\s*(\d+);/s)?.[1]);
    const openTableMenuZIndex = Number(
      editorCss.match(
        /\.markweave-table-controls\[data-open-menu\]:not\(\[data-open-menu="none"\]\)\s*\{[^}]*z-index:\s*(\d+);/s,
      )?.[1],
    );
    const floatingToolbarZIndex = Number(editorCss.match(/\.markweave-floating-toolbar\s*\{[^}]*z-index:\s*(\d+);/s)?.[1]);

    expect(openTableMenuZIndex).toBeGreaterThan(innerTocZIndex);
    expect(openTableMenuZIndex).toBeLessThan(floatingToolbarZIndex);
  });

  it("keeps the Ask AI session compact and preserves primary-action contrast", () => {
    const generatingRule = editorCss.match(/\.markweave-ask-ai-generating\s*\{([\s\S]*?)\n\}/)?.[1];
    const generatingMinHeight = Number(generatingRule?.match(/min-height:\s*(\d+)px;/)?.[1]);
    const acceptHoverRule = editorCss.match(
      /\.markweave-ask-ai-popover \.markweave-ask-ai-accept:hover:not\(:disabled\)\s*\{([\s\S]*?)\n\}/,
    )?.[1];
    const stopRule = editorCss.match(/\.markweave-ask-ai-popover \.markweave-ask-ai-stop\s*\{([\s\S]*?)\n\}/)?.[1];
    const stopHoverRule = editorCss.match(
      /\.markweave-ask-ai-popover \.markweave-ask-ai-stop:hover:not\(:disabled\)\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    expect(generatingMinHeight).toBeGreaterThan(0);
    expect(generatingMinHeight).toBeLessThanOrEqual(34);
    expect(editorCss).toContain('.markweave-ask-ai-popover[data-phase="generating"]');
    expect(stopRule).toContain("flex: 0 0 26px;");
    expect(stopRule).toContain("min-height: 26px;");
    expect(stopRule).toContain("width: 26px;");
    expect(stopRule).toContain("height: 26px;");
    expect(stopRule).toContain("padding: 0;");
    expect(stopHoverRule).toContain("background: #4b5058;");
    expect(stopHoverRule).toContain("color: #fff;");
    expect(editorCss).toContain(".markweave-ask-ai-progress-label");
    expect(editorCss).not.toContain(".markweave-ask-ai-progress-dots");
    expect(acceptHoverRule).toContain("background: #17181a;");
    expect(acceptHoverRule).toContain("color: #fff;");
  });

  it("keeps Ask AI review content compact without inheriting editor-only controls", () => {
    expect(editorCss).toContain('.markweave-ask-ai-original[data-markweave-ask-ai-original="true"]');
    expect(editorCss).toContain(".markweave-ask-ai-proposal-cell > :not(.markweave-ask-ai-proposal--table-cell)");
    expect(editorCss).toContain(".markweave-ask-ai-proposal pre.markweave-code-block");
    expect(editorCss).toContain('.markweave-ask-ai-proposal .tiptap-mathematics-render[data-type="block-math"]');
    expect(editorCss).toContain(".markweave-ask-ai-preview table");
    expect(editorCss).toContain(".markweave-ask-ai-preview th>p");
    expect(editorCss).toContain(".markweave-ask-ai-preview td>p");
    expect(editorCss).toContain(".markweave-ask-ai-preview pre.markweave-code-block");
    expect(editorCss).toContain('.markweave-ask-ai-preview .tiptap-mathematics-render[data-type="block-math"]');
    expect(editorCss).toContain('.markweave-editor-frame[data-markweave-theme="dark"] .markweave-ask-ai-preview table');
  });

  it("keeps Chromium 106 fallbacks before progressive color mixing", () => {
    const cardFadeRule = editorCss.match(/\.markweave-internal-link-card-description::after\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    const darkAskAiHoverRule = editorCss.match(/\.markweave-editor-frame\[data-markweave-theme="dark"\] \.markweave-ask-ai-popover button:hover:not\(:disabled\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    const searchRule = editorCss.match(/\.markweave-search-match\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    const activeSearchRule = editorCss.match(/\.markweave-search-match--active\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    const darkSearchRule = editorCss.match(/\[data-markweave-theme="dark"\] \.markweave-search-match\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    const darkActiveSearchRule = editorCss.match(/\[data-markweave-theme="dark"\] \.markweave-search-match--active\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(cardFadeRule.indexOf("background: linear-gradient(to bottom, transparent")).toBeLessThan(cardFadeRule.indexOf("color-mix("));
    expect(darkAskAiHoverRule.indexOf("background: rgba(255, 255, 255, 0.08);")).toBeLessThan(darkAskAiHoverRule.indexOf("color-mix("));
    expect(searchRule.indexOf("background: rgba(250, 204, 21, 0.42);")).toBeLessThan(searchRule.indexOf("color-mix("));
    expect(searchRule).toContain("box-shadow: inset 0 -1px 0 rgba(202, 138, 4, 0.55);");
    expect(activeSearchRule).toContain("inset 0 0 0 1px rgba(234, 88, 12, 0.72)");
    expect(darkSearchRule).toContain("background: rgba(234, 179, 8, 0.34);");
    expect(darkActiveSearchRule).toContain("inset 0 0 0 1px rgba(253, 186, 116, 0.72)");
    expect(editorCss.match(/color-mix\(/g)).toHaveLength(13);
  });

  it("keeps AI edit review controls compact, visible, and Chromium 106 compatible", () => {
    const hunkReviewCss = editorCss.slice(
      editorCss.indexOf(".markweave-ai-edit-hunk-shell"),
      editorCss.indexOf(".markweave-ai-edit-controls"),
    );
    const controlsRule = editorCss.match(/\.markweave-ai-edit-controls\s*\{([\s\S]*?)\n\}/)?.[1];
    const floatingControlsRule = editorCss.match(/\.markweave-ai-edit-controls--floating\s*\{([\s\S]*?)\n\}/)?.[1];
    const buttonRule = editorCss.match(/\.markweave-ai-edit-button\s*\{([\s\S]*?)\n\}/)?.[1];
    const primaryButtonRule = editorCss.match(/\.markweave-ai-edit-button--primary\s*\{([\s\S]*?)\n\}/)?.[1];
    const primaryButtonHoverRule = editorCss.match(/\.markweave-ai-edit-button--primary:hover\s*\{([\s\S]*?)\n\}/)?.[1];
    const originalRule = editorCss.match(/\.markweave-ask-ai-original\.markweave-ai-edit-original\[data-markweave-ai-edit-original="true"\]\s*\{([\s\S]*?)\n\}/)?.[1];
    const proposalRule = editorCss.match(/\.markweave-ask-ai-proposal\s*\{([\s\S]*?)\n\}/)?.[1];

    expect(controlsRule).toContain("border: 0;");
    expect(controlsRule).toContain("background: transparent;");
    expect(controlsRule).toContain("box-shadow: none;");
    expect(floatingControlsRule).toContain("position: fixed;");
    expect(floatingControlsRule).toContain("visibility: hidden;");
    expect(floatingControlsRule).toContain("background: var(--markweave-surface, #ffffff);");
    expect(floatingControlsRule).toContain("border: 1px solid var(--markweave-border, #d9dee7);");
    expect(buttonRule).toContain("min-height: 26px;");
    expect(buttonRule).toContain("padding: 0 8px;");
    expect(buttonRule).toContain("border: 1px solid");
    expect(buttonRule).toContain("box-shadow: none;");
    expect(primaryButtonRule).toContain("background: var(--markweave-focus, #4168c9);");
    expect(primaryButtonRule).toContain("border-color: var(--markweave-focus, #4168c9);");
    expect(primaryButtonHoverRule).toContain("background: var(--markweave-ai-primary-hover, #3657a8);");
    expect(primaryButtonHoverRule).not.toContain("color-mix");
    expect(originalRule).toContain("box-shadow: none;");
    expect(proposalRule).toContain("color: var(--markweave-ai-proposal-text, #355eae);");
    expect(proposalRule).not.toContain("color-mix");
    expect(editorCss).toMatch(/\.markweave-ask-ai-proposal-cell\s*\{[^}]*background:\s*transparent;/s);
    expect(editorCss).toMatch(/\.markweave-ask-ai-proposal--text\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
    expect(editorCss).not.toMatch(/\.markweave-ask-ai-proposal--text \+ \.markweave-ai-edit-controls/);
    expect(editorCss).toMatch(/\.markweave-ask-ai-proposal--text\[data-markweave-ask-ai-layout="block"\]\s*\{[^}]*padding:\s*8px 0;/s);
    expect(editorCss).toMatch(/\.markweave-ai-edit-hunk-shell\[data-markweave-ai-edit-active="true"\]\s*\{[^}]*border-color:/s);
    expect(editorCss).toMatch(/\.markweave-ai-edit-hunk-shell:is\(:hover, :focus-within, \[data-markweave-ai-edit-active="true"\]\) > \.markweave-ai-edit-hunk-actions\s*\{[^}]*opacity:\s*1;/s);
    expect(editorCss).toMatch(/\.markweave-ai-edit-hunk-button,\s*\.markweave-ai-edit-nav-button\s*\{[^}]*width:\s*26px;[^}]*height:\s*26px;/s);
    expect(editorCss).not.toMatch(/\.markweave-ai-edit-hunk-proposal\s*\{[^}]*border-left:/s);
    expect(editorCss).toMatch(/\.markweave-ai-edit-tooltip\s*\{[^}]*background:\s*#2f3135;[^}]*color:\s*#ffffff;/s);
    expect(editorCss).toMatch(/\.markweave-ai-edit-hunk-button:hover > \.markweave-ai-edit-tooltip[\s\S]*visibility:\s*visible;/s);
    expect(editorCss).toContain(".markweave-ai-edit-navigation");
    expect(editorCss).toContain(".markweave-ai-edit-count");
    expect(hunkReviewCss).not.toContain("@container");
    expect(hunkReviewCss).not.toContain("container-type");
    expect(hunkReviewCss).not.toContain("color-mix");
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
    expect(editorCss).toContain('.markweave-editor-surface[contenteditable="true"]:focus .markweave-slash-trigger-active');
    expect(editorCss).toContain("content: attr(data-markweave-slash-filter)");
    expect(editorCss).toContain('.markweave-editor-surface[contenteditable="true"]:focus .markweave-slash-empty-line-placeholder::before');
    expect(editorCss).toContain("content: attr(data-markweave-slash-placeholder)");
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
    expect(editorCss).toContain("height: min(var(--markweave-inner-toc-rail-height, 15px), 70vh)");
    expect(editorCss).toContain("max-height: 70vh");
    expect(editorCss).toMatch(/\.markweave-inner-toc-rail\s*\{[^}]*overflow:\s*hidden;[^}]*justify-content:\s*flex-start;[^}]*gap:\s*5px;/s);
    expect(editorCss).toContain('data-markweave-inner-toc-rail-overflow="true"');
    expect(editorCss).toContain("mask-image: linear-gradient(to bottom, #000 0%, #000 calc(100% - 28px), transparent 100%)");
    expect(editorCss).toMatch(/\.markweave-inner-toc-rail span\s*\{[^}]*height:\s*1px;[^}]*min-height:\s*1px;/s);
    expect(editorCss).toContain('.markweave-inner-toc-rail span[data-active="true"]');
    expect(editorCss).toMatch(/\.markweave-inner-toc-rail span\[data-active="true"\]\s*\{[^}]*height:\s*1px;/s);
    expect(editorCss).toContain(".markweave-inner-toc-panel");
    expect(editorCss).toContain(".markweave-inner-toc-item");
    expect(editorCss).toContain(".markweave-inner-toc:hover .markweave-inner-toc-panel");
    expect(editorCss).toContain("right: 28px");
    expect(editorCss).toContain('data-markweave-inner-toc-placement="container"');
    expect(editorCss).toContain("--markweave-inner-toc-gutter: 232px");
    expect(editorCss).toContain("--markweave-inner-toc-panel-width: 184px");
    expect(editorCss).toContain("padding-inline: var(--markweave-inner-toc-gutter)");
    expect(editorCss).toContain('data-markweave-inner-toc-compact="true"');
    expect(editorCss).not.toContain("@container (max-width: 900px)");
    expect(editorCss).not.toContain("container-type: inline-size");
    expect(editorCss).toContain("position: fixed;");
    expect(editorCss).toContain("right: var(--markweave-inner-toc-right, 28px);");
    expect(editorCss).toContain('.markweave-image-node[data-media-state="pending"]');
    expect(editorCss).toContain("@keyframes markweave-image-loading");
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

  it("keeps dark code and Mermaid blocks transparent", () => {
    expect(editorCss).toMatch(
      /\.markweave-editor-frame\[data-markweave-theme="dark"\] \.markweave-editor-surface pre,\s*\.markweave-editor-frame\[data-markweave-theme="dark"\] \.markweave-editor-surface pre\.markweave-code-block\s*\{[^}]*background:\s*transparent;/s,
    );
    expect(editorCss).toMatch(
      /\.markweave-editor-frame\[data-markweave-theme="dark"\] \.markweave-editor-surface pre code\s*\{[^}]*background:\s*transparent;/s,
    );
    expect(editorCss).toMatch(
      /\.markweave-editor-frame\[data-markweave-theme="dark"\] \.markweave-mermaid-preview\s*\{[^}]*background:\s*transparent;/s,
    );
    expect(editorCss).toMatch(
      /\.markweave-editor-frame\[data-markweave-theme="dark"\] \.markweave-mermaid-preview svg\s*\{[^}]*background:\s*transparent;/s,
    );
  });

  it("keeps dark attachment cards subdued and readable", () => {
    expect(editorCss).toMatch(
      /\.markweave-editor-frame\[data-markweave-theme="dark"\] \.markweave-attachment\s*\{[^}]*border-color:\s*var\(--markweave-border\);[^}]*background:\s*var\(--markweave-surface-muted\);[^}]*color:\s*var\(--markweave-text\);/s,
    );
    expect(editorCss).toMatch(
      /\.markweave-editor-frame\[data-markweave-theme="dark"\] \.markweave-attachment :is\([^)]*\.markweave-attachment-icon[^)]*\.markweave-attachment-meta[^)]*\)\s*\{[^}]*color:\s*var\(--markweave-text-muted\);/s,
    );
    expect(editorCss).toMatch(
      /\.markweave-editor-frame\[data-markweave-theme="dark"\] \.markweave-attachment-name\s*\{[^}]*color:\s*var\(--markweave-text\);/s,
    );
  });

  it("gives separators a practical click target and visible node selection state", () => {
    const separatorRule = editorCss.match(
      /\.markweave-editor-surface hr\.markweave-separator\s*\{([\s\S]*?)\n\}/,
    )?.[1];
    const selectedSeparatorRule = editorCss.match(
      /\.markweave-editor-surface hr\.markweave-separator\.ProseMirror-selectednode\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    expect(separatorRule).toContain("height: 20px;");
    expect(separatorRule).toContain("calc(100% - 24px) 1px no-repeat;");
    expect(editorCss).toMatch(
      /\.markweave-editor-surface\[contenteditable="true"\] hr\.markweave-separator\s*\{[^}]*cursor:\s*pointer;/s,
    );
    expect(selectedSeparatorRule).toContain("var(--markweave-selection);");
    expect(selectedSeparatorRule).toContain("calc(100% - 24px) 1px no-repeat,");
    expect(selectedSeparatorRule).not.toContain("box-shadow");
    expect(editorCss).toMatch(
      /\.markweave-editor-frame\[data-markweave-theme="dark"\] \.markweave-editor-surface hr\.markweave-separator\.ProseMirror-selectednode\s*\{[^}]*var\(--markweave-focus\)[^}]*var\(--markweave-selection\);/s,
    );
  });

  it("keeps table selection, handles, and menus compact across light and dark themes", () => {
    expect(editorCss).toContain("--markweave-table-selection-border: #7296c8");
    expect(editorCss).toContain("--markweave-table-selection-border: #86a8d8");
    expect(editorCss).toContain("--markweave-table-handle-hover: #e4e8ed");
    expect(editorCss).toMatch(
      /\.markweave-table-controls \.markweave-table-edge-handle--selection \{[^}]*background: var\(--markweave-table-handle-surface\);/s,
    );
    expect(editorCss).toMatch(/\.markweave-table-menu button \{[^}]*background: transparent;/s);
    expect(editorCss).toMatch(/\.markweave-table-menu-scroll \{[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/s);
    expect(editorCss).toContain('.markweave-table-submenu[data-positioned="false"]');
    expect(editorCss).not.toContain(".markweave-table-alignment-menu {");
    expect(editorCss).toContain('.markweave-table-menu button[data-starts-group="true"]::before');
    expect(editorCss).toMatch(
      /\.markweave-table-submenu button\[data-active="true"\] \{[^}]*color: var\(--markweave-focus\);/s,
    );
    expect(editorCss).toMatch(
      /\.markweave-table-controls \.markweave-table-extend-button::before \{[^}]*position: absolute;[^}]*background: transparent;/s,
    );
    expect(editorCss).toMatch(
      /\.markweave-table-controls \.markweave-table-extend-button--row::before \{[^}]*top: -9px;[^}]*height: 9px;/s,
    );
    expect(editorCss).toMatch(
      /\.markweave-table-controls \.markweave-table-extend-button--column::before \{[^}]*left: -9px;[^}]*width: 9px;/s,
    );
  });

  it("keeps primary editor overlays flat in light and dark themes", () => {
    const flatOverlaySelectors = [
      ".markweave-ask-ai-popover[data-phase=\"input\"] .markweave-ask-ai-composer",
      ".markweave-table-menu",
      ".markweave-table-submenu",
      ".markweave-floating-toolbar",
      ".markweave-floating-toolbar-popover",
      ".markweave-slash-menu",
      ".markweave-inner-toc-panel",
      ".markweave-codeblock-controls",
      ".markweave-codeblock-language-menu",
      ".markweave-image-toolbar",
    ];

    for (const selector of flatOverlaySelectors) {
      expect(editorCss, `${selector} should not use elevation shadow`).toMatch(
        new RegExp(`${escapeRegExp(selector)}\\s*\\{[^}]*box-shadow:\\s*none;`, "s"),
      );
    }

    expect(editorCss).toMatch(
      /\.markweave-editor-frame\[data-markweave-theme="dark"\]\s+:is\([^)]*\.markweave-inner-toc-panel[^)]*\.markweave-codeblock-language-menu[^)]*\)\s*\{[^}]*box-shadow:\s*none;/s,
    );
    expect(editorCss).toMatch(
      /\.markweave-ask-ai-composer:focus-within\s*\{[^}]*box-shadow:\s*none;[^}]*outline:/s,
    );
    expect(editorCss).toMatch(
      /\.markweave-editor-frame\[data-markweave-theme="dark"\] \.markweave-ask-ai-composer:focus-within\s*\{[^}]*outline-color:\s*rgba\(255, 255, 255, 0\.16\);/s,
    );
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
