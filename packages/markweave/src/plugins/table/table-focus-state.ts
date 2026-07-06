import type { EditorState } from "@tiptap/pm/state";
import { CellSelection, cellAround } from "@tiptap/pm/tables";

export type TableFocusMode = "outside" | "cell-cursor" | "cell-text-range" | "cell-selection";

export interface TableFocusState {
  readonly active: boolean;
  readonly mode: TableFocusMode;
  readonly activeCellPos: number | null;
  readonly anchorCellPos: number | null;
  readonly selectedCellCount: number;
  readonly selectionFrom: number;
  readonly selectionTo: number;
}

export function getTableFocusState(state: EditorState): TableFocusState {
  const { selection } = state;

  if (selection instanceof CellSelection) {
    let selectedCellCount = 0;
    selection.forEachCell(() => {
      selectedCellCount += 1;
    });

    return {
      active: true,
      mode: "cell-selection",
      activeCellPos: selection.$headCell.pos,
      anchorCellPos: selection.$anchorCell.pos,
      selectedCellCount,
      selectionFrom: selection.from,
      selectionTo: selection.to,
    };
  }

  const $cell = cellAround(selection.$from);

  if (!$cell) {
    return {
      active: false,
      mode: "outside",
      activeCellPos: null,
      anchorCellPos: null,
      selectedCellCount: 0,
      selectionFrom: selection.from,
      selectionTo: selection.to,
    };
  }

  return {
    active: true,
    mode: selection.empty ? "cell-cursor" : "cell-text-range",
    activeCellPos: $cell.pos,
    anchorCellPos: $cell.pos,
    selectedCellCount: 1,
    selectionFrom: selection.from,
    selectionTo: selection.to,
  };
}
