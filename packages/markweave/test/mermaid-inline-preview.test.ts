// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveDocumentViewportCoordinator } from "../src/core/document-viewport";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { markweaveDocumentLoadMetaKey } from "../src/editor-core/document-load";
import { getActiveCodeBlockState, setActiveCodeBlockMermaidPreviewMode } from "../src/plugins/codeblock/codeblock-behavior";
import {
  getActiveCodeBlockElement,
  getCodeBlockPositionFromEventTarget,
  getCodeBlockPositionForElement,
  getMermaidPreviewElement,
} from "../src/plugins/codeblock/codeblock-ui-model";
import {
  getMermaidCodeBlockPositions,
  mermaidInlinePreviewPluginKey,
  setMarkweaveMermaidTheme,
} from "../src/plugins/mermaid/mermaid-inline-preview";

let activeEditor: Editor | null = null;

function createEditor(content: string) {
  const element = document.createElement("div");
  document.body.appendChild(element);

  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions(),
    content,
  });

  return activeEditor;
}

function textPosition(editor: Editor, text: string, boundary: "start" | "end" = "start") {
  let position: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return true;
    }

    const offset = node.text.indexOf(text);
    if (offset < 0) {
      return true;
    }

    position = pos + offset + (boundary === "end" ? text.length : 0);
    return false;
  });

  if (position === null) {
    throw new Error(`Expected text "${text}" in the editor fixture.`);
  }

  return position;
}

function dispatchTextInput(editor: Editor, text: string) {
  const { from, to } = editor.state.selection;
  let handled = false;

  editor.view.someProp("handleTextInput", (handler) => {
    const didHandle = handler(editor.view, from, to, text, () => editor.state.tr) === true;
    handled = handled || didHandle;
    return didHandle;
  });

  return handled;
}

function codeBlockSnapshots(editor: Editor) {
  const snapshots: Array<{ language: string | null; mermaidPreviewMode?: string | null; text: string }> = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name !== "codeBlock") {
      return true;
    }

    snapshots.push({
      language: node.attrs.language ?? null,
      mermaidPreviewMode: node.attrs.mermaidPreviewMode ?? null,
      text: node.textContent,
    });
    return false;
  });

  return snapshots;
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("mermaid inline preview", () => {
  it("opens typed Mermaid fences directly in Preview mode", () => {
    const editor = createEditor("<p></p>");

    expect(dispatchTextInput(editor, "```mermaid ")).toBe(true);

    expect(codeBlockSnapshots(editor)).toEqual([
      {
        language: "mermaid",
        mermaidPreviewMode: "preview",
        text: "",
      },
    ]);
  });

  it("does not force existing Mermaid code blocks back to Preview after the user chooses Code mode", () => {
    const editor = createEditor(`
<pre><code class="language-mermaid" data-mermaid-preview-mode="preview">graph TD
  A --> B</code></pre>
`);

    expect(editor.commands.setTextSelection(textPosition(editor, "A --> B", "end"))).toBe(true);
    expect(setActiveCodeBlockMermaidPreviewMode(editor, "code")).toBe(true);
    editor.commands.insertContent("\n  B --> C");

    expect(codeBlockSnapshots(editor)).toEqual([
      {
        language: "mermaid",
        mermaidPreviewMode: "code",
        text: "graph TD\n  A --> B\n  B --> C",
      },
    ]);
    expect(editor.view.dom.querySelector('[data-testid="markweave-mermaid-inline-preview"]')).toBeNull();
  });

  it("keeps default Mermaid blocks in Preview when text is inserted before them", () => {
    const editor = createEditor(`
<p>intro</p>
<pre><code class="language-mermaid">graph TD
  A --> B</code></pre>
`);

    expect(editor.commands.setTextSelection(textPosition(editor, "intro"))).toBe(true);
    editor.commands.insertContent(" /");

    expect(codeBlockSnapshots(editor)).toEqual([
      {
        language: "mermaid",
        mermaidPreviewMode: "preview",
        text: "graph TD\n  A --> B",
      },
    ]);
    expect(editor.view.dom.querySelector('[data-testid="markweave-mermaid-inline-preview"]')).not.toBeNull();
  });

  it("maps Mermaid projections without rebuilding previews for an unrelated paragraph edit", () => {
    const editor = createEditor(`
<p>intro</p>
<pre><code class="language-mermaid">graph TD
  A --&gt; B</code></pre>
<pre><code class="language-mermaid">graph LR
  C --&gt; D</code></pre>
`);
    const previewsBefore = [...editor.view.dom.querySelectorAll<HTMLElement>('[data-testid="markweave-mermaid-inline-preview"]')];

    expect(editor.commands.setTextSelection(textPosition(editor, "intro", "end"))).toBe(true);
    expect(editor.commands.insertContent(" updated")).toBe(true);

    const previewsAfter = [...editor.view.dom.querySelectorAll<HTMLElement>('[data-testid="markweave-mermaid-inline-preview"]')];
    const mermaidPositions = getMermaidCodeBlockPositions(editor.state);
    const codeBlockElement = editor.view.nodeDOM(mermaidPositions[0] ?? -1);
    const descendants = vi.spyOn(editor.state.doc, "descendants");
    expect(mermaidInlinePreviewPluginKey.getState(editor.state)?.lastDecoratedPositions).toEqual([]);
    expect(previewsAfter[0]).toBe(previewsBefore[0]);
    expect(previewsAfter[1]).toBe(previewsBefore[1]);
    expect(getActiveCodeBlockElement(editor, mermaidPositions[0] ?? null, "preview")).toBe(previewsBefore[0]);
    expect(getMermaidPreviewElement(editor, mermaidPositions[0] ?? null)).toBe(previewsBefore[0]);
    expect(getCodeBlockPositionFromEventTarget(editor, previewsBefore[0] ?? null)).toBe(mermaidPositions[0]);
    expect(codeBlockElement).toBeInstanceOf(HTMLElement);
    expect(getCodeBlockPositionForElement(editor, codeBlockElement as HTMLElement)).toBe(mermaidPositions[0]);
    expect(descendants).not.toHaveBeenCalled();
  });

  it("rebuilds only the Mermaid block whose source changed", () => {
    const editor = createEditor(`
<pre><code class="language-mermaid">graph TD
  First --&gt; Target</code></pre>
<pre><code class="language-mermaid">graph LR
  Second --&gt; Target</code></pre>
`);
    const positionsBefore = getMermaidCodeBlockPositions(editor.state);
    const previewsBefore = [...editor.view.dom.querySelectorAll<HTMLElement>('[data-testid="markweave-mermaid-inline-preview"]')];

    expect(editor.commands.setTextSelection(textPosition(editor, "First", "end"))).toBe(true);
    expect(editor.commands.insertContent("Updated")).toBe(true);

    const positionsAfter = getMermaidCodeBlockPositions(editor.state);
    const previewsAfter = [...editor.view.dom.querySelectorAll<HTMLElement>('[data-testid="markweave-mermaid-inline-preview"]')];
    expect(mermaidInlinePreviewPluginKey.getState(editor.state)?.lastDecoratedPositions).toEqual([positionsAfter[0]]);
    expect(positionsAfter[0]).toBe(positionsBefore[0]);
    expect(positionsAfter[1]).toBeGreaterThan(positionsBefore[1] ?? -1);
    expect(previewsAfter[0]).not.toBe(previewsBefore[0]);
    expect(previewsAfter[1]).toBe(previewsBefore[1]);
  });

  it("defers Mermaid decorations until progressive document mounting completes", () => {
    const editor = createEditor("<p>loading</p>");
    const codeBlockType = editor.schema.nodes.codeBlock;
    if (!codeBlockType) {
      throw new Error("Expected the codeBlock schema node.");
    }
    const first = codeBlockType.create(
      { language: "mermaid" },
      editor.schema.text("graph TD\n  A --> B"),
    );
    const second = codeBlockType.create(
      { language: "mermaid" },
      editor.schema.text("graph LR\n  C --> D"),
    );

    editor.view.dispatch(
      editor.state.tr
        .replaceWith(0, editor.state.doc.content.size, Fragment.from(first))
        .setMeta(markweaveDocumentLoadMetaKey, { phase: "mounting" }),
    );
    editor.view.dispatch(
      editor.state.tr
        .insert(editor.state.doc.content.size, Fragment.from(second))
        .setMeta(markweaveDocumentLoadMetaKey, { phase: "mounting" }),
    );

    expect(mermaidInlinePreviewPluginKey.getState(editor.state)).toMatchObject({ pendingDocumentLoad: true });
    expect(editor.view.dom.querySelector('[data-testid="markweave-mermaid-inline-preview"]')).toBeNull();

    editor.view.dispatch(
      editor.state.tr.setMeta(markweaveDocumentLoadMetaKey, { phase: "complete" }),
    );

    expect(mermaidInlinePreviewPluginKey.getState(editor.state)).toMatchObject({ pendingDocumentLoad: false });
    expect(mermaidInlinePreviewPluginKey.getState(editor.state)?.lastDecoratedPositions).toHaveLength(2);
    expect(editor.view.dom.querySelectorAll('[data-testid="markweave-mermaid-inline-preview"]')).toHaveLength(2);
  });

  it("renders the Mermaid preview widget after the active Mermaid code block", () => {
    const editor = createEditor(`
<pre><code class="language-mermaid" data-mermaid-preview-mode="code">graph TD
  A --> B</code></pre>
`);

    expect(editor.commands.setTextSelection(textPosition(editor, "A --> B"))).toBe(true);
    expect(editor.view.dom.querySelector('[data-testid="markweave-mermaid-inline-preview"]')).toBeNull();

    expect(setActiveCodeBlockMermaidPreviewMode(editor, "preview")).toBe(true);

    const codeBlock = editor.view.dom.querySelector("pre");
    const inlinePreview = editor.view.dom.querySelector<HTMLElement>('[data-testid="markweave-mermaid-inline-preview"]');

    expect(inlinePreview).not.toBeNull();
    expect(codeBlock?.nextElementSibling).toBe(inlinePreview);
    expect(inlinePreview?.dataset.state).toBe("pending");
    expect(inlinePreview?.dataset.codeBlockPos).toBe("0");
    expect(inlinePreview?.dataset.sourceLength).toBe(String("graph TD\n  A --> B".length));
  });

  it("cancels queued Mermaid work and disconnects observers when a widget is removed", async () => {
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class StalledIntersectionObserver {
      readonly root = null;
      readonly rootMargin = "200% 0px";
      readonly thresholds = [0];
      readonly disconnect = disconnect;
      readonly observe = vi.fn();
      readonly takeRecords = vi.fn(() => []);
      readonly unobserve = vi.fn();
    });
    const editor = createEditor("<p>before</p>");
    editor.view.dom.classList.add("markweave-editor-surface");
    const coordinator = createMarkweaveDocumentViewportCoordinator(editor);
    coordinator.visualWork.setSuspended(true);

    editor.commands.setContent(`<pre><code class="language-mermaid">graph TD
  A --&gt; B</code></pre>`);
    await Promise.resolve();

    expect(coordinator.visualWork.pendingCount).toBe(1);
    expect(editor.view.dom.querySelector('[data-testid="markweave-mermaid-inline-preview"]')).not.toBeNull();

    editor.commands.setContent("<p>removed</p>");

    expect(disconnect).toHaveBeenCalled();
    expect(coordinator.visualWork.pendingCount).toBe(0);
    coordinator.destroy();
  });

  it.each(["cancelled", "error"] as const)(
    "finalizes pending Mermaid projections after a %s document load",
    (outcome) => {
      const editor = createEditor("<p>loading</p>");
      const codeBlockType = editor.schema.nodes.codeBlock;
      if (!codeBlockType) {
        throw new Error("Expected the codeBlock schema node.");
      }
      const block = codeBlockType.create(
        { language: "mermaid" },
        editor.schema.text("graph TD\n  A --> B"),
      );

      editor.view.dispatch(
        editor.state.tr
          .replaceWith(0, editor.state.doc.content.size, Fragment.from(block))
          .setMeta(markweaveDocumentLoadMetaKey, { phase: "mounting" }),
      );
      expect(mermaidInlinePreviewPluginKey.getState(editor.state)?.pendingDocumentLoad).toBe(true);

      editor.view.dispatch(
        editor.state.tr.setMeta(markweaveDocumentLoadMetaKey, { phase: "complete", outcome }),
      );

      expect(mermaidInlinePreviewPluginKey.getState(editor.state)?.pendingDocumentLoad).toBe(false);
      expect(editor.view.dom.querySelector('[data-testid="markweave-mermaid-inline-preview"]')).not.toBeNull();
    },
  );

  it("recreates Mermaid previews for a theme change without mutating document source", () => {
    const editor = createEditor(`<pre><code class="language-mermaid">graph TD
  A --> B</code></pre>`);

    expect(editor.commands.setTextSelection(textPosition(editor, "A --> B"))).toBe(true);
    const markdownBefore = editor.getText();

    expect(editor.view.dom.querySelector<HTMLElement>('[data-testid="markweave-mermaid-inline-preview"]')?.dataset.theme).toBe("light");
    expect(setMarkweaveMermaidTheme(editor, "dark")).toBe(true);
    expect(editor.view.dom.querySelector<HTMLElement>('[data-testid="markweave-mermaid-inline-preview"]')?.dataset.theme).toBe("dark");
    expect(editor.getText()).toBe(markdownBefore);
    expect(setMarkweaveMermaidTheme(editor, "dark")).toBe(false);
  });

  it("restores the Mermaid code block selection when the preview widget is clicked", () => {
    const editor = createEditor(`
<pre><code class="language-mermaid">flowchart TB
  A --> B</code></pre>
<p>after</p>
`);

    expect(editor.commands.setTextSelection(textPosition(editor, "A --> B"))).toBe(true);
    expect(editor.commands.setTextSelection(textPosition(editor, "after"))).toBe(true);
    expect(getActiveCodeBlockState(editor).active).toBe(false);

    const inlinePreview = editor.view.dom.querySelector<HTMLElement>('[data-testid="markweave-mermaid-inline-preview"]');
    expect(inlinePreview).not.toBeNull();

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "target", {
      configurable: true,
      value: inlinePreview,
    });

    let handled = false;
    editor.view.someProp("handleClick", (handler) => {
      handled = handler(editor.view, textPosition(editor, "after"), event) === true || handled;
      return handled;
    });

    expect(handled).toBe(true);
    expect(getActiveCodeBlockState(editor)).toMatchObject({
      active: true,
      language: "mermaid",
      mermaidPreviewMode: "preview",
      text: "flowchart TB\n  A --> B",
    });
  });

  it("keeps non-Mermaid code blocks and Code mode free of inline previews", () => {
    const editor = createEditor(`
<pre><code class="language-ts">const value = 1</code></pre>
<pre><code class="language-mermaid" data-mermaid-preview-mode="code">graph TD
  A --> B</code></pre>
`);

    expect(editor.commands.setTextSelection(textPosition(editor, "const value"))).toBe(true);
    expect(setActiveCodeBlockMermaidPreviewMode(editor, "preview")).toBe(false);
    expect(editor.view.dom.querySelector('[data-testid="markweave-mermaid-inline-preview"]')).toBeNull();

    expect(editor.commands.setTextSelection(textPosition(editor, "A --> B"))).toBe(true);
    expect(setActiveCodeBlockMermaidPreviewMode(editor, "code")).toBe(true);
    expect(editor.view.dom.querySelector('[data-testid="markweave-mermaid-inline-preview"]')).toBeNull();
  });

  it("serializes Code as an explicit override and omits the default Preview state", () => {
    const editor = createEditor(`<pre><code class="language-mermaid">graph TD
  A --> B</code></pre>`);

    expect(editor.getHTML()).not.toContain("data-mermaid-preview-mode");
    expect(editor.commands.setTextSelection(textPosition(editor, "A --> B"))).toBe(true);
    expect(setActiveCodeBlockMermaidPreviewMode(editor, "code")).toBe(true);
    expect(editor.getHTML()).toContain('data-mermaid-preview-mode="code"');
  });
});
