// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { setMarkweaveTableMenuAxisTarget } from "../src/plugins/table/table-clipboard";
import { getTableFocusState } from "../src/plugins/table/table-focus-state";
import {
  getTableHoverAxisStartCellPos,
  getTableInteractionCellClasses,
  getTableSelectionOverlayState,
  setTableHoverCell,
  tableInteractionPluginKey,
} from "../src/plugins/table/table-interaction-layer";

const tableFixture = `
<table>
  <tbody>
    <tr>
      <td><p>alpha</p></td>
      <td><p>beta</p></td>
    </tr>
    <tr>
      <td><p>gamma</p></td>
      <td><p>delta</p></td>
    </tr>
  </tbody>
</table>
<p>outside</p>
`;

const mergedTableFixture = `
<table>
  <tbody>
    <tr>
      <th colspan="2"><p>Merged Header</p></th>
      <th><p>Solo</p></th>
    </tr>
    <tr>
      <td rowspan="2"><p>A</p></td>
      <td><p>B</p></td>
      <td><p>C</p></td>
    </tr>
    <tr>
      <td><p>D</p></td>
      <td><p>E</p></td>
    </tr>
  </tbody>
</table>
`;

interface CellSnapshot {
  readonly pos: number;
  readonly text: string;
}

let activeEditor: Editor | null = null;

function createTableEditor(content = tableFixture) {
  const element = document.createElement("div");
  document.body.appendChild(element);

  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions(),
    content,
  });

  return activeEditor;
}

function tableCells(editor: Editor) {
  const cells: CellSnapshot[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") {
      return true;
    }

    cells.push({ pos, text: node.textContent });
    return false;
  });

  return cells;
}

function cellByText(editor: Editor, text: string) {
  const cell = tableCells(editor).find((snapshot) => snapshot.text === text);

  if (!cell) {
    throw new Error(`Expected cell containing "${text}".`);
  }

  return cell;
}

function textPosition(editor: Editor, text: string): number {
  let position: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return true;
    }

    const offset = node.text.indexOf(text);
    if (offset < 0) {
      return true;
    }

    position = pos + offset;
    return false;
  });

  if (position === null) {
    throw new Error(`Expected text "${text}".`);
  }

  return position;
}

function textEndPosition(editor: Editor, text: string): number {
  return textPosition(editor, text) + text.length;
}

function classesFor(editor: Editor, text: string) {
  const cell = cellByText(editor, text);
  const interactionState = tableInteractionPluginKey.getState(editor.state);

  return getTableInteractionCellClasses(editor.state, interactionState).get(cell.pos) ?? [];
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("table interaction decoration layer", () => {
  it("models table focus state for cursor, text range, cell selection, and outside selection", () => {
    const editor = createTableEditor();
    const alpha = cellByText(editor, "alpha");
    const beta = cellByText(editor, "beta");

    expect(editor.commands.setTextSelection(textPosition(editor, "alpha"))).toBe(true);
    expect(getTableFocusState(editor.state)).toMatchObject({
      active: true,
      mode: "cell-cursor",
      activeCellPos: alpha.pos,
      selectedCellCount: 1,
    });

    expect(editor.commands.setTextSelection({ from: textPosition(editor, "alpha"), to: textEndPosition(editor, "alpha") })).toBe(true);
    expect(getTableFocusState(editor.state)).toMatchObject({
      active: true,
      mode: "cell-text-range",
      activeCellPos: alpha.pos,
      selectedCellCount: 1,
    });

    expect(editor.commands.setCellSelection({ anchorCell: alpha.pos, headCell: beta.pos })).toBe(true);
    expect(getTableFocusState(editor.state)).toMatchObject({
      active: true,
      mode: "cell-selection",
      activeCellPos: beta.pos,
      anchorCellPos: alpha.pos,
      selectedCellCount: 2,
    });

    expect(editor.commands.setTextSelection(textPosition(editor, "outside"))).toBe(true);
    expect(getTableFocusState(editor.state)).toMatchObject({
      active: false,
      mode: "outside",
      activeCellPos: null,
      selectedCellCount: 0,
    });
  });

  it("marks the active table cell when text selection is inside a cell", () => {
    const editor = createTableEditor();

    expect(editor.commands.setTextSelection(textPosition(editor, "beta"))).toBe(true);

    expect(classesFor(editor, "beta")).toContain("markweave-active-cell");
    expect(classesFor(editor, "alpha")).not.toContain("markweave-active-cell");
  });

  it("keeps ordinary active-cell focus from painting row and column backgrounds", () => {
    const editor = createTableEditor();

    expect(editor.commands.setTextSelection(textPosition(editor, "beta"))).toBe(true);

    expect(classesFor(editor, "beta")).toEqual(["markweave-active-cell"]);
    expect(classesFor(editor, "alpha")).toEqual([]);
    expect(classesFor(editor, "delta")).toEqual([]);
    expect(classesFor(editor, "gamma")).toEqual([]);
  });

  it("marks every selected cell for multi-cell selection overlay", () => {
    const editor = createTableEditor();
    const alpha = cellByText(editor, "alpha");
    const beta = cellByText(editor, "beta");

    expect(editor.commands.setCellSelection({ anchorCell: alpha.pos, headCell: beta.pos })).toBe(true);

    expect(classesFor(editor, "alpha")).toContain("markweave-selection-cell");
    expect(classesFor(editor, "beta")).toContain("markweave-selection-cell");
    expect(classesFor(editor, "beta")).toContain("markweave-active-cell");
    expect(classesFor(editor, "gamma")).not.toContain("markweave-selection-cell");
    expect(classesFor(editor, "alpha")).toEqual(
      expect.arrayContaining([
        "markweave-selection-anchor-cell",
        "markweave-selection-edge-bottom",
        "markweave-selection-edge-left",
        "markweave-selection-edge-top",
      ]),
    );
    expect(classesFor(editor, "beta")).toEqual(
      expect.arrayContaining([
        "markweave-selection-head-cell",
        "markweave-selection-edge-bottom",
        "markweave-selection-edge-right",
        "markweave-selection-edge-top",
      ]),
    );
  });

  it("marks rectangular multi-row cell selections with continuous overlay edges", () => {
    const editor = createTableEditor();
    const alpha = cellByText(editor, "alpha");
    const delta = cellByText(editor, "delta");

    expect(editor.commands.setCellSelection({ anchorCell: alpha.pos, headCell: delta.pos })).toBe(true);

    expect(classesFor(editor, "alpha")).toEqual(
      expect.arrayContaining([
        "markweave-selection-anchor-cell",
        "markweave-selection-edge-left",
        "markweave-selection-edge-top",
      ]),
    );
    expect(classesFor(editor, "beta")).toEqual(expect.arrayContaining(["markweave-selection-edge-right", "markweave-selection-edge-top"]));
    expect(classesFor(editor, "gamma")).toEqual(expect.arrayContaining(["markweave-selection-edge-bottom", "markweave-selection-edge-left"]));
    expect(classesFor(editor, "delta")).toEqual(
      expect.arrayContaining([
        "markweave-active-cell",
        "markweave-selection-head-cell",
        "markweave-selection-edge-bottom",
        "markweave-selection-edge-right",
      ]),
    );
  });

  it("exposes a continuous overlay model only for cell selections", () => {
    const editor = createTableEditor();
    const alpha = cellByText(editor, "alpha");
    const delta = cellByText(editor, "delta");

    expect(editor.commands.setTextSelection(textPosition(editor, "alpha"))).toBe(true);
    expect(getTableSelectionOverlayState(editor.state)).toMatchObject({
      active: false,
      selectedCellCount: 0,
      cellPositions: [],
      rect: null,
    });

    expect(editor.commands.setCellSelection({ anchorCell: alpha.pos, headCell: delta.pos })).toBe(true);

    expect(getTableSelectionOverlayState(editor.state)).toEqual({
      active: true,
      anchorCellPos: alpha.pos,
      headCellPos: delta.pos,
      selectedCellCount: 4,
      cellPositions: tableCells(editor).map((cell) => cell.pos),
      rect: {
        left: 0,
        right: 2,
        top: 0,
        bottom: 2,
        width: 2,
        height: 2,
        slotCount: 4,
      },
    });
  });

  it("keeps merged-cell overlay state tied to the visual table rectangle", () => {
    const editor = createTableEditor(mergedTableFixture);
    const header = cellByText(editor, "Merged Header");
    const end = cellByText(editor, "E");
    const cells = tableCells(editor);

    expect(editor.commands.setCellSelection({ anchorCell: header.pos, headCell: end.pos })).toBe(true);

    expect(getTableSelectionOverlayState(editor.state)).toEqual({
      active: true,
      anchorCellPos: header.pos,
      headCellPos: end.pos,
      selectedCellCount: cells.length,
      cellPositions: cells.map((cell) => cell.pos),
      rect: {
        left: 0,
        right: 3,
        top: 0,
        bottom: 3,
        width: 3,
        height: 3,
        slotCount: 9,
      },
    });
    expect(getTableSelectionOverlayState(editor.state).rect?.slotCount).toBeGreaterThan(cells.length);
  });

  it("narrows row edge-menu overlays to the targeted visual row through rowspans", () => {
    const editor = createTableEditor(mergedTableFixture);
    const header = cellByText(editor, "Merged Header");
    const end = cellByText(editor, "E");

    expect(editor.commands.setCellSelection({ anchorCell: header.pos, headCell: end.pos })).toBe(true);
    editor.view.dispatch(setMarkweaveTableMenuAxisTarget(editor.state.tr, { kind: "row", index: 2 }));

    expect(getTableSelectionOverlayState(editor.state)).toMatchObject({
      active: true,
      selectedCellCount: 7,
      rect: {
        left: 0,
        right: 3,
        top: 2,
        bottom: 3,
        width: 3,
        height: 1,
        slotCount: 3,
      },
    });
  });

  it("tracks hovered cells for handle positioning without painting row and column cells", () => {
    const editor = createTableEditor();
    const beta = cellByText(editor, "beta");
    expect(editor.commands.setTextSelection(textPosition(editor, "outside"))).toBe(true);

    editor.view.dispatch(setTableHoverCell(editor.state.tr, beta.pos));

    expect(tableInteractionPluginKey.getState(editor.state)).toMatchObject({
      hoverCellPos: beta.pos,
    });
    expect(classesFor(editor, "alpha")).toEqual([]);
    expect(classesFor(editor, "beta")).toEqual([]);
    expect(classesFor(editor, "gamma")).toEqual([]);
    expect(classesFor(editor, "delta")).toEqual([]);
  });

  it("resolves visual row and column edge anchors through merged cells", () => {
    const editor = createTableEditor(mergedTableFixture);
    const bodyCell = cellByText(editor, "B");
    const coveredRowCell = cellByText(editor, "D");
    const rowspannedCell = cellByText(editor, "A");

    expect(getTableHoverAxisStartCellPos(editor.state, bodyCell.pos, "row")).toBe(cellByText(editor, "A").pos);
    expect(getTableHoverAxisStartCellPos(editor.state, bodyCell.pos, "column")).toBe(cellByText(editor, "Merged Header").pos);
    expect(getTableHoverAxisStartCellPos(editor.state, coveredRowCell.pos, "row")).toBe(cellByText(editor, "A").pos);
    expect(getTableHoverAxisStartCellPos(editor.state, coveredRowCell.pos, "column")).toBe(cellByText(editor, "Merged Header").pos);
    expect(getTableHoverAxisStartCellPos(editor.state, rowspannedCell.pos, "row", 2)).toBe(cellByText(editor, "A").pos);
  });

  it("updates hover state from real table DOM mouse movement and clears it on leave", () => {
    const editor = createTableEditor();
    const betaElement = editor.view.dom.querySelectorAll("td")[1];
    expect(editor.commands.setTextSelection(textPosition(editor, "outside"))).toBe(true);

    if (!betaElement) {
      throw new Error("Expected a rendered second table cell.");
    }

    betaElement.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));

    expect(tableInteractionPluginKey.getState(editor.state)?.hoverCellPos).toBe(cellByText(editor, "beta").pos);
    expect(classesFor(editor, "delta")).toEqual([]);

    editor.view.dom.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));

    expect(tableInteractionPluginKey.getState(editor.state)?.hoverCellPos).toBe(null);
  });

  it("tracks visual row and column positions inside spanned hover cells", () => {
    const editor = createTableEditor(mergedTableFixture);
    const rowspannedElement = [...editor.view.dom.querySelectorAll("td")].find((cell) => cell.textContent?.trim() === "A");

    if (!rowspannedElement) {
      throw new Error("Expected rendered row-spanned table cell.");
    }

    rowspannedElement.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 120,
        bottom: 80,
        width: 120,
        height: 80,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    rowspannedElement.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 12, clientY: 60 }));

    expect(tableInteractionPluginKey.getState(editor.state)).toMatchObject({
      hoverCellPos: cellByText(editor, "A").pos,
      hoverVisualRowIndex: 2,
      hoverVisualColumnIndex: 0,
    });
  });

  it("creates a rectangular cell selection by dragging between table cells", () => {
    const editor = createTableEditor();
    const alphaElement = editor.view.dom.querySelectorAll("td")[0];
    const deltaElement = editor.view.dom.querySelectorAll("td")[3];

    if (!alphaElement || !deltaElement) {
      throw new Error("Expected rendered table cells.");
    }

    const originalElementFromPoint = document.elementFromPoint;
    let pointTarget: Element = alphaElement;

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => pointTarget,
    });

    try {
      alphaElement.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, buttons: 1 }));
      pointTarget = deltaElement;
      deltaElement.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1 }));

      expect(editor.state.selection).toBeInstanceOf(CellSelection);
      expect(getTableFocusState(editor.state)).toMatchObject({
        active: true,
        mode: "cell-selection",
        activeCellPos: cellByText(editor, "delta").pos,
        anchorCellPos: cellByText(editor, "alpha").pos,
        selectedCellCount: 4,
      });
      expect(classesFor(editor, "alpha")).toContain("markweave-selection-cell");
      expect(classesFor(editor, "delta")).toContain("markweave-selection-cell");

      editor.view.dom.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, buttons: 0 }));

      expect(tableInteractionPluginKey.getState(editor.state)).toMatchObject({
        hoverCellPos: cellByText(editor, "delta").pos,
        dragAnchorCellPos: null,
        dragHeadCellPos: null,
      });
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it("does not convert same-cell pointer movement into a whole-cell selection", () => {
    const editor = createTableEditor();
    const alphaElement = editor.view.dom.querySelectorAll("td")[0];

    if (!alphaElement) {
      throw new Error("Expected a rendered first table cell.");
    }

    const originalElementFromPoint = document.elementFromPoint;

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => alphaElement,
    });

    try {
      alphaElement.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, buttons: 1 }));
      alphaElement.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1 }));

      expect(editor.state.selection).not.toBeInstanceOf(CellSelection);
      expect(getTableFocusState(editor.state)).toMatchObject({
        active: true,
        mode: "cell-cursor",
        activeCellPos: cellByText(editor, "alpha").pos,
        selectedCellCount: 1,
      });
      expect(classesFor(editor, "alpha")).toContain("markweave-active-cell");
      expect(classesFor(editor, "alpha")).not.toContain("markweave-selection-cell");
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it("creates an in-cell text range when dragging within the same table cell", () => {
    const editor = createTableEditor();
    const alphaElement = editor.view.dom.querySelectorAll("td")[0];

    if (!alphaElement) {
      throw new Error("Expected a rendered first table cell.");
    }

    const alphaStart = textPosition(editor, "alpha");
    const alphaEnd = textEndPosition(editor, "alpha");
    const originalElementFromPoint = document.elementFromPoint;
    const originalPosAtCoords = editor.view.posAtCoords;
    let pointerPos = alphaStart;

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => alphaElement,
    });

    editor.view.posAtCoords = () => ({ pos: pointerPos, inside: -1 });

    try {
      alphaElement.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, buttons: 1 }));
      pointerPos = alphaEnd;
      alphaElement.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1 }));

      expect(editor.state.selection).not.toBeInstanceOf(CellSelection);
      expect(editor.state.selection.from).toBe(alphaStart);
      expect(editor.state.selection.to).toBe(alphaEnd);
      expect(getTableFocusState(editor.state)).toMatchObject({
        active: true,
        mode: "cell-text-range",
        activeCellPos: cellByText(editor, "alpha").pos,
        selectedCellCount: 1,
      });
      expect(classesFor(editor, "alpha")).toContain("markweave-active-cell");
      expect(classesFor(editor, "alpha")).not.toContain("markweave-selection-cell");
      expect(tableInteractionPluginKey.getState(editor.state)).toMatchObject({
        dragAnchorCellPos: cellByText(editor, "alpha").pos,
        dragHeadCellPos: cellByText(editor, "alpha").pos,
        dragAnchorTextPos: alphaStart,
      });
    } finally {
      editor.view.posAtCoords = originalPosAtCoords;
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it("falls back to event-target text when caret hit-testing lands on a table handle overlay", () => {
    const editor = createTableEditor();
    const alphaElement = editor.view.dom.querySelectorAll("td")[0];
    const alphaParagraph = alphaElement?.querySelector("p");
    const overlayButton = document.createElement("button");

    if (!alphaElement || !alphaParagraph) {
      throw new Error("Expected rendered first table cell content.");
    }

    document.body.appendChild(overlayButton);

    const alphaStart = textPosition(editor, "alpha");
    const alphaEnd = textEndPosition(editor, "alpha");
    const originalElementFromPoint = document.elementFromPoint;
    const originalCaretPositionFromPoint = document.caretPositionFromPoint;
    const originalRangeRect = Range.prototype.getBoundingClientRect;

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => alphaParagraph,
    });
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: () => ({
        offsetNode: overlayButton,
        offset: 0,
      }),
    });
    Range.prototype.getBoundingClientRect = function getMockRangeRect() {
      return new DOMRect(10 + this.startOffset * 10, 10, 10, 10);
    };

    try {
      alphaParagraph.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, buttons: 1, clientX: 10 }));
      alphaParagraph.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 64 }));

      expect(editor.state.selection).not.toBeInstanceOf(CellSelection);
      expect(editor.state.selection.from).toBe(alphaStart);
      expect(editor.state.selection.to).toBe(alphaEnd);
      expect(getTableFocusState(editor.state)).toMatchObject({
        active: true,
        mode: "cell-text-range",
        activeCellPos: cellByText(editor, "alpha").pos,
        selectedCellCount: 1,
      });
    } finally {
      Range.prototype.getBoundingClientRect = originalRangeRect;
      Object.defineProperty(document, "caretPositionFromPoint", {
        configurable: true,
        value: originalCaretPositionFromPoint,
      });
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });
});
