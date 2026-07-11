// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { getActiveCodeBlockState, setActiveCodeBlockMermaidPreviewMode } from "../src/plugins/codeblock/codeblock-behavior";
import { setMarkweaveMermaidTheme } from "../src/plugins/mermaid/mermaid-inline-preview";

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

  it("does not force shifted existing Mermaid code blocks into Preview when text is inserted before them", () => {
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
        mermaidPreviewMode: "code",
        text: "graph TD\n  A --> B",
      },
    ]);
    expect(editor.view.dom.querySelector('[data-testid="markweave-mermaid-inline-preview"]')).toBeNull();
  });

  it("renders the Mermaid preview widget after the active Mermaid code block", () => {
    const editor = createEditor(`
<pre><code class="language-mermaid">graph TD
  A --> B</code></pre>
`);

    expect(editor.commands.setTextSelection(textPosition(editor, "A --> B"))).toBe(true);
    expect(editor.view.dom.querySelector('[data-testid="markweave-mermaid-inline-preview"]')).toBeNull();

    expect(setActiveCodeBlockMermaidPreviewMode(editor, "preview")).toBe(true);

    const codeBlock = editor.view.dom.querySelector("pre");
    const inlinePreview = editor.view.dom.querySelector<HTMLElement>('[data-testid="markweave-mermaid-inline-preview"]');

    expect(inlinePreview).not.toBeNull();
    expect(codeBlock?.nextElementSibling).toBe(inlinePreview);
    expect(inlinePreview?.dataset.state).toBe("empty");
    expect(inlinePreview?.dataset.codeBlockPos).toBe("0");
    expect(inlinePreview?.dataset.sourceLength).toBe(String("graph TD\n  A --> B".length));
  });

  it("recreates Mermaid previews for a theme change without mutating document source", () => {
    const editor = createEditor(`<pre><code class="language-mermaid">graph TD
  A --> B</code></pre>`);

    expect(editor.commands.setTextSelection(textPosition(editor, "A --> B"))).toBe(true);
    expect(setActiveCodeBlockMermaidPreviewMode(editor, "preview")).toBe(true);
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
    expect(setActiveCodeBlockMermaidPreviewMode(editor, "preview")).toBe(true);
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
<pre><code class="language-mermaid">graph TD
  A --> B</code></pre>
`);

    expect(editor.commands.setTextSelection(textPosition(editor, "const value"))).toBe(true);
    expect(setActiveCodeBlockMermaidPreviewMode(editor, "preview")).toBe(false);
    expect(editor.view.dom.querySelector('[data-testid="markweave-mermaid-inline-preview"]')).toBeNull();

    expect(editor.commands.setTextSelection(textPosition(editor, "A --> B"))).toBe(true);
    expect(setActiveCodeBlockMermaidPreviewMode(editor, "code")).toBe(true);
    expect(editor.view.dom.querySelector('[data-testid="markweave-mermaid-inline-preview"]')).toBeNull();
  });
});
