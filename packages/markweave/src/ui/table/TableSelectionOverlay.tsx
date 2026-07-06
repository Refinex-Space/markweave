import type { Editor } from "@tiptap/react";
import { findCell } from "@tiptap/pm/tables";
import { useLayoutEffect, useState, type CSSProperties } from "react";
import { getTableSelectionOverlayState, type TableSelectionOverlayState } from "../../plugins/table/table-interaction-layer";
import type { TableFocusState } from "../../plugins/table/table-focus-state";

interface TableSelectionOverlayProps {
  readonly editor: Editor;
  readonly focusState: TableFocusState;
}

interface TableSelectionOverlayRect {
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

function getEditorFrameElement(editor: Editor) {
  return editor.view.dom.closest<HTMLElement>(".markweave-editor-frame") ?? editor.view.dom.parentElement;
}

function getCellElement(editor: Editor, cellPos: number) {
  const cellDom = editor.view.nodeDOM(cellPos);

  if (!(cellDom instanceof Element)) {
    return null;
  }

  return cellDom.matches("td, th") ? (cellDom as HTMLElement) : cellDom.closest<HTMLElement>("td, th");
}

function getCellOverlaySlice(editor: Editor, cellPos: number, overlayRect: NonNullable<TableSelectionOverlayState["rect"]>): RectSlice | null {
  const cellElement = getCellElement(editor, cellPos);

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
  const cellRects = overlayState.cellPositions
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

export function TableSelectionOverlay({ editor, focusState }: TableSelectionOverlayProps) {
  const [overlayRect, setOverlayRect] = useState<TableSelectionOverlayRect | null>(null);

  useLayoutEffect(() => {
    if (focusState.mode !== "cell-selection") {
      setOverlayRect(null);
      return undefined;
    }

    const updateOverlayRect = () => {
      setOverlayRect(measureTableSelectionOverlay(editor, getTableSelectionOverlayState(editor.state)));
    };

    updateOverlayRect();
    window.addEventListener("resize", updateOverlayRect);
    window.addEventListener("scroll", updateOverlayRect, true);

    return () => {
      window.removeEventListener("resize", updateOverlayRect);
      window.removeEventListener("scroll", updateOverlayRect, true);
    };
  }, [
    editor,
    focusState.activeCellPos,
    focusState.anchorCellPos,
    focusState.mode,
    focusState.selectedCellCount,
    focusState.selectionFrom,
    focusState.selectionTo,
  ]);

  if (!overlayRect) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="markweave-table-selection-overlay"
      data-anchor-cell-pos={overlayRect.anchorCellPos ?? ""}
      data-head-cell-pos={overlayRect.headCellPos ?? ""}
      data-selected-cells={overlayRect.selectedCellCount}
      data-visual-columns={overlayRect.visualColumnCount}
      data-visual-rows={overlayRect.visualRowCount}
      data-visual-slots={overlayRect.visualSlotCount}
      data-testid="markweave-table-selection-overlay"
      style={{
        "--markweave-table-selection-columns": overlayRect.visualColumnCount,
        "--markweave-table-selection-rows": overlayRect.visualRowCount,
        left: overlayRect.left,
        top: overlayRect.top,
        width: overlayRect.width,
        height: overlayRect.height,
      } as CSSProperties}
    />
  );
}
