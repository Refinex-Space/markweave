// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { getMarkweaveMessages, type MarkweaveLang } from "../src/i18n";

const placeholderSelector = ".markweave-slash-empty-line-placeholder";
let activeEditor: Editor | null = null;

function createEditor(content: string, lang: MarkweaveLang = "zh") {
  const element = document.createElement("div");
  document.body.appendChild(element);

  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions({ lang }),
    content,
  });

  return activeEditor;
}

function paragraphPositions(editor: Editor) {
  const positions: number[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "paragraph") {
      positions.push(pos + 1);
    }
    return true;
  });

  return positions;
}

function placeholderElement(editor: Editor) {
  return editor.view.dom.querySelector<HTMLElement>(placeholderSelector);
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("slash empty-line placeholder", () => {
  it("localizes the hint copy for Chinese and English", () => {
    expect(getMarkweaveMessages("zh").slash.emptyLinePlaceholder).toBe("输入 / 唤起快捷操作");
    expect(getMarkweaveMessages("en").slash.emptyLinePlaceholder).toBe("Press / for quick actions");
  });

  it("decorates only the selected empty paragraph with the localized hint", () => {
    const editor = createEditor("<p>Filled</p><p></p><p></p>");
    const positions = paragraphPositions(editor);

    editor.commands.setTextSelection(positions[1]!);
    expect(editor.view.dom.querySelectorAll(placeholderSelector)).toHaveLength(1);
    expect(placeholderElement(editor)?.dataset.markweaveSlashPlaceholder).toBe("输入 / 唤起快捷操作");

    editor.commands.setTextSelection(positions[2]!);
    expect(editor.view.dom.querySelectorAll(placeholderSelector)).toHaveLength(1);
    expect(placeholderElement(editor)).toBe(editor.view.dom.querySelectorAll("p")[2]);

    editor.commands.setTextSelection(positions[0]!);
    expect(placeholderElement(editor)).toBeNull();
  });

  it("uses English copy when the editor language is en", () => {
    const editor = createEditor("<p></p>", "en");

    expect(placeholderElement(editor)?.dataset.markweaveSlashPlaceholder).toBe("Press / for quick actions");
  });

  it("suppresses the hint outside valid slash scopes, while composing, and when read-only", () => {
    const editor = createEditor("<h2></h2><ul><li><p></p></li></ul><pre><code></code></pre><p></p>");
    const positions = paragraphPositions(editor);

    editor.commands.setTextSelection(1);
    expect(placeholderElement(editor)).toBeNull();

    editor.commands.setTextSelection(positions[0]!);
    expect(placeholderElement(editor)).toBeNull();

    editor.commands.setTextSelection(positions[1]!);
    expect(placeholderElement(editor)).not.toBeNull();

    editor.view.dom.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    expect(placeholderElement(editor)).toBeNull();

    editor.view.dom.dispatchEvent(new Event("compositionend", { bubbles: true }));
    expect(placeholderElement(editor)).not.toBeNull();

    editor.setEditable(false);
    expect(placeholderElement(editor)).toBeNull();
  });
});
