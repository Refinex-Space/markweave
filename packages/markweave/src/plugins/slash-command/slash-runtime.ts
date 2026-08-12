import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { executeMarkweaveBuiltinCommand } from "../../commands/builtin-command-runtime";
import { isEditorComposing } from "../../editor-core/composition-guard";
import { isExecutableSlashCommand, type SlashCommandSpec } from "./command-spec";
import { initialSlashCommandState, reduceSlashCommandState, type SlashCommandState } from "./slash-state";
import type { MarkweaveUploadResult } from "./upload";

export interface SlashCommandContext {
  readonly query: string;
  readonly triggerFrom: number;
  readonly triggerTo: number;
  readonly cursor: number;
}

export interface SlashCommandMenuPosition {
  readonly left: number;
  readonly top: number;
  readonly triggerLeft: number;
  readonly triggerTop: number;
  readonly maxHeight: number;
  readonly placement: "bottom" | "top";
}

export interface SlashCommandPositionRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width?: number;
  readonly height?: number;
}

export interface SlashCommandPositionOptions {
  readonly frameRect?: SlashCommandPositionRect;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  readonly menuWidth?: number;
  readonly menuMaxHeight?: number;
  readonly triggerRect?: SlashCommandPositionRect;
  readonly triggerWidth?: number;
  readonly triggerHeight?: number;
  readonly offset?: number;
  readonly edgePadding?: number;
}

export interface ExecuteSlashCommandOptions {
  readonly emoji?: string;
  readonly uploadResult?: MarkweaveUploadResult;
}

export type SlashCommandOpenReason =
  | "valid-textblock"
  | "range-selection"
  | "active-composition"
  | "non-textblock"
  | "code-block"
  | "unsupported-scope";

export type SlashCommandScope =
  | "paragraph"
  | "heading"
  | "blockquote"
  | "callout"
  | "list-item"
  | "table-cell"
  | "table-header"
  | "code-block"
  | "other-textblock";

export interface SlashCommandOpenDecision {
  readonly canOpen: boolean;
  readonly reason: SlashCommandOpenReason;
  readonly scope: SlashCommandScope | null;
  readonly ancestorNodes: readonly string[];
}

function getSelectionAncestorNodeNames(state: EditorState) {
  const ancestors: string[] = [];
  const $from = state.selection.$from;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    ancestors.push($from.node(depth).type.name);
  }

  return ancestors;
}

function getSlashCommandScope(state: EditorState): SlashCommandScope | null {
  const ancestorNodes = getSelectionAncestorNodeNames(state);
  const parentName = state.selection.$from.parent.type.name;

  if (ancestorNodes.includes("codeBlock")) {
    return "code-block";
  }

  if (ancestorNodes.includes("tableHeader")) {
    return "table-header";
  }

  if (ancestorNodes.includes("tableCell")) {
    return "table-cell";
  }

  if (ancestorNodes.includes("listItem")) {
    return "list-item";
  }

  if (ancestorNodes.includes("blockquote")) {
    return "blockquote";
  }

  if (ancestorNodes.includes("markweaveCallout")) {
    return "callout";
  }

  if (parentName === "paragraph") {
    return "paragraph";
  }

  if (parentName === "heading") {
    return "heading";
  }

  if (state.selection.$from.parent.isTextblock) {
    return "other-textblock";
  }

  return null;
}

export function getSlashCommandOpenDecision(state: EditorState): SlashCommandOpenDecision {
  const { selection } = state;
  const ancestorNodes = getSelectionAncestorNodeNames(state);

  if (!selection.empty) {
    return {
      canOpen: false,
      reason: "range-selection",
      scope: null,
      ancestorNodes,
    };
  }

  if (isEditorComposing(state)) {
    return {
      canOpen: false,
      reason: "active-composition",
      scope: null,
      ancestorNodes,
    };
  }

  const parent = selection.$from.parent;
  const scope = getSlashCommandScope(state);

  if (!parent.isTextblock) {
    return {
      canOpen: false,
      reason: "non-textblock",
      scope,
      ancestorNodes,
    };
  }

  if (scope === "code-block") {
    return {
      canOpen: false,
      reason: "code-block",
      scope,
      ancestorNodes,
    };
  }

  if (parent.type.name !== "paragraph" || (scope !== "paragraph" && scope !== "blockquote" && scope !== "callout")) {
    return {
      canOpen: false,
      reason: "unsupported-scope",
      scope,
      ancestorNodes,
    };
  }

  return {
    canOpen: true,
    reason: "valid-textblock",
    scope,
    ancestorNodes,
  };
}

export function getSlashCommandContext(state: EditorState, _lookback = 80): SlashCommandContext | null {
  if (!getSlashCommandOpenDecision(state).canOpen) {
    return null;
  }

  const cursor = state.selection.from;
  const $from = state.selection.$from;
  const parentStart = $from.start();
  const textBeforeCursor = state.doc.textBetween(parentStart, cursor, "\n", "\n");
  const textAfterCursor = state.doc.textBetween(cursor, $from.end(), "\n", "\n");
  const match = /^\/([\p{L}\p{N}\-_]*)$/u.exec(textBeforeCursor);

  if (!match || textAfterCursor.length > 0) {
    return null;
  }

  const query = match[1];

  return {
    query,
    triggerFrom: parentStart,
    triggerTo: cursor,
    cursor,
  };
}

export function getNextSlashCommandState(previous: SlashCommandState, context: SlashCommandContext | null) {
  if (!context) {
    return previous.name === "idle" ? previous : initialSlashCommandState;
  }

  const shouldDetectNewTrigger =
    previous.name === "idle" || previous.name === "closed" || previous.name === "executing" || previous.triggerFrom !== context.triggerFrom;

  const detected = shouldDetectNewTrigger
    ? reduceSlashCommandState(previous, { type: "detect-trigger", from: context.triggerFrom, to: context.triggerTo })
    : previous;
  const opened = detected.name === "trigger-detected" ? reduceSlashCommandState(detected, { type: "open-menu" }) : detected;

  return reduceSlashCommandState(opened, { type: "change-query", query: context.query });
}

export function isMarkweaveSlashMenuScrollTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(".markweave-slash-menu, .markweave-slash-trigger"));
}

export function isSlashCommandAnchorVisible(
  anchorRect: SlashCommandPositionRect,
  options: SlashCommandPositionOptions = {},
): boolean {
  const viewportWidth = options.viewportWidth ?? globalThis.window?.innerWidth ?? 1024;
  const viewportHeight = options.viewportHeight ?? globalThis.window?.innerHeight ?? 768;
  const frameRect =
    options.frameRect ?? ({ left: 0, right: viewportWidth, top: 0, bottom: viewportHeight } as SlashCommandPositionRect);
  const visibleLeft = Math.max(0, frameRect.left);
  const visibleRight = Math.min(viewportWidth, frameRect.right);
  const visibleTop = Math.max(0, frameRect.top);
  const visibleBottom = Math.min(viewportHeight, frameRect.bottom);

  return (
    visibleLeft < visibleRight &&
    visibleTop < visibleBottom &&
    anchorRect.right > visibleLeft &&
    anchorRect.left < visibleRight &&
    anchorRect.bottom > visibleTop &&
    anchorRect.top < visibleBottom
  );
}

export function areSlashCommandMenuPositionsEquivalent(
  current: SlashCommandMenuPosition | null,
  next: SlashCommandMenuPosition | null,
  tolerance = 0.5,
): boolean {
  if (current === next) {
    return true;
  }
  if (!current || !next || current.placement !== next.placement) {
    return false;
  }

  return (
    Math.abs(current.left - next.left) <= tolerance &&
    Math.abs(current.top - next.top) <= tolerance &&
    Math.abs(current.triggerLeft - next.triggerLeft) <= tolerance &&
    Math.abs(current.triggerTop - next.triggerTop) <= tolerance &&
    Math.abs(current.maxHeight - next.maxHeight) <= tolerance
  );
}

export function getSlashCommandAnchoredMenuPosition(
  cursorRect: SlashCommandPositionRect,
  options: SlashCommandPositionOptions = {},
): SlashCommandMenuPosition {
  const edgePadding = options.edgePadding ?? 16;
  const offset = options.offset ?? 8;
  const menuWidth = options.menuWidth ?? 312;
  const menuMaxHeight = options.menuMaxHeight ?? 560;
  const triggerWidth = options.triggerWidth ?? 124;
  const triggerHeight = options.triggerHeight ?? 34;
  const viewportWidth = options.viewportWidth ?? globalThis.window?.innerWidth ?? 1024;
  const viewportHeight = options.viewportHeight ?? globalThis.window?.innerHeight ?? 768;
  const frameRect =
    options.frameRect ?? ({ left: edgePadding, right: viewportWidth - edgePadding, top: edgePadding, bottom: viewportHeight - edgePadding } as SlashCommandPositionRect);
  const triggerRect = options.triggerRect ?? cursorRect;

  const minLeft = Math.max(edgePadding, frameRect.left);
  const maxLeft = Math.max(minLeft, Math.min(frameRect.right, viewportWidth - edgePadding) - menuWidth);
  const triggerMaxLeft = Math.max(minLeft, Math.min(frameRect.right, viewportWidth - edgePadding) - triggerWidth);
  const triggerLeft = Math.min(triggerMaxLeft, Math.max(minLeft, triggerRect.left - 2));
  const triggerTop = Math.min(
    Math.max(edgePadding, viewportHeight - edgePadding - triggerHeight),
    Math.max(Math.max(frameRect.top, edgePadding), triggerRect.top - 7),
  );
  const left = Math.min(maxLeft, Math.max(minLeft, triggerLeft));
  const triggerBottom = triggerTop + triggerHeight;
  const availableBelow = Math.min(frameRect.bottom, viewportHeight - edgePadding) - triggerBottom - offset;
  const availableAbove = triggerTop - Math.max(frameRect.top, edgePadding) - offset;
  const placement = availableBelow >= Math.min(menuMaxHeight, availableAbove) || availableBelow >= 220 ? "bottom" : "top";
  const maxHeight = Math.max(160, Math.min(menuMaxHeight, placement === "bottom" ? availableBelow : availableAbove));
  const top = placement === "bottom" ? triggerBottom + offset : triggerTop - offset;

  return {
    left,
    top,
    triggerLeft,
    triggerTop,
    maxHeight,
    placement,
  };
}

export function getSlashCommandMenuPosition(
  editor: Editor,
  context: SlashCommandContext | null,
  options: SlashCommandPositionOptions = {},
): SlashCommandMenuPosition | null {
  if (!context) {
    return null;
  }

  const cursorRect = editor.view.coordsAtPos(context.cursor);
  const triggerRect = editor.view.coordsAtPos(context.triggerFrom);
  return getSlashCommandAnchoredMenuPosition(cursorRect, { ...options, triggerRect: options.triggerRect ?? triggerRect });
}

export function executeSlashCommand(editor: Editor, state: SlashCommandState, command: SlashCommandSpec, options: ExecuteSlashCommandOptions = {}) {
  if (!isExecutableSlashCommand(command)) {
    return false;
  }

  const deleteFrom = state.triggerFrom ?? editor.state.selection.from;
  const deleteTo = editor.state.selection.from;
  return executeMarkweaveBuiltinCommand(editor, command.id, { from: deleteFrom, to: deleteTo }, options);
}
