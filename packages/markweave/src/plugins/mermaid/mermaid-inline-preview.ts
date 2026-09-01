import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { normalizeMarkweaveTheme, type MarkweaveTheme } from "../../core/theme";
import { getMarkweaveDocumentViewportCoordinatorForElement } from "../../core/document-viewport";
import { markweaveResolveVisualResourceEvent } from "../../editor-core/document-output";
import { getMarkweaveDocumentLoadMeta } from "../../editor-core/document-load";
import {
  getMermaidPreviewPresentation,
  markweaveMermaidBehavior,
  normalizeMermaidPreviewMode,
  renderMermaidDiagram,
  type MermaidPreviewMode,
  type MermaidRenderResult,
} from "./mermaid-renderer";

type MermaidInlinePreviewEditorMode = "live" | "view";

interface MermaidBlockSnapshot {
  readonly id: number;
  readonly node: ProseMirrorNode;
}

export interface MermaidInlinePreviewPluginState {
  readonly blocksByPos: ReadonlyMap<number, MermaidBlockSnapshot>;
  readonly decorations: DecorationSet;
  readonly editorMode: MermaidInlinePreviewEditorMode;
  /** Positions whose Mermaid decorations were rebuilt by the latest transaction. */
  readonly lastDecoratedPositions: readonly number[];
  readonly nextBlockId: number;
  readonly pendingDocumentLoad: boolean;
  readonly theme: MarkweaveTheme;
  readonly readonlyModesByPos: ReadonlyMap<number, MermaidPreviewMode>;
}

type MermaidInlinePreviewPluginMeta =
  | {
      readonly type: "set-editor-mode";
      readonly mode: MermaidInlinePreviewEditorMode;
    }
  | {
      readonly type: "set-theme";
      readonly theme: MarkweaveTheme;
    }
  | {
      readonly type: "set-readonly-mode";
      readonly mode: MermaidPreviewMode;
      readonly pos: number;
    };

const initialMermaidInlinePreviewPluginState: MermaidInlinePreviewPluginState = {
  blocksByPos: new Map(),
  decorations: DecorationSet.empty,
  editorMode: "live",
  lastDecoratedPositions: [],
  nextBlockId: 1,
  pendingDocumentLoad: false,
  theme: "light",
  readonlyModesByPos: new Map(),
};

export const mermaidInlinePreviewPluginKey = new PluginKey<MermaidInlinePreviewPluginState>("markweaveMermaidInlinePreview");
export const mermaidPreviewModeAttribute = "mermaidPreviewMode";

function isMermaidCodeBlock(node: ProseMirrorNode | null | undefined): node is ProseMirrorNode {
  return node?.type.name === "codeBlock" && node.attrs.language === "mermaid";
}

function getNodePreviewMode(node: ProseMirrorNode): MermaidPreviewMode {
  return normalizeMermaidPreviewMode(node.attrs[mermaidPreviewModeAttribute]);
}

function parseMermaidPreviewMode(element: HTMLElement) {
  const mode =
    element.getAttribute("data-mermaid-preview-mode") ??
    element.querySelector<HTMLElement>("[data-mermaid-preview-mode]")?.getAttribute("data-mermaid-preview-mode");
  return normalizeMermaidPreviewMode(mode);
}

function getMermaidInlinePreviewPluginState(state: EditorState) {
  return mermaidInlinePreviewPluginKey.getState(state) ?? initialMermaidInlinePreviewPluginState;
}

function getEffectiveNodePreviewModeFromPluginState(
  pluginState: MermaidInlinePreviewPluginState,
  node: ProseMirrorNode,
  pos: number,
): MermaidPreviewMode {
  if (pluginState.editorMode === "view") {
    return pluginState.readonlyModesByPos.get(pos) ?? "preview";
  }

  return getNodePreviewMode(node);
}

export function getEffectiveMermaidPreviewMode(state: EditorState, node: ProseMirrorNode, pos: number): MermaidPreviewMode {
  return isMermaidCodeBlock(node)
    ? getEffectiveNodePreviewModeFromPluginState(getMermaidInlinePreviewPluginState(state), node, pos)
    : getNodePreviewMode(node);
}

export function getMermaidCodeBlockPositions(state: EditorState) {
  const pluginState = mermaidInlinePreviewPluginKey.getState(state);

  if (pluginState) {
    return [...pluginState.blocksByPos.keys()].sort((left, right) => left - right);
  }

  const positions: number[] = [];
  state.doc.descendants((node, pos) => {
    if (isMermaidCodeBlock(node)) {
      positions.push(pos);
      return false;
    }
    return true;
  });
  return positions;
}

function mapReadonlyMermaidModes(transaction: Transaction, readonlyModesByPos: ReadonlyMap<number, MermaidPreviewMode>) {
  if (!transaction.docChanged || readonlyModesByPos.size === 0) {
    return readonlyModesByPos;
  }

  const nextModesByPos = new Map<number, MermaidPreviewMode>();

  readonlyModesByPos.forEach((mode, pos) => {
    const mappedPos = transaction.mapping.mapResult(pos, 1);

    if (mappedPos.deleted) {
      return;
    }

    const node = transaction.doc.nodeAt(mappedPos.pos);

    if (node && isMermaidCodeBlock(node)) {
      nextModesByPos.set(mappedPos.pos, mode);
    }
  });

  return nextModesByPos;
}

export function isMermaidInlinePreviewTransaction(transaction: Transaction) {
  return Boolean(transaction.getMeta(mermaidInlinePreviewPluginKey));
}

export function setMermaidInlinePreviewEditorMode(editor: Editor, mode: MermaidInlinePreviewEditorMode) {
  const normalizedMode: MermaidInlinePreviewEditorMode = mode === "view" ? "view" : "live";
  const pluginState = getMermaidInlinePreviewPluginState(editor.state);

  if (pluginState.editorMode === normalizedMode) {
    return false;
  }

  editor.view.dispatch(
    editor.state.tr.setMeta(mermaidInlinePreviewPluginKey, {
      type: "set-editor-mode",
      mode: normalizedMode,
    } satisfies MermaidInlinePreviewPluginMeta),
  );
  return true;
}

export function setMarkweaveMermaidTheme(editor: Editor, theme: unknown) {
  const nextTheme = normalizeMarkweaveTheme(theme);
  const pluginState = getMermaidInlinePreviewPluginState(editor.state);

  if (pluginState.theme === nextTheme) {
    return false;
  }

  editor.view.dispatch(
    editor.state.tr.setMeta(mermaidInlinePreviewPluginKey, {
      type: "set-theme",
      theme: nextTheme,
    } satisfies MermaidInlinePreviewPluginMeta),
  );
  return true;
}

export function setReadonlyMermaidPreviewMode(editor: Editor, pos: number, mode: MermaidPreviewMode) {
  const node = editor.state.doc.nodeAt(pos);
  const pluginState = getMermaidInlinePreviewPluginState(editor.state);

  if (!node || !isMermaidCodeBlock(node) || pluginState.editorMode !== "view") {
    return false;
  }

  const normalizedMode = normalizeMermaidPreviewMode(mode);

  if (getEffectiveNodePreviewModeFromPluginState(pluginState, node, pos) === normalizedMode) {
    return false;
  }

  editor.view.dispatch(
    editor.state.tr.setMeta(mermaidInlinePreviewPluginKey, {
      type: "set-readonly-mode",
      mode: normalizedMode,
      pos,
    } satisfies MermaidInlinePreviewPluginMeta),
  );
  return true;
}

const mermaidBlockIdSpec = "markweaveMermaidBlockId";
const mermaidPreviewCacheLimit = 128;
const mermaidPreviewRendererVersion = "v1";
let mermaidPreviewPluginInstance = 0;

interface CachedMermaidPreview {
  readonly promise: Promise<MermaidRenderResult>;
  readonly source: string;
}

interface ChangedRange {
  readonly from: number;
  readonly to: number;
}

const mermaidPreviewRenderCache = new Map<string, CachedMermaidPreview>();
const mermaidPreviewCleanupByElement = new WeakMap<HTMLElement, () => void>();

function hashPreviewKey(source: string) {
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function getCachedMermaidPreview(
  source: string,
  theme: MarkweaveTheme,
  cacheNamespace: number,
  blockId: number,
) {
  // Mermaid SVGs contain id references, so the block namespace stays in the
  // cache key even though source/theme/version are the semantic inputs.
  const sourceHash = hashPreviewKey(source);
  const cacheKey = [
    mermaidPreviewRendererVersion,
    cacheNamespace,
    blockId,
    theme,
    source.length,
    sourceHash,
  ].join(":");
  const cached = mermaidPreviewRenderCache.get(cacheKey);

  if (cached?.source === source) {
    mermaidPreviewRenderCache.delete(cacheKey);
    mermaidPreviewRenderCache.set(cacheKey, cached);
    return cached.promise;
  }

  const promise = renderMermaidDiagram(source, {
    id: `markweave-mermaid-inline-${cacheNamespace}-${blockId}-${sourceHash}-${theme}`,
    theme,
  });
  mermaidPreviewRenderCache.set(cacheKey, { promise, source });

  while (mermaidPreviewRenderCache.size > mermaidPreviewCacheLimit) {
    const oldestKey = mermaidPreviewRenderCache.keys().next().value;
    if (typeof oldestKey !== "string") {
      break;
    }
    mermaidPreviewRenderCache.delete(oldestKey);
  }

  return promise;
}

function applyPreviewResult(element: HTMLElement, source: string, result: MermaidRenderResult) {
  const presentation = getMermaidPreviewPresentation({
    active: true,
    mode: "preview",
    result,
  });

  element.className = "markweave-mermaid-preview markweave-mermaid-preview--inline";
  element.dataset.testid = "markweave-mermaid-inline-preview";
  element.dataset.sourceLength = String(source.length);

  if (presentation.visibility === "rendered") {
    element.dataset.state = "rendered";
    element.innerHTML = presentation.svg;
    return;
  }

  if (presentation.visibility === "error") {
    element.dataset.state = "error";
    element.classList.add("markweave-mermaid-preview--error");
    element.textContent = presentation.message;
    return;
  }

  element.dataset.state = "empty";
  element.classList.add("markweave-mermaid-preview--empty");
  element.textContent = presentation.visibility === "empty" ? presentation.label : "Mermaid preview";
}

function applyPendingPreviewState(element: HTMLElement, source: string) {
  element.className = "markweave-mermaid-preview markweave-mermaid-preview--inline markweave-mermaid-preview--pending";
  element.dataset.testid = "markweave-mermaid-inline-preview";
  element.dataset.sourceLength = String(source.length);
  element.dataset.state = "pending";
  element.textContent = "Mermaid preview";
}

function destroyInlinePreviewElement(node: Node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }
  mermaidPreviewCleanupByElement.get(node)?.();
  mermaidPreviewCleanupByElement.delete(node);
}

function createInlinePreviewElement(
  source: string,
  pos: number,
  theme: MarkweaveTheme,
  blockId: number,
  cacheNamespace: number,
) {
  const element = document.createElement("div");
  const previewToken = `${cacheNamespace}-${blockId}-${theme}-${source.length}-${hashPreviewKey(source)}`;
  const lifecycleController = new AbortController();

  element.setAttribute("aria-label", "Mermaid preview");
  applyPendingPreviewState(element, source);
  element.dataset.mermaidBlockId = String(blockId);
  element.dataset.codeBlockPos = String(pos);
  element.dataset.previewToken = previewToken;
  element.dataset.theme = theme;
  element.dataset.markweaveVisualPending = "true";

  let started = false;
  let destroyed = false;
  let activePromise: Promise<void> | null = null;
  let taskHandle: { cancel: () => void } | null = null;
  let observer: IntersectionObserver | null = null;

  const stopScheduling = () => {
    observer?.disconnect();
    observer = null;
    element.removeEventListener(markweaveResolveVisualResourceEvent, forceRender);
  };
  const run = (signal: AbortSignal) => {
    if (destroyed || signal.aborted || lifecycleController.signal.aborted || !element.isConnected) {
      return Promise.resolve();
    }
    if (activePromise) {
      return activePromise;
    }
    if (started) {
      return Promise.resolve();
    }
    started = true;
    stopScheduling();
    delete element.dataset.markweaveVisualPending;
    const promise = getCachedMermaidPreview(source, theme, cacheNamespace, blockId)
      .then((result) => {
        if (
          !destroyed &&
          !signal.aborted &&
          !lifecycleController.signal.aborted &&
          element.isConnected &&
          element.dataset.previewToken === previewToken
        ) {
          applyPreviewResult(element, source, result);
        }
      })
      .finally(() => {
        if (activePromise === promise) {
          activePromise = null;
        }
      });
    activePromise = promise;
    return promise;
  };
  const schedule = (lane: "critical" | "nearby" | "idle") => {
    if (destroyed || started) {
      return;
    }
    const coordinator = getMarkweaveDocumentViewportCoordinatorForElement(element);
    if (!coordinator) {
      void run(lifecycleController.signal);
      return;
    }
    taskHandle?.cancel();
    taskHandle = coordinator.visualWork.schedule({
      key: `mermaid:${cacheNamespace}:${blockId}`,
      lane,
      pos,
      revision: cacheNamespace,
      sourceHash: hashPreviewKey(source),
      run,
    });
  };
  function forceRender() {
    delete element.dataset.markweaveVisualPending;
    schedule("critical");
  }
  element.addEventListener(markweaveResolveVisualResourceEvent, forceRender);
  queueMicrotask(() => {
    if (!element.isConnected || started) return;
    const ownerWindow = element.ownerDocument.defaultView;
    const IntersectionObserverCtor = (ownerWindow as (Window & {
      readonly IntersectionObserver?: typeof IntersectionObserver;
    }) | null)?.IntersectionObserver ?? globalThis.IntersectionObserver;
    if (IntersectionObserverCtor) {
      observer = new IntersectionObserverCtor((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) schedule("nearby");
      }, { rootMargin: "200% 0px" });
      observer.observe(element);
    }
    schedule("idle");
  });

  mermaidPreviewCleanupByElement.set(element, () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    lifecycleController.abort();
    stopScheduling();
    taskHandle?.cancel();
    taskHandle = null;
    delete element.dataset.markweaveVisualPending;
  });

  return element;
}

function createMermaidBlockDecorations(
  node: ProseMirrorNode,
  pos: number,
  snapshot: MermaidBlockSnapshot,
  pluginState: MermaidInlinePreviewPluginState,
  cacheNamespace: number,
) {
  const decorations: Decoration[] = [];
  const previewMode = getEffectiveNodePreviewModeFromPluginState(pluginState, node, pos);

  decorations.push(
    Decoration.node(
      pos,
      pos + node.nodeSize,
      {
        "data-markweave-mermaid-block": "true",
        ...(previewMode === "preview" ? { "data-mermaid-preview-mode": "preview" } : {}),
      },
      { [mermaidBlockIdSpec]: snapshot.id },
    ),
  );

  if (previewMode === "preview") {
    const source = node.textContent;
    const previewPos = pos + node.nodeSize;

    decorations.push(
      Decoration.widget(
        previewPos,
        () => createInlinePreviewElement(source, pos, pluginState.theme, snapshot.id, cacheNamespace),
        {
          key: `markweave-mermaid-preview-${snapshot.id}-${hashPreviewKey(source)}-${pluginState.theme}`,
          [mermaidBlockIdSpec]: snapshot.id,
          destroy: destroyInlinePreviewElement,
          side: 1,
        },
      ),
    );
  }

  return decorations;
}

function scanMermaidBlocks(doc: ProseMirrorNode) {
  const blocks = new Map<number, ProseMirrorNode>();

  doc.descendants((node, pos) => {
    if (!isMermaidCodeBlock(node)) {
      return true;
    }
    blocks.set(pos, node);
    return false;
  });

  return blocks;
}

function clampDocumentPosition(doc: ProseMirrorNode, pos: number) {
  return Math.max(0, Math.min(pos, doc.content.size));
}

function mergeChangedRanges(ranges: readonly ChangedRange[]) {
  const sorted = [...ranges].sort((left, right) => left.from - right.from);
  const merged: ChangedRange[] = [];

  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.from <= previous.to) {
      merged[merged.length - 1] = {
        from: previous.from,
        to: Math.max(previous.to, range.to),
      };
    } else {
      merged.push(range);
    }
  }

  return merged;
}

function getChangedRanges(transaction: Transaction) {
  const ranges: ChangedRange[] = [];

  transaction.mapping.maps.forEach((stepMap, index) => {
    stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const remainingMapping = transaction.mapping.slice(index + 1);
      const mappedStart = remainingMapping.map(newStart, -1);
      const mappedEnd = remainingMapping.map(newEnd, 1);
      const from = clampDocumentPosition(transaction.doc, Math.min(mappedStart, mappedEnd) - 1);
      const to = clampDocumentPosition(transaction.doc, Math.max(mappedStart, mappedEnd) + 1);
      ranges.push({ from, to: Math.max(from, to) });
    });
  });

  return mergeChangedRanges(ranges);
}

function scanMermaidBlocksInRanges(doc: ProseMirrorNode, ranges: readonly ChangedRange[]) {
  const blocks = new Map<number, ProseMirrorNode>();

  for (const range of ranges) {
    if (doc.content.size === 0) {
      continue;
    }

    const from = clampDocumentPosition(doc, range.from);
    const to = clampDocumentPosition(doc, Math.max(range.to, from + 1));
    doc.nodesBetween(from, to, (node, pos) => {
      if (!isMermaidCodeBlock(node)) {
        return true;
      }
      blocks.set(pos, node);
      return false;
    });
  }

  return blocks;
}

function removeMermaidBlockDecorations(decorations: DecorationSet, blockIds: ReadonlySet<number>) {
  if (blockIds.size === 0 || decorations === DecorationSet.empty) {
    return decorations;
  }

  const staleDecorations = decorations.find(
    undefined,
    undefined,
    (spec) => blockIds.has(Number(spec[mermaidBlockIdSpec])),
  );
  return staleDecorations.length > 0 ? decorations.remove(staleDecorations) : decorations;
}

function createInitialPluginState(
  doc: ProseMirrorNode,
  cacheNamespace: number,
): MermaidInlinePreviewPluginState {
  const scannedBlocks = scanMermaidBlocks(doc);
  const blocksByPos = new Map<number, MermaidBlockSnapshot>();
  const decorations: Decoration[] = [];
  const decoratedPositions: number[] = [];
  let nextBlockId = 1;

  scannedBlocks.forEach((node, pos) => {
    const snapshot = { id: nextBlockId, node };
    nextBlockId += 1;
    blocksByPos.set(pos, snapshot);
    decoratedPositions.push(pos);
  });

  const pluginState: MermaidInlinePreviewPluginState = {
    blocksByPos,
    decorations: DecorationSet.empty,
    editorMode: "live",
    lastDecoratedPositions: decoratedPositions,
    nextBlockId,
    pendingDocumentLoad: false,
    readonlyModesByPos: new Map(),
    theme: "light",
  };

  blocksByPos.forEach((snapshot, pos) => {
    decorations.push(...createMermaidBlockDecorations(snapshot.node, pos, snapshot, pluginState, cacheNamespace));
  });

  return {
    ...pluginState,
    decorations: DecorationSet.create(doc, decorations),
  };
}

function updateMermaidInlinePreviewPluginState(
  previous: MermaidInlinePreviewPluginState,
  transaction: Transaction,
  cacheNamespace: number,
): MermaidInlinePreviewPluginState {
  const meta = transaction.getMeta(mermaidInlinePreviewPluginKey) as MermaidInlinePreviewPluginMeta | undefined;
  const documentLoadMeta = getMarkweaveDocumentLoadMeta(transaction);

  if (!transaction.docChanged && !meta && documentLoadMeta?.phase !== "complete") {
    return previous;
  }

  let editorMode = previous.editorMode;
  let theme = previous.theme;
  let readonlyModesByPos = new Map(mapReadonlyMermaidModes(transaction, previous.readonlyModesByPos));
  let rebuildAll = false;
  let targetedPos: number | null = null;

  if (meta?.type === "set-editor-mode") {
    editorMode = meta.mode;
    readonlyModesByPos = new Map();
    rebuildAll = true;
  } else if (meta?.type === "set-theme") {
    theme = meta.theme;
    rebuildAll = true;
  } else if (meta?.type === "set-readonly-mode") {
    readonlyModesByPos = new Map(readonlyModesByPos);
    if (meta.mode === "preview") {
      readonlyModesByPos.delete(meta.pos);
    } else {
      readonlyModesByPos.set(meta.pos, meta.mode);
    }
    targetedPos = meta.pos;
  }

  const blocksByPos = new Map<number, MermaidBlockSnapshot>();
  const dirtyBlockIds = new Set<number>();
  let nextBlockId = previous.nextBlockId;
  let decorations = transaction.docChanged
    ? previous.decorations.map(transaction.mapping, transaction.doc)
    : previous.decorations;

  previous.blocksByPos.forEach((snapshot, oldPos) => {
    const mappedPos = transaction.mapping.map(oldPos, 1);
    const node = transaction.doc.nodeAt(mappedPos);

    if (!isMermaidCodeBlock(node)) {
      dirtyBlockIds.add(snapshot.id);
      return;
    }

    blocksByPos.set(mappedPos, { id: snapshot.id, node });
    if (node !== snapshot.node) {
      dirtyBlockIds.add(snapshot.id);
    }
  });

  if (transaction.docChanged) {
    const changedRanges = getChangedRanges(transaction);
    const changedBlocks = changedRanges.length > 0
      ? scanMermaidBlocksInRanges(transaction.doc, changedRanges)
      : scanMermaidBlocks(transaction.doc);

    changedBlocks.forEach((node, pos) => {
      const existing = blocksByPos.get(pos);
      if (existing) {
        if (existing.node !== node) {
          blocksByPos.set(pos, { ...existing, node });
          dirtyBlockIds.add(existing.id);
        }
        return;
      }

      const snapshot = { id: nextBlockId, node };
      nextBlockId += 1;
      blocksByPos.set(pos, snapshot);
      dirtyBlockIds.add(snapshot.id);
    });
  }

  if (rebuildAll) {
    blocksByPos.forEach((snapshot) => dirtyBlockIds.add(snapshot.id));
  } else if (targetedPos !== null) {
    const target = blocksByPos.get(targetedPos);
    if (target) {
      dirtyBlockIds.add(target.id);
    }
  }

  if (documentLoadMeta?.phase === "mounting" || (previous.pendingDocumentLoad && documentLoadMeta?.phase !== "complete")) {
    return {
      blocksByPos,
      decorations,
      editorMode,
      lastDecoratedPositions: [],
      nextBlockId,
      pendingDocumentLoad: true,
      readonlyModesByPos,
      theme,
    };
  }

  if (documentLoadMeta?.phase === "complete" && (previous.pendingDocumentLoad || transaction.docChanged)) {
    dirtyBlockIds.clear();
    blocksByPos.forEach((snapshot) => dirtyBlockIds.add(snapshot.id));
    decorations = DecorationSet.empty;
  }

  decorations = removeMermaidBlockDecorations(decorations, dirtyBlockIds);
  const decoratedPositions: number[] = [];
  const projectionState: MermaidInlinePreviewPluginState = {
    blocksByPos,
    decorations,
    editorMode,
    lastDecoratedPositions: [],
    nextBlockId,
    pendingDocumentLoad: false,
    readonlyModesByPos,
    theme,
  };
  const additions: Decoration[] = [];

  blocksByPos.forEach((snapshot, pos) => {
    if (!dirtyBlockIds.has(snapshot.id)) {
      return;
    }
    additions.push(...createMermaidBlockDecorations(snapshot.node, pos, snapshot, projectionState, cacheNamespace));
    decoratedPositions.push(pos);
  });

  if (additions.length > 0) {
    decorations = decorations.add(transaction.doc, additions);
  }

  return {
    ...projectionState,
    decorations,
    lastDecoratedPositions: decoratedPositions.sort((left, right) => left - right),
  };
}

export function createMermaidInlinePreviewDecorations(state: Parameters<NonNullable<Plugin["props"]["decorations"]>>[0]) {
  const decorations: Decoration[] = [];
  const baseState = getMermaidInlinePreviewPluginState(state);
  let nextBlockId = 1;

  state.doc.descendants((node, pos) => {
    if (!isMermaidCodeBlock(node)) {
      return true;
    }
    const snapshot = { id: nextBlockId, node };
    nextBlockId += 1;
    decorations.push(...createMermaidBlockDecorations(node, pos, snapshot, baseState, 0));
    return false;
  });

  return DecorationSet.create(state.doc, decorations);
}

function getMermaidCodeBlockPosForPreview(view: EditorView, previewElement: HTMLElement) {
  try {
    const widgetPos = view.posAtDOM(previewElement, 0);
    const $widget = view.state.doc.resolve(Math.max(0, Math.min(widgetPos, view.state.doc.content.size)));
    const nodeBefore = $widget.nodeBefore;

    if (isMermaidCodeBlock(nodeBefore)) {
      return widgetPos - nodeBefore.nodeSize;
    }
  } catch {
    // Fall back to the diagnostic position for detached/test DOM nodes.
  }

  const fallbackPos = Number(previewElement.dataset.codeBlockPos);
  return Number.isFinite(fallbackPos) && isMermaidCodeBlock(view.state.doc.nodeAt(fallbackPos))
    ? fallbackPos
    : null;
}

export const MarkweaveMermaidInlinePreview = Extension.create({
  name: "markweaveMermaidInlinePreview",
  priority: 700,

  addGlobalAttributes() {
    return [
      {
        types: ["codeBlock"],
        attributes: {
          [mermaidPreviewModeAttribute]: {
            default: markweaveMermaidBehavior.defaultMode,
            parseHTML: parseMermaidPreviewMode,
            renderHTML: (attributes) => {
              const mode = normalizeMermaidPreviewMode(attributes[mermaidPreviewModeAttribute]);
              return mode === markweaveMermaidBehavior.defaultMode ? {} : { "data-mermaid-preview-mode": mode };
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    mermaidPreviewPluginInstance += 1;
    const cacheNamespace = mermaidPreviewPluginInstance;

    return [
      new Plugin<MermaidInlinePreviewPluginState>({
        key: mermaidInlinePreviewPluginKey,
        state: {
          init: (_, state) => createInitialPluginState(state.doc, cacheNamespace),
          apply(transaction, previousState) {
            return updateMermaidInlinePreviewPluginState(previousState, transaction, cacheNamespace);
          },
        },
        props: {
          decorations(state) {
            return mermaidInlinePreviewPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
          handleClick(view, _pos, event) {
            const target = event.target;

            if (!(target instanceof HTMLElement)) {
              return false;
            }

            const previewElement = target.closest<HTMLElement>('[data-testid="markweave-mermaid-inline-preview"]');

            if (!previewElement) {
              return false;
            }

            const codeBlockPos = getMermaidCodeBlockPosForPreview(view, previewElement);
            const codeBlock = codeBlockPos === null ? null : view.state.doc.nodeAt(codeBlockPos);

            if (codeBlockPos === null || !isMermaidCodeBlock(codeBlock)) {
              return false;
            }

            const selectionPosition = codeBlockPos + 1;
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selectionPosition)));
            const coordinator = getMarkweaveDocumentViewportCoordinatorForElement(previewElement);
            if (coordinator) {
              void coordinator.revealPosition(selectionPosition, {
                align: "nearest",
                behavior: "auto",
                focus: true,
                reason: "host",
              });
            } else {
              view.focus();
            }
            return true;
          },
        },
      }),
    ];
  },
});
