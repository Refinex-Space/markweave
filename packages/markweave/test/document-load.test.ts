// @vitest-environment jsdom

import { Editor, type JSONContent, type MarkdownToken } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { markweaveMarkdownParserWorkerSource } from "../src/editor-core/markdown-parser-worker-source.generated";
import {
  loadMarkweaveDocument,
  parseMarkweaveDocument,
  profileMarkweaveDocument,
  resolveMarkweavePerformanceTier,
} from "../src/editor-core/document-load";
import { markweaveIncrementalLowlightPluginKey } from "../src/plugins/codeblock/incremental-lowlight-plugin";
import { mermaidInlinePreviewPluginKey } from "../src/plugins/mermaid/mermaid-inline-preview";

function createEditor() {
  return new Editor({
    extensions: createMarkweaveEditorExtensions(),
    content: "",
  });
}

describe("document load coordinator", () => {
  it("keeps generated Worker lexing canonically equivalent for built-in Markdown syntax", () => {
    const editor = createEditor();
    const markdown = [
      "# Document",
      "",
      "[reference][target] and $x + y$",
      "",
      ":::info",
      "Callout body.",
      ":::",
      "",
      ":::details{open} Summary",
      "- Nested body",
      ":::",
      "",
      "a) alpha",
      "b) beta",
      "",
      "- [x] task",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "$$x^2$$",
      "",
      "```mermaid",
      "graph TD",
      "  A --> B",
      "```",
      "",
      "![image](asset://image)",
      "",
      '<a href="asset://file" data-markweave-attachment data-markweave-attachment-name="file.txt">file.txt</a>',
      "",
      '<a href="markweave://note" data-markweave-link-card data-markweave-link-card-title="Note">Note</a>',
      "",
      "[target]: https://example.com",
    ].join("\n");
    const canonical = parseMarkweaveDocument(editor, markdown, "markdown");
    const posted: Array<{ readonly tokens?: readonly MarkdownToken[]; readonly type: string }> = [];
    const scope: {
      onmessage: ((event: MessageEvent<{ id: number; markdown: string }>) => void) | null;
      postMessage: (message: { readonly tokens?: readonly MarkdownToken[]; readonly type: string }) => void;
    } = {
      onmessage: null,
      postMessage: (message) => posted.push(message),
    };

    new Function("globalThis", markweaveMarkdownParserWorkerSource)(scope);
    scope.onmessage?.({ data: { id: 1, markdown } } as MessageEvent<{ id: number; markdown: string }>);

    expect(posted[0]?.type).toBe("result");
    const manager = editor.markdown as unknown as {
      parseTokens(tokens: readonly MarkdownToken[], implicitEmptyParagraphs: boolean): JSONContent[];
    };
    const workerDocument = editor.schema.nodeFromJSON({
      type: "doc",
      content: manager.parseTokens(posted[0]?.tokens ?? [], true),
    });
    expect(workerDocument.eq(canonical)).toBe(true);
    editor.destroy();
  });

  it("mounts the canonical whole-document parse without chunk semantic drift", async () => {
    const editor = createEditor();
    const markdown = [
      "# Document",
      "",
      "[go][destination]",
      "",
      ...Array.from({ length: 1_100 }, (_, index) =>
        `## Section ${index + 1}\n\nParagraph ${index + 1}.`,
      ),
      "",
      "[destination]: https://example.com",
    ].join("\n");
    const canonical = parseMarkweaveDocument(editor, markdown, "markdown");

    await loadMarkweaveDocument(editor, {
      content: markdown,
      format: "markdown",
      performancePolicy: "large",
    });

    expect(editor.state.doc.eq(canonical)).toBe(true);
    expect(editor.getHTML()).toContain('href="https://example.com"');
    expect(editor.can().undo()).toBe(false);
    editor.destroy();
  });

  it("profiles structural complexity and resolves deterministic tiers", () => {
    const editor = createEditor();
    const document = parseMarkweaveDocument(
      editor,
      "| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```mermaid\ngraph TD\n```\n\n![x](asset://x)",
      "markdown",
    );
    const profile = profileMarkweaveDocument(document, 1_000_000);

    expect(profile).toMatchObject({
      sourceLength: 1_000_000,
      tableCellCount: 4,
      codeBlockCount: 1,
      mermaidBlockCount: 1,
      mediaNodeCount: 1,
    });
    expect(resolveMarkweavePerformanceTier(profile)).toBe("extreme");
    expect(resolveMarkweavePerformanceTier(profile, "standard")).toBe("standard");
    editor.destroy();
  });

  it("publishes loading phases and rejects stale cancelled sessions", async () => {
    const editor = createEditor();
    const controller = new AbortController();
    const phases: string[] = [];
    controller.abort();

    await expect(loadMarkweaveDocument(editor, {
      content: "# Cancelled",
      format: "markdown",
      signal: controller.signal,
      onStateChange: (state) => phases.push(state.phase),
    })).rejects.toMatchObject({ name: "AbortError" });

    expect(phases).toEqual(["cancelled"]);
    expect(editor.getText()).toBe("");
    editor.destroy();
  });

  it("finalizes visual plugin projections when cancellation interrupts progressive mounting", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => callback(window.performance.now()), 0),
    );
    const editor = createEditor();
    const controller = new AbortController();
    const markdown = [
      "```javascript",
      "const recovered = true",
      "```",
      "",
      "```mermaid",
      "graph TD",
      "  A --> B",
      "```",
      "",
      ...Array.from({ length: 600 }, (_, index) => `## Section ${index + 1}\n\nBody.`),
    ].join("\n");

    await expect(loadMarkweaveDocument(editor, {
      content: markdown,
      format: "markdown",
      performancePolicy: "large",
      signal: controller.signal,
      onStateChange: (state) => {
        if (state.phase === "mounting" && (state.progress ?? 0) > 0) {
          controller.abort();
        }
      },
    })).rejects.toMatchObject({ name: "AbortError" });

    expect(markweaveIncrementalLowlightPluginKey.getState(editor.state)?.pendingDocumentLoad).toBe(false);
    expect(mermaidInlinePreviewPluginKey.getState(editor.state)?.pendingDocumentLoad).toBe(false);
    expect(editor.view.dom.querySelector(".hljs-keyword")?.textContent).toBe("const");
    expect(editor.view.dom.querySelector('[data-testid="markweave-mermaid-inline-preview"]')).not.toBeNull();
    editor.destroy();
    vi.restoreAllMocks();
  });

  it("never emits an editor update for progressive load batches", async () => {
    const onUpdate = vi.fn();
    const editor = new Editor({
      extensions: createMarkweaveEditorExtensions(),
      content: "",
      onUpdate,
    });
    const markdown = Array.from(
      { length: 1_100 },
      (_, index) => `## Section ${index + 1}\n\nBody.`,
    ).join("\n\n");

    await loadMarkweaveDocument(editor, {
      content: markdown,
      format: "markdown",
      performancePolicy: "large",
    });

    expect(onUpdate).not.toHaveBeenCalled();
    editor.destroy();
  });
});
