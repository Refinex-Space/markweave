import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { isEditorComposing } from "../../editor-core/composition-guard";
import { insertMarkweaveBlockMath } from "../math/math-ui-model";
import { focusFirstTableBodyCell } from "../table/table-focus-position";
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

  switch (command.id) {
    case "emoji":
      if (!options.emoji) {
        return false;
      }
      return editor.chain().focus().deleteRange({ from: deleteFrom, to: deleteTo }).insertContent(options.emoji).run();
    case "attachment":
      if (!options.uploadResult) {
        return false;
      }
      break;
    default:
      break;
  }

  const chain = editor.chain().focus().deleteRange({ from: deleteFrom, to: deleteTo });

  switch (command.id) {
    case "paragraph":
      return chain.setParagraph().run();
    case "heading-1":
      return chain.toggleHeading({ level: 1 }).run();
    case "heading-2":
      return chain.toggleHeading({ level: 2 }).run();
    case "heading-3":
      return chain.toggleHeading({ level: 3 }).run();
    case "bullet-list":
      return chain.toggleBulletList().run();
    case "ordered-list":
      return chain.toggleOrderedList().run();
    case "task-list":
      return chain.toggleTaskList().run();
    case "blockquote":
      return chain.toggleBlockquote().run();
    case "code-block":
      return chain.setCodeBlock({ language: "text" }).run();
    case "separator":
      return chain.setHorizontalRule().run();
    case "block-math":
      chain.run();
      return insertMarkweaveBlockMath(editor, "x");
    case "callout-info":
    case "callout-tip":
    case "callout-warning":
    case "callout-error":
    case "callout-success":
      return chain
        .insertContent({
          type: "markweaveCallout",
          attrs: {
            type: command.calloutType ?? "info",
          },
          content: [{ type: "paragraph" }],
        })
        .run();
    case "table": {
      const inserted = chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();

      if (inserted) {
        focusFirstTableBodyCell(editor, { from: deleteFrom });
      }

      return inserted;
    }
    case "image":
      return chain
        .insertContent({
          type: "image",
          attrs: options.uploadResult
            ? {
                src: options.uploadResult.src,
                alt: options.uploadResult.alt ?? options.uploadResult.name,
                title: options.uploadResult.title,
              }
            : {
                src: null,
                align: "center",
              },
        })
        .run();
    case "video":
      return chain
        .insertContent({
          type: "markweaveVideo",
          attrs: options.uploadResult
            ? {
                src: options.uploadResult.src,
                title: options.uploadResult.title ?? options.uploadResult.name,
                mimeType: options.uploadResult.mimeType,
              }
            : {
                src: null,
              },
        })
        .run();
    case "attachment":
      return chain
        .insertContent({
          type: "markweaveAttachment",
          attrs: {
            src: options.uploadResult?.src,
            name: options.uploadResult?.name ?? options.uploadResult?.src,
            mimeType: options.uploadResult?.mimeType,
            size: options.uploadResult?.size,
          },
        })
        .run();
    case "mermaid":
      return chain
        .setCodeBlock({ language: "mermaid" })
        .updateAttributes("codeBlock", { mermaidPreviewMode: "code" })
        .insertContent("graph TD\n  A[Start] --> B[End]")
        .run();
    default:
      return chain.run();
  }
}
