import type { Editor } from "@tiptap/react";
import { useLayoutEffect, useState, type CSSProperties } from "react";
import { getTableSelectionOverlayState } from "markweave/internal/plugins/table/table-interaction-layer";
import type { TableFocusState } from "markweave/internal/plugins/table/table-focus-state";
import {
  measureTableSelectionOverlay,
  type TableSelectionOverlayRect,
} from "markweave/internal/plugins/table/table-ui-model";

interface TableSelectionOverlayProps {
  readonly editor: Editor;
  readonly focusState: TableFocusState;
}

export { measureTableSelectionOverlay };

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
