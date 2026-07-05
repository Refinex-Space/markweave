// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { getMarkweaveMenuCopyPayloadFromState } from "../src/plugins/table/table-clipboard";
import { getTableFocusState } from "../src/plugins/table/table-focus-state";
import {
  canRunTableCommand,
  formatTableCopyFeedback,
  getAvailableCellMenuCommandSpecs,
  getTableAxisSelectionModel,
  getTableCopyFeedbackSnapshot,
  getTableCommandSnapshot,
  getTableEditWithAiRequest,
  runTableCommand,
  selectTableAxisFromCell,
  writeMarkweaveMenuPayloadToClipboard,
} from "../src/ui/table/TableControls";

const tableFixture = `
<table>
  <tbody>
    <tr>
      <th><p>Module</p></th>
      <th><p>Artifact</p></th>
      <th><p>Role</p></th>
    </tr>
    <tr>
      <td><p>agentscope-core</p></td>
      <td><p>io.agentscope:agentscope-core</p></td>
      <td><p>Reasoning</p></td>
    </tr>
    <tr>
      <td><p>agentscope-harness</p></td>
      <td><p>io.agentscope:agentscope-harness</p></td>
      <td><p>Workspace</p></td>
    </tr>
  </tbody>
</table>
`;

const colspannedHeaderFixture = `
<table>
  <tbody>
    <tr>
      <th colspan="2"><p>Merged Header</p></th>
      <th><p>Solo</p></th>
    </tr>
    <tr>
      <td><p>A</p></td>
      <td><p>B</p></td>
      <td><p>C</p></td>
    </tr>
    <tr>
      <td><p>D</p></td>
      <td><p>E</p></td>
      <td><p>F</p></td>
    </tr>
  </tbody>
</table>
`;

const rowspannedBodyFixture = `
<table>
  <tbody>
    <tr>
      <th><p>H1</p></th>
      <th><p>H2</p></th>
      <th><p>H3</p></th>
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

const mixedSpanFixture = `
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

const singleCellTableFixture = `
<table>
  <tbody>
    <tr>
      <td><p>only</p></td>
    </tr>
  </tbody>
</table>
`;

interface TableCellSnapshot {
  readonly pos: number;
  readonly text: string;
  readonly colspan: number;
  readonly rowspan: number;
}

let activeEditor: Editor | null = null;
let originalClipboardItemDescriptor: PropertyDescriptor | undefined;
let didStubClipboardItem = false;

function stubClipboardItem() {
  originalClipboardItemDescriptor = Object.getOwnPropertyDescriptor(globalThis, "ClipboardItem");
  didStubClipboardItem = true;
  Object.defineProperty(globalThis, "ClipboardItem", {
    value: class TestClipboardItem {
      constructor(readonly items: Record<string, Blob>) {}
    },
    configurable: true,
  });
}

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

function tableShape(editor: Editor) {
  let shape: { rows: number; columns: number; rowWidths: number[] } | null = null;

  editor.state.doc.descendants((node) => {
    if (node.type.name !== "table") {
      return true;
    }

    const rowWidths: number[] = [];
    node.forEach((row) => rowWidths.push(row.childCount));
    shape = {
      rows: node.childCount,
      columns: rowWidths[0] ?? 0,
      rowWidths,
    };
    return false;
  });

  if (!shape) {
    throw new Error("Expected a table node in the fixture.");
  }

  return shape;
}

function tableCount(editor: Editor) {
  let count = 0;

  editor.state.doc.descendants((node) => {
    if (node.type.name === "table") {
      count += 1;
    }

    return true;
  });

  return count;
}

function tableRows(editor: Editor) {
  const rows: TableCellSnapshot[][] = [];
  let foundTable = false;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "table") {
      return true;
    }

    foundTable = true;
    node.forEach((row, rowOffset) => {
      const rowStart = pos + 1 + rowOffset;
      const cells: TableCellSnapshot[] = [];

      row.forEach((cell, cellOffset) => {
        cells.push({
          pos: rowStart + 1 + cellOffset,
          text: cell.textContent,
          colspan: cell.attrs.colspan,
          rowspan: cell.attrs.rowspan,
        });
      });

      rows.push(cells);
    });

    return false;
  });

  if (!foundTable) {
    throw new Error("Expected a table node in the fixture.");
  }

  return rows;
}

function tableSnapshot(editor: Editor) {
  return tableRows(editor).map((row) =>
    row.map((cell) => ({
      text: cell.text,
      colspan: cell.colspan,
      rowspan: cell.rowspan,
    })),
  );
}

function tableTextRows(editor: Editor) {
  return tableRows(editor).map((row) => row.map((cell) => cell.text));
}

function placeCursorInCellText(editor: Editor, text: string) {
  const position = findTextSelectionPosition(editor, text);

  expect(editor.commands.setTextSelection(position)).toBe(true);
}

function findTextSelectionPosition(editor: Editor, text: string, offset = 0) {
  let position: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return true;
    }

    const offset = node.text.indexOf(text);
    if (offset < 0) {
      return true;
    }

    position = pos + offset + 1;
    return false;
  });

  if (position === null) {
    throw new Error(`Expected text "${text}" in the table fixture.`);
  }

  return position;
}

function selectTextRangeInCell(editor: Editor, text: string, length: number) {
  const from = findTextSelectionPosition(editor, text);

  expect(editor.commands.setTextSelection({ from, to: from + length })).toBe(true);
}

function selectCellRange(editor: Editor, anchorText: string, headText: string) {
  const cells = tableRows(editor).flat();
  const anchorCell = cells.find((cell) => cell.text.includes(anchorText));
  const headCell = cells.find((cell) => cell.text.includes(headText));

  if (!anchorCell || !headCell) {
    throw new Error(`Expected cells containing "${anchorText}" and "${headText}".`);
  }

  expect(editor.commands.setCellSelection({ anchorCell: anchorCell.pos, headCell: headCell.pos })).toBe(true);
}

function cellByText(editor: Editor, text: string) {
  const cell = tableRows(editor)
    .flat()
    .find((snapshot) => snapshot.text.includes(text));

  if (!cell) {
    throw new Error(`Expected cell containing "${text}".`);
  }

  return cell;
}

function focusedCellSnapshot(editor: Editor) {
  const focusState = getTableFocusState(editor.state);
  const cell = tableRows(editor)
    .flat()
    .find((snapshot) => snapshot.pos === focusState.activeCellPos);

  if (!cell) {
    throw new Error(`Expected focused table cell at ${focusState.activeCellPos}.`);
  }

  return {
    focusState,
    cell,
  };
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();

  if (didStubClipboardItem) {
    if (originalClipboardItemDescriptor) {
      Object.defineProperty(globalThis, "ClipboardItem", originalClipboardItemDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "ClipboardItem");
    }

    didStubClipboardItem = false;
    originalClipboardItemDescriptor = undefined;
  }
});

describe("table command structure", () => {
  it("falls back to plain text when rich menu copy is rejected", async () => {
    stubClipboardItem();

    const writes: string[] = [];
    const result = await writeMarkweaveMenuPayloadToClipboard(
      {
        kind: "row",
        text: "core\tio.core",
        html: "<table><tbody><tr><td>core</td><td>io.core</td></tr></tbody></table>",
      },
      {
        write: async () => {
          throw new Error("NotAllowedError");
        },
        writeText: async (text) => {
          writes.push(text);
        },
      },
    );

    expect(result).toBe(true);
    expect(writes).toEqual(["core\tio.core"]);
  });

  it("does not invent plain text when an HTML-only menu copy is rejected", async () => {
    stubClipboardItem();

    const writes: string[] = [];
    const result = await writeMarkweaveMenuPayloadToClipboard(
      {
        kind: "table",
        text: "",
        html: "<table><tbody><tr><td>core</td></tr></tbody></table>",
      },
      {
        write: async () => {
          throw new Error("NotAllowedError");
        },
        writeText: async (text) => {
          writes.push(text);
        },
      },
    );

    expect(result).toBe(false);
    expect(writes).toEqual([]);
  });

  it("formats table menu copy feedback from the real serialized payload", () => {
    const editor = createTableEditor(rowspannedBodyFixture);
    const secondVisualBodyRowCell = cellByText(editor, "D");

    expect(selectTableAxisFromCell(editor, secondVisualBodyRowCell.pos, "row")).toBe(true);
    const payload = getMarkweaveMenuCopyPayloadFromState(editor.state, "row");

    expect(payload?.text).toBe("\tD\tE");
    expect(payload?.html.length).toBeGreaterThan(100);
    if (!payload) {
      throw new Error("Expected row copy payload.");
    }

    const feedback = getTableCopyFeedbackSnapshot(payload);
    expect(feedback).toMatchObject({
      kind: "row",
      label: "Row copied to clipboard",
      textLength: 4,
    });
    expect(feedback.htmlLength).toBe(payload.html.length);
    expect(formatTableCopyFeedback(feedback)).toBe(`Row copied to clipboard | text 4 | html ${payload.html.length}`);
  });

  it("builds Edit with AI requests without mutating table content", () => {
    const editor = createTableEditor();
    const bodyRowCell = cellByText(editor, "agentscope-harness");

    expect(selectTableAxisFromCell(editor, bodyRowCell.pos, "row")).toBe(true);
    const rowSelectionHtml = editor.getHTML();
    const rowRequest = getTableEditWithAiRequest(editor, "row");

    expect(rowRequest).toMatchObject({
      source: "row",
      axisIndex: 2,
      text: "agentscope-harness\tio.agentscope:agentscope-harness\tWorkspace",
    });
    expect(rowRequest?.cellPositions).toHaveLength(3);
    expect(rowRequest?.html).toContain("<table");
    expect(editor.getHTML()).toBe(rowSelectionHtml);

    selectCellRange(editor, "agentscope-core", "io.agentscope:agentscope-core");
    const cellSelectionHtml = editor.getHTML();
    const selectionRequest = getTableEditWithAiRequest(editor, "selection");

    expect(selectionRequest).toMatchObject({
      source: "selection",
      axisIndex: null,
      text: "agentscope-core\n\nio.agentscope:agentscope-core",
    });
    expect(selectionRequest?.cellPositions).toHaveLength(2);
    expect(selectionRequest?.html).toContain("<table");
    expect(editor.getHTML()).toBe(cellSelectionHtml);
  });

  it("exposes table command snapshots for playground-visible command feedback", () => {
    const editor = createTableEditor();
    placeCursorInCellText(editor, "io.agentscope:agentscope-harness");

    expect(getTableCommandSnapshot(editor)).toMatchObject({
      tableCount: 1,
      rowCount: 3,
      visualWidth: 3,
      focusMode: "cell-cursor",
      selectedCellCount: 1,
    });

    expect(runTableCommand(editor, "delete-row")).toBe(true);
    expect(getTableCommandSnapshot(editor)).toMatchObject({
      tableCount: 1,
      rowCount: 2,
      visualWidth: 3,
      focusMode: "cell-cursor",
      selectedCellCount: 1,
    });

    expect(runTableCommand(editor, "delete-table")).toBe(true);
    expect(getTableCommandSnapshot(editor)).toMatchObject({
      tableCount: 0,
      rowCount: 0,
      visualWidth: 0,
    });
  });

  it("adds columns before and after the active cell without changing row count", () => {
    const editor = createTableEditor();
    placeCursorInCellText(editor, "io.agentscope:agentscope-core");

    expect(tableShape(editor)).toEqual({ rows: 3, columns: 3, rowWidths: [3, 3, 3] });
    expect(runTableCommand(editor, "add-column-before")).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 4, rowWidths: [4, 4, 4] });
    expect(focusedCellSnapshot(editor).focusState.mode).toBe("cell-cursor");
    expect(focusedCellSnapshot(editor).cell.text).toBe("io.agentscope:agentscope-core");
    expect(runTableCommand(editor, "add-column-after")).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 5, rowWidths: [5, 5, 5] });
    expect(focusedCellSnapshot(editor).focusState.mode).toBe("cell-cursor");
    expect(focusedCellSnapshot(editor).cell.text).toBe("io.agentscope:agentscope-core");
  });

  it("deletes the active column while preserving a valid rectangular table", () => {
    const editor = createTableEditor();
    placeCursorInCellText(editor, "io.agentscope:agentscope-core");

    expect(runTableCommand(editor, "delete-column")).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 2, rowWidths: [2, 2, 2] });
    expect(focusedCellSnapshot(editor).focusState.mode).toBe("cell-cursor");
    expect(focusedCellSnapshot(editor).cell.text).toBe("Reasoning");
  });

  it("adds and deletes rows around the active cell", () => {
    const editor = createTableEditor();
    placeCursorInCellText(editor, "io.agentscope:agentscope-harness");

    expect(tableShape(editor)).toEqual({ rows: 3, columns: 3, rowWidths: [3, 3, 3] });
    expect(runTableCommand(editor, "add-row-before")).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 4, columns: 3, rowWidths: [3, 3, 3, 3] });
    expect(focusedCellSnapshot(editor).focusState.mode).toBe("cell-cursor");
    expect(focusedCellSnapshot(editor).cell.text).toBe("io.agentscope:agentscope-harness");
    expect(runTableCommand(editor, "add-row-after")).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 5, columns: 3, rowWidths: [3, 3, 3, 3, 3] });
    expect(focusedCellSnapshot(editor).focusState.mode).toBe("cell-cursor");
    expect(focusedCellSnapshot(editor).cell.text).toBe("io.agentscope:agentscope-harness");
    expect(runTableCommand(editor, "delete-row")).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 4, columns: 3, rowWidths: [3, 3, 3, 3] });
    expect(focusedCellSnapshot(editor).focusState.mode).toBe("cell-cursor");
    expect(focusedCellSnapshot(editor).cell.text).toBe("");
  });

  it("moves active rows up and down as structural table commands", () => {
    const editor = createTableEditor();
    placeCursorInCellText(editor, "agentscope-harness");
    const initialSnapshot = tableSnapshot(editor);

    expect(runTableCommand(editor, "move-row-up")).toBe(true);
    expect(tableTextRows(editor).map((row) => row[0])).toEqual(["Module", "agentscope-harness", "agentscope-core"]);
    expect(focusedCellSnapshot(editor).focusState.active).toBe(true);

    expect(editor.commands.undo()).toBe(true);
    expect(tableSnapshot(editor)).toEqual(initialSnapshot);

    expect(editor.commands.redo()).toBe(true);
    expect(tableTextRows(editor).map((row) => row[0])).toEqual(["Module", "agentscope-harness", "agentscope-core"]);

    expect(runTableCommand(editor, "move-row-down")).toBe(true);
    expect(tableTextRows(editor).map((row) => row[0])).toEqual(["Module", "agentscope-core", "agentscope-harness"]);
  });

  it("moves active columns left and right as structural table commands", () => {
    const editor = createTableEditor();
    placeCursorInCellText(editor, "Role");
    const initialSnapshot = tableSnapshot(editor);

    expect(runTableCommand(editor, "move-column-left")).toBe(true);
    expect(tableTextRows(editor)[0]).toEqual(["Module", "Role", "Artifact"]);
    expect(tableTextRows(editor)[1]).toEqual(["agentscope-core", "Reasoning", "io.agentscope:agentscope-core"]);
    expect(focusedCellSnapshot(editor).focusState.active).toBe(true);

    expect(editor.commands.undo()).toBe(true);
    expect(tableSnapshot(editor)).toEqual(initialSnapshot);

    expect(editor.commands.redo()).toBe(true);
    expect(tableTextRows(editor)[0]).toEqual(["Module", "Role", "Artifact"]);

    expect(runTableCommand(editor, "move-column-right")).toBe(true);
    expect(tableTextRows(editor)[0]).toEqual(["Module", "Artifact", "Role"]);
  });

  it("selects whole hovered rows and columns before edge-handle menus run commands", () => {
    const rowEditor = createTableEditor();
    const rowCell = cellByText(rowEditor, "io.agentscope:agentscope-core");

    expect(selectTableAxisFromCell(rowEditor, rowCell.pos, "row")).toBe(true);
    expect(getTableFocusState(rowEditor.state)).toMatchObject({
      mode: "cell-selection",
      selectedCellCount: 3,
    });
    expect(rowEditor.state.selection).toBeInstanceOf(CellSelection);
    expect((rowEditor.state.selection as CellSelection).isRowSelection()).toBe(true);
    expect(runTableCommand(rowEditor, "move-row-down")).toBe(true);
    expect(tableTextRows(rowEditor).map((row) => row[0])).toEqual(["Module", "agentscope-harness", "agentscope-core"]);

    rowEditor.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const columnEditor = createTableEditor();
    const columnCell = cellByText(columnEditor, "io.agentscope:agentscope-core");

    expect(selectTableAxisFromCell(columnEditor, columnCell.pos, "column")).toBe(true);
    expect(getTableFocusState(columnEditor.state)).toMatchObject({
      mode: "cell-selection",
      selectedCellCount: 3,
    });
    expect(columnEditor.state.selection).toBeInstanceOf(CellSelection);
    expect((columnEditor.state.selection as CellSelection).isColSelection()).toBe(true);
    expect(runTableCommand(columnEditor, "move-column-right")).toBe(true);
    expect(tableTextRows(columnEditor)[0]).toEqual(["Module", "Role", "Artifact"]);
  });

  it("keeps edge column menu copy target on the hovered visual column when headers span columns", () => {
    const editor = createTableEditor(colspannedHeaderFixture);
    const secondVisualColumnCell = cellByText(editor, "B");

    expect(getTableAxisSelectionModel(editor, cellByText(editor, "Merged Header").pos, "column", { visualIndex: 1 })).toMatchObject({
      axis: "column",
      index: 1,
      visualWidth: 3,
      visualHeight: 3,
      selectedCellCount: 2,
      visualCellCount: 3,
    });
    expect(selectTableAxisFromCell(editor, secondVisualColumnCell.pos, "column")).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect((editor.state.selection as CellSelection).isColSelection()).toBe(true);
    expect(getMarkweaveMenuCopyPayloadFromState(editor.state, "column")?.text).toBe("Merged Header\nB\nE");
  });

  it("keeps edge row menu copy target on the hovered visual row when cells span rows", () => {
    const editor = createTableEditor(rowspannedBodyFixture);
    const rowspannedCell = cellByText(editor, "A");
    const secondVisualBodyRowCell = cellByText(editor, "D");

    expect(getTableAxisSelectionModel(editor, rowspannedCell.pos, "row", { visualIndex: 2 })).toMatchObject({
      axis: "row",
      index: 2,
      visualWidth: 3,
      visualHeight: 3,
      selectedCellCount: 2,
      visualCellCount: 3,
    });
    expect(selectTableAxisFromCell(editor, rowspannedCell.pos, "row", { visualIndex: 2 })).toBe(true);
    expect(getMarkweaveMenuCopyPayloadFromState(editor.state, "row")?.text).toBe("\tD\tE");

    expect(selectTableAxisFromCell(editor, secondVisualBodyRowCell.pos, "row")).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect((editor.state.selection as CellSelection).isRowSelection()).toBe(true);
    expect(getMarkweaveMenuCopyPayloadFromState(editor.state, "row")?.text).toBe("\tD\tE");
  });

  it("deletes only the hovered visual column from edge menus when a header spans columns", () => {
    const editor = createTableEditor(colspannedHeaderFixture);
    const secondVisualColumnCell = cellByText(editor, "B");

    expect(selectTableAxisFromCell(editor, secondVisualColumnCell.pos, "column")).toBe(true);
    expect(runTableCommand(editor, "delete-column")).toBe(true);
    expect(tableSnapshot(editor)).toEqual([
      [
        { text: "Merged Header", colspan: 1, rowspan: 1 },
        { text: "Solo", colspan: 1, rowspan: 1 },
      ],
      [
        { text: "A", colspan: 1, rowspan: 1 },
        { text: "C", colspan: 1, rowspan: 1 },
      ],
      [
        { text: "D", colspan: 1, rowspan: 1 },
        { text: "F", colspan: 1, rowspan: 1 },
      ],
    ]);
  });

  it("deletes only the hovered visual row from edge menus when a cell spans rows", () => {
    const editor = createTableEditor(rowspannedBodyFixture);
    const secondVisualBodyRowCell = cellByText(editor, "D");

    expect(selectTableAxisFromCell(editor, secondVisualBodyRowCell.pos, "row")).toBe(true);
    expect(runTableCommand(editor, "delete-row")).toBe(true);
    expect(tableSnapshot(editor)).toEqual([
      [
        { text: "H1", colspan: 1, rowspan: 1 },
        { text: "H2", colspan: 1, rowspan: 1 },
        { text: "H3", colspan: 1, rowspan: 1 },
      ],
      [
        { text: "A", colspan: 1, rowspan: 1 },
        { text: "B", colspan: 1, rowspan: 1 },
        { text: "C", colspan: 1, rowspan: 1 },
      ],
    ]);
  });

  it("inserts a visual column before the hovered edge column inside a colspanned header", () => {
    const editor = createTableEditor(colspannedHeaderFixture);
    const secondVisualColumnCell = cellByText(editor, "B");

    expect(selectTableAxisFromCell(editor, secondVisualColumnCell.pos, "column")).toBe(true);
    expect(runTableCommand(editor, "add-column-before")).toBe(true);
    expect(tableSnapshot(editor)).toEqual([
      [
        { text: "Merged Header", colspan: 3, rowspan: 1 },
        { text: "Solo", colspan: 1, rowspan: 1 },
      ],
      [
        { text: "A", colspan: 1, rowspan: 1 },
        { text: "", colspan: 1, rowspan: 1 },
        { text: "B", colspan: 1, rowspan: 1 },
        { text: "C", colspan: 1, rowspan: 1 },
      ],
      [
        { text: "D", colspan: 1, rowspan: 1 },
        { text: "", colspan: 1, rowspan: 1 },
        { text: "E", colspan: 1, rowspan: 1 },
        { text: "F", colspan: 1, rowspan: 1 },
      ],
    ]);
  });

  it("keeps moving a col-spanned edge column across its source span as a stable no-op", () => {
    const editor = createTableEditor(colspannedHeaderFixture);
    const initialSnapshot = tableSnapshot(editor);
    const secondVisualColumnCell = cellByText(editor, "B");

    expect(selectTableAxisFromCell(editor, secondVisualColumnCell.pos, "column")).toBe(true);
    expect(canRunTableCommand(editor, "move-column-left")).toBe(false);
    expect(runTableCommand(editor, "move-column-left")).toBe(false);
    expect(canRunTableCommand(editor, "move-column-right")).toBe(false);
    expect(runTableCommand(editor, "move-column-right")).toBe(false);
    expect(tableSnapshot(editor)).toEqual(initialSnapshot);
  });

  it("keeps mixed-span column edge commands on the targeted visual column", () => {
    const editor = createTableEditor(mixedSpanFixture);
    const secondVisualColumnCell = cellByText(editor, "B");

    expect(selectTableAxisFromCell(editor, secondVisualColumnCell.pos, "column")).toBe(true);
    expect(getMarkweaveMenuCopyPayloadFromState(editor.state, "column")?.text).toBe("Merged Header\nB\nD");
    expect(canRunTableCommand(editor, "move-column-left")).toBe(false);
    expect(canRunTableCommand(editor, "move-column-right")).toBe(false);
    expect(runTableCommand(editor, "delete-column")).toBe(true);
    expect(tableSnapshot(editor)).toEqual([
      [
        { text: "Merged Header", colspan: 1, rowspan: 1 },
        { text: "Solo", colspan: 1, rowspan: 1 },
      ],
      [
        { text: "A", colspan: 1, rowspan: 2 },
        { text: "C", colspan: 1, rowspan: 1 },
      ],
      [{ text: "E", colspan: 1, rowspan: 1 }],
    ]);
  });

  it("keeps moving a row-spanned edge row over its source span as a stable no-op", () => {
    const editor = createTableEditor(rowspannedBodyFixture);
    const initialSnapshot = tableSnapshot(editor);
    const secondVisualBodyRowCell = cellByText(editor, "D");

    expect(selectTableAxisFromCell(editor, secondVisualBodyRowCell.pos, "row")).toBe(true);
    expect(canRunTableCommand(editor, "move-row-up")).toBe(false);
    expect(runTableCommand(editor, "move-row-up")).toBe(false);
    expect(tableSnapshot(editor)).toEqual(initialSnapshot);
  });

  it("keeps row and column boundary moves as stable no-ops", () => {
    const rowBoundary = createTableEditor();
    placeCursorInCellText(rowBoundary, "agentscope-harness");
    expect(canRunTableCommand(rowBoundary, "move-row-down")).toBe(false);
    expect(runTableCommand(rowBoundary, "move-row-down")).toBe(false);
    expect(tableTextRows(rowBoundary).map((row) => row[0])).toEqual(["Module", "agentscope-core", "agentscope-harness"]);
    rowBoundary.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const columnBoundary = createTableEditor();
    placeCursorInCellText(columnBoundary, "Role");
    expect(canRunTableCommand(columnBoundary, "move-column-right")).toBe(false);
    expect(runTableCommand(columnBoundary, "move-column-right")).toBe(false);
    expect(tableTextRows(columnBoundary)[0]).toEqual(["Module", "Artifact", "Role"]);
  });

  it("disables destructive row and column menu commands when the table cannot shrink", () => {
    const editor = createTableEditor(singleCellTableFixture);
    placeCursorInCellText(editor, "only");

    expect(canRunTableCommand(editor, "delete-row")).toBe(false);
    expect(canRunTableCommand(editor, "delete-column")).toBe(false);
    expect(runTableCommand(editor, "delete-row")).toBe(false);
    expect(runTableCommand(editor, "delete-column")).toBe(false);
    expect(tableShape(editor)).toEqual({ rows: 1, columns: 1, rowWidths: [1] });
  });

  it("merges and splits selected body cells while preserving table validity", () => {
    const editor = createTableEditor();
    selectCellRange(editor, "agentscope-core", "io.agentscope:agentscope-core");
    const focusSpy = vi.spyOn(editor.view, "focus");

    expect(runTableCommand(editor, "merge-cells")).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 3, rowWidths: [3, 2, 3] });
    expect(focusSpy).toHaveBeenCalled();

    const mergedRows = tableRows(editor);
    const mergedFocus = focusedCellSnapshot(editor);
    expect(mergedFocus.focusState.mode).toBe("cell-selection");
    expect(mergedFocus.focusState.selectedCellCount).toBe(1);
    expect(mergedFocus.cell.colspan).toBe(2);
    expect(mergedFocus.cell.rowspan).toBe(1);
    expect(mergedFocus.cell.text).toContain("agentscope-core");
    expect(mergedFocus.cell.text).toContain("io.agentscope:agentscope-core");
    expect(mergedRows[1][0].colspan).toBe(2);
    expect(mergedRows[1][0].rowspan).toBe(1);
    expect(mergedRows[1][0].text).toContain("agentscope-core");
    expect(mergedRows[1][0].text).toContain("io.agentscope:agentscope-core");

    focusSpy.mockClear();
    expect(runTableCommand(editor, "split-cell")).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 3, rowWidths: [3, 3, 3] });
    expect(focusSpy).toHaveBeenCalled();

    const splitRows = tableRows(editor);
    const splitFocus = focusedCellSnapshot(editor);
    expect(splitFocus.focusState.mode).toBe("cell-selection");
    expect(splitFocus.focusState.selectedCellCount).toBe(2);
    expect(splitFocus.cell.colspan).toBe(1);
    expect(splitFocus.cell.rowspan).toBe(1);
    expect(splitFocus.cell.text).toBe("");
    expect(splitRows[1].map((cell) => cell.colspan)).toEqual([1, 1, 1]);
    expect(splitRows[1].map((cell) => cell.rowspan)).toEqual([1, 1, 1]);
  });

  it("exposes cell menu commands only when Merge or Split can actually run", () => {
    const editor = createTableEditor();
    placeCursorInCellText(editor, "agentscope-core");

    expect(canRunTableCommand(editor, "merge-cells")).toBe(false);
    expect(canRunTableCommand(editor, "split-cell")).toBe(false);
    expect(getAvailableCellMenuCommandSpecs(editor).map((command) => command.id)).toEqual([]);

    selectCellRange(editor, "agentscope-core", "io.agentscope:agentscope-core");
    expect(canRunTableCommand(editor, "merge-cells")).toBe(true);
    expect(canRunTableCommand(editor, "split-cell")).toBe(false);
    expect(getAvailableCellMenuCommandSpecs(editor).map((command) => command.id)).toEqual(["merge-cells"]);

    expect(runTableCommand(editor, "merge-cells")).toBe(true);
    expect(canRunTableCommand(editor, "merge-cells")).toBe(false);
    expect(canRunTableCommand(editor, "split-cell")).toBe(true);
    expect(getAvailableCellMenuCommandSpecs(editor).map((command) => command.id)).toEqual(["split-cell"]);
  });

  it("does not expose Merge for an inline text range inside a table cell", () => {
    const editor = createTableEditor();
    selectTextRangeInCell(editor, "agentscope-core", 6);

    expect(getTableFocusState(editor.state).mode).toBe("cell-text-range");
    expect(canRunTableCommand(editor, "merge-cells")).toBe(false);
    expect(runTableCommand(editor, "merge-cells")).toBe(false);
    expect(getAvailableCellMenuCommandSpecs(editor).map((command) => command.id)).toEqual([]);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 3, rowWidths: [3, 3, 3] });
  });

  it("splits a merged active cell from cursor mode while preserving table focus", () => {
    const editor = createTableEditor(colspannedHeaderFixture);
    placeCursorInCellText(editor, "Merged Header");

    expect(getTableFocusState(editor.state).mode).toBe("cell-cursor");
    expect(canRunTableCommand(editor, "merge-cells")).toBe(false);
    expect(canRunTableCommand(editor, "split-cell")).toBe(true);
    expect(getAvailableCellMenuCommandSpecs(editor).map((command) => command.id)).toEqual(["split-cell"]);

    expect(runTableCommand(editor, "split-cell")).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 3, rowWidths: [3, 3, 3] });
    expect(tableSnapshot(editor)[0]).toEqual([
      { text: "Merged Header", colspan: 1, rowspan: 1 },
      { text: "", colspan: 1, rowspan: 1 },
      { text: "Solo", colspan: 1, rowspan: 1 },
    ]);
    expect(focusedCellSnapshot(editor).focusState.active).toBe(true);
    expect(focusedCellSnapshot(editor).cell.text).toBe("Merged Header");
  });

  for (const command of ["add-column-before", "add-column-after"] as const) {
    it(`undoes and redoes ${command} as one structural history step`, () => {
      const editor = createTableEditor();
      placeCursorInCellText(editor, "io.agentscope:agentscope-core");
      const initialSnapshot = tableSnapshot(editor);

      expect(runTableCommand(editor, command)).toBe(true);
      const insertedSnapshot = tableSnapshot(editor);
      expect(tableShape(editor)).toEqual({ rows: 3, columns: 4, rowWidths: [4, 4, 4] });

      expect(editor.commands.undo()).toBe(true);
      expect(tableShape(editor)).toEqual({ rows: 3, columns: 3, rowWidths: [3, 3, 3] });
      expect(tableSnapshot(editor)).toEqual(initialSnapshot);
      expect(focusedCellSnapshot(editor).focusState.active).toBe(true);

      expect(editor.commands.redo()).toBe(true);
      expect(tableShape(editor)).toEqual({ rows: 3, columns: 4, rowWidths: [4, 4, 4] });
      expect(tableSnapshot(editor)).toEqual(insertedSnapshot);
      expect(focusedCellSnapshot(editor).focusState.active).toBe(true);
    });
  }

  for (const command of ["move-row-up", "move-row-down"] as const) {
    it(`undoes and redoes ${command} as one focused structural history step`, () => {
      const editor = createTableEditor();
      placeCursorInCellText(editor, command === "move-row-up" ? "agentscope-harness" : "agentscope-core");
      const initialSnapshot = tableSnapshot(editor);

      expect(runTableCommand(editor, command)).toBe(true);
      const movedSnapshot = tableSnapshot(editor);
      expect(movedSnapshot).not.toEqual(initialSnapshot);
      expect(focusedCellSnapshot(editor).focusState.active).toBe(true);

      expect(editor.commands.undo()).toBe(true);
      expect(tableSnapshot(editor)).toEqual(initialSnapshot);
      expect(focusedCellSnapshot(editor).focusState.active).toBe(true);

      expect(editor.commands.redo()).toBe(true);
      expect(tableSnapshot(editor)).toEqual(movedSnapshot);
      expect(focusedCellSnapshot(editor).focusState.active).toBe(true);
    });
  }

  for (const command of ["move-column-left", "move-column-right"] as const) {
    it(`undoes and redoes ${command} as one focused structural history step`, () => {
      const editor = createTableEditor();
      placeCursorInCellText(editor, command === "move-column-left" ? "Role" : "Artifact");
      const initialSnapshot = tableSnapshot(editor);

      expect(runTableCommand(editor, command)).toBe(true);
      const movedSnapshot = tableSnapshot(editor);
      expect(movedSnapshot).not.toEqual(initialSnapshot);
      expect(focusedCellSnapshot(editor).focusState.active).toBe(true);

      expect(editor.commands.undo()).toBe(true);
      expect(tableSnapshot(editor)).toEqual(initialSnapshot);
      expect(focusedCellSnapshot(editor).focusState.active).toBe(true);

      expect(editor.commands.redo()).toBe(true);
      expect(tableSnapshot(editor)).toEqual(movedSnapshot);
      expect(focusedCellSnapshot(editor).focusState.active).toBe(true);
    });
  }

  it("undoes and redoes delete-column as one structural history step", () => {
    const editor = createTableEditor();
    placeCursorInCellText(editor, "io.agentscope:agentscope-core");
    const initialSnapshot = tableSnapshot(editor);

    expect(runTableCommand(editor, "delete-column")).toBe(true);
    const deletedSnapshot = tableSnapshot(editor);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 2, rowWidths: [2, 2, 2] });
    expect(focusedCellSnapshot(editor).focusState.active).toBe(true);

    expect(editor.commands.undo()).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 3, rowWidths: [3, 3, 3] });
    expect(tableSnapshot(editor)).toEqual(initialSnapshot);
    expect(focusedCellSnapshot(editor).focusState.active).toBe(true);

    expect(editor.commands.redo()).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 2, rowWidths: [2, 2, 2] });
    expect(tableSnapshot(editor)).toEqual(deletedSnapshot);
    expect(focusedCellSnapshot(editor).focusState.active).toBe(true);
  });

  it("undoes and redoes delete-row as one structural history step", () => {
    const editor = createTableEditor();
    placeCursorInCellText(editor, "io.agentscope:agentscope-harness");
    const initialSnapshot = tableSnapshot(editor);

    expect(runTableCommand(editor, "delete-row")).toBe(true);
    const deletedSnapshot = tableSnapshot(editor);
    expect(tableShape(editor)).toEqual({ rows: 2, columns: 3, rowWidths: [3, 3] });
    expect(focusedCellSnapshot(editor).focusState.active).toBe(true);

    expect(editor.commands.undo()).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 3, rowWidths: [3, 3, 3] });
    expect(tableSnapshot(editor)).toEqual(initialSnapshot);
    expect(focusedCellSnapshot(editor).focusState.active).toBe(true);

    expect(editor.commands.redo()).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 2, columns: 3, rowWidths: [3, 3] });
    expect(tableSnapshot(editor)).toEqual(deletedSnapshot);
    expect(focusedCellSnapshot(editor).focusState.active).toBe(true);
  });

  it("deletes the whole active table as one undoable structural step", () => {
    const editor = createTableEditor();
    placeCursorInCellText(editor, "io.agentscope:agentscope-core");
    const initialSnapshot = tableSnapshot(editor);

    expect(runTableCommand(editor, "delete-table")).toBe(true);
    expect(tableCount(editor)).toBe(0);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.state.doc.textContent).toBe("");

    expect(editor.commands.undo()).toBe(true);
    expect(tableCount(editor)).toBe(1);
    expect(tableSnapshot(editor)).toEqual(initialSnapshot);
    expect(focusedCellSnapshot(editor).focusState.active).toBe(true);

    expect(editor.commands.redo()).toBe(true);
    expect(tableCount(editor)).toBe(0);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
  });

  it("undoes and redoes merge and split table history steps", () => {
    const editor = createTableEditor();
    selectCellRange(editor, "agentscope-core", "io.agentscope:agentscope-core");
    const initialSnapshot = tableSnapshot(editor);

    expect(runTableCommand(editor, "merge-cells")).toBe(true);
    const mergedSnapshot = tableSnapshot(editor);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 3, rowWidths: [3, 2, 3] });

    expect(editor.commands.undo()).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 3, rowWidths: [3, 3, 3] });
    expect(tableSnapshot(editor)).toEqual(initialSnapshot);

    expect(editor.commands.redo()).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 3, rowWidths: [3, 2, 3] });
    expect(tableSnapshot(editor)).toEqual(mergedSnapshot);

    expect(runTableCommand(editor, "split-cell")).toBe(true);
    const splitSnapshot = tableSnapshot(editor);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 3, rowWidths: [3, 3, 3] });

    expect(editor.commands.undo()).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 3, rowWidths: [3, 2, 3] });
    expect(tableSnapshot(editor)).toEqual(mergedSnapshot);

    expect(editor.commands.redo()).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 3, columns: 3, rowWidths: [3, 3, 3] });
    expect(tableSnapshot(editor)).toEqual(splitSnapshot);
    expect(focusedCellSnapshot(editor).focusState.active).toBe(true);
  });
});
