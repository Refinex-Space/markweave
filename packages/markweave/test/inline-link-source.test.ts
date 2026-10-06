// @vitest-environment jsdom

import { Editor, type Extensions } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveReactEditorExtensions } from "../../markweave-react/src/create-editor-extensions";
import { createMarkweaveVue3EditorExtensions } from "../../markweave-vue3/src/create-editor-extensions";
import { setMarkweaveEditorModeState } from "../src/core/editor-mode-state";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import {
  decodeMarkdownLinkHrefForEditing,
  markweaveInlineLinkSourcePluginKey,
} from "../src/editor-core/link-click";

const activeEditors: Editor[] = [];

function createEditor(
  extensions: Extensions = createMarkweaveEditorExtensions(),
  content = '<p>See <a href="notes/a.md" title="Alpha">Target</a> end</p>',
  contentType?: "markdown",
) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({ element, extensions, content, contentType });
  activeEditors.push(editor);
  return editor;
}

function sourceTarget(editor: Editor) {
  return editor.view.dom.ownerDocument.querySelector<HTMLElement>(
    ".markweave-inline-link-source-target",
  );
}

function openAddress(editor: Editor, pos = 7) {
  editor.commands.setTextSelection(pos);
  editor.view.dispatch(editor.state.tr.setMeta(markweaveInlineLinkSourcePluginKey, { type: "activate", pos }));
}

afterEach(() => {
  activeEditors.splice(0).forEach((editor) => editor.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("inline link Markdown source", () => {
  it("opens an address portal without inserting layout-changing source into the document", () => {
    const editor = createEditor();
    const markdownBefore = editor.getMarkdown();

    openAddress(editor);

    expect(editor.view.dom.textContent).toBe("See Target end");
    expect(editor.view.dom.querySelector(".markweave-inline-link-source")).toBeNull();
    expect(sourceTarget(editor)?.closest(".markweave-inline-link-source")?.parentElement).toBe(document.body);
    expect(sourceTarget(editor)?.textContent).toBe("notes/a.md");
    expect(editor.getMarkdown()).toBe(markdownBefore);
  });

  it("does not open the address editor merely by placing the caret inside a link", () => {
    const editor = createEditor();
    editor.commands.setTextSelection(7);
    expect(sourceTarget(editor)).toBeNull();
    expect(editor.view.dom.textContent).toBe("See Target end");
  });

  it("keeps the address field mounted during edits and does not consume outside pointer events", () => {
    const editor = createEditor();
    openAddress(editor);
    const input = sourceTarget(editor)!;
    input.textContent = "notes/updated.md";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(sourceTarget(editor)).toBe(input);
    const outside = document.createElement("button");
    document.body.append(outside);
    const pointer = new Event("pointerdown", { bubbles: true, cancelable: true });
    outside.dispatchEvent(pointer);
    expect(pointer.defaultPrevented).toBe(false);
    expect(sourceTarget(editor)).toBeNull();
    expect(editor.getMarkdown()).toContain("notes/updated.md");
  });

  it("closes the portal when a retained editor becomes inactive", async () => {
    const editor = createEditor();
    openAddress(editor);
    editor.view.dom.parentElement!.setAttribute("aria-hidden", "true");
    await new Promise(resolve => window.setTimeout(resolve, 40));
    expect(sourceTarget(editor)).toBeNull();
    expect(markweaveInlineLinkSourcePluginKey.getState(editor.state)).toBeNull();
  });

  it("removes its body portal when the editor is destroyed", () => {
    const editor = createEditor();
    openAddress(editor);
    const popup = sourceTarget(editor)!.closest(".markweave-inline-link-source")!;
    editor.destroy();
    activeEditors.splice(activeEditors.indexOf(editor), 1);
    expect(popup.isConnected).toBe(false);
  });

  it("closes on Escape from the document without editing its content", () => {
    const editor = createEditor();
    const before = editor.getMarkdown();
    openAddress(editor);
    editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(sourceTarget(editor)).toBeNull();
    expect(editor.getMarkdown()).toBe(before);
  });

  it("shows a human-readable relative Unicode target", () => {
    const editor = createEditor(
      createMarkweaveEditorExtensions(),
      "Before [测试](./嘿嘿) after",
      "markdown",
    );
    openAddress(editor, 10);

    expect(sourceTarget(editor)?.textContent).toBe("./嘿嘿");
    expect(sourceTarget(editor)?.tagName).toBe("SPAN");
    expect(sourceTarget(editor)?.getAttribute("contenteditable")).toBe("plaintext-only");
    expect(editor.getMarkdown()).toBe("Before [测试](./嘿嘿) after");
  });

  it("decodes a browser-normalized Unicode href for source editing", () => {
    const editor = createEditor(
      createMarkweaveEditorExtensions(),
      '<p>Before <a href="./%E5%98%BF%E5%98%BF">测试</a> after</p>',
    );
    openAddress(editor, 10);

    expect(sourceTarget(editor)?.textContent).toBe("./嘿嘿");
  });

  it("preserves ASCII percent escapes while decoding Unicode characters", () => {
    expect(
      decodeMarkdownLinkHrefForEditing("./%E5%98%BF%20%E5%98%BF%2Fnote%23part"),
    ).toBe("./嘿%20嘿%2Fnote%23part");
  });

  it("does not rewrite an encoded href when the revealed value is submitted unchanged", () => {
    const editor = createEditor(
      createMarkweaveEditorExtensions(),
      '<p>Before <a href="./%E5%98%BF%E5%98%BF">测试</a> after</p>',
    );
    openAddress(editor, 10);
    const input = sourceTarget(editor)!;

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(editor.getMarkdown()).toBe("Before [测试](./%E5%98%BF%E5%98%BF) after");
  });

  it("reveals source on an ordinary authoring click instead of navigating", () => {
    const editor = createEditor();
    const anchor = editor.view.dom.querySelector<HTMLAnchorElement>("a.markweave-link")!;
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "target", { value: anchor });

    editor.view.someProp("handleClick", (handler) => handler(editor.view, 7, event));

    expect(anchor.getAttribute("target")).toBeNull();
    expect(event.defaultPrevented).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
    expect(sourceTarget(editor)?.textContent).toBe("notes/a.md");
  });

  it("prevents a native ordinary click without exposing a blank target", () => {
    const editor = createEditor();
    const anchor = editor.view.dom.querySelector<HTMLAnchorElement>("a.markweave-link")!;
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    expect(anchor.dispatchEvent(event)).toBe(false);
    expect(anchor.getAttribute("target")).toBeNull();
    expect(event.defaultPrevented).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("commits a safe edited address on Enter and preserves other link attributes", () => {
    const editor = createEditor();
    openAddress(editor);
    const input = sourceTarget(editor);
    expect(input).not.toBeNull();

    input!.textContent = "notes/b.md";
    input!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(sourceTarget(editor)).toBeNull();
    expect(editor.getMarkdown()).toContain('[Target](notes/b.md "Alpha")');
    const anchor = editor.view.dom.querySelector<HTMLAnchorElement>("a.markweave-link");
    expect(anchor?.getAttribute("title")).toBe("Alpha");
  });

  it("discards unsafe edits and closes on Escape without changing storage", () => {
    const editor = createEditor();
    const markdownBefore = editor.getMarkdown();
    openAddress(editor);
    const input = sourceTarget(editor)!;

    input.textContent = "javascript:alert(1)";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(input.getAttribute("aria-invalid")).toBe("true");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(sourceTarget(editor)).toBeNull();
    expect(editor.getMarkdown()).toBe(markdownBefore);
  });

  it("collapses when the selection leaves the link", () => {
    const editor = createEditor();
    openAddress(editor);
    expect(sourceTarget(editor)).not.toBeNull();

    editor.commands.setTextSelection(2);

    expect(sourceTarget(editor)).toBeNull();
    expect(markweaveInlineLinkSourcePluginKey.getState(editor.state)).toBeNull();
  });

  it("keeps Ctrl/Cmd click navigation and does not reveal source", () => {
    const editor = createEditor();
    const anchor = editor.view.dom.querySelector<HTMLAnchorElement>("a.markweave-link")!;
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });
    Object.defineProperty(event, "target", { value: anchor });

    editor.view.someProp("handleDOMEvents", (handlers) => {
      handlers.click?.(editor.view, event as PointerEvent);
      return false;
    });
    expect(openSpy).toHaveBeenCalledTimes(1);

    const handled = editor.view.someProp("handleClick", (handler) =>
      handler(editor.view, 7, event),
    );

    expect(handled).toBe(true);
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith("notes/a.md", "_blank", "noopener,noreferrer");
    expect(sourceTarget(editor)).toBeNull();
  });

  it("does not reveal source in View mode", () => {
    const editor = createEditor();
    setMarkweaveEditorModeState(editor, { mode: "view", editable: false });
    editor.setEditable(false);

    openAddress(editor);

    expect(sourceTarget(editor)).toBeNull();
  });

  it("forwards the opt-out through the runtime-compatible framework factories", () => {
    const factories = [
      createMarkweaveReactEditorExtensions,
      createMarkweaveVue3EditorExtensions,
    ];

    for (const factory of factories) {
      const editor = createEditor(factory({ revealLinkMarkdown: false }));
      openAddress(editor);
      expect(sourceTarget(editor)).toBeNull();
    }
  });
});
