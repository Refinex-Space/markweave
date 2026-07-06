export const tableBehaviorPriority = "P0" as const;

export const requiredTableBehaviors = [
  "cell-focus-enter-exit",
  "tab-next-cell",
  "shift-tab-previous-cell",
  "arrow-boundary-navigation",
  "enter-row-or-cell-content-behavior",
  "insert-row",
  "insert-column",
  "delete-row",
  "delete-column",
  "delete-table",
  "merge-cells",
  "split-cell",
  "markdown-table-input-transform",
  "table-paste",
  "external-copy-paste",
  "hover-row-column-highlight",
  "cell-focus-outline",
  "selection-overlay",
  "empty-cell",
  "multi-line-cell-content",
  "nested-inline-formatting",
  "table-command-undo-redo",
] as const;

export type RequiredTableBehavior = (typeof requiredTableBehaviors)[number];

export function hasRequiredTableBehavior(value: string): value is RequiredTableBehavior {
  return (requiredTableBehaviors as readonly string[]).includes(value);
}
