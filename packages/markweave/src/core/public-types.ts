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
