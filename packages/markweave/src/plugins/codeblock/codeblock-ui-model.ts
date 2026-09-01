import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import {
  codeBlockCollapsePluginKey,
  getCodeBlockCollapseKey,
  normalizeCodeBlockLanguage,
  markweaveCodeBlockLanguages,
  type MarkweaveCodeBlockLanguage,
} from "./codeblock-behavior";
import { formatCodeBlockLanguageLabel } from "./codeblock-language-catalog";
import {
  getEffectiveMermaidPreviewMode,
  getMermaidCodeBlockPositions,
} from "../mermaid/mermaid-inline-preview";
import { normalizeMermaidPreviewMode, type MermaidPreviewMode } from "../mermaid/mermaid-renderer";

export interface CodeBlockOverlayPosition {
  readonly pos: number;
  readonly top: number;
  readonly left: number;
  readonly right: number;
}

export interface CodeBlockMenuPosition {
  readonly top: number;
  readonly left: number;
}

export interface MermaidTabPosition {
  readonly pos: number;
  readonly top: number;
  readonly left: number;
}

export interface CodeBlockTargetState {
  readonly active: true;
  readonly language: MarkweaveCodeBlockLanguage;
  readonly mermaidPreviewMode: MermaidPreviewMode;
  readonly pos: number;
  readonly text: string;
}

export interface MermaidFullscreenViewerState {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
}

export interface MermaidFullscreenDragState {
  readonly active: boolean;
  readonly lastX: number;
  readonly lastY: number;
}

export type MermaidFullscreenTooltip = "zoom-out" | "zoom-in" | "reset";

export const codeBlockCopyFeedbackTimeoutMs = 1800;
export const codeBlockLanguageMenuWidth = 228;
export const codeBlockLanguageMenuMaxHeight = 268;
export const mermaidFullscreenMinScale = 0.25;
export const mermaidFullscreenMaxScale = 4;
export const mermaidFullscreenZoomStep = 0.25;
const codeBlockElementSelector = "pre.markweave-code-block, pre";
let codeBlockLanguageMenuDomId = 0;

export type CodeBlockClipboardLike = {
  readonly writeText: (text: string) => Promise<void>;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export { formatCodeBlockLanguageLabel } from "./codeblock-language-catalog";

export function getCodeBlockLanguageItems(query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  return [...markweaveCodeBlockLanguages]
    .map((language) => ({
      language,
      label: formatCodeBlockLanguageLabel(language),
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
    .filter((item) => !normalizedQuery || item.language.includes(normalizedQuery) || item.label.toLowerCase().includes(normalizedQuery));
}

export function getInitialCodeBlockLanguageItemIndex(
  items: readonly { readonly language: MarkweaveCodeBlockLanguage }[],
  currentLanguage: MarkweaveCodeBlockLanguage | null,
) {
  if (items.length === 0) {
    return -1;
  }

  const currentIndex = currentLanguage === null ? -1 : items.findIndex((item) => item.language === currentLanguage);
  return currentIndex >= 0 ? currentIndex : 0;
}

export function moveCodeBlockLanguageItemIndex(currentIndex: number, itemCount: number, direction: "previous" | "next") {
  if (itemCount <= 0) {
    return -1;
  }

  if (currentIndex < 0) {
    return direction === "previous" ? itemCount - 1 : 0;
  }

  return clamp(currentIndex + (direction === "previous" ? -1 : 1), 0, itemCount - 1);
}

export interface CodeBlockLanguageListScrollMetrics {
  readonly itemBottom: number;
  readonly itemTop: number;
  readonly listBottom: number;
  readonly listTop: number;
  readonly scrollTop: number;
}

export function calculateCodeBlockLanguageListScrollTop(metrics: CodeBlockLanguageListScrollMetrics) {
  if (metrics.itemTop < metrics.listTop) {
    return Math.max(0, metrics.scrollTop - (metrics.listTop - metrics.itemTop));
  }

  if (metrics.itemBottom > metrics.listBottom) {
    return Math.max(0, metrics.scrollTop + (metrics.itemBottom - metrics.listBottom));
  }

  return Math.max(0, metrics.scrollTop);
}

export function scrollCodeBlockLanguageItemIntoView(listElement: HTMLElement, itemElement: HTMLElement) {
  const listRect = listElement.getBoundingClientRect();
  const itemRect = itemElement.getBoundingClientRect();
  const nextScrollTop = calculateCodeBlockLanguageListScrollTop({
    itemBottom: itemRect.bottom,
    itemTop: itemRect.top,
    listBottom: listRect.bottom,
    listTop: listRect.top,
    scrollTop: listElement.scrollTop,
  });

  if (nextScrollTop !== listElement.scrollTop) {
    listElement.scrollTop = nextScrollTop;
  }
}

export function createCodeBlockLanguageMenuDomId() {
  codeBlockLanguageMenuDomId += 1;
  return `markweave-codeblock-language-list-${codeBlockLanguageMenuDomId}`;
}

export function getCodeBlockLanguageOptionDomId(menuDomId: string, language: MarkweaveCodeBlockLanguage) {
  return `${menuDomId}-${language}`;
}

export function getCodeBlockElementByDocumentOrder(editor: Editor, codeBlockPos: number) {
  const codeBlockPositions: number[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") {
      codeBlockPositions.push(pos);
      return false;
    }

    return true;
  });

  const codeBlockIndex = codeBlockPositions.indexOf(codeBlockPos);

  if (codeBlockIndex < 0) {
    return null;
  }

  return editor.view.dom.querySelectorAll<HTMLElement>(codeBlockElementSelector)[codeBlockIndex] ?? null;
}

function getElementFromNode(node: Node | null) {
  return node instanceof HTMLElement ? node : node?.parentElement ?? null;
}

function getCodeBlockElementAtPosition(editor: Editor, codeBlockPos: number) {
  const node = editor.view.nodeDOM(codeBlockPos);
  const element = getElementFromNode(node);

  if (element?.matches(codeBlockElementSelector)) {
    return element;
  }

  const closestCodeBlock = element?.closest<HTMLElement>(codeBlockElementSelector);
  return closestCodeBlock && editor.view.dom.contains(closestCodeBlock) ? closestCodeBlock : null;
}

export function getActiveCodeBlockElement(editor: Editor, codeBlockPos: number | null, mermaidMode: MermaidPreviewMode) {
  if (codeBlockPos === null) {
    return null;
  }

  const directCodeBlock = getCodeBlockElementAtPosition(editor, codeBlockPos);

  if (mermaidMode === "preview") {
    const directPreview = directCodeBlock?.nextElementSibling;
    if (directPreview instanceof HTMLElement && directPreview.matches('[data-testid="markweave-mermaid-inline-preview"]')) {
      return directPreview;
    }

    const preview = editor.view.dom.querySelector<HTMLElement>(
      `[data-testid="markweave-mermaid-inline-preview"][data-code-block-pos="${codeBlockPos}"]`,
    );

    if (preview) {
      return preview;
    }
  }

  if (directCodeBlock) {
    return directCodeBlock;
  }

  return getCodeBlockElementByDocumentOrder(editor, codeBlockPos);
}

export function isCodeBlockNodeAtPosition(editor: Editor, pos: number) {
  return editor.state.doc.nodeAt(pos)?.type.name === "codeBlock";
}

export function getCodeBlockStateAtPosition(editor: Editor, pos: number | null): CodeBlockTargetState | null {
  if (pos === null) {
    return null;
  }

  const node = editor.state.doc.nodeAt(pos);

  if (node?.type.name !== "codeBlock") {
    return null;
  }

  const language = normalizeCodeBlockLanguage(node.attrs.language);

  return {
    active: true,
    language,
    mermaidPreviewMode:
      language === "mermaid" ? getEffectiveMermaidPreviewMode(editor.state, node, pos) : normalizeMermaidPreviewMode(node.attrs.mermaidPreviewMode),
    pos,
    text: node.textContent,
  };
}

export function getMermaidCodeBlockTargets(editor: Editor) {
  const targets: CodeBlockTargetState[] = [];

  getMermaidCodeBlockPositions(editor.state).forEach((pos) => {
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== "codeBlock") {
      return;
    }
    const language = normalizeCodeBlockLanguage(node.attrs.language);

    if (language === "mermaid") {
      const target = {
        active: true as const,
        language,
        mermaidPreviewMode: getEffectiveMermaidPreviewMode(editor.state, node, pos),
        pos,
        text: node.textContent,
      };

      if (!isCodeBlockTargetCollapsed(editor, target)) {
        targets.push(target);
      }
    }

  });

  return targets;
}

function getCodeBlockPositionAtDocumentPosition(editor: Editor, documentPos: number) {
  const normalizedPos = Math.max(0, Math.min(documentPos, editor.state.doc.content.size));
  const directNode = editor.state.doc.nodeAt(normalizedPos);

  if (directNode?.type.name === "codeBlock") {
    return normalizedPos;
  }

  const $position = editor.state.doc.resolve(normalizedPos);
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    if ($position.node(depth).type.name === "codeBlock") {
      return $position.before(depth);
    }
  }

  if ($position.nodeBefore?.type.name === "codeBlock") {
    return normalizedPos - $position.nodeBefore.nodeSize;
  }
  if ($position.nodeAfter?.type.name === "codeBlock") {
    return normalizedPos;
  }
  return null;
}

export function getCodeBlockPositionForElement(editor: Editor, codeBlockElement: HTMLElement) {
  try {
    const documentPos = editor.view.posAtDOM(codeBlockElement, 0);
    const codeBlockPos = getCodeBlockPositionAtDocumentPosition(editor, documentPos);

    if (codeBlockPos !== null && getCodeBlockElementAtPosition(editor, codeBlockPos) === codeBlockElement) {
      return codeBlockPos;
    }
  } catch {
    // Detached and foreign DOM nodes are not editor positions.
  }

  let codeBlockPos: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "codeBlock") {
      return true;
    }

    if (editor.view.nodeDOM(pos) === codeBlockElement) {
      codeBlockPos = pos;
      return false;
    }

    return true;
  });

  return codeBlockPos;
}

export function getCodeBlockPositionFromEventTarget(editor: Editor, target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  const mermaidPreview = target.closest<HTMLElement>('[data-testid="markweave-mermaid-inline-preview"]');
  if (mermaidPreview && editor.view.dom.contains(mermaidPreview)) {
    try {
      const previewDocumentPos = editor.view.posAtDOM(mermaidPreview, 0);
      const $preview = editor.state.doc.resolve(
        Math.max(0, Math.min(previewDocumentPos, editor.state.doc.content.size)),
      );
      if ($preview.nodeBefore?.type.name === "codeBlock") {
        return previewDocumentPos - $preview.nodeBefore.nodeSize;
      }
      const codeBlockPos = getCodeBlockPositionAtDocumentPosition(editor, previewDocumentPos);
      if (codeBlockPos !== null) {
        return codeBlockPos;
      }
    } catch {
      // The position data below remains a compatibility fallback.
    }
  }

  const previewPos = mermaidPreview ? Number.parseInt(mermaidPreview.dataset.codeBlockPos ?? "", 10) : Number.NaN;

  if (Number.isInteger(previewPos) && isCodeBlockNodeAtPosition(editor, previewPos)) {
    return previewPos;
  }

  const codeBlockElement = target.closest<HTMLElement>(codeBlockElementSelector);

  if (!codeBlockElement || !editor.view.dom.contains(codeBlockElement)) {
    return null;
  }

  return getCodeBlockPositionForElement(editor, codeBlockElement);
}

export function isCodeBlockTargetCollapsed(editor: Editor, codeBlock: CodeBlockTargetState | null) {
  if (!codeBlock) {
    return false;
  }

  const node = editor.state.doc.nodeAt(codeBlock.pos);

  if (node?.type.name !== "codeBlock") {
    return false;
  }

  const collapsedCodeBlocks = codeBlockCollapsePluginKey.getState(editor.state) ?? new Set();
  return collapsedCodeBlocks.has(getCodeBlockCollapseKey(codeBlock.pos, node));
}

export function focusCodeBlockTarget(editor: Editor, codeBlock: CodeBlockTargetState | null) {
  if (!codeBlock) {
    return false;
  }

  const node = editor.state.doc.nodeAt(codeBlock.pos);

  if (node?.type.name !== "codeBlock") {
    return false;
  }

  const selectionPosition = Math.min(codeBlock.pos + node.nodeSize - 1, codeBlock.pos + 1);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, selectionPosition)));
  editor.view.focus();
  return true;
}

export async function copyCodeBlockText(text: string, clipboard: CodeBlockClipboardLike | undefined = globalThis.navigator?.clipboard) {
  if (!clipboard) {
    return false;
  }

  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function getFrameElement(controlsElement: HTMLElement) {
  return controlsElement.closest<HTMLElement>(".markweave-editor-frame");
}

export function getAnchoredRect(element: HTMLElement | null, overlayRect: DOMRect) {
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  if (rect.right < overlayRect.left || rect.left > overlayRect.right || rect.bottom < overlayRect.top || rect.top > overlayRect.bottom) {
    return null;
  }

  return rect;
}

export function createCodeBlockOverlayPosition(codeBlockPos: number, targetRect: DOMRect, overlayRect: DOMRect): CodeBlockOverlayPosition {
  return {
    pos: codeBlockPos,
    top: Math.round(targetRect.top - overlayRect.top + 10),
    left: Math.round(targetRect.left - overlayRect.left + 10),
    right: Math.max(10, Math.round(overlayRect.right - targetRect.right + 10)),
  };
}

export function createMermaidTabPosition(target: CodeBlockTargetState, targetRect: DOMRect, overlayRect: DOMRect): MermaidTabPosition {
  return {
    pos: target.pos,
    top: Math.round(targetRect.top - overlayRect.top + 10),
    left: Math.round(targetRect.left - overlayRect.left + 10),
  };
}

export function calculateCodeBlockLanguageMenuPosition(input: {
  readonly overlayRect: DOMRect;
  readonly buttonRect: DOMRect;
  readonly menuHeight?: number;
  readonly windowWidth: number;
  readonly windowHeight: number;
}) {
  const visibleLeft = Math.max(input.overlayRect.left, 8) - input.overlayRect.left;
  const visibleRight = Math.min(input.overlayRect.right, input.windowWidth - 8) - input.overlayRect.left;
  const visibleTop = Math.max(input.overlayRect.top, 8) - input.overlayRect.top;
  const visibleBottom = Math.min(input.overlayRect.bottom, input.windowHeight - 8) - input.overlayRect.top;
  const visibleHeight = Math.max(120, visibleBottom - visibleTop);
  const maximumMenuHeight = Math.min(codeBlockLanguageMenuMaxHeight, visibleHeight - 16, input.overlayRect.height - 16);
  const measuredMenuHeight = input.menuHeight && input.menuHeight > 0 ? input.menuHeight : maximumMenuHeight;
  const menuHeight = Math.min(measuredMenuHeight, maximumMenuHeight);
  const rawLeft = input.buttonRect.right - input.overlayRect.left - codeBlockLanguageMenuWidth;
  const rawTop = input.buttonRect.bottom - input.overlayRect.top + 6;
  const flippedTop = input.buttonRect.top - input.overlayRect.top - menuHeight - 6;
  const top = rawTop + maximumMenuHeight > visibleBottom - 8 ? flippedTop : rawTop;

  return {
    left: Math.round(clamp(rawLeft, visibleLeft + 8, Math.max(visibleLeft + 8, visibleRight - codeBlockLanguageMenuWidth - 8))),
    top: Math.round(top),
  };
}

export function mergeStableMermaidTabPositions(
  previousPositions: readonly MermaidTabPosition[],
  measuredPositions: readonly MermaidTabPosition[],
  targetPositions: readonly number[],
): readonly MermaidTabPosition[] {
  const measuredByPos = new Map(measuredPositions.map((position) => [position.pos, position]));
  const previousByPos = new Map(previousPositions.map((position) => [position.pos, position]));

  return targetPositions.flatMap((pos) => {
    const measured = measuredByPos.get(pos);

    if (measured) {
      return [measured];
    }

    const previous = previousByPos.get(pos);
    return previous ? [previous] : [];
  });
}

export function getMermaidPreviewElement(editor: Editor, codeBlockPos: number | null) {
  if (codeBlockPos === null) {
    return null;
  }

  const codeBlockElement = getCodeBlockElementAtPosition(editor, codeBlockPos);
  const directPreview = codeBlockElement?.nextElementSibling;
  if (directPreview instanceof HTMLElement && directPreview.matches('[data-testid="markweave-mermaid-inline-preview"]')) {
    return directPreview;
  }

  return editor.view.dom.querySelector<HTMLElement>(
    `[data-testid="markweave-mermaid-inline-preview"][data-code-block-pos="${codeBlockPos}"]`,
  );
}

export function getMermaidSvgMarkup(editor: Editor, codeBlockPos: number | null) {
  const previewElement = getMermaidPreviewElement(editor, codeBlockPos);
  const svgElement = previewElement?.querySelector("svg");

  return svgElement?.outerHTML ?? "";
}

function parseSvgDimension(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getSvgIntrinsicSize(svg: string) {
  const viewBoxMatch = svg.match(/\bviewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)\s*["']/i);

  if (viewBoxMatch) {
    const width = parseSvgDimension(viewBoxMatch[1]);
    const height = parseSvgDimension(viewBoxMatch[2]);

    if (width && height) {
      return { width, height };
    }
  }

  const width = parseSvgDimension(svg.match(/\bwidth=["']([^"']+)["']/i)?.[1]);
  const height = parseSvgDimension(svg.match(/\bheight=["']([^"']+)["']/i)?.[1]);

  return width && height ? { width, height } : null;
}

function roundScale(scale: number) {
  return Math.round(scale * 100) / 100;
}

export function clampFullscreenScale(scale: number) {
  return roundScale(clamp(scale, mermaidFullscreenMinScale, mermaidFullscreenMaxScale));
}

export function createMermaidFullscreenViewerState(svg: string, viewport?: { readonly width: number; readonly height: number }): MermaidFullscreenViewerState {
  const size = getSvgIntrinsicSize(svg) ?? { width: 800, height: 450 };

  if (typeof window === "undefined" && !viewport) {
    return {
      svg,
      width: size.width,
      height: size.height,
      scale: 1,
      translateX: 0,
      translateY: 0,
    };
  }

  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const availableWidth = Math.max(320, viewportWidth - 220);
  const availableHeight = Math.max(240, viewportHeight - 180);
  const fitScale = Math.min(1, availableWidth / size.width, availableHeight / size.height);

  return {
    svg,
    width: size.width,
    height: size.height,
    scale: clampFullscreenScale(fitScale),
    translateX: 0,
    translateY: 0,
  };
}

export function formatFullscreenZoom(scale: number) {
  return `${Math.round(scale * 100)}%`;
}

export function zoomMermaidFullscreenViewer(current: MermaidFullscreenViewerState | null, delta: number) {
  return current
    ? {
        ...current,
        scale: clampFullscreenScale(current.scale + delta),
      }
    : current;
}

export function moveMermaidFullscreenViewer(current: MermaidFullscreenViewerState | null, deltaX: number, deltaY: number) {
  return current
    ? {
        ...current,
        translateX: current.translateX + deltaX,
        translateY: current.translateY + deltaY,
      }
    : current;
}
