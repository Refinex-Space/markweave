import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { getMarkweaveDocumentLoadMeta } from "../../editor-core/document-load";

interface LowlightSyntaxNode {
  readonly children?: readonly LowlightSyntaxNode[];
  readonly properties?: {
    readonly className?: unknown;
  };
  readonly value?: string;
}

export interface MarkweaveLowlightLike {
  readonly highlight: (language: string, value: string) => unknown;
  readonly highlightAuto: (value: string) => unknown;
  readonly listLanguages: () => string[];
  readonly registered?: (aliasOrLanguage: string) => boolean;
}

interface CodeBlockSnapshot {
  readonly id: number;
  readonly node: ProseMirrorNode;
}

export interface MarkweaveIncrementalLowlightPluginState {
  readonly blocksByPos: ReadonlyMap<number, CodeBlockSnapshot>;
  readonly decorations: DecorationSet;
  /** Positions highlighted by the most recent transaction; useful for diagnostics and regression tests. */
  readonly lastHighlightedPositions: readonly number[];
  readonly nextBlockId: number;
  readonly pendingDocumentLoad: boolean;
}

interface ChangedRange {
  readonly from: number;
  readonly to: number;
}

interface HighlightToken {
  readonly classes: readonly string[];
  readonly text: string;
}

const lowlightBlockIdSpec = "markweaveLowlightBlockId";

export const markweaveIncrementalLowlightPluginKey =
  new PluginKey<MarkweaveIncrementalLowlightPluginState>("markweaveIncrementalLowlight");

function isFunction(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === "function";
}

function assertLowlight(lowlight: MarkweaveLowlightLike) {
  if (![lowlight.highlight, lowlight.highlightAuto, lowlight.listLanguages].every(isFunction)) {
    throw new Error("You should provide an instance of lowlight to use Markweave code-block highlighting");
  }
}

function isCodeBlockNode(node: ProseMirrorNode | null | undefined, name: string): node is ProseMirrorNode {
  return node?.type.name === name;
}

function normalizeClassNames(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
}

function flattenSyntaxNodes(nodes: readonly LowlightSyntaxNode[], inheritedClasses: readonly string[] = []): HighlightToken[] {
  const tokens: HighlightToken[] = [];

  for (const node of nodes) {
    const classes = [...inheritedClasses, ...normalizeClassNames(node.properties?.className)];

    if (node.children) {
      tokens.push(...flattenSyntaxNodes(node.children, classes));
      continue;
    }

    if (typeof node.value === "string") {
      tokens.push({ classes, text: node.value });
    }
  }

  return tokens;
}

function getHighlightNodes(result: unknown): readonly LowlightSyntaxNode[] {
  if (!result || typeof result !== "object") {
    return [];
  }

  const value = result as {
    readonly children?: readonly LowlightSyntaxNode[];
    readonly value?: readonly LowlightSyntaxNode[];
  };

  return value.value ?? value.children ?? [];
}

function createCodeBlockDecorations(
  node: ProseMirrorNode,
  pos: number,
  blockId: number,
  lowlight: MarkweaveLowlightLike,
  defaultLanguage: string | null | undefined,
) {
  const language = typeof node.attrs.language === "string" && node.attrs.language
    ? node.attrs.language
    : defaultLanguage;
  const registeredLanguages = lowlight.listLanguages();
  const canHighlightLanguage = Boolean(
    language && (registeredLanguages.includes(language) || lowlight.registered?.(language)),
  );
  const result = canHighlightLanguage && language
    ? lowlight.highlight(language, node.textContent)
    : lowlight.highlightAuto(node.textContent);
  const decorations: Decoration[] = [];
  let from = pos + 1;

  for (const token of flattenSyntaxNodes(getHighlightNodes(result))) {
    const to = from + token.text.length;

    if (token.classes.length > 0 && to > from) {
      decorations.push(
        Decoration.inline(
          from,
          to,
          { class: token.classes.join(" ") },
          { [lowlightBlockIdSpec]: blockId },
        ),
      );
    }

    from = to;
  }

  return decorations;
}

function scanCodeBlocks(doc: ProseMirrorNode, name: string) {
  const blocks = new Map<number, ProseMirrorNode>();

  doc.descendants((node, pos) => {
    if (!isCodeBlockNode(node, name)) {
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

      ranges.push({
        from,
        to: Math.max(from, to),
      });
    });
  });

  return mergeChangedRanges(ranges);
}

function scanCodeBlocksInRanges(
  doc: ProseMirrorNode,
  name: string,
  ranges: readonly ChangedRange[],
) {
  const blocks = new Map<number, ProseMirrorNode>();

  for (const range of ranges) {
    if (doc.content.size === 0) {
      continue;
    }

    const from = clampDocumentPosition(doc, range.from);
    const to = clampDocumentPosition(doc, Math.max(range.to, from + 1));

    doc.nodesBetween(from, to, (node, pos) => {
      if (!isCodeBlockNode(node, name)) {
        return true;
      }

      blocks.set(pos, node);
      return false;
    });
  }

  return blocks;
}

function removeBlockDecorations(decorations: DecorationSet, blockIds: ReadonlySet<number>) {
  if (blockIds.size === 0 || decorations === DecorationSet.empty) {
    return decorations;
  }

  const staleDecorations = decorations.find(
    undefined,
    undefined,
    (spec) => blockIds.has(Number(spec[lowlightBlockIdSpec])),
  );

  return staleDecorations.length > 0 ? decorations.remove(staleDecorations) : decorations;
}

function createInitialState(
  doc: ProseMirrorNode,
  name: string,
  lowlight: MarkweaveLowlightLike,
  defaultLanguage: string | null | undefined,
): MarkweaveIncrementalLowlightPluginState {
  const scannedBlocks = scanCodeBlocks(doc, name);
  const blocksByPos = new Map<number, CodeBlockSnapshot>();
  const decorations: Decoration[] = [];
  const highlightedPositions: number[] = [];
  let nextBlockId = 1;

  scannedBlocks.forEach((node, pos) => {
    const id = nextBlockId;
    nextBlockId += 1;
    blocksByPos.set(pos, { id, node });
    decorations.push(...createCodeBlockDecorations(node, pos, id, lowlight, defaultLanguage));
    highlightedPositions.push(pos);
  });

  return {
    blocksByPos,
    decorations: DecorationSet.create(doc, decorations),
    lastHighlightedPositions: highlightedPositions,
    nextBlockId,
    pendingDocumentLoad: false,
  };
}

function updateIncrementalState(
  transaction: Transaction,
  previous: MarkweaveIncrementalLowlightPluginState,
  name: string,
  lowlight: MarkweaveLowlightLike,
  defaultLanguage: string | null | undefined,
): MarkweaveIncrementalLowlightPluginState {
  const documentLoadMeta = getMarkweaveDocumentLoadMeta(transaction);

  if (!transaction.docChanged && documentLoadMeta?.phase !== "complete") {
    return previous;
  }

  const blocksByPos = new Map<number, CodeBlockSnapshot>();
  const dirtyBlockIds = new Set<number>();
  const highlightedPositions: number[] = [];
  let nextBlockId = previous.nextBlockId;

  previous.blocksByPos.forEach((snapshot, oldPos) => {
    const mappedPos = transaction.mapping.map(oldPos, 1);
    const node = transaction.doc.nodeAt(mappedPos);

    if (!isCodeBlockNode(node, name)) {
      dirtyBlockIds.add(snapshot.id);
      return;
    }

    blocksByPos.set(mappedPos, { id: snapshot.id, node });

    if (node !== snapshot.node) {
      dirtyBlockIds.add(snapshot.id);
    }
  });

  const changedBlocks = scanCodeBlocksInRanges(transaction.doc, name, getChangedRanges(transaction));

  changedBlocks.forEach((node, pos) => {
    const existing = blocksByPos.get(pos);

    if (existing) {
      if (existing.node !== node) {
        blocksByPos.set(pos, { ...existing, node });
        dirtyBlockIds.add(existing.id);
      }
      return;
    }

    const id = nextBlockId;
    nextBlockId += 1;
    blocksByPos.set(pos, { id, node });
    dirtyBlockIds.add(id);
  });

  let decorations = previous.decorations.map(transaction.mapping, transaction.doc);

  if (documentLoadMeta?.phase === "mounting" || (previous.pendingDocumentLoad && documentLoadMeta?.phase !== "complete")) {
    return {
      blocksByPos,
      decorations,
      lastHighlightedPositions: [],
      nextBlockId,
      pendingDocumentLoad: true,
    };
  }

  if (documentLoadMeta?.phase === "complete" && (previous.pendingDocumentLoad || transaction.docChanged)) {
    dirtyBlockIds.clear();
    blocksByPos.forEach((snapshot) => dirtyBlockIds.add(snapshot.id));
    decorations = DecorationSet.empty;
  }

  decorations = removeBlockDecorations(decorations, dirtyBlockIds);

  const additions: Decoration[] = [];

  blocksByPos.forEach((snapshot, pos) => {
    if (!dirtyBlockIds.has(snapshot.id)) {
      return;
    }

    additions.push(...createCodeBlockDecorations(snapshot.node, pos, snapshot.id, lowlight, defaultLanguage));
    highlightedPositions.push(pos);
  });

  if (additions.length > 0) {
    decorations = decorations.add(transaction.doc, additions);
  }

  return {
    blocksByPos,
    decorations,
    lastHighlightedPositions: highlightedPositions,
    nextBlockId,
    pendingDocumentLoad: false,
  };
}

export function createMarkweaveIncrementalLowlightPlugin({
  name,
  lowlight,
  defaultLanguage,
}: {
  readonly name: string;
  readonly lowlight: MarkweaveLowlightLike;
  readonly defaultLanguage: string | null | undefined;
}) {
  assertLowlight(lowlight);

  return new Plugin<MarkweaveIncrementalLowlightPluginState>({
    key: markweaveIncrementalLowlightPluginKey,
    state: {
      init: (_, state) => createInitialState(state.doc, name, lowlight, defaultLanguage),
      apply: (transaction, previous) => updateIncrementalState(transaction, previous, name, lowlight, defaultLanguage),
    },
    props: {
      decorations(state) {
        return markweaveIncrementalLowlightPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}
