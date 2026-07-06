import { Extension, type Editor } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection, cellAround } from "@tiptap/pm/tables";

export type MarkweaveTableKeyboardShortcutId =
  | "enter-cell-inline-stable"
  | "shift-enter-cell-hard-break"
  | "tab-next-cell"
  | "shift-tab-previous-cell"
  | "tab-final-cell-add-row"
  | "escape-cell-selection-to-head-cell";

export type MarkweaveTableKeyboardSupportStatus = "supported";

export interface MarkweaveTableKeyboardShortcut {
  readonly id: MarkweaveTableKeyboardShortcutId;
  readonly key: "Enter" | "Shift-Enter" | "Tab" | "Shift-Tab" | "Escape";
  readonly behavior: string;
  readonly supportStatus: MarkweaveTableKeyboardSupportStatus;
  readonly implementationStatus: "implemented" | "verified" | "blocked-by-unknown";
}

export const markweaveTableKeyboardShortcuts: readonly MarkweaveTableKeyboardShortcut[] = [
  {
    id: "enter-cell-inline-stable",
    key: "Enter",
    behavior: "Keep ordinary Enter inside a table cell as an inline-stable handled no-op; use Shift+Enter for a cell hard break.",
    supportStatus: "supported",
    implementationStatus: "verified",
  },
  {
    id: "shift-enter-cell-hard-break",
    key: "Shift-Enter",
    behavior: "Insert a hard break inside the active table cell without changing table shape.",
    supportStatus: "supported",
    implementationStatus: "verified",
  },
  {
    id: "tab-next-cell",
    key: "Tab",
    behavior: "Move the active table cursor/selection to the next cell instead of inserting a tab character.",
    supportStatus: "supported",
    implementationStatus: "verified",
  },
  {
    id: "shift-tab-previous-cell",
    key: "Shift-Tab",
    behavior: "Move the active table cursor/selection to the previous cell; keep first-cell boundary selection stable when no previous cell exists.",
    supportStatus: "supported",
    implementationStatus: "verified",
  },
  {
    id: "tab-final-cell-add-row",
    key: "Tab",
    behavior: "When Tab cannot move to another cell, append a row and move into the new row.",
    supportStatus: "supported",
    implementationStatus: "verified",
  },
  {
    id: "escape-cell-selection-to-head-cell",
    key: "Escape",
    behavior: "Collapse a whole-cell table selection back into the selected head cell while keeping table focus and table content stable.",
    supportStatus: "supported",
    implementationStatus: "verified",
  },
] as const;

export function getMarkweaveTableKeyboardShortcut(id: MarkweaveTableKeyboardShortcutId) {
  return markweaveTableKeyboardShortcuts.find((shortcut) => shortcut.id === id) ?? null;
}

export function isTableSelectionBoundary(editor: Editor) {
  return Boolean(cellAround(editor.state.selection.$from) || cellAround(editor.state.selection.$to));
}

export function runMarkweaveTableEnter(editor: Editor) {
  return isTableSelectionBoundary(editor);
}

export function runMarkweaveTableShiftEnter(editor: Editor) {
  if (!isTableSelectionBoundary(editor)) {
    return false;
  }

  if (editor.state.selection instanceof CellSelection) {
    return true;
  }

  return editor.commands.setHardBreak();
}

export function runMarkweaveTableTab(editor: Editor) {
  if (editor.commands.goToNextCell()) {
    return true;
  }

  if (!editor.can().addRowAfter()) {
    return false;
  }

  return editor.chain().addRowAfter().goToNextCell().run();
}

export function runMarkweaveTableShiftTab(editor: Editor) {
  if (editor.commands.goToPreviousCell()) {
    return true;
  }

  return isTableSelectionBoundary(editor);
}

function getFirstTextblockPositionInCell($cell: ResolvedPos) {
  const cell = $cell.nodeAfter;

  if (!cell) {
    return null;
  }

  let position: number | null = null;
  const cellContentStart = $cell.pos + 1;

  cell.descendants((node, relativePos) => {
    if (!node.isTextblock) {
      return true;
    }

    position = cellContentStart + relativePos + 1;
    return false;
  });

  return position;
}

export function runMarkweaveTableEscape(editor: Editor) {
  const { selection } = editor.state;

  if (!(selection instanceof CellSelection)) {
    return isTableSelectionBoundary(editor);
  }

  const targetPosition = getFirstTextblockPositionInCell(selection.$headCell);

  if (targetPosition === null) {
    return false;
  }

  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, targetPosition)).scrollIntoView());
  editor.view.focus();
  return true;
}

export const MarkweaveTableKeyboard = Extension.create({
  name: "markweaveTableKeyboard",
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Enter: () => runMarkweaveTableEnter(this.editor),
      "Shift-Enter": () => runMarkweaveTableShiftEnter(this.editor),
      Tab: () => runMarkweaveTableTab(this.editor),
      "Shift-Tab": () => runMarkweaveTableShiftTab(this.editor),
      Escape: () => runMarkweaveTableEscape(this.editor),
    };
  },
});
