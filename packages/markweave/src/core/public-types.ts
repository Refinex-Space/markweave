import type { JSONContent, Editor } from "@tiptap/core";
import type { EditorSelectionSnapshot } from "../editor-core/selection-state";
import type { MarkweaveCodeBlockState } from "../plugins/codeblock/codeblock-behavior";
import type { MermaidPreviewState } from "../plugins/mermaid/mermaid-renderer";
import type { SlashCommandState } from "../plugins/slash-command/slash-state";
import type { TableMenuCopyKind } from "../plugins/table/table-clipboard";
import type { TableCommandId, TableCommandMenuKind } from "../plugins/table/table-command-spec";
import type { TableDebugSnapshot } from "../plugins/table/table-debug-snapshot";
import type { TableFocusState } from "../plugins/table/table-focus-state";
import type { TableInteractionState } from "../plugins/table/table-interaction-layer";
import type { MarkweaveEditorMode } from "./editor-mode-state";
import type { MarkweaveTocState } from "./toc-state";
import type { MarkweaveLang } from "../i18n";

export type MarkweaveContentFormat = "markdown" | "html" | "json";
export type MarkweaveContentValue = string | JSONContent;

export interface MarkweaveAskAiSelection {
  readonly from: number;
  readonly to: number;
  readonly text: string;
  readonly html: string;
}

export interface MarkweaveAskAiTextTarget {
  readonly kind: "text";
}

export interface MarkweaveAskAiTableCell {
  readonly position: number;
  readonly row: number;
  readonly column: number;
  readonly rowSpan: number;
  readonly columnSpan: number;
  readonly text: string;
  readonly html: string;
}

export interface MarkweaveAskAiTableTarget {
  readonly kind: "table";
  readonly scope: "cell" | "row" | "column" | "selection" | "table";
  readonly tablePos: number;
  readonly axisIndex: number | null;
  readonly cellPositions: readonly number[];
  readonly rows: number;
  readonly columns: number;
  readonly text: string;
  readonly html: string;
  readonly markdown: string;
  readonly resultShape: "fragment" | "table";
  readonly cells: readonly MarkweaveAskAiTableCell[];
}

export type MarkweaveAskAiTarget = MarkweaveAskAiTextTarget | MarkweaveAskAiTableTarget;

export interface MarkweaveAskAiRequest {
  readonly id: string;
  readonly prompt: string;
  readonly lang: MarkweaveLang;
  readonly selection: MarkweaveAskAiSelection;
  /** Omitted by pre-table integrations; absence is equivalent to `{ kind: "text" }`. */
  readonly target?: MarkweaveAskAiTarget;
  readonly outputFormat: "markdown";
  readonly signal: AbortSignal;
}

export type MarkweaveAskAiOutput = string | AsyncIterable<string>;

export type MarkweaveAskAiHandler = (
  request: MarkweaveAskAiRequest,
) => MarkweaveAskAiOutput | Promise<MarkweaveAskAiOutput>;

export type MarkweaveAskAiConfig =
  | { readonly enabled?: false }
  | {
      readonly enabled: true;
      readonly handler: MarkweaveAskAiHandler;
    };

export interface MarkweaveAiEditSelection {
  readonly from: number;
  readonly to: number;
  readonly text: string;
  readonly html: string;
  readonly markdown: string;
}

export type MarkweaveAiEditScope = "selection" | "blocks" | "document";

/**
 * One-based line range in Markweave's normalized Markdown projection.
 * `block` precision intentionally does not claim byte-for-byte source offsets.
 */
export interface MarkweaveAiEditLineRange {
  readonly start: number;
  readonly end: number;
  readonly basis: "normalized-markdown";
  readonly precision: "block";
}

export interface MarkweaveAiEditSelectionSnapshot extends MarkweaveAiEditSelection {
  readonly lineRange: MarkweaveAiEditLineRange;
  readonly eligible: boolean;
  readonly reason: "unsupported-selection" | null;
}

export interface MarkweaveAiEditTarget extends MarkweaveAiEditSelection {
  readonly scope: MarkweaveAiEditScope;
  readonly lineRange: MarkweaveAiEditLineRange;
}

export interface MarkweaveAiEditContext {
  readonly id: string;
  readonly lang: MarkweaveLang;
  readonly selection: MarkweaveAiEditSelection;
  /** Scope-aware capture. `selection` remains as the backward-compatible content alias. */
  readonly target: MarkweaveAiEditTarget;
  readonly signal: AbortSignal;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type MarkweaveAiEditPhase =
  | "idle"
  | "captured"
  | "streaming"
  | "review"
  | "error"
  | "conflict";

export type MarkweaveAiEditErrorCode =
  | "readonly"
  | "no-selection"
  | "unsupported-selection"
  | "unsupported-scope"
  | "active-review"
  | "stale-context"
  | "invalid-markdown"
  | "schema-incompatible"
  | "incomplete-proposal"
  | "proposal-too-complex"
  | "conflict";

export type MarkweaveAiEditResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: MarkweaveAiEditErrorCode;
      readonly message: string;
    };

export interface MarkweaveAiEditProposal {
  readonly contextId: string;
  /** Streaming integrations pass the complete accumulated Markdown, not an individual token. */
  readonly markdown: string;
  readonly status: "streaming" | "complete";
}

export interface MarkweaveAiEditState {
  readonly phase: MarkweaveAiEditPhase;
  readonly context: MarkweaveAiEditContext | null;
  readonly proposal: MarkweaveAiEditProposal | null;
  readonly error: string | null;
  readonly hunks: readonly MarkweaveAiEditHunk[];
  readonly activeHunkId: string | null;
}

export type MarkweaveAiEditHunkDisposition = "pending" | "accepted" | "discarded";

export interface MarkweaveAiEditHunk {
  readonly id: string;
  readonly kind: "insert" | "delete" | "replace";
  readonly from: number;
  readonly to: number;
  readonly originalMarkdown: string;
  readonly proposedMarkdown: string;
  readonly lineRange: MarkweaveAiEditLineRange;
  readonly disposition: MarkweaveAiEditHunkDisposition;
}

export interface MarkweaveAiEditHunkDecision {
  readonly hunkId: string;
  readonly decision: Exclude<MarkweaveAiEditHunkDisposition, "pending">;
  readonly appliedRange?: { readonly from: number; readonly to: number };
}

export interface MarkweaveAiEditDecision {
  readonly contextId: string;
  readonly decision: "accepted" | "discarded" | "partially-accepted" | "conflict";
  readonly original: MarkweaveAiEditSelection;
  readonly originalTarget: MarkweaveAiEditTarget;
  readonly proposedMarkdown: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly appliedRange?: { readonly from: number; readonly to: number };
  readonly appliedRanges?: readonly { readonly from: number; readonly to: number }[];
  readonly hunkDecisions?: readonly MarkweaveAiEditHunkDecision[];
}

export interface MarkweaveAiEditController {
  /** Lazily serializes the current non-empty selection for host UI. */
  readonly getSelection: () => MarkweaveAiEditSelectionSnapshot | null;
  /** Emits only while a host listener is registered; content is not added to runtime snapshots. */
  readonly subscribeSelection: (
    listener: (selection: MarkweaveAiEditSelectionSnapshot | null) => void,
  ) => () => void;
  readonly capture: (options: {
    readonly scope: MarkweaveAiEditScope;
    readonly metadata?: Readonly<Record<string, unknown>>;
    /** Inline review remains visible; this option controls only Markweave's built-in action bar. */
    readonly controls?: "default" | "none";
  }) => MarkweaveAiEditResult<MarkweaveAiEditContext>;
  readonly captureSelection: (options?: {
    readonly metadata?: Readonly<Record<string, unknown>>;
    /** Inline review remains visible; this option controls only Markweave's built-in action bar. */
    readonly controls?: "default" | "none";
  }) => MarkweaveAiEditResult<MarkweaveAiEditContext>;
  readonly updateProposal: (
    proposal: MarkweaveAiEditProposal,
  ) => MarkweaveAiEditResult<MarkweaveAiEditState>;
  readonly failProposal: (
    contextId: string,
    message?: string,
  ) => MarkweaveAiEditResult<MarkweaveAiEditState>;
  readonly accept: (
    contextId: string,
  ) => MarkweaveAiEditResult<MarkweaveAiEditDecision>;
  readonly discard: (
    contextId: string,
  ) => MarkweaveAiEditResult<MarkweaveAiEditDecision>;
  readonly acceptAll: (
    contextId: string,
  ) => MarkweaveAiEditResult<MarkweaveAiEditDecision>;
  readonly discardAll: (
    contextId: string,
  ) => MarkweaveAiEditResult<MarkweaveAiEditDecision>;
  readonly activateHunk: (
    contextId: string,
    hunkId: string,
  ) => MarkweaveAiEditResult<MarkweaveAiEditState>;
  readonly previousHunk: (
    contextId: string,
  ) => MarkweaveAiEditResult<MarkweaveAiEditState>;
  readonly nextHunk: (
    contextId: string,
  ) => MarkweaveAiEditResult<MarkweaveAiEditState>;
  readonly acceptHunk: (
    contextId: string,
    hunkId: string,
  ) => MarkweaveAiEditResult<MarkweaveAiEditState | MarkweaveAiEditDecision>;
  readonly discardHunk: (
    contextId: string,
    hunkId: string,
  ) => MarkweaveAiEditResult<MarkweaveAiEditState | MarkweaveAiEditDecision>;
  readonly getState: () => MarkweaveAiEditState;
  readonly subscribe: (
    listener: (state: MarkweaveAiEditState) => void,
  ) => () => void;
  readonly onDecision: (
    listener: (event: MarkweaveAiEditDecision) => void,
  ) => () => void;
}

export interface MarkweaveEditorUpdatePayload {
  readonly editor: Editor;
  readonly html: string;
  readonly json: JSONContent;
  readonly markdown: string;
  readonly text: string;
}

export interface MarkweaveEditorRuntimeSnapshot {
  readonly revision: number;
  readonly mode: MarkweaveEditorMode;
  readonly editable: boolean;
  readonly toc: MarkweaveTocState;
  readonly selection: EditorSelectionSnapshot | null;
  readonly slash: SlashCommandState;
  readonly table: TableFocusState;
  readonly tableInteraction: TableInteractionState;
  readonly codeBlock: MarkweaveCodeBlockState;
  readonly mermaid: MermaidPreviewState;
  readonly tableDebugSnapshot: TableDebugSnapshot | null;
}

export interface MarkweaveEditorSetContentOptions {
  readonly emitUpdate?: boolean;
  readonly format?: MarkweaveContentFormat;
  readonly focusFirstTableBodyCell?: boolean;
}

export type FloatingToolbarAssistantSource = "rewrite-selection" | "extract-to-note";

export interface FloatingToolbarAssistantRequest {
  readonly source: FloatingToolbarAssistantSource;
  readonly from: number;
  readonly to: number;
  readonly text: string;
  readonly html: string;
}

export interface TableEditWithAiRequest {
  readonly source: "row" | "column" | "selection";
  readonly axisIndex: number | null;
  readonly cellPositions: readonly number[];
  readonly text: string;
  readonly html: string;
}

export interface TableCommandSnapshot {
  readonly tableCount: number;
  readonly rowCount: number;
  readonly visualWidth: number;
  readonly focusMode: string;
  readonly selectedCellCount: number;
}

export interface TableCommandResult {
  readonly commandId: TableCommandId;
  readonly label: string;
  readonly menu: TableCommandMenuKind | "selection";
  readonly success: boolean;
  readonly before: TableCommandSnapshot;
  readonly after: TableCommandSnapshot;
  readonly copyPayload: { readonly kind: TableMenuCopyKind; readonly text: string; readonly htmlLength: number } | null;
}
