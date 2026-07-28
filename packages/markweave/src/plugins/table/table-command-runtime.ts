import type { Editor } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import {
  addColumn,
  addRow,
  CellSelection,
  findCell,
  isInTable,
  mergeCells as mergeTableCells,
  moveTableColumn,
  moveTableRow,
  removeColumn,
  removeRow,
  selectedRect,
  splitCell as splitTableCell,
} from "@tiptap/pm/tables";
import { focusFirstTableBodyCell } from "./table-focus-position";
import { getTableFocusState } from "./table-focus-state";
import {
  getMarkweaveMenuCopyPayloadFromState,
  getMarkweaveTableMenuAxisTarget,
  setMarkweaveTableMenuAxisTarget,
} from "./table-clipboard";
import type { TableCommandId } from "./table-command-spec";

export type TableAxisKind = "row" | "column";
export type TableCellHorizontalAlignment = "left" | "center" | "right";
export type TableCellVerticalAlignment = "top" | "middle" | "bottom";
export interface TableCellStylePatch {
  readonly textColor?: string | null;
  readonly backgroundColor?: string | null;
  readonly textAlign?: TableCellHorizontalAlignment;
  readonly verticalAlign?: TableCellVerticalAlignment;
}

function dispatchTableTransform(editor: Editor, transform: Transaction) {
  const menuAxisTarget = getMarkweaveTableMenuAxisTarget(editor.state);

  if (menuAxisTarget) {
    setMarkweaveTableMenuAxisTarget(transform, menuAxisTarget);
  }

  editor.view.dispatch(transform);
  editor.view.focus();
  return true;
}

function restoreTableFocusIfNeeded(editor: Editor) {
  if (getTableFocusState(editor.state).active) {
    return;
  }

  focusFirstTableBodyCell(editor);
}

function refocusTableCommandResult(editor: Editor) {
  if (getTableFocusState(editor.state).active) {
    editor.view.focus();
    return true;
  }

  return focusFirstTableBodyCell(editor);
}

function getCurrentTableRect(editor: Editor) {
  if (!isInTable(editor.state)) {
    return null;
  }

  return selectedRect(editor.state);
}

function getTargetedTableAxis(editor: Editor, kind: TableAxisKind) {
  const target = getMarkweaveTableMenuAxisTarget(editor.state);

  if (!target || target.kind !== kind) {
    return null;
  }

  const rect = getCurrentTableRect(editor);

  if (!rect) {
    return null;
  }

  const limit = kind === "row" ? rect.map.height : rect.map.width;

  if (target.index < 0 || target.index >= limit) {
    return null;
  }

  return {
    rect,
    index: target.index,
  };
}

function getTargetedAxisCellPositions(editor: Editor, kind: TableAxisKind) {
  const target = getTargetedTableAxis(editor, kind);

  if (!target) {
    return null;
  }

  const relativePositions =
    kind === "row"
      ? target.rect.map.cellsInRect({ left: 0, right: target.rect.map.width, top: target.index, bottom: target.index + 1 })
      : target.rect.map.cellsInRect({ left: target.index, right: target.index + 1, top: 0, bottom: target.rect.map.height });

  return {
    ...target,
    cellPositions: [...new Set(relativePositions)].map((relativePos) => target.rect.tableStart + relativePos).sort((left, right) => left - right),
  };
}

function tableHasSpanningCells(table: ProseMirrorNode) {
  let hasSpans = false;

  table.descendants((node) => {
    if (hasSpans) {
      return false;
    }

    if ((node.type.name === "tableCell" || node.type.name === "tableHeader") && (Number(node.attrs.colspan) > 1 || Number(node.attrs.rowspan) > 1)) {
      hasSpans = true;
      return false;
    }

    return true;
  });

  return hasSpans;
}

function compareTableText(left: ProseMirrorNode, right: ProseMirrorNode, direction: 1 | -1) {
  return left.textContent.localeCompare(right.textContent, undefined, { numeric: true, sensitivity: "base" }) * direction;
}

function rowOffsetAt(table: ProseMirrorNode, rowIndex: number) {
  let offset = 0;

  for (let index = 0; index < rowIndex; index += 1) {
    offset += table.child(index).nodeSize;
  }

  return offset;
}

function canTransformTargetedAxis(editor: Editor, kind: TableAxisKind) {
  const target = getTargetedTableAxis(editor, kind);
  return Boolean(target && !tableHasSpanningCells(target.rect.table));
}

function runSortRowCommand(editor: Editor, direction: 1 | -1) {
  const target = getTargetedTableAxis(editor, "row");

  if (!target || tableHasSpanningCells(target.rect.table)) {
    return false;
  }

  const row = target.rect.table.child(target.index);
  const rowStart = target.rect.tableStart + rowOffsetAt(target.rect.table, target.index);
  const cells = Array.from({ length: row.childCount }, (_value, index) => row.child(index)).sort((left, right) => compareTableText(left, right, direction));
  const tr = editor.state.tr.replaceWith(rowStart + 1, rowStart + 1 + row.content.size, Fragment.fromArray(cells));
  return dispatchTableTransform(editor, tr);
}

function runSortColumnCommand(editor: Editor, direction: 1 | -1) {
  const target = getTargetedTableAxis(editor, "column");

  if (!target || tableHasSpanningCells(target.rect.table)) {
    return false;
  }

  const rows = Array.from({ length: target.rect.table.childCount }, (_value, index) => target.rect.table.child(index));
  const hasHeaderRow = rows[0]?.childCount > 0 && Array.from({ length: rows[0].childCount }, (_value, index) => rows[0].child(index)).every((cell) => cell.type.name === "tableHeader");
  const fixedRows = hasHeaderRow ? rows.slice(0, 1) : [];
  const sortableRows = (hasHeaderRow ? rows.slice(1) : rows).sort((left, right) => compareTableText(left.child(target.index), right.child(target.index), direction));
  const tr = editor.state.tr.replaceWith(
    target.rect.tableStart,
    target.rect.tableStart + target.rect.table.content.size,
    Fragment.fromArray([...fixedRows, ...sortableRows]),
  );
  return dispatchTableTransform(editor, tr);
}

function runClearAxisCommand(editor: Editor, kind: TableAxisKind) {
  const target = getTargetedAxisCellPositions(editor, kind);

  if (!target) {
    return false;
  }

  const paragraph = editor.state.schema.nodes.paragraph?.createAndFill();

  if (!paragraph) {
    return false;
  }

  const tr = editor.state.tr;

  [...target.cellPositions].reverse().forEach((cellPos) => {
    const cell = tr.doc.nodeAt(cellPos);

    if (cell) {
      tr.replaceWith(cellPos + 1, cellPos + cell.nodeSize - 1, paragraph);
    }
  });

  return dispatchTableTransform(editor, tr);
}

function runDuplicateRowCommand(editor: Editor) {
  const target = getTargetedTableAxis(editor, "row");

  if (!target || tableHasSpanningCells(target.rect.table)) {
    return false;
  }

  const row = target.rect.table.child(target.index);
  const insertAt = target.rect.tableStart + rowOffsetAt(target.rect.table, target.index) + row.nodeSize;
  return dispatchTableTransform(editor, editor.state.tr.insert(insertAt, row.copy(row.content)));
}

function runDuplicateColumnCommand(editor: Editor) {
  const target = getTargetedTableAxis(editor, "column");

  if (!target || tableHasSpanningCells(target.rect.table)) {
    return false;
  }

  const tr = editor.state.tr;
  const insertions: { readonly pos: number; readonly cell: ProseMirrorNode }[] = [];
  let rowOffset = 0;

  target.rect.table.forEach((row) => {
    const cell = row.child(target.index);
    let cellOffset = 0;

    for (let index = 0; index <= target.index; index += 1) {
      cellOffset += row.child(index).nodeSize;
    }

    insertions.push({
      pos: target.rect.tableStart + rowOffset + 1 + cellOffset,
      cell: cell.copy(cell.content),
    });
    rowOffset += row.nodeSize;
  });

  insertions.reverse().forEach(({ pos, cell }) => tr.insert(pos, cell));
  return dispatchTableTransform(editor, tr);
}

export function setTargetedTableAxisCellStyle(editor: Editor, kind: TableAxisKind, patch: TableCellStylePatch) {
  const target = getTargetedAxisCellPositions(editor, kind);

  if (!target) {
    return false;
  }

  const tr = editor.state.tr;

  target.cellPositions.forEach((cellPos) => {
    const cell = tr.doc.nodeAt(cellPos);

    if (!cell) {
      return;
    }

    tr.setNodeMarkup(cellPos, undefined, { ...cell.attrs, ...patch });
  });

  return dispatchTableTransform(editor, tr);
}

export function getTargetedTableAxisCellStyle(editor: Editor, kind: TableAxisKind) {
  const target = getTargetedAxisCellPositions(editor, kind);

  if (!target || target.cellPositions.length === 0) {
    return null;
  }

  const cells = target.cellPositions.map((pos) => editor.state.doc.nodeAt(pos)).filter((node): node is ProseMirrorNode => Boolean(node));
  const commonValue = (name: "textColor" | "backgroundColor" | "textAlign" | "verticalAlign") => {
    const value = cells[0]?.attrs[name] ?? null;
    return cells.every((cell) => (cell.attrs[name] ?? null) === value) ? value : null;
  };

  return {
    textColor: commonValue("textColor") as string | null,
    backgroundColor: commonValue("backgroundColor") as string | null,
    textAlign: (commonValue("textAlign") ?? "left") as TableCellHorizontalAlignment,
    verticalAlign: (commonValue("verticalAlign") ?? "middle") as TableCellVerticalAlignment,
  };
}

export function moveTargetedTableAxis(editor: Editor, kind: TableAxisKind, from: number, to: number) {
  const rect = getCurrentTableRect(editor);

  if (!rect || from === to || from < 0 || to < 0 || (kind === "row" ? Math.max(from, to) >= rect.map.height : Math.max(from, to) >= rect.map.width)) {
    return false;
  }

  if (kind === "column" && isColumnMoveBlockedByColspan(editor, { from, to })) {
    return false;
  }

  const command = kind === "row" ? moveTableRow({ from, to, select: true }) : moveTableColumn({ from, to, select: true });
  editor.commands.focus();
  const result = command(editor.state, editor.view.dispatch);
  restoreTableFocusIfNeeded(editor);
  return result;
}

function canMergeMarkweaveTableCells(editor: Editor) {
  const { selection } = editor.state;

  return (
    selection instanceof CellSelection &&
    selection.$anchorCell.pos !== selection.$headCell.pos &&
    mergeTableCells(editor.state)
  );
}

function canSplitMarkweaveTableCell(editor: Editor) {
  if (!isInTable(editor.state)) {
    return false;
  }

  return splitTableCell(editor.state);
}

function runMarkweaveMergeCellsCommand(editor: Editor) {
  if (!canMergeMarkweaveTableCells(editor)) {
    return false;
  }

  editor.commands.focus();
  const result = mergeTableCells(editor.state, editor.view.dispatch);
  refocusTableCommandResult(editor);
  return result;
}

function runMarkweaveSplitCellCommand(editor: Editor) {
  if (!canSplitMarkweaveTableCell(editor)) {
    return false;
  }

  editor.commands.focus();
  const result = splitTableCell(editor.state, editor.view.dispatch);
  refocusTableCommandResult(editor);
  return result;
}

function getTableRowMoveTarget(editor: Editor, direction: -1 | 1) {
  const target = getTargetedTableAxis(editor, "row");
  const rect = getCurrentTableRect(editor);

  if (!rect) {
    return null;
  }

  const from = target ? target.index : direction < 0 ? rect.top : rect.bottom - 1;
  const to = from + direction;

  if (to < 0 || to >= rect.map.height) {
    return null;
  }

  return { from, to };
}

function getTableColumnMoveTarget(editor: Editor, direction: -1 | 1) {
  const target = getTargetedTableAxis(editor, "column");
  const rect = getCurrentTableRect(editor);

  if (!rect) {
    return null;
  }

  const from = target ? target.index : direction < 0 ? rect.left : rect.right - 1;
  const to = from + direction;

  if (to < 0 || to >= rect.map.width) {
    return null;
  }

  return { from, to };
}

function isColumnMoveBlockedByColspan(editor: Editor, target: { readonly from: number; readonly to: number }) {
  const rect = getCurrentTableRect(editor);

  if (!rect) {
    return false;
  }

  let blocked = false;

  rect.table.descendants((node, relativePos) => {
    if (blocked || (node.type.name !== "tableCell" && node.type.name !== "tableHeader")) {
      return !blocked;
    }

    const cellRect = findCell(editor.state.doc.resolve(rect.tableStart + relativePos));
    const spansMultipleColumns = cellRect.right - cellRect.left > 1;
    const touchesFromColumn = target.from >= cellRect.left && target.from < cellRect.right;
    const touchesToColumn = target.to >= cellRect.left && target.to < cellRect.right;

    if (spansMultipleColumns && (touchesFromColumn || touchesToColumn)) {
      blocked = true;
    }

    return !blocked;
  });

  return blocked;
}

function canMoveTableRow(editor: Editor, direction: -1 | 1) {
  const target = getTableRowMoveTarget(editor, direction);

  return Boolean(target && moveTableRow({ from: target.from, to: target.to, select: true })(editor.state));
}

function canMoveTableColumn(editor: Editor, direction: -1 | 1) {
  const target = getTableColumnMoveTarget(editor, direction);

  return Boolean(target && !isColumnMoveBlockedByColspan(editor, target) && moveTableColumn({ from: target.from, to: target.to, select: true })(editor.state));
}

function runTableMoveRowCommand(editor: Editor, direction: -1 | 1) {
  const target = getTableRowMoveTarget(editor, direction);

  if (!target) {
    return false;
  }

  editor.commands.focus();
  const result = moveTableRow({ from: target.from, to: target.to, select: true })(editor.state, editor.view.dispatch);
  restoreTableFocusIfNeeded(editor);
  return result;
}

function runTableMoveColumnCommand(editor: Editor, direction: -1 | 1) {
  const target = getTableColumnMoveTarget(editor, direction);

  if (!target || isColumnMoveBlockedByColspan(editor, target)) {
    return false;
  }

  editor.commands.focus();
  const result = moveTableColumn({ from: target.from, to: target.to, select: true })(editor.state, editor.view.dispatch);
  restoreTableFocusIfNeeded(editor);
  return result;
}

function runTargetedAddRowCommand(editor: Editor, placement: "before" | "after") {
  const target = getTargetedTableAxis(editor, "row");

  if (!target) {
    return null;
  }

  const insertAt = placement === "before" ? target.index : target.index + 1;
  return dispatchTableTransform(editor, addRow(editor.state.tr, target.rect, insertAt));
}

function runTargetedAddColumnCommand(editor: Editor, placement: "before" | "after") {
  const target = getTargetedTableAxis(editor, "column");

  if (!target) {
    return null;
  }

  const insertAt = placement === "before" ? target.index : target.index + 1;
  return dispatchTableTransform(editor, addColumn(editor.state.tr, target.rect, insertAt));
}

function runTargetedDeleteRowCommand(editor: Editor) {
  const target = getTargetedTableAxis(editor, "row");

  if (!target) {
    return null;
  }

  if (target.rect.map.height <= 1) {
    return false;
  }

  const tr = editor.state.tr;
  removeRow(tr, target.rect, target.index);
  return dispatchTableTransform(editor, tr);
}

function runTargetedDeleteColumnCommand(editor: Editor) {
  const target = getTargetedTableAxis(editor, "column");

  if (!target) {
    return null;
  }

  if (target.rect.map.width <= 1) {
    return false;
  }

  const tr = editor.state.tr;
  removeColumn(tr, target.rect, target.index);
  return dispatchTableTransform(editor, tr);
}

export function canRunMarkweaveTableCommand(editor: Editor, commandId: TableCommandId) {
  const rect = getCurrentTableRect(editor);

  switch (commandId) {
    case "move-row-up":
      return canMoveTableRow(editor, -1);
    case "move-row-down":
      return canMoveTableRow(editor, 1);
    case "move-column-left":
      return canMoveTableColumn(editor, -1);
    case "move-column-right":
      return canMoveTableColumn(editor, 1);
    case "delete-row":
      return Boolean(rect && rect.map.height > 1);
    case "delete-column":
      return Boolean(rect && rect.map.width > 1);
    case "sort-row-asc":
    case "sort-row-desc":
    case "duplicate-row":
      return canTransformTargetedAxis(editor, "row");
    case "sort-column-asc":
    case "sort-column-desc":
    case "duplicate-column":
      return canTransformTargetedAxis(editor, "column");
    case "clear-row":
      return Boolean(getTargetedTableAxis(editor, "row"));
    case "clear-column":
      return Boolean(getTargetedTableAxis(editor, "column"));
    case "copy-row":
      return Boolean(getMarkweaveMenuCopyPayloadFromState(editor.state, "row"));
    case "copy-column":
      return Boolean(getMarkweaveMenuCopyPayloadFromState(editor.state, "column"));
    case "copy-table":
      return Boolean(getMarkweaveMenuCopyPayloadFromState(editor.state, "table"));
    case "merge-cells":
      return canMergeMarkweaveTableCells(editor);
    case "split-cell":
      return canSplitMarkweaveTableCell(editor);
    default:
      return Boolean(rect);
  }
}

export function runMarkweaveTableCommand(editor: Editor, commandId: TableCommandId) {
  if (!canRunMarkweaveTableCommand(editor, commandId)) {
    return false;
  }

  switch (commandId) {
    case "add-row-before":
      return runTargetedAddRowCommand(editor, "before") ?? editor.chain().focus().addRowBefore().run();
    case "add-row-after":
      return runTargetedAddRowCommand(editor, "after") ?? editor.chain().focus().addRowAfter().run();
    case "move-row-up":
      return runTableMoveRowCommand(editor, -1);
    case "move-row-down":
      return runTableMoveRowCommand(editor, 1);
    case "sort-row-asc":
      return runSortRowCommand(editor, 1);
    case "sort-row-desc":
      return runSortRowCommand(editor, -1);
    case "clear-row":
      return runClearAxisCommand(editor, "row");
    case "duplicate-row":
      return runDuplicateRowCommand(editor);
    case "add-column-before":
      return runTargetedAddColumnCommand(editor, "before") ?? editor.chain().focus().addColumnBefore().run();
    case "add-column-after":
      return runTargetedAddColumnCommand(editor, "after") ?? editor.chain().focus().addColumnAfter().run();
    case "move-column-left":
      return runTableMoveColumnCommand(editor, -1);
    case "move-column-right":
      return runTableMoveColumnCommand(editor, 1);
    case "sort-column-asc":
      return runSortColumnCommand(editor, 1);
    case "sort-column-desc":
      return runSortColumnCommand(editor, -1);
    case "clear-column":
      return runClearAxisCommand(editor, "column");
    case "duplicate-column":
      return runDuplicateColumnCommand(editor);
    case "delete-row": {
      const result = runTargetedDeleteRowCommand(editor) ?? editor.chain().focus().deleteRow().run();
      restoreTableFocusIfNeeded(editor);
      return result;
    }
    case "delete-column": {
      const result = runTargetedDeleteColumnCommand(editor) ?? editor.chain().focus().deleteColumn().run();
      restoreTableFocusIfNeeded(editor);
      return result;
    }
    case "merge-cells":
      return runMarkweaveMergeCellsCommand(editor);
    case "split-cell":
      return runMarkweaveSplitCellCommand(editor);
    case "delete-table":
      return editor.chain().focus().deleteTable().run();
    case "copy-row":
    case "copy-column":
    case "copy-table":
      return true;
    default:
      return false;
  }
}
