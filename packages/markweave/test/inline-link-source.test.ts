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
  return editor.view.dom.querySelector<HTMLElement>(
    ".markweave-inline-link-source-target",
  );
}

afterEach(() => {
  activeEditors.splice(0).forEach((editor) => editor.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("inline link Markdown source", () => {
  it("reveals normalized Markdown without changing the document", () => {
    const editor = createEditor();
    const markdownBefore = editor.getMarkdown();

    editor.commands.setTextSelection(7);

    expect(editor.view.dom.textContent).toContain('[Target](notes/a.md "Alpha")');
    expect(sourceTarget(editor)?.textContent).toBe("notes/a.md");
    expect(editor.getMarkdown()).toBe(markdownBefore);
  });

  it("shows a human-readable relative Unicode target", () => {
    const editor = createEditor(
      createMarkweaveEditorExtensions(),
      "Before [测试](./嘿嘿) after",
      "markdown",
    );
    editor.commands.setTextSelection(10);

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
    editor.commands.setTextSelection(10);

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
    editor.commands.setTextSelection(10);
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
    editor.commands.setTextSelection(7);
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
    editor.commands.setTextSelection(7);
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
    editor.commands.setTextSelection(7);
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

    editor.commands.setTextSelection(7);

    expect(sourceTarget(editor)).toBeNull();
  });

  it("forwards the opt-out through the runtime-compatible framework factories", () => {
    const factories = [
      createMarkweaveReactEditorExtensions,
      createMarkweaveVue3EditorExtensions,
    ];

    for (const factory of factories) {
      const editor = createEditor(factory({ revealLinkMarkdown: false }));
      editor.commands.setTextSelection(7);
      expect(sourceTarget(editor)).toBeNull();
    }
  });
});
