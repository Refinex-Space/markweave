import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

export interface TableBodyCellFocusOptions {
  readonly from?: number;
}

export function findFirstTableBodyCellCursorPosition(state: EditorState, options: TableBodyCellFocusOptions = {}) {
  let fallbackPosition: number | null = null;
  let bodyCellPosition: number | null = null;
  const from = options.from ?? 0;

  state.doc.descendants((node, pos) => {
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") {
      return true;
    }

    if (pos < from) {
      return true;
    }

    let cursorPosition = pos + 1;

    node.descendants((child, childPos) => {
      if (!child.isTextblock) {
        return true;
      }

      cursorPosition = pos + 1 + childPos + 1;
      return false;
    });

    fallbackPosition ??= cursorPosition;

    if (node.type.name === "tableCell") {
      bodyCellPosition ??= cursorPosition;
      return false;
    }

    return true;
  });

  return bodyCellPosition ?? fallbackPosition;
}

export function focusFirstTableBodyCell(editor: Editor, options: TableBodyCellFocusOptions = {}) {
  const cursorPosition = findFirstTableBodyCellCursorPosition(editor.state, options);

  if (cursorPosition === null) {
    return false;
  }

  editor.commands.focus();
  return editor.commands.setTextSelection(cursorPosition);
}
