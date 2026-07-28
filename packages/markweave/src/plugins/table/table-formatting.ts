import type { Editor } from "@tiptap/core";
import {
  getTargetedTableAxisCellStyle,
  setTargetedTableAxisCellStyle,
  type TableAxisKind,
  type TableCellHorizontalAlignment,
  type TableCellVerticalAlignment,
} from "./table-command-runtime";

export type TableColorId = "default" | "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red";
export type TableAlignmentId = "left" | "center" | "right" | "top" | "middle" | "bottom";

export interface TableColorOption {
  readonly id: TableColorId;
  readonly textColor: string | null;
  readonly backgroundColor: string;
}

export const tableColorOptions: readonly TableColorOption[] = [
  { id: "default", textColor: null, backgroundColor: "#ffffff" },
  { id: "gray", textColor: "#787673", backgroundColor: "#f8f8f7" },
  { id: "brown", textColor: "#9d6a53", backgroundColor: "#f4eeee" },
  { id: "orange", textColor: "#d9730d", backgroundColor: "#fbecdd" },
  { id: "yellow", textColor: "#ca922f", backgroundColor: "#fef9c3" },
  { id: "green", textColor: "#448361", backgroundColor: "#dcfce7" },
  { id: "blue", textColor: "#327da9", backgroundColor: "#e0f2fe" },
  { id: "purple", textColor: "#8f64af", backgroundColor: "#f3e8ff" },
  { id: "pink", textColor: "#c24c8b", backgroundColor: "#fcf1f6" },
  { id: "red", textColor: "#d34a45", backgroundColor: "#ffe4e6" },
] as const;

export const tableHorizontalAlignmentOptions: readonly TableCellHorizontalAlignment[] = ["left", "center", "right"];
export const tableVerticalAlignmentOptions: readonly TableCellVerticalAlignment[] = ["top", "middle", "bottom"];

export function getTableColorOption(id: TableColorId) {
  return tableColorOptions.find((option) => option.id === id) ?? tableColorOptions[0];
}

export function applyTableAxisTextColor(editor: Editor, axis: TableAxisKind, colorId: TableColorId) {
  const option = getTableColorOption(colorId);
  return setTargetedTableAxisCellStyle(editor, axis, { textColor: option.textColor });
}

export function applyTableAxisBackgroundColor(editor: Editor, axis: TableAxisKind, colorId: TableColorId) {
  const option = getTableColorOption(colorId);
  return setTargetedTableAxisCellStyle(editor, axis, { backgroundColor: colorId === "default" ? null : option.backgroundColor });
}

export function applyTableAxisAlignment(editor: Editor, axis: TableAxisKind, alignment: TableAlignmentId) {
  if (tableHorizontalAlignmentOptions.includes(alignment as TableCellHorizontalAlignment)) {
    return setTargetedTableAxisCellStyle(editor, axis, { textAlign: alignment as TableCellHorizontalAlignment });
  }

  return setTargetedTableAxisCellStyle(editor, axis, { verticalAlign: alignment as TableCellVerticalAlignment });
}

export function getTableAxisFormattingState(editor: Editor, axis: TableAxisKind) {
  const style = getTargetedTableAxisCellStyle(editor, axis);

  if (!style) {
    return null;
  }

  const textColorId = tableColorOptions.find((option) => option.textColor === style.textColor)?.id ?? "default";
  const backgroundColorId = tableColorOptions.find((option) => option.id !== "default" && option.backgroundColor === style.backgroundColor)?.id ?? "default";

  return {
    ...style,
    textColorId,
    backgroundColorId,
  };
}
