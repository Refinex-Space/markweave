import { Extension, type Editor } from "@tiptap/core";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export type MarkweaveTocHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type MarkweaveInnerTocPlacement = "container" | "viewport";

export interface MarkweaveTocItem {
  readonly id: string;
  readonly level: MarkweaveTocHeadingLevel;
  readonly text: string;
  readonly pos: number;
  readonly index: number;
  readonly active: boolean;
}

export interface MarkweaveTocState {
  readonly items: readonly MarkweaveTocItem[];
  readonly activeId: string | null;
}

export const emptyMarkweaveTocState: MarkweaveTocState = {
  items: [],
  activeId: null,
};

export const markweaveTocProjectionPluginKey = new PluginKey<
  readonly MarkweaveTocItem[]
>("markweaveTocProjection");

export function normalizeMarkweaveInnerTocPlacement(value: unknown): MarkweaveInnerTocPlacement {
  return value === "viewport" ? "viewport" : "container";
}

export function observeMarkweaveInnerTocContainerPosition(tocElement: HTMLElement) {
  const frameElement = tocElement.closest(".markweave-editor-frame");
  if (!frameElement || typeof window === "undefined") {
    return () => undefined;
  }

  const syncPosition = () => {
    const frameBounds = frameElement.getBoundingClientRect();
    const rightOffset = Math.max(28, window.innerWidth - frameBounds.right + 28);
    tocElement.style.setProperty("--markweave-inner-toc-right", `${rightOffset}px`);
  };

  syncPosition();
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncPosition);
  resizeObserver?.observe(frameElement);
  window.addEventListener("resize", syncPosition);

  return () => {
    resizeObserver?.disconnect();
    window.removeEventListener("resize", syncPosition);
  };
}

const headingSelector = "h1,h2,h3,h4,h5,h6";
const activeHeadingOffset = 96;

function normalizeHeadingLevel(level: unknown): MarkweaveTocHeadingLevel {
  return level === 1 || level === 2 || level === 3 || level === 4 || level === 5 || level === 6 ? level : 1;
}

function shouldIncludeHeadingLevel(level: MarkweaveTocHeadingLevel) {
  return level > 1;
}

function normalizeHeadingText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function getMarkweaveTocItems(doc: ProseMirrorNode, activeId: string | null = null): readonly MarkweaveTocItem[] {
  const items: MarkweaveTocItem[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") {
      return true;
    }

    const level = normalizeHeadingLevel(node.attrs.level);
    const text = normalizeHeadingText(node.textContent);
    if (!shouldIncludeHeadingLevel(level) || !text) {
      return false;
    }

    const index = items.length;
    const id = `markweave-toc-${index}-${pos}`;
    items.push({
      id,
      level,
      text,
      pos,
      index,
      active: id === activeId,
    });

    return false;
  });

  return items;
}

export function getMarkweaveTocItemsFromState(
  state: EditorState,
): readonly MarkweaveTocItem[] {
  return (
    markweaveTocProjectionPluginKey.getState(state) ??
    getMarkweaveTocItems(state.doc)
  );
}

export const MarkweaveTocProjection = Extension.create({
  name: "markweaveTocProjection",

  addProseMirrorPlugins() {
    return [
      new Plugin<readonly MarkweaveTocItem[]>({
        key: markweaveTocProjectionPluginKey,
        state: {
          init: (_, state) => getMarkweaveTocItems(state.doc),
          apply: (transaction, items) =>
            updateMarkweaveTocItems(transaction, items),
        },
      }),
    ];
  },
});

function updateMarkweaveTocItems(
  transaction: Transaction,
  previousItems: readonly MarkweaveTocItem[],
) {
  if (!transaction.docChanged) {
    return previousItems;
  }

  const changedRanges = getChangedTopLevelRanges(transaction);
  if (
    changedRanges.length === 0 ||
    changedRanges.length > 32 ||
    changedRanges.reduce((total, range) => total + range.to - range.from, 0) >
      transaction.doc.content.size / 4
  ) {
    return getMarkweaveTocItems(transaction.doc);
  }

  const mappedItems = previousItems.flatMap((item) => {
    const mapped = transaction.mapping.mapResult(item.pos, 1);
    if (mapped.deleted) {
      return [];
    }
    if (changedRanges.some((range) => mapped.pos >= range.from && mapped.pos < range.to)) {
      return [];
    }
    return [{ ...item, pos: mapped.pos }];
  });
  const rescannedItems = changedRanges.flatMap((range) =>
    scanMarkweaveTocRange(transaction.doc, range.from, range.to),
  );

  return normalizeProjectedTocItems([...mappedItems, ...rescannedItems]);
}

interface TocChangedRange {
  readonly from: number;
  readonly to: number;
}

function getChangedTopLevelRanges(transaction: Transaction) {
  const ranges: TocChangedRange[] = [];
  transaction.mapping.maps.forEach((stepMap, index) => {
    stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const remainingMapping = transaction.mapping.slice(index + 1);
      const mappedStart = remainingMapping.map(newStart, -1);
      const mappedEnd = remainingMapping.map(newEnd, 1);
      ranges.push(
        expandToTopLevelRange(transaction.doc, mappedStart, mappedEnd),
      );
    });
  });

  return mergeTocChangedRanges(ranges);
}

function expandToTopLevelRange(
  doc: ProseMirrorNode,
  rawFrom: number,
  rawTo: number,
): TocChangedRange {
  const from = Math.max(0, Math.min(rawFrom, doc.content.size));
  const to = Math.max(from, Math.min(rawTo, doc.content.size));
  const start = topLevelBoundaryAt(doc, from, "start");
  const end = topLevelBoundaryAt(doc, to, "end");

  return {
    from: Math.max(0, Math.min(start, doc.content.size)),
    to: Math.max(start + 1, Math.min(end, doc.content.size)),
  };
}

function topLevelBoundaryAt(
  doc: ProseMirrorNode,
  pos: number,
  side: "start" | "end",
) {
  const resolved = doc.resolve(pos);
  if (resolved.depth > 0) {
    return side === "start" ? resolved.before(1) : resolved.after(1);
  }

  const adjacent = side === "start" ? doc.childAfter(pos) : doc.childBefore(pos);
  if (adjacent.node) {
    return side === "start"
      ? adjacent.offset
      : adjacent.offset + adjacent.node.nodeSize;
  }

  return side === "start" ? Math.max(0, pos - 1) : Math.min(doc.content.size, pos + 1);
}

function mergeTocChangedRanges(ranges: readonly TocChangedRange[]) {
  const sorted = [...ranges].sort((left, right) => left.from - right.from);
  const merged: TocChangedRange[] = [];

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

function scanMarkweaveTocRange(
  doc: ProseMirrorNode,
  from: number,
  to: number,
) {
  const items: MarkweaveTocItem[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "heading") {
      return true;
    }
    const level = normalizeHeadingLevel(node.attrs.level);
    const text = normalizeHeadingText(node.textContent);
    if (shouldIncludeHeadingLevel(level) && text) {
      items.push({
        active: false,
        id: "",
        index: 0,
        level,
        pos,
        text,
      });
    }
    return false;
  });
  return items;
}

function normalizeProjectedTocItems(items: readonly MarkweaveTocItem[]) {
  return [...items]
    .sort((left, right) => left.pos - right.pos)
    .filter((item, index, sorted) => index === 0 || item.pos !== sorted[index - 1]?.pos)
    .map((item, index) => ({
      ...item,
      active: false,
      id: `markweave-toc-${index}-${item.pos}`,
      index,
    }));
}

export function getValidMarkweaveTocActiveId(items: readonly MarkweaveTocItem[], activeId: string | null) {
  if (!items.length) {
    return null;
  }

  return items.some((item) => item.id === activeId) ? activeId : items[0]?.id ?? null;
}

export function createMarkweaveTocState(items: readonly MarkweaveTocItem[], activeId: string | null): MarkweaveTocState {
  const normalizedActiveId = getValidMarkweaveTocActiveId(items, activeId);

  return {
    activeId: normalizedActiveId,
    items: items.map((item) => ({
      ...item,
      active: item.id === normalizedActiveId,
    })),
  };
}

function getElementFromNode(node: Node | null): Element | null {
  if (node instanceof Element) {
    return node;
  }

  return node?.parentElement ?? null;
}

export function getMarkweaveTocItemElement(editor: Editor, item: MarkweaveTocItem): HTMLElement | null {
  const nodeDom = editor.view.nodeDOM(item.pos);
  const nodeElement = getElementFromNode(nodeDom);
  const headingElement = nodeElement?.matches(headingSelector) ? nodeElement : nodeElement?.closest(headingSelector);

  if (headingElement instanceof HTMLElement) {
    return headingElement;
  }

  const innerPos = Math.min(item.pos + 1, editor.state.doc.content.size);
  const { node } = editor.view.domAtPos(innerPos);
  const innerElement = getElementFromNode(node);
  const closestHeading = innerElement?.matches(headingSelector) ? innerElement : innerElement?.closest(headingSelector);

  return closestHeading instanceof HTMLElement ? closestHeading : null;
}

export function getActiveMarkweaveTocId(editor: Editor, items: readonly MarkweaveTocItem[], offset = activeHeadingOffset) {
  if (!items.length) {
    return null;
  }

  let low = 0;
  let high = items.length - 1;
  let activeIndex = -1;
  let firstMeasuredIndex = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const item = items[middle];
    const element = item ? getMarkweaveTocItemElement(editor, item) : null;

    if (!item || !element) {
      high = middle - 1;
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (rect.top === 0 && rect.bottom === 0 && rect.height === 0) {
      high = middle - 1;
      continue;
    }

    firstMeasuredIndex = firstMeasuredIndex === -1
      ? middle
      : Math.min(firstMeasuredIndex, middle);

    if (rect.top <= offset) {
      activeIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return items[activeIndex >= 0 ? activeIndex : firstMeasuredIndex]?.id
    ?? items[0]?.id
    ?? null;
}

export function scrollToMarkweaveTocItem(
  editor: Editor,
  item: MarkweaveTocItem,
  options: { readonly focus?: boolean; readonly behavior?: ScrollBehavior } = {},
) {
  const element = getMarkweaveTocItemElement(editor, item);
  if (!element) {
    return false;
  }

  if (typeof element.scrollIntoView === "function") {
    element.scrollIntoView({
      behavior: options.behavior ?? "smooth",
      block: "start",
    });
  }

  if (options.focus) {
    const position = Math.min(item.pos + 1, editor.state.doc.content.size);
    try {
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, position)));
      editor.view.focus();
    } catch {
      // Best-effort focus sync: scrolling the heading is the primary TOC action.
    }
  }

  return true;
}
