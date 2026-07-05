import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { CellSelection, findCell, findCellPos, selectedRect, TableMap } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { getMarkweaveTableMenuAxisTarget } from "./table-clipboard";
import { getTableFocusState } from "./table-focus-state";

export interface TableInteractionState {
  readonly hoverCellPos: number | null;
  readonly hoverVisualRowIndex: number | null;
  readonly hoverVisualColumnIndex: number | null;
  readonly dragAnchorCellPos: number | null;
  readonly dragHeadCellPos: number | null;
  readonly dragAnchorTextPos: number | null;
}

export interface TableSelectionOverlayState {
  readonly active: boolean;
  readonly anchorCellPos: number | null;
  readonly headCellPos: number | null;
  readonly selectedCellCount: number;
  readonly cellPositions: readonly number[];
  readonly rect: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
    readonly slotCount: number;
  } | null;
}

export type TableInteractionMeta =
  | {
      readonly type: "set-hover-cell";
      readonly cellPos: number | null;
      readonly visualRowIndex?: number | null;
      readonly visualColumnIndex?: number | null;
    }
  | {
      readonly type: "start-cell-drag";
      readonly anchorCellPos: number;
      readonly headCellPos: number;
      readonly anchorTextPos: number | null;
      readonly visualRowIndex?: number | null;
      readonly visualColumnIndex?: number | null;
    }
  | {
      readonly type: "update-cell-drag";
      readonly headCellPos: number;
      readonly visualRowIndex?: number | null;
      readonly visualColumnIndex?: number | null;
    }
  | {
      readonly type: "end-cell-drag";
    }
  | {
      readonly type: "clear-hover";
    };

export const tableInteractionPluginKey = new PluginKey<TableInteractionState>("markweaveTableInteractionLayer");

export const initialTableInteractionState: TableInteractionState = {
  hoverCellPos: null,
  hoverVisualRowIndex: null,
  hoverVisualColumnIndex: null,
  dragAnchorCellPos: null,
  dragHeadCellPos: null,
  dragAnchorTextPos: null,
};

function isTableCellNode(node: ProseMirrorNode | null | undefined) {
  return node?.type.name === "tableCell" || node?.type.name === "tableHeader";
}

function addClass(classMap: Map<number, Set<string>>, cellPos: number, className: string) {
  const classes = classMap.get(cellPos) ?? new Set<string>();
  classes.add(className);
  classMap.set(cellPos, classes);
}

function addActiveCellClass(state: EditorState, classMap: Map<number, Set<string>>) {
  const focusState = getTableFocusState(state);

  if (focusState.activeCellPos !== null) {
    addClass(classMap, focusState.activeCellPos, "markweave-active-cell");
  }
}

function addFocusedAxisClasses(state: EditorState, classMap: Map<number, Set<string>>) {
  const focusState = getTableFocusState(state);

  if (focusState.activeCellPos === null || focusState.mode === "cell-selection") {
    return;
  }

  const cellNode = state.doc.nodeAt(focusState.activeCellPos);

  if (!isTableCellNode(cellNode)) {
    return;
  }

  const $cell = state.doc.resolve(focusState.activeCellPos);
  const table = $cell.node(-1);
  const tableStart = $cell.start(-1);
  const map = TableMap.get(table);
  const rect = findCell($cell);
  const rowCells = map.cellsInRect({ left: 0, right: map.width, top: rect.top, bottom: rect.bottom });
  const columnCells = map.cellsInRect({ left: rect.left, right: rect.right, top: 0, bottom: map.height });

  rowCells.forEach((relativePos) => {
    const cellPos = tableStart + relativePos;
    const cellRect = findCell(state.doc.resolve(cellPos));

    addClass(classMap, cellPos, "markweave-active-row");

    if (cellRect.left === 0) {
      addClass(classMap, cellPos, "markweave-active-row-start");
    }

    if (cellRect.right === map.width) {
      addClass(classMap, cellPos, "markweave-active-row-end");
    }
  });

  columnCells.forEach((relativePos) => {
    const cellPos = tableStart + relativePos;
    const cellRect = findCell(state.doc.resolve(cellPos));

    addClass(classMap, cellPos, "markweave-active-column");

    if (cellRect.top === 0) {
      addClass(classMap, cellPos, "markweave-active-column-start");
    }

    if (cellRect.bottom === map.height) {
      addClass(classMap, cellPos, "markweave-active-column-end");
    }
  });
}

function addSelectedCellClasses(state: EditorState, classMap: Map<number, Set<string>>) {
  const { selection } = state;

  if (!(selection instanceof CellSelection)) {
    return;
  }

  const selectionRect = selectedRect(state);

  selection.forEachCell((_node, pos) => {
    addClass(classMap, pos, "markweave-selection-cell");

    if (pos === selection.$anchorCell.pos) {
      addClass(classMap, pos, "markweave-selection-anchor-cell");
    }

    if (pos === selection.$headCell.pos) {
      addClass(classMap, pos, "markweave-selection-head-cell");
    }

    const cellRect = findCell(state.doc.resolve(pos));

    if (cellRect.top === selectionRect.top) {
      addClass(classMap, pos, "markweave-selection-edge-top");
    }

    if (cellRect.right === selectionRect.right) {
      addClass(classMap, pos, "markweave-selection-edge-right");
    }

    if (cellRect.bottom === selectionRect.bottom) {
      addClass(classMap, pos, "markweave-selection-edge-bottom");
    }

    if (cellRect.left === selectionRect.left) {
      addClass(classMap, pos, "markweave-selection-edge-left");
    }
  });
}

function addHoverClasses(state: EditorState, interactionState: TableInteractionState, classMap: Map<number, Set<string>>) {
  if (interactionState.hoverCellPos === null) {
    return;
  }

  const cellNode = state.doc.nodeAt(interactionState.hoverCellPos);

  if (!isTableCellNode(cellNode)) {
    return;
  }

  const $cell = state.doc.resolve(interactionState.hoverCellPos);
  const table = $cell.node(-1);
  const tableStart = $cell.start(-1);
  const map = TableMap.get(table);
  const rect = findCell($cell);
  const rowCells = map.cellsInRect({ left: 0, right: map.width, top: rect.top, bottom: rect.bottom });
  const columnCells = map.cellsInRect({ left: rect.left, right: rect.right, top: 0, bottom: map.height });

  addClass(classMap, interactionState.hoverCellPos, "markweave-hover-cell");

  rowCells.forEach((relativePos) => {
    const cellPos = tableStart + relativePos;
    const cellRect = findCell(state.doc.resolve(cellPos));

    addClass(classMap, cellPos, "markweave-hover-row");

    if (cellRect.left === 0) {
      addClass(classMap, cellPos, "markweave-hover-row-start");
    }

    if (cellRect.right === map.width) {
      addClass(classMap, cellPos, "markweave-hover-row-end");
    }
  });

  columnCells.forEach((relativePos) => {
    const cellPos = tableStart + relativePos;
    const cellRect = findCell(state.doc.resolve(cellPos));

    addClass(classMap, cellPos, "markweave-hover-column");

    if (cellRect.top === 0) {
      addClass(classMap, cellPos, "markweave-hover-column-start");
    }

    if (cellRect.bottom === map.height) {
      addClass(classMap, cellPos, "markweave-hover-column-end");
    }
  });
}

export function getTableInteractionCellClasses(state: EditorState, interactionState: TableInteractionState = initialTableInteractionState) {
  const classMap = new Map<number, Set<string>>();
  addActiveCellClass(state, classMap);
  addSelectedCellClasses(state, classMap);

  return new Map([...classMap.entries()].map(([cellPos, classes]) => [cellPos, [...classes].sort()] as const));
}

export function getTableSelectionOverlayState(state: EditorState): TableSelectionOverlayState {
  const { selection } = state;

  if (!(selection instanceof CellSelection)) {
    return {
      active: false,
      anchorCellPos: null,
      headCellPos: null,
      selectedCellCount: 0,
      cellPositions: [],
      rect: null,
    };
  }

  const cellPositions: number[] = [];
  selection.forEachCell((_node, pos) => {
    cellPositions.push(pos);
  });

  const selectionRect = selectedRect(state);
  const axisTarget = getMarkweaveTableMenuAxisTarget(state);
  const overlayRect =
    axisTarget?.kind === "row" && axisTarget.index >= 0 && axisTarget.index < selectionRect.map.height
      ? {
          left: 0,
          right: selectionRect.map.width,
          top: axisTarget.index,
          bottom: axisTarget.index + 1,
        }
      : axisTarget?.kind === "column" && axisTarget.index >= 0 && axisTarget.index < selectionRect.map.width
        ? {
            left: axisTarget.index,
            right: axisTarget.index + 1,
            top: 0,
            bottom: selectionRect.map.height,
          }
        : selectionRect;

  return {
    active: true,
    anchorCellPos: selection.$anchorCell.pos,
    headCellPos: selection.$headCell.pos,
    selectedCellCount: cellPositions.length,
    cellPositions: cellPositions.sort((left, right) => left - right),
    rect: {
      left: overlayRect.left,
      right: overlayRect.right,
      top: overlayRect.top,
      bottom: overlayRect.bottom,
      width: overlayRect.right - overlayRect.left,
      height: overlayRect.bottom - overlayRect.top,
      slotCount: (overlayRect.right - overlayRect.left) * (overlayRect.bottom - overlayRect.top),
    },
  };
}

export function getTableHoverAxisStartCellPos(
  state: EditorState,
  hoverCellPos: number | null,
  axis: "row" | "column",
  visualIndex?: number | null,
) {
  if (hoverCellPos === null) {
    return null;
  }

  const cellNode = state.doc.nodeAt(hoverCellPos);

  if (!isTableCellNode(cellNode)) {
    return null;
  }

  const $cell = state.doc.resolve(hoverCellPos);
  const table = $cell.node(-1);
  const tableStart = $cell.start(-1);
  const map = TableMap.get(table);
  const rect = findCell($cell);
  const axisIndex = visualIndex ?? (axis === "row" ? rect.top : rect.left);
  const slotIndex = axis === "row" ? axisIndex * map.width : axisIndex;
  const relativeCellPos = map.map[slotIndex];

  return relativeCellPos === undefined ? null : tableStart + relativeCellPos;
}

export function createTableInteractionDecorations(state: EditorState, interactionState: TableInteractionState = initialTableInteractionState) {
  const decorations: Decoration[] = [];

  getTableInteractionCellClasses(state, interactionState).forEach((classes, cellPos) => {
    const cellNode = state.doc.nodeAt(cellPos);

    if (!cellNode || !isTableCellNode(cellNode)) {
      return;
    }

    decorations.push(
      Decoration.node(cellPos, cellPos + cellNode.nodeSize, {
        class: classes.join(" "),
      }),
    );
  });

  return DecorationSet.create(state.doc, decorations);
}

function resolveCellPosFromDom(view: EditorView, target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  const cellElement = target.closest("td, th");

  if (!cellElement || !view.dom.contains(cellElement)) {
    return null;
  }

  try {
    const domPos = view.posAtDOM(cellElement, 0);
    return findCellPos(view.state.doc, domPos)?.pos ?? null;
  } catch {
    return null;
  }
}

interface OptionalCaretRangeDocument {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
}

function getNativeCaretPositionFromPoint(event: MouseEvent) {
  const ownerDocument = event.view?.document ?? document;
  const nativeCaret =
    typeof ownerDocument.caretPositionFromPoint === "function"
      ? ownerDocument.caretPositionFromPoint(event.clientX, event.clientY)
      : null;

  if (nativeCaret) {
    return {
      node: nativeCaret.offsetNode,
      offset: nativeCaret.offset,
    };
  }

  const range = (ownerDocument as unknown as OptionalCaretRangeDocument).caretRangeFromPoint?.(event.clientX, event.clientY);

  if (!range) {
    return null;
  }

  return {
    node: range.startContainer,
    offset: range.startOffset,
  };
}

function getNativeCaretTextPosition(view: EditorView, event: MouseEvent, cellPos: number, cellNode: ProseMirrorNode) {
  const caretPosition = getNativeCaretPositionFromPoint(event);

  if (!caretPosition) {
    return null;
  }

  const cellElement = event.target instanceof Element ? event.target.closest("td, th") : null;

  if (!cellElement || !cellElement.contains(caretPosition.node)) {
    return null;
  }

  try {
    const domPos = view.posAtDOM(caretPosition.node, caretPosition.offset);

    if (domPos > cellPos && domPos < cellPos + cellNode.nodeSize) {
      return domPos;
    }
  } catch {
    return null;
  }

  return null;
}

function findTextNodeForCaretFallback(target: EventTarget | null, cellElement: Element) {
  if (!(target instanceof Node) || !cellElement.contains(target)) {
    return null;
  }

  if (target.nodeType === Node.TEXT_NODE) {
    return target.textContent ? target : null;
  }

  const ownerDocument = target.ownerDocument ?? document;
  const walker = ownerDocument.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const textNode = walker.nextNode();

  return textNode?.textContent ? textNode : null;
}

function measureTextOffsetFromPoint(textNode: Node, clientX: number) {
  const text = textNode.textContent ?? "";

  if (text.length === 0) {
    return null;
  }

  const ownerDocument = textNode.ownerDocument ?? document;
  const range = ownerDocument.createRange();

  if (typeof range.getBoundingClientRect !== "function") {
    return null;
  }

  let lastMeasuredOffset: number | null = null;

  try {
    for (let offset = 0; offset < text.length; offset += 1) {
      range.setStart(textNode, offset);
      range.setEnd(textNode, offset + 1);

      const rect = range.getBoundingClientRect();

      if (rect.width === 0 && rect.height === 0) {
        continue;
      }

      lastMeasuredOffset = offset + 1;

      if (clientX <= rect.left + rect.width / 2) {
        return offset;
      }
    }
  } finally {
    range.detach();
  }

  return lastMeasuredOffset ?? text.length;
}

function getTargetTextPosition(view: EditorView, event: MouseEvent, cellPos: number, cellNode: ProseMirrorNode) {
  const cellElement = event.target instanceof Element ? event.target.closest("td, th") : null;

  if (!cellElement || !view.dom.contains(cellElement)) {
    return null;
  }

  const textNode = findTextNodeForCaretFallback(event.target, cellElement);

  if (!textNode) {
    return null;
  }

  const textOffset = measureTextOffsetFromPoint(textNode, event.clientX);

  if (textOffset === null) {
    return null;
  }

  try {
    const domPos = view.posAtDOM(textNode, textOffset);

    if (domPos > cellPos && domPos < cellPos + cellNode.nodeSize) {
      return domPos;
    }
  } catch {
    return null;
  }

  return null;
}

function createCellCursorSelection(view: EditorView, event: MouseEvent, cellPos: number) {
  const cellNode = view.state.doc.nodeAt(cellPos);

  if (!cellNode || !isTableCellNode(cellNode)) {
    return null;
  }

  const nativeCaretTextPos = getNativeCaretTextPosition(view, event, cellPos, cellNode);

  if (nativeCaretTextPos !== null) {
    return TextSelection.near(view.state.doc.resolve(nativeCaretTextPos));
  }

  const targetTextPos = getTargetTextPosition(view, event, cellPos, cellNode);

  if (targetTextPos !== null) {
    return TextSelection.near(view.state.doc.resolve(targetTextPos));
  }

  try {
    const posAtCoords = view.posAtCoords({ left: event.clientX, top: event.clientY });

    if (posAtCoords && posAtCoords.pos > cellPos && posAtCoords.pos < cellPos + cellNode.nodeSize) {
      return TextSelection.near(view.state.doc.resolve(posAtCoords.pos));
    }
  } catch {
    // jsdom and some synthetic probes cannot provide layout-backed coordinates.
  }

  let fallbackPosition: number | null = null;
  const cellContentStart = cellPos + 1;

  cellNode.descendants((node, relativePos) => {
    if (!node.isTextblock) {
      return true;
    }

    fallbackPosition = cellContentStart + relativePos + 1;
    return false;
  });

  return fallbackPosition === null ? null : TextSelection.create(view.state.doc, fallbackPosition);
}

export function setTableHoverCell(
  tr: Transaction,
  cellPos: number | null,
  visualPoint: { readonly visualRowIndex: number | null; readonly visualColumnIndex: number | null } | null = null,
) {
  return tr.setMeta(tableInteractionPluginKey, {
    type: "set-hover-cell",
    cellPos,
    visualRowIndex: visualPoint?.visualRowIndex ?? null,
    visualColumnIndex: visualPoint?.visualColumnIndex ?? null,
  } satisfies TableInteractionMeta);
}

function getCellElementFromMouseEvent(view: EditorView, event: MouseEvent) {
  const cellElement = event.target instanceof Element ? event.target.closest("td, th") : null;

  return cellElement && view.dom.contains(cellElement) ? cellElement : null;
}

function clampVisualIndex(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getVisualCellPointFromMouseEvent(view: EditorView, event: MouseEvent, cellPos: number) {
  const cellNode = view.state.doc.nodeAt(cellPos);
  const cellElement = getCellElementFromMouseEvent(view, event);

  if (!isTableCellNode(cellNode) || !cellElement) {
    return {
      visualRowIndex: null,
      visualColumnIndex: null,
    };
  }

  const cellRect = findCell(view.state.doc.resolve(cellPos));
  const visualHeight = Math.max(1, cellRect.bottom - cellRect.top);
  const visualWidth = Math.max(1, cellRect.right - cellRect.left);
  const domRect = cellElement.getBoundingClientRect();
  const rowOffset =
    domRect.height > 0 ? clampVisualIndex(Math.floor(((event.clientY - domRect.top) / domRect.height) * visualHeight), 0, visualHeight - 1) : 0;
  const columnOffset =
    domRect.width > 0 ? clampVisualIndex(Math.floor(((event.clientX - domRect.left) / domRect.width) * visualWidth), 0, visualWidth - 1) : 0;

  return {
    visualRowIndex: cellRect.top + rowOffset,
    visualColumnIndex: cellRect.left + columnOffset,
  };
}

function getTableInteractionMeta(tr: Transaction) {
  return tr.getMeta(tableInteractionPluginKey) as TableInteractionMeta | undefined;
}

function mapCellPos(tr: Transaction, cellPos: number | null) {
  if (cellPos === null) {
    return null;
  }

  const mapped = tr.mapping.mapResult(cellPos);

  if (mapped.deleted) {
    return null;
  }

  return isTableCellNode(tr.doc.nodeAt(mapped.pos)) ? mapped.pos : null;
}

function mapTextPos(tr: Transaction, textPos: number | null) {
  if (textPos === null) {
    return null;
  }

  const mapped = tr.mapping.mapResult(textPos);

  if (mapped.deleted) {
    return null;
  }

  return Math.max(0, Math.min(mapped.pos, tr.doc.content.size));
}

function applyTableInteractionTransaction(tr: Transaction, previous: TableInteractionState): TableInteractionState {
  const meta = getTableInteractionMeta(tr);

  if (meta?.type === "set-hover-cell") {
    return {
      ...previous,
      hoverCellPos: meta.cellPos,
      hoverVisualRowIndex: meta.visualRowIndex ?? null,
      hoverVisualColumnIndex: meta.visualColumnIndex ?? null,
    };
  }

  if (meta?.type === "start-cell-drag") {
    return {
      hoverCellPos: meta.headCellPos,
      hoverVisualRowIndex: meta.visualRowIndex ?? null,
      hoverVisualColumnIndex: meta.visualColumnIndex ?? null,
      dragAnchorCellPos: meta.anchorCellPos,
      dragHeadCellPos: meta.headCellPos,
      dragAnchorTextPos: meta.anchorTextPos,
    };
  }

  if (meta?.type === "update-cell-drag") {
    return {
      ...previous,
      hoverCellPos: meta.headCellPos,
      hoverVisualRowIndex: meta.visualRowIndex ?? null,
      hoverVisualColumnIndex: meta.visualColumnIndex ?? null,
      dragHeadCellPos: meta.headCellPos,
    };
  }

  if (meta?.type === "end-cell-drag") {
    return {
      ...previous,
      dragAnchorCellPos: null,
      dragHeadCellPos: null,
      dragAnchorTextPos: null,
    };
  }

  if (meta?.type === "clear-hover") {
    return initialTableInteractionState;
  }

  if (
    !tr.docChanged ||
    (previous.hoverCellPos === null &&
      previous.dragAnchorCellPos === null &&
      previous.dragHeadCellPos === null &&
      previous.dragAnchorTextPos === null)
  ) {
    return previous;
  }

  return {
    hoverCellPos: mapCellPos(tr, previous.hoverCellPos),
    hoverVisualRowIndex: previous.hoverVisualRowIndex,
    hoverVisualColumnIndex: previous.hoverVisualColumnIndex,
    dragAnchorCellPos: mapCellPos(tr, previous.dragAnchorCellPos),
    dragHeadCellPos: mapCellPos(tr, previous.dragHeadCellPos),
    dragAnchorTextPos: mapTextPos(tr, previous.dragAnchorTextPos),
  };
}

function createCellDragMeta(headCellPos: number, visualPoint?: { readonly visualRowIndex: number | null; readonly visualColumnIndex: number | null }) {
  return {
    type: "update-cell-drag",
    headCellPos,
    visualRowIndex: visualPoint?.visualRowIndex ?? null,
    visualColumnIndex: visualPoint?.visualColumnIndex ?? null,
  } satisfies TableInteractionMeta;
}

function runSameCellTextDragSelection(view: EditorView, event: MouseEvent, headCellPos: number, interactionState: TableInteractionState) {
  const { dragAnchorTextPos } = interactionState;
  const nextSelection = createCellCursorSelection(view, event, headCellPos);
  const visualPoint = getVisualCellPointFromMouseEvent(view, event, headCellPos);

  if (dragAnchorTextPos === null || !nextSelection) {
    view.dispatch(view.state.tr.setMeta(tableInteractionPluginKey, createCellDragMeta(headCellPos, visualPoint)));
    return true;
  }

  const headTextPos = nextSelection.from;

  if (dragAnchorTextPos < 0 || dragAnchorTextPos > view.state.doc.content.size || headTextPos < 0 || headTextPos > view.state.doc.content.size) {
    return false;
  }

  const selection =
    dragAnchorTextPos === headTextPos
      ? TextSelection.create(view.state.doc, dragAnchorTextPos)
      : TextSelection.create(view.state.doc, dragAnchorTextPos, headTextPos);

  let tr = view.state.tr.setMeta(tableInteractionPluginKey, createCellDragMeta(headCellPos, visualPoint));

  if (!selection.eq(view.state.selection)) {
    tr = tr.setSelection(selection);
  }

  view.dispatch(tr);
  return true;
}

function runCellDragSelection(view: EditorView, event: MouseEvent, headCellPos: number, interactionState: TableInteractionState) {
  const { dragAnchorCellPos } = interactionState;
  const visualPoint = getVisualCellPointFromMouseEvent(view, event, headCellPos);

  if (dragAnchorCellPos === null || !isTableCellNode(view.state.doc.nodeAt(dragAnchorCellPos))) {
    return false;
  }

  if (headCellPos === dragAnchorCellPos) {
    return runSameCellTextDragSelection(view, event, headCellPos, interactionState);
  }

  view.dispatch(
    view.state.tr
      .setSelection(CellSelection.create(view.state.doc, dragAnchorCellPos, headCellPos))
      .scrollIntoView()
      .setMeta(tableInteractionPluginKey, createCellDragMeta(headCellPos, visualPoint)),
  );
  return true;
}

export const MarkweaveTableInteractionLayer = Extension.create({
  name: "markweaveTableInteractionLayer",
  priority: 980,

  addProseMirrorPlugins() {
    return [
      new Plugin<TableInteractionState>({
        key: tableInteractionPluginKey,
        state: {
          init: () => initialTableInteractionState,
          apply: applyTableInteractionTransaction,
        },
        props: {
          decorations: (state) => createTableInteractionDecorations(state, tableInteractionPluginKey.getState(state)),
          handleDOMEvents: {
            mousedown: (view, event) => {
              const cellPos = resolveCellPosFromDom(view, event.target);

              if (cellPos === null) {
                return false;
              }

              const selection = createCellCursorSelection(view, event, cellPos);
              const tr = selection ? view.state.tr.setSelection(selection).scrollIntoView() : view.state.tr;
              const visualPoint = getVisualCellPointFromMouseEvent(view, event, cellPos);

              event.preventDefault();
              view.dispatch(
                tr.setMeta(tableInteractionPluginKey, {
                  type: "start-cell-drag",
                  anchorCellPos: cellPos,
                  headCellPos: cellPos,
                  anchorTextPos: selection?.from ?? null,
                  visualRowIndex: visualPoint.visualRowIndex,
                  visualColumnIndex: visualPoint.visualColumnIndex,
                } satisfies TableInteractionMeta),
              );
              view.focus();
              return true;
            },
            mousemove: (view, event) => {
              const nextCellPos = resolveCellPosFromDom(view, event.target);
              const current = tableInteractionPluginKey.getState(view.state) ?? initialTableInteractionState;

              if (nextCellPos !== null && event.buttons === 1 && current.dragAnchorCellPos !== null) {
                event.preventDefault();
                return runCellDragSelection(view, event, nextCellPos, current);
              }

              const nextVisualPoint = nextCellPos === null ? null : getVisualCellPointFromMouseEvent(view, event, nextCellPos);

              if (
                nextCellPos === current.hoverCellPos &&
                (nextVisualPoint?.visualRowIndex ?? null) === current.hoverVisualRowIndex &&
                (nextVisualPoint?.visualColumnIndex ?? null) === current.hoverVisualColumnIndex
              ) {
                return false;
              }

              view.dispatch(setTableHoverCell(view.state.tr, nextCellPos, nextVisualPoint));
              return false;
            },
            mouseup: (view) => {
              const current = tableInteractionPluginKey.getState(view.state) ?? initialTableInteractionState;

              if (current.dragAnchorCellPos === null) {
                return false;
              }

              view.dispatch(
                view.state.tr.setMeta(tableInteractionPluginKey, {
                  type: "end-cell-drag",
                } satisfies TableInteractionMeta),
              );
              return false;
            },
            mouseleave: (view) => {
              view.dispatch(view.state.tr.setMeta(tableInteractionPluginKey, { type: "clear-hover" } satisfies TableInteractionMeta));
              return false;
            },
          },
        },
      }),
    ];
  },
});
