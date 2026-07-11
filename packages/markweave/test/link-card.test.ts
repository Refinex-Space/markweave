// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { calculateFloatingToolbarPopoverPlacement } from "../src/editor-core/selection-state";
import { setMarkweaveEditorModeState } from "../src/core/editor-mode-state";
import {
  getMarkweaveLinkCardMarkdown,
  getMarkweaveLinkCardTargetAtPos,
  normalizeMarkweaveLinkCardAttrs,
  replaceMarkweaveLinkCardWithLink,
  replaceMarkweaveLinkWithCard,
} from "../src/plugins/link-card/link-card";

let activeEditor: Editor | null = null;

function createEditor(content: string) {
  activeEditor?.destroy();
  const frame = document.createElement("section");
  frame.className = "markweave-editor-frame";
  frame.dataset.markweaveTheme = "light";
  const element = document.createElement("div");
  frame.append(element);
  document.body.append(frame);
  activeEditor = new Editor({ element, extensions: createMarkweaveEditorExtensions(), content });
  return activeEditor;
}

function firstTextPos(editor: Editor) {
  let pos = 1;
  editor.state.doc.descendants((node, nodePos) => {
    if (!node.isText) return true;
    pos = nodePos + 1;
    return false;
  });
  return pos;
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("link card model", () => {
  it("only accepts a paragraph containing exactly one external HTTP(S) link", () => {
    const single = createEditor('<p><a href="https://example.com">Example</a></p>');
    expect(getMarkweaveLinkCardTargetAtPos(single, firstTextPos(single))).toMatchObject({ href: "https://example.com/", title: "Example" });

    const mixed = createEditor('<p>Read <a href="https://example.com">Example</a></p>');
    expect(getMarkweaveLinkCardTargetAtPos(mixed, firstTextPos(mixed))).toBeNull();

    const unsafe = createEditor('<p><a href="javascript:alert(1)">Example</a></p>');
    expect(getMarkweaveLinkCardTargetAtPos(unsafe, firstTextPos(unsafe))).toBeNull();
  });

  it("converts between a normal link and an atomic card without losing the safe URL", () => {
    const editor = createEditor('<p><a href="https://example.com/docs">Example</a></p>');
    const target = getMarkweaveLinkCardTargetAtPos(editor, firstTextPos(editor));
    expect(target).not.toBeNull();
    expect(replaceMarkweaveLinkWithCard(editor, target!, {
      description: "A stable description",
      imageUrl: "https://cdn.example.com/preview.png",
      faviconUrl: "javascript:alert(1)",
    })).toBe(true);
    expect(editor.state.doc.firstChild?.type.name).toBe("markweaveLinkCard");
    expect(editor.state.doc.firstChild?.attrs).toMatchObject({
      href: "https://example.com/docs",
      imageUrl: "https://cdn.example.com/preview.png",
      faviconUrl: null,
    });
    expect(editor.getMarkdown()).toContain("data-markweave-link-card");
    expect(editor.getMarkdown()).toContain("https://example.com/docs");

    expect(replaceMarkweaveLinkCardWithLink(editor, 0)).toBe(true);
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
    expect(getMarkweaveLinkCardTargetAtPos(editor, firstTextPos(editor))).toMatchObject({ href: "https://example.com/docs" });
  });

  it("normalizes metadata boundaries and keeps ordinary Markdown link output", () => {
    const attrs = normalizeMarkweaveLinkCardAttrs({
      href: "https://example.com",
      title: `  ${"x".repeat(300)}  `,
      description: "description",
      imageUrl: "data:image/svg+xml,test",
    });
    expect(attrs?.title).toHaveLength(240);
    expect(attrs?.imageUrl).toBeNull();
    expect(getMarkweaveLinkCardMarkdown({ href: "https://example.com", title: "Example" })).toBe("[Example](https://example.com/)");
  });

  it("chooses the larger safe side when neither popover direction fits", () => {
    expect(calculateFloatingToolbarPopoverPlacement({
      toolbarRect: { left: 40, top: 20, width: 120, height: 24 },
      popoverSize: { width: 400, height: 160 },
      viewport: { width: 800, height: 500 },
      frameRect: { left: 0, top: 0, width: 800, height: 300 },
    }).placement).toBe("bottom");
    expect(calculateFloatingToolbarPopoverPlacement({
      toolbarRect: { left: 40, top: 250, width: 120, height: 24 },
      popoverSize: { width: 400, height: 160 },
      viewport: { width: 800, height: 500 },
      frameRect: { left: 0, top: 0, width: 800, height: 300 },
    }).placement).toBe("top");
  });

  it("opens the shared composer only for a qualifying external link", () => {
    const editor = createEditor('<p><a href="https://example.com">Example</a></p>');
    const anchor = editor.view.dom.querySelector<HTMLAnchorElement>("a[href]");
    expect(anchor).not.toBeNull();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "target", { value: anchor });
    let handled = false;
    editor.view.someProp("handleClick", (handler) => {
      handled = handler(editor.view, firstTextPos(editor), event) === true;
      return handled;
    });
    expect(handled).toBe(true);
    const composer = document.querySelector<HTMLFormElement>(".markweave-link-card-composer");
    expect(composer).not.toBeNull();
    const actionButtons = Array.from(composer?.querySelectorAll<HTMLButtonElement>(".markweave-link-card-composer-action") ?? []);
    expect(actionButtons).toHaveLength(4);
    expect(actionButtons.every((button) => button.querySelector("svg") && button.textContent === "" && button.dataset.tooltip)).toBe(true);
    expect(actionButtons.filter((button) => button.querySelector("rect[x=\"8\"][y=\"8\"][width=\"14\"][height=\"14\"]"))).toHaveLength(2);
    composer?.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    expect(editor.state.doc.firstChild?.type.name).toBe("markweaveLinkCard");
  });

  it("does not replace the normal View-mode link behavior with the composer", () => {
    const editor = createEditor('<p><a href="https://example.com">Example</a></p>');
    setMarkweaveEditorModeState(editor, { mode: "view", editable: false });
    const anchor = editor.view.dom.querySelector<HTMLAnchorElement>("a[href]");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "target", { value: anchor });
    let handled = false;
    editor.view.someProp("handleClick", (handler) => {
      handled = handler(editor.view, firstTextPos(editor), event) === true;
      return handled;
    });
    expect(handled).toBe(false);
    expect(document.querySelector(".markweave-link-card-composer")).toBeNull();
  });
});
