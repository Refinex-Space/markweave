// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { getMarkweaveMessages, type MarkweaveMessages } from "../src/i18n";
import { getTableFocusState } from "../src/plugins/table/table-focus-state";
import { initialTableInteractionState, type TableInteractionState } from "../src/plugins/table/table-interaction-layer";
import { TableControls } from "../../markweave-react/src/ui/table/TableControls";
import { getTableAxisDropIndexAtPoint } from "../src/plugins/table/table-ui-model";

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
    readonly interactionState?: (editor: Editor) => TableInteractionState;
  } = {},
) {
  const { editor, frame } = createEditor();
  const host = document.createElement("div");
  frame.appendChild(host);
  activeRoot = createRoot(host);

  await act(async () => {
    activeRoot?.render(createElement(TableControls, { active: true, editor, interactionState: options.interactionState?.(editor), messages, onCopyPayload: options.onCopyPayload, onCommandResult: options.onCommandResult, onEditWithAi: options.onEditWithAi }));
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
    expect(menu.textContent).not.toContain("使用 AI 编辑");
    expect(menu.textContent).toContain("插入上方行");
    expect(menu.textContent).toContain("行排序 A-Z");
    expect(menu.textContent).toContain("颜色");
    expect(menu.textContent).toContain("复制行");
    expect(menu.textContent).toContain("删除行");
    expect(document.querySelector('[data-testid="markweave-table-menu-command-edit-with-ai"]')).toBeNull();
  });

  it("renders the row handle menu in English when English messages are provided", async () => {
    await renderTableControls(getMarkweaveMessages("en"));

    const rowHandle = getByTestId<HTMLButtonElement>("markweave-table-hover-row-handle");
    expect(rowHandle.getAttribute("aria-label")).toBe("Active row actions");
    expect(rowHandle.title).toBe("Row actions");

    await click(rowHandle);

    const menu = getByTestId("markweave-table-menu");
    expect(menu.getAttribute("aria-label")).toBe("Row actions");
    expect(menu.textContent).not.toContain("Edit with AI");
    expect(menu.textContent).toContain("Insert row above");
    expect(menu.textContent).toContain("Sort row A-Z");
    expect(menu.textContent).toContain("Duplicate row");
    expect(menu.textContent).toContain("Delete row");
  });

  it("keeps the React AI menu item hidden even when a handler is provided", async () => {
    await renderTableControls(undefined, { onEditWithAi: vi.fn() });
    await click(getByTestId("markweave-table-hover-row-handle"));

    expect(document.querySelector('[data-testid="markweave-table-menu-command-edit-with-ai"]')).toBeNull();
  });

  it("emits React table copy payloads, copy feedback, and command results", async () => {
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const copyPayload = vi.fn();
    const commandResult = vi.fn();
    await renderTableControls(undefined, { onCopyPayload: copyPayload, onCommandResult: commandResult });

    await click(getByTestId("markweave-table-cell-handle"));
    await click(getByTestId("markweave-table-menu-command-copy-table"));

    expect(copyPayload).toHaveBeenCalledTimes(1);
    expect(commandResult).toHaveBeenCalledWith(expect.objectContaining({ commandId: "copy-table", menu: "selection", copyPayload: expect.objectContaining({ kind: "table" }) }));
    const feedback = getByTestId("markweave-table-copy-feedback");
    expect(feedback.getAttribute("data-copy-kind")).toBe("table");
    expect(feedback.textContent).toContain("表格已复制到剪贴板");
  });

  it("opens localized color and alignment submenus and applies formatting", async () => {
    const editor = await renderTableControls();
    await click(getByTestId("markweave-table-hover-column-handle"));
    await click(getByTestId("markweave-table-menu-submenu-color"));

    const colorMenu = getByTestId("markweave-table-color-menu");
    expect(colorMenu.textContent).toContain("文字颜色");
    expect(colorMenu.textContent).toContain("黄色背景");
    const defaultTextColor = getByTestId("markweave-table-text-color-default");
    const grayTextColor = getByTestId("markweave-table-text-color-gray");
    const defaultTextSwatch = defaultTextColor.querySelector<HTMLElement>(".markweave-table-text-color-swatch");
    const grayTextSwatch = grayTextColor.querySelector<HTMLElement>(".markweave-table-text-color-swatch");

    expect(defaultTextColor.querySelector("svg")).toBeNull();
    expect(defaultTextSwatch?.style.backgroundColor).toBe("var(--markweave-text)");
    expect(grayTextColor.querySelector("svg")).toBeNull();
    expect(grayTextSwatch?.style.backgroundColor).toBe("rgb(120, 118, 115)");
    await click(getByTestId("markweave-table-background-color-yellow"));

    const selectedCell = editor.state.doc.nodeAt(getTableFocusState(editor.state).activeCellPos ?? -1);
    expect(selectedCell?.attrs.backgroundColor).toBe("#fef9c3");

    await click(getByTestId("markweave-table-menu-submenu-alignment"));
    expect(getByTestId("markweave-table-alignment-menu").textContent).toContain("顶部对齐");
    await click(getByTestId("markweave-table-alignment-center"));
    expect(editor.state.doc.nodeAt(getTableFocusState(editor.state).activeCellPos ?? -1)?.attrs.textAlign).toBe("center");
  });

  it("moves keyboard focus through menu items and submenu radio items", async () => {
    await renderTableControls();
    await click(getByTestId("markweave-table-hover-row-handle"));

    const menu = getByTestId("markweave-table-menu");
    const firstCommand = getByTestId<HTMLButtonElement>("markweave-table-menu-command-move-row-up");
    const nextCommand = getByTestId<HTMLButtonElement>("markweave-table-menu-command-add-row-before");
    firstCommand.focus();
    menu.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowDown" }));
    expect(document.activeElement).toBe(nextCommand);

    await click(getByTestId("markweave-table-menu-submenu-color"));
    const colorMenu = getByTestId("markweave-table-color-menu");
    const defaultText = getByTestId<HTMLButtonElement>("markweave-table-text-color-default");
    const grayText = getByTestId<HTMLButtonElement>("markweave-table-text-color-gray");
    defaultText.focus();
    colorMenu.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowDown" }));
    expect(document.activeElement).toBe(grayText);
  });

  it("renders full-width and full-height add strips at the last row and column", async () => {
    const editor = await renderTableControls(undefined, {
      interactionState: (editor) => {
        expect(editor.commands.setTextSelection(textPosition(editor, "Modeled"))).toBe(true);
        const cellPos = getTableFocusState(editor.state).activeCellPos;
        expect(cellPos).not.toBeNull();
        return {
          ...initialTableInteractionState,
          hoverCellPos: cellPos,
          hoverVisualRowIndex: 1,
          hoverVisualColumnIndex: 2,
        };
      },
    });

    const addRow = getByTestId<HTMLButtonElement>("markweave-table-add-row");
    const addColumn = getByTestId<HTMLButtonElement>("markweave-table-add-column");
    expect(addRow.getAttribute("aria-label")).toBe("新增行");
    expect(addColumn.getAttribute("aria-label")).toBe("新增列");
    expect(addRow.style.width).toBe("720px");
    expect(addColumn.style.height).toBe("120px");

    await click(addRow);
    expect(editor.view.dom.querySelectorAll("tr")).toHaveLength(3);
    expect(editor.state.selection).not.toBeInstanceOf(CellSelection);
    expect(getTableFocusState(editor.state)).toMatchObject({ mode: "cell-cursor", selectedCellCount: 1 });

    await click(getByTestId("markweave-table-add-column"));
    expect(Array.from(editor.view.dom.querySelectorAll("tr"), (row) => row.querySelectorAll("th, td").length)).toEqual([4, 4, 4]);
    expect(editor.state.selection).not.toBeInstanceOf(CellSelection);
    expect(getTableFocusState(editor.state)).toMatchObject({ mode: "cell-cursor", selectedCellCount: 1 });
  });

  it("resolves row and column drag targets from the pointer position", async () => {
    const editor = await renderTableControls();
    const table = editor.view.dom.querySelector("table");
    expect(table).toBeTruthy();
    Array.from(table?.rows ?? []).forEach((row, rowIndex) => {
      row.getBoundingClientRect = () => createRect(120, 120 + rowIndex * 48, 720, 48);
      Array.from(row.cells).forEach((cell, columnIndex) => {
        cell.getBoundingClientRect = () => createRect(120 + columnIndex * 240, 120 + rowIndex * 48, 240, 48);
      });
    });

    expect(getTableAxisDropIndexAtPoint(editor, "row", 360, 120 + 48 + 24)).toBe(1);
    expect(getTableAxisDropIndexAtPoint(editor, "column", 120 + 2 * 240 + 120, 180)).toBe(2);
  });
});
