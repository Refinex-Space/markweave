// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkweaveEditor } from "../src/react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let activeRoot: Root | null = null;
let activeContainer: HTMLDivElement | null = null;

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

async function flushReact() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function renderReact(node: ReactNode) {
  activeContainer = document.createElement("div");
  document.body.appendChild(activeContainer);
  activeRoot = createRoot(activeContainer);

  await act(async () => {
    activeRoot?.render(node);
  });
  await flushReact();

  return activeContainer;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flushReact();
}

async function inputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  });
  await flushReact();
}

async function keyDown(element: Element, key: string, options: KeyboardEventInit = {}) {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));
  });
  await flushReact();
}

async function submit(element: HTMLFormElement) {
  await act(async () => {
    element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flushReact();
}

function getByTestId<T extends HTMLElement = HTMLElement>(container: HTMLElement, testId: string) {
  const element = container.querySelector<T>(`[data-testid="${testId}"]`);
  if (!element) {
    throw new Error(`Expected test id "${testId}".`);
  }
  return element;
}

beforeEach(() => {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => document.body,
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect(this: HTMLElement) {
    if (this.classList.contains("markweave-editor-frame")) {
      return createRect(0, 0, 960, 720);
    }
    if (this.classList.contains("tiptap-mathematics-render")) {
      return this.dataset.type === "block-math" ? createRect(180, 220, 360, 64) : createRect(180, 120, 120, 28);
    }
    return createRect(0, 0, 120, 32);
  });
});

afterEach(() => {
  act(() => {
    activeRoot?.unmount();
  });
  activeRoot = null;
  activeContainer = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("math editor popover", () => {
  it("opens inline math in Live mode and applies edited LaTeX", async () => {
    const container = await renderReact(
      createElement(MarkweaveEditor, {
        defaultContent: '<p>Formula <span data-type="inline-math" data-latex="a^2"></span></p>',
        defaultContentFormat: "html",
      }),
    );
    const math = container.querySelector('.tiptap-mathematics-render[data-type="inline-math"]');

    expect(math).toBeTruthy();
    await click(math!);

    const popover = getByTestId(container, "markweave-math-editor-popover");
    expect(popover.getAttribute("data-kind")).toBe("inline");
    expect(math?.getAttribute("data-markweave-math-editing")).toBe("true");
    expect(getByTestId(container, "markweave-math-inline-source").textContent).toContain("$");
    expect(getByTestId(container, "markweave-math-editor-preview").innerHTML).toContain("katex");
    expect(getByTestId(container, "markweave-math-editor-preview").innerHTML).not.toContain("annotation");

    const input = getByTestId<HTMLInputElement>(container, "markweave-math-editor-input");
    await inputValue(input, "b^2");
    expect(getByTestId(container, "markweave-math-editor-preview").innerHTML).toContain("katex");
    expect(getByTestId(container, "markweave-math-editor-preview").innerHTML).not.toContain("<code>");
    await keyDown(input, "Enter");

    expect(container.querySelector('[data-testid="markweave-math-editor-popover"]')).toBeNull();
    expect(container.querySelector("[data-markweave-math-editing]")).toBeNull();
    expect(container.innerHTML).toContain('data-latex="b^2"');
  });

  it("opens the clicked inline math node when multiple math nodes exist", async () => {
    const container = await renderReact(
      createElement(MarkweaveEditor, {
        defaultContent: '<p>First <span data-type="inline-math" data-latex="a"></span></p><p>Second <span data-type="inline-math" data-latex="b"></span></p>',
        defaultContentFormat: "html",
      }),
    );
    const formulas = container.querySelectorAll('.tiptap-mathematics-render[data-type="inline-math"]');

    expect(formulas).toHaveLength(2);
    await click(formulas[1]!);

    expect(getByTestId<HTMLInputElement>(container, "markweave-math-editor-input").value).toBe("b");
    expect(formulas[1]?.getAttribute("data-markweave-math-editing")).toBe("true");
    expect(formulas[0]?.getAttribute("data-markweave-math-editing")).toBeNull();
  });

  it("opens block math with a Typora-style source editor and applies the node", async () => {
    const container = await renderReact(
      createElement(MarkweaveEditor, {
        defaultContent: '<div data-type="block-math" data-latex="x"></div>',
        defaultContentFormat: "html",
      }),
    );
    const math = container.querySelector('.tiptap-mathematics-render[data-type="block-math"]');

    expect(math).toBeTruthy();
    await click(math!);

    const popover = getByTestId(container, "markweave-math-editor-popover");
    expect(popover.getAttribute("data-kind")).toBe("block");
    expect(popover.parentElement).not.toBe(math);
    expect(math?.contains(popover)).toBe(false);
    expect(math?.getAttribute("data-markweave-math-editing")).toBe("true");
    expect(getByTestId(container, "markweave-math-block-source").textContent).toContain("$$");
    expect(getByTestId(container, "markweave-math-editor-preview").getAttribute("data-math-number")).toBe("1");
    expect(getByTestId(container, "markweave-math-editor-preview").innerHTML).toContain("katex");
    expect(getByTestId(container, "markweave-math-editor-input").tagName).toBe("TEXTAREA");

    const textarea = getByTestId<HTMLTextAreaElement>(container, "markweave-math-editor-input");
    await inputValue(textarea, "y");
    expect(getByTestId(container, "markweave-math-editor-preview").innerHTML).toContain("katex");
    expect(getByTestId(container, "markweave-math-editor-preview").innerHTML).not.toContain("<code>");
    await submit(getByTestId<HTMLFormElement>(container, "markweave-math-editor-popover"));
    expect(container.querySelector("[data-markweave-math-editing]")).toBeNull();
    expect(container.innerHTML).toContain('data-latex="y"');
  });

  it("keeps math formulas read-only in View mode", async () => {
    const container = await renderReact(
      createElement(MarkweaveEditor, {
        defaultContent: '<p><span data-type="inline-math" data-latex="a^2"></span></p>',
        defaultContentFormat: "html",
        mode: "view",
      }),
    );
    const math = container.querySelector('.tiptap-mathematics-render[data-type="inline-math"]');

    expect(math).toBeTruthy();
    await click(math!);

    expect(container.querySelector('[data-testid="markweave-math-editor-popover"]')).toBeNull();
  });
});
