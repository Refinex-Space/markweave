// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Fragment } from "@tiptap/pm/model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markweaveDocumentLoadMetaKey } from "../src/editor-core/document-load";
import {
  createMarkweaveLowlight,
  MarkweaveCodeBlockLowlight,
} from "../src/plugins/codeblock/codeblock-lowlight";
import { markweaveIncrementalLowlightPluginKey } from "../src/plugins/codeblock/incremental-lowlight-plugin";

let activeEditor: Editor | null = null;

function createEditor(content: string) {
  const lowlight = createMarkweaveLowlight();
  const highlight = vi.spyOn(lowlight, "highlight");
  const highlightAuto = vi.spyOn(lowlight, "highlightAuto");
  const element = document.createElement("div");
  document.body.appendChild(element);

  activeEditor = new Editor({
    element,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      MarkweaveCodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: "text",
        enableTabIndentation: true,
        tabSize: 2,
        HTMLAttributes: {
          class: "markweave-code-block",
          spellcheck: "false",
        },
      }),
    ],
    content,
  });

  return {
    editor: activeEditor,
    highlight,
    highlightAuto,
  };
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

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("incremental code block highlighting", () => {
  it("does not call Lowlight when an ordinary paragraph changes", () => {
    const { editor, highlight, highlightAuto } = createEditor(`
      <p>before</p>
      <pre><code class="language-javascript">const firstValue = 1</code></pre>
      <pre><code class="language-typescript">const secondValue: number = 2</code></pre>
    `);
    highlight.mockClear();
    highlightAuto.mockClear();

    expect(editor.commands.setTextSelection(textPosition(editor, "before", "end"))).toBe(true);
    expect(editor.commands.insertContent(" updated")).toBe(true);

    expect(highlight).not.toHaveBeenCalled();
    expect(highlightAuto).not.toHaveBeenCalled();
    expect(markweaveIncrementalLowlightPluginKey.getState(editor.state)?.lastHighlightedPositions).toEqual([]);
    expect(editor.view.dom.querySelectorAll(".hljs-keyword")).toHaveLength(2);
  });

  it("re-highlights only the code block whose source changed", () => {
    const { editor, highlight, highlightAuto } = createEditor(`
      <pre><code class="language-javascript">const firstValue = 1</code></pre>
      <p>between</p>
      <pre><code class="language-typescript">const secondValue: number = 2</code></pre>
    `);
    highlight.mockClear();
    highlightAuto.mockClear();
    const firstCodeBlockPos = [...(markweaveIncrementalLowlightPluginKey.getState(editor.state)?.blocksByPos.keys() ?? [])][0];

    expect(editor.commands.setTextSelection(textPosition(editor, "firstValue", "end"))).toBe(true);
    expect(editor.commands.insertContent("Updated")).toBe(true);

    expect(highlight).toHaveBeenCalledTimes(1);
    expect(highlightAuto).not.toHaveBeenCalled();
    expect(markweaveIncrementalLowlightPluginKey.getState(editor.state)?.lastHighlightedPositions).toEqual([firstCodeBlockPos]);
    expect(editor.view.dom.querySelectorAll("pre.markweave-code-block .hljs-keyword")).toHaveLength(2);
  });

  it("maps existing block positions and highlights only a newly inserted code block", () => {
    const { editor, highlight, highlightAuto } = createEditor(`
      <p>before</p>
      <pre><code class="language-javascript">const existingValue = 1</code></pre>
    `);
    highlight.mockClear();
    highlightAuto.mockClear();

    expect(editor.commands.setTextSelection(textPosition(editor, "before", "end"))).toBe(true);
    expect(editor.commands.insertContent({
      type: "codeBlock",
      attrs: { language: "python" },
      content: [{ type: "text", text: "print('new')" }],
    })).toBe(true);

    expect(highlight).toHaveBeenCalledTimes(1);
    expect(highlight).toHaveBeenCalledWith("python", "print('new')");
    expect(highlightAuto).not.toHaveBeenCalled();
    expect(markweaveIncrementalLowlightPluginKey.getState(editor.state)?.blocksByPos).toHaveLength(2);
  });

  it("keeps automatic detection for unknown language names", () => {
    const { editor, highlightAuto } = createEditor(
      '<pre><code class="language-not-registered">const detected = true</code></pre>',
    );

    expect(highlightAuto).toHaveBeenCalledTimes(1);
    expect(editor.view.dom.querySelector("pre.markweave-code-block code")?.textContent).toBe("const detected = true");
  });

  it("defers all highlighting until progressive document mounting completes", () => {
    const { editor, highlight, highlightAuto } = createEditor("<p>loading</p>");
    const codeBlockType = editor.schema.nodes.codeBlock;
    if (!codeBlockType) {
      throw new Error("Expected the codeBlock schema node.");
    }
    const first = codeBlockType.create(
      { language: "javascript" },
      editor.schema.text("const first = 1"),
    );
    const second = codeBlockType.create(
      { language: "typescript" },
      editor.schema.text("const second: number = 2"),
    );
    highlight.mockClear();
    highlightAuto.mockClear();

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

    expect(highlight).not.toHaveBeenCalled();
    expect(highlightAuto).not.toHaveBeenCalled();
    expect(markweaveIncrementalLowlightPluginKey.getState(editor.state)).toMatchObject({
      pendingDocumentLoad: true,
    });

    editor.view.dispatch(
      editor.state.tr.setMeta(markweaveDocumentLoadMetaKey, { phase: "complete" }),
    );

    expect(highlight).toHaveBeenCalledTimes(2);
    expect(highlightAuto).not.toHaveBeenCalled();
    expect(markweaveIncrementalLowlightPluginKey.getState(editor.state)).toMatchObject({
      pendingDocumentLoad: false,
    });
    expect(markweaveIncrementalLowlightPluginKey.getState(editor.state)?.lastHighlightedPositions).toHaveLength(2);
  });

  it.each(["cancelled", "error"] as const)(
    "restores highlighting after a %s document-load terminal transaction",
    (outcome) => {
      const { editor, highlight, highlightAuto } = createEditor("<p>loading</p>");
      const codeBlockType = editor.schema.nodes.codeBlock;
      if (!codeBlockType) {
        throw new Error("Expected the codeBlock schema node.");
      }
      const block = codeBlockType.create(
        { language: "javascript" },
        editor.schema.text("const recovered = true"),
      );
      highlight.mockClear();
      highlightAuto.mockClear();

      editor.view.dispatch(
        editor.state.tr
          .replaceWith(0, editor.state.doc.content.size, Fragment.from(block))
          .setMeta(markweaveDocumentLoadMetaKey, { phase: "mounting" }),
      );
      expect(markweaveIncrementalLowlightPluginKey.getState(editor.state)?.pendingDocumentLoad).toBe(true);
      expect(highlight).not.toHaveBeenCalled();

      editor.view.dispatch(
        editor.state.tr.setMeta(markweaveDocumentLoadMetaKey, { phase: "complete", outcome }),
      );

      expect(markweaveIncrementalLowlightPluginKey.getState(editor.state)?.pendingDocumentLoad).toBe(false);
      expect(highlight).toHaveBeenCalledTimes(1);
      expect(highlightAuto).not.toHaveBeenCalled();
      expect(editor.view.dom.querySelector(".hljs-keyword")?.textContent).toBe("const");
    },
  );
});
