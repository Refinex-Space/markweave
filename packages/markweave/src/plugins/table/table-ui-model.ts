import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection, findCell, isInTable, selectedRect, TableMap } from "@tiptap/pm/tables";
import type { TableCommandResult, TableCommandSnapshot, TableEditWithAiRequest } from "../../core/public-types";
import { getMarkweaveVisibleBoundaryRect } from "../../core/visible-boundary";
import { getMarkweaveMessages, type MarkweaveMessages } from "../../i18n";
import {
  getMarkweaveMenuCopyPayloadFromState,
  getMarkweaveTableMenuAxisTarget,
  parseCellSelectionTable,
  parsedClipboardTableToMarkweaveMenuHtml,
  parsedClipboardTableToMarkweaveSelectionText,
  setMarkweaveTableMenuAxisTarget,
  type MarkweaveMenuCopyPayload,
  type TableMenuCopyKind,
} from "./table-clipboard";
import { canRunMarkweaveTableCommand, runMarkweaveTableCommand } from "./table-command-runtime";
import {
  isMarkweaveTableCapabilityAllowed,
  isMarkweaveTableCommandAllowed,
} from "./table-capabilities";
export { moveTargetedTableAxis } from "./table-command-runtime";
export {
  applyTableAxisAlignment,
  applyTableAxisBackgroundColor,
  applyTableAxisTextColor,
  getTableAxisFormattingState,
  tableColorOptions,
  tableHorizontalAlignmentOptions,
  tableVerticalAlignmentOptions,
  type TableAlignmentId,
  type TableColorId,
} from "./table-formatting";
import {
  getExecutableTableMenuCommandSpecs,
  askAiTableMenuItem,
  tableCommandSpecs,
  tableMenuSpecs,
  type TableCommandId,
  type TableCommandMenuKind,
  type TableMenuItemSpec,
} from "./table-command-spec";
import { getFirstTableDebugSnapshot } from "./table-debug-snapshot";
import { getTableFocusState } from "./table-focus-state";
import { type TableInteractionState, type TableSelectionOverlayState } from "./table-interaction-layer";

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

export type TableFloatingMenuPlacement = "top" | "right" | "bottom" | "left";

export interface TableFloatingMenuPosition extends TableMenuPosition {
  readonly placement: TableFloatingMenuPlacement;
  readonly maxHeight: number;
}

export interface TableSubmenuPosition extends TableMenuPosition {
  readonly placement: "left" | "right";
  readonly maxHeight: number;
}

export interface TableEdgeHandlePosition {
  readonly left: number;
  readonly top: number;
}

export interface TableAxisHandleLayout extends TableEdgeHandlePosition {
  readonly width: number;
  readonly height: number;
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

export interface TableSelectionOverlayRect {
  readonly axisTarget: "row" | "column" | null;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly selectedCellCount: number;
  readonly visualColumnCount: number;
  readonly visualRowCount: number;
  readonly visualSlotCount: number;
  readonly anchorCellPos: number | null;
  readonly headCellPos: number | null;
}

interface RectSlice {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface ClipboardWriter {
  readonly write?: (items: ClipboardItem[]) => Promise<void>;
  readonly writeText?: (text: string) => Promise<void>;
}

export type TableMenuKind = TableCommandMenuKind | "selection";
export type TableMenuAnchor = "row-edge" | "column-edge" | "selection-edge";

const defaultTableMessages = getMarkweaveMessages("zh");
export const tableCopyFeedbackTimeoutMs = 5000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getRectRight(rect: TableControlsRect) {
  return rect.left + rect.width;
}

function getRectBottom(rect: TableControlsRect) {
  return rect.top + rect.height;
}

function intersectTableControlRects(first: TableControlsRect, second: TableControlsRect): TableControlsRect {
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  const right = Math.max(left, Math.min(getRectRight(first), getRectRight(second)));
  const bottom = Math.max(top, Math.min(getRectBottom(first), getRectBottom(second)));

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function insetTableControlRect(rect: TableControlsRect, padding: number): TableControlsRect {
  const horizontalPadding = Math.min(padding, rect.width / 2);
  const verticalPadding = Math.min(padding, rect.height / 2);

  return {
    left: rect.left + horizontalPadding,
    top: rect.top + verticalPadding,
    width: Math.max(0, rect.width - horizontalPadding * 2),
    height: Math.max(0, rect.height - verticalPadding * 2),
  };
}

function getPositioningBoundary(
  frameRect: TableControlsRect,
  boundaryRect: TableControlsRect | undefined,
  boundaryPadding: number,
) {
  return insetTableControlRect(intersectTableControlRects(frameRect, boundaryRect ?? frameRect), boundaryPadding);
}

/**
 * Returns the part of the editor frame that is visible through the viewport and
 * every clipping ancestor. All values stay in viewport coordinates so adapters
 * can share the same positioning calculations.
 */
export function getTableMenuBoundaryRect(frameElement: HTMLElement): TableControlsRect {
  return getMarkweaveVisibleBoundaryRect(frameElement);
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
  readonly boundaryRect?: TableControlsRect;
  readonly menuSize: { readonly width: number; readonly height: number };
  readonly kind: "row" | "column" | "selection";
  readonly offset?: number;
  readonly boundaryPadding?: number;
}): TableFloatingMenuPosition {
  const offset = input.offset ?? 6;
  const boundaryPadding = input.boundaryPadding ?? 8;
  const boundary = getPositioningBoundary(input.frameRect, input.boundaryRect, boundaryPadding);
  const anchorRight = getRectRight(input.anchorRect);
  const anchorBottom = getRectBottom(input.anchorRect);
  const availableByPlacement: Readonly<Record<TableFloatingMenuPlacement, number>> = {
    top: Math.max(0, input.anchorRect.top - offset - boundary.top),
    right: Math.max(0, getRectRight(boundary) - anchorRight - offset),
    bottom: Math.max(0, getRectBottom(boundary) - anchorBottom - offset),
    left: Math.max(0, input.anchorRect.left - offset - boundary.left),
  };
  const preferredPlacements: readonly TableFloatingMenuPlacement[] =
    input.kind === "row" ? ["right", "left", "bottom", "top"] : ["bottom", "top", "right", "left"];
  const requiredByPlacement = (placement: TableFloatingMenuPlacement) =>
    placement === "left" || placement === "right" ? input.menuSize.width : input.menuSize.height;
  const placement =
    preferredPlacements.find((candidate) => availableByPlacement[candidate] >= requiredByPlacement(candidate)) ??
    preferredPlacements.reduce((best, candidate) => {
      const candidateVisibleRatio = Math.min(1, availableByPlacement[candidate] / Math.max(1, requiredByPlacement(candidate)));
      const bestVisibleRatio = Math.min(1, availableByPlacement[best] / Math.max(1, requiredByPlacement(best)));
      return candidateVisibleRatio > bestVisibleRatio ? candidate : best;
    });
  const maxHeight = Math.max(
    1,
    Math.min(
      input.menuSize.height,
      placement === "top" || placement === "bottom" ? availableByPlacement[placement] : boundary.height,
    ),
  );
  const renderedWidth = Math.min(input.menuSize.width, boundary.width);
  const renderedHeight = Math.min(input.menuSize.height, maxHeight, boundary.height);
  const centeredLeft = input.anchorRect.left + input.anchorRect.width / 2 - Math.min(24, renderedWidth / 2);
  let rawLeft = centeredLeft;
  let rawTop = input.anchorRect.top - 2;

  if (placement === "right") {
    rawLeft = anchorRight + offset;
  } else if (placement === "left") {
    rawLeft = input.anchorRect.left - renderedWidth - offset;
  } else if (placement === "bottom") {
    rawTop = anchorBottom + offset;
  } else {
    rawTop = input.anchorRect.top - renderedHeight - offset;
  }

  const maxLeft = Math.max(boundary.left, getRectRight(boundary) - renderedWidth);
  const maxTop = Math.max(boundary.top, getRectBottom(boundary) - renderedHeight);

  return {
    left: Math.round(clamp(rawLeft, boundary.left, maxLeft) - input.frameRect.left),
    top: Math.round(clamp(rawTop, boundary.top, maxTop) - input.frameRect.top),
    placement,
    maxHeight: Math.round(maxHeight),
  };
}

export function calculateAnchoredTableSubmenuPosition(input: {
  readonly triggerRect: TableControlsRect;
  readonly parentMenuRect: TableControlsRect;
  readonly boundaryRect: TableControlsRect;
  readonly submenuSize: { readonly width: number; readonly height: number };
  readonly offset?: number;
  readonly boundaryPadding?: number;
}): TableSubmenuPosition {
  const offset = input.offset ?? 6;
  const boundaryPadding = input.boundaryPadding ?? 8;
  const boundary = insetTableControlRect(input.boundaryRect, boundaryPadding);
  const availableRight = Math.max(0, getRectRight(boundary) - getRectRight(input.parentMenuRect) - offset);
  const availableLeft = Math.max(0, input.parentMenuRect.left - offset - boundary.left);
  const placement: "left" | "right" =
    availableRight >= input.submenuSize.width || availableRight >= availableLeft ? "right" : "left";
  const maxHeight = Math.max(1, Math.min(input.submenuSize.height, boundary.height));
  const renderedWidth = Math.min(input.submenuSize.width, boundary.width);
  const renderedHeight = Math.min(input.submenuSize.height, maxHeight);
  const rawLeft =
    placement === "right"
      ? getRectRight(input.parentMenuRect) + offset
      : input.parentMenuRect.left - renderedWidth - offset;
  const rawTop = input.triggerRect.top - 5;
  const maxLeft = Math.max(boundary.left, getRectRight(boundary) - renderedWidth);
  const maxTop = Math.max(boundary.top, getRectBottom(boundary) - renderedHeight);

  return {
    left: Math.round(clamp(rawLeft, boundary.left, maxLeft) - input.parentMenuRect.left),
    top: Math.round(clamp(rawTop, boundary.top, maxTop) - input.parentMenuRect.top),
    placement,
    maxHeight: Math.round(maxHeight),
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
      ? input.targetRect.left - input.frameRect.left - offset
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

export function calculateTableAxisHandleLayout(input: {
  readonly targetRect: TableControlsRect;
  readonly frameRect: TableControlsRect;
  readonly kind: "row" | "column" | "selection";
  readonly gap?: number;
}): TableAxisHandleLayout {
  const gap = input.gap ?? 4;

  if (input.kind === "row") {
    return {
      left: Math.round(input.targetRect.left - input.frameRect.left - 12 - gap),
      top: Math.round(input.targetRect.top - input.frameRect.top),
      width: 12,
      height: Math.round(input.targetRect.height),
    };
  }

  if (input.kind === "column") {
    return {
      left: Math.round(input.targetRect.left - input.frameRect.left),
      top: Math.round(input.targetRect.top - input.frameRect.top - 12 - gap),
      width: Math.round(input.targetRect.width),
      height: 12,
    };
  }

  return {
    left: Math.round(input.targetRect.left + input.targetRect.width - input.frameRect.left - 8),
    top: Math.round(input.targetRect.top + input.targetRect.height - input.frameRect.top - 8),
    width: 16,
    height: 16,
  };
}

export function calculateTableExtendButtonLayout(input: {
  readonly tableRect: TableControlsRect;
  readonly frameRect: TableControlsRect;
  readonly kind: "row" | "column";
  readonly gap?: number;
}): TableAxisHandleLayout {
  const gap = input.gap ?? 8;

  return input.kind === "row"
    ? {
        left: Math.round(input.tableRect.left - input.frameRect.left),
        top: Math.round(input.tableRect.top + input.tableRect.height - input.frameRect.top + gap),
        width: Math.round(input.tableRect.width),
        height: 12,
      }
    : {
        left: Math.round(input.tableRect.left + input.tableRect.width - input.frameRect.left + gap),
        top: Math.round(input.tableRect.top - input.frameRect.top),
        width: 12,
        height: Math.round(input.tableRect.height),
      };
}

export function getEditorFrameElement(editor: Editor) {
  return editor.view.dom.closest<HTMLElement>(".markweave-editor-frame") ?? editor.view.dom.parentElement;
}

export function getCellElementByPos(editor: Editor, cellPos: number) {
  const cellDom = editor.view.nodeDOM(cellPos);

  if (!(cellDom instanceof Element)) {
    return null;
  }

  return cellDom.matches("td, th") ? (cellDom as HTMLElement) : cellDom.closest<HTMLElement>("td, th");
}

export function getActiveCellElement(editor: Editor) {
  const activeCellPos = getTableFocusState(editor.state).activeCellPos;

  if (activeCellPos === null) {
    return null;
  }

  return getCellElementByPos(editor, activeCellPos);
}

export function getActiveTableElement(editor: Editor) {
  return getActiveCellElement(editor)?.closest<HTMLElement>("table") ?? null;
}

export function getTableAxisDropIndexAtPoint(editor: Editor, axis: "row" | "column", clientX: number, clientY: number) {
  const table = getActiveTableElement(editor) as HTMLTableElement | null;

  if (!table) {
    return null;
  }

  if (axis === "row") {
    const rows = Array.from(table.rows);
    if (rows.length === 0) return null;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    rows.forEach((row, index) => {
      const rect = row.getBoundingClientRect();
      const distance = Math.abs(clientY - (rect.top + rect.height / 2));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    return nearestIndex;
  }

  const firstRow = table.rows.item(0);
  if (!firstRow) return null;
  const visualColumns: Array<{ readonly index: number; readonly center: number }> = [];
  let visualIndex = 0;

  Array.from(firstRow.cells).forEach((cell) => {
    const rect = cell.getBoundingClientRect();
    const span = Math.max(1, cell.colSpan);
    const slotWidth = rect.width / span;
    for (let offset = 0; offset < span; offset += 1) {
      visualColumns.push({ index: visualIndex, center: rect.left + slotWidth * (offset + 0.5) });
      visualIndex += 1;
    }
  });

  if (visualColumns.length === 0) return null;
  return visualColumns.reduce((nearest, candidate) =>
    Math.abs(clientX - candidate.center) < Math.abs(clientX - nearest.center) ? candidate : nearest,
  ).index;
}

export function getTableAxisTargetRect(editor: Editor, model: TableAxisSelectionModel): TableControlsRect | null {
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

export function getTableHoverAxisSelectionModel(
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

export function getTableControlAxisSelectionModel(
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

export function getTableSelectionTargetRect(editor: Editor): TableControlsRect | null {
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

export function targetTableAxisFromCell(
  editor: Editor,
  cellPos: number,
  axis: "row" | "column",
  options: { readonly visualIndex?: number | null } = {},
) {
  const model = getTableAxisSelectionModel(editor, cellPos, axis, options);
  const cellNode = editor.state.doc.nodeAt(cellPos);

  if (!model || !cellNode) {
    return false;
  }

  let cursorPosition: number | null = null;
  const cellContentStart = cellPos + 1;

  cellNode.descendants((node, relativePos) => {
    if (!node.isTextblock) {
      return true;
    }

    cursorPosition = cellContentStart + relativePos + 1;
    return false;
  });

  if (cursorPosition === null) {
    return false;
  }

  const selection = TextSelection.create(editor.state.doc, cursorPosition);
  const tr = editor.state.tr.setSelection(selection);

  setMarkweaveTableMenuAxisTarget(tr, { kind: axis, index: model.index });
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
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
  if (!isMarkweaveTableCapabilityAllowed(editor.state, "copy")) {
    return false;
  }

  const payload = getMarkweaveMenuCopyPayloadFromState(editor.state, kind);

  if (!payload) {
    return false;
  }

  return writeMarkweaveMenuPayloadToClipboard(payload, clipboard);
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

export function canRunTableCommand(editor: Editor, commandId: TableCommandId) {
  return canRunMarkweaveTableCommand(editor, commandId);
}

export function runTableCommand(editor: Editor, commandId: TableCommandId, clipboard?: ClipboardWriter) {
  if (!isMarkweaveTableCommandAllowed(editor.state, commandId)) {
    return false;
  }

  switch (commandId) {
    case "copy-row":
      return copyMarkweaveTableMenuPayload(editor, "row", clipboard);
    case "copy-column":
      return copyMarkweaveTableMenuPayload(editor, "column", clipboard);
    case "copy-table":
      return copyMarkweaveTableMenuPayload(editor, "table", clipboard);
    default:
      return runMarkweaveTableCommand(editor, commandId);
  }
}

export function getAvailableCellMenuCommandSpecs(editor: Editor) {
  return ["merge-cells", "split-cell"]
    .map((commandId) => tableCommandSpecs.find((command) => command.id === commandId))
    .filter((command): command is (typeof tableCommandSpecs)[number] => Boolean(command))
    .filter((command) => canRunTableCommand(editor, command.id));
}

function getAxisMenuItems(menu: TableCommandMenuKind) {
  return tableMenuSpecs.filter((item) => item.menu === menu);
}

function getSelectionMenuItems(editor: Editor): readonly TableMenuItemSpec[] {
  const commandSpecs = [
    ...getAvailableCellMenuCommandSpecs(editor),
    ...["copy-table", "delete-table"]
      .map((commandId) => tableCommandSpecs.find((command) => command.id === commandId))
      .filter((command): command is (typeof tableCommandSpecs)[number] => Boolean(command)),
  ];

  return [
    askAiTableMenuItem("row"),
    ...commandSpecs.map((command) => ({
      id: command.id,
      label: command.label,
      menu: "row" as const,
      commandId: command.id,
      submenuId: null,
      icon:
        command.id === "merge-cells"
          ? ("merge" as const)
          : command.id === "split-cell"
            ? ("split" as const)
            : command.id === "copy-table"
              ? ("copy" as const)
              : ("delete" as const),
      group:
        command.id === "merge-cells" || command.id === "split-cell"
          ? ("cell" as const)
          : command.id === "copy-table"
            ? ("copy" as const)
            : ("delete" as const),
      availability: "available" as const,
    })),
  ];
}

export function getTableMenuItems(
  editor: Editor,
  menu: TableMenuKind,
  options: { readonly askAiEnabled?: boolean } = {},
): readonly TableMenuItemSpec[] {
  const items = menu === "selection" ? getSelectionMenuItems(editor) : getAxisMenuItems(menu);
  return items.filter((item) => {
    if (item.id === "edit-with-ai") {
      return options.askAiEnabled === true && isMarkweaveTableCapabilityAllowed(editor.state, "ask-ai");
    }

    if (item.submenuId) {
      return isMarkweaveTableCapabilityAllowed(editor.state, "formatting");
    }

    return item.commandId === null || isMarkweaveTableCommandAllowed(editor.state, item.commandId);
  });
}

export function getTableMenuItemGroup(item: TableMenuItemSpec) {
  return item.group;
}

export function getCopyKindForTableCommand(commandId: TableCommandId): TableMenuCopyKind | null {
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
  if (!isMarkweaveTableCapabilityAllowed(editor.state, "ask-ai")) {
    return null;
  }

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

export function tableMenuLabel(menu: TableMenuKind, messages: MarkweaveMessages = defaultTableMessages) {
  if (menu === "row") {
    return messages.table.rowActions;
  }

  if (menu === "column") {
    return messages.table.columnActions;
  }

  return messages.table.selectionActions;
}

export function getTableCommandLabel(commandId: TableCommandId, messages: MarkweaveMessages = defaultTableMessages) {
  return messages.table.commands[commandId];
}

export function getTableMenuItemLabel(item: TableMenuItemSpec, messages: MarkweaveMessages = defaultTableMessages) {
  if (item.id === "edit-with-ai") {
    return messages.table.commands["edit-with-ai"];
  }

  if (item.submenuId) {
    return messages.table.submenus[item.submenuId];
  }

  return item.commandId ? getTableCommandLabel(item.commandId, messages) : item.label;
}

export async function executeTableMenuCommand(input: {
  readonly editor: Editor;
  readonly commandId: TableCommandId;
  readonly menu: TableMenuKind;
  readonly messages?: MarkweaveMessages;
  readonly clipboard?: ClipboardWriter;
}) {
  const messages = input.messages ?? defaultTableMessages;
  const command = tableCommandSpecs.find((candidate) => candidate.id === input.commandId);
  const copyKind = getCopyKindForTableCommand(input.commandId);
  const copyPayload = copyKind ? getMarkweaveMenuCopyPayloadFromState(input.editor.state, copyKind) : null;
  const before = getTableCommandSnapshot(input.editor);
  const success = Boolean(await Promise.resolve(runTableCommand(input.editor, input.commandId, input.clipboard)));
  const after = getTableCommandSnapshot(input.editor);
  const copyFeedback = copyPayload ? getTableCopyFeedbackSnapshot(copyPayload, messages) : null;
  const commandResult: TableCommandResult = {
    commandId: input.commandId,
    label: command?.label ?? input.commandId,
    menu: input.menu,
    success,
    before,
    after,
    copyPayload: copyPayload
      ? {
          kind: copyPayload.kind,
          text: copyPayload.text,
          htmlLength: copyPayload.html.length,
        }
      : null,
  };

  return {
    success,
    copyPayload,
    copyFeedback,
    commandResult,
  };
}

function getCellOverlaySlice(editor: Editor, cellPos: number, overlayRect: NonNullable<TableSelectionOverlayState["rect"]>): RectSlice | null {
  const cellElement = getCellElementByPos(editor, cellPos);

  if (!cellElement) {
    return null;
  }

  const cellVisualRect = findCell(editor.state.doc.resolve(cellPos));
  const left = Math.max(cellVisualRect.left, overlayRect.left);
  const right = Math.min(cellVisualRect.right, overlayRect.right);
  const top = Math.max(cellVisualRect.top, overlayRect.top);
  const bottom = Math.min(cellVisualRect.bottom, overlayRect.bottom);

  if (left >= right || top >= bottom) {
    return null;
  }

  const cellDomRect = cellElement.getBoundingClientRect();
  const visualWidth = Math.max(1, cellVisualRect.right - cellVisualRect.left);
  const visualHeight = Math.max(1, cellVisualRect.bottom - cellVisualRect.top);

  return {
    left: cellDomRect.left + ((left - cellVisualRect.left) / visualWidth) * cellDomRect.width,
    right: cellDomRect.left + ((right - cellVisualRect.left) / visualWidth) * cellDomRect.width,
    top: cellDomRect.top + ((top - cellVisualRect.top) / visualHeight) * cellDomRect.height,
    bottom: cellDomRect.top + ((bottom - cellVisualRect.top) / visualHeight) * cellDomRect.height,
  };
}

export function measureTableSelectionOverlay(editor: Editor, overlayState: TableSelectionOverlayState): TableSelectionOverlayRect | null {
  if (!overlayState.active || overlayState.cellPositions.length === 0 || !overlayState.rect) {
    return null;
  }

  const frameElement = getEditorFrameElement(editor);

  if (!frameElement) {
    return null;
  }

  const overlayVisualRect = overlayState.rect;
  const cellRects = overlayState.visualCellPositions
    .map((cellPos) => getCellOverlaySlice(editor, cellPos, overlayVisualRect))
    .filter((rect): rect is RectSlice => Boolean(rect));

  if (cellRects.length === 0) {
    return null;
  }

  const frameRect = frameElement.getBoundingClientRect();
  const left = Math.min(...cellRects.map((rect) => rect.left));
  const top = Math.min(...cellRects.map((rect) => rect.top));
  const right = Math.max(...cellRects.map((rect) => rect.right));
  const bottom = Math.max(...cellRects.map((rect) => rect.bottom));

  return {
    axisTarget: overlayState.axisTarget,
    left: Math.round(left - frameRect.left),
    top: Math.round(top - frameRect.top),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
    selectedCellCount: overlayState.selectedCellCount,
    visualColumnCount: overlayState.rect?.width ?? 1,
    visualRowCount: overlayState.rect?.height ?? 1,
    visualSlotCount: overlayState.rect?.slotCount ?? overlayState.selectedCellCount,
    anchorCellPos: overlayState.anchorCellPos,
    headCellPos: overlayState.headCellPos,
  };
}
