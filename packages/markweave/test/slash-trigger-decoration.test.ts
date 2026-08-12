// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import type { MarkweaveLang } from "../src/i18n";

const triggerSelector = ".markweave-slash-trigger-active";
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

function selectEndOfFirstParagraph(editor: Editor) {
  let target: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (target === null && node.type.name === "paragraph") {
      target = pos + 1 + node.content.size;
      return false;
    }
    return true;
  });

  if (target === null) {
    throw new Error("Expected a paragraph.");
  }

  editor.commands.setTextSelection(target);
}

function triggerElement(editor: Editor) {
  return editor.view.dom.querySelector<HTMLElement>(triggerSelector);
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("slash trigger decoration", () => {
  it("decorates the in-document '/' and exposes the localized filter hint when the query is empty", () => {
    const editor = createEditor("<p>/</p>");
    selectEndOfFirstParagraph(editor);

    const element = triggerElement(editor);
    expect(element).not.toBeNull();
    expect(element?.textContent).toBe("/");
    expect(element?.dataset.markweaveSlashFilter).toBe("筛选...");
  });

  it("uses English filter copy when the editor language is en", () => {
    const editor = createEditor("<p>/</p>", "en");
    selectEndOfFirstParagraph(editor);

    expect(triggerElement(editor)?.dataset.markweaveSlashFilter).toBe("Filter...");
  });

  it("keeps decorating '/query' but drops the filter hint once a query is typed", () => {
    const editor = createEditor("<p>/heading</p>");
    selectEndOfFirstParagraph(editor);

    const element = triggerElement(editor);
    expect(element?.textContent).toBe("/heading");
    expect(element?.dataset.markweaveSlashFilter).toBeUndefined();
  });

  it("suppresses the trigger outside valid slash scopes and when read-only", () => {
    const editor = createEditor("<pre><code>/</code></pre><p>/</p>");

    editor.commands.setTextSelection(2);
    expect(triggerElement(editor)).toBeNull();

    selectEndOfFirstParagraph(editor);
    editor.setEditable(false);
    expect(triggerElement(editor)).toBeNull();
  });
});
