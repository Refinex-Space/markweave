// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import {
  createMarkweaveTocState,
  getActiveMarkweaveTocId,
  getMarkweaveTocItems,
  getMarkweaveTocItemsFromState,
  scrollToMarkweaveTocItem,
} from "../src/core/toc-state";

let activeEditor: Editor | null = null;

function createRect(top: number, height = 32): DOMRect {
  return {
    bottom: top + height,
    height,
    left: 0,
    right: 640,
    top,
    width: 640,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

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

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("markweave table of contents model", () => {
  it("registers only the optimized task-list extension", () => {
    const editor = createEditor("<p>Body</p>");
    const taskLists = editor.extensionManager.extensions.filter(
      (extension) => extension.name === "taskList",
    );

    expect(taskLists).toHaveLength(1);
    expect(
      String(taskLists[0]?.config.markdownTokenizer?.tokenize),
    ).toContain("readMarkdownLine");
  });

  it("extracts non-empty H2-H6 headings and skips H1 or empty headings", () => {
    const editor = createEditor("<h1>Title</h1><h2>Section</h2><h2>  </h2><p>Body</p><h6>Deep Heading</h6>");
    const items = getMarkweaveTocItems(editor.state.doc);

    expect(items.map(({ level, text }) => ({ level, text }))).toEqual([
      { level: 2, text: "Section" },
      { level: 6, text: "Deep Heading" },
    ]);
    expect(items[0]?.id).toBe(`markweave-toc-0-${items[0]?.pos}`);
    expect(items[1]?.id).toBe(`markweave-toc-1-${items[1]?.pos}`);
  });

  it("keeps duplicate headings addressable by unique ids", () => {
    const editor = createEditor("<h2>Repeat</h2><p>Body</p><h2>Repeat</h2>");
    const items = getMarkweaveTocItems(editor.state.doc);

    expect(items).toHaveLength(2);
    expect(items[0]?.text).toBe("Repeat");
    expect(items[1]?.text).toBe("Repeat");
    expect(items[0]?.id).not.toBe(items[1]?.id);
  });

  it("updates order, level, and positions after document changes", () => {
    const editor = createEditor("<h2>Before</h2>");
    const before = getMarkweaveTocItems(editor.state.doc);

    editor.commands.setContent("<p>Intro</p><h1>After</h1><h3>Details</h3>", { emitUpdate: false });
    const after = getMarkweaveTocItems(editor.state.doc);

    expect(before[0]?.text).toBe("Before");
    expect(after.map(({ level, text }) => ({ level, text }))).toEqual([{ level: 3, text: "Details" }]);
    expect(after[0]?.pos).not.toBe(before[0]?.pos);
  });

  it("keeps the plugin projection equal to a full scan after local edits", () => {
    const editor = createEditor(
      "<p>Intro</p><h2>Before</h2><p>Body</p><h3>After</h3>",
    );
    const before = getMarkweaveTocItemsFromState(editor.state);

    editor.commands.insertContentAt(before[0]!.pos + 1, "Updated ");
    editor.commands.insertContentAt(0, "Preface");

    const projected = getMarkweaveTocItemsFromState(editor.state);
    const scanned = getMarkweaveTocItems(editor.state.doc);
    expect(projected).toEqual(scanned);
    expect(projected.map((item) => item.text)).toEqual([
      "Updated Before",
      "After",
    ]);
  });

  it("marks the active item in the derived TOC state", () => {
    const editor = createEditor("<h1>One</h1><h2>Two</h2><h3>Three</h3>");
    const items = getMarkweaveTocItems(editor.state.doc);
    const state = createMarkweaveTocState(items, items[1]?.id ?? null);

    expect(state.activeId).toBe(items[1]?.id);
    expect(state.items.map((item) => item.active)).toEqual([false, true]);
  });

  it("derives the active heading from DOM positions and scrolls to a target", () => {
    const editor = createEditor("<h1>One</h1><h2>Two</h2><h3>Three</h3>");
    const items = getMarkweaveTocItems(editor.state.doc);
    const headings = Array.from(editor.view.dom.querySelectorAll("h2,h3"));
    const scrollIntoView = vi.fn();

    headings.forEach((heading, index) => {
      Object.defineProperty(heading, "scrollIntoView", {
        configurable: true,
        value: scrollIntoView,
      });
      vi.spyOn(heading, "getBoundingClientRect").mockReturnValue(createRect([20, 120][index] ?? 0));
    });

    expect(getActiveMarkweaveTocId(editor, items)).toBe(items[0]?.id);
    expect(scrollToMarkweaveTocItem(editor, items[1]!, { behavior: "auto" })).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("uses logarithmic heading measurements while scrolling large outlines", () => {
    const editor = createEditor(
      Array.from({ length: 128 }, (_, index) => `<h2>Section ${index + 1}</h2>`).join(""),
    );
    const items = getMarkweaveTocItems(editor.state.doc);
    const headings = Array.from(editor.view.dom.querySelectorAll("h2"));
    const measurements = headings.map((heading, index) =>
      vi.spyOn(heading, "getBoundingClientRect").mockReturnValue(
        createRect(index * 80 - 4_000),
      ),
    );

    expect(getActiveMarkweaveTocId(editor, items)).toBe(items[51]?.id);
    expect(measurements.reduce((total, spy) => total + spy.mock.calls.length, 0)).toBeLessThanOrEqual(8);
  });
});
