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

describe("Vue3 adapter parity source contract", () => {
  it("keeps floating toolbar DOM hooks aligned with the React adapter", () => {
    const source = readProjectFile("src/vue3/MarkweaveEditor.ts");

    expectSourceContract(source, [
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
    ]);
  });

  it("keeps slash command menu DOM hooks and input panels aligned with the React adapter", () => {
    const source = readProjectFile("src/vue3/MarkweaveEditor.ts");

    expectSourceContract(source, [
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
    const source = readProjectFile("src/vue3/MarkweaveEditor.ts");

    expectSourceContract(source, [
      "markweave-table-controls",
      "markweave-table-hover-row-handle",
      "markweave-table-hover-column-handle",
      "markweave-table-cell-handle",
      "markweave-table-menu",
      "markweave-table-menu-command-",
      "markweave-table-copy-feedback",
      "markweave-codeblock-controls",
      "markweave-codeblock-language",
      "markweave-codeblock-mermaid-preview",
      "markweave-codeblock-copy",
      "markweave-codeblock-download",
    ]);
  });

  it("keeps Vue3 media NodeViews on the React-compatible media DOM contract", () => {
    const source = readProjectFile("src/vue3/media-nodeviews.ts");

    expectSourceContract(source, [
      "markweave-image-node",
      "markweave-image-toolbar",
      "markweave-image-resize-handle-left",
      "markweave-image-resize-handle-right",
      "markweave-video-node",
      "markweave-video-delete",
      "markweave-media-placeholder",
      "markweave-media-placeholder-icon",
      "markweave-media-placeholder-form",
      "data-markweave-image-ui",
      "data-markweave-video-ui",
    ]);
  });
});
