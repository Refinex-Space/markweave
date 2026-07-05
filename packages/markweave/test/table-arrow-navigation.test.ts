// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { CellSelection, cellAround } from "@tiptap/pm/tables";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { getTableFocusState } from "../src/plugins/table/table-focus-state";
import {
  getMarkweaveTableArrowShortcut,
  runMarkweaveTableArrowKey,
  runMarkweaveTableShiftArrowKey,
} from "../src/plugins/table/table-arrow-navigation";

const tableFixture = `
<table>
  <tbody>
    <tr>
      <td><p>alpha</p><p>tail</p></td>
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

const hardBreakTableFixture = `
<table>
  <tbody>
    <tr>
      <td><p>above-left</p></td>
      <td><p>above-right</p></td>
    </tr>
    <tr>
      <td><p>top<br>bottom</p></td>
      <td><p>side</p></td>
    </tr>
    <tr>
      <td><p>below-left</p></td>
      <td><p>below-right</p></td>
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

function textPosition(editor: Editor, text: string, boundary: "start" | "end") {
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
    throw new Error(`Expected text "${text}" in the table fixture.`);
  }

  return position;
}

function placeCursor(editor: Editor, text: string, boundary: "start" | "end") {
  expect(editor.commands.setTextSelection(textPosition(editor, text, boundary))).toBe(true);
}

function dispatchKey(editor: Editor, key: string, shiftKey = false) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, shiftKey });
  let handled = false;

  editor.view.someProp("handleKeyDown", (handler) => {
    const didHandle = handler(editor.view, event) === true;
    handled = handled || didHandle;
    return didHandle;
  });

  return handled;
}

function activeCellText(editor: Editor) {
  const selection = editor.state.selection;
  const $cell = cellAround(selection.$from);

  return $cell?.nodeAfter?.textContent ?? null;
}

function selectedCellTexts(editor: Editor) {
  const { selection } = editor.state;

  if (!(selection instanceof CellSelection)) {
    throw new Error("Expected a CellSelection.");
  }

  const texts: string[] = [];
  selection.forEachCell((cell) => texts.push(cell.textContent));
  return texts;
}

function tableRows(editor: Editor) {
  const rows: string[][] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name !== "table") {
      return true;
    }

    node.forEach((row) => {
      const cells: string[] = [];
      row.forEach((cell) => cells.push(cell.textContent));
      rows.push(cells);
    });

    return false;
  });

  return rows;
}

function runArrow(editor: Editor, key: Parameters<typeof runMarkweaveTableArrowKey>[2]) {
  return runMarkweaveTableArrowKey(editor.state, editor.view.dispatch.bind(editor.view), key);
}

function runShiftArrow(editor: Editor, key: Parameters<typeof runMarkweaveTableShiftArrowKey>[2]) {
  return runMarkweaveTableShiftArrowKey(editor.state, editor.view.dispatch.bind(editor.view), key);
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("table arrow boundary navigation", () => {
  it("models all four table arrow shortcuts explicitly", () => {
    expect(getMarkweaveTableArrowShortcut("ArrowLeft")?.implementationStatus).toBe("verified");
    expect(getMarkweaveTableArrowShortcut("ArrowRight")?.implementationStatus).toBe("verified");
    expect(getMarkweaveTableArrowShortcut("ArrowUp")?.implementationStatus).toBe("verified");
    expect(getMarkweaveTableArrowShortcut("ArrowDown")?.implementationStatus).toBe("verified");
    expect(getMarkweaveTableArrowShortcut("ArrowLeft")?.supportStatus).toBe("supported");
    expect(getMarkweaveTableArrowShortcut("ArrowRight")?.supportStatus).toBe("supported");
    expect(getMarkweaveTableArrowShortcut("ArrowUp")?.supportStatus).toBe("supported");
    expect(getMarkweaveTableArrowShortcut("ArrowDown")?.supportStatus).toBe("supported");
  });

  it("moves right from the final text boundary of a cell to the next cell start", () => {
    const editor = createTableEditor();
    placeCursor(editor, "beta", "start");
    const betaStart = editor.state.selection.from;

    placeCursor(editor, "tail", "end");

    expect(dispatchKey(editor, "ArrowRight")).toBe(true);
    expect(activeCellText(editor)).toBe("beta");
    expect(editor.state.selection.from).toBe(betaStart);
  });

  it("exposes the explicit Arrow runner used by the extension", () => {
    const editor = createTableEditor();
    placeCursor(editor, "beta", "start");
    const betaStart = editor.state.selection.from;
    placeCursor(editor, "tail", "end");

    expect(runArrow(editor, "ArrowRight")).toBe(true);
    expect(activeCellText(editor)).toBe("beta");
    expect(editor.state.selection.from).toBe(betaStart);
  });

  it("extends a table cursor into a two-cell CellSelection with Shift+ArrowRight", () => {
    const editor = createTableEditor();
    placeCursor(editor, "alpha", "start");

    expect(dispatchKey(editor, "ArrowRight", true)).toBe(true);

    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(getTableFocusState(editor.state)).toMatchObject({
      mode: "cell-selection",
      selectedCellCount: 2,
    });
    expect(selectedCellTexts(editor)).toEqual(["alphatail", "beta"]);
  });

  it("continues extending a CellSelection from its head cell with Shift+ArrowDown", () => {
    const editor = createTableEditor();
    placeCursor(editor, "alpha", "start");

    expect(runShiftArrow(editor, "ArrowRight")).toBe(true);
    expect(runShiftArrow(editor, "ArrowDown")).toBe(true);

    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(getTableFocusState(editor.state)).toMatchObject({
      mode: "cell-selection",
      selectedCellCount: 4,
    });
    expect(selectedCellTexts(editor)).toEqual(["alphatail", "beta", "gamma", "delta"]);
  });

  it("extends Shift+ArrowRight across merged header cells without duplicating covered columns", () => {
    const editor = createTableEditor(mergedTableFixture);
    placeCursor(editor, "Merged Header", "start");

    expect(runShiftArrow(editor, "ArrowRight")).toBe(true);

    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(getTableFocusState(editor.state)).toMatchObject({
      mode: "cell-selection",
      selectedCellCount: 2,
    });
    expect(selectedCellTexts(editor)).toEqual(["Merged Header", "Solo"]);
  });

  it("does not steal right arrow before the final text block inside a multi-paragraph cell", () => {
    const editor = createTableEditor();
    placeCursor(editor, "alpha", "end");
    const before = editor.state.selection.from;

    expect(dispatchKey(editor, "ArrowRight")).toBe(false);
    expect(activeCellText(editor)).toBe("alphatail");
    expect(editor.state.selection.from).toBe(before);
  });

  it("moves left from a cell start to the previous cell end", () => {
    const editor = createTableEditor();
    placeCursor(editor, "tail", "end");
    const previousEnd = editor.state.selection.from;

    placeCursor(editor, "beta", "start");

    expect(dispatchKey(editor, "ArrowLeft")).toBe(true);
    expect(activeCellText(editor)).toBe("alphatail");
    expect(editor.state.selection.from).toBe(previousEnd);
  });

  it("moves horizontally across row boundaries at text boundaries", () => {
    const editor = createTableEditor();
    placeCursor(editor, "gamma", "start");
    const nextRowStart = editor.state.selection.from;
    placeCursor(editor, "beta", "end");
    const previousRowEnd = editor.state.selection.from;

    expect(dispatchKey(editor, "ArrowRight")).toBe(true);
    expect(activeCellText(editor)).toBe("gamma");
    expect(editor.state.selection.from).toBe(nextRowStart);

    expect(dispatchKey(editor, "ArrowLeft")).toBe(true);
    expect(activeCellText(editor)).toBe("beta");
    expect(editor.state.selection.from).toBe(previousRowEnd);
  });

  it("moves vertically between adjacent cells at text boundaries", () => {
    const editor = createTableEditor();
    placeCursor(editor, "gamma", "start");
    const gammaStart = editor.state.selection.from;
    placeCursor(editor, "tail", "end");
    const topCellEnd = editor.state.selection.from;

    expect(dispatchKey(editor, "ArrowDown")).toBe(true);
    expect(activeCellText(editor)).toBe("gamma");
    expect(editor.state.selection.from).toBe(gammaStart);

    expect(dispatchKey(editor, "ArrowUp")).toBe(true);
    expect(activeCellText(editor)).toBe("alphatail");
    expect(editor.state.selection.from).toBe(topCellEnd);
  });

  it("extends the bottom table boundary with ArrowDown into a new row", () => {
    const editor = createTableEditor();
    placeCursor(editor, "gamma", "end");

    expect(dispatchKey(editor, "ArrowDown")).toBe(true);

    expect(tableRows(editor)).toEqual([
      ["alphatail", "beta"],
      ["gamma", "delta"],
      ["", ""],
    ]);
    expect(getTableFocusState(editor.state)).toMatchObject({
      mode: "cell-cursor",
      selectedCellCount: 1,
    });
    expect(activeCellText(editor)).toBe("");

    editor.commands.insertContent("after-boundary");

    expect(tableRows(editor)).toEqual([
      ["alphatail", "beta"],
      ["gamma", "delta"],
      ["after-boundary", ""],
    ]);
  });

  it("extends a bottom-row CellSelection with Shift+ArrowDown into an appended row", () => {
    const editor = createTableEditor();
    placeCursor(editor, "gamma", "start");

    expect(runShiftArrow(editor, "ArrowDown")).toBe(true);

    expect(tableRows(editor)).toEqual([
      ["alphatail", "beta"],
      ["gamma", "delta"],
      ["", ""],
    ]);
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(getTableFocusState(editor.state)).toMatchObject({
      mode: "cell-selection",
      selectedCellCount: 2,
    });
    expect(selectedCellTexts(editor)).toEqual(["gamma", ""]);
  });

  it("exits the table at horizontal outer table edges as a local boundary baseline", () => {
    const editor = createTableEditor();
    placeCursor(editor, "alpha", "start");
    const firstCellStart = editor.state.selection.from;

    dispatchKey(editor, "ArrowLeft");
    expect(activeCellText(editor)).toBeNull();
    expect(editor.state.selection.from).toBeLessThan(firstCellStart);

    placeCursor(editor, "delta", "end");
    const finalCellEnd = editor.state.selection.from;

    dispatchKey(editor, "ArrowRight");
    expect(activeCellText(editor)).toBeNull();
    expect(editor.state.selection.from).toBeGreaterThan(finalCellEnd);
  });

  it("lets arrow keys fall through outside table cells", () => {
    const editor = createTableEditor();
    placeCursor(editor, "outside", "end");

    expect(dispatchKey(editor, "ArrowRight")).toBe(false);
  });

  it("moves horizontally across merged header cells", () => {
    const editor = createTableEditor(mergedTableFixture);
    placeCursor(editor, "Solo", "start");
    const soloStart = editor.state.selection.from;
    placeCursor(editor, "Merged Header", "end");
    const mergedHeaderEnd = editor.state.selection.from;

    expect(runArrow(editor, "ArrowRight")).toBe(true);
    expect(activeCellText(editor)).toBe("Solo");
    expect(editor.state.selection.from).toBe(soloStart);

    expect(runArrow(editor, "ArrowLeft")).toBe(true);
    expect(activeCellText(editor)).toBe("Merged Header");
    expect(editor.state.selection.from).toBe(mergedHeaderEnd);
  });

  it("moves horizontally around row-spanned cells using the cell anchor row", () => {
    const editor = createTableEditor(mergedTableFixture);
    placeCursor(editor, "D", "start");
    placeCursor(editor, "A", "end");
    const aEnd = editor.state.selection.from;
    placeCursor(editor, "B", "start");
    const bStart = editor.state.selection.from;
    placeCursor(editor, "D", "start");

    expect(runArrow(editor, "ArrowLeft")).toBe(true);
    expect(activeCellText(editor)).toBe("A");
    expect(editor.state.selection.from).toBe(aEnd);

    expect(runArrow(editor, "ArrowRight")).toBe(true);
    expect(activeCellText(editor)).toBe("B");
    expect(editor.state.selection.from).toBe(bStart);
  });

  it("moves vertically across merged table body cells", () => {
    const editor = createTableEditor(mergedTableFixture);
    placeCursor(editor, "D", "start");
    const dStart = editor.state.selection.from;
    placeCursor(editor, "B", "end");
    const bEnd = editor.state.selection.from;

    expect(runArrow(editor, "ArrowDown")).toBe(true);
    expect(activeCellText(editor)).toBe("D");
    expect(editor.state.selection.from).toBe(dStart);

    expect(runArrow(editor, "ArrowUp")).toBe(true);
    expect(activeCellText(editor)).toBe("B");
    expect(editor.state.selection.from).toBe(bEnd);
  });

  it("moves vertically through the right visual column in merged tables", () => {
    const editor = createTableEditor(mergedTableFixture);
    placeCursor(editor, "E", "start");
    const eStart = editor.state.selection.from;
    placeCursor(editor, "C", "end");
    const cEnd = editor.state.selection.from;

    expect(runArrow(editor, "ArrowDown")).toBe(true);
    expect(activeCellText(editor)).toBe("E");
    expect(editor.state.selection.from).toBe(eStart);

    expect(runArrow(editor, "ArrowUp")).toBe(true);
    expect(activeCellText(editor)).toBe("C");
    expect(editor.state.selection.from).toBe(cEnd);
  });

  it("lets vertical arrows fall through inside a hard-break multi-line cell", () => {
    const editor = createTableEditor(hardBreakTableFixture);
    placeCursor(editor, "top", "end");
    const afterTop = editor.state.selection.from;

    expect(runArrow(editor, "ArrowDown")).toBe(false);
    expect(activeCellText(editor)).toBe("topbottom");
    expect(editor.state.selection.from).toBe(afterTop);

    placeCursor(editor, "bottom", "start");
    const beforeBottom = editor.state.selection.from;

    expect(runArrow(editor, "ArrowUp")).toBe(false);
    expect(activeCellText(editor)).toBe("topbottom");
    expect(editor.state.selection.from).toBe(beforeBottom);
  });

  it("lets Shift+Arrow vertical text selection fall through inside a hard-break multi-line cell", () => {
    const editor = createTableEditor(hardBreakTableFixture);
    placeCursor(editor, "top", "end");
    const afterTop = editor.state.selection.from;

    expect(runShiftArrow(editor, "ArrowDown")).toBe(false);
    expect(editor.state.selection).not.toBeInstanceOf(CellSelection);
    expect(activeCellText(editor)).toBe("topbottom");
    expect(editor.state.selection.from).toBe(afterTop);

    placeCursor(editor, "bottom", "start");
    const beforeBottom = editor.state.selection.from;

    expect(runShiftArrow(editor, "ArrowUp")).toBe(false);
    expect(editor.state.selection).not.toBeInstanceOf(CellSelection);
    expect(activeCellText(editor)).toBe("topbottom");
    expect(editor.state.selection.from).toBe(beforeBottom);
  });

  it("moves vertically out of hard-break multi-line cells only at outer cell boundaries", () => {
    const editor = createTableEditor(hardBreakTableFixture);
    placeCursor(editor, "above-left", "end");
    const aboveEnd = editor.state.selection.from;
    placeCursor(editor, "below-left", "start");
    const belowStart = editor.state.selection.from;

    placeCursor(editor, "top", "start");
    expect(dispatchKey(editor, "ArrowUp")).toBe(true);
    expect(activeCellText(editor)).toBe("above-left");
    expect(editor.state.selection.from).toBe(aboveEnd);

    placeCursor(editor, "bottom", "end");
    expect(dispatchKey(editor, "ArrowDown")).toBe(true);
    expect(activeCellText(editor)).toBe("below-left");
    expect(editor.state.selection.from).toBe(belowStart);
  });
});
