// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { isEditorComposing } from "../src/editor-core/composition-guard";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { convertMarkdownTableAtSelection } from "../src/plugins/table/table-markdown-input";

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

function placeCursorInText(editor: Editor, text: string) {
  let position: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return true;
    }

    const offset = node.text.indexOf(text);
    if (offset < 0) {
      return true;
    }

    position = pos + offset + text.length;
    return false;
  });

  if (position === null) {
    throw new Error(`Expected text "${text}" in the editor fixture.`);
  }

  expect(editor.commands.setTextSelection(position)).toBe(true);
}

function dispatchEnter(editor: Editor) {
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  let handled = false;

  editor.view.someProp("handleKeyDown", (handler) => {
    const didHandle = handler(editor.view, event) === true;
    handled = handled || didHandle;
    return didHandle;
  });

  return handled;
}

function dispatchCompositionEvent(editor: Editor, type: "compositionstart" | "compositionupdate" | "compositionend") {
  return editor.view.dom.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
}

function tableShape(editor: Editor) {
  const shapes: Array<{ rows: number; columns: number; rowWidths: number[] }> = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name !== "table") {
      return true;
    }

    const rowWidths: number[] = [];
    node.forEach((row) => rowWidths.push(row.childCount));
    shapes.push({
      rows: node.childCount,
      columns: rowWidths[0] ?? 0,
      rowWidths,
    });
    return false;
  });

  return shapes;
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("markdown table input transform", () => {
  it("converts consecutive paragraph markdown table lines into a structured table", () => {
    const editor = createEditor(`
<p>Intro paragraph</p>
<p>| Module | Artifact |</p>
<p>| --- | --- |</p>
<p>| agentscope-core | io.agentscope:agentscope-core |</p>
`);
    placeCursorInText(editor, "io.agentscope:agentscope-core");

    expect(convertMarkdownTableAtSelection(editor)).toBe(true);
    expect(tableShape(editor)).toEqual([{ rows: 2, columns: 2, rowWidths: [2, 2] }]);
    expect(editor.getText()).toContain("Intro paragraph");
  });

  it("uses Enter as the realtime conversion trigger", () => {
    const editor = createEditor(`
<p>| Module | Artifact |</p>
<p>| --- | --- |</p>
<p>| agentscope-harness | io.agentscope:agentscope-harness |</p>
`);
    placeCursorInText(editor, "io.agentscope:agentscope-harness");

    expect(dispatchEnter(editor)).toBe(true);
    expect(tableShape(editor)).toEqual([{ rows: 2, columns: 2, rowWidths: [2, 2] }]);
  });

  it("keeps markdown table conversion undoable and redoable", () => {
    const editor = createEditor(`
<p>| A | B |</p>
<p>| --- | --- |</p>
<p>| 1 | 2 |</p>
`);
    placeCursorInText(editor, "| 1 | 2 |");

    expect(dispatchEnter(editor)).toBe(true);
    expect(tableShape(editor)).toEqual([{ rows: 2, columns: 2, rowWidths: [2, 2] }]);
    expect(editor.getText()).not.toContain("| --- | --- |");

    expect(editor.commands.undo()).toBe(true);
    expect(tableShape(editor)).toEqual([]);
    expect(editor.getText()).toContain("| A | B |");
    expect(editor.getText()).toContain("| --- | --- |");
    expect(editor.getText()).toContain("| 1 | 2 |");

    expect(editor.commands.redo()).toBe(true);
    expect(tableShape(editor)).toEqual([{ rows: 2, columns: 2, rowWidths: [2, 2] }]);
    expect(editor.getText()).not.toContain("| --- | --- |");
  });

  it("does not convert an incomplete markdown table", () => {
    const editor = createEditor(`
<p>| Module | Artifact |</p>
<p>| --- | --- |</p>
`);
    placeCursorInText(editor, "---");

    expect(convertMarkdownTableAtSelection(editor)).toBe(false);
    expect(tableShape(editor)).toEqual([]);
  });

  it("does not intercept Enter inside code blocks", () => {
    const editor = createEditor(`
<pre><code>| Module | Artifact |
| --- | --- |
| core | io.core |</code></pre>
`);
    placeCursorInText(editor, "io.core");

    expect(convertMarkdownTableAtSelection(editor)).toBe(false);
    expect(tableShape(editor)).toEqual([]);
  });

  it("defers markdown table conversion while IME composition is active", () => {
    const editor = createEditor(`
<p>| Module | Artifact |</p>
<p>| --- | --- |</p>
<p>| agentscope-core | io.agentscope:agentscope-core |</p>
`);
    placeCursorInText(editor, "io.agentscope:agentscope-core");

    expect(isEditorComposing(editor.state)).toBe(false);
    expect(dispatchCompositionEvent(editor, "compositionstart")).toBe(true);
    expect(isEditorComposing(editor.state)).toBe(true);
    expect(dispatchCompositionEvent(editor, "compositionupdate")).toBe(true);
    expect(isEditorComposing(editor.state)).toBe(true);

    expect(convertMarkdownTableAtSelection(editor)).toBe(false);
    expect(tableShape(editor)).toEqual([]);

    expect(dispatchCompositionEvent(editor, "compositionend")).toBe(true);
    expect(isEditorComposing(editor.state)).toBe(false);
    expect(convertMarkdownTableAtSelection(editor)).toBe(true);
    expect(tableShape(editor)).toEqual([{ rows: 2, columns: 2, rowWidths: [2, 2] }]);
  });
});
