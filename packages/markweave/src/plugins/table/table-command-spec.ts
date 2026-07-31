export type TableCommandId =
  | "add-row-before"
  | "add-row-after"
  | "move-row-up"
  | "move-row-down"
  | "sort-row-asc"
  | "sort-row-desc"
  | "clear-row"
  | "duplicate-row"
  | "add-column-before"
  | "add-column-after"
  | "move-column-left"
  | "move-column-right"
  | "sort-column-asc"
  | "sort-column-desc"
  | "clear-column"
  | "duplicate-column"
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
export type TableMenuSubmenuId = "color" | "alignment";
export type TableMenuIconId =
  | "move-left"
  | "move-right"
  | "move-up"
  | "move-down"
  | "insert-left"
  | "insert-right"
  | "insert-above"
  | "insert-below"
  | "sort-asc"
  | "sort-desc"
  | "color"
  | "alignment"
  | "clear"
  | "duplicate"
  | "copy"
  | "merge"
  | "split"
  | "ask-ai"
  | "delete";
export type TableMenuItemId = TableCommandId | TableMenuSubmenuId | "edit-with-ai";

export interface TableMenuItemSpec {
  readonly id: TableMenuItemId;
  readonly label: string;
  readonly menu: TableCommandMenuKind;
  readonly commandId: TableCommandId | null;
  readonly submenuId: TableMenuSubmenuId | null;
  readonly icon: TableMenuIconId;
  readonly group: "assistant" | "move" | "insert" | "sort" | "format" | "duplicate" | "copy" | "cell" | "delete";
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
    id: "sort-row-asc",
    label: "Sort Row A-Z",
    behaviorGroup: "sort-row",
  },
  {
    id: "sort-row-desc",
    label: "Sort Row Z-A",
    behaviorGroup: "sort-row",
  },
  {
    id: "clear-row",
    label: "Clear Row Contents",
    behaviorGroup: "clear-row",
  },
  {
    id: "duplicate-row",
    label: "Duplicate Row",
    behaviorGroup: "duplicate-row",
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
    id: "sort-column-asc",
    label: "Sort Column A-Z",
    behaviorGroup: "sort-column",
  },
  {
    id: "sort-column-desc",
    label: "Sort Column Z-A",
    behaviorGroup: "sort-column",
  },
  {
    id: "clear-column",
    label: "Clear Column Contents",
    behaviorGroup: "clear-column",
  },
  {
    id: "duplicate-column",
    label: "Duplicate Column",
    behaviorGroup: "duplicate-column",
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

const tableCommandIcon: Readonly<Record<TableCommandId, TableMenuIconId>> = {
  "add-row-before": "insert-above",
  "add-row-after": "insert-below",
  "move-row-up": "move-up",
  "move-row-down": "move-down",
  "sort-row-asc": "sort-asc",
  "sort-row-desc": "sort-desc",
  "clear-row": "clear",
  "duplicate-row": "duplicate",
  "add-column-before": "insert-left",
  "add-column-after": "insert-right",
  "move-column-left": "move-left",
  "move-column-right": "move-right",
  "sort-column-asc": "sort-asc",
  "sort-column-desc": "sort-desc",
  "clear-column": "clear",
  "duplicate-column": "duplicate",
  "copy-row": "copy",
  "copy-column": "copy",
  "copy-table": "copy",
  "delete-row": "delete",
  "delete-column": "delete",
  "merge-cells": "merge",
  "split-cell": "split",
  "delete-table": "delete",
};

function commandGroup(commandId: TableCommandId): TableMenuItemSpec["group"] {
  if (commandId.startsWith("move-")) return "move";
  if (commandId.startsWith("add-")) return "insert";
  if (commandId.startsWith("sort-")) return "sort";
  if (commandId.startsWith("clear-")) return "format";
  if (commandId.startsWith("duplicate-")) return "duplicate";
  if (commandId.startsWith("copy-")) return "copy";
  if (commandId === "merge-cells" || commandId === "split-cell") return "cell";
  return "delete";
}

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
    submenuId: null,
    icon: tableCommandIcon[commandId],
    group: commandGroup(commandId),
    availability: "available",
  };
}

function submenuMenuItem(menu: TableCommandMenuKind, submenuId: TableMenuSubmenuId): TableMenuItemSpec {
  return {
    id: submenuId,
    label: submenuId === "color" ? "Color" : "Alignment",
    menu,
    commandId: null,
    submenuId,
    icon: submenuId,
    group: "format",
    availability: "available",
  };
}

export function askAiTableMenuItem(menu: TableCommandMenuKind): TableMenuItemSpec {
  return {
    id: "edit-with-ai",
    label: "Ask AI",
    menu,
    commandId: null,
    submenuId: null,
    icon: "ask-ai",
    group: "assistant",
    availability: "external",
  };
}

export const tableMenuSpecs: readonly TableMenuItemSpec[] = [
  askAiTableMenuItem("row"),
  executableMenuItem("row", "move-row-up"),
  executableMenuItem("row", "move-row-down"),
  executableMenuItem("row", "add-row-before"),
  executableMenuItem("row", "add-row-after"),
  executableMenuItem("row", "sort-row-asc"),
  executableMenuItem("row", "sort-row-desc"),
  submenuMenuItem("row", "color"),
  submenuMenuItem("row", "alignment"),
  executableMenuItem("row", "clear-row"),
  executableMenuItem("row", "duplicate-row"),
  executableMenuItem("row", "delete-row"),
  askAiTableMenuItem("column"),
  executableMenuItem("column", "move-column-left"),
  executableMenuItem("column", "move-column-right"),
  executableMenuItem("column", "add-column-before"),
  executableMenuItem("column", "add-column-after"),
  executableMenuItem("column", "sort-column-asc"),
  executableMenuItem("column", "sort-column-desc"),
  submenuMenuItem("column", "color"),
  submenuMenuItem("column", "alignment"),
  executableMenuItem("column", "clear-column"),
  executableMenuItem("column", "duplicate-column"),
  executableMenuItem("column", "delete-column"),
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
