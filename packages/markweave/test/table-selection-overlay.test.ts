// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { setMarkweaveTableMenuAxisTarget } from "../src/plugins/table/table-clipboard";
import { getTableSelectionOverlayState } from "../src/plugins/table/table-interaction-layer";
import { measureTableSelectionOverlay } from "../src/plugins/table/table-ui-model";

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

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function createTableEditor() {
  const frame = document.createElement("section");
  frame.className = "markweave-editor-frame";
  frame.getBoundingClientRect = () => rect(0, 0, 640, 480);

  const element = document.createElement("div");
  frame.appendChild(element);
  document.body.appendChild(frame);

  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions(),
    content: mergedTableFixture,
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

function setCellRect(editor: Editor, text: string, cellRect: DOMRect) {
  const cellElement = editor.view.nodeDOM(cellByText(editor, text).pos);

  if (!(cellElement instanceof HTMLElement)) {
    throw new Error(`Expected DOM cell for "${text}".`);
  }

  cellElement.getBoundingClientRect = () => cellRect;
}

function stubMergedTableLayout(editor: Editor) {
  setCellRect(editor, "Merged Header", rect(10, 20, 200, 40));
  setCellRect(editor, "Solo", rect(210, 20, 100, 40));
  setCellRect(editor, "A", rect(10, 60, 100, 80));
  setCellRect(editor, "B", rect(110, 60, 100, 40));
  setCellRect(editor, "C", rect(210, 60, 100, 40));
  setCellRect(editor, "D", rect(110, 100, 100, 40));
  setCellRect(editor, "E", rect(210, 100, 100, 40));
}

function selectMergedTable(editor: Editor) {
  expect(editor.commands.setCellSelection({ anchorCell: cellByText(editor, "Merged Header").pos, headCell: cellByText(editor, "E").pos })).toBe(true);
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("table selection overlay measurement", () => {
  it("measures only the targeted visual row through a row-spanned cell", () => {
    const editor = createTableEditor();
    stubMergedTableLayout(editor);
    selectMergedTable(editor);
    editor.view.dispatch(setMarkweaveTableMenuAxisTarget(editor.state.tr, { kind: "row", index: 2 }));

    expect(measureTableSelectionOverlay(editor, getTableSelectionOverlayState(editor.state))).toMatchObject({
      left: 10,
      top: 100,
      width: 300,
      height: 40,
      selectedCellCount: 7,
      visualColumnCount: 3,
      visualRowCount: 1,
      visualSlotCount: 3,
    });
  });

  it("measures only the targeted visual column through a col-spanned header", () => {
    const editor = createTableEditor();
    stubMergedTableLayout(editor);
    selectMergedTable(editor);
    editor.view.dispatch(setMarkweaveTableMenuAxisTarget(editor.state.tr, { kind: "column", index: 1 }));

    expect(measureTableSelectionOverlay(editor, getTableSelectionOverlayState(editor.state))).toMatchObject({
      left: 110,
      top: 20,
      width: 100,
      height: 120,
      selectedCellCount: 7,
      visualColumnCount: 1,
      visualRowCount: 3,
      visualSlotCount: 3,
    });
  });
});
