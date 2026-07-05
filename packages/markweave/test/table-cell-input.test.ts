// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { CellSelection, cellAround } from "@tiptap/pm/tables";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { getTableFocusState } from "../src/plugins/table/table-focus-state";
import {
  getMarkweaveTableKeyboardShortcut,
  runMarkweaveTableEnter,
  runMarkweaveTableEscape,
  runMarkweaveTableShiftEnter,
  runMarkweaveTableShiftTab,
  runMarkweaveTableTab,
} from "../src/plugins/table/table-keyboard";

const tableFixture = `
<table>
  <tbody>
    <tr>
      <td><p>alpha</p></td>
      <td><p></p></td>
    </tr>
  </tbody>
</table>
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

function tableCellSnapshots(editor: Editor) {
  const cells: Array<{ pos: number; text: string; childTypes: string[]; json: unknown }> = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") {
      return true;
    }

    const childTypes: string[] = [];
    node.forEach((child) => childTypes.push(child.type.name));
    cells.push({
      pos,
      text: node.textContent,
      childTypes,
      json: node.toJSON(),
    });
    return false;
  });

  return cells;
}

function tableShape(editor: Editor) {
  const rowWidths: number[] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name !== "table") {
      return true;
    }

    node.forEach((row) => rowWidths.push(row.childCount));
    return false;
  });

  return rowWidths;
}

function placeCursorAtEndOfText(editor: Editor, text: string) {
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
    throw new Error(`Expected text "${text}" in the table fixture.`);
  }

  expect(editor.commands.setTextSelection(position)).toBe(true);
}

function placeCursorAtStartOfText(editor: Editor, text: string) {
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
    throw new Error(`Expected text "${text}" in the table fixture.`);
  }

  expect(editor.commands.setTextSelection(position)).toBe(true);
}

function selectText(editor: Editor, text: string) {
  let from: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return true;
    }

    const offset = node.text.indexOf(text);
    if (offset < 0) {
      return true;
    }

    from = pos + offset;
    return false;
  });

  if (from === null) {
    throw new Error(`Expected text "${text}" in the table fixture.`);
  }

  expect(editor.commands.setTextSelection({ from, to: from + text.length })).toBe(true);
}

function placeCursorInEmptyCell(editor: Editor) {
  const emptyCell = tableCellSnapshots(editor).find((cell) => cell.text === "");

  if (!emptyCell) {
    throw new Error("Expected an empty table cell in the fixture.");
  }

  expect(editor.commands.setTextSelection(emptyCell.pos + 2)).toBe(true);
}

function dispatchKey(editor: Editor, key: string, shiftKey = false) {
  const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  let handled = false;

  editor.view.someProp("handleKeyDown", (handler) => {
    const didHandle = handler(editor.view, event) === true;
    handled = handled || didHandle;
    return didHandle;
  });

  return handled;
}

function activeCellText(editor: Editor) {
  return cellAround(editor.state.selection.$from)?.nodeAfter?.textContent ?? null;
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("table cell input behavior", () => {
  it("exposes table Tab traversal as a verified Markweave keyboard layer", () => {
    expect(getMarkweaveTableKeyboardShortcut("tab-next-cell")?.implementationStatus).toBe("verified");
    expect(getMarkweaveTableKeyboardShortcut("shift-tab-previous-cell")?.implementationStatus).toBe("verified");
  });

  it("preserves rich inline marks inside table cells", () => {
    const editor = createTableEditor(`
<table>
  <tbody>
    <tr>
      <td><p><strong>bold</strong> <em>italic</em> <code>code</code> <a href="https://openai.com">link</a></p></td>
    </tr>
  </tbody>
</table>
`);

    const [firstCell] = tableCellSnapshots(editor);
    const serializedCell = JSON.stringify(firstCell.json);

    expect(tableShape(editor)).toEqual([1]);
    expect(firstCell.text).toBe("bold italic code link");
    expect(serializedCell).toContain('"type":"bold"');
    expect(serializedCell).toContain('"type":"italic"');
    expect(serializedCell).toContain('"type":"code"');
    expect(serializedCell).toContain('"type":"link"');
    expect(serializedCell).toContain('"href":"https://openai.com"');
  });

  it("keeps ordinary Enter inside the active cell as an inline-stable no-op", () => {
    const editor = createTableEditor();
    placeCursorAtEndOfText(editor, "alpha");
    const before = editor.state.doc.toJSON();

    expect(dispatchKey(editor, "Enter")).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(before);

    editor.commands.insertContent("beta");

    const [firstCell] = tableCellSnapshots(editor);
    expect(tableShape(editor)).toEqual([2]);
    expect(firstCell.text).toBe("alphabeta");
    expect(firstCell.childTypes).toEqual(["paragraph"]);
  });

  it("keeps ordinary Enter on a cell text range from changing table shape or deleting selected text", () => {
    const editor = createTableEditor();
    selectText(editor, "alpha");
    const before = editor.state.doc.toJSON();
    const beforeSelection = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };

    expect(dispatchKey(editor, "Enter")).toBe(true);

    expect(editor.state.doc.toJSON()).toEqual(before);
    expect(editor.state.selection.from).toBe(beforeSelection.from);
    expect(editor.state.selection.to).toBe(beforeSelection.to);
    expect(tableShape(editor)).toEqual([2]);
    expect(tableCellSnapshots(editor)[0].text).toBe("alpha");
  });

  it("collapses a whole-cell selection to the head cell on Escape without changing table content", () => {
    const editor = createTableEditor();
    const [anchorCell, headCell] = tableCellSnapshots(editor);
    if (!anchorCell || !headCell) {
      throw new Error("Expected two cells in the table fixture.");
    }
    expect(editor.commands.setCellSelection({ anchorCell: anchorCell.pos, headCell: headCell.pos })).toBe(true);
    const before = editor.state.doc.toJSON();

    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(runMarkweaveTableEscape(editor)).toBe(true);

    expect(editor.state.doc.toJSON()).toEqual(before);
    expect(editor.state.selection).not.toBeInstanceOf(CellSelection);
    expect(getTableFocusState(editor.state)).toMatchObject({
      active: true,
      mode: "cell-cursor",
      selectedCellCount: 1,
    });
    expect(activeCellText(editor)).toBe("");
    expect(tableCellSnapshots(editor).map((cell) => cell.text)).toEqual(["alpha", ""]);
  });

  it("keeps ordinary Enter out of the undo stack while undoing typed cell text", () => {
    const editor = createTableEditor();
    placeCursorAtEndOfText(editor, "alpha");

    expect(dispatchKey(editor, "Enter")).toBe(true);
    editor.commands.insertContent("beta");

    expect(tableShape(editor)).toEqual([2]);
    expect(tableCellSnapshots(editor)[0].text).toBe("alphabeta");
    expect(tableCellSnapshots(editor)[0].childTypes).toEqual(["paragraph"]);

    expect(editor.commands.undo()).toBe(true);
    expect(tableShape(editor)).toEqual([2]);
    expect(tableCellSnapshots(editor)[0].text).toBe("alpha");
    expect(tableCellSnapshots(editor)[0].childTypes).toEqual(["paragraph"]);

    expect(editor.commands.redo()).toBe(true);
    expect(tableShape(editor)).toEqual([2]);
    expect(tableCellSnapshots(editor)[0].text).toBe("alphabeta");
    expect(tableCellSnapshots(editor)[0].childTypes).toEqual(["paragraph"]);
  });

  it("keeps Shift+Enter inside the active cell as a hard break", () => {
    const editor = createTableEditor();
    placeCursorAtEndOfText(editor, "alpha");

    expect(dispatchKey(editor, "Enter", true)).toBe(true);
    editor.commands.insertContent("beta");

    const [firstCell] = tableCellSnapshots(editor);
    expect(tableShape(editor)).toEqual([2]);
    expect(firstCell.text).toBe("alphabeta");
    expect(JSON.stringify(firstCell.json)).toContain("hardBreak");
  });

  it("undoes and redoes Shift+Enter as an in-cell hard break", () => {
    const editor = createTableEditor();
    placeCursorAtEndOfText(editor, "alpha");

    expect(dispatchKey(editor, "Enter", true)).toBe(true);
    expect(tableShape(editor)).toEqual([2]);
    expect(JSON.stringify(tableCellSnapshots(editor)[0].json)).toContain("hardBreak");

    expect(editor.commands.undo()).toBe(true);
    expect(tableShape(editor)).toEqual([2]);
    expect(JSON.stringify(tableCellSnapshots(editor)[0].json)).not.toContain("hardBreak");

    expect(editor.commands.redo()).toBe(true);
    expect(tableShape(editor)).toEqual([2]);
    expect(JSON.stringify(tableCellSnapshots(editor)[0].json)).toContain("hardBreak");
  });

  it("allows empty table cells to receive text without changing table shape", () => {
    const editor = createTableEditor();
    placeCursorInEmptyCell(editor);

    editor.commands.insertContent("empty");

    const [, secondCell] = tableCellSnapshots(editor);
    expect(tableShape(editor)).toEqual([2]);
    expect(secondCell.text).toBe("empty");
    expect(secondCell.childTypes).toEqual(["paragraph"]);
  });

  it("keeps ordinary Enter in an empty cell as a no-op before typed content", () => {
    const editor = createTableEditor();
    placeCursorInEmptyCell(editor);
    const before = editor.state.doc.toJSON();
    const beforeSelection = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };

    expect(runMarkweaveTableEnter(editor)).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(before);
    expect(editor.state.selection.from).toBe(beforeSelection.from);
    expect(editor.state.selection.to).toBe(beforeSelection.to);

    editor.commands.insertContent("empty-enter");

    const [, secondCell] = tableCellSnapshots(editor);
    expect(tableShape(editor)).toEqual([2]);
    expect(secondCell.text).toBe("empty-enter");
    expect(secondCell.childTypes).toEqual(["paragraph"]);
    expect(getTableFocusState(editor.state)).toMatchObject({
      active: true,
      mode: "cell-cursor",
      activeCellPos: secondCell.pos,
    });
  });

  it("creates an explicit hard break in an empty cell with Shift+Enter", () => {
    const editor = createTableEditor();
    placeCursorInEmptyCell(editor);

    expect(runMarkweaveTableShiftEnter(editor)).toBe(true);
    editor.commands.insertContent("after-empty-break");

    const [, secondCell] = tableCellSnapshots(editor);
    expect(tableShape(editor)).toEqual([2]);
    expect(secondCell.text).toBe("after-empty-break");
    expect(JSON.stringify(secondCell.json)).toContain("hardBreak");
    expect(getTableFocusState(editor.state)).toMatchObject({
      active: true,
      mode: "cell-cursor",
      activeCellPos: secondCell.pos,
    });
  });

  it("keeps empty-cell Shift+Enter undoable with typed text", () => {
    const editor = createTableEditor();
    placeCursorInEmptyCell(editor);

    expect(runMarkweaveTableShiftEnter(editor)).toBe(true);
    editor.commands.insertContent("after-empty-break");

    expect(JSON.stringify(tableCellSnapshots(editor)[1].json)).toContain("hardBreak");
    expect(tableCellSnapshots(editor)[1].text).toBe("after-empty-break");

    expect(editor.commands.undo()).toBe(true);
    expect(tableCellSnapshots(editor)[1].text).toBe("");
    expect(JSON.stringify(tableCellSnapshots(editor)[1].json)).not.toContain("hardBreak");
    expect(tableShape(editor)).toEqual([2]);

    expect(editor.commands.redo()).toBe(true);
    expect(tableCellSnapshots(editor)[1].text).toBe("after-empty-break");
    expect(JSON.stringify(tableCellSnapshots(editor)[1].json)).toContain("hardBreak");
  });

  it("keeps Shift+Enter from replacing a whole-cell selection", () => {
    const editor = createTableEditor();
    const [anchorCell, headCell] = tableCellSnapshots(editor);
    if (!anchorCell || !headCell) {
      throw new Error("Expected two cells in the table fixture.");
    }
    expect(editor.commands.setCellSelection({ anchorCell: anchorCell.pos, headCell: headCell.pos })).toBe(true);
    const before = editor.state.doc.toJSON();

    expect(dispatchKey(editor, "Enter", true)).toBe(true);

    expect(editor.state.doc.toJSON()).toEqual(before);
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(tableCellSnapshots(editor).map((cell) => cell.text)).toEqual(["alpha", ""]);
  });

  it("undoes and redoes text insertion inside an empty cell", () => {
    const editor = createTableEditor();
    placeCursorInEmptyCell(editor);

    editor.commands.insertContent("empty");
    expect(tableShape(editor)).toEqual([2]);
    expect(tableCellSnapshots(editor)[1].text).toBe("empty");

    expect(editor.commands.undo()).toBe(true);
    expect(tableShape(editor)).toEqual([2]);
    expect(tableCellSnapshots(editor)[1].text).toBe("");

    expect(editor.commands.redo()).toBe(true);
    expect(tableShape(editor)).toEqual([2]);
    expect(tableCellSnapshots(editor)[1].text).toBe("empty");
  });

  it("moves Tab to the next cell without changing table shape", () => {
    const editor = createTableEditor();
    placeCursorAtEndOfText(editor, "alpha");

    expect(dispatchKey(editor, "Tab")).toBe(true);
    editor.commands.insertContent("beta");

    const [firstCell, secondCell] = tableCellSnapshots(editor);
    expect(tableShape(editor)).toEqual([2]);
    expect(firstCell.text).toBe("alpha");
    expect(secondCell.text).toBe("beta");
  });

  it("moves Shift+Tab to the previous cell", () => {
    const editor = createTableEditor();
    placeCursorInEmptyCell(editor);

    expect(dispatchKey(editor, "Tab", true)).toBe(true);

    const [firstCell, secondCell] = tableCellSnapshots(editor);
    expect(tableShape(editor)).toEqual([2]);
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe("alpha");
    expect(firstCell.text).toBe("alpha");
    expect(secondCell.text).toBe("");
  });

  it("handles Shift+Tab at the first cell boundary without leaking focus or changing table shape", () => {
    const editor = createTableEditor();
    placeCursorAtEndOfText(editor, "alpha");
    const beforeSelection = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };

    expect(dispatchKey(editor, "Tab", true)).toBe(true);

    const [firstCell, secondCell] = tableCellSnapshots(editor);
    expect(tableShape(editor)).toEqual([2]);
    expect(firstCell.text).toBe("alpha");
    expect(secondCell.text).toBe("");
    expect(editor.state.selection.from).toBe(beforeSelection.from);
    expect(editor.state.selection.to).toBe(beforeSelection.to);
  });

  it("appends a row when Tab starts from the final cell", () => {
    const editor = createTableEditor();
    placeCursorInEmptyCell(editor);

    expect(dispatchKey(editor, "Tab")).toBe(true);
    editor.commands.insertContent("after");

    expect(tableShape(editor)).toEqual([2, 2]);
    expect(tableCellSnapshots(editor).map((cell) => cell.text)).toEqual(["alpha", "", "after", ""]);
  });

  it("moves Tab through merged cells in document visual order", () => {
    const editor = createTableEditor(mergedTableFixture);
    placeCursorAtEndOfText(editor, "Merged Header");

    expect(runMarkweaveTableTab(editor)).toBe(true);
    expect(activeCellText(editor)).toBe("Solo");

    expect(runMarkweaveTableTab(editor)).toBe(true);
    expect(activeCellText(editor)).toBe("A");

    expect(runMarkweaveTableTab(editor)).toBe(true);
    expect(activeCellText(editor)).toBe("B");
  });

  it("moves Shift+Tab backward through merged cells without duplicating rowspans", () => {
    const editor = createTableEditor(mergedTableFixture);
    placeCursorAtStartOfText(editor, "D");

    expect(runMarkweaveTableShiftTab(editor)).toBe(true);
    expect(activeCellText(editor)).toBe("C");

    expect(runMarkweaveTableShiftTab(editor)).toBe(true);
    expect(activeCellText(editor)).toBe("B");

    expect(runMarkweaveTableShiftTab(editor)).toBe(true);
    expect(activeCellText(editor)).toBe("A");
  });

  it("appends a rectangular row after Tab from a merged table final cell", () => {
    const editor = createTableEditor(mergedTableFixture);
    placeCursorAtEndOfText(editor, "E");

    expect(dispatchKey(editor, "Tab")).toBe(true);
    editor.commands.insertContent("after-merged");

    expect(tableShape(editor)).toEqual([2, 3, 2, 3]);
    expect(tableCellSnapshots(editor).map((cell) => cell.text)).toEqual(["Merged Header", "Solo", "A", "B", "C", "D", "E", "after-merged", "", ""]);
  });
});
