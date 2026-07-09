// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { getMarkweaveMessages, type MarkweaveMessages } from "../src/i18n";
import { getTableFocusState } from "../src/plugins/table/table-focus-state";
import { TableControls } from "../../markweave-react/src/ui/table/TableControls";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let activeEditor: Editor | null = null;
let activeRoot: Root | null = null;

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
      return createRect(0, 0, 1000, 600);
    }

    if (this.classList.contains("markweave-table-menu")) {
      return createRect(0, 0, 240, 320);
    }

    if (this.tagName === "TABLE") {
      return createRect(120, 120, 720, 120);
    }

    if (this.tagName === "TH" || this.tagName === "TD") {
      return createRect(120, 120, 240, 48);
    }

    return createRect(0, 0, 80, 32);
  });
}

function createEditor() {
  installLayoutMocks();
  const frame = document.createElement("section");
  frame.className = "markweave-editor-frame";
  const surface = document.createElement("div");
  surface.className = "markweave-editor-surface";
  frame.appendChild(surface);
  document.body.appendChild(frame);

  activeEditor = new Editor({
    element: surface,
    extensions: createMarkweaveEditorExtensions(),
    content: tableFixture,
  });

  const selectionTextPosition = textPosition(activeEditor, "Selection");
  expect(activeEditor.commands.setTextSelection(selectionTextPosition)).toBe(true);
  expect(getTableFocusState(activeEditor.state).active).toBe(true);

  return { editor: activeEditor, frame };
}

function textPosition(editor: Editor, text: string) {
  let position: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return true;
    }

    const offset = node.text.indexOf(text);
    if (offset < 0) {
      return true;
    }

    position = pos + offset + text.length;
    return false;
  });

  if (position === null) {
    throw new Error(`Expected text "${text}".`);
  }

  return position;
}

async function flushReact() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function renderTableControls(
  messages?: MarkweaveMessages,
  options: {
    readonly onCopyPayload?: Parameters<typeof TableControls>[0]["onCopyPayload"];
    readonly onCommandResult?: Parameters<typeof TableControls>[0]["onCommandResult"];
    readonly onEditWithAi?: Parameters<typeof TableControls>[0]["onEditWithAi"];
  } = {},
) {
  const { editor, frame } = createEditor();
  const host = document.createElement("div");
  frame.appendChild(host);
  activeRoot = createRoot(host);

  await act(async () => {
    activeRoot?.render(createElement(TableControls, { active: true, editor, messages, onCopyPayload: options.onCopyPayload, onCommandResult: options.onCommandResult, onEditWithAi: options.onEditWithAi }));
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

afterEach(async () => {
  await act(async () => {
    activeRoot?.unmount();
  });
  activeRoot = null;
  activeEditor?.destroy();
  activeEditor = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("table controls DOM i18n", () => {
  it("renders the row handle menu in Chinese by default", async () => {
    await renderTableControls();

    const rowHandle = getByTestId<HTMLButtonElement>("markweave-table-hover-row-handle");
    expect(rowHandle.getAttribute("aria-label")).toBe("当前行操作");
    expect(rowHandle.title).toBe("行操作");
    expect(getByTestId("markweave-table-controls").getAttribute("data-positioned")).toBe("true");

    await click(rowHandle);

    const menu = getByTestId("markweave-table-menu");
    expect(menu.getAttribute("aria-label")).toBe("行操作");
    expect(menu.getAttribute("data-positioned")).toBe("true");
    expect(menu.textContent).toContain("使用 AI 编辑");
    expect(menu.textContent).toContain("插入上方行");
    expect(menu.textContent).toContain("复制表格");
    expect(menu.textContent).toContain("删除行");
    expect(getByTestId<HTMLButtonElement>("markweave-table-menu-command-edit-with-ai").getAttribute("data-command-enabled")).toBe("false");
  });

  it("renders the row handle menu in English when English messages are provided", async () => {
    await renderTableControls(getMarkweaveMessages("en"));

    const rowHandle = getByTestId<HTMLButtonElement>("markweave-table-hover-row-handle");
    expect(rowHandle.getAttribute("aria-label")).toBe("Active row actions");
    expect(rowHandle.title).toBe("Row actions");

    await click(rowHandle);

    const menu = getByTestId("markweave-table-menu");
    expect(menu.getAttribute("aria-label")).toBe("Row actions");
    expect(menu.textContent).toContain("Edit with AI");
    expect(menu.textContent).toContain("Insert Row Above");
    expect(menu.textContent).toContain("Copy Table");
    expect(menu.textContent).toContain("Delete Row");
  });

  it("enables the React AI menu item only when a handler is provided", async () => {
    await renderTableControls(undefined, { onEditWithAi: vi.fn() });
    await click(getByTestId("markweave-table-hover-row-handle"));

    const aiButton = getByTestId<HTMLButtonElement>("markweave-table-menu-command-edit-with-ai");
    expect(aiButton.disabled).toBe(false);
    expect(aiButton.getAttribute("data-command-enabled")).toBe("true");
  });

  it("emits React table copy payloads, copy feedback, and command results", async () => {
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const copyPayload = vi.fn();
    const commandResult = vi.fn();
    await renderTableControls(undefined, { onCopyPayload: copyPayload, onCommandResult: commandResult });

    await click(getByTestId("markweave-table-hover-row-handle"));
    await click(getByTestId("markweave-table-menu-command-copy-table"));

    expect(copyPayload).toHaveBeenCalledTimes(1);
    expect(commandResult).toHaveBeenCalledWith(expect.objectContaining({ commandId: "copy-table", menu: "row", copyPayload: expect.objectContaining({ kind: "table" }) }));
    const feedback = getByTestId("markweave-table-copy-feedback");
    expect(feedback.getAttribute("data-copy-kind")).toBe("table");
    expect(feedback.textContent).toContain("表格已复制到剪贴板");
  });
});
