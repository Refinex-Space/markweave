// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { createSelectionSnapshot } from "../src/editor-core/selection-state";
import { FloatingToolbar } from "../src/ui/floating-toolbar/FloatingToolbar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let activeEditor: Editor | null = null;
let activeRoot: Root | null = null;

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

async function flushReact() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function renderFloatingToolbar(content: string, selectedText: string) {
  const { editor, frame } = createEditor(content);
  selectText(editor, selectedText);

  const host = document.createElement("div");
  frame.appendChild(host);
  activeRoot = createRoot(host);

  await act(async () => {
    activeRoot?.render(createElement(FloatingToolbar, { editor, selectionSnapshot: createSelectionSnapshot(editor) }));
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
  document.body.replaceChildren();
});

describe("floating toolbar link popover", () => {
  it("applies a pasted link from the toolbar popover", async () => {
    const editor = await renderFloatingToolbar("<p>OpenAI plain</p>", "OpenAI");

    await click(getByTestId("markweave-floating-toolbar-button-link"));

    expect(getByTestId("markweave-floating-toolbar-link-popover")).not.toBeNull();
    const input = getByTestId<HTMLInputElement>("markweave-floating-toolbar-link-input");
    expect(input.placeholder).toBe("Paste a link...");

    await inputValue(input, " https://openai.com/docs ");
    await click(getByTestId("markweave-floating-toolbar-link-apply"));

    expect(editor.getHTML()).toContain('href="https://openai.com/docs"');
    expect(document.querySelector('[data-testid="markweave-floating-toolbar-link-popover"]')).toBeNull();
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
