import { Extension } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { CellSelection, addRow, cellAround, findCell, nextCell, selectedRect, TableMap } from "@tiptap/pm/tables";

export type TableArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";
type TableArrowAxis = "horiz" | "vert";
type CellBoundaryTarget = "start" | "end";

export interface MarkweaveTableArrowShortcut {
  readonly key: TableArrowKey;
  readonly axis: TableArrowAxis;
  readonly direction: -1 | 1;
  readonly sourceBoundary: CellBoundaryTarget;
  readonly targetBoundary: CellBoundaryTarget;
  readonly supportStatus: "supported";
  readonly implementationStatus: "verified";
}

export const markweaveTableArrowShortcuts: readonly MarkweaveTableArrowShortcut[] = [
  {
    key: "ArrowLeft",
    axis: "horiz",
    direction: -1,
    sourceBoundary: "start",
    targetBoundary: "end",
    supportStatus: "supported",
    implementationStatus: "verified",
  },
  {
    key: "ArrowRight",
    axis: "horiz",
    direction: 1,
    sourceBoundary: "end",
    targetBoundary: "start",
    supportStatus: "supported",
    implementationStatus: "verified",
  },
  {
    key: "ArrowUp",
    axis: "vert",
    direction: -1,
    sourceBoundary: "start",
    targetBoundary: "end",
    supportStatus: "supported",
    implementationStatus: "verified",
  },
  {
    key: "ArrowDown",
    axis: "vert",
    direction: 1,
    sourceBoundary: "end",
    targetBoundary: "start",
    supportStatus: "supported",
    implementationStatus: "verified",
  },
] as const;

interface CellTextBoundaries {
  readonly firstTextStart: number;
  readonly lastTextEnd: number;
}

function getActiveTableCell(state: EditorState) {
  const { selection } = state;

  if (selection instanceof CellSelection) {
    return selection.$headCell;
  }

  if (!(selection instanceof TextSelection) || !selection.empty) {
    return null;
  }

  return cellAround(selection.$from);
}

function getAnchorTableCell(state: EditorState) {
  const { selection } = state;

  if (selection instanceof CellSelection) {
    return selection.$anchorCell;
  }

  if (!(selection instanceof TextSelection)) {
    return null;
  }

  return cellAround(selection.$from);
}

function getCellTextBoundaries($cell: ResolvedPos): CellTextBoundaries | null {
  const cell = $cell.nodeAfter;

  if (!cell) {
    return null;
  }

  let firstTextStart: number | null = null;
  let lastTextEnd: number | null = null;
  const cellContentStart = $cell.pos + 1;

  cell.descendants((node, relativePos) => {
    if (!node.isTextblock) {
      return true;
    }

    const textStart = cellContentStart + relativePos + 1;
    const textEnd = textStart + node.content.size;

    firstTextStart ??= textStart;
    lastTextEnd = textEnd;

    return false;
  });

  if (firstTextStart === null || lastTextEnd === null) {
    return null;
  }

  return { firstTextStart, lastTextEnd };
}

function isAtBoundary(state: EditorState, $cell: ResolvedPos, boundary: CellBoundaryTarget) {
  const boundaries = getCellTextBoundaries($cell);

  if (!boundaries) {
    return false;
  }

  const cursorPosition = state.selection.from;
  return boundary === "start"
    ? cursorPosition === boundaries.firstTextStart
    : cursorPosition === boundaries.lastTextEnd;
}

function cellHasInlineHardBreak($cell: ResolvedPos) {
  const cell = $cell.nodeAfter;
  let hasHardBreak = false;

  cell?.descendants((node) => {
    if (hasHardBreak) {
      return false;
    }

    if (node.type.name === "hardBreak") {
      hasHardBreak = true;
      return false;
    }

    return true;
  });

  return hasHardBreak;
}

function shouldLetVerticalTextSelectionHandleShiftArrow(
  state: EditorState,
  $headCell: ResolvedPos,
  shortcut: MarkweaveTableArrowShortcut,
) {
  return (
    shortcut.axis === "vert" &&
    state.selection instanceof TextSelection &&
    state.selection.empty &&
    cellHasInlineHardBreak($headCell) &&
    !isAtBoundary(state, $headCell, shortcut.sourceBoundary)
  );
}

function moveToCellBoundary(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  $targetCell: ResolvedPos,
  boundary: CellBoundaryTarget,
) {
  const boundaries = getCellTextBoundaries($targetCell);

  if (!boundaries) {
    return false;
  }

  if (dispatch) {
    const targetPosition = boundary === "start" ? boundaries.firstTextStart : boundaries.lastTextEnd;
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, targetPosition)).scrollIntoView());
  }

  return true;
}

function getCellAtTableMapPoint(doc: EditorState["doc"], tableStart: number, rowIndex: number, columnIndex: number) {
  const table = doc.nodeAt(tableStart - 1);

  if (!table) {
    return null;
  }

  const map = TableMap.get(table);
  const clampedRow = Math.min(map.height - 1, Math.max(0, rowIndex));
  const clampedColumn = Math.min(map.width - 1, Math.max(0, columnIndex));
  const relativeCellPos = map.map[clampedRow * map.width + clampedColumn];

  if (relativeCellPos === undefined) {
    return null;
  }

  return doc.resolve(tableStart + relativeCellPos);
}

function appendBottomRowAtCellBoundary(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  $cell: ResolvedPos,
  selectionKind: "cursor" | "cell-selection",
  $anchorCell?: ResolvedPos,
) {
  const rect = selectedRect(state);
  const cellRect = findCell($cell);

  if (cellRect.bottom !== rect.map.height) {
    return false;
  }

  if (!dispatch) {
    return true;
  }

  const targetColumn = cellRect.left;
  const tr = addRow(state.tr, rect, rect.map.height);
  const targetCell = getCellAtTableMapPoint(tr.doc, rect.tableStart, rect.map.height, targetColumn);

  if (!targetCell) {
    return false;
  }

  if (selectionKind === "cell-selection") {
    const anchorPosition = tr.mapping.map(($anchorCell ?? $cell).pos);
    dispatch(tr.setSelection(CellSelection.create(tr.doc, anchorPosition, targetCell.pos)).scrollIntoView());
    return true;
  }

  const boundaries = getCellTextBoundaries(targetCell);

  if (!boundaries) {
    return false;
  }

  dispatch(tr.setSelection(TextSelection.create(tr.doc, boundaries.firstTextStart)).scrollIntoView());
  return true;
}

function moveAcrossTableBoundary(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, shortcut: MarkweaveTableArrowShortcut) {
  const $cell = getActiveTableCell(state);

  if (!$cell || !isAtBoundary(state, $cell, shortcut.sourceBoundary)) {
    return false;
  }

  const $nextCell = nextCell($cell, shortcut.axis, shortcut.direction);

  if (!$nextCell) {
    if (shortcut.key === "ArrowDown") {
      return appendBottomRowAtCellBoundary(state, dispatch, $cell, "cursor");
    }

    return false;
  }

  return moveToCellBoundary(state, dispatch, $nextCell, shortcut.targetBoundary);
}

export function getMarkweaveTableArrowShortcut(key: TableArrowKey) {
  return markweaveTableArrowShortcuts.find((shortcut) => shortcut.key === key) ?? null;
}

export function runMarkweaveTableArrowKey(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  key: TableArrowKey,
) {
  const shortcut = getMarkweaveTableArrowShortcut(key);

  if (!shortcut) {
    return false;
  }

  return moveAcrossTableBoundary(state, dispatch, shortcut);
}

export function runMarkweaveTableShiftArrowKey(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  key: TableArrowKey,
) {
  const shortcut = getMarkweaveTableArrowShortcut(key);

  if (!shortcut) {
    return false;
  }

  const $anchorCell = getAnchorTableCell(state);
  const $headCell = getActiveTableCell(state);

  if (!$anchorCell || !$headCell) {
    return false;
  }

  if (shouldLetVerticalTextSelectionHandleShiftArrow(state, $headCell, shortcut)) {
    return false;
  }

  const $nextCell = nextCell($headCell, shortcut.axis, shortcut.direction);

  if (!$nextCell) {
    if (shortcut.key === "ArrowDown") {
      return appendBottomRowAtCellBoundary(state, dispatch, $headCell, "cell-selection", $anchorCell);
    }

    return false;
  }

  if (dispatch) {
    dispatch(state.tr.setSelection(CellSelection.create(state.doc, $anchorCell.pos, $nextCell.pos)).scrollIntoView());
  }

  return true;
}

export const MarkweaveTableArrowNavigation = Extension.create({
  name: "markweaveTableArrowNavigation",
  priority: 990,

  addKeyboardShortcuts() {
    return Object.fromEntries(
      markweaveTableArrowShortcuts.flatMap((shortcut) => [
        [
          `Shift-${shortcut.key}`,
          () =>
            runMarkweaveTableShiftArrowKey(
              this.editor.state,
              this.editor.view.dispatch.bind(this.editor.view),
              shortcut.key,
            ),
        ],
        [
          shortcut.key,
          () =>
            runMarkweaveTableArrowKey(
              this.editor.state,
              this.editor.view.dispatch.bind(this.editor.view),
              shortcut.key,
            ),
        ],
      ]),
    );
  },
});
