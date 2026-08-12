// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import {
  markweaveInternalLinkCardPluginKey,
  type MarkweaveInternalLinkCardConfig,
} from "../src/plugins/internal-link-card/internal-link-card";

let activeEditor: Editor | null = null;

function createEditor(options: {
  content?: string;
  internalLinkCard?: MarkweaveInternalLinkCardConfig | null;
} = {}) {
  const element = document.createElement("div");
  document.body.appendChild(element);

  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions({
      internalLinkCard: options.internalLinkCard ?? null,
    }),
    content: options.content ?? "<p></p>",
  });

  return activeEditor;
}

const relativeInternalLink: MarkweaveInternalLinkCardConfig = {
  isInternalLink: (href) =>
    !/^[a-z][a-z0-9+.-]*:/i.test(href) &&
    !href.startsWith("#") &&
    !href.startsWith("//"),
};

function cardElement(editor: Editor) {
  return editor.view.dom.querySelector<HTMLElement>(
    ".markweave-internal-link-card",
  );
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("markweave internal link card", () => {
  it("registers no plugin when host config is absent", () => {
    const editor = createEditor();

    expect(
      markweaveInternalLinkCardPluginKey.getState(editor.state),
    ).toBeUndefined();
  });

  it("projects a whole-line internal link into a card", () => {
    const editor = createEditor({
      content: '<p><a href="notes/a.md">A</a></p><p>tail</p>',
      internalLinkCard: relativeInternalLink,
    });

    editor.commands.setTextSelection(editor.state.doc.content.size);

    const card = cardElement(editor);
    expect(card).not.toBeNull();
    expect(card?.getAttribute("href")).toBe("notes/a.md");
    expect(
      card?.querySelector(".markweave-internal-link-card-title")?.textContent,
    ).toBe("A");

    const paragraph = editor.view.dom.querySelector("p");
    expect(paragraph?.getAttribute("data-internal-link-card")).toBe("true");
  });

  it("shows the raw link (no card) while the caret is on that line", () => {
    const editor = createEditor({
      content: '<p><a href="notes/a.md">A</a></p><p>tail</p>',
      internalLinkCard: relativeInternalLink,
    });

    editor.commands.setTextSelection(2);

    expect(cardElement(editor)).toBeNull();
  });

  it("does not project inline links inside a longer paragraph", () => {
    const editor = createEditor({
      content: '<p>see <a href="notes/a.md">A</a> here</p><p>tail</p>',
      internalLinkCard: relativeInternalLink,
    });

    editor.commands.setTextSelection(editor.state.doc.content.size);

    expect(cardElement(editor)).toBeNull();
  });

  it("does not project external links", () => {
    const editor = createEditor({
      content: '<p><a href="https://example.com">Ext</a></p><p>tail</p>',
      internalLinkCard: relativeInternalLink,
    });

    editor.commands.setTextSelection(editor.state.doc.content.size);

    expect(cardElement(editor)).toBeNull();
  });

  it("applies resolver metadata (subtitle and missing state)", async () => {
    const editor = createEditor({
      content: '<p><a href="notes/a.md">A</a></p><p>tail</p>',
      internalLinkCard: {
        ...relativeInternalLink,
        resolve: () => ({
          title: "Alpha",
          subtitle: "notes/a.md",
          exists: false,
        }),
      },
    });

    editor.commands.setTextSelection(editor.state.doc.content.size);

    await Promise.resolve();
    await Promise.resolve();

    const card = cardElement(editor);
    expect(card).not.toBeNull();
    expect(card?.dataset.exists).toBe("false");
    expect(
      card?.querySelector(".markweave-internal-link-card-title")?.textContent,
    ).toBe("Alpha");
    expect(
      card?.querySelector(".markweave-internal-link-card-path")?.textContent,
    ).toBe("notes/a.md");
    expect(card?.getAttribute("data-markweave-internal-link-card")).toBe("true");
  });

  it("keeps storage as plain Markdown regardless of the card projection", () => {
    const editor = createEditor({
      content: '<p><a href="notes/a.md">A</a></p>',
      internalLinkCard: relativeInternalLink,
    });

    const paragraph = editor.state.doc.firstChild;
    expect(paragraph?.type.name).toBe("paragraph");
    expect(paragraph?.childCount).toBe(1);
    expect(paragraph?.firstChild?.isText).toBe(true);
    expect(paragraph?.firstChild?.marks.some((m) => m.type.name === "link")).toBe(
      true,
    );
  });

  it("consumes card clicks so ordinary link handlers cannot window.open", () => {
    const editor = createEditor({
      content: '<p><a href="notes/a.md">A</a></p><p>tail</p>',
      internalLinkCard: relativeInternalLink,
    });

    editor.commands.setTextSelection(editor.state.doc.content.size);

    const card = cardElement(editor);
    expect(card).not.toBeNull();

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });
    Object.defineProperty(event, "target", { value: card });

    const handled = editor.view.someProp("handleClick", (handler) =>
      handler(editor.view, 1, event),
    );

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
