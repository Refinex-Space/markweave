import { Extension, type Editor } from "@tiptap/core";
import { DOMParser as ProseMirrorDOMParser, Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { Plugin, PluginKey } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import { focusFirstTableBodyCell } from "./table-focus-position";

export type ClipboardTableSource = "html" | "markdown" | "tsv";
export type TableMenuCopyKind = "table" | "column" | "row";
export type TableMenuAxisKind = Exclude<TableMenuCopyKind, "table">;

export interface ClipboardTablePayload {
  readonly html?: string;
  readonly text?: string;
}

export interface ParsedClipboardTable {
  readonly source: ClipboardTableSource;
  readonly rows: readonly (readonly string[])[];
  readonly headerRow: boolean;
  readonly cellHtml?: readonly (readonly string[])[];
  readonly cellSpans?: readonly (readonly ParsedClipboardCellSpan[])[];
}

export interface ParsedClipboardCellSpan {
  readonly colspan: number;
  readonly rowspan: number;
}

export interface CurrentTableSelection {
  readonly table: ParsedClipboardTable;
  readonly columnIndex: number | null;
  readonly rowIndex: number | null;
}

export interface MarkweaveMenuCopyPayload {
  readonly kind: TableMenuCopyKind;
  readonly html: string;
  readonly text: string;
}

export interface MarkweaveTableMenuAxisTarget {
  readonly kind: TableMenuAxisKind;
  readonly index: number;
}

interface TableClipboardPluginState {
  readonly menuAxisTarget: MarkweaveTableMenuAxisTarget | null;
}

interface TableClipboardPluginMeta {
  readonly menuAxisTarget?: MarkweaveTableMenuAxisTarget | null;
}

interface VisualTableSlot {
  readonly rowIndex: number;
  readonly cellIndex: number;
  readonly text: string;
  readonly span: ParsedClipboardCellSpan;
}

const tableClipboardPluginKey = new PluginKey<TableClipboardPluginState>("markweaveTableClipboard");
const markweaveMenuTableStyle =
  "caret-color: rgb(0, 0, 0); color: rgb(0, 0, 0); font-style: normal; font-variant-caps: normal; font-weight: 400; letter-spacing: normal; orphans: 2; text-align: start; text-transform: none; white-space: normal; widows: 2; word-spacing: 0px; -webkit-text-stroke-width: 0px; text-decoration-line: none; text-decoration-thickness: auto; text-decoration-style: solid;";
const textNodeType = 3;
const elementNodeType = 1;
const blockElementNames = new Set(["address", "article", "aside", "blockquote", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "p", "section"]);

export function setMarkweaveTableMenuAxisTarget(tr: Transaction, target: MarkweaveTableMenuAxisTarget | null) {
  return tr.setMeta(tableClipboardPluginKey, { menuAxisTarget: target } satisfies TableClipboardPluginMeta);
}

export function getMarkweaveTableMenuAxisTarget(state: EditorState) {
  return tableClipboardPluginKey.getState(state)?.menuAxisTarget ?? null;
}

function normalizeCellText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeRows(rows: readonly (readonly string[])[]) {
  const width = Math.max(...rows.map((row) => row.length));

  if (width < 2 || rows.length === 0) {
    return null;
  }

  return rows.map((row) => {
    const normalized = row.map((cell) => normalizeCellText(cell));
    while (normalized.length < width) {
      normalized.push("");
    }
    return normalized;
  });
}

function normalizeSpan(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

function readElementCellSpan(cell: Element): ParsedClipboardCellSpan {
  return {
    colspan: normalizeSpan(cell.getAttribute("colspan")),
    rowspan: normalizeSpan(cell.getAttribute("rowspan")),
  };
}

function readNodeCellSpan(cellNode: ProseMirrorNode): ParsedClipboardCellSpan {
  return {
    colspan: normalizeSpan(String(cellNode.attrs.colspan ?? "")),
    rowspan: normalizeSpan(String(cellNode.attrs.rowspan ?? "")),
  };
}

function hasNonDefaultCellSpan(spans: readonly (readonly ParsedClipboardCellSpan[])[]) {
  return spans.some((row) => row.some((span) => span.colspan > 1 || span.rowspan > 1));
}

function withCellSpans<T extends Omit<ParsedClipboardTable, "cellSpans">>(
  table: T,
  cellSpans: readonly (readonly ParsedClipboardCellSpan[])[],
): ParsedClipboardTable {
  return hasNonDefaultCellSpan(cellSpans) ? { ...table, cellSpans } : table;
}

function splitMarkdownRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let escaped = false;

  for (const char of trimmed) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "|") {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function isMarkdownSeparatorRow(cells: readonly string[]) {
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

export function parseMarkdownTable(text: string): ParsedClipboardTable | null {
  const candidateLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (candidateLines.length < 2 || !candidateLines.some((line) => line.includes("|"))) {
    return null;
  }

  const parsedRows = candidateLines.map(splitMarkdownRow);
  const separatorIndex = parsedRows.findIndex(isMarkdownSeparatorRow);

  if (separatorIndex !== 1) {
    return null;
  }

  const rows = normalizeRows([parsedRows[0], ...parsedRows.slice(separatorIndex + 1)]);

  if (!rows || rows.length < 2) {
    return null;
  }

  return {
    source: "markdown",
    rows,
    headerRow: true,
  };
}

export function parseTsvTable(text: string): ParsedClipboardTable | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.length > 0);

  if (lines.length === 0 || !lines.some((line) => line.includes("\t"))) {
    return null;
  }

  const rows = normalizeRows(lines.map((line) => line.split("\t")));

  if (!rows) {
    return null;
  }

  return {
    source: "tsv",
    rows,
    headerRow: false,
  };
}

export function parseHtmlTable(html: string): ParsedClipboardTable | null {
  if (!html || typeof DOMParser === "undefined") {
    return null;
  }

  const document = new DOMParser().parseFromString(html, "text/html");
  const table = document.querySelector("table");

  if (!table) {
    return null;
  }

  const rowElements = Array.from(table.querySelectorAll("tr"));
  const rowCells = rowElements.map((row) => Array.from(row.querySelectorAll("th,td")));
  const rawRows = rowCells.map((cells) => cells.map((cell) => normalizeCellText(cell.textContent ?? "")));
  const cellHtml = rowCells.map((cells) => cells.map(serializeSafeCellInlineHtml));
  const cellSpans = rowCells.map((cells) => cells.map(readElementCellSpan));
  const hasSpans = hasNonDefaultCellSpan(cellSpans);

  if (rawRows.length === 0) {
    return null;
  }

  const rows = hasSpans ? rawRows : normalizeRows(rawRows);

  if (!rows) {
    return null;
  }

  const visualWidth = hasSpans
    ? Math.max(...cellSpans.map((row) => row.reduce((sum, span) => sum + span.colspan, 0)))
    : (rows[0]?.length ?? 0);

  if (visualWidth < 2) {
    return null;
  }

  return withCellSpans(
    {
      source: "html",
      rows,
      headerRow: table.querySelector("th") !== null,
      ...(hasRichCellHtml(cellHtml, rows) ? { cellHtml } : {}),
    },
    cellSpans,
  );
}

export function parseClipboardTable(payload: ClipboardTablePayload): ParsedClipboardTable | null {
  const htmlTable = payload.html ? parseHtmlTable(payload.html) : null;
  if (htmlTable) {
    return htmlTable;
  }

  const text = payload.text ?? "";
  return parseMarkdownTable(text) ?? parseTsvTable(text);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function isSafeLinkHref(href: string) {
  return /^(https?:|mailto:)/i.test(href);
}

function serializeSafeInlineChildren(element: Element) {
  return Array.from(element.childNodes)
    .map((child) => serializeSafeInlineNode(child))
    .join("");
}

function serializeSafeInlineNode(node: ChildNode): string {
  if (node.nodeType === textNodeType) {
    return escapeHtml(node.textContent ?? "");
  }

  if (node.nodeType !== elementNodeType) {
    return "";
  }

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  if (tagName === "br") {
    return "<br>";
  }

  const children = serializeSafeInlineChildren(element);

  switch (tagName) {
    case "strong":
    case "b":
      return children ? `<strong>${children}</strong>` : "";
    case "em":
    case "i":
      return children ? `<em>${children}</em>` : "";
    case "code":
      return children ? `<code>${children}</code>` : "";
    case "u":
      return children ? `<u>${children}</u>` : "";
    case "s":
    case "strike":
    case "del":
      return children ? `<s>${children}</s>` : "";
    case "a": {
      const href = element.getAttribute("href") ?? "";
      return children && isSafeLinkHref(href) ? `<a href="${escapeHtmlAttribute(href)}">${children}</a>` : children;
    }
    default:
      return children;
  }
}

function serializeSafeCellInlineHtml(cell: Element) {
  return serializeSafeInlineChildren(cell);
}

function hasRichCellHtml(cellHtml: readonly (readonly string[])[], rows: readonly (readonly string[])[]) {
  return cellHtml.some((row, rowIndex) => row.some((cell, cellIndex) => cell !== escapeHtml(rows[rowIndex]?.[cellIndex] ?? "")));
}

function hasSafeInlineMarkup(value: string) {
  return /<(strong|em|code|u|s|a|br)\b/i.test(value);
}

function serializeSafeHtmlFragmentBlocks(container: Element) {
  const blocks: string[] = [];
  let inlineBuffer = "";

  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType === elementNodeType && blockElementNames.has((child as Element).tagName.toLowerCase())) {
      if (inlineBuffer.trim()) {
        blocks.push(inlineBuffer);
      }
      inlineBuffer = "";
      blocks.push(serializeSafeInlineChildren(child as Element));
      continue;
    }

    inlineBuffer += serializeSafeInlineNode(child);
  }

  if (inlineBuffer.trim() || blocks.length === 0) {
    blocks.push(inlineBuffer);
  }

  return blocks.filter((block) => block.trim().length > 0);
}

function htmlFragmentToCellBlocks(state: EditorState, html: string): Fragment | null {
  if (!html || typeof DOMParser === "undefined" || typeof document === "undefined") {
    return null;
  }

  const parsedDocument = new DOMParser().parseFromString(html, "text/html");

  if (parsedDocument.querySelector("table")) {
    return null;
  }

  const safeBlocks = serializeSafeHtmlFragmentBlocks(parsedDocument.body);

  if (!safeBlocks.some(hasSafeInlineMarkup)) {
    return null;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = safeBlocks.map((block) => `<p>${block}</p>`).join("");

  const parsed = ProseMirrorDOMParser.fromSchema(state.schema).parseSlice(wrapper).content;
  return parsed.childCount > 0 ? parsed : null;
}

function getCellSpan(table: ParsedClipboardTable, rowIndex: number, cellIndex: number): ParsedClipboardCellSpan {
  return table.cellSpans?.[rowIndex]?.[cellIndex] ?? { colspan: 1, rowspan: 1 };
}

function getCellSpanAttributes(table: ParsedClipboardTable, rowIndex: number, cellIndex: number) {
  const span = getCellSpan(table, rowIndex, cellIndex);
  const attrs = [
    span.colspan > 1 ? `colspan="${span.colspan}"` : null,
    span.rowspan > 1 ? `rowspan="${span.rowspan}"` : null,
  ].filter(Boolean);

  return attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
}

function createVisualTableGrid(table: ParsedClipboardTable) {
  const grid: VisualTableSlot[][] = [];

  table.rows.forEach((row, rowIndex) => {
    const gridRow = (grid[rowIndex] ??= []);
    let visualColumn = 0;

    row.forEach((cell, cellIndex) => {
      while (gridRow[visualColumn]) {
        visualColumn += 1;
      }

      const span = getCellSpan(table, rowIndex, cellIndex);
      const slot: VisualTableSlot = {
        rowIndex,
        cellIndex,
        text: cell,
        span,
      };

      for (let rowOffset = 0; rowOffset < span.rowspan; rowOffset += 1) {
        const targetRow = (grid[rowIndex + rowOffset] ??= []);

        for (let columnOffset = 0; columnOffset < span.colspan; columnOffset += 1) {
          targetRow[visualColumn + columnOffset] = slot;
        }
      }

      visualColumn += span.colspan;
    });
  });

  return grid;
}

function getVisualColumnIndex(table: ParsedClipboardTable, rowIndex: number | null, cellIndex: number | null) {
  if (rowIndex === null || cellIndex === null) {
    return null;
  }

  const row = createVisualTableGrid(table)[rowIndex] ?? [];
  const visualColumn = row.findIndex((slot) => slot.rowIndex === rowIndex && slot.cellIndex === cellIndex);

  return visualColumn >= 0 ? visualColumn : cellIndex;
}

export function parsedClipboardTableToHtml(table: ParsedClipboardTable) {
  const rows = table.rows
    .map((row, rowIndex) => {
      const cellTag = table.headerRow && rowIndex === 0 ? "th" : "td";
      const cells = row
        .map((cell, cellIndex) => {
          const cellContent = table.cellHtml?.[rowIndex]?.[cellIndex] ?? escapeHtml(cell);
          return `<${cellTag}${getCellSpanAttributes(table, rowIndex, cellIndex)}><p>${cellContent}</p></${cellTag}>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<table><tbody>${rows}</tbody></table>`;
}

export function parsedClipboardTableToMarkweaveMenuHtml(table: ParsedClipboardTable) {
  const rows = table.rows
    .map((row, rowIndex) => {
      const cellTag = table.headerRow && rowIndex === 0 ? "th" : "td";
      const cells = row
        .map((cell, cellIndex) => `<${cellTag}${getCellSpanAttributes(table, rowIndex, cellIndex)}>${escapeHtml(cell)}</${cellTag}>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<head><meta charset="UTF-8"></head><table border="1" style="${markweaveMenuTableStyle}"><tbody>${rows}</tbody></table>`;
}

export function parsedClipboardTableToTsv(table: ParsedClipboardTable) {
  return table.rows.map((row) => row.join("\t")).join("\n");
}

export function parsedClipboardTableToMarkdown(table: ParsedClipboardTable) {
  const rows = table.rows.map((row) => `| ${row.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`);
  const width = table.rows[0]?.length ?? 0;

  if (width < 2 || rows.length === 0) {
    return "";
  }

  return [rows[0], `| ${Array.from({ length: width }, () => "---").join(" | ")} |`, ...rows.slice(1)].join("\n");
}

export function parsedClipboardTableToMarkweaveSelectionText(table: ParsedClipboardTable) {
  return table.rows.flatMap((row) => row).join("\n\n");
}

export function parseCellSelectionTable(selection: CellSelection): ParsedClipboardTable | null {
  const rows: string[][] = [];
  const cellSpans: ParsedClipboardCellSpan[][] = [];
  let headerRow = false;

  selection.content().content.forEach((rowNode, _offset, rowIndex) => {
    const row: string[] = [];
    const spanRow: ParsedClipboardCellSpan[] = [];
    let allHeaderCells = true;

    rowNode.forEach((cellNode) => {
      row.push(normalizeCellText(cellNode.textContent));
      spanRow.push(readNodeCellSpan(cellNode));
      allHeaderCells = allHeaderCells && cellNode.type.name === "tableHeader";
    });

    if (row.length > 0) {
      if (rowIndex === 0) {
        headerRow = allHeaderCells;
      }
      rows.push(row);
      cellSpans.push(spanRow);
    }
  });

  const hasSpans = hasNonDefaultCellSpan(cellSpans);
  const normalizedRows = hasSpans ? rows : normalizeRows(rows);

  if (!normalizedRows) {
    return null;
  }

  const visualWidth = hasSpans
    ? Math.max(...cellSpans.map((row) => row.reduce((sum, span) => sum + span.colspan, 0)))
    : (normalizedRows[0]?.length ?? 0);

  if (visualWidth < 2) {
    return null;
  }

  return withCellSpans(
    {
      source: "html",
      rows: normalizedRows,
      headerRow,
    },
    cellSpans,
  );
}

export function parseTableNode(tableNode: ProseMirrorNode): ParsedClipboardTable | null {
  const rows: string[][] = [];
  const cellSpans: ParsedClipboardCellSpan[][] = [];
  let headerRow = false;

  tableNode.forEach((rowNode, _offset, rowIndex) => {
    const row: string[] = [];
    const spanRow: ParsedClipboardCellSpan[] = [];
    let allHeaderCells = true;

    rowNode.forEach((cellNode) => {
      row.push(normalizeCellText(cellNode.textContent));
      spanRow.push(readNodeCellSpan(cellNode));
      allHeaderCells = allHeaderCells && cellNode.type.name === "tableHeader";
    });

    if (row.length > 0) {
      if (rowIndex === 0) {
        headerRow = allHeaderCells;
      }
      rows.push(row);
      cellSpans.push(spanRow);
    }
  });

  const hasSpans = hasNonDefaultCellSpan(cellSpans);
  const normalizedRows = hasSpans ? rows : normalizeRows(rows);

  if (!normalizedRows) {
    return null;
  }

  const visualWidth = hasSpans
    ? Math.max(...cellSpans.map((row) => row.reduce((sum, span) => sum + span.colspan, 0)))
    : (normalizedRows[0]?.length ?? 0);

  if (visualWidth < 2) {
    return null;
  }

  return withCellSpans(
    {
      source: "html",
      rows: normalizedRows,
      headerRow,
    },
    cellSpans,
  );
}

export function parseCurrentTableFromState(state: EditorState): CurrentTableSelection | null {
  const { $from } = state.selection;
  let tableNode: ProseMirrorNode | null = null;
  let rowDepth: number | null = null;
  let tableDepth: number | null = null;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);

    if ((node.type.name === "tableCell" || node.type.name === "tableHeader") && rowDepth === null) {
      rowDepth = depth - 1;
    }

    if (node.type.name === "table" && tableNode === null) {
      tableNode = node;
      tableDepth = depth;
    }
  }

  if (!tableNode) {
    return null;
  }

  const table = parseTableNode(tableNode);

  if (!table) {
    return null;
  }

  return {
    table,
    columnIndex: getVisualColumnIndex(table, tableDepth === null ? null : $from.index(tableDepth), rowDepth === null ? null : $from.index(rowDepth)),
    rowIndex: tableDepth === null ? null : $from.index(tableDepth),
  };
}

function extractClipboardTableColumn(table: ParsedClipboardTable, visualColumnIndex: number): ParsedClipboardTable | null {
  const grid = createVisualTableGrid(table);

  if (!grid.some((row) => row[visualColumnIndex])) {
    return null;
  }

  const rows: string[][] = [];
  const cellSpans: ParsedClipboardCellSpan[][] = [];

  grid.forEach((row) => {
    const slot = row[visualColumnIndex];

    if (!slot) {
      rows.push([""]);
      cellSpans.push([{ colspan: 1, rowspan: 1 }]);
      return;
    }

    if (slot.rowIndex !== rows.length) {
      rows.push([]);
      cellSpans.push([]);
      return;
    }

    rows.push([slot.text]);
    cellSpans.push([
      {
        colspan: 1,
        rowspan: slot.span.rowspan,
      },
    ]);
  });

  return {
    source: "html",
    rows,
    headerRow: table.headerRow,
    cellSpans: hasNonDefaultCellSpan(cellSpans) ? cellSpans : undefined,
  };
}

function extractClipboardTableRow(table: ParsedClipboardTable, visualRowIndex: number): ParsedClipboardTable | null {
  const grid = createVisualTableGrid(table);
  const gridRow = grid[visualRowIndex];

  if (!gridRow) {
    return null;
  }

  const visualWidth = Math.max(...grid.map((row) => row.length));
  const row: string[] = [];
  const cellSpans: ParsedClipboardCellSpan[] = [];
  const seenSlots = new Set<string>();

  for (let visualColumn = 0; visualColumn < visualWidth; visualColumn += 1) {
    const slot = gridRow[visualColumn];

    if (!slot) {
      row.push("");
      cellSpans.push({ colspan: 1, rowspan: 1 });
      continue;
    }

    const slotKey = `${slot.rowIndex}:${slot.cellIndex}`;

    if (seenSlots.has(slotKey)) {
      continue;
    }

    seenSlots.add(slotKey);

    if (slot.rowIndex !== visualRowIndex) {
      row.push("");
      cellSpans.push({ colspan: slot.span.colspan, rowspan: 1 });
      continue;
    }

    row.push(slot.text);
    cellSpans.push(slot.span);
  }

  return {
    source: "html",
    rows: [row],
    headerRow: table.headerRow && visualRowIndex === 0,
    cellSpans: hasNonDefaultCellSpan([cellSpans]) ? [cellSpans] : undefined,
  };
}

function parsedClipboardTableRowToVisualTsv(table: ParsedClipboardTable) {
  const row = table.rows[0] ?? [];

  return row
    .flatMap((cell, cellIndex) => {
      const span = getCellSpan(table, 0, cellIndex);
      return [cell, ...Array.from({ length: span.colspan - 1 }, () => "")];
    })
    .join("\t");
}

export function toMarkweaveMenuCopyPayload(table: ParsedClipboardTable, kind: TableMenuCopyKind, activeIndex = 0): MarkweaveMenuCopyPayload {
  const sourceTable =
    kind === "column"
      ? extractClipboardTableColumn(table, activeIndex)
      : kind === "row"
        ? extractClipboardTableRow(table, activeIndex)
        : table;

  if (!sourceTable) {
    return {
      kind,
      html: "",
      text: "",
    };
  }

  return {
    kind,
    html: parsedClipboardTableToMarkweaveMenuHtml(sourceTable),
    text:
      kind === "column"
        ? sourceTable.rows.map((row) => row[0] ?? "").join("\n")
        : kind === "row"
          ? parsedClipboardTableRowToVisualTsv(sourceTable)
          : "",
  };
}

export function getMarkweaveMenuCopyPayloadFromState(state: EditorState, kind: TableMenuCopyKind): MarkweaveMenuCopyPayload | null {
  const currentTable = parseCurrentTableFromState(state);
  const menuAxisTarget = getMarkweaveTableMenuAxisTarget(state);

  if (!currentTable) {
    return null;
  }

  if (kind === "column" && currentTable.columnIndex === null) {
    return null;
  }

  if (kind === "row" && currentTable.rowIndex === null) {
    return null;
  }

  const activeIndex =
    menuAxisTarget && menuAxisTarget.kind === kind
      ? menuAxisTarget.index
      : kind === "row"
        ? (currentTable.rowIndex ?? 0)
        : (currentTable.columnIndex ?? 0);

  return toMarkweaveMenuCopyPayload(currentTable.table, kind, activeIndex);
}

export function writeMarkweaveCellSelectionToDataTransfer(table: ParsedClipboardTable, clipboardData: Pick<DataTransfer, "setData">) {
  clipboardData.setData("text/plain", parsedClipboardTableToMarkweaveSelectionText(table));
}

function textToCellBlocks(state: EditorState, text: string) {
  const paragraph = state.schema.nodes.paragraph;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return Fragment.from(paragraph.create());
  }

  return Fragment.fromArray(lines.map((line) => paragraph.create(null, state.schema.text(line))));
}

function replaceSelectedTableCellsWithContent(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, content: Fragment) {
  const { selection } = state;

  if (!(selection instanceof CellSelection)) {
    return false;
  }

  if (!dispatch) {
    return true;
  }

  const cells: Array<{ node: ProseMirrorNode; pos: number }> = [];
  selection.forEachCell((node, pos) => {
    cells.push({ node, pos });
  });

  let tr = state.tr;

  for (const cell of cells.sort((left, right) => right.pos - left.pos)) {
    tr = tr.replaceWith(cell.pos + 1, cell.pos + cell.node.nodeSize - 1, content);
  }

  tr = tr.setSelection(CellSelection.create(tr.doc, tr.mapping.map(selection.$anchorCell.pos), tr.mapping.map(selection.$headCell.pos)));

  dispatch(tr.scrollIntoView());
  return true;
}

export function replaceSelectedTableCellsWithPlainText(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, text: string) {
  if (text.length === 0) {
    return false;
  }

  return replaceSelectedTableCellsWithContent(state, dispatch, textToCellBlocks(state, text));
}

export function replaceSelectedTableCellsWithRichHtml(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, html: string) {
  const content = htmlFragmentToCellBlocks(state, html);

  if (!content) {
    return false;
  }

  return replaceSelectedTableCellsWithContent(state, dispatch, content);
}

export function runMarkweaveTableCopy(state: EditorState, clipboardData: Pick<DataTransfer, "setData">) {
  const { selection } = state;

  if (!(selection instanceof CellSelection)) {
    return false;
  }

  const parsedTable = parseCellSelectionTable(selection);

  if (!parsedTable) {
    return false;
  }

  writeMarkweaveCellSelectionToDataTransfer(parsedTable, clipboardData);
  return true;
}

export function runMarkweaveTablePaste(editor: Editor, clipboardData: Pick<DataTransfer, "getData">) {
  const html = clipboardData.getData("text/html");
  const text = clipboardData.getData("text/plain");
  const insertFrom = editor.state.selection.from;
  const didReplaceSelectedCells =
    replaceSelectedTableCellsWithRichHtml(editor.state, editor.view.dispatch, html) ||
    replaceSelectedTableCellsWithPlainText(editor.state, editor.view.dispatch, text);

  if (didReplaceSelectedCells) {
    editor.view.focus();
    return true;
  }

  const parsedTable = parseClipboardTable({
    html,
    text,
  });

  if (!parsedTable) {
    return false;
  }

  const inserted = editor.chain().focus().insertContent(parsedClipboardTableToHtml(parsedTable)).run();

  if (inserted) {
    focusFirstTableBodyCell(editor, { from: insertFrom });
  }

  return inserted;
}

export const MarkweaveTableClipboard = Extension.create({
  name: "markweaveTableClipboard",
  priority: 950,

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin<TableClipboardPluginState>({
        key: tableClipboardPluginKey,
        state: {
          init() {
            return { menuAxisTarget: null };
          },
          apply(tr, pluginState) {
            const meta = tr.getMeta(tableClipboardPluginKey) as TableClipboardPluginMeta | undefined;

            if (meta && Object.prototype.hasOwnProperty.call(meta, "menuAxisTarget")) {
              return { menuAxisTarget: meta.menuAxisTarget ?? null };
            }

            if (tr.docChanged || tr.selectionSet) {
              return { menuAxisTarget: null };
            }

            return pluginState;
          },
        },
        props: {
          handleDOMEvents: {
            copy(view, event) {
              if (!event.clipboardData || !runMarkweaveTableCopy(view.state, event.clipboardData)) {
                return false;
              }

              event.preventDefault();
              return true;
            },
          },
          handlePaste(_view, event) {
            const clipboardData = event.clipboardData;

            if (!clipboardData) {
              return false;
            }

            if (runMarkweaveTablePaste(editor, clipboardData)) {
              event.preventDefault();
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
