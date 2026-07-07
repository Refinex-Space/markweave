import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
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
  TableMap,
} from "@tiptap/pm/tables";
import {
  getMarkweaveMenuCopyPayloadFromState,
  getMarkweaveTableMenuAxisTarget,
  parseCellSelectionTable,
  parsedClipboardTableToMarkweaveMenuHtml,
  parsedClipboardTableToMarkweaveSelectionText,
  setMarkweaveTableMenuAxisTarget,
  type MarkweaveMenuCopyPayload,
  type TableMenuCopyKind,
} from "../../../plugins/table/table-clipboard";
import {
  getExecutableTableMenuCommandSpecs,
  tableMenuSpecs,
  tableCommandSpecs,
  type TableCommandId,
  type TableCommandMenuKind,
  type TableMenuItemSpec,
} from "../../../plugins/table/table-command-spec";
import { getFirstTableDebugSnapshot } from "../../../plugins/table/table-debug-snapshot";
import { getTableFocusState } from "../../../plugins/table/table-focus-state";
import { focusFirstTableBodyCell } from "../../../plugins/table/table-focus-position";
import {
  initialTableInteractionState,
  type TableInteractionState,
} from "../../../plugins/table/table-interaction-layer";
import { getMarkweaveMessages, type MarkweaveMessages } from "../../../i18n";
import type { TableCommandResult, TableCommandSnapshot, TableEditWithAiRequest } from "../../../core/public-types";

interface TableControlsProps {
  readonly editor: Editor;
  readonly active: boolean;
  readonly interactionState?: TableInteractionState;
  readonly messages?: MarkweaveMessages;
  readonly onCopyPayload?: (payload: MarkweaveMenuCopyPayload) => void;
  readonly onCommandResult?: (result: TableCommandResult) => void;
  readonly onEditWithAi?: (request: TableEditWithAiRequest) => void;
}

export interface TableControlsRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface TableControlsPosition {
  readonly left: number;
  readonly top: number;
}

export interface TableMenuPosition {
  readonly left: number;
  readonly top: number;
}

export interface TableEdgeHandlePosition {
  readonly left: number;
  readonly top: number;
}

export interface TableAxisSelectionModel {
  readonly axis: "row" | "column";
  readonly index: number;
  readonly visualWidth: number;
  readonly visualHeight: number;
  readonly anchorCellPos: number;
  readonly headCellPos: number;
  readonly cellPositions: readonly number[];
  readonly visualCellPositions: readonly number[];
  readonly selectedCellCount: number;
  readonly visualCellCount: number;
}

export interface TableCopyFeedbackSnapshot {
  readonly kind: TableMenuCopyKind;
  readonly label: string;
  readonly textLength: number;
  readonly htmlLength: number;
}

type TableMenuKind = TableCommandMenuKind | "selection";
type TableMenuAnchor = "row-edge" | "column-edge" | "selection-edge";

interface ClipboardWriter {
  readonly write?: (items: ClipboardItem[]) => Promise<void>;
  readonly writeText?: (text: string) => Promise<void>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function calculateTableControlsPosition(input: {
  readonly cellRect: TableControlsRect;
  readonly frameRect: TableControlsRect;
  readonly controlsSize: { readonly width: number; readonly height: number };
  readonly offset?: number;
  readonly boundaryPadding?: number;
}): TableControlsPosition {
  const offset = input.offset ?? 6;
  const boundaryPadding = input.boundaryPadding ?? 8;
  const rawLeft = input.cellRect.left - input.frameRect.left;
  const rawTop = input.cellRect.top - input.frameRect.top - input.controlsSize.height - offset;
  const maxLeft = Math.max(boundaryPadding, input.frameRect.width - input.controlsSize.width - boundaryPadding);
  const maxTop = Math.max(boundaryPadding, input.frameRect.height - input.controlsSize.height - boundaryPadding);

  return {
    left: Math.round(clamp(rawLeft, boundaryPadding, maxLeft)),
    top: Math.round(clamp(rawTop, boundaryPadding, maxTop)),
  };
}

export function calculateTableMenuPosition(input: {
  readonly controlsRect: TableControlsRect;
  readonly frameRect: TableControlsRect;
  readonly menuSize: { readonly width: number; readonly height: number };
  readonly offset?: number;
  readonly boundaryPadding?: number;
}): TableMenuPosition {
  const offset = input.offset ?? 6;
  const boundaryPadding = input.boundaryPadding ?? 8;
  const controlsLeftInFrame = input.controlsRect.left - input.frameRect.left;
  const controlsTopInFrame = input.controlsRect.top - input.frameRect.top;
  const belowTop = controlsTopInFrame + input.controlsRect.height + offset;
  const aboveTop = controlsTopInFrame - input.menuSize.height - offset;
  const maxLeft = Math.max(boundaryPadding, input.frameRect.width - input.menuSize.width - boundaryPadding);
  const maxTop = Math.max(boundaryPadding, input.frameRect.height - input.menuSize.height - boundaryPadding);
  const fitsBelow = belowTop + input.menuSize.height <= input.frameRect.height - boundaryPadding;
  const rawTop = fitsBelow ? belowTop : aboveTop;
  const absoluteLeftInFrame = Math.round(clamp(controlsLeftInFrame, boundaryPadding, maxLeft));
  const absoluteTopInFrame = Math.round(clamp(rawTop, boundaryPadding, maxTop));

  return {
    left: absoluteLeftInFrame - Math.round(controlsLeftInFrame),
    top: absoluteTopInFrame - Math.round(controlsTopInFrame),
  };
}

export function calculateAnchoredTableMenuPosition(input: {
  readonly anchorRect: TableControlsRect;
  readonly frameRect: TableControlsRect;
  readonly menuSize: { readonly width: number; readonly height: number };
  readonly kind: "row" | "column" | "selection";
  readonly offset?: number;
  readonly boundaryPadding?: number;
}): TableMenuPosition {
  const offset = input.offset ?? 6;
  const boundaryPadding = input.boundaryPadding ?? 8;
  const anchorLeft = input.anchorRect.left - input.frameRect.left;
  const anchorTop = input.anchorRect.top - input.frameRect.top;
  const maxLeft = Math.max(boundaryPadding, input.frameRect.width - input.menuSize.width - boundaryPadding);
  const maxTop = Math.max(boundaryPadding, input.frameRect.height - input.menuSize.height - boundaryPadding);
  const rawLeft =
    input.kind === "row"
      ? anchorLeft + input.anchorRect.width + offset
      : anchorLeft + input.anchorRect.width / 2 - Math.min(24, input.menuSize.width / 2);
  let rawTop =
    input.kind === "row" ? anchorTop - 2 : anchorTop + input.anchorRect.height + offset;

  if (rawTop + input.menuSize.height > input.frameRect.height - boundaryPadding) {
    rawTop =
      input.kind === "row"
        ? anchorTop + input.anchorRect.height - input.menuSize.height
        : anchorTop - input.menuSize.height - offset;
  }

  return {
    left: Math.round(clamp(rawLeft, boundaryPadding, maxLeft)),
    top: Math.round(clamp(rawTop, boundaryPadding, maxTop)),
  };
}

export function calculateTableEdgeHandlePosition(input: {
  readonly targetRect: TableControlsRect;
  readonly frameRect: TableControlsRect;
  readonly controlsPosition?: TableControlsPosition;
  readonly kind: "row" | "column" | "selection";
  readonly handleSize?: { readonly width: number; readonly height: number };
  readonly offset?: number;
  readonly boundaryPadding?: number;
}): TableEdgeHandlePosition {
  const offset = input.offset ?? 0;
  const boundaryPadding = input.boundaryPadding ?? 0;
  const handleSize =
    input.handleSize ?? (input.kind === "row" ? { width: 22, height: 44 } : { width: 44, height: 22 });
  const rawLeft =
    input.kind === "row"
      ? input.targetRect.left - input.frameRect.left - handleSize.width / 2 - offset
      : input.targetRect.left - input.frameRect.left + input.targetRect.width / 2 - handleSize.width / 2;
  const rawTop =
    input.kind === "row"
      ? input.targetRect.top - input.frameRect.top + input.targetRect.height / 2 - handleSize.height / 2
      : input.targetRect.top - input.frameRect.top - handleSize.height / 2 - offset;
  const maxLeft = Math.max(boundaryPadding, input.frameRect.width - handleSize.width - boundaryPadding);
  const maxTop = Math.max(boundaryPadding, input.frameRect.height - handleSize.height - boundaryPadding);
  const controlsPosition = input.controlsPosition ?? { left: 0, top: 0 };

  return {
    left: Math.round(clamp(rawLeft, boundaryPadding, maxLeft) - controlsPosition.left),
    top: Math.round(clamp(rawTop, boundaryPadding, maxTop) - controlsPosition.top),
  };
}

function getActiveCellElement(editor: Editor) {
  const activeCellPos = getTableFocusState(editor.state).activeCellPos;

  if (activeCellPos === null) {
    return null;
  }

  const cellDom = editor.view.nodeDOM(activeCellPos);

  if (!(cellDom instanceof Element)) {
    return null;
  }

  return cellDom.matches("td, th") ? (cellDom as HTMLElement) : cellDom.closest<HTMLElement>("td, th");
}

function getActiveTableElement(editor: Editor) {
  return getActiveCellElement(editor)?.closest<HTMLElement>("table") ?? null;
}

function getEditorFrameElement(editor: Editor) {
  return editor.view.dom.closest<HTMLElement>(".markweave-editor-frame") ?? editor.view.dom.parentElement;
}

function getCellElementByPos(editor: Editor, cellPos: number) {
  const cellDom = editor.view.nodeDOM(cellPos);

  if (!(cellDom instanceof Element)) {
    return null;
  }

  return cellDom.matches("td, th") ? (cellDom as HTMLElement) : cellDom.closest<HTMLElement>("td, th");
}

function getTableAxisTargetRect(editor: Editor, model: TableAxisSelectionModel): TableControlsRect | null {
  const slices = model.visualCellPositions
    .map((cellPos) => {
      const cellElement = getCellElementByPos(editor, cellPos);

      if (!cellElement) {
        return null;
      }

      const cellRect = findCell(editor.state.doc.resolve(cellPos));
      const domRect = cellElement.getBoundingClientRect();

      if (model.axis === "row") {
        const visualHeight = Math.max(1, cellRect.bottom - cellRect.top);
        const rowHeight = domRect.height / visualHeight;
        const top = domRect.top + (model.index - cellRect.top) * rowHeight;

        return {
          left: domRect.left,
          top,
          right: domRect.right,
          bottom: top + rowHeight,
        };
      }

      const visualWidth = Math.max(1, cellRect.right - cellRect.left);
      const columnWidth = domRect.width / visualWidth;
      const left = domRect.left + (model.index - cellRect.left) * columnWidth;

      return {
        left,
        top: domRect.top,
        right: left + columnWidth,
        bottom: domRect.bottom,
      };
    })
    .filter((slice): slice is { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number } =>
      Boolean(slice),
    );

  if (slices.length === 0) {
    return null;
  }

  const left = Math.min(...slices.map((slice) => slice.left));
  const top = Math.min(...slices.map((slice) => slice.top));
  const right = Math.max(...slices.map((slice) => slice.right));
  const bottom = Math.max(...slices.map((slice) => slice.bottom));

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function getTableHoverAxisSelectionModel(
  editor: Editor,
  interactionState: TableInteractionState,
  axis: "row" | "column",
  fallbackCellPos: number | null,
) {
  const targetCellPos = interactionState.hoverCellPos ?? fallbackCellPos;

  if (targetCellPos === null) {
    return null;
  }

  return getTableAxisSelectionModel(editor, targetCellPos, axis, {
    visualIndex:
      interactionState.hoverCellPos === null
        ? null
        : axis === "row"
          ? interactionState.hoverVisualRowIndex
          : interactionState.hoverVisualColumnIndex,
  });
}

function getTableControlAxisSelectionModel(
  editor: Editor,
  interactionState: TableInteractionState,
  axis: "row" | "column",
  fallbackCellPos: number | null,
) {
  const axisTarget = getMarkweaveTableMenuAxisTarget(editor.state);

  if (axisTarget?.kind === axis && fallbackCellPos !== null) {
    return getTableAxisSelectionModel(editor, fallbackCellPos, axis, { visualIndex: axisTarget.index });
  }

  return getTableHoverAxisSelectionModel(editor, interactionState, axis, fallbackCellPos);
}

function getTableSelectionTargetRect(editor: Editor): TableControlsRect | null {
  const { selection } = editor.state;

  if (selection instanceof CellSelection) {
    const cellRects: TableControlsRect[] = [];

    selection.forEachCell((_node, pos) => {
      const cellElement = getCellElementByPos(editor, pos);

      if (!cellElement) {
        return;
      }

      const rect = cellElement.getBoundingClientRect();
      cellRects.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    });

    if (cellRects.length === 0) {
      return null;
    }

    const left = Math.min(...cellRects.map((rect) => rect.left));
    const top = Math.min(...cellRects.map((rect) => rect.top));
    const right = Math.max(...cellRects.map((rect) => rect.left + rect.width));
    const bottom = Math.max(...cellRects.map((rect) => rect.top + rect.height));

    return { left, top, width: right - left, height: bottom - top };
  }

  const activeCellElement = getActiveCellElement(editor);

  if (!activeCellElement) {
    return null;
  }

  const rect = activeCellElement.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export async function writeMarkweaveMenuPayloadToClipboard(
  payload: MarkweaveMenuCopyPayload,
  clipboard: ClipboardWriter | undefined = globalThis.navigator?.clipboard,
) {
  if (!clipboard) {
    return false;
  }

  if (clipboard.write && typeof ClipboardItem !== "undefined" && typeof Blob !== "undefined" && payload.html) {
    const clipboardItemData: Record<string, Blob> = {
      "text/html": new Blob([payload.html], { type: "text/html" }),
    };

    if (payload.text) {
      clipboardItemData["text/plain"] = new Blob([payload.text], { type: "text/plain" });
    }

    try {
      await clipboard.write([new ClipboardItem(clipboardItemData)]);
      return true;
    } catch {
      return writeMarkweavePlainTextPayloadToClipboard(payload, clipboard);
    }
  }

  return writeMarkweavePlainTextPayloadToClipboard(payload, clipboard);
}

async function writeMarkweavePlainTextPayloadToClipboard(payload: MarkweaveMenuCopyPayload, clipboard: ClipboardWriter) {
  if (payload.text && clipboard.writeText) {
    await clipboard.writeText(payload.text);
    return true;
  }

  return false;
}

export async function copyMarkweaveTableMenuPayload(editor: Editor, kind: TableMenuCopyKind, clipboard?: ClipboardWriter) {
  const payload = getMarkweaveMenuCopyPayloadFromState(editor.state, kind);

  if (!payload) {
    return false;
  }

  return writeMarkweaveMenuPayloadToClipboard(payload, clipboard);
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

export function getTableCommandSnapshot(editor: Editor): TableCommandSnapshot {
  let tableCount = 0;

  editor.state.doc.descendants((node) => {
    if (node.type.name === "table") {
      tableCount += 1;
    }

    return true;
  });

  const debugSnapshot = getFirstTableDebugSnapshot(editor.state);
  const focusState = getTableFocusState(editor.state);

  return {
    tableCount,
    rowCount: debugSnapshot?.rowCount ?? 0,
    visualWidth: debugSnapshot?.visualWidth ?? 0,
    focusMode: focusState.mode,
    selectedCellCount: focusState.selectedCellCount,
  };
}

export function getTableAxisSelectionModel(
  editor: Editor,
  cellPos: number,
  axis: "row" | "column",
  options: { readonly visualIndex?: number | null } = {},
): TableAxisSelectionModel | null {
  const cellNode = editor.state.doc.nodeAt(cellPos);

  if (cellNode?.type.name !== "tableCell" && cellNode?.type.name !== "tableHeader") {
    return null;
  }

  const $cell = editor.state.doc.resolve(cellPos);
  const table = $cell.node(-1);
  const tableStart = $cell.start(-1);
  const map = TableMap.get(table);
  const rect = findCell($cell);
  const visualIndex = options.visualIndex ?? (axis === "row" ? rect.top : rect.left);
  const clampedVisualIndex =
    axis === "row" ? clamp(visualIndex, rect.top, rect.bottom - 1) : clamp(visualIndex, rect.left, rect.right - 1);
  const relativeCells =
    axis === "row"
      ? map.cellsInRect({ left: 0, right: map.width, top: clampedVisualIndex, bottom: clampedVisualIndex + 1 })
      : map.cellsInRect({ left: clampedVisualIndex, right: clampedVisualIndex + 1, top: 0, bottom: map.height });
  const visualRelativeCells =
    axis === "row"
      ? Array.from({ length: map.width }, (_value, columnIndex) => map.map[clampedVisualIndex * map.width + columnIndex])
      : Array.from({ length: map.height }, (_value, rowIndex) => map.map[rowIndex * map.width + clampedVisualIndex]);
  const cellPositions = [...new Set(relativeCells)].map((relativePos) => tableStart + relativePos).sort((a, b) => a - b);
  const visualCellPositions = [...new Set(visualRelativeCells)]
    .filter((relativePos): relativePos is number => relativePos !== undefined)
    .map((relativePos) => tableStart + relativePos)
    .sort((a, b) => a - b);
  const anchorCellPos = cellPositions[0];
  const headCellPos = cellPositions[cellPositions.length - 1];

  if (anchorCellPos === undefined || headCellPos === undefined) {
    return null;
  }

  return {
    axis,
    index: clampedVisualIndex,
    visualWidth: map.width,
    visualHeight: map.height,
    anchorCellPos,
    headCellPos,
    cellPositions,
    visualCellPositions,
    selectedCellCount: cellPositions.length,
    visualCellCount: visualCellPositions.length,
  };
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

function dispatchTableTransform(editor: Editor, transform: Transaction) {
  editor.view.dispatch(transform);
  editor.view.focus();
  return true;
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

export function selectTableAxisFromCell(
  editor: Editor,
  cellPos: number,
  axis: "row" | "column",
  options: { readonly visualIndex?: number | null } = {},
) {
  const model = getTableAxisSelectionModel(editor, cellPos, axis, options);

  if (!model) {
    return false;
  }

  const selection =
    axis === "row"
      ? CellSelection.rowSelection(editor.state.doc.resolve(model.anchorCellPos), editor.state.doc.resolve(model.headCellPos))
      : CellSelection.colSelection(editor.state.doc.resolve(model.anchorCellPos), editor.state.doc.resolve(model.headCellPos));
  const menuAxisTarget = {
    kind: axis,
    index: model.index,
  };

  editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView());
  editor.view.focus();
  editor.view.dispatch(setMarkweaveTableMenuAxisTarget(editor.state.tr, menuAxisTarget));
  return true;
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

export function canRunTableCommand(editor: Editor, commandId: TableCommandId) {
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

export function runTableCommand(editor: Editor, commandId: TableCommandId) {
  if (!canRunTableCommand(editor, commandId)) {
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
    case "copy-row":
      return copyMarkweaveTableMenuPayload(editor, "row");
    case "copy-column":
      return copyMarkweaveTableMenuPayload(editor, "column");
    case "copy-table":
      return copyMarkweaveTableMenuPayload(editor, "table");
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
    default:
      return false;
  }
}

const cellCommandIds = ["merge-cells", "split-cell"] as const satisfies readonly TableCommandId[];

export function getAvailableCellMenuCommandSpecs(editor: Editor) {
  return cellCommandIds
    .map((commandId) => tableCommandSpecs.find((command) => command.id === commandId))
    .filter((command): command is (typeof tableCommandSpecs)[number] => Boolean(command))
    .filter((command) => canRunTableCommand(editor, command.id));
}

function getMenuCommandSpecs(editor: Editor, menu: TableMenuKind) {
  if (menu === "selection") {
    return getAvailableCellMenuCommandSpecs(editor);
  }

  return getExecutableTableMenuCommandSpecs(menu);
}

const defaultTableMessages = getMarkweaveMessages("zh");

function tableMenuLabel(menu: TableMenuKind, messages: MarkweaveMessages = defaultTableMessages) {
  if (menu === "row") {
    return messages.table.rowActions;
  }

  if (menu === "column") {
    return messages.table.columnActions;
  }

  return messages.table.selectionActions;
}

function getTableCommandLabel(commandId: TableCommandId, messages: MarkweaveMessages = defaultTableMessages) {
  return messages.table.commands[commandId];
}

function getTableMenuItemLabel(item: TableMenuItemSpec, messages: MarkweaveMessages = defaultTableMessages) {
  if (item.id === "edit-with-ai") {
    return messages.table.commands["edit-with-ai"];
  }

  return item.commandId ? getTableCommandLabel(item.commandId, messages) : item.label;
}

function getAxisMenuItems(menu: TableCommandMenuKind) {
  return tableMenuSpecs.filter((item) => item.menu === menu);
}

function getSelectionMenuItems(editor: Editor): readonly TableMenuItemSpec[] {
  return [
    {
      id: "edit-with-ai",
      label: "Edit with AI",
      menu: "row",
      commandId: null,
      availability: "external",
    },
    ...getAvailableCellMenuCommandSpecs(editor).map((command) => ({
      id: command.id,
      label: command.label,
      menu: "row" as const,
      commandId: command.id,
      availability: "available" as const,
    })),
  ];
}

function getTableMenuItems(editor: Editor, menu: TableMenuKind): readonly TableMenuItemSpec[] {
  if (menu === "selection") {
    return getSelectionMenuItems(editor);
  }

  return getAxisMenuItems(menu);
}

function getTableMenuItemGroup(item: TableMenuItemSpec) {
  if (item.commandId === null) {
    return "ai";
  }

  if (item.commandId.startsWith("add-")) {
    return "insert";
  }

  if (item.commandId.startsWith("move-")) {
    return "move";
  }

  if (item.commandId.startsWith("copy-")) {
    return "copy";
  }

  if (item.commandId.startsWith("delete-")) {
    return "delete";
  }

  return "cell";
}

function getCopyKindForTableCommand(commandId: TableCommandId): TableMenuCopyKind | null {
  if (commandId === "copy-row") {
    return "row";
  }

  if (commandId === "copy-column") {
    return "column";
  }

  if (commandId === "copy-table") {
    return "table";
  }

  return null;
}

const tableCopyFeedbackTimeoutMs = 5000;

export function getTableCopyFeedbackSnapshot(payload: MarkweaveMenuCopyPayload, messages: MarkweaveMessages = defaultTableMessages): TableCopyFeedbackSnapshot {
  return {
    kind: payload.kind,
    label: messages.table.copyFeedback[payload.kind],
    textLength: payload.text.length,
    htmlLength: payload.html.length,
  };
}

export function formatTableCopyFeedback(snapshot: TableCopyFeedbackSnapshot) {
  const textPart = snapshot.textLength > 0 ? `text ${snapshot.textLength}` : "html only";
  return `${snapshot.label} | ${textPart} | html ${snapshot.htmlLength}`;
}

function getCellSelectionPositions(selection: CellSelection) {
  const cellPositions: number[] = [];

  selection.forEachCell((_node, pos) => {
    cellPositions.push(pos);
  });

  return cellPositions.sort((left, right) => left - right);
}

export function getTableEditWithAiRequest(editor: Editor, source: TableEditWithAiRequest["source"]): TableEditWithAiRequest | null {
  if (source === "row" || source === "column") {
    const payload = getMarkweaveMenuCopyPayloadFromState(editor.state, source);
    const axisTarget = getMarkweaveTableMenuAxisTarget(editor.state);
    const focusState = getTableFocusState(editor.state);
    const axisModel =
      axisTarget?.kind === source && focusState.activeCellPos !== null
        ? getTableAxisSelectionModel(editor, focusState.activeCellPos, source, { visualIndex: axisTarget.index })
        : focusState.activeCellPos !== null
          ? getTableAxisSelectionModel(editor, focusState.activeCellPos, source)
          : null;

    if (!payload) {
      return null;
    }

    return {
      source,
      axisIndex: axisTarget?.kind === source ? axisTarget.index : (axisModel?.index ?? null),
      cellPositions: axisModel?.cellPositions ?? [],
      text: payload.text,
      html: payload.html,
    };
  }

  const { selection } = editor.state;

  if (selection instanceof CellSelection) {
    const table = parseCellSelectionTable(selection);

    if (table) {
      return {
        source: "selection",
        axisIndex: null,
        cellPositions: getCellSelectionPositions(selection),
        text: parsedClipboardTableToMarkweaveSelectionText(table),
        html: parsedClipboardTableToMarkweaveMenuHtml(table),
      };
    }
  }

  const focusState = getTableFocusState(editor.state);
  const activeCellPos = focusState.activeCellPos;
  const activeCellNode = activeCellPos === null ? null : editor.state.doc.nodeAt(activeCellPos);

  if (!activeCellNode || activeCellPos === null) {
    return null;
  }

  return {
    source: "selection",
    axisIndex: null,
    cellPositions: [activeCellPos],
    text: activeCellNode.textContent,
    html: "",
  };
}

export function TableControls({
  active,
  editor,
  interactionState = initialTableInteractionState,
  messages = defaultTableMessages,
  onCopyPayload,
  onCommandResult,
  onEditWithAi,
}: TableControlsProps) {
  const [openMenu, setOpenMenu] = useState<TableMenuKind | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<TableMenuAnchor>("row-edge");
  const [menuPosition, setMenuPosition] = useState<TableMenuPosition | null>(null);
  const [rowEdgePosition, setRowEdgePosition] = useState<TableEdgeHandlePosition | null>(null);
  const [columnEdgePosition, setColumnEdgePosition] = useState<TableEdgeHandlePosition | null>(null);
  const [selectionEdgePosition, setSelectionEdgePosition] = useState<TableEdgeHandlePosition | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<TableCopyFeedbackSnapshot | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const rowEdgeRef = useRef<HTMLButtonElement | null>(null);
  const columnEdgeRef = useRef<HTMLButtonElement | null>(null);
  const selectionEdgeRef = useRef<HTMLButtonElement | null>(null);
  const focusState = active ? getTableFocusState(editor.state) : null;

  useEffect(() => {
    if (!copyFeedback) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setCopyFeedback(null);
    }, tableCopyFeedbackTimeoutMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copyFeedback]);

  useLayoutEffect(() => {
    if (!active) {
      setRowEdgePosition(null);
      setColumnEdgePosition(null);
      setSelectionEdgePosition(null);
      setCopyFeedback(null);
      return undefined;
    }

    const updateEdgePositions = () => {
      const frameElement = getEditorFrameElement(editor);
      const rowAxisModel = getTableControlAxisSelectionModel(editor, interactionState, "row", focusState?.activeCellPos ?? null);
      const columnAxisModel = getTableControlAxisSelectionModel(editor, interactionState, "column", focusState?.activeCellPos ?? null);
      const rowAxisRect = rowAxisModel ? getTableAxisTargetRect(editor, rowAxisModel) : null;
      const columnAxisRect = columnAxisModel ? getTableAxisTargetRect(editor, columnAxisModel) : null;
      const selectionRect = getAvailableCellMenuCommandSpecs(editor).length > 0 ? getTableSelectionTargetRect(editor) : null;

      if (!frameElement) {
        setRowEdgePosition(null);
        setColumnEdgePosition(null);
        setSelectionEdgePosition(null);
        return;
      }

      const frameRect = frameElement.getBoundingClientRect();

      if (rowAxisRect) {
        setRowEdgePosition(
          calculateTableEdgeHandlePosition({
            targetRect: rowAxisRect,
            frameRect,
            kind: "row",
          }),
        );
      } else if (!(openMenu === "row" && menuAnchor === "row-edge")) {
        setRowEdgePosition(null);
      }

      if (columnAxisRect) {
        setColumnEdgePosition(
          calculateTableEdgeHandlePosition({
            targetRect: columnAxisRect,
            frameRect,
            kind: "column",
          }),
        );
      } else if (!(openMenu === "column" && menuAnchor === "column-edge")) {
        setColumnEdgePosition(null);
      }

      if (selectionRect) {
        setSelectionEdgePosition(
          calculateTableEdgeHandlePosition({
            targetRect: selectionRect,
            frameRect,
            kind: "selection",
          }),
        );
      } else if (!(openMenu === "selection" && menuAnchor === "selection-edge")) {
        setSelectionEdgePosition(null);
      }
    };

    updateEdgePositions();
    window.addEventListener("resize", updateEdgePositions);
    window.addEventListener("scroll", updateEdgePositions, true);

    return () => {
      window.removeEventListener("resize", updateEdgePositions);
      window.removeEventListener("scroll", updateEdgePositions, true);
    };
  }, [
    active,
    editor,
    focusState?.activeCellPos,
    focusState?.selectionFrom,
    focusState?.selectionTo,
    interactionState.hoverCellPos,
    interactionState.hoverVisualColumnIndex,
    interactionState.hoverVisualRowIndex,
    menuAnchor,
    openMenu,
  ]);

  useLayoutEffect(() => {
    if (!active || !openMenu) {
      setMenuPosition(null);
      return undefined;
    }

    const updateMenuPosition = () => {
      const frameElement = getEditorFrameElement(editor);
      const anchorElement =
        menuAnchor === "row-edge" ? rowEdgeRef.current : menuAnchor === "column-edge" ? columnEdgeRef.current : selectionEdgeRef.current;
      const menuElement = menuRef.current;

      if (!frameElement || !anchorElement || !menuElement) {
        setMenuPosition(null);
        return;
      }

      const rawAnchorRect = anchorElement.getBoundingClientRect();
      const tableRect = openMenu === "row" ? getActiveTableElement(editor)?.getBoundingClientRect() : null;
      const anchorRect = tableRect
        ? {
            left: rawAnchorRect.left,
            top: tableRect.top,
            width: rawAnchorRect.width,
            height: rawAnchorRect.height,
          }
        : rawAnchorRect;
      const frameRect = frameElement.getBoundingClientRect();
      const menuRect = menuElement.getBoundingClientRect();
      const anchorMenuPosition = calculateAnchoredTableMenuPosition({
        anchorRect,
        frameRect,
        menuSize: {
          width: menuRect.width || 204,
          height: menuRect.height || 220,
        },
        kind: openMenu,
      });

      setMenuPosition(anchorMenuPosition);
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [active, editor, menuAnchor, openMenu, rowEdgePosition, columnEdgePosition, selectionEdgePosition]);

  useEffect(() => {
    if (!active || !openMenu) {
      return undefined;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setOpenMenu(null);
      editor.view.focus();
    };

    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (event.target instanceof Node && controlsRef.current?.contains(event.target)) {
        return;
      }

      setOpenMenu(null);
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsidePointer);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsidePointer);
    };
  }, [active, editor, openMenu]);

  if (!active) {
    return null;
  }

  const toggleMenu = (menu: TableMenuKind, anchor: TableMenuAnchor) => {
    const shouldClose = openMenu === menu && menuAnchor === anchor;
    setMenuAnchor(anchor);
    setOpenMenu(shouldClose ? null : menu);
  };

  const clearMenuAxisTarget = () => {
    editor.view.dispatch(setMarkweaveTableMenuAxisTarget(editor.state.tr, null));
  };

  const openAxisMenuFromEdge = (menu: TableCommandMenuKind, anchor: Extract<TableMenuAnchor, "row-edge" | "column-edge">) => {
    const targetCellPos = interactionState.hoverCellPos ?? focusState?.activeCellPos ?? null;
    const visualIndex = interactionState.hoverCellPos === null ? null : menu === "row" ? interactionState.hoverVisualRowIndex : interactionState.hoverVisualColumnIndex;

    if (targetCellPos !== null) {
      selectTableAxisFromCell(editor, targetCellPos, menu, { visualIndex });
    }

    toggleMenu(menu, anchor);
  };

  const openSelectionMenuFromEdge = () => {
    clearMenuAxisTarget();
    toggleMenu("selection", "selection-edge");
  };

  const rowAxisModel = getTableControlAxisSelectionModel(editor, interactionState, "row", focusState?.activeCellPos ?? null);
  const columnAxisModel = getTableControlAxisSelectionModel(editor, interactionState, "column", focusState?.activeCellPos ?? null);
  const cellMenuCommands = getAvailableCellMenuCommandSpecs(editor);
  const hasCellMenuCommands = cellMenuCommands.length > 0;
  const menuItems = openMenu ? getTableMenuItems(editor, openMenu) : [];
  const runMenuCommand = async (commandId: TableCommandId, menuOverride?: TableMenuKind) => {
    const menu = menuOverride ?? openMenu ?? "selection";
    const command = tableCommandSpecs.find((candidate) => candidate.id === commandId);
    const copyKind = getCopyKindForTableCommand(commandId);
    const copyPayload = copyKind ? getMarkweaveMenuCopyPayloadFromState(editor.state, copyKind) : null;
    const before = getTableCommandSnapshot(editor);

    const result = await Promise.resolve(runTableCommand(editor, commandId));
    const after = getTableCommandSnapshot(editor);

    if (copyPayload) {
      setCopyFeedback(getTableCopyFeedbackSnapshot(copyPayload, messages));
      onCopyPayload?.(copyPayload);
    } else {
      setCopyFeedback(null);
    }

    onCommandResult?.({
      commandId,
      label: command?.label ?? commandId,
      menu,
      success: Boolean(result),
      before,
      after,
      copyPayload: copyPayload
        ? {
            kind: copyPayload.kind,
            text: copyPayload.text,
            htmlLength: copyPayload.html.length,
          }
        : null,
    });

    return result;
  };

  const runEditWithAi = (source: TableEditWithAiRequest["source"]) => {
    const request = getTableEditWithAiRequest(editor, source);

    if (request) {
      onEditWithAi?.(request);
    }

    setOpenMenu(null);
    editor.view.focus();
  };

  return (
    <div
      ref={controlsRef}
      className="markweave-table-controls"
      data-testid="markweave-table-controls"
      aria-label={messages.table.controlsAriaLabel}
      data-open-menu={openMenu ?? "none"}
      data-positioned={rowEdgePosition || columnEdgePosition || selectionEdgePosition ? "true" : "false"}
    >
      {copyFeedback ? (
        <div
          className="markweave-table-copy-feedback"
          role="status"
          aria-live="polite"
          data-testid="markweave-table-copy-feedback"
          data-copy-kind={copyFeedback.kind}
          data-text-length={copyFeedback.textLength}
          data-html-length={copyFeedback.htmlLength}
        >
          {formatTableCopyFeedback(copyFeedback)}
        </div>
      ) : null}
      {rowEdgePosition ? (
        <button
          type="button"
          ref={rowEdgeRef}
          className="markweave-table-edge-handle markweave-table-edge-handle--row"
          aria-label={messages.table.activeRowActions}
          aria-expanded={openMenu === "row" && menuAnchor === "row-edge"}
          aria-haspopup="menu"
          title={messages.table.rowActions}
          data-testid="markweave-table-hover-row-handle"
          data-axis-index={rowAxisModel?.index ?? ""}
          data-axis-selected-cells={rowAxisModel?.selectedCellCount ?? ""}
          data-axis-visual-cells={rowAxisModel?.visualCellCount ?? ""}
          data-axis-visual-size={rowAxisModel?.visualHeight ?? ""}
          style={{ left: rowEdgePosition.left, top: rowEdgePosition.top }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            openAxisMenuFromEdge("row", "row-edge");
          }}
        >
          <span aria-hidden="true">...</span>
        </button>
      ) : null}
      {columnEdgePosition ? (
        <button
          type="button"
          ref={columnEdgeRef}
          className="markweave-table-edge-handle markweave-table-edge-handle--column"
          aria-label={messages.table.activeColumnActions}
          aria-expanded={openMenu === "column" && menuAnchor === "column-edge"}
          aria-haspopup="menu"
          title={messages.table.columnActions}
          data-testid="markweave-table-hover-column-handle"
          data-axis-index={columnAxisModel?.index ?? ""}
          data-axis-selected-cells={columnAxisModel?.selectedCellCount ?? ""}
          data-axis-visual-cells={columnAxisModel?.visualCellCount ?? ""}
          data-axis-visual-size={columnAxisModel?.visualWidth ?? ""}
          style={{ left: columnEdgePosition.left, top: columnEdgePosition.top }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            openAxisMenuFromEdge("column", "column-edge");
          }}
        >
          <span aria-hidden="true">...</span>
        </button>
      ) : null}
      {hasCellMenuCommands && selectionEdgePosition ? (
        <button
          type="button"
          ref={selectionEdgeRef}
          className="markweave-table-edge-handle markweave-table-edge-handle--selection"
          aria-label={messages.table.selectionActions}
          aria-expanded={openMenu === "selection" && menuAnchor === "selection-edge"}
          aria-haspopup="menu"
          title={messages.table.selectionActions}
          data-testid="markweave-table-cell-handle"
          style={{ left: selectionEdgePosition.left, top: selectionEdgePosition.top }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openSelectionMenuFromEdge}
        >
          <span aria-hidden="true">...</span>
        </button>
      ) : null}
      {openMenu ? (
        <div
          ref={menuRef}
          className="markweave-table-menu"
          role="menu"
          aria-label={tableMenuLabel(openMenu, messages)}
          data-testid="markweave-table-menu"
          data-positioned={menuPosition ? "true" : "false"}
          style={menuPosition ? { left: menuPosition.left, top: menuPosition.top } : undefined}
        >
          {menuItems.map((item, index) => (
            (() => {
              const group = getTableMenuItemGroup(item);
              const previousGroup = index === 0 ? group : getTableMenuItemGroup(menuItems[index - 1]);
              const startsGroup = index > 0 && previousGroup !== group;
              const enabled = item.commandId === null ? Boolean(onEditWithAi) : canRunTableCommand(editor, item.commandId);
              const label = getTableMenuItemLabel(item, messages);

              return (
                <button
                  key={`${item.id}-${index}`}
                  type="button"
                  role="menuitem"
                  aria-label={label}
                  aria-disabled={!enabled}
                  disabled={!enabled}
                  data-menu-group={group}
                  data-starts-group={startsGroup ? "true" : "false"}
                  data-command-enabled={enabled ? "true" : "false"}
                  data-testid={
                    item.commandId
                      ? `markweave-table-menu-command-${item.commandId}`
                      : `markweave-table-menu-command-edit-with-ai`
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (!enabled) {
                      return;
                    }

                    if (item.commandId === null) {
                      runEditWithAi(openMenu === "row" || openMenu === "column" ? openMenu : "selection");
                      return;
                    }

                    void runMenuCommand(item.commandId).finally(() => setOpenMenu(null));
                  }}
                >
                  {label}
                </button>
              );
            })()
          ))}
        </div>
      ) : null}
    </div>
  );
}
