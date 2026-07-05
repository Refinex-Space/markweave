// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { createSelectionSnapshot } from "../src/editor-core/selection-state";
import { getMarkweaveMessages, type MarkweaveMessages } from "../src/i18n";
import { FloatingToolbar, getFloatingToolbarSelectionDomRects } from "../src/ui/floating-toolbar/FloatingToolbar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let activeEditor: Editor | null = null;
let activeRoot: Root | null = null;
const addedMockMethods: Array<{ prototype: object; key: string }> = [];

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function createRectList(rects: readonly DOMRect[]): DOMRectList {
  return Object.assign([...rects], {
    item: (index: number) => rects[index] ?? null,
  }) as unknown as DOMRectList;
}

function installLayoutMocks(editor: Editor) {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    return window.setTimeout(() => callback(0), 0);
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => window.clearTimeout(id));
  vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
  vi.spyOn(editor.view, "coordsAtPos").mockImplementation(() => ({
    bottom: 228,
    left: 520,
    right: 620,
    top: 204,
  }));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect(this: HTMLElement) {
    if (this.classList.contains("markweave-editor-frame")) {
      return createRect(100, 80, 920, 640);
    }

    if (this.dataset.testid === "markweave-floating-toolbar") {
      return createRect(360, 150, 640, 44);
    }

    if (this.classList.contains("markweave-floating-toolbar-content")) {
      return createRect(360, 150, 640, 44);
    }

    return createRect(0, 0, 80, 32);
  });
}

function createEditor(content: string) {
  const frame = document.createElement("div");
  frame.className = "markweave-editor-frame";
  const surface = document.createElement("div");
  surface.className = "markweave-editor-surface";
  frame.appendChild(surface);
  document.body.appendChild(frame);

  activeEditor = new Editor({
    element: surface,
    extensions: createMarkweaveEditorExtensions(),
    content,
  });

  installLayoutMocks(activeEditor);

  return { editor: activeEditor, frame };
}

function textPosition(editor: Editor, text: string, boundary: "start" | "end" = "end") {
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
    throw new Error(`Expected text "${text}".`);
  }

  return position;
}

function selectText(editor: Editor, text: string) {
  expect(editor.commands.setTextSelection({ from: textPosition(editor, text, "start"), to: textPosition(editor, text, "end") })).toBe(true);
}

function selectTextRange(editor: Editor, text: string, length: number) {
  const from = textPosition(editor, text, "start");
  expect(editor.commands.setTextSelection({ from, to: from + length })).toBe(true);
}

function findTextNode(root: Node, text: string): Text {
  if (root.nodeType === Node.TEXT_NODE && root.textContent?.includes(text)) {
    return root as Text;
  }

  for (const child of Array.from(root.childNodes)) {
    try {
      return findTextNode(child, text);
    } catch {
      continue;
    }
  }

  throw new Error(`Expected text node containing "${text}".`);
}

function setNativeSelection(textNode: Text, from: number, to: number) {
  const range = document.createRange();
  range.setStart(textNode, from);
  range.setEnd(textNode, to);
  const selection = window.getSelection();

  if (!selection) {
    throw new Error("Expected native selection.");
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function mockPrototypeMethod(prototype: object, key: string, implementation: () => unknown) {
  if (key in prototype) {
    vi.spyOn(prototype as Record<string, () => unknown>, key).mockImplementation(implementation);
    return;
  }

  Object.defineProperty(prototype, key, {
    configurable: true,
    value: vi.fn(implementation),
  });
  addedMockMethods.push({ prototype, key });
}

async function flushReact() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function renderFloatingToolbar(content: string, selectedText: string, messages?: MarkweaveMessages) {
  const { editor, frame } = createEditor(content);
  selectText(editor, selectedText);

  const host = document.createElement("div");
  frame.appendChild(host);
  activeRoot = createRoot(host);

  await act(async () => {
    activeRoot?.render(createElement(FloatingToolbar, { editor, messages, selectionSnapshot: createSelectionSnapshot(editor) }));
  });
  await flushReact();

  return editor;
}

function getByTestId<T extends HTMLElement = HTMLElement>(testId: string) {
  const element = document.querySelector<T>(`[data-testid="${testId}"]`);

  if (!element) {
    throw new Error(`Expected test id "${testId}".`);
  }

  return element;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flushReact();
}

async function inputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, data: value, inputType: "insertText" }));
    input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  });
  await flushReact();
}

afterEach(() => {
  activeRoot?.unmount();
  activeRoot = null;
  activeEditor?.destroy();
  activeEditor = null;
  vi.restoreAllMocks();
  while (addedMockMethods.length > 0) {
    const method = addedMockMethods.pop();
    if (method) {
      delete (method.prototype as Record<string, unknown>)[method.key];
    }
  }
  document.body.replaceChildren();
});

describe("floating toolbar selection geometry", () => {
  it("ignores stale native selection rects that do not match the editor selection", () => {
    const { editor } = createEditor(
      "<table><tbody><tr><td><p>Table</p></td><td><p>Toolbar</p></td></tr></tbody></table><h2>Markdown WYSIWYG</h2>",
    );
    selectTextRange(editor, "Markdown", 1);
    setNativeSelection(findTextNode(editor.view.dom, "Table"), 0, 1);
    mockPrototypeMethod(Range.prototype, "getClientRects", function getClientRects(this: Range) {
      const text = this.startContainer.textContent ?? "";

      if (text.includes("Table")) {
        return createRectList([createRect(180, 120, 20, 18)]);
      }

      if (text.includes("Markdown")) {
        return createRectList([createRect(220, 320, 24, 24)]);
      }

      return createRectList([]);
    });
    mockPrototypeMethod(Range.prototype, "getBoundingClientRect", function getBoundingClientRect(this: Range) {
      const rect = this.startContainer.textContent?.includes("Markdown") ? createRect(220, 320, 24, 24) : createRect(180, 120, 20, 18);
      return rect;
    });

    expect(getFloatingToolbarSelectionDomRects(editor)?.[0]).toMatchObject({
      left: 220,
      top: 320,
      width: 24,
      height: 24,
    });
  });

  it("measures a block-start single-character selection from the ProseMirror DOM range before using coordsAtPos", () => {
    const { editor } = createEditor("<h2>Markdown WYSIWYG</h2>");
    selectTextRange(editor, "Markdown", 1);
    window.getSelection()?.removeAllRanges();
    mockPrototypeMethod(Range.prototype, "getClientRects", function getClientRects(this: Range) {
      const text = this.startContainer.textContent ?? "";
      return text.includes("Markdown") ? createRectList([createRect(220, 320, 24, 24)]) : createRectList([]);
    });
    mockPrototypeMethod(Range.prototype, "getBoundingClientRect", () => createRect(220, 320, 24, 24));

    expect(getFloatingToolbarSelectionDomRects(editor)?.[0]).toMatchObject({
      left: 220,
      top: 320,
      width: 24,
      height: 24,
    });
  });
});

describe("floating toolbar link popover", () => {
  it("applies a pasted link from the toolbar popover", async () => {
    const editor = await renderFloatingToolbar("<p>OpenAI plain</p>", "OpenAI");

    await click(getByTestId("markweave-floating-toolbar-button-link"));

    expect(getByTestId("markweave-floating-toolbar-link-popover")).not.toBeNull();
    const input = getByTestId<HTMLInputElement>("markweave-floating-toolbar-link-input");
    expect(input.placeholder).toBe("粘贴链接...");

    await inputValue(input, " https://openai.com/docs ");
    await click(getByTestId("markweave-floating-toolbar-link-apply"));

    expect(editor.getHTML()).toContain('href="https://openai.com/docs"');
    expect(document.querySelector('[data-testid="markweave-floating-toolbar-link-popover"]')).toBeNull();
  });

  it("renders English link copy when English messages are provided", async () => {
    await renderFloatingToolbar("<p>OpenAI plain</p>", "OpenAI", getMarkweaveMessages("en"));

    await click(getByTestId("markweave-floating-toolbar-button-link"));

    expect(getByTestId<HTMLInputElement>("markweave-floating-toolbar-link-input").placeholder).toBe("Paste a link...");
  });

  it("opens and removes the current link from the toolbar popover", async () => {
    const editor = await renderFloatingToolbar('<p><a href="https://openai.com">OpenAI</a> plain</p>', "OpenAI");
    const openWindow = vi.spyOn(window, "open").mockImplementation(() => null);

    await click(getByTestId("markweave-floating-toolbar-button-link"));

    const input = getByTestId<HTMLInputElement>("markweave-floating-toolbar-link-input");
    expect(input.value).toBe("https://openai.com");

    await click(getByTestId("markweave-floating-toolbar-link-open"));
    expect(openWindow).toHaveBeenCalledWith("https://openai.com", "_blank", "noopener,noreferrer");

    await click(getByTestId("markweave-floating-toolbar-link-remove"));
    expect(editor.getHTML()).not.toContain('href="https://openai.com"');
    expect(document.querySelector('[data-testid="markweave-floating-toolbar-link-popover"]')).toBeNull();
  });
});
