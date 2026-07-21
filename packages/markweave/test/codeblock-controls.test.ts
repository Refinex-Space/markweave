// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { getActiveCodeBlockState, setActiveCodeBlockCollapsed, setActiveCodeBlockMermaidPreviewMode } from "../src/plugins/codeblock/codeblock-behavior";
import { setMermaidInlinePreviewEditorMode } from "../src/plugins/mermaid/mermaid-inline-preview";
import type { MermaidPreviewMode } from "../src/plugins/mermaid/mermaid-renderer";
import { CodeBlockControls, mergeStableMermaidTabPositions } from "../../markweave-react/src/ui/codeblock/CodeBlockControls";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface RenderedControls {
  readonly editor: Editor;
  readonly frame: HTMLElement;
  readonly root: Root;
  rerender(mode?: MermaidPreviewMode): void;
}

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

function mockPrototypeMethod(prototype: object, key: string, implementation: (this: HTMLElement) => unknown) {
  if (key in prototype) {
    vi.spyOn(prototype as Record<string, (this: HTMLElement) => unknown>, key).mockImplementation(implementation);
    return;
  }

  Object.defineProperty(prototype, key, {
    configurable: true,
    value: vi.fn(implementation),
  });
  addedMockMethods.push({ prototype, key });
}

function installLayoutMocks() {
  const frameLeft = 480;
  const frameTop = 48;

  mockPrototypeMethod(HTMLElement.prototype, "getBoundingClientRect", function getBoundingClientRect(this: HTMLElement) {
    if (this.classList.contains("markweave-editor-frame") || this.classList.contains("markweave-codeblock-overlay")) {
      return createRect(frameLeft, frameTop, 900, 620);
    }

    if (this.dataset.testid === "markweave-codeblock-language") {
      return createRect(frameLeft + 705, frameTop + 50, 92, 26);
    }

    if (this.dataset.testid === "markweave-mermaid-inline-preview") {
      return createRect(frameLeft + 24, frameTop + 90, 840, 300);
    }

    if (this.classList.contains("markweave-codeblock-language-list")) {
      return createRect(0, 0, 220, 26);
    }

    if (this.dataset.languageIndex) {
      const index = Number.parseInt(this.dataset.languageIndex, 10);
      const listScrollTop = this.parentElement?.scrollTop ?? 0;
      return createRect(0, index * 26 - listScrollTop, 220, 26);
    }

    if (this.tagName === "PRE") {
      return createRect(frameLeft + 24, frameTop + 50, 840, 160);
    }

    return createRect(0, 0, 80, 24);
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
    throw new Error(`Expected text "${text}" in the editor fixture.`);
  }

  return position;
}

function renderControls(
  content: string,
  options: { readonly active?: boolean; readonly mode?: MermaidPreviewMode; readonly readOnly?: boolean; readonly selectText?: string } = {},
): RenderedControls {
  installLayoutMocks();
  const { editor, frame } = createEditor(content);
  if (options.readOnly) {
    setMermaidInlinePreviewEditorMode(editor, "view");
  }
  const targetText = options.selectText ?? editor.state.doc.textContent;
  expect(editor.commands.setTextSelection(textPosition(editor, targetText))).toBe(true);
  const controlsHost = document.createElement("div");
  frame.appendChild(controlsHost);
  let mode = options.mode ?? getActiveCodeBlockState(editor).mermaidPreviewMode;
  const onMermaidModeChange = vi.fn((nextMode: MermaidPreviewMode) => {
    mode = nextMode;
  });

  activeRoot = createRoot(controlsHost);

  const rerender = (nextMode = mode) => {
    mode = nextMode;
    act(() => {
      activeRoot?.render(
        createElement(CodeBlockControls, {
          editor,
          active: options.active ?? getActiveCodeBlockState(editor).active,
          mermaidMode: mode,
          onMermaidModeChange,
          readOnly: options.readOnly,
        }),
      );
    });
  };

  rerender();

  return { editor, frame, root: activeRoot, rerender };
}

function queryByTestId<T extends HTMLElement = HTMLElement>(testId: string) {
  return document.querySelector<T>(`[data-testid="${testId}"]`);
}

function getByTestId<T extends HTMLElement = HTMLElement>(testId: string) {
  const element = queryByTestId<T>(testId);

  if (!element) {
    throw new Error(`Expected test id "${testId}".`);
  }

  return element;
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function inputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  act(() => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  });
}

function keyDown(element: Element, key: string) {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

function hover(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
  });
}

function pointerMove(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true }));
  });
}

function wheel(element: Element, deltaY: number) {
  act(() => {
    element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY }));
  });
}

function drag(element: Element, from: { readonly x: number; readonly y: number }, to: { readonly x: number; readonly y: number }) {
  act(() => {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: from.x, clientY: from.y }));
    element.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, buttons: 1, clientX: to.x, clientY: to.y }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, clientX: to.x, clientY: to.y }));
  });
}

async function flushAsyncSave() {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

afterEach(() => {
  activeRoot?.unmount();
  activeRoot = null;
  vi.restoreAllMocks();
  while (addedMockMethods.length > 0) {
    const method = addedMockMethods.pop();
    if (method) {
      delete (method.prototype as Record<string, unknown>)[method.key];
    }
  }
  activeEditor?.destroy();
  activeEditor = null;
  Reflect.deleteProperty(window, "showSaveFilePicker");
  document.body.replaceChildren();
});

describe("code block controls", () => {
  it("keeps the last Mermaid tab coordinates when a preview/code switch temporarily loses its anchor", () => {
    expect(
      mergeStableMermaidTabPositions(
        [
          { pos: 8, top: 60, left: 34 },
          { pos: 44, top: 240, left: 34 },
        ],
        [{ pos: 44, top: 248, left: 36 }],
        [8, 44],
      ),
    ).toEqual([
      { pos: 8, top: 60, left: 34 },
      { pos: 44, top: 248, left: 36 },
    ]);
  });

  it("drops stale Mermaid tab coordinates after the target block leaves the document", () => {
    expect(mergeStableMermaidTabPositions([{ pos: 8, top: 60, left: 34 }], [], [])).toEqual([]);
  });

  it("keeps Mermaid tabs visible even when the block is neither active nor hovered", () => {
    const { editor } = renderControls(
      `<p>outside</p><pre><code class="language-mermaid">graph TD
  A --> B</code></pre>`,
      { selectText: "outside" },
    );
    const outsidePosition = textPosition(editor, "outside");

    expect(getActiveCodeBlockState(editor).active).toBe(false);
    expect(editor.state.selection.from).toBe(outsidePosition);
    expect(queryByTestId("markweave-codeblock-controls")).toBeNull();
    expect(getByTestId("markweave-mermaid-tabs").dataset.positioned).toBe("true");
    expect(getByTestId("markweave-mermaid-tabs").style.top).toBe("100px");
    expect(getByTestId("markweave-mermaid-tabs").style.left).toBe("34px");
    expect(getByTestId("markweave-mermaid-mode-preview").dataset.active).toBe("true");

    click(getByTestId("markweave-mermaid-mode-code"));

    expect(getActiveCodeBlockState(editor).active).toBe(false);
    expect(editor.state.selection.from).toBe(outsidePosition);
    expect(editor.getHTML()).toContain('data-mermaid-preview-mode="code"');
  });

  it("shows code block controls on hover without requiring editor focus inside the block", async () => {
    const writeText = vi.fn<Clipboard["writeText"]>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { editor } = renderControls('<p>outside</p><pre><code class="language-ts">const value = 1;</code></pre>', {
      selectText: "outside",
    });

    expect(getActiveCodeBlockState(editor).active).toBe(false);
    expect(queryByTestId("markweave-codeblock-controls")).toBeNull();

    const codeBlockElement = editor.view.dom.querySelector("pre");
    if (!codeBlockElement) {
      throw new Error("Expected code block element.");
    }

    pointerMove(codeBlockElement);

    expect(getByTestId("markweave-codeblock-controls").dataset.positioned).toBe("true");
    expect(getByTestId("markweave-codeblock-language").textContent).toContain("TypeScript");

    await act(async () => {
      const copyButton = getByTestId("markweave-codeblock-copy");
      copyButton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      copyButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(writeText).toHaveBeenCalledWith("const value = 1;");
    expect(getActiveCodeBlockState(editor).active).toBe(true);
  });

  it("keeps read-only code block language and copy controls visible on hover", async () => {
    const writeText = vi.fn<Clipboard["writeText"]>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { editor } = renderControls('<p>outside</p><pre><code class="language-ts">const value = 1;</code></pre>', {
      readOnly: true,
      selectText: "outside",
    });
    const initialHtml = editor.getHTML();

    expect(getActiveCodeBlockState(editor).active).toBe(false);
    expect(queryByTestId("markweave-codeblock-controls")).toBeNull();
    expect(queryByTestId("markweave-mermaid-tabs")).toBeNull();

    const codeBlockElement = editor.view.dom.querySelector("pre");
    if (!codeBlockElement) {
      throw new Error("Expected code block element.");
    }

    pointerMove(codeBlockElement);

    expect(getByTestId("markweave-codeblock-overlay").dataset.readOnly).toBe("true");
    expect(getByTestId("markweave-codeblock-controls").dataset.readOnly).toBe("true");
    expect(getByTestId("markweave-codeblock-language").textContent).toContain("TypeScript");
    expect(queryByTestId("markweave-codeblock-collapse")).toBeNull();

    click(getByTestId("markweave-codeblock-language"));
    expect(queryByTestId("markweave-codeblock-language-menu")).toBeNull();

    await act(async () => {
      const copyButton = getByTestId("markweave-codeblock-copy");
      copyButton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      copyButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(writeText).toHaveBeenCalledWith("const value = 1;");
    expect(getByTestId("markweave-codeblock-copy").dataset.copyState).toBe("copied");
    expect(getActiveCodeBlockState(editor).active).toBe(false);
    expect(editor.getHTML()).toBe(initialHtml);
  }, 15000);

  it("keeps Mermaid tabs persistent while showing right-side controls on hover", () => {
    const { editor, rerender } = renderControls(
      `<p>outside</p><pre><code class="language-mermaid">graph TD
  A --> B</code></pre>`,
      { selectText: "outside" },
    );
    const outsidePosition = textPosition(editor, "outside");

    expect(getActiveCodeBlockState(editor).active).toBe(false);
    expect(editor.state.selection.from).toBe(outsidePosition);
    expect(getByTestId("markweave-mermaid-tabs")).not.toBeNull();
    expect(queryByTestId("markweave-codeblock-controls")).toBeNull();

    const codeBlockElement = editor.view.dom.querySelector("pre");
    if (!codeBlockElement) {
      throw new Error("Expected Mermaid code block element.");
    }

    pointerMove(codeBlockElement);

    expect(getByTestId("markweave-mermaid-tabs")).not.toBeNull();
    expect(getByTestId("markweave-codeblock-controls")).not.toBeNull();

    click(getByTestId("markweave-mermaid-mode-code"));
    rerender("code");

    expect(getActiveCodeBlockState(editor).active).toBe(false);
    expect(editor.state.selection.from).toBe(outsidePosition);
    expect(editor.getHTML()).toContain('data-mermaid-preview-mode="code"');
  });

  it("opens the Markweave-style language menu, filters languages, and restores editor focus after selection", () => {
    const inputFocus = vi.spyOn(HTMLInputElement.prototype, "focus");
    const { editor } = renderControls('<pre><code class="language-java">public class HarnessAgent {}</code></pre>', {
      selectText: "HarnessAgent",
    });

    expect(getByTestId("markweave-codeblock-controls").dataset.positioned).toBe("true");

    click(getByTestId("markweave-codeblock-language"));
    expect(getByTestId("markweave-codeblock-language-menu").dataset.positioned).toBe("true");
    expect(inputFocus).toHaveBeenCalledWith({ preventScroll: true });

    inputValue(getByTestId<HTMLInputElement>("markweave-codeblock-language-search"), "properties");
    expect(getByTestId("markweave-codeblock-language-option-properties")).not.toBeNull();
    expect(queryByTestId("markweave-codeblock-language-option-java")).toBeNull();

    click(getByTestId("markweave-codeblock-language-option-properties"));

    expect(getActiveCodeBlockState(editor).language).toBe("properties");
    expect(queryByTestId("markweave-codeblock-language-menu")).toBeNull();
    expect(editor.view.hasFocus()).toBe(true);
  });

  it("navigates filtered languages with arrow keys, scrolls the highlight into view, and selects with Enter", () => {
    const scrollIntoView = vi.fn();
    const { editor } = renderControls('<pre><code class="language-ts">const value = 1;</code></pre>', { selectText: "value" });
    mockPrototypeMethod(HTMLElement.prototype, "scrollIntoView", scrollIntoView);

    click(getByTestId("markweave-codeblock-language"));
    expect(getByTestId("markweave-codeblock-language-option-ts").dataset.highlighted).toBe("true");

    const search = getByTestId<HTMLInputElement>("markweave-codeblock-language-search");
    inputValue(search, "p");
    expect(getByTestId("markweave-codeblock-language-option-apache").dataset.highlighted).toBe("true");

    keyDown(search, "ArrowDown");
    expect(getByTestId("markweave-codeblock-language-option-csharp").dataset.highlighted).toBe("true");
    expect(getByTestId("markweave-codeblock-language-menu").querySelector<HTMLElement>(".markweave-codeblock-language-list")?.scrollTop).toBe(26);
    expect(scrollIntoView).not.toHaveBeenCalled();

    keyDown(search, "ArrowUp");
    expect(getByTestId("markweave-codeblock-language-option-apache").dataset.highlighted).toBe("true");
    expect(search.getAttribute("aria-activedescendant")).toBe(getByTestId("markweave-codeblock-language-option-apache").id);

    keyDown(search, "ArrowDown");

    keyDown(search, "Enter");
    expect(getActiveCodeBlockState(editor).language).toBe("csharp");
    expect(queryByTestId("markweave-codeblock-language-menu")).toBeNull();
    expect(editor.view.hasFocus()).toBe(true);
  });

  it("changes a hovered code block language without moving the editor selection", () => {
    const { editor } = renderControls('<p>outside</p><pre><code class="language-ts">const value = 1;</code></pre>', {
      selectText: "outside",
    });
    const outsidePosition = textPosition(editor, "outside");
    const codeBlockElement = editor.view.dom.querySelector("pre");

    if (!codeBlockElement) {
      throw new Error("Expected code block element.");
    }

    pointerMove(codeBlockElement);
    click(getByTestId("markweave-codeblock-language"));
    click(getByTestId("markweave-codeblock-language-option-json"));

    expect(getActiveCodeBlockState(editor).active).toBe(false);
    expect(editor.state.selection.from).toBe(outsidePosition);
    expect(editor.getHTML()).toContain('class="language-json"');
    expect(getByTestId("markweave-codeblock-language").textContent).toContain("JSON");
  });

  it("closes the language menu on Escape and outside pointer down", () => {
    renderControls('<pre><code class="language-ts">const value = 1;</code></pre>', { selectText: "value" });

    click(getByTestId("markweave-codeblock-language"));
    expect(queryByTestId("markweave-codeblock-language-menu")).not.toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(queryByTestId("markweave-codeblock-language-menu")).toBeNull();

    click(getByTestId("markweave-codeblock-language"));
    expect(queryByTestId("markweave-codeblock-language-menu")).not.toBeNull();
    act(() => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    expect(queryByTestId("markweave-codeblock-language-menu")).toBeNull();
  });

  it("copies the raw code text and shows the copy tooltip without mutating the document", async () => {
    const writeText = vi.fn<Clipboard["writeText"]>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { editor } = renderControls('<pre><code class="language-ts">const value = 1;</code></pre>', { selectText: "value" });
    const initialHtml = editor.getHTML();
    const copyButton = getByTestId("markweave-codeblock-copy");

    hover(copyButton);
    expect(getByTestId("markweave-codeblock-copy-tooltip").textContent).toBe("Copy to clipboard");

    await act(async () => {
      copyButton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      copyButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(writeText).toHaveBeenCalledWith("const value = 1;");
    expect(copyButton.dataset.copyState).toBe("copied");
    expect(queryByTestId("markweave-codeblock-copy-feedback")).toBeNull();
    expect(editor.getHTML()).toBe(initialHtml);
  });

  it("collapses and expands the active code block from the overlay without changing document HTML", () => {
    const { editor, rerender } = renderControls('<pre><code class="language-ts">const value = 1;</code></pre>', { selectText: "value" });
    const initialHtml = editor.getHTML();

    click(getByTestId("markweave-codeblock-collapse"));
    const collapsedCodeBlock = editor.view.dom.querySelector<HTMLElement>("pre");
    expect(collapsedCodeBlock?.getAttribute("data-markweave-collapsed")).toBe("true");
    expect(collapsedCodeBlock?.getAttribute("data-markweave-collapsed-language")).toBe("TypeScript");
    expect(collapsedCodeBlock?.getAttribute("data-markweave-collapsed-lines")).toBe("1 line");
    expect(queryByTestId("markweave-codeblock-controls")).toBeNull();
    expect(editor.getHTML()).toBe(initialHtml);

    if (!collapsedCodeBlock) {
      throw new Error("Expected collapsed code block.");
    }

    act(() => {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 24, clientY: 24 });
      Object.defineProperty(event, "target", { value: collapsedCodeBlock });
      editor.view.someProp("handleClick", (handler) => handler(editor.view, 1, event) === true);
    });
    rerender();

    expect(editor.view.dom.querySelector("pre")?.hasAttribute("data-markweave-collapsed")).toBe(false);
    expect(queryByTestId("markweave-codeblock-controls")).not.toBeNull();
    expect(editor.getHTML()).toBe(initialHtml);
  });

  it("restores Mermaid controls when collapse state changes without a selection update", () => {
    const { editor } = renderControls(
      `<pre><code class="language-mermaid">graph TD
  A --> B
  B --> C</code></pre>`,
      { selectText: "A --> B" },
    );
    const initialHtml = editor.getHTML();

    expect(getByTestId("markweave-mermaid-tabs")).not.toBeNull();
    expect(getByTestId("markweave-codeblock-controls")).not.toBeNull();

    click(getByTestId("markweave-codeblock-collapse"));

    expect(editor.view.dom.querySelector("pre")?.getAttribute("data-markweave-collapsed")).toBe("true");
    expect(queryByTestId("markweave-mermaid-tabs")).toBeNull();
    expect(queryByTestId("markweave-codeblock-controls")).toBeNull();

    act(() => {
      expect(setActiveCodeBlockCollapsed(editor, false)).toBe(true);
    });

    expect(editor.view.dom.querySelector("pre")?.hasAttribute("data-markweave-collapsed")).toBe(false);
    expect(getByTestId("markweave-mermaid-tabs")).not.toBeNull();
    expect(getByTestId("markweave-codeblock-controls")).not.toBeNull();
    expect(editor.getHTML()).toBe(initialHtml);
  });

  it("keeps Mermaid source durable while switching tabs and exposing preview actions", async () => {
    const { editor, rerender } = renderControls(
      `<pre><code class="language-mermaid">flowchart TB
  A --> B</code></pre>`,
      { selectText: "A --> B" },
    );
    expect(setActiveCodeBlockMermaidPreviewMode(editor, "preview")).toBe(true);
    rerender("preview");

    const inlinePreview = getByTestId("markweave-mermaid-inline-preview");
    inlinePreview.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text>diagram</text></svg>';
    inlinePreview.dataset.state = "rendered";
    const initialHtml = editor.getHTML();

    expect(getByTestId("markweave-mermaid-preview-actions")).not.toBeNull();

    click(getByTestId("markweave-mermaid-fullscreen"));
    expect(getByTestId("markweave-mermaid-fullscreen-layer").innerHTML).toContain("<svg");
    expect(getByTestId("markweave-mermaid-fullscreen-layer").innerHTML).toContain("diagram");
    expect(getByTestId("markweave-mermaid-fullscreen-toolbar")).not.toBeNull();
    expect(getByTestId("markweave-mermaid-fullscreen-zoom-label").textContent).toBe("100%");
    expect(getByTestId("markweave-mermaid-fullscreen-close").textContent).toBe("");

    hover(getByTestId("markweave-mermaid-fullscreen-zoom-in"));
    expect(getByTestId("markweave-mermaid-fullscreen-tooltip").textContent).toBe("Zoom in");

    click(getByTestId("markweave-mermaid-fullscreen-zoom-in"));
    expect(getByTestId("markweave-mermaid-fullscreen-zoom-label").textContent).toBe("125%");
    expect(getByTestId("markweave-mermaid-fullscreen-content").dataset.scalePercent).toBe("125");

    wheel(getByTestId("markweave-mermaid-fullscreen-viewport"), 80);
    expect(getByTestId("markweave-mermaid-fullscreen-zoom-label").textContent).toBe("100%");

    drag(getByTestId("markweave-mermaid-fullscreen-viewport"), { x: 120, y: 140 }, { x: 150, y: 165 });
    expect(getByTestId("markweave-mermaid-fullscreen-content").dataset.translate).toBe("30,25");

    click(getByTestId("markweave-mermaid-fullscreen-reset"));
    expect(getByTestId("markweave-mermaid-fullscreen-zoom-label").textContent).toBe("100%");
    expect(getByTestId("markweave-mermaid-fullscreen-content").dataset.translate).toBe("0,0");

    click(getByTestId("markweave-mermaid-fullscreen-close"));
    expect(queryByTestId("markweave-mermaid-fullscreen-layer")).toBeNull();
    expect(editor.getHTML()).toBe(initialHtml);

    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: showSaveFilePicker });

    click(getByTestId("markweave-mermaid-download"));
    await flushAsyncSave();

    expect(showSaveFilePicker).toHaveBeenCalledWith({ suggestedName: "markweave-mermaid.svg", startIn: "downloads" });
    expect(write).toHaveBeenCalledWith(expect.any(Blob));
    expect(close).toHaveBeenCalledTimes(1);
    expect(anchorClick).not.toHaveBeenCalled();

    click(getByTestId("markweave-mermaid-mode-code"));

    expect(getActiveCodeBlockState(editor)).toMatchObject({
      language: "mermaid",
      mermaidPreviewMode: "code",
      text: "flowchart TB\n  A --> B",
    });
    expect(editor.getHTML()).not.toContain("<svg");
    expect(editor.getHTML()).toContain('data-mermaid-preview-mode="code"');
    expect(editor.getText()).toContain("flowchart TB\n  A --> B");
  });

  it("defaults read-only Mermaid blocks to preview while preserving source inspection", async () => {
    const writeText = vi.fn<Clipboard["writeText"]>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { editor, rerender } = renderControls(
      `<p>outside</p><pre><code class="language-mermaid">flowchart TB
  A --> B</code></pre>`,
      { readOnly: true, selectText: "A --> B" },
    );
    rerender("preview");
    const initialHtml = editor.getHTML();

    let inlinePreview = getByTestId("markweave-mermaid-inline-preview");
    expect(getByTestId("markweave-mermaid-mode-preview").dataset.active).toBe("true");
    expect(getByTestId("markweave-mermaid-mode-code").dataset.active).toBe("false");
    expect(initialHtml).not.toContain('data-mermaid-preview-mode="preview"');

    click(getByTestId("markweave-mermaid-mode-code"));
    expect(queryByTestId("markweave-mermaid-inline-preview")).toBeNull();
    expect(getByTestId("markweave-mermaid-mode-code").dataset.active).toBe("true");
    expect(getByTestId("markweave-mermaid-mode-preview").dataset.active).toBe("false");
    expect(editor.getHTML()).toBe(initialHtml);

    click(getByTestId("markweave-mermaid-mode-preview"));
    inlinePreview = getByTestId("markweave-mermaid-inline-preview");
    inlinePreview.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text>diagram</text></svg>';
    inlinePreview.dataset.state = "rendered";

    pointerMove(inlinePreview);

    expect(getByTestId("markweave-codeblock-controls").dataset.readOnly).toBe("true");
    expect(getByTestId("markweave-codeblock-language").textContent).toContain("Mermaid");
    expect(getByTestId("markweave-mermaid-preview-actions")).not.toBeNull();
    expect(getByTestId("markweave-codeblock-copy")).not.toBeNull();
    expect(getByTestId("markweave-mermaid-fullscreen")).not.toBeNull();
    expect(getByTestId("markweave-mermaid-download")).not.toBeNull();
    expect(getByTestId("markweave-mermaid-tabs")).not.toBeNull();
    expect(queryByTestId("markweave-codeblock-collapse")).toBeNull();

    click(getByTestId("markweave-mermaid-fullscreen"));
    expect(getByTestId("markweave-mermaid-fullscreen-layer").innerHTML).toContain("<svg");

    click(getByTestId("markweave-mermaid-fullscreen-close"));
    expect(queryByTestId("markweave-mermaid-fullscreen-layer")).toBeNull();

    const createObjectUrl = vi.fn(() => "blob:markweave-mermaid");
    const revokeObjectUrl = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });

    click(getByTestId("markweave-mermaid-download"));

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:markweave-mermaid");

    await act(async () => {
      const copyButton = getByTestId("markweave-codeblock-copy");
      copyButton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      copyButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(writeText).toHaveBeenCalledWith("flowchart TB\n  A --> B");
    expect(editor.getHTML()).toBe(initialHtml);
  });
});
