// @vitest-environment jsdom

import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkweaveEditor, type MarkweaveEditorMode, type MarkweaveEditorRuntimeSnapshot, type TableCommandResult } from "../src/vue3";

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
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect(this: HTMLElement) {
    if (this.classList.contains("markweave-editor-frame")) {
      return createRect(0, 0, 1000, 700);
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

    return createRect(0, 0, 80, 32);
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

  it("renders image and video placeholders through Vue NodeViews", async () => {
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
                ],
              },
            });
        },
      }),
    );

    expect(container.querySelector('[data-testid="markweave-image-node"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="markweave-video-node"]')).toBeTruthy();
    expect(container.querySelectorAll(".markweave-media-placeholder")).toHaveLength(2);
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
});
