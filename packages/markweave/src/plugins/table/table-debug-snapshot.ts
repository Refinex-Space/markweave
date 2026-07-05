import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";

export interface TableDebugCellSnapshot {
  readonly text: string;
  readonly type: "cell" | "header";
  readonly colspan: number;
  readonly rowspan: number;
}

export interface TableDebugSnapshot {
  readonly rowCount: number;
  readonly visualWidth: number;
  readonly rows: TableDebugCellSnapshot[][];
}

function normalizeSpan(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 1 ? numericValue : 1;
}

function createTableDebugSnapshot(tableNode: ProseMirrorNode): TableDebugSnapshot {
  const map = TableMap.get(tableNode);
  const rows: TableDebugCellSnapshot[][] = [];

  tableNode.forEach((row) => {
    const cells: TableDebugCellSnapshot[] = [];

    row.forEach((cell) => {
      cells.push({
        text: cell.textContent,
        type: cell.type.name === "tableHeader" ? "header" : "cell",
        colspan: normalizeSpan(cell.attrs.colspan),
        rowspan: normalizeSpan(cell.attrs.rowspan),
      });
    });

    rows.push(cells);
  });

  return {
    rowCount: map.height,
    visualWidth: map.width,
    rows,
  };
}

export function getFirstTableDebugSnapshot(state: EditorState): TableDebugSnapshot | null {
  let snapshot: TableDebugSnapshot | null = null;

  state.doc.descendants((node) => {
    if (node.type.name !== "table") {
      return true;
    }

    snapshot = createTableDebugSnapshot(node);
    return false;
  });

  return snapshot;
}
