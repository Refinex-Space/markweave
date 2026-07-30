import { Extension, type Editor, type JSONContent } from "@tiptap/core";
import { DOMSerializer, Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import katex from "katex";
import type {
  MarkweaveAskAiHandler,
  MarkweaveAskAiOutput,
  MarkweaveAskAiRequest,
  MarkweaveAskAiSelection,
  MarkweaveAskAiTableCell,
  MarkweaveAskAiTableTarget,
  MarkweaveAskAiTarget,
  TableEditWithAiRequest,
} from "../../core/public-types";
import type { MarkweaveLang } from "../../i18n";
import { getTableEditWithAiRequest } from "../table/table-ui-model";

export type MarkweaveAskAiTargetStatus = "target" | "conflict" | "applied";

export interface MarkweaveAskAiTargetState {
  readonly status: MarkweaveAskAiTargetStatus;
  readonly from: number;
  readonly to: number;
  readonly selection: MarkweaveAskAiSelection;
  readonly target: MarkweaveAskAiTarget;
}

export interface MarkweaveAskAiRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface MarkweaveAskAiPanelPosition {
  readonly left: number;
  readonly top: number;
  readonly placement: "top" | "bottom";
  readonly width: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
}

export interface MarkweaveAskAiPanelPositionInput {
  readonly anchorRect: MarkweaveAskAiRect;
  readonly selectionRect: MarkweaveAskAiRect;
  readonly panelSize: { readonly width: number; readonly height: number };
  readonly viewport: { readonly width: number; readonly height: number };
  readonly frameRect?: MarkweaveAskAiRect | null;
  readonly surfaceRect?: MarkweaveAskAiRect | null;
  readonly gap?: number;
  readonly boundaryPadding?: number;
}

export type MarkweaveAskAiErrorCode = "empty-result" | "invalid-output";

export class MarkweaveAskAiError extends Error {
  readonly code: MarkweaveAskAiErrorCode;

  constructor(code: MarkweaveAskAiErrorCode, message: string) {
    super(message);
    this.name = "MarkweaveAskAiError";
    this.code = code;
  }
}

interface AskAiTableCellSnapshot {
  readonly position: number;
  readonly typeName: string;
  readonly attrs: string;
  readonly content: Fragment;
}

interface AskAiPreviewState {
  readonly markdown: string;
  readonly content: Fragment | null;
  readonly cellContents: readonly Fragment[] | null;
}

interface AskAiPluginState extends MarkweaveAskAiTargetState {
  readonly originalContent: Fragment | null;
  readonly originalCells: readonly AskAiTableCellSnapshot[] | null;
  readonly preview: AskAiPreviewState | null;
}

type AskAiPluginMeta =
  | {
      readonly type: "start";
      readonly selection: MarkweaveAskAiSelection;
      readonly target: MarkweaveAskAiTarget;
      readonly originalContent: Fragment | null;
      readonly originalCells: readonly AskAiTableCellSnapshot[] | null;
    }
  | { readonly type: "clear" }
  | {
      readonly type: "preview";
      readonly preview: AskAiPreviewState | null;
    }
  | {
      readonly type: "applied";
      readonly selection: MarkweaveAskAiSelection;
      readonly target: MarkweaveAskAiTarget;
    };

const emptyAskAiPluginState: AskAiPluginState | null = null;

export const markweaveAskAiPluginKey = new PluginKey<AskAiPluginState | null>("markweaveAskAi");

function getAskAiPluginMeta(transaction: Transaction) {
  return transaction.getMeta(markweaveAskAiPluginKey) as AskAiPluginMeta | undefined;
}

function createAskAiProposalDom(content: Fragment, kind: "text" | "table-cell", schema: EditorState["schema"]) {
  const element = document.createElement(kind === "text" ? "span" : "div");
  element.className = `markweave-ask-ai-proposal markweave-ask-ai-proposal--${kind}`;
  element.dataset.markweaveAskAiProposal = kind;
  element.contentEditable = "false";
  element.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(content));
  enhanceMarkweaveAskAiPreview(element);
  return element;
}

function createAskAiProposalVersion(markdown: string) {
  let hash = 2166136261;
  for (let index = 0; index < markdown.length; index += 1) {
    hash ^= markdown.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${markdown.length}-${(hash >>> 0).toString(36)}`;
}

function createAskAiDecorations(state: EditorState) {
  const target = markweaveAskAiPluginKey.getState(state);
  if (!target || target.from >= target.to) {
    return DecorationSet.empty;
  }

  if (target.target.kind === "table") {
    const previewVersion = target.preview ? createAskAiProposalVersion(target.preview.markdown) : "none";
    const decorations = target.target.cellPositions.flatMap((position, index) => {
      const cell = state.doc.nodeAt(position);
      if (!cell) {
        return [];
      }
      const previewContent = target.status === "target" ? target.preview?.cellContents?.[index] : null;
      const cellDecoration = Decoration.node(position, position + cell.nodeSize, {
        class: previewContent
          ? "markweave-ask-ai-target markweave-ask-ai-original markweave-ask-ai-proposal-cell"
          : target.status === "applied"
            ? "markweave-ask-ai-applied"
            : "markweave-ask-ai-target",
        "data-markweave-ask-ai-status": target.status,
        ...(previewContent ? { "data-markweave-ask-ai-original": "true" } : {}),
      });
      return previewContent
        ? [
            cellDecoration,
            Decoration.widget(
              position + 1,
              () => createAskAiProposalDom(previewContent, "table-cell", state.schema),
              { key: `markweave-ask-ai-table-proposal-${position}-${previewVersion}`, side: -1 },
            ),
          ]
        : [cellDecoration];
    });
    return DecorationSet.create(state.doc, decorations);
  }

  if (target.status === "target" && target.preview?.content) {
    const previewVersion = createAskAiProposalVersion(target.preview.markdown);
    return DecorationSet.create(state.doc, [
      Decoration.inline(target.from, target.to, {
        class: "markweave-ask-ai-target markweave-ask-ai-original",
        "data-markweave-ask-ai-status": target.status,
        "data-markweave-ask-ai-original": "true",
      }),
      Decoration.widget(
        target.from,
        () => createAskAiProposalDom(target.preview!.content!, "text", state.schema),
        { key: `markweave-ask-ai-text-proposal-${previewVersion}`, side: -1 },
      ),
    ]);
  }

  return DecorationSet.create(state.doc, [
    Decoration.inline(target.from, target.to, {
      class: target.status === "applied" ? "markweave-ask-ai-applied" : "markweave-ask-ai-target",
      "data-markweave-ask-ai-status": target.status,
    }),
  ]);
}

function mapTableTarget(target: MarkweaveAskAiTableTarget, transaction: Transaction): MarkweaveAskAiTableTarget {
  const positions = target.cellPositions.map((position) => transaction.mapping.map(position, 1));
  return {
    ...target,
    tablePos: transaction.mapping.map(target.tablePos, 1),
    cellPositions: positions,
    cells: target.cells.map((cell, index) => ({ ...cell, position: positions[index] ?? cell.position })),
  };
}

function mapAskAiTarget(target: MarkweaveAskAiTarget, transaction: Transaction): MarkweaveAskAiTarget {
  return target.kind === "table" ? mapTableTarget(target, transaction) : target;
}

function mapAskAiSelection(selection: MarkweaveAskAiSelection, transaction: Transaction): MarkweaveAskAiSelection {
  return {
    ...selection,
    from: transaction.mapping.map(selection.from, 1),
    to: transaction.mapping.map(selection.to, -1),
  };
}

function tableTargetStillMatches(doc: ProseMirrorNode, snapshots: readonly AskAiTableCellSnapshot[]) {
  return snapshots.every((snapshot) => {
    const node = doc.nodeAt(snapshot.position);
    return Boolean(
      node &&
      (node.type.name === "tableCell" || node.type.name === "tableHeader") &&
      node.type.name === snapshot.typeName &&
      JSON.stringify(node.attrs) === snapshot.attrs &&
      node.content.eq(snapshot.content),
    );
  });
}

function applyAskAiTransaction(
  transaction: Transaction,
  previous: AskAiPluginState | null,
): AskAiPluginState | null {
  const meta = getAskAiPluginMeta(transaction);
  if (meta?.type === "clear") {
    return emptyAskAiPluginState;
  }

  if (meta?.type === "start") {
    return {
      status: "target",
      from: meta.selection.from,
      to: meta.selection.to,
      selection: meta.selection,
      target: meta.target,
      originalContent: meta.originalContent,
      originalCells: meta.originalCells,
      preview: null,
    };
  }

  if (meta?.type === "preview") {
    return previous && previous.status === "target"
      ? { ...previous, preview: meta.preview }
      : previous;
  }

  if (meta?.type === "applied") {
    return {
      status: "applied",
      from: meta.selection.from,
      to: meta.selection.to,
      selection: meta.selection,
      target: meta.target,
      originalContent: null,
      originalCells: null,
      preview: null,
    };
  }

  if (!previous || !transaction.docChanged) {
    return previous;
  }

  const selection = mapAskAiSelection(previous.selection, transaction);
  const target = mapAskAiTarget(previous.target, transaction);
  const mappedOriginalCells = previous.originalCells?.map((snapshot) => ({
    ...snapshot,
    position: transaction.mapping.map(snapshot.position, 1),
  })) ?? null;
  const mapped = {
    ...previous,
    from: selection.from,
    to: selection.to,
    selection,
    target,
    originalCells: mappedOriginalCells,
  };

  if (previous.status === "applied") {
    return mapped;
  }

  if (selection.from >= selection.to) {
    return { ...mapped, status: "conflict", originalContent: null, originalCells: null, preview: null };
  }

  if (target.kind === "table") {
    return mappedOriginalCells && tableTargetStillMatches(transaction.doc, mappedOriginalCells)
      ? mapped
      : { ...mapped, status: "conflict", originalContent: null, originalCells: null, preview: null };
  }

  if (!previous.originalContent) {
    return { ...mapped, status: "conflict", originalContent: null, originalCells: null, preview: null };
  }

  const mappedContent = transaction.doc.slice(selection.from, selection.to).content;
  if (!mappedContent.eq(previous.originalContent)) {
    return { ...mapped, status: "conflict", originalContent: null, originalCells: null, preview: null };
  }

  return mapped;
}

export const MarkweaveAskAi = Extension.create({
  name: "markweaveAskAi",

  addProseMirrorPlugins() {
    return [
      new Plugin<AskAiPluginState | null>({
        key: markweaveAskAiPluginKey,
        state: {
          init: () => emptyAskAiPluginState,
          apply: applyAskAiTransaction,
        },
        props: {
          decorations: createAskAiDecorations,
        },
      }),
    ];
  },
});

function selectionContainsUnsupportedNode(editor: Editor, from: number, to: number) {
  let unsupported = false;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if ((!node.isText && node.isAtom) || node.type.name === "codeBlock" || node.type.name === "table" || node.type.name === "tableCell" || node.type.name === "tableHeader") {
      unsupported = true;
      return false;
    }
    return true;
  });
  return unsupported;
}

function selectionHasUnsupportedAncestor(editor: Editor) {
  const { $from, $to } = editor.state.selection;
  for (const resolved of [$from, $to]) {
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      const name = resolved.node(depth).type.name;
      if (name === "codeBlock" || name === "table" || name === "tableCell" || name === "tableHeader") {
        return true;
      }
    }
  }
  return false;
}

export function isMarkweaveAskAiSelectionEligible(editor: Editor) {
  const { selection } = editor.state;
  if (!editor.isEditable || !(selection instanceof TextSelection) || selection.empty) {
    return false;
  }
  return !selectionHasUnsupportedAncestor(editor) && !selectionContainsUnsupportedNode(editor, selection.from, selection.to);
}

function serializeAskAiSelectionHtml(editor: Editor) {
  if (typeof document === "undefined") {
    return "";
  }
  const container = document.createElement("div");
  container.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(editor.state.selection.content().content));
  return container.innerHTML;
}

export function createMarkweaveAskAiSelection(editor: Editor): MarkweaveAskAiSelection | null {
  if (!isMarkweaveAskAiSelectionEligible(editor)) {
    return null;
  }
  const { from, to } = editor.state.selection;
  return {
    from,
    to,
    text: editor.state.doc.textBetween(from, to, "\n\n", "\n"),
    html: serializeAskAiSelectionHtml(editor),
  };
}

export function startMarkweaveAskAiTarget(editor: Editor) {
  const selection = createMarkweaveAskAiSelection(editor);
  if (!selection) {
    return null;
  }
  editor.view.dispatch(
    editor.state.tr
      .setMeta(markweaveAskAiPluginKey, {
        type: "start",
        selection,
        target: { kind: "text" },
        originalContent: editor.state.doc.slice(selection.from, selection.to).content,
        originalCells: null,
      } satisfies AskAiPluginMeta)
      .setMeta("addToHistory", false),
  );
  return selection;
}

export function clearMarkweaveAskAiTarget(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setMeta(markweaveAskAiPluginKey, { type: "clear" } satisfies AskAiPluginMeta).setMeta("addToHistory", false));
}

export function getMarkweaveAskAiTarget(editor: Editor): MarkweaveAskAiTargetState | null {
  const target = markweaveAskAiPluginKey.getState(editor.state);
  return target
    ? { status: target.status, from: target.from, to: target.to, selection: target.selection, target: target.target }
    : null;
}

export function getMappedMarkweaveAskAiSelection(
  editor: Editor,
  selection: MarkweaveAskAiSelection,
): MarkweaveAskAiSelection | null {
  const target = getMarkweaveAskAiTarget(editor);
  if (!target || target.status !== "target") {
    return null;
  }
  return { ...selection, from: target.from, to: target.to };
}

function serializeFragmentHtml(editor: Editor, fragment: Fragment) {
  if (typeof document === "undefined") {
    return "";
  }
  const container = document.createElement("div");
  container.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(fragment));
  return container.innerHTML;
}

function findTableForCell(editor: Editor, cellPosition: number) {
  const $cell = editor.state.doc.resolve(cellPosition);
  for (let depth = $cell.depth; depth > 0; depth -= 1) {
    const node = $cell.node(depth);
    if (node.type.name === "table") {
      return { node, position: $cell.before(depth) };
    }
  }
  return null;
}

function escapeMarkdownTableCell(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function createTableTargetMarkdown(cells: readonly MarkweaveAskAiTableCell[], rows: number, columns: number) {
  const matrix = Array.from({ length: rows }, () => Array.from({ length: columns }, () => ""));
  cells.forEach((cell) => {
    if (matrix[cell.row]?.[cell.column] !== undefined) {
      matrix[cell.row][cell.column] = escapeMarkdownTableCell(cell.text);
    }
  });
  const lines = matrix.map((row) => `| ${row.join(" | ")} |`);
  lines.splice(1, 0, `| ${Array.from({ length: columns }, () => "---").join(" | ")} |`);
  return lines.join("\n");
}

function createTableTargetSnapshot(editor: Editor, source: TableEditWithAiRequest["source"]) {
  const request = getTableEditWithAiRequest(editor, source);
  if (!request || request.cellPositions.length === 0) {
    return null;
  }
  const table = findTableForCell(editor, request.cellPositions[0]);
  if (!table) {
    return null;
  }
  const map = TableMap.get(table.node);
  const absoluteCells = request.cellPositions.flatMap((position) => {
    const node = editor.state.doc.nodeAt(position);
    if (!node || (node.type.name !== "tableCell" && node.type.name !== "tableHeader")) {
      return [];
    }
    const rect = map.findCell(position - table.position - 1);
    return [{ position, node, rect }];
  });
  if (absoluteCells.length !== request.cellPositions.length) {
    return null;
  }
  const minRow = Math.min(...absoluteCells.map(({ rect }) => rect.top));
  const minColumn = Math.min(...absoluteCells.map(({ rect }) => rect.left));
  const maxRow = Math.max(...absoluteCells.map(({ rect }) => rect.bottom));
  const maxColumn = Math.max(...absoluteCells.map(({ rect }) => rect.right));
  const rows = maxRow - minRow;
  const columns = maxColumn - minColumn;
  const cells = absoluteCells
    .map(({ position, node, rect }): MarkweaveAskAiTableCell => ({
      position,
      row: rect.top - minRow,
      column: rect.left - minColumn,
      rowSpan: Number(node.attrs.rowspan ?? 1),
      columnSpan: Number(node.attrs.colspan ?? 1),
      text: node.textContent,
      html: serializeFragmentHtml(editor, node.content),
    }))
    .sort((left, right) => left.row - right.row || left.column - right.column);
  const hasMergedCell = cells.some((cell) => cell.rowSpan > 1 || cell.columnSpan > 1);
  if (hasMergedCell && (source !== "selection" || cells.length > 1)) {
    return null;
  }
  if (cells.length > 1 && cells.length !== rows * columns) {
    return null;
  }
  const coversWholeTable = minRow === 0 && minColumn === 0 && maxRow === map.height && maxColumn === map.width;
  const scope: MarkweaveAskAiTableTarget["scope"] = source === "selection" && cells.length === 1
    ? "cell"
    : coversWholeTable
      ? "table"
      : source;
  const target: MarkweaveAskAiTableTarget = {
    kind: "table",
    scope,
    tablePos: table.position,
    axisIndex: request.axisIndex,
    cellPositions: cells.map((cell) => cell.position),
    rows,
    columns,
    text: request.text,
    html: request.html,
    markdown: cells.length === 1 ? cells[0].text : createTableTargetMarkdown(cells, rows, columns),
    resultShape: cells.length === 1 ? "fragment" : "table",
    cells,
  };
  const firstPosition = Math.min(...cells.map((cell) => cell.position));
  const lastPosition = Math.max(...cells.map((cell) => cell.position));
  const lastNode = editor.state.doc.nodeAt(lastPosition);
  const selection: MarkweaveAskAiSelection = {
    from: firstPosition + 1,
    to: lastPosition + Math.max(1, (lastNode?.nodeSize ?? 2) - 1),
    text: request.text,
    html: request.html,
  };
  const originalCells = cells.map((cell): AskAiTableCellSnapshot => {
    const node = editor.state.doc.nodeAt(cell.position)!;
    return {
      position: cell.position,
      typeName: node.type.name,
      attrs: JSON.stringify(node.attrs),
      content: node.content,
    };
  });
  return { selection, target, originalCells };
}

export function canStartMarkweaveAskAiTableTarget(editor: Editor, source: TableEditWithAiRequest["source"]) {
  return editor.isEditable && Boolean(createTableTargetSnapshot(editor, source));
}

export function startMarkweaveAskAiTableTarget(editor: Editor, source: TableEditWithAiRequest["source"]) {
  if (!editor.isEditable) {
    return null;
  }
  const snapshot = createTableTargetSnapshot(editor, source);
  if (!snapshot) {
    return null;
  }
  editor.view.dispatch(
    editor.state.tr
      .setMeta(markweaveAskAiPluginKey, {
        type: "start",
        selection: snapshot.selection,
        target: snapshot.target,
        originalContent: null,
        originalCells: snapshot.originalCells,
      } satisfies AskAiPluginMeta)
      .setMeta("addToHistory", false),
  );
  return snapshot.selection;
}

export function restoreMarkweaveAskAiTargetSelection(editor: Editor) {
  const state = markweaveAskAiPluginKey.getState(editor.state);
  if (!state) {
    return false;
  }
  if (state.target.kind === "table" && state.target.cellPositions.length > 0) {
    const positions = state.target.cellPositions;
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, positions[0], positions[positions.length - 1])));
    editor.view.focus();
    return true;
  }
  editor.commands.setTextSelection({ from: state.from, to: state.to });
  editor.commands.focus();
  return true;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getMarkweaveAskAiSurfaceRect(element: HTMLElement): MarkweaveAskAiRect {
  const rect = element.getBoundingClientRect();
  const styles = element.ownerDocument.defaultView?.getComputedStyle(element);
  const paddingLeft = Number.parseFloat(styles?.paddingLeft ?? "") || 0;
  const paddingRight = Number.parseFloat(styles?.paddingRight ?? "") || 0;
  const paddingTop = Number.parseFloat(styles?.paddingTop ?? "") || 0;
  const paddingBottom = Number.parseFloat(styles?.paddingBottom ?? "") || 0;
  return {
    left: rect.left + paddingLeft,
    top: rect.top + paddingTop,
    width: Math.max(0, rect.width - paddingLeft - paddingRight),
    height: Math.max(0, rect.height - paddingTop - paddingBottom),
  };
}

export function calculateMarkweaveAskAiPanelPosition(
  input: MarkweaveAskAiPanelPositionInput,
): MarkweaveAskAiPanelPosition {
  const gap = input.gap ?? 10;
  const boundaryPadding = input.boundaryPadding ?? 8;
  const viewportLeft = boundaryPadding;
  const viewportTop = boundaryPadding;
  const viewportRight = Math.max(viewportLeft, input.viewport.width - boundaryPadding);
  const viewportBottom = Math.max(viewportTop, input.viewport.height - boundaryPadding);
  const frameHorizontalPadding = input.surfaceRect ? 0 : boundaryPadding;
  const boundaryLeft = input.frameRect ? Math.max(viewportLeft, input.frameRect.left + frameHorizontalPadding) : viewportLeft;
  const boundaryTop = input.frameRect ? Math.max(viewportTop, input.frameRect.top + boundaryPadding) : viewportTop;
  const boundaryRight = input.frameRect
    ? Math.min(viewportRight, input.frameRect.left + input.frameRect.width - frameHorizontalPadding)
    : viewportRight;
  const boundaryBottom = input.frameRect
    ? Math.min(viewportBottom, input.frameRect.top + input.frameRect.height - boundaryPadding)
    : viewportBottom;
  const maxWidth = Math.max(0, Math.floor(boundaryRight - boundaryLeft));
  let panelWidth = Math.min(input.panelSize.width, maxWidth);
  const panelHeight = input.panelSize.height;
  const selectionBottom = input.selectionRect.top + input.selectionRect.height;
  const availableTop = Math.max(0, Math.floor(input.selectionRect.top - gap - boundaryTop));
  const availableBottom = Math.max(0, Math.floor(boundaryBottom - selectionBottom - gap));
  const topFits = panelHeight <= availableTop;
  const bottomFits = panelHeight <= availableBottom;
  const placement = bottomFits || (!topFits && availableBottom >= availableTop) ? "bottom" : "top";
  let viewportLeftPosition = clamp(input.selectionRect.left, boundaryLeft, Math.max(boundaryLeft, boundaryRight - panelWidth));
  if (input.surfaceRect && input.surfaceRect.width > 0) {
    const surfaceLeft = Math.max(boundaryLeft, input.surfaceRect.left);
    const surfaceRight = Math.min(boundaryRight, input.surfaceRect.left + input.surfaceRect.width);
    const surfaceWidth = Math.max(0, Math.floor(surfaceRight - surfaceLeft));
    if (surfaceWidth > 0) {
      panelWidth = surfaceWidth;
      viewportLeftPosition = surfaceLeft;
    }
  }
  const viewportTopPosition = placement === "bottom"
    ? selectionBottom + gap
    : input.selectionRect.top - gap - panelHeight;

  return {
    left: Math.round(viewportLeftPosition - input.anchorRect.left),
    top: Math.round(clamp(viewportTopPosition, boundaryTop, Math.max(boundaryTop, boundaryBottom - panelHeight)) - input.anchorRect.top),
    placement,
    width: panelWidth,
    maxWidth,
    maxHeight: placement === "bottom" ? availableBottom : availableTop,
  };
}

function combineMarkweaveAskAiRects(rects: readonly MarkweaveAskAiRect[]) {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  return { left, top, width: right - left, height: bottom - top };
}

export function getMarkweaveAskAiTargetRect(editor: Editor): MarkweaveAskAiRect | null {
  if (editor.isDestroyed) {
    return null;
  }
  const target = getMarkweaveAskAiTarget(editor);
  if (!target || target.from >= target.to || typeof document === "undefined") {
    return null;
  }

  const proposalRects = Array.from(
    editor.view.dom.querySelectorAll<HTMLElement>("[data-markweave-ask-ai-proposal]"),
  ).flatMap((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0
      ? [{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }]
      : [];
  });
  if (proposalRects.length > 0) {
    return combineMarkweaveAskAiRects(proposalRects);
  }

  if (target.target.kind === "table") {
    const rects = target.target.cellPositions.flatMap((position) => {
      const node = editor.view.nodeDOM(position);
      if (!(node instanceof HTMLElement)) {
        return [];
      }
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0
        ? [{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }]
        : [];
    });
    return rects.length > 0 ? combineMarkweaveAskAiRects(rects) : null;
  }

  try {
    const start = editor.view.domAtPos(target.from);
    const end = editor.view.domAtPos(target.to);
    const range = editor.view.dom.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const rects = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }));
    if (rects.length > 0) {
      return combineMarkweaveAskAiRects(rects);
    }
  } catch {
    // Fall back to ProseMirror coordinates when a native range cannot be formed.
  }

  try {
    const start = editor.view.coordsAtPos(target.from);
    const end = editor.view.coordsAtPos(target.to, -1);
    const left = Math.min(start.left, end.left);
    const top = Math.min(start.top, end.top);
    const right = Math.max(start.right, end.right);
    const bottom = Math.max(start.bottom, end.bottom);
    return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
  } catch {
    return null;
  }
}

export function createMarkweaveAskAiRequest(
  selection: MarkweaveAskAiSelection,
  prompt: string,
  lang: MarkweaveLang,
  signal: AbortSignal,
  id: string = globalThis.crypto?.randomUUID?.() ?? `markweave-ask-ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  target?: MarkweaveAskAiTarget,
): MarkweaveAskAiRequest {
  return { id, prompt, lang, selection, target, outputFormat: "markdown", signal };
}

function isAsyncIterable(value: MarkweaveAskAiOutput): value is AsyncIterable<string> {
  return typeof value !== "string" && typeof value?.[Symbol.asyncIterator] === "function";
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new DOMException("The Ask AI request was aborted.", "AbortError");
  }
}

export async function runMarkweaveAskAiHandler(
  handler: MarkweaveAskAiHandler,
  request: MarkweaveAskAiRequest,
  onDelta?: (markdown: string) => void,
) {
  throwIfAborted(request.signal);
  const output = await handler(request);
  throwIfAborted(request.signal);

  if (typeof output === "string") {
    if (!output.trim()) {
      throw new MarkweaveAskAiError("empty-result", "The Ask AI handler returned an empty result.");
    }
    onDelta?.(output);
    return output;
  }

  if (!isAsyncIterable(output)) {
    throw new MarkweaveAskAiError("invalid-output", "The Ask AI handler must return Markdown or an AsyncIterable of Markdown chunks.");
  }

  let markdown = "";
  for await (const chunk of output) {
    throwIfAborted(request.signal);
    if (typeof chunk !== "string") {
      throw new MarkweaveAskAiError("invalid-output", "Each Ask AI stream chunk must be a string.");
    }
    markdown += chunk;
    onDelta?.(markdown);
  }
  throwIfAborted(request.signal);
  if (!markdown.trim()) {
    throw new MarkweaveAskAiError("empty-result", "The Ask AI handler returned an empty result.");
  }
  return markdown;
}

export function parseMarkweaveAskAiMarkdown(editor: Editor, markdown: string): JSONContent {
  if (!markdown.trim()) {
    throw new Error("Ask AI Markdown cannot be empty.");
  }
  if (!editor.markdown) {
    throw new Error("The Markdown extension is unavailable.");
  }
  const parsed = editor.markdown.parse(markdown);
  const documentNode = editor.schema.nodeFromJSON(parsed);
  if (!documentNode.content.size) {
    throw new Error("Ask AI Markdown did not produce compatible editor content.");
  }
  return parsed;
}

export function serializeMarkweaveAskAiPreview(editor: Editor, markdown: string) {
  if (typeof document === "undefined") {
    return "";
  }
  const target = markweaveAskAiPluginKey.getState(editor.state)?.target;
  const parsed = target?.kind === "table" && target.resultShape === "table"
    ? parseMarkweaveAskAiTableMarkdown(editor, markdown, target)
    : parseMarkweaveAskAiMarkdown(editor, markdown);
  const documentNode = editor.schema.nodeFromJSON(parsed);
  const container = document.createElement("div");
  container.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(documentNode.content));
  enhanceMarkweaveAskAiPreview(container);
  return container.innerHTML;
}

function enhanceMarkweaveAskAiPreview(container: HTMLElement) {
  container.querySelectorAll("table").forEach((table) => {
    (table as HTMLElement).dataset.markweaveAskAiPreviewTable = "true";
  });
  container.querySelectorAll("pre.markweave-code-block").forEach((codeBlock) => {
    (codeBlock as HTMLElement).dataset.markweaveAskAiPreviewCode = "true";
  });
  container.querySelectorAll<HTMLElement>('[data-type="inline-math"], [data-type="block-math"]').forEach((mathElement) => {
    const latex = mathElement.dataset.latex ?? "";
    const isBlock = mathElement.dataset.type === "block-math";
    const renderTarget = isBlock ? document.createElement("div") : mathElement;
    mathElement.classList.add("tiptap-mathematics-render");
    if (isBlock) {
      renderTarget.className = "block-math-inner";
      mathElement.replaceChildren(renderTarget);
    }
    try {
      katex.render(latex, renderTarget, {
        displayMode: isBlock,
        throwOnError: false,
        trust: false,
      });
      mathElement.classList.remove(isBlock ? "block-math-error" : "inline-math-error");
    } catch {
      renderTarget.textContent = latex;
      mathElement.classList.add(isBlock ? "block-math-error" : "inline-math-error");
    }
  });
}

function getParsedTableNode(editor: Editor, markdown: string) {
  const parsed = parseMarkweaveAskAiMarkdown(editor, markdown);
  const documentNode = editor.schema.nodeFromJSON(parsed);
  return documentNode.childCount === 1 && documentNode.firstChild?.type.name === "table"
    ? { parsed, table: documentNode.firstChild }
    : null;
}

function parseMarkweaveAskAiTableMarkdown(editor: Editor, markdown: string, target: MarkweaveAskAiTableTarget) {
  const parsedTable = getParsedTableNode(editor, markdown);
  if (!parsedTable || parsedTable.table.childCount !== target.rows) {
    throw new MarkweaveAskAiError("invalid-output", "Ask AI table output has an incompatible row count.");
  }
  const rows: ProseMirrorNode[] = [];
  parsedTable.table.forEach((row) => rows.push(row));
  if (rows.some((row) => row.type.name !== "tableRow" || row.childCount !== target.columns)) {
    throw new MarkweaveAskAiError("invalid-output", "Ask AI table output has an incompatible column count.");
  }
  return parsedTable.parsed;
}

function getTableResultCellContents(editor: Editor, markdown: string, target: MarkweaveAskAiTableTarget) {
  const parsed = parseMarkweaveAskAiTableMarkdown(editor, markdown, target);
  const table = editor.schema.nodeFromJSON(parsed).firstChild!;
  const contents: Fragment[] = [];
  table.forEach((row) => row.forEach((cell) => contents.push(cell.content)));
  return contents;
}

export function setMarkweaveAskAiPreview(editor: Editor, markdown: string) {
  const state = markweaveAskAiPluginKey.getState(editor.state);
  if (!state || state.status !== "target") {
    return false;
  }

  let preview: AskAiPreviewState;
  try {
    if (state.target.kind === "table") {
      const cellContents = state.target.resultShape === "table"
        ? getTableResultCellContents(editor, markdown, state.target)
        : [editor.schema.nodeFromJSON(parseMarkweaveAskAiMarkdown(editor, markdown)).content];
      if (cellContents.length !== state.target.cells.length) {
        return false;
      }
      const compatible = state.target.cells.every((cell, index) => {
        const cellNode = editor.state.doc.nodeAt(cell.position);
        const content = cellContents[index];
        return Boolean(cellNode && content && cellNode.type.validContent(content));
      });
      if (!compatible) {
        return false;
      }
      preview = { markdown, content: null, cellContents };
    } else {
      const parsed = parseMarkweaveAskAiMarkdown(editor, markdown);
      preview = {
        markdown,
        content: editor.schema.nodeFromJSON(parsed).content,
        cellContents: null,
      };
    }
  } catch {
    return false;
  }

  editor.view.dispatch(
    editor.state.tr
      .setMeta(markweaveAskAiPluginKey, { type: "preview", preview } satisfies AskAiPluginMeta)
      .setMeta("addToHistory", false),
  );
  return true;
}

export function clearMarkweaveAskAiPreview(editor: Editor) {
  const state = markweaveAskAiPluginKey.getState(editor.state);
  if (!state?.preview) {
    return false;
  }
  editor.view.dispatch(
    editor.state.tr
      .setMeta(markweaveAskAiPluginKey, { type: "preview", preview: null } satisfies AskAiPluginMeta)
      .setMeta("addToHistory", false),
  );
  return true;
}

export function acceptMarkweaveAskAiResult(editor: Editor, markdown: string) {
  const target = markweaveAskAiPluginKey.getState(editor.state);
  if (!target || target.status !== "target") {
    return false;
  }

  let parsed: JSONContent;
  try {
    parsed = target.target.kind === "table" && target.target.resultShape === "table"
      ? parseMarkweaveAskAiTableMarkdown(editor, markdown, target.target)
      : parseMarkweaveAskAiMarkdown(editor, markdown);
  } catch {
    return false;
  }

  if (target.target.kind === "table") {
    const tableTarget = target.target;
    const contents = tableTarget.resultShape === "table"
      ? getTableResultCellContents(editor, markdown, tableTarget)
      : [editor.schema.nodeFromJSON(parsed).content];
    if (contents.length !== tableTarget.cells.length) {
      return false;
    }
    const replacements = tableTarget.cells
      .map((cell, index) => ({ cell, content: contents[index] }))
      .sort((left, right) => right.cell.position - left.cell.position);
    const transaction = editor.state.tr;
    try {
      replacements.forEach(({ cell, content }) => {
        const cellNode = transaction.doc.nodeAt(cell.position);
        if (!cellNode || !cellNode.type.validContent(content)) {
          throw new Error("Ask AI table output is incompatible with the target cell schema.");
        }
        transaction.replace(cell.position + 1, cell.position + cellNode.nodeSize - 1, new Slice(content, 0, 0));
      });
    } catch {
      return false;
    }
    const mappedTarget = mapTableTarget(tableTarget, transaction);
    const mappedSelection = mapAskAiSelection(target.selection, transaction);
    transaction
      .setMeta(markweaveAskAiPluginKey, {
        type: "applied",
        selection: mappedSelection,
        target: mappedTarget,
      } satisfies AskAiPluginMeta)
      .scrollIntoView();
    editor.view.dispatch(transaction);
    return true;
  }

  const parsedDoc = editor.schema.nodeFromJSON(parsed);
  const transaction = editor.state.tr.replaceRange(target.from, target.to, new Slice(parsedDoc.content, 0, 0));
  const mappedSelection = {
    ...target.selection,
    from: transaction.mapping.map(target.from, -1),
    to: transaction.mapping.map(target.to, 1),
  };
  transaction
    .setMeta(markweaveAskAiPluginKey, {
      type: "applied",
      selection: { ...mappedSelection, to: Math.max(mappedSelection.from, mappedSelection.to) },
      target: target.target,
    } satisfies AskAiPluginMeta)
    .scrollIntoView();
  editor.view.dispatch(transaction);
  return true;
}
