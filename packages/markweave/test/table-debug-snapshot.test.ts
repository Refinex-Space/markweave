// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { getFirstTableDebugSnapshot } from "../src/plugins/table/table-debug-snapshot";
import { runTableCommand, selectTableAxisFromCell } from "../src/react/ui/table/TableControls";

let activeEditor: Editor | null = null;

const mergedTableDocument = `
<h1>Table Merge Fixture</h1>
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

function createEditor(content = mergedTableDocument) {
  const element = document.createElement("div");
  document.body.appendChild(element);

  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions(),
    content,
  });

  return activeEditor;
}

function findCellPosByText(editor: Editor, text: string) {
  let cellPos: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") {
      return true;
    }

    if (!node.textContent.includes(text)) {
      return true;
    }

    cellPos = pos;
    return false;
  });

  if (cellPos === null) {
    throw new Error(`Expected table cell containing "${text}".`);
  }

  return cellPos;
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("table debug snapshot", () => {
  it("exposes merged table structure for debug consumers", () => {
    const editor = createEditor();

    expect(getFirstTableDebugSnapshot(editor.state)).toEqual({
      rowCount: 3,
      visualWidth: 3,
      rows: [
        [
          { text: "Merged Header", type: "header", colspan: 2, rowspan: 1 },
          { text: "Solo", type: "header", colspan: 1, rowspan: 1 },
        ],
        [
          { text: "A", type: "cell", colspan: 1, rowspan: 2 },
          { text: "B", type: "cell", colspan: 1, rowspan: 1 },
          { text: "C", type: "cell", colspan: 1, rowspan: 1 },
        ],
        [
          { text: "D", type: "cell", colspan: 1, rowspan: 1 },
          { text: "E", type: "cell", colspan: 1, rowspan: 1 },
        ],
      ],
    });
  });

  it("reflects visual-column deletion across colspan and rowspan cells", () => {
    const editor = createEditor();
    const secondVisualColumnCellPos = findCellPosByText(editor, "B");

    expect(selectTableAxisFromCell(editor, secondVisualColumnCellPos, "column")).toBe(true);
    expect(runTableCommand(editor, "delete-column")).toBe(true);

    expect(getFirstTableDebugSnapshot(editor.state)).toEqual({
      rowCount: 3,
      visualWidth: 2,
      rows: [
        [
          { text: "Merged Header", type: "header", colspan: 1, rowspan: 1 },
          { text: "Solo", type: "header", colspan: 1, rowspan: 1 },
        ],
        [
          { text: "A", type: "cell", colspan: 1, rowspan: 2 },
          { text: "C", type: "cell", colspan: 1, rowspan: 1 },
        ],
        [{ text: "E", type: "cell", colspan: 1, rowspan: 1 }],
      ],
    });
  });
});
