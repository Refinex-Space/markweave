export type TableCommandId =
  | "add-row-before"
  | "add-row-after"
  | "move-row-up"
  | "move-row-down"
  | "add-column-before"
  | "add-column-after"
  | "move-column-left"
  | "move-column-right"
  | "copy-row"
  | "copy-column"
  | "copy-table"
  | "delete-row"
  | "delete-column"
  | "merge-cells"
  | "split-cell"
  | "delete-table";

export interface TableCommandSpec {
  readonly id: TableCommandId;
  readonly label: string;
  readonly behaviorGroup: string;
}

export type TableCommandMenuKind = "row" | "column";
export type TableMenuItemId = TableCommandId | "edit-with-ai";

export interface TableMenuItemSpec {
  readonly id: TableMenuItemId;
  readonly label: string;
  readonly menu: TableCommandMenuKind;
  readonly commandId: TableCommandId | null;
  readonly availability: "external" | "available";
}

export const tableCommandSpecs: readonly TableCommandSpec[] = [
  {
    id: "add-row-before",
    label: "Insert Row Above",
    behaviorGroup: "insert-row",
  },
  {
    id: "add-row-after",
    label: "Insert Row Below",
    behaviorGroup: "insert-row",
  },
  {
    id: "move-row-up",
    label: "Move Row Up",
    behaviorGroup: "insert-row",
  },
  {
    id: "move-row-down",
    label: "Move Row Down",
    behaviorGroup: "insert-row",
  },
  {
    id: "add-column-before",
    label: "Insert Column Left",
    behaviorGroup: "insert-column",
  },
  {
    id: "add-column-after",
    label: "Insert Column Right",
    behaviorGroup: "insert-column",
  },
  {
    id: "move-column-left",
    label: "Move Column Left",
    behaviorGroup: "insert-column",
  },
  {
    id: "move-column-right",
    label: "Move Column Right",
    behaviorGroup: "insert-column",
  },
  {
    id: "copy-row",
    label: "Copy Row",
    behaviorGroup: "external-copy-paste",
  },
  {
    id: "copy-column",
    label: "Copy Column",
    behaviorGroup: "external-copy-paste",
  },
  {
    id: "copy-table",
    label: "Copy Table",
    behaviorGroup: "external-copy-paste",
  },
  {
    id: "delete-row",
    label: "Delete Row",
    behaviorGroup: "delete-row",
  },
  {
    id: "delete-column",
    label: "Delete Column",
    behaviorGroup: "delete-column",
  },
  {
    id: "merge-cells",
    label: "Merge",
    behaviorGroup: "merge-cells",
  },
  {
    id: "split-cell",
    label: "Split",
    behaviorGroup: "split-cell",
  },
  {
    id: "delete-table",
    label: "Delete Table",
    behaviorGroup: "delete-table",
  },
] as const;

function executableMenuItem(menu: TableCommandMenuKind, commandId: TableCommandId): TableMenuItemSpec {
  const command = tableCommandSpecs.find((candidate) => candidate.id === commandId);

  if (!command) {
    throw new Error(`Missing executable table command spec for ${commandId}.`);
  }

  return {
    id: commandId,
    label: command.label,
    menu,
    commandId,
    availability: "available",
  };
}

export const tableMenuSpecs: readonly TableMenuItemSpec[] = [
  executableMenuItem("row", "add-row-before"),
  executableMenuItem("row", "add-row-after"),
  executableMenuItem("row", "move-row-up"),
  executableMenuItem("row", "move-row-down"),
  executableMenuItem("row", "copy-row"),
  executableMenuItem("row", "copy-table"),
  executableMenuItem("row", "delete-row"),
  executableMenuItem("row", "delete-table"),
  executableMenuItem("column", "add-column-before"),
  executableMenuItem("column", "add-column-after"),
  executableMenuItem("column", "move-column-left"),
  executableMenuItem("column", "move-column-right"),
  executableMenuItem("column", "copy-column"),
  executableMenuItem("column", "copy-table"),
  executableMenuItem("column", "delete-column"),
  executableMenuItem("column", "delete-table"),
] as const;

export function getMarkweaveTableMenuLabels(menu: TableCommandMenuKind) {
  return tableMenuSpecs.filter((item) => item.menu === menu).map((item) => item.label);
}

export function getExecutableTableMenuCommandSpecs(menu: TableCommandMenuKind) {
  const commandIds = tableMenuSpecs
    .filter((item) => item.menu === menu && item.commandId !== null)
    .map((item) => item.commandId);

  return commandIds
    .map((commandId) => tableCommandSpecs.find((command) => command.id === commandId))
    .filter((command): command is TableCommandSpec => Boolean(command));
}
