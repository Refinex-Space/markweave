// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { Slice } from "prosemirror-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { getTableFocusState } from "../src/plugins/table/table-focus-state";
import {
  getMarkweaveMenuCopyPayloadFromState,
  parsedClipboardTableToMarkweaveMenuHtml,
  parsedClipboardTableToMarkweaveSelectionText,
  parsedClipboardTableToHtml,
  parsedClipboardTableToMarkdown,
  parsedClipboardTableToTsv,
  parseCurrentTableFromState,
  parseClipboardTable,
  parseCellSelectionTable,
  parseHtmlTable,
  parseMarkdownTable,
  parseTsvTable,
  runMarkweaveTableCopy,
  runMarkweaveTablePaste,
  toMarkweaveMenuCopyPayload,
} from "../src/plugins/table/table-clipboard";

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

let activeEditor: Editor | null = null;

function createPasteEditor() {
  const element = document.createElement("div");
  document.body.appendChild(element);

  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions(),
    content: "<p>Paste target</p>",
  });

  activeEditor.commands.setTextSelection(1);
  return activeEditor;
}

function createTableEditor() {
  const element = document.createElement("div");
  document.body.appendChild(element);

  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions(),
    content: tableFixture,
  });

  return activeEditor;
}

function dispatchPaste(editor: Editor, payload: Record<string, string>) {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (type: string) => payload[type] ?? "",
    },
  });

  let handled = false;
  editor.view.someProp("handlePaste", (handler) => {
    const didHandle = handler(editor.view, event, Slice.empty) === true;
    handled = handled || didHandle;
    return didHandle;
  });

  return { handled, defaultPrevented: event.defaultPrevented };
}

function dispatchCopy(editor: Editor) {
  const writes = new Map<string, string>();
  const event = new Event("copy", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      setData: (type: string, value: string) => writes.set(type, value),
    },
  });

  let handled = false;
  editor.view.someProp("handleDOMEvents", (handlers) => {
    const didHandle = handlers.copy?.(editor.view, event) === true;
    handled = handled || didHandle;
    return didHandle;
  });

  return { handled, defaultPrevented: event.defaultPrevented, writes };
}

function tableCells(editor: Editor) {
  const cells: Array<{ pos: number; text: string }> = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") {
      return true;
    }

    cells.push({ pos, text: node.textContent });
    return false;
  });

  return cells;
}

function tableCellBlocks(editor: Editor) {
  const cells: Array<{ pos: number; text: string; blocks: string[] }> = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") {
      return true;
    }

    const blocks: string[] = [];
    node.forEach((child) => blocks.push(child.textContent));
    cells.push({ pos, text: node.textContent, blocks });
    return false;
  });

  return cells;
}

function tableCellAttrs(editor: Editor) {
  const cells: Array<{ text: string; attrs: Record<string, unknown> }> = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") {
      return true;
    }

    cells.push({ text: node.textContent, attrs: node.attrs });
    return false;
  });

  return cells;
}

function activeTableCellText(editor: Editor) {
  const focusState = getTableFocusState(editor.state);
  const activeCell = tableCells(editor).find((cell) => cell.pos === focusState.activeCellPos);

  return {
    focusState,
    text: activeCell?.text ?? null,
  };
}

function selectCellRange(editor: Editor, anchorText: string, headText: string) {
  const cells = tableCells(editor);
  const anchorCell = cells.find((cell) => cell.text.includes(anchorText));
  const headCell = cells.find((cell) => cell.text.includes(headText));

  if (!anchorCell || !headCell) {
    throw new Error(`Expected cells containing "${anchorText}" and "${headText}".`);
  }

  expect(editor.commands.setCellSelection({ anchorCell: anchorCell.pos, headCell: headCell.pos })).toBe(true);
}

function tableShape(editor: Editor) {
  const shapes: Array<{ rows: number; columns: number; rowWidths: number[] }> = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name !== "table") {
      return true;
    }

    const rowWidths: number[] = [];
    node.forEach((row) => rowWidths.push(row.childCount));
    shapes.push({
      rows: node.childCount,
      columns: rowWidths[0] ?? 0,
      rowWidths,
    });
    return false;
  });

  return shapes;
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("table clipboard parsing", () => {
  it("parses HTML tables before plain-text fallbacks", () => {
    const parsed = parseClipboardTable({
      html: "<table><tbody><tr><th>Module</th><th>Artifact</th></tr><tr><td>core</td><td>io.core</td></tr></tbody></table>",
      text: "not\ta markdown table",
    });

    expect(parsed).toEqual({
      source: "html",
      rows: [
        ["Module", "Artifact"],
        ["core", "io.core"],
      ],
      headerRow: true,
    });
  });

  it("parses markdown table text and drops the separator row", () => {
    const parsed = parseMarkdownTable(`
| Module | Artifact |
| --- | --- |
| agentscope-core | io.agentscope:agentscope-core |
| agentscope-harness | io.agentscope:agentscope-harness |
`);

    expect(parsed).toEqual({
      source: "markdown",
      rows: [
        ["Module", "Artifact"],
        ["agentscope-core", "io.agentscope:agentscope-core"],
        ["agentscope-harness", "io.agentscope:agentscope-harness"],
      ],
      headerRow: true,
    });
  });

  it("parses TSV table text without assuming a header row", () => {
    const parsed = parseTsvTable("Module\tArtifact\ncore\tio.core\nharness\tio.harness");

    expect(parsed).toEqual({
      source: "tsv",
      rows: [
        ["Module", "Artifact"],
        ["core", "io.core"],
        ["harness", "io.harness"],
      ],
      headerRow: false,
    });
  });

  it("serializes parsed rows into schema-friendly table HTML", () => {
    const parsed = parseHtmlTable("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>");

    expect(parsed ? parsedClipboardTableToHtml(parsed) : null).toBe(
      "<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>",
    );
  });

  it("preserves HTML table colspan and rowspan while parsing and serializing", () => {
    const parsed = parseHtmlTable(
      '<table><tr><th colspan="2">Merged Header</th><th>Solo</th></tr><tr><td rowspan="2">A</td><td>B</td><td>C</td></tr><tr><td>D</td><td>E</td></tr></table>',
    );

    expect(parsed).toEqual({
      source: "html",
      rows: [
        ["Merged Header", "Solo"],
        ["A", "B", "C"],
        ["D", "E"],
      ],
      headerRow: true,
      cellSpans: [
        [
          { colspan: 2, rowspan: 1 },
          { colspan: 1, rowspan: 1 },
        ],
        [
          { colspan: 1, rowspan: 2 },
          { colspan: 1, rowspan: 1 },
          { colspan: 1, rowspan: 1 },
        ],
        [
          { colspan: 1, rowspan: 1 },
          { colspan: 1, rowspan: 1 },
        ],
      ],
    });

    expect(parsed ? parsedClipboardTableToHtml(parsed) : null).toBe(
      '<table><tbody><tr><th colspan="2"><p>Merged Header</p></th><th><p>Solo</p></th></tr><tr><td rowspan="2"><p>A</p></td><td><p>B</p></td><td><p>C</p></td></tr><tr><td><p>D</p></td><td><p>E</p></td></tr></tbody></table>',
    );
    expect(parsed ? parsedClipboardTableToMarkweaveMenuHtml(parsed) : null).toContain('<th colspan="2">Merged Header</th>');
    expect(parsed ? parsedClipboardTableToMarkweaveMenuHtml(parsed) : null).toContain('<td rowspan="2">A</td>');
  });

  it("serializes parsed rows into TSV and Markdown clipboard formats", () => {
    const parsed = parseMarkdownTable("| Module | Artifact |\n| --- | --- |\n| core | io.core |");

    expect(parsed ? parsedClipboardTableToTsv(parsed) : null).toBe("Module\tArtifact\ncore\tio.core");
    expect(parsed ? parsedClipboardTableToMarkdown(parsed) : null).toBe("| Module | Artifact |\n| --- | --- |\n| core | io.core |");
  });

  it("serializes Markweave keyboard cell selections as blank-line separated plain text", () => {
    const parsed = parseMarkdownTable("| Change | Replacement |\n| --- | --- |\n| SkillBox -> SkillRepository | AgentSkillRepository + DynamicSkillMiddleware |\n| stream() -> streamEvents() | Flux<AgentEvent> unified event stream |");

    expect(parsed ? parsedClipboardTableToMarkweaveSelectionText(parsed) : null).toBe(
      "Change\n\nReplacement\n\nSkillBox -> SkillRepository\n\nAgentSkillRepository + DynamicSkillMiddleware\n\nstream() -> streamEvents()\n\nFlux<AgentEvent> unified event stream",
    );
  });
});

describe("table clipboard paste extension", () => {
  it("runs the explicit paste runner and preserves merged colspan and rowspan", () => {
    const editor = createPasteEditor();
    const handled = runMarkweaveTablePaste(editor, {
      getData: (type) =>
        type === "text/html"
          ? '<table><tr><th colspan="2">Merged Header</th><th>Solo</th></tr><tr><td rowspan="2">A</td><td>B</td><td>C</td></tr><tr><td>D</td><td>E</td></tr></table>'
          : "Merged Header\t\tSolo\nA\tB\tC\nD\tE",
    });

    expect(handled).toBe(true);
    expect(tableCellAttrs(editor).map((cell) => ({ text: cell.text, colspan: cell.attrs.colspan, rowspan: cell.attrs.rowspan }))).toEqual([
      { text: "Merged Header", colspan: 2, rowspan: 1 },
      { text: "Solo", colspan: 1, rowspan: 1 },
      { text: "A", colspan: 1, rowspan: 2 },
      { text: "B", colspan: 1, rowspan: 1 },
      { text: "C", colspan: 1, rowspan: 1 },
      { text: "D", colspan: 1, rowspan: 1 },
      { text: "E", colspan: 1, rowspan: 1 },
    ]);
  });

  it("inserts a structured table from HTML clipboard content before plain-text fallbacks", () => {
    const editor = createPasteEditor();
    const result = dispatchPaste(editor, {
      "text/html": "<table><tr><th>Module</th><th>Artifact</th></tr><tr><td>core</td><td>io.core</td></tr></table>",
      "text/plain": "ordinary paragraph",
    });

    expect(result).toEqual({ handled: true, defaultPrevented: true });
    expect(tableShape(editor)).toEqual([{ rows: 2, columns: 2, rowWidths: [2, 2] }]);
    expect(activeTableCellText(editor)).toMatchObject({
      focusState: {
        mode: "cell-cursor",
        selectedCellCount: 1,
      },
      text: "core",
    });
  });

  it("preserves merged-cell spans when pasting HTML tables", () => {
    const editor = createPasteEditor();
    const result = dispatchPaste(editor, {
      "text/html": '<table><tr><th colspan="2">Merged Header</th><th>Solo</th></tr><tr><td>A</td><td>B</td><td>C</td></tr></table>',
      "text/plain": "Merged Header\tSolo\nA\tB\tC",
    });

    expect(result).toEqual({ handled: true, defaultPrevented: true });
    expect(tableCellAttrs(editor).map((cell) => ({ text: cell.text, colspan: cell.attrs.colspan, rowspan: cell.attrs.rowspan }))).toEqual([
      { text: "Merged Header", colspan: 2, rowspan: 1 },
      { text: "Solo", colspan: 1, rowspan: 1 },
      { text: "A", colspan: 1, rowspan: 1 },
      { text: "B", colspan: 1, rowspan: 1 },
      { text: "C", colspan: 1, rowspan: 1 },
    ]);
  });

  it("preserves safe inline formatting inside pasted HTML table cells", () => {
    const editor = createPasteEditor();
    const result = dispatchPaste(editor, {
      "text/html":
        '<table><tr><th><strong>Module</strong></th><th><em>Artifact</em></th></tr><tr><td><code>core</code></td><td><a href="https://example.com/core">io.core</a></td></tr></table>',
      "text/plain": "Module\tArtifact\ncore\tio.core",
    });

    expect(result).toEqual({ handled: true, defaultPrevented: true });
    expect(tableShape(editor)).toEqual([{ rows: 2, columns: 2, rowWidths: [2, 2] }]);

    const serialized = JSON.stringify(editor.state.doc.toJSON());
    expect(serialized).toContain('"type":"bold"');
    expect(serialized).toContain('"type":"italic"');
    expect(serialized).toContain('"type":"code"');
    expect(serialized).toContain('"type":"link"');
    expect(serialized).toContain('"href":"https://example.com/core"');
  });

  it("inserts a structured table from markdown clipboard text", () => {
    const editor = createPasteEditor();
    const result = dispatchPaste(editor, {
      "text/plain": "| Module | Artifact |\n| --- | --- |\n| core | io.core |",
    });

    expect(result).toEqual({ handled: true, defaultPrevented: true });
    expect(tableShape(editor)).toEqual([{ rows: 2, columns: 2, rowWidths: [2, 2] }]);
  });

  it("inserts a structured table from TSV clipboard text", () => {
    const editor = createPasteEditor();
    const result = dispatchPaste(editor, {
      "text/plain": "Module\tArtifact\ncore\tio.core\nharness\tio.harness",
    });

    expect(result).toEqual({ handled: true, defaultPrevented: true });
    expect(tableShape(editor)).toEqual([{ rows: 3, columns: 2, rowWidths: [2, 2, 2] }]);
  });

  it("lets non-table paste fall through to the default editor pipeline", () => {
    const editor = createPasteEditor();
    const result = dispatchPaste(editor, {
      "text/plain": "ordinary paragraph",
    });

    expect(result).toEqual({ handled: false, defaultPrevented: false });
    expect(tableShape(editor)).toEqual([]);
  });

  it("repeats non-table plain text into every selected cell like Markweave paste-back", () => {
    const editor = createTableEditor();
    selectCellRange(editor, "agentscope-core", "io.agentscope:agentscope-harness");

    const result = dispatchPaste(editor, {
      "text/plain":
        "SkillBox -> SkillRepository\n\nAgentSkillRepository + DynamicSkillMiddleware\n\nstream() -> streamEvents()\n\nFlux<AgentEvent> unified event stream",
    });

    expect(result).toEqual({ handled: true, defaultPrevented: true });
    expect(tableShape(editor)).toEqual([{ rows: 3, columns: 3, rowWidths: [3, 3, 3] }]);

    const cells = tableCellBlocks(editor);
    const expectedBlocks = [
      "SkillBox -> SkillRepository",
      "AgentSkillRepository + DynamicSkillMiddleware",
      "stream() -> streamEvents()",
      "Flux<AgentEvent> unified event stream",
    ];

    expect(cells.find((cell) => cell.text === "Module")?.blocks).toEqual(["Module"]);
    expect(cells.find((cell) => cell.text === "Role")?.blocks).toEqual(["Role"]);
    expect(cells.filter((cell) => cell.blocks.join("|") === expectedBlocks.join("|"))).toHaveLength(4);
  });

  it("repeats plain-text TSV into every selected cell instead of matrix-filling the selection", () => {
    const editor = createTableEditor();
    selectCellRange(editor, "agentscope-core", "io.agentscope:agentscope-harness");

    const result = dispatchPaste(editor, {
      "text/plain": "OCT_TSV_A\tOCT_TSV_B\nOCT_TSV_C\tOCT_TSV_D",
    });

    expect(result).toEqual({ handled: true, defaultPrevented: true });
    expect(tableShape(editor)).toEqual([{ rows: 3, columns: 3, rowWidths: [3, 3, 3] }]);

    const expectedBlocks = ["OCT_TSV_A\tOCT_TSV_B", "OCT_TSV_C\tOCT_TSV_D"];
    expect(tableCellBlocks(editor).filter((cell) => cell.blocks.join("|") === expectedBlocks.join("|"))).toHaveLength(4);
  });

  it("repeats rich non-table HTML fragments into every selected cell while preserving inline marks", () => {
    const editor = createTableEditor();
    selectCellRange(editor, "agentscope-core", "io.agentscope:agentscope-harness");

    const result = dispatchPaste(editor, {
      "text/html": '<strong>Bold</strong><br><code>core()</code> <a href="https://example.com/core">link</a>',
      "text/plain": "Bold\ncore() link",
    });

    expect(result).toEqual({ handled: true, defaultPrevented: true });
    expect(tableShape(editor)).toEqual([{ rows: 3, columns: 3, rowWidths: [3, 3, 3] }]);
    expect(tableCellBlocks(editor).filter((cell) => cell.text === "Boldcore() link")).toHaveLength(4);
    expect(getTableFocusState(editor.state)).toMatchObject({
      mode: "cell-selection",
      selectedCellCount: 4,
    });

    const serialized = JSON.stringify(editor.state.doc.toJSON());
    expect(serialized.match(/"type":"bold"/g)).toHaveLength(4);
    expect(serialized.match(/"type":"hardBreak"/g)).toHaveLength(4);
    expect(serialized.match(/"type":"code"/g)).toHaveLength(4);
    expect(serialized.match(/"type":"link"/g)).toHaveLength(4);
    expect(serialized).toContain('"href":"https://example.com/core"');
  });

  it("keeps selected-cell paste undoable and preserves the selected cells for follow-up table actions", () => {
    const editor = createTableEditor();
    selectCellRange(editor, "agentscope-core", "io.agentscope:agentscope-harness");
    const initialCells = tableCellBlocks(editor).map((cell) => cell.blocks);

    const result = dispatchPaste(editor, {
      "text/plain": "markweave-paste-a\n\nmarkweave-paste-b",
    });

    expect(result).toEqual({ handled: true, defaultPrevented: true });
    expect(getTableFocusState(editor.state)).toMatchObject({
      mode: "cell-selection",
      selectedCellCount: 4,
    });
    expect(tableCellBlocks(editor).filter((cell) => cell.blocks.join("|") === "markweave-paste-a|markweave-paste-b")).toHaveLength(4);

    expect(editor.commands.undo()).toBe(true);
    expect(tableCellBlocks(editor).map((cell) => cell.blocks)).toEqual(initialCells);
    expect(getTableFocusState(editor.state)).toMatchObject({
      mode: "cell-selection",
      selectedCellCount: 4,
    });

    expect(editor.commands.redo()).toBe(true);
    expect(tableCellBlocks(editor).filter((cell) => cell.blocks.join("|") === "markweave-paste-a|markweave-paste-b")).toHaveLength(4);
    expect(getTableFocusState(editor.state)).toMatchObject({
      mode: "cell-selection",
      selectedCellCount: 4,
    });
  });

  it("refocuses the editor after selected-cell paste-back", () => {
    const editor = createTableEditor();
    selectCellRange(editor, "agentscope-core", "io.agentscope:agentscope-core");
    const focusSpy = vi.spyOn(editor.view, "focus");

    expect(
      runMarkweaveTablePaste(editor, {
        getData: (type) => (type === "text/plain" ? "paste-focus-marker" : ""),
      }),
    ).toBe(true);

    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(tableShape(editor)).toEqual([{ rows: 3, columns: 3, rowWidths: [3, 3, 3] }]);
    expect(getTableFocusState(editor.state)).toMatchObject({
      mode: "cell-selection",
      selectedCellCount: 2,
    });
    expect(tableCellBlocks(editor).filter((cell) => cell.blocks.join("|") === "paste-focus-marker")).toHaveLength(2);
  });

  it("uses text/plain as the selected-cell paste-back source even when spreadsheet HTML is present", () => {
    const editor = createTableEditor();
    selectCellRange(editor, "agentscope-core", "io.agentscope:agentscope-core");

    const result = dispatchPaste(editor, {
      "text/html": "<table><tr><td>HTML A</td><td>HTML B</td></tr></table>",
      "text/plain": "TSV A\tTSV B",
    });

    expect(result).toEqual({ handled: true, defaultPrevented: true });
    expect(tableShape(editor)).toEqual([{ rows: 3, columns: 3, rowWidths: [3, 3, 3] }]);
    expect(tableCellBlocks(editor).filter((cell) => cell.blocks.join("|") === "TSV A\tTSV B")).toHaveLength(2);
    expect(tableCellBlocks(editor).some((cell) => cell.text.includes("HTML A"))).toBe(false);
    expect(getTableFocusState(editor.state)).toMatchObject({
      mode: "cell-selection",
      selectedCellCount: 2,
    });
  });
});

describe("table clipboard copy extension", () => {
  it("runs the explicit copy runner for selected table cells", () => {
    const editor = createTableEditor();
    selectCellRange(editor, "Module", "io.agentscope:agentscope-core");
    const writes = new Map<string, string>();

    expect(runMarkweaveTableCopy(editor.state, { setData: (type, value) => writes.set(type, value) })).toBe(true);
    expect([...writes.keys()]).toEqual(["text/plain"]);
    expect(writes.get("text/plain")).toBe("Module\n\nArtifact\n\nagentscope-core\n\nio.agentscope:agentscope-core");
  });

  it("extracts selected cells into a parsed clipboard table", () => {
    const editor = createTableEditor();
    selectCellRange(editor, "Module", "io.agentscope:agentscope-core");
    const { selection } = editor.state;

    if (!(selection instanceof CellSelection)) {
      throw new Error("Expected a table CellSelection.");
    }

    expect(parseCellSelectionTable(selection)).toEqual({
      source: "html",
      rows: [
        ["Module", "Artifact"],
        ["agentscope-core", "io.agentscope:agentscope-core"],
      ],
      headerRow: true,
    });
  });

  it("writes Markweave plain-text payloads for selected table cells", () => {
    const editor = createTableEditor();
    selectCellRange(editor, "Module", "io.agentscope:agentscope-core");
    const result = dispatchCopy(editor);

    expect(result.handled).toBe(true);
    expect(result.defaultPrevented).toBe(true);
    expect([...result.writes.keys()]).toEqual(["text/plain"]);
    expect(result.writes.get("text/plain")).toBe("Module\n\nArtifact\n\nagentscope-core\n\nio.agentscope:agentscope-core");
  });

  it("lets ordinary text copy fall through to the default editor pipeline", () => {
    const editor = createPasteEditor();
    editor.commands.setTextSelection({ from: 1, to: 7 });
    const result = dispatchCopy(editor);

    expect(result.handled).toBe(false);
    expect(result.defaultPrevented).toBe(false);
    expect(result.writes.size).toBe(0);
  });
});

describe("Markweave table menu copy payloads", () => {
  it("serializes Copy Table as an HTML-only Markweave menu payload", () => {
    const parsed = parseHtmlTable("<table><tr><th>Module</th><th>Artifact</th></tr><tr><td>core</td><td>io.core</td></tr></table>");

    if (!parsed) {
      throw new Error("Expected parsed table.");
    }

    const payload = toMarkweaveMenuCopyPayload(parsed, "table");

    expect(payload.text).toBe("");
    expect(payload.html).toBe(parsedClipboardTableToMarkweaveMenuHtml(parsed));
    expect(payload.html).toContain('<head><meta charset="UTF-8"></head><table border="1" style="caret-color: rgb(0, 0, 0);');
    expect(payload.html).toContain("<tr><th>Module</th><th>Artifact</th></tr>");
    expect(payload.html).not.toContain("<p>");
  });

  it("serializes Copy Column with newline plain text and a one-column HTML table", () => {
    const parsed = parseHtmlTable("<table><tr><th>Module</th><th>Artifact</th></tr><tr><td>core</td><td>io.core</td></tr></table>");

    if (!parsed) {
      throw new Error("Expected parsed table.");
    }

    const payload = toMarkweaveMenuCopyPayload(parsed, "column", 1);

    expect(payload.text).toBe("Artifact\nio.core");
    expect(payload.html).toContain("<tr><th>Artifact</th></tr><tr><td>io.core</td></tr>");
  });

  it("serializes Copy Row with TSV plain text and a one-row HTML table", () => {
    const parsed = parseHtmlTable("<table><tr><th>Module</th><th>Artifact</th></tr><tr><td>core</td><td>io.core</td></tr></table>");

    if (!parsed) {
      throw new Error("Expected parsed table.");
    }

    const payload = toMarkweaveMenuCopyPayload(parsed, "row", 1);

    expect(payload.text).toBe("core\tio.core");
    expect(payload.html).toContain("<tr><td>core</td><td>io.core</td></tr>");
    expect(payload.html).not.toContain("<th>Module</th>");
  });

  it("extracts the active table and column from editor selection state", () => {
    const editor = createTableEditor();
    const artifactCell = tableCells(editor).find((cell) => cell.text === "io.agentscope:agentscope-core");

    if (!artifactCell) {
      throw new Error("Expected artifact cell.");
    }

    editor.commands.setTextSelection(artifactCell.pos + 2);

    expect(parseCurrentTableFromState(editor.state)).toEqual({
      columnIndex: 1,
      rowIndex: 1,
      table: {
        source: "html",
        rows: [
          ["Module", "Artifact", "Role"],
          ["agentscope-core", "io.agentscope:agentscope-core", "Reasoning"],
          ["agentscope-harness", "io.agentscope:agentscope-harness", "Workspace"],
        ],
        headerRow: true,
      },
    });

    expect(getMarkweaveMenuCopyPayloadFromState(editor.state, "column")?.text).toBe(
      "Artifact\nio.agentscope:agentscope-core\nio.agentscope:agentscope-harness",
    );
    expect(getMarkweaveMenuCopyPayloadFromState(editor.state, "row")?.text).toBe(
      "agentscope-core\tio.agentscope:agentscope-core\tReasoning",
    );
    expect(getMarkweaveMenuCopyPayloadFromState(editor.state, "table")?.text).toBe("");
  });

  it("preserves merged-cell spans when serializing Copy Table from editor state", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);

    activeEditor = new Editor({
      element,
      extensions: createMarkweaveEditorExtensions(),
      content: '<table><tbody><tr><th colspan="2"><p>Merged Header</p></th><th><p>Solo</p></th></tr><tr><td><p>A</p></td><td><p>B</p></td><td><p>C</p></td></tr></tbody></table>',
    });

    const firstCell = tableCells(activeEditor).find((cell) => cell.text === "Merged Header");
    if (!firstCell) {
      throw new Error("Expected merged header cell.");
    }

    activeEditor.commands.setTextSelection(firstCell.pos + 2);

    const parsed = parseCurrentTableFromState(activeEditor.state);
    expect(parsed?.table.cellSpans?.[0]?.[0]).toEqual({ colspan: 2, rowspan: 1 });
    expect(getMarkweaveMenuCopyPayloadFromState(activeEditor.state, "table")?.html).toContain('<th colspan="2">Merged Header</th>');
    expect(getMarkweaveMenuCopyPayloadFromState(activeEditor.state, "table")?.html).toContain("<th>Solo</th>");
  });

  it("serializes Copy Column by visual column when merged cells span multiple columns", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);

    activeEditor = new Editor({
      element,
      extensions: createMarkweaveEditorExtensions(),
      content:
        '<table><tbody><tr><th colspan="2"><p>Merged Header</p></th><th><p>Solo</p></th></tr><tr><td><p>A</p></td><td><p>B</p></td><td><p>C</p></td></tr></tbody></table>',
    });

    const secondVisualColumnCell = tableCells(activeEditor).find((cell) => cell.text === "B");
    if (!secondVisualColumnCell) {
      throw new Error("Expected second visual column body cell.");
    }

    activeEditor.commands.setTextSelection(secondVisualColumnCell.pos + 2);

    expect(parseCurrentTableFromState(activeEditor.state)?.columnIndex).toBe(1);
    expect(getMarkweaveMenuCopyPayloadFromState(activeEditor.state, "column")?.text).toBe("Merged Header\nB");
    expect(getMarkweaveMenuCopyPayloadFromState(activeEditor.state, "column")?.html).toContain("<tr><th>Merged Header</th></tr>");

    const thirdVisualColumnCell = tableCells(activeEditor).find((cell) => cell.text === "C");
    if (!thirdVisualColumnCell) {
      throw new Error("Expected third visual column body cell.");
    }

    activeEditor.commands.setTextSelection(thirdVisualColumnCell.pos + 2);

    expect(parseCurrentTableFromState(activeEditor.state)?.columnIndex).toBe(2);
    expect(getMarkweaveMenuCopyPayloadFromState(activeEditor.state, "column")?.text).toBe("Solo\nC");
    expect(getMarkweaveMenuCopyPayloadFromState(activeEditor.state, "column")?.html).toContain("<tr><th>Solo</th></tr>");
  });

  it("serializes Copy Row with visual placeholders for row-spanned cells from previous rows", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);

    activeEditor = new Editor({
      element,
      extensions: createMarkweaveEditorExtensions(),
      content:
        '<table><tbody><tr><th><p>H1</p></th><th><p>H2</p></th><th><p>H3</p></th></tr><tr><td rowspan="2"><p>A</p></td><td><p>B</p></td><td><p>C</p></td></tr><tr><td><p>D</p></td><td><p>E</p></td></tr></tbody></table>',
    });

    const rowSpannedVisualRowCell = tableCells(activeEditor).find((cell) => cell.text === "D");
    if (!rowSpannedVisualRowCell) {
      throw new Error("Expected body cell in the visual row covered by rowspan.");
    }

    activeEditor.commands.setTextSelection(rowSpannedVisualRowCell.pos + 2);

    expect(parseCurrentTableFromState(activeEditor.state)?.rowIndex).toBe(2);
    expect(parseCurrentTableFromState(activeEditor.state)?.columnIndex).toBe(1);
    expect(getMarkweaveMenuCopyPayloadFromState(activeEditor.state, "row")?.text).toBe("\tD\tE");
    expect(getMarkweaveMenuCopyPayloadFromState(activeEditor.state, "row")?.html).toContain("<tr><td></td><td>D</td><td>E</td></tr>");
  });

  it("serializes Copy Row TSV with visual placeholders for col-spanned cells in the copied row", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);

    activeEditor = new Editor({
      element,
      extensions: createMarkweaveEditorExtensions(),
      content:
        '<table><tbody><tr><th colspan="2"><p>Merged Header</p></th><th><p>Solo</p></th></tr><tr><td><p>A</p></td><td><p>B</p></td><td><p>C</p></td></tr></tbody></table>',
    });

    const mergedHeaderCell = tableCells(activeEditor).find((cell) => cell.text === "Merged Header");
    if (!mergedHeaderCell) {
      throw new Error("Expected merged header cell.");
    }

    activeEditor.commands.setTextSelection(mergedHeaderCell.pos + 2);

    expect(parseCurrentTableFromState(activeEditor.state)?.rowIndex).toBe(0);
    expect(parseCurrentTableFromState(activeEditor.state)?.columnIndex).toBe(0);
    expect(getMarkweaveMenuCopyPayloadFromState(activeEditor.state, "row")?.text).toBe("Merged Header\t\tSolo");
    expect(getMarkweaveMenuCopyPayloadFromState(activeEditor.state, "row")?.html).toContain('<tr><th colspan="2">Merged Header</th><th>Solo</th></tr>');
  });
});
