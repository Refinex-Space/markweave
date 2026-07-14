// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { createMarkweaveSearchController } from "../src/plugins/search/search-controller";

let activeEditor: Editor | null = null;

function createEditor(content: string) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  activeEditor = new Editor({
    content,
    element,
    extensions: createMarkweaveEditorExtensions(),
  });
  return activeEditor;
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("Markweave search controller", () => {
  it("highlights literal matches across inline marks and supports case and whole-word matching", () => {
    const editor = createEditor("<p>Alpha <strong>alpha</strong> ALPHA alphabet</p><p>Alpha</p>");
    const search = createMarkweaveSearchController(editor);

    search.setQuery("alpha");
    expect(search.getState()).toMatchObject({
      activeMatchIndex: 0,
      error: null,
      matchCount: 5,
      query: "alpha",
    });
    expect(editor.view.dom.querySelectorAll(".markweave-search-match")).toHaveLength(5);
    expect(editor.view.dom.querySelectorAll(".markweave-search-match--active")).toHaveLength(1);

    search.setOptions({ caseSensitive: true, wholeWord: true });
    expect(search.getState().matchCount).toBe(1);

    search.setQuery("alpha", { caseSensitive: false, wholeWord: true });
    expect(search.getState().matchCount).toBe(4);
  });

  it("navigates in both directions with wraparound and notifies subscribers", () => {
    const editor = createEditor("<p>one two one three one</p>");
    const search = createMarkweaveSearchController(editor);
    const listener = vi.fn();
    const unsubscribe = search.subscribe(listener);

    search.setQuery("one");
    expect(search.getState().activeMatchIndex).toBe(0);
    search.findPrevious();
    expect(search.getState().activeMatchIndex).toBe(2);
    search.findNext();
    expect(search.getState().activeMatchIndex).toBe(0);
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    const callCount = listener.mock.calls.length;
    search.findNext();
    expect(listener).toHaveBeenCalledTimes(callCount);
  });

  it("keeps the editor selection unchanged while revealing search matches", () => {
    const editor = createEditor("<p>one two one</p>");
    const search = createMarkweaveSearchController(editor);
    editor.commands.setTextSelection(5);
    const initialSelection = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };

    search.setQuery("one");
    expect(editor.state.selection).toMatchObject(initialSelection);

    search.findNext();
    expect(editor.state.selection).toMatchObject(initialSelection);
  });

  it("uses Unicode word segmentation for exact Chinese matches", () => {
    const editor = createEditor("<p>在文档中搜索内容，也可以搜索工作区。</p>");
    const search = createMarkweaveSearchController(editor);

    search.setQuery("搜索", { wholeWord: true });
    expect(search.getState().matchCount).toBe(2);
  });

  it("supports regex matching, capture-group replacement, and invalid-pattern errors", () => {
    const editor = createEditor("<p>foo-12 foo-34</p>");
    const search = createMarkweaveSearchController(editor);

    search.setQuery("(foo)-(\\d+)", { regex: true });
    expect(search.getState().matchCount).toBe(2);
    expect(search.replaceAll("$2:$1")).toBe(2);
    expect(editor.getText()).toContain("12:foo 34:foo");

    search.setQuery("(", { regex: true });
    expect(search.getState()).toMatchObject({
      activeMatchIndex: -1,
      matchCount: 0,
    });
    expect(search.getState().error).toBeTruthy();
  });

  it("replaces the active match or every match and recomputes results after document changes", () => {
    const editor = createEditor("<p><strong>cat</strong> cat cat</p>");
    const search = createMarkweaveSearchController(editor);

    search.setQuery("cat");
    expect(search.replaceCurrent("dog")).toBe(true);
    expect(editor.getText()).toContain("dog cat cat");
    expect(search.getState().matchCount).toBe(2);
    expect(search.replaceAll("fox")).toBe(2);
    expect(editor.getText()).toContain("dog fox fox");
    expect(search.getState().matchCount).toBe(0);

    editor.commands.insertContentAt(editor.state.doc.content.size - 1, " cat");
    expect(search.getState().matchCount).toBe(1);
  });

  it("allows searching but blocks replacement when the editor is read-only", () => {
    const editor = createEditor("<p>locked locked</p>");
    const search = createMarkweaveSearchController(editor);
    editor.setEditable(false);

    search.setQuery("locked");
    expect(search.getState().matchCount).toBe(2);
    expect(search.replaceCurrent("changed")).toBe(false);
    expect(search.replaceAll("changed")).toBe(0);
    expect(editor.getText()).toContain("locked locked");
  });

  it("clears all decorations without changing the document", () => {
    const editor = createEditor("<p>keep keep</p>");
    const search = createMarkweaveSearchController(editor);

    search.setQuery("keep");
    search.clear();

    expect(search.getState()).toMatchObject({
      activeMatchIndex: -1,
      matchCount: 0,
      query: "",
    });
    expect(editor.view.dom.querySelectorAll(".markweave-search-match")).toHaveLength(0);
    expect(editor.getText()).toContain("keep keep");
  });
});
