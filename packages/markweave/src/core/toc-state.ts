import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export type MarkweaveTocHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

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

  let passedAnchorId: string | null = null;
  let firstVisibleId: string | null = null;
  let measuredCount = 0;
  let zeroRectCount = 0;

  for (const item of items) {
    const element = getMarkweaveTocItemElement(editor, item);
    if (!element) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    measuredCount += 1;

    if (rect.top === 0 && rect.bottom === 0 && rect.height === 0) {
      zeroRectCount += 1;
      continue;
    }

    if (rect.top <= offset) {
      passedAnchorId = item.id;
    }

    if (!firstVisibleId && rect.bottom >= offset) {
      firstVisibleId = item.id;
    }
  }

  if (measuredCount > 0 && measuredCount === zeroRectCount) {
    return items[0]?.id ?? null;
  }

  return passedAnchorId ?? firstVisibleId ?? items[0]?.id ?? null;
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
