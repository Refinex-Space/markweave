import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";

export type SelectionKind = "collapsed" | "range" | "node" | "cell";
export type SelectionSurface = "collapsed" | "text-range" | "table-cell-text-range" | "table-cell-selection" | "node" | "suppressed";
export type FloatingToolbarVariant = "hidden" | "default" | "table-compact";
export type FloatingToolbarVisibility = "visible" | "hidden";
export type FloatingToolbarMotionPhase = "hidden" | "entering" | "visible" | "repositioning" | "exiting";
export type FloatingToolbarHiddenReason =
  | "no-selection"
  | "editor-readonly"
  | "collapsed-selection"
  | "node-selection"
  | "table-cell-selection"
  | "suppressed-selection";
export type FloatingToolbarPlacement = "top" | "bottom";

export interface FloatingToolbarState {
  readonly visibility: FloatingToolbarVisibility;
  readonly variant: FloatingToolbarVariant;
  readonly hiddenReason: FloatingToolbarHiddenReason | null;
  readonly motionPhase: FloatingToolbarMotionPhase;
  readonly motionStartedAtMs: number | null;
  readonly motionDurationMs: number;
  readonly motionEasing: string;
  readonly updateDelayMs: number;
  readonly placement: "top";
  readonly offset: number;
  readonly boundaryPadding: number;
}

export interface FloatingToolbarRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface FloatingToolbarSize {
  readonly width: number;
  readonly height: number;
}

export interface FloatingToolbarViewport {
  readonly width: number;
  readonly height: number;
}

export interface FloatingToolbarPositionInput {
  readonly selectionRect: FloatingToolbarRect;
  readonly toolbarSize: FloatingToolbarSize;
  readonly viewport: FloatingToolbarViewport;
  readonly frameRect?: FloatingToolbarRect | null;
  readonly offset?: number;
  readonly boundaryPadding?: number;
}

export interface FloatingToolbarTopBoundaryInput {
  readonly frameRect?: FloatingToolbarRect | null;
  readonly toolbarSize: FloatingToolbarSize;
  readonly offset?: number;
  readonly boundaryPadding?: number;
}

export interface FloatingToolbarFrameClampInput {
  readonly toolbarRect: FloatingToolbarRect;
  readonly frameRect: FloatingToolbarRect;
  readonly boundaryPadding?: number;
}

export interface FloatingToolbarPosition {
  readonly left: number;
  readonly top: number;
  readonly placement: FloatingToolbarPlacement;
  readonly transformOrigin: "bottom center" | "top center";
}

export interface FloatingToolbarFloatingOptions {
  readonly placement: FloatingToolbarState["placement"];
  readonly offset: number;
  readonly strategy: "fixed";
  readonly flip: {
    readonly padding:
      | number
      | {
          readonly top: number;
          readonly right: number;
          readonly bottom: number;
          readonly left: number;
        };
    readonly fallbackPlacements: ["bottom"];
  };
  readonly shift: {
    readonly padding: number;
  };
}

export interface FloatingToolbarFloatingOptionsInput {
  readonly topBoundaryPadding?: number;
}

export interface EditorSelectionSnapshot {
  readonly kind: SelectionKind;
  readonly from: number;
  readonly to: number;
  readonly empty: boolean;
  readonly activeMarks: readonly string[];
  readonly currentNode: string | null;
  readonly ancestorNodes: readonly string[];
  readonly inTable: boolean;
  readonly surface: SelectionSurface;
  readonly floatingToolbarVariant: FloatingToolbarVariant;
}

const trackedMarks = ["bold", "italic", "strike", "underline", "code", "link", "highlight"] as const;
export const floatingToolbarTiming = {
  updateDelayMs: 120,
  placement: "top",
  offset: 8,
  boundaryPadding: 8,
} as const;
export const floatingToolbarMotion = {
  enterDurationMs: 90,
  repositionDurationMs: 80,
  exitDurationMs: 70,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

export function createSelectionSnapshot(editor: Editor): EditorSelectionSnapshot {
  const { selection } = editor.state;
  const activeMarks = trackedMarks.filter((mark) => editor.isActive(mark));
  const currentNode = findCurrentNodeName(editor);
  const ancestorNodes = findAncestorNodeNames(editor);
  const kind = selection instanceof CellSelection ? "cell" : selection.empty ? "collapsed" : selection instanceof NodeSelection ? "node" : "range";
  const inTable = ancestorNodes.some(isTableNodeName);
  const surface = classifySelectionSurface({ ancestorNodes, empty: selection.empty, kind });

  return {
    kind,
    from: selection.from,
    to: selection.to,
    empty: selection.empty,
    activeMarks,
    currentNode,
    ancestorNodes,
    inTable,
    surface,
    floatingToolbarVariant: getFloatingToolbarVariantForSurface(surface),
  };
}

export function shouldShowFloatingToolbar(snapshot: EditorSelectionSnapshot) {
  return getFloatingToolbarState(snapshot).visibility === "visible";
}

export function getFloatingToolbarVariant(snapshot: EditorSelectionSnapshot): FloatingToolbarVariant {
  return getFloatingToolbarState(snapshot).variant;
}

export function getFloatingToolbarState(snapshot: EditorSelectionSnapshot | null, options: { readonly editable?: boolean } = {}): FloatingToolbarState {
  const editable = options.editable ?? true;

  if (!snapshot) {
    return createHiddenFloatingToolbarState("no-selection");
  }

  if (!editable) {
    return createHiddenFloatingToolbarState("editor-readonly");
  }

  if (snapshot.surface === "text-range" || snapshot.surface === "table-cell-text-range") {
    return {
      visibility: "visible",
      variant: snapshot.floatingToolbarVariant,
      hiddenReason: null,
      motionPhase: "visible",
      motionStartedAtMs: null,
      motionDurationMs: 0,
      motionEasing: floatingToolbarMotion.easing,
      ...floatingToolbarTiming,
    };
  }

  if (snapshot.surface === "collapsed") {
    return createHiddenFloatingToolbarState("collapsed-selection");
  }

  if (snapshot.surface === "node") {
    return createHiddenFloatingToolbarState("node-selection");
  }

  if (snapshot.surface === "table-cell-selection") {
    return createHiddenFloatingToolbarState("table-cell-selection");
  }

  return createHiddenFloatingToolbarState("suppressed-selection");
}

export function transitionFloatingToolbarState(previous: FloatingToolbarState | null, next: FloatingToolbarState, nowMs: number): FloatingToolbarState {
  if (!previous) {
    return next;
  }

  const settledPrevious = advanceFloatingToolbarMotionState(previous, nowMs);

  if (settledPrevious.visibility === "hidden" && next.visibility === "visible") {
    return withFloatingToolbarMotion(next, "entering", nowMs, floatingToolbarMotion.enterDurationMs);
  }

  if (settledPrevious.visibility === "visible" && next.visibility === "hidden") {
    return withFloatingToolbarMotion(
      {
        ...next,
        variant: settledPrevious.variant,
      },
      "exiting",
      nowMs,
      floatingToolbarMotion.exitDurationMs,
    );
  }

  if (settledPrevious.visibility === "visible" && next.visibility === "visible" && settledPrevious.variant !== next.variant) {
    return withFloatingToolbarMotion(next, "repositioning", nowMs, floatingToolbarMotion.repositionDurationMs);
  }

  return next;
}

export function advanceFloatingToolbarMotionState(state: FloatingToolbarState, nowMs: number): FloatingToolbarState {
  if (state.motionStartedAtMs === null || state.motionDurationMs <= 0) {
    return state;
  }

  if (nowMs - state.motionStartedAtMs < state.motionDurationMs) {
    return state;
  }

  if (state.motionPhase === "exiting") {
    return createHiddenFloatingToolbarState(state.hiddenReason ?? "suppressed-selection");
  }

  if (state.motionPhase === "entering" || state.motionPhase === "repositioning") {
    return {
      ...state,
      motionPhase: "visible",
      motionStartedAtMs: null,
      motionDurationMs: 0,
    };
  }

  return state;
}

export function isTableSelectionSnapshot(snapshot: EditorSelectionSnapshot) {
  return snapshot.inTable;
}

export function getFloatingToolbarFloatingOptions(
  state: FloatingToolbarState,
  input: FloatingToolbarFloatingOptionsInput = {},
): FloatingToolbarFloatingOptions {
  const flipPadding =
    input.topBoundaryPadding === undefined
      ? state.boundaryPadding
      : {
          top: Math.max(state.boundaryPadding, Math.round(input.topBoundaryPadding)),
          right: state.boundaryPadding,
          bottom: state.boundaryPadding,
          left: state.boundaryPadding,
        };

  return {
    placement: state.placement,
    offset: state.offset,
    strategy: "fixed",
    flip: {
      padding: flipPadding,
      fallbackPlacements: ["bottom"],
    },
    shift: {
      padding: state.boundaryPadding,
    },
  };
}

export function calculateFloatingToolbarTopBoundary(input: FloatingToolbarTopBoundaryInput) {
  const offset = input.offset ?? floatingToolbarTiming.offset;
  const boundaryPadding = input.boundaryPadding ?? floatingToolbarTiming.boundaryPadding;

  if (!input.frameRect) {
    return boundaryPadding;
  }

  return Math.max(boundaryPadding, Math.round(input.frameRect.top + input.toolbarSize.height + offset));
}

export function calculateFloatingToolbarPosition(input: FloatingToolbarPositionInput): FloatingToolbarPosition {
  const offset = input.offset ?? floatingToolbarTiming.offset;
  const boundaryPadding = input.boundaryPadding ?? 8;
  const centeredLeft = input.selectionRect.left + input.selectionRect.width / 2 - input.toolbarSize.width / 2;
  const maxLeft = Math.max(boundaryPadding, input.viewport.width - input.toolbarSize.width - boundaryPadding);
  const left = clamp(centeredLeft, boundaryPadding, maxLeft);
  const topPlacement = input.selectionRect.top - input.toolbarSize.height - offset;
  const topBoundary = calculateFloatingToolbarTopBoundary({
    frameRect: input.frameRect,
    toolbarSize: input.toolbarSize,
    offset,
    boundaryPadding,
  });

  if (topPlacement >= topBoundary) {
    return {
      left: Math.round(left),
      top: Math.round(topPlacement),
      placement: "top",
      transformOrigin: "bottom center",
    };
  }

  const bottomPlacement = input.selectionRect.top + input.selectionRect.height + offset;
  const maxTop = Math.max(boundaryPadding, input.viewport.height - input.toolbarSize.height - boundaryPadding);

  return {
    left: Math.round(left),
    top: Math.round(clamp(bottomPlacement, boundaryPadding, maxTop)),
    placement: "bottom",
    transformOrigin: "top center",
  };
}

export function calculateFloatingToolbarFrameShift(input: FloatingToolbarFrameClampInput) {
  const boundaryPadding = input.boundaryPadding ?? floatingToolbarTiming.boundaryPadding;
  const minLeft = input.frameRect.left + boundaryPadding;
  const maxRight = input.frameRect.left + input.frameRect.width - boundaryPadding;
  const availableWidth = Math.max(0, maxRight - minLeft);

  if (input.toolbarRect.width > availableWidth) {
    return Math.round(minLeft - input.toolbarRect.left);
  }

  if (input.toolbarRect.left < minLeft) {
    return Math.round(minLeft - input.toolbarRect.left);
  }

  const currentRight = input.toolbarRect.left + input.toolbarRect.width;

  if (currentRight > maxRight) {
    return Math.round(maxRight - currentRight);
  }

  return 0;
}

function findCurrentNodeName(editor: Editor) {
  const { $from } = editor.state.selection;
  return $from.parent.type.name || null;
}

function findAncestorNodeNames(editor: Editor) {
  const { $from } = editor.state.selection;
  const names: string[] = [];

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    names.push($from.node(depth).type.name);
  }

  return names;
}

function classifySelectionSurface(input: {
  readonly ancestorNodes: readonly string[];
  readonly empty: boolean;
  readonly kind: SelectionKind;
}): SelectionSurface {
  if (input.empty || input.kind === "collapsed") {
    return "collapsed";
  }

  if (input.kind === "cell") {
    return "table-cell-selection";
  }

  if (input.kind === "node") {
    return "node";
  }

  if (input.ancestorNodes.some(isSuppressedToolbarNodeName)) {
    return "suppressed";
  }

  if (input.ancestorNodes.some(isTableCellNodeName)) {
    return "table-cell-text-range";
  }

  return "text-range";
}

function getFloatingToolbarVariantForSurface(surface: SelectionSurface): FloatingToolbarVariant {
  if (surface === "table-cell-text-range") {
    return "table-compact";
  }

  if (surface === "text-range") {
    return "default";
  }

  return "hidden";
}

function createHiddenFloatingToolbarState(hiddenReason: FloatingToolbarHiddenReason): FloatingToolbarState {
  return {
    visibility: "hidden",
    variant: "hidden",
    hiddenReason,
    motionPhase: "hidden",
    motionStartedAtMs: null,
    motionDurationMs: 0,
    motionEasing: floatingToolbarMotion.easing,
    ...floatingToolbarTiming,
  };
}

function withFloatingToolbarMotion(
  state: FloatingToolbarState,
  motionPhase: Exclude<FloatingToolbarMotionPhase, "hidden" | "visible">,
  motionStartedAtMs: number,
  motionDurationMs: number,
): FloatingToolbarState {
  return {
    ...state,
    motionPhase,
    motionStartedAtMs,
    motionDurationMs,
    motionEasing: floatingToolbarMotion.easing,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isTableNodeName(nodeName: string) {
  return nodeName === "table" || isTableCellNodeName(nodeName) || nodeName === "tableRow";
}

function isTableCellNodeName(nodeName: string) {
  return nodeName === "tableCell" || nodeName === "tableHeader";
}

function isSuppressedToolbarNodeName(nodeName: string) {
  return nodeName === "codeBlock";
}
