// @vitest-environment jsdom

import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkweaveEditor, type MarkweaveEditorMode, type MarkweaveEditorRuntimeSnapshot, type TableCommandResult } from "@markweave/vue3";

let activeApp: App<Element> | null = null;
let activeContainer: HTMLDivElement | null = null;

const tableFixture = `
<table>
  <tbody>
    <tr>
      <th><p>Module</p></th>
      <th><p>Interaction target</p></th>
      <th><p>Status</p></th>
    </tr>
    <tr>
      <td><p>Selection</p></td>
      <td><p>Toolbar and cursor state</p></td>
      <td><p>Modeled</p></td>
    </tr>
    <tr>
      <td><p>Table</p></td>
      <td><p>Navigation, paste, merge, split</p></td>
      <td><p>Modeled</p></td>
    </tr>
  </tbody>
</table>
`;

const codeBlockFixture = '<p>outside</p><pre><code class="language-ts">const value = 1;</code></pre>';
const mermaidFixture = `<p>outside</p><pre><code class="language-mermaid">flowchart TB
  A --> B</code></pre>`;

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

function installLayoutMocks() {
  const rects = Object.assign([createRect(0, 0, 80, 32)], { item: (index: number) => rects[index] ?? null }) as unknown as DOMRectList;

  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => document.body,
  });
  mockPrototypeMethod(Range.prototype, "getClientRects", () => rects);
  mockPrototypeMethod(Range.prototype, "getBoundingClientRect", () => rects[0] as DOMRect);
  mockPrototypeMethod(HTMLElement.prototype, "getClientRects", () => rects);
  vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect(this: HTMLElement) {
    if (this.classList.contains("markweave-editor-frame")) {
      return createRect(0, 0, 1000, 700);
    }

    if (this.classList.contains("markweave-editor-surface")) {
      return createRect(0, 0, 800, 500);
    }

    if (this.classList.contains("markweave-image-box")) {
      return createRect(0, 0, 400, 240);
    }

    if (this.classList.contains("markweave-codeblock-overlay")) {
      return createRect(0, 0, 1000, 700);
    }

    if (this.classList.contains("tiptap-mathematics-render")) {
      return this.dataset.type === "block-math" ? createRect(180, 220, 360, 64) : createRect(180, 120, 120, 28);
    }

    if (this.dataset.testid === "markweave-codeblock-language") {
      return createRect(820, 130, 120, 28);
    }

    if (this.dataset.testid === "markweave-mermaid-inline-preview") {
      return createRect(120, 180, 720, 260);
    }

    if (this.classList.contains("markweave-table-menu")) {
      return createRect(0, 0, 240, 320);
    }

    if (this.tagName === "TABLE") {
      return createRect(120, 120, 720, 160);
    }

    if (this.tagName === "TH" || this.tagName === "TD") {
      return createRect(120, 120, 240, 48);
    }

    if (this.tagName === "PRE") {
      return createRect(120, 120, 720, 160);
    }

    return createRect(0, 0, 80, 32);
  });
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
}

async function flushVue() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

async function mountVue(component: unknown) {
  activeContainer = document.createElement("div");
  document.body.appendChild(activeContainer);
  activeApp = createApp(component as never);
  activeApp.mount(activeContainer);
  await flushVue();
  return activeContainer;
}

afterEach(() => {
  activeApp?.unmount();
  activeApp = null;
  activeContainer = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function click(element: Element) {
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  await flushVue();
}

async function keyDown(element: Element, key: string) {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  await flushVue();
}

async function pointerMove(element: Element) {
  element.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true }));
  await flushVue();
}

async function hover(element: Element) {
  element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false, cancelable: true }));
  await flushVue();
}

async function inputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  await flushVue();
}

async function pointerResize(element: Element, fromX: number, toX: number) {
  element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: fromX }));
  window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, cancelable: true, clientX: toX }));
  window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, clientX: toX }));
  await flushVue();
}

async function wheel(element: Element, deltaY: number) {
  element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY }));
  await flushVue();
}

async function drag(element: Element, from: { readonly x: number; readonly y: number }, to: { readonly x: number; readonly y: number }) {
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: from.x, clientY: from.y }));
  element.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, buttons: 1, clientX: to.x, clientY: to.y }));
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, clientX: to.x, clientY: to.y }));
  await flushVue();
}

function queryByTestId<T extends HTMLElement = HTMLElement>(container: HTMLElement, testId: string) {
  return container.querySelector<T>(`[data-testid="${testId}"]`);
}

function getByTestId<T extends HTMLElement = HTMLElement>(container: HTMLElement, testId: string) {
  const element = container.querySelector<T>(`[data-testid="${testId}"]`);

  if (!element) {
    throw new Error(`Expected test id "${testId}".`);
  }

  return element;
}

describe("Markweave Vue3 editor", () => {
  it("renders Markdown content and exposes runtime state", async () => {
    const snapshots: MarkweaveEditorRuntimeSnapshot[] = [];
    const container = await mountVue(
      defineComponent({
        setup() {
          return () =>
            h(MarkweaveEditor, {
              defaultContent: "# Title\n\n## Section\n\nA **bold** paragraph.",
              onRuntimeStateChange: (snapshot: MarkweaveEditorRuntimeSnapshot) => snapshots.push(snapshot),
            });
        },
      }),
    );

    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector('[data-testid="markweave-inner-toc"]')).toBeTruthy();
    expect(container.querySelector(".markweave-inner-toc-item")?.textContent).toBe("Section");
    expect(snapshots.at(-1)?.mode).toBe("live");
  });

  it("switches between Live and View modes", async () => {
    const mode = ref<MarkweaveEditorMode>("live");
    const container = await mountVue(
      defineComponent({
        setup() {
          return () => h(MarkweaveEditor, { defaultContent: "[safe](https://example.com)", mode: mode.value });
        },
      }),
    );

    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("data-markweave-mode")).toBe("live");
    mode.value = "view";
    await flushVue();
    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("data-markweave-mode")).toBe("view");
  });

  it("opens Vue math formulas in Live mode and keeps them read-only in View mode", async () => {
    installLayoutMocks();
    const mode = ref<MarkweaveEditorMode>("live");
    const container = await mountVue(
      defineComponent({
        setup() {
          return () =>
            h(MarkweaveEditor, {
              defaultContent: '<p>Formula <span data-type="inline-math" data-latex="a^2"></span></p><div data-type="block-math" data-latex="x"></div>',
              defaultContentFormat: "html",
              mode: mode.value,
            });
        },
      }),
    );

    const inlineMath = container.querySelector('.tiptap-mathematics-render[data-type="inline-math"]');
    expect(inlineMath).toBeTruthy();
    await click(inlineMath as Element);

    expect(getByTestId(container, "markweave-math-editor-popover").getAttribute("data-kind")).toBe("inline");
    expect(inlineMath?.getAttribute("data-markweave-math-editing")).toBe("true");
    expect(getByTestId(container, "markweave-math-inline-source").textContent).toContain("$");
    const inlineInput = getByTestId<HTMLInputElement>(container, "markweave-math-editor-input");
    await inputValue(inlineInput, "b^2");
    await keyDown(inlineInput, "Enter");
    expect(container.querySelector("[data-markweave-math-editing]")).toBeNull();
    expect(container.innerHTML).toContain('data-latex="b^2"');

    const blockMath = container.querySelector('.tiptap-mathematics-render[data-type="block-math"]');
    expect(blockMath).toBeTruthy();
    await click(blockMath as Element);
    const blockPopover = getByTestId(container, "markweave-math-editor-popover");
    expect(blockPopover.getAttribute("data-kind")).toBe("block");
    expect(blockPopover.parentElement).not.toBe(blockMath);
    expect(blockMath?.contains(blockPopover)).toBe(false);
    expect(blockMath?.getAttribute("data-markweave-math-editing")).toBe("true");
    expect(getByTestId(container, "markweave-math-block-source").textContent).toContain("$$");
    expect(getByTestId(container, "markweave-math-editor-input").tagName).toBe("TEXTAREA");

    await keyDown(getByTestId(container, "markweave-math-editor-input"), "Escape");
    expect(container.querySelector("[data-markweave-math-editing]")).toBeNull();
    mode.value = "view";
    await flushVue();
    await click(container.querySelector('.tiptap-mathematics-render[data-type="inline-math"]') as Element);
    expect(queryByTestId(container, "markweave-math-editor-popover")).toBeNull();
  });

  it("renders image and video placeholders through Vue NodeViews and keeps attachment public", async () => {
    const container = await mountVue(
      defineComponent({
        setup() {
          return () =>
            h(MarkweaveEditor, {
              defaultContentFormat: "json",
              defaultContent: {
                type: "doc",
                content: [
                  { type: "image", attrs: { src: null, align: "center", caption: null } },
                  { type: "markweaveVideo", attrs: { src: null } },
                  { type: "markweaveAttachment", attrs: { src: "markweave://sample/spec.pdf", name: "spec.pdf", mimeType: "application/pdf", size: 1280 } },
                ],
              },
            });
        },
      }),
    );

    expect(container.querySelector('[data-testid="markweave-image-node"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="markweave-video-node"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="markweave-image-upload-placeholder"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="markweave-video-upload-placeholder"]')).toBeTruthy();
    expect(container.querySelector(".markweave-media-placeholder")).toBeNull();
    expect(container.querySelector(".markweave-video-delete")).toBeNull();

    const attachment = container.querySelector<HTMLAnchorElement>('a.markweave-attachment[data-markweave-attachment="true"]');
    expect(attachment?.textContent).toBe("spec.pdf");
    expect(attachment?.getAttribute("href")).toBe("markweave://sample/spec.pdf");
  });

  it("aligns Vue image toolbar, caption, resize handles, and upload DOM with React", async () => {
    installLayoutMocks();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const container = await mountVue(
      defineComponent({
        setup() {
          return () =>
            h(MarkweaveEditor, {
              defaultContent:
                '<figure data-markweave-image="true" data-markweave-image-align="center"><img src="https://example.com/vue-image.png" alt="Vue"><figcaption>Vue caption</figcaption></figure>',
              defaultContentFormat: "html",
            });
        },
      }),
    );

    const imageNode = getByTestId(container, "markweave-image-node");
    expect(imageNode.getAttribute("data-align")).toBe("center");
    expect(getByTestId(container, "markweave-image-toolbar")).toBeTruthy();
    expect(getByTestId(container, "markweave-image-align-right").querySelector(".markweave-image-tooltip")?.textContent).toBe("图片右对齐");
    expect(container.querySelector(".markweave-image-box img.markweave-image")?.getAttribute("src")).toBe("https://example.com/vue-image.png");
    expect(getByTestId(container, "markweave-image-resize-left").getAttribute("data-side")).toBe("left");
    expect(getByTestId(container, "markweave-image-resize-right").getAttribute("data-side")).toBe("right");

    const captionInput = getByTestId<HTMLInputElement>(container, "markweave-image-caption-input");
    expect(captionInput.value).toBe("Vue caption");
    await inputValue(captionInput, "Updated Vue caption");
    expect(container.querySelector("figcaption")).toBeNull();

    await click(getByTestId(container, "markweave-image-align-right"));
    expect(getByTestId(container, "markweave-image-node").getAttribute("data-align")).toBe("right");

    await pointerResize(getByTestId(container, "markweave-image-resize-right"), 400, 500);
    expect((container.querySelector(".markweave-image-box") as HTMLElement | null)?.style.width).toBe("500px");

    await click(getByTestId(container, "markweave-image-download"));
    expect(anchorClick).toHaveBeenCalledTimes(1);
  });

  it("aligns Vue video selection layer and selected-only delete behavior with React", async () => {
    const container = await mountVue(
      defineComponent({
        setup() {
          return () =>
            h(MarkweaveEditor, {
              defaultContent:
                '<p>before</p><iframe class="markweave-video-iframe" src="https://www.youtube.com/embed/fPiUC5NxFic?si=GifL60l94AOaMV93" data-markweave-video-embed="true" data-markweave-video-provider="youtube" data-markweave-video-src="https://www.youtube.com/embed/fPiUC5NxFic?si=GifL60l94AOaMV93"></iframe><p>after</p>',
              defaultContentFormat: "html",
            });
        },
      }),
    );

    const videoNode = getByTestId(container, "markweave-video-node");
    expect(container.querySelector(".markweave-video-delete")).toBeNull();
    expect(container.querySelector(".markweave-video-embed iframe.markweave-video-iframe")?.getAttribute("src")).toBe(
      "https://www.youtube.com/embed/fPiUC5NxFic?si=GifL60l94AOaMV93",
    );

    await keyDown(videoNode, "Delete");
    expect(container.querySelector("iframe.markweave-video-iframe")).toBeTruthy();

    await click(getByTestId(container, "markweave-video-selection-layer"));
    expect(getByTestId(container, "markweave-video-node").getAttribute("data-selected")).toBe("true");

    await keyDown(getByTestId(container, "markweave-video-node"), "Delete");
    expect(container.querySelector("iframe.markweave-video-iframe")).toBeNull();
  });

  it("hides Vue image and video edit controls when switching to View mode", async () => {
    const mode = ref<MarkweaveEditorMode>("live");
    const container = await mountVue(
      defineComponent({
        setup() {
          return () =>
            h(MarkweaveEditor, {
              defaultContent:
                '<figure data-markweave-image="true"><img src="https://example.com/view.png" alt="View"><figcaption>Read-only caption</figcaption></figure><iframe class="markweave-video-iframe" src="https://www.youtube.com/embed/fPiUC5NxFic" data-markweave-video-embed="true" data-markweave-video-provider="youtube" data-markweave-video-src="https://www.youtube.com/embed/fPiUC5NxFic"></iframe>',
              defaultContentFormat: "html",
              mode: mode.value,
            });
        },
      }),
    );

    expect(getByTestId(container, "markweave-image-toolbar")).toBeTruthy();
    expect(getByTestId(container, "markweave-image-caption-input")).toBeTruthy();
    expect(getByTestId(container, "markweave-video-selection-layer")).toBeTruthy();

    mode.value = "view";
    await flushVue();

    expect(container.querySelector('[data-testid="markweave-image-toolbar"]')).toBeNull();
    expect(container.querySelector('[data-testid="markweave-image-resize-left"]')).toBeNull();
    expect(container.querySelector('[data-testid="markweave-image-caption-input"]')).toBeNull();
    expect(getByTestId(container, "markweave-image-caption").textContent).toBe("Read-only caption");
    expect(container.querySelector('[data-testid="markweave-video-selection-layer"]')).toBeNull();
    expect(getByTestId(container, "markweave-video-node").getAttribute("data-selected")).toBe("false");
  });

  it("renders positioned table handles and row menu like the React adapter", async () => {
    installLayoutMocks();
    const editWithAi = vi.fn();
    const container = await mountVue(
      defineComponent({
        setup() {
          return () =>
            h(MarkweaveEditor, {
              defaultContent: tableFixture,
              defaultContentFormat: "html",
              autoFocusFirstTableBodyCell: true,
              onEditWithAi: editWithAi,
            });
        },
      }),
    );

    const controls = getByTestId(container, "markweave-table-controls");
    expect(controls.getAttribute("data-positioned")).toBe("true");
    const rowHandle = getByTestId<HTMLButtonElement>(container, "markweave-table-hover-row-handle");
    expect(rowHandle.getAttribute("aria-label")).toBe("当前行操作");
    expect(rowHandle.getAttribute("data-axis-index")).not.toBe("");

    await click(rowHandle);

    const menu = getByTestId(container, "markweave-table-menu");
    expect(menu.getAttribute("aria-label")).toBe("行操作");
    expect(menu.getAttribute("data-positioned")).toBe("true");
    expect(menu.textContent).toContain("使用 AI 编辑");
    expect(menu.textContent).toContain("插入上方行");
    expect(menu.textContent).toContain("复制表格");
    expect(menu.textContent).toContain("删除行");
    expect(getByTestId<HTMLButtonElement>(container, "markweave-table-menu-command-edit-with-ai").getAttribute("data-command-enabled")).toBe("true");
    expect(container.querySelector('[data-testid="markweave-floating-toolbar"]')).toBeNull();
  });

  it("keeps the Vue table AI menu item visible but disabled without a handler", async () => {
    installLayoutMocks();
    const container = await mountVue(
      defineComponent({
        setup() {
          return () =>
            h(MarkweaveEditor, {
              defaultContent: tableFixture,
              defaultContentFormat: "html",
              autoFocusFirstTableBodyCell: true,
            });
        },
      }),
    );

    await click(getByTestId(container, "markweave-table-hover-row-handle"));

    const aiButton = getByTestId<HTMLButtonElement>(container, "markweave-table-menu-command-edit-with-ai");
    expect(aiButton.disabled).toBe(true);
    expect(aiButton.getAttribute("aria-disabled")).toBe("true");
    expect(aiButton.getAttribute("data-command-enabled")).toBe("false");
  });

  it("emits Vue table copy payloads, copy feedback, and command results", async () => {
    installLayoutMocks();
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const copyPayloads: unknown[] = [];
    const commandResults: TableCommandResult[] = [];
    const container = await mountVue(
      defineComponent({
        setup() {
          return () =>
            h(MarkweaveEditor, {
              defaultContent: tableFixture,
              defaultContentFormat: "html",
              autoFocusFirstTableBodyCell: true,
              onTableCopyPayload: (payload: unknown) => copyPayloads.push(payload),
              onTableCommandResult: (result: TableCommandResult) => commandResults.push(result),
            });
        },
      }),
    );

    await click(getByTestId(container, "markweave-table-hover-row-handle"));
    await click(getByTestId(container, "markweave-table-menu-command-copy-table"));

    expect(copyPayloads).toHaveLength(1);
    expect(commandResults.at(-1)).toMatchObject({ commandId: "copy-table", menu: "row", copyPayload: { kind: "table" } });
    const feedback = getByTestId(container, "markweave-table-copy-feedback");
    expect(feedback.getAttribute("data-copy-kind")).toBe("table");
    expect(feedback.textContent).toContain("表格已复制到剪贴板");
  });

  it("hides Vue table edit overlays in View mode", async () => {
    installLayoutMocks();
    const container = await mountVue(
      defineComponent({
        setup() {
          return () =>
            h(MarkweaveEditor, {
              defaultContent: tableFixture,
              defaultContentFormat: "html",
              mode: "view",
              autoFocusFirstTableBodyCell: true,
            });
        },
      }),
    );

    expect(container.querySelector('[data-testid="markweave-table-controls"]')).toBeNull();
    expect(container.querySelector('[data-testid="markweave-table-selection-overlay"]')).toBeNull();
  });

  it("aligns Vue code block language menu and copy controls with React", async () => {
    installLayoutMocks();
    const inputFocus = vi.spyOn(HTMLInputElement.prototype, "focus");
    const writeText = vi.fn<Clipboard["writeText"]>().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const container = await mountVue(
      defineComponent({
        setup() {
          return () => h(MarkweaveEditor, { defaultContent: codeBlockFixture, defaultContentFormat: "html" });
        },
      }),
    );

    const codeBlockElement = container.querySelector("pre");
    expect(codeBlockElement).toBeTruthy();
    await pointerMove(codeBlockElement as Element);

    expect(getByTestId(container, "markweave-codeblock-overlay").getAttribute("data-read-only")).toBe("false");
    expect(getByTestId(container, "markweave-codeblock-controls").getAttribute("data-positioned")).toBe("true");
    expect(getByTestId(container, "markweave-codeblock-language").textContent).toContain("TypeScript");

    await click(getByTestId(container, "markweave-codeblock-language"));
    expect(getByTestId(container, "markweave-codeblock-language-menu").getAttribute("data-positioned")).toBe("true");
    expect(inputFocus).toHaveBeenCalledWith({ preventScroll: true });
    await inputValue(getByTestId<HTMLInputElement>(container, "markweave-codeblock-language-search"), "json");
    expect(getByTestId(container, "markweave-codeblock-language-option-json")).toBeTruthy();
    expect(queryByTestId(container, "markweave-codeblock-language-option-java")).toBeNull();

    await click(getByTestId(container, "markweave-codeblock-language-option-json"));
    expect(queryByTestId(container, "markweave-codeblock-language-menu")).toBeNull();
    await pointerMove(container.querySelector("pre") as Element);
    expect(getByTestId(container, "markweave-codeblock-language").textContent).toContain("JSON");

    await click(getByTestId(container, "markweave-codeblock-copy"));
    await flushVue();
    expect(writeText).toHaveBeenCalledWith("const value = 1;");
    expect(getByTestId(container, "markweave-codeblock-copy").getAttribute("data-copy-state")).toBe("copied");
  });

  it("aligns Vue Mermaid tabs, preview actions, fullscreen, and download with React", async () => {
    installLayoutMocks();
    const createObjectUrl = vi.fn(() => "blob:markweave-mermaid");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const container = await mountVue(
      defineComponent({
        setup() {
          return () => h(MarkweaveEditor, { defaultContent: mermaidFixture, defaultContentFormat: "html" });
        },
      }),
    );

    expect(getByTestId(container, "markweave-mermaid-tabs").getAttribute("data-positioned")).toBe("true");
    expect(getByTestId(container, "markweave-mermaid-mode-code").getAttribute("data-active")).toBe("true");

    await click(getByTestId(container, "markweave-mermaid-mode-preview"));
    expect(getByTestId(container, "markweave-mermaid-mode-preview").getAttribute("data-active")).toBe("true");
    const inlinePreview = getByTestId(container, "markweave-mermaid-inline-preview");
    await pointerMove(inlinePreview);
    inlinePreview.innerHTML = '<svg viewBox="0 0 200 100"><text>diagram</text></svg>';
    expect(getByTestId(container, "markweave-mermaid-preview-actions")).toBeTruthy();

    await click(getByTestId(container, "markweave-mermaid-fullscreen"));
    expect(getByTestId(container, "markweave-mermaid-fullscreen-layer").innerHTML).toContain("<svg");
    expect(getByTestId(container, "markweave-mermaid-fullscreen-zoom-label").textContent).toBe("100%");
    await hover(getByTestId(container, "markweave-mermaid-fullscreen-zoom-in"));
    expect(getByTestId(container, "markweave-mermaid-fullscreen-tooltip").textContent).toBe("Zoom in");

    await click(getByTestId(container, "markweave-mermaid-fullscreen-zoom-in"));
    expect(getByTestId(container, "markweave-mermaid-fullscreen-zoom-label").textContent).toBe("125%");
    expect(getByTestId(container, "markweave-mermaid-fullscreen-content").getAttribute("data-scale-percent")).toBe("125");
    await wheel(getByTestId(container, "markweave-mermaid-fullscreen-viewport"), 80);
    expect(getByTestId(container, "markweave-mermaid-fullscreen-zoom-label").textContent).toBe("100%");
    await drag(getByTestId(container, "markweave-mermaid-fullscreen-viewport"), { x: 120, y: 140 }, { x: 150, y: 165 });
    expect(getByTestId(container, "markweave-mermaid-fullscreen-content").getAttribute("data-translate")).toBe("30,25");
    await click(getByTestId(container, "markweave-mermaid-fullscreen-reset"));
    expect(getByTestId(container, "markweave-mermaid-fullscreen-content").getAttribute("data-translate")).toBe("0,0");
    await click(getByTestId(container, "markweave-mermaid-fullscreen-close"));
    expect(queryByTestId(container, "markweave-mermaid-fullscreen-layer")).toBeNull();

    const inlinePreviewForDownload = getByTestId(container, "markweave-mermaid-inline-preview");
    inlinePreviewForDownload.innerHTML = '<svg viewBox="0 0 200 100"><text>diagram</text></svg>';
    await pointerMove(inlinePreviewForDownload);
    await click(getByTestId(container, "markweave-mermaid-download"));
    expect(anchorClick).toHaveBeenCalled();
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:markweave-mermaid");
  }, 15000);

  it("keeps Vue View mode code block controls read-only while preserving Mermaid reader actions", async () => {
    installLayoutMocks();
    const writeText = vi.fn<Clipboard["writeText"]>().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const updates = vi.fn();
    const container = await mountVue(
      defineComponent({
        setup() {
          return () => h(MarkweaveEditor, { defaultContent: mermaidFixture, defaultContentFormat: "html", mode: "view", onUpdate: updates });
        },
      }),
    );
    updates.mockClear();

    expect(getByTestId(container, "markweave-mermaid-mode-preview").getAttribute("data-active")).toBe("true");
    await click(getByTestId(container, "markweave-mermaid-mode-code"));
    expect(getByTestId(container, "markweave-mermaid-mode-code").getAttribute("data-active")).toBe("true");
    expect(updates).not.toHaveBeenCalled();
    await click(getByTestId(container, "markweave-mermaid-mode-preview"));

    const inlinePreview = getByTestId(container, "markweave-mermaid-inline-preview");
    inlinePreview.innerHTML = '<svg viewBox="0 0 200 100"><text>diagram</text></svg>';
    await pointerMove(inlinePreview);

    expect(getByTestId(container, "markweave-codeblock-overlay").getAttribute("data-read-only")).toBe("true");
    expect(getByTestId(container, "markweave-codeblock-controls").getAttribute("data-read-only")).toBe("true");
    expect(getByTestId(container, "markweave-codeblock-language").textContent).toContain("Mermaid");
    expect(queryByTestId(container, "markweave-codeblock-collapse")).toBeNull();
    expect(queryByTestId(container, "markweave-codeblock-language-menu")).toBeNull();
    expect(getByTestId(container, "markweave-mermaid-preview-actions")).toBeTruthy();

    await click(getByTestId(container, "markweave-codeblock-copy"));
    await flushVue();
    expect(writeText).toHaveBeenCalledWith("flowchart TB\n  A --> B");
    expect(getByTestId(container, "markweave-codeblock-copy").getAttribute("data-copy-state")).toBe("copied");
  });
});
