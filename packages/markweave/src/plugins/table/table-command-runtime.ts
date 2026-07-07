import type { Editor } from "@tiptap/core";
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
import { getMarkweaveMenuCopyPayloadFromState, getMarkweaveTableMenuAxisTarget } from "./table-clipboard";
import type { TableCommandId } from "./table-command-spec";

function dispatchTableTransform(editor: Editor, transform: Transaction) {
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

function getTargetedTableAxis(editor: Editor, kind: "row" | "column") {
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
    case "add-column-before":
      return runTargetedAddColumnCommand(editor, "before") ?? editor.chain().focus().addColumnBefore().run();
    case "add-column-after":
      return runTargetedAddColumnCommand(editor, "after") ?? editor.chain().focus().addColumnAfter().run();
    case "move-column-left":
      return runTableMoveColumnCommand(editor, -1);
    case "move-column-right":
      return runTableMoveColumnCommand(editor, 1);
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
