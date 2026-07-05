import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent } from "react";
import type { Editor } from "@tiptap/react";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import {
  copyActiveCodeBlock,
  codeBlockCollapsePluginKey,
  getActiveCodeBlockState,
  getCodeBlockCollapseKey,
  getCodeBlockCopyFeedbackSnapshot,
  normalizeCodeBlockLanguage,
  markweaveCodeBlockLanguages,
  setActiveCodeBlockLanguage,
  setCodeBlockCollapsedAtPosition,
  setActiveCodeBlockMermaidPreviewMode,
  type MarkweaveCodeBlockCopyFeedbackSnapshot,
  type MarkweaveCodeBlockLanguage,
} from "../../plugins/codeblock/codeblock-behavior";
import { normalizeMermaidPreviewMode, type MermaidPreviewMode } from "../../plugins/mermaid/mermaid-renderer";

interface CodeBlockControlsProps {
  readonly active: boolean;
  readonly editor: Editor;
  readonly mermaidMode: MermaidPreviewMode;
  readonly onMermaidModeChange: (mode: MermaidPreviewMode) => void;
}

interface OverlayPosition {
  readonly pos: number;
  readonly top: number;
  readonly left: number;
  readonly right: number;
}

interface MenuPosition {
  readonly top: number;
  readonly left: number;
}

export interface MermaidTabPosition {
  readonly pos: number;
  readonly top: number;
  readonly left: number;
}

interface CodeBlockTargetState {
  readonly active: true;
  readonly language: MarkweaveCodeBlockLanguage;
  readonly mermaidPreviewMode: MermaidPreviewMode;
  readonly pos: number;
  readonly text: string;
}

interface MermaidFullscreenViewerState {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
}

interface MermaidFullscreenDragState {
  readonly active: boolean;
  readonly lastX: number;
  readonly lastY: number;
}

type IconName = "chevron" | "clipboard" | "search" | "check" | "expand" | "download" | "close" | "zoomIn" | "zoomOut" | "reset";
type MermaidFullscreenTooltip = "zoom-out" | "zoom-in" | "reset";

const codeBlockCopyFeedbackTimeoutMs = 1800;
const codeBlockLanguageMenuWidth = 228;
const codeBlockLanguageMenuMaxHeight = 268;
const mermaidFullscreenMinScale = 0.25;
const mermaidFullscreenMaxScale = 4;
const mermaidFullscreenZoomStep = 0.25;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatCodeBlockLanguageLabel(language: MarkweaveCodeBlockLanguage) {
  const labels: Partial<Record<MarkweaveCodeBlockLanguage, string>> = {
    "angular-html": "Angular HTML",
    css: "CSS",
    fsharp: "F#",
    hjson: "Hjson",
    html: "HTML",
    "html-derivative": "HTML derivative",
    java: "Java",
    javascript: "JavaScript",
    js: "JavaScript",
    json: "JSON",
    json5: "JSON5",
    jsonc: "JSONC",
    jsonl: "JSONL",
    jsonnet: "Jsonnet",
    markdown: "Markdown",
    mermaid: "Mermaid",
    plsql: "PL/SQL",
    postcss: "PostCSS",
    powershell: "PowerShell",
    python: "Python",
    rust: "Rust",
    scss: "SCSS",
    shellscript: "Shell",
    shellsession: "Shell session",
    sql: "SQL",
    text: "Plain text",
    ts: "TypeScript",
    tsx: "TSX",
    typescript: "TypeScript",
    "vue-html": "Vue HTML",
    yaml: "YAML",
  };

  return (
    labels[language] ??
    language
      .split("-")
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(" ")
  );
}

function getCodeBlockElementByDocumentOrder(editor: Editor, codeBlockPos: number) {
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

  return editor.view.dom.querySelectorAll<HTMLElement>("pre.markweave-code-block")[codeBlockIndex] ?? null;
}

function getActiveCodeBlockElement(editor: Editor, codeBlockPos: number | null, mermaidMode: MermaidPreviewMode) {
  if (codeBlockPos === null) {
    return null;
  }

  if (mermaidMode === "preview") {
    const preview = editor.view.dom.ownerDocument.querySelector<HTMLElement>(
      `[data-testid="markweave-mermaid-inline-preview"][data-code-block-pos="${codeBlockPos}"]`,
    );

    if (preview) {
      return preview;
    }
  }

  const orderedCodeBlock = getCodeBlockElementByDocumentOrder(editor, codeBlockPos);

  if (orderedCodeBlock) {
    return orderedCodeBlock;
  }

  const node = editor.view.nodeDOM(codeBlockPos);

  if (node instanceof HTMLElement) {
    if (node.matches("pre.markweave-code-block")) {
      return node;
    }

    const closestCodeBlock = node.closest<HTMLElement>("pre.markweave-code-block");

    if (closestCodeBlock && editor.view.dom.contains(closestCodeBlock)) {
      return closestCodeBlock;
    }
  }

  return getCodeBlockElementByDocumentOrder(editor, codeBlockPos);
}

function isCodeBlockNodeAtPosition(editor: Editor, pos: number) {
  return editor.state.doc.nodeAt(pos)?.type.name === "codeBlock";
}

function getCodeBlockStateAtPosition(editor: Editor, pos: number | null): CodeBlockTargetState | null {
  if (pos === null) {
    return null;
  }

  const node = editor.state.doc.nodeAt(pos);

  if (node?.type.name !== "codeBlock") {
    return null;
  }

  return {
    active: true,
    language: normalizeCodeBlockLanguage(node.attrs.language),
    mermaidPreviewMode: normalizeMermaidPreviewMode(node.attrs.mermaidPreviewMode),
    pos,
    text: node.textContent,
  };
}

function getMermaidCodeBlockTargets(editor: Editor) {
  const targets: CodeBlockTargetState[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "codeBlock") {
      return true;
    }

    const language = normalizeCodeBlockLanguage(node.attrs.language);

    if (language === "mermaid") {
      const target = {
        active: true as const,
        language,
        mermaidPreviewMode: normalizeMermaidPreviewMode(node.attrs.mermaidPreviewMode),
        pos,
        text: node.textContent,
      };

      if (!isCodeBlockTargetCollapsed(editor, target)) {
        targets.push(target);
      }
    }

    return false;
  });

  return targets;
}

function getCodeBlockPositionForElement(editor: Editor, codeBlockElement: HTMLElement) {
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

function getCodeBlockPositionFromEventTarget(editor: Editor, target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  const mermaidPreview = target.closest<HTMLElement>('[data-testid="markweave-mermaid-inline-preview"]');
  const previewPos = mermaidPreview ? Number.parseInt(mermaidPreview.dataset.codeBlockPos ?? "", 10) : Number.NaN;

  if (Number.isInteger(previewPos) && isCodeBlockNodeAtPosition(editor, previewPos)) {
    return previewPos;
  }

  const codeBlockElement = target.closest<HTMLElement>("pre.markweave-code-block");

  if (!codeBlockElement || !editor.view.dom.contains(codeBlockElement)) {
    return null;
  }

  return getCodeBlockPositionForElement(editor, codeBlockElement);
}

function isCodeBlockTargetCollapsed(editor: Editor, codeBlock: CodeBlockTargetState | null) {
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

function focusCodeBlockTarget(editor: Editor, codeBlock: CodeBlockTargetState | null) {
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

function getFrameElement(controlsElement: HTMLElement) {
  return controlsElement.closest<HTMLElement>(".markweave-editor-frame");
}

function getAnchoredRect(element: HTMLElement | null, overlayRect: DOMRect) {
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

function getMermaidPreviewElement(editor: Editor, codeBlockPos: number | null) {
  if (codeBlockPos === null) {
    return null;
  }

  return editor.view.dom.ownerDocument.querySelector<HTMLElement>(
    `[data-testid="markweave-mermaid-inline-preview"][data-code-block-pos="${codeBlockPos}"]`,
  );
}

function getMermaidSvgMarkup(editor: Editor, codeBlockPos: number | null) {
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

function getSvgIntrinsicSize(svg: string) {
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

function clampFullscreenScale(scale: number) {
  return roundScale(clamp(scale, mermaidFullscreenMinScale, mermaidFullscreenMaxScale));
}

function createMermaidFullscreenViewerState(svg: string): MermaidFullscreenViewerState {
  const size = getSvgIntrinsicSize(svg) ?? { width: 800, height: 450 };

  if (typeof window === "undefined") {
    return {
      svg,
      width: size.width,
      height: size.height,
      scale: 1,
      translateX: 0,
      translateY: 0,
    };
  }

  const availableWidth = Math.max(320, window.innerWidth - 220);
  const availableHeight = Math.max(240, window.innerHeight - 180);
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

function formatFullscreenZoom(scale: number) {
  return `${Math.round(scale * 100)}%`;
}

function createIconPath(icon: IconName) {
  if (icon === "clipboard") {
    return (
      <>
        <path d="M9 4.5h6a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 15 18.5H7A1.5 1.5 0 0 1 5.5 17V6A1.5 1.5 0 0 1 7 4.5h2" />
        <path d="M8.5 5.5v-1A1.5 1.5 0 0 1 10 3h2a1.5 1.5 0 0 1 1.5 1.5v1h-5Z" />
      </>
    );
  }

  if (icon === "search") {
    return (
      <>
        <circle cx="10" cy="10" r="5.5" />
        <path d="m14 14 4 4" />
      </>
    );
  }

  if (icon === "check") {
    return <path d="m5 11 4 4 8-9" />;
  }

  if (icon === "expand") {
    return (
      <>
        <path d="M8 4H4v4" />
        <path d="M4 4l5 5" />
        <path d="M16 4h4v4" />
        <path d="m20 4-5 5" />
        <path d="M8 20H4v-4" />
        <path d="m4 20 5-5" />
        <path d="M16 20h4v-4" />
        <path d="m20 20-5-5" />
      </>
    );
  }

  if (icon === "download") {
    return (
      <>
        <path d="M12 4v10" />
        <path d="m8 10 4 4 4-4" />
        <path d="M5 19h14" />
      </>
    );
  }

  if (icon === "close") {
    return (
      <>
        <path d="M6 6l12 12" />
        <path d="M18 6 6 18" />
      </>
    );
  }

  if (icon === "zoomOut") {
    return (
      <>
        <circle cx="10" cy="10" r="5.25" />
        <path d="M7.5 10h5" />
        <path d="m14 14 4 4" />
      </>
    );
  }

  if (icon === "zoomIn") {
    return (
      <>
        <circle cx="10" cy="10" r="5.25" />
        <path d="M7.5 10h5" />
        <path d="M10 7.5v5" />
        <path d="m14 14 4 4" />
      </>
    );
  }

  if (icon === "reset") {
    return (
      <>
        <path d="M6.5 8.5A6 6 0 1 1 6 15" />
        <path d="M6.5 8.5H3.5v-3" />
      </>
    );
  }

  return <path d="m6 9 6 6 6-6" />;
}

function Icon({ icon }: { readonly icon: IconName }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {createIconPath(icon)}
      </g>
    </svg>
  );
}

export function CodeBlockControls({ active, editor, mermaidMode, onMermaidModeChange }: CodeBlockControlsProps) {
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const languageButtonRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const fullscreenDragRef = useRef<MermaidFullscreenDragState>({ active: false, lastX: 0, lastY: 0 });
  const [hoveredCodeBlockPos, setHoveredCodeBlockPos] = useState<number | null>(null);
  const [position, setPosition] = useState<OverlayPosition | null>(null);
  const [mermaidTabPositions, setMermaidTabPositions] = useState<readonly MermaidTabPosition[]>([]);
  const [languageMenuPosition, setLanguageMenuPosition] = useState<MenuPosition | null>(null);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<MarkweaveCodeBlockCopyFeedbackSnapshot | null>(null);
  const [copyTooltipVisible, setCopyTooltipVisible] = useState(false);
  const [fullscreenViewer, setFullscreenViewer] = useState<MermaidFullscreenViewerState | null>(null);
  const [fullscreenTooltip, setFullscreenTooltip] = useState<MermaidFullscreenTooltip | null>(null);
  const [fullscreenDragging, setFullscreenDragging] = useState(false);
  const [collapseRevision, setCollapseRevision] = useState(0);
  const activeCodeBlock = getActiveCodeBlockState(editor);
  const hoveredCodeBlock = getCodeBlockStateAtPosition(editor, hoveredCodeBlockPos);
  const activeTarget =
    active && activeCodeBlock.active && activeCodeBlock.pos !== null ? { ...activeCodeBlock, pos: activeCodeBlock.pos, active: true as const } : null;
  const codeBlock = hoveredCodeBlock ?? activeTarget;
  const codeBlockActive = codeBlock !== null;
  const isMermaid = codeBlock?.language === "mermaid";
  const collapsed = isCodeBlockTargetCollapsed(editor, codeBlock);
  const showTargetControls = codeBlockActive && codeBlock !== null && !collapsed;
  const currentLanguageLabel = codeBlock ? formatCodeBlockLanguageLabel(codeBlock.language) : formatCodeBlockLanguageLabel("text");
  const copyState = copyFeedback?.status ?? "idle";
  const visibleMermaidMode = codeBlock?.mermaidPreviewMode ?? mermaidMode;
  const svgAvailable = isMermaid && visibleMermaidMode === "preview";
  const mermaidTargets = getMermaidCodeBlockTargets(editor);
  const mermaidTargetKey = mermaidTargets.map((target) => `${target.pos}:${target.mermaidPreviewMode}:${target.text.length}`).join("|");

  const languageItems = useMemo(() => {
    const query = languageQuery.trim().toLowerCase();

    return [...markweaveCodeBlockLanguages]
      .map((language) => ({
        language,
        label: formatCodeBlockLanguageLabel(language),
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
      .filter((item) => !query || item.language.includes(query) || item.label.toLowerCase().includes(query));
  }, [languageQuery]);

  useEffect(() => {
    if (!copyFeedback) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setCopyFeedback(null);
    }, codeBlockCopyFeedbackTimeoutMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copyFeedback]);

  useEffect(() => {
    setCopyFeedback(null);
    setLanguageMenuOpen(false);
    setLanguageQuery("");
    setFullscreenViewer(null);
    setFullscreenTooltip(null);
    setFullscreenDragging(false);
  }, [active, codeBlock?.language, codeBlock?.pos, codeBlock?.text]);

  useEffect(() => {
    const updateOnCollapseTransaction = ({ transaction }: { readonly transaction: Transaction }) => {
      if (transaction.getMeta(codeBlockCollapsePluginKey)) {
        setCollapseRevision((revision) => revision + 1);
      }
    };

    editor.on("transaction", updateOnCollapseTransaction);
    return () => {
      editor.off("transaction", updateOnCollapseTransaction);
    };
  }, [editor]);

  useEffect(() => {
    const frameElement = editor.view.dom.closest<HTMLElement>(".markweave-editor-frame");

    if (!frameElement) {
      return undefined;
    }

    const updateHoveredCodeBlock = (event: MouseEvent) => {
      if (event.target instanceof Node && controlsRef.current?.contains(event.target)) {
        return;
      }

      if (languageMenuOpen) {
        return;
      }

      const nextPos = getCodeBlockPositionFromEventTarget(editor, event.target);
      const nextState = getCodeBlockStateAtPosition(editor, nextPos);
      const nextHoverPos = nextState && !isCodeBlockTargetCollapsed(editor, nextState) ? nextState.pos : null;

      setHoveredCodeBlockPos((currentPos) => (currentPos === nextHoverPos ? currentPos : nextHoverPos));
    };

    const clearHoveredCodeBlock = () => {
      if (!languageMenuOpen) {
        setHoveredCodeBlockPos(null);
      }
    };

    frameElement.addEventListener("mousemove", updateHoveredCodeBlock);
    frameElement.addEventListener("mouseleave", clearHoveredCodeBlock);

    return () => {
      frameElement.removeEventListener("mousemove", updateHoveredCodeBlock);
      frameElement.removeEventListener("mouseleave", clearHoveredCodeBlock);
    };
  }, [editor, languageMenuOpen]);

  useEffect(() => {
    if (!languageMenuOpen) {
      return;
    }

    searchInputRef.current?.focus();
  }, [languageMenuOpen]);

  useEffect(() => {
    if (!fullscreenViewer) {
      return undefined;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setFullscreenViewer(null);
      setFullscreenTooltip(null);
      setFullscreenDragging(false);
      fullscreenDragRef.current = { active: false, lastX: 0, lastY: 0 };
      editor.view.focus();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [editor, fullscreenViewer]);

  useEffect(() => {
    if (!codeBlockActive || !languageMenuOpen) {
      return undefined;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setLanguageMenuOpen(false);
      editor.view.focus();
    };

    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (event.target instanceof Node && controlsRef.current?.contains(event.target)) {
        return;
      }

      setLanguageMenuOpen(false);
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsidePointer);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsidePointer);
    };
  }, [codeBlockActive, editor, languageMenuOpen]);

  useLayoutEffect(() => {
    const updateMermaidTabPositions = () => {
      const controlsElement = controlsRef.current;

      if (!controlsElement) {
        return;
      }

      const frameElement = getFrameElement(controlsElement);

      if (!frameElement || mermaidTargets.length === 0) {
        setMermaidTabPositions([]);
        return;
      }

      const overlayRect = controlsElement.getBoundingClientRect();
      const nextPositions = mermaidTargets.flatMap((target) => {
        const targetElement = getActiveCodeBlockElement(editor, target.pos, target.mermaidPreviewMode);
        const targetRect = getAnchoredRect(targetElement, overlayRect);

        if (!targetRect) {
          return [];
        }

        return [
          {
            pos: target.pos,
            top: Math.round(targetRect.top - overlayRect.top + 10),
            left: Math.round(targetRect.left - overlayRect.left + 10),
          },
        ];
      });

      setMermaidTabPositions((previousPositions) =>
        mergeStableMermaidTabPositions(
          previousPositions,
          nextPositions,
          mermaidTargets.map((target) => target.pos),
        ),
      );
    };

    updateMermaidTabPositions();
    const animationFrame = window.requestAnimationFrame(updateMermaidTabPositions);
    window.addEventListener("resize", updateMermaidTabPositions);
    window.addEventListener("scroll", updateMermaidTabPositions, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateMermaidTabPositions);
      window.removeEventListener("scroll", updateMermaidTabPositions, true);
    };
  }, [collapseRevision, editor, mermaidTargetKey]);

  useLayoutEffect(() => {
    if (!showTargetControls || !codeBlock) {
      setPosition(null);
      setLanguageMenuPosition(null);
      return undefined;
    }

    const updatePosition = () => {
      const controlsElement = controlsRef.current;

      if (!controlsElement) {
        return;
      }

      const targetElement = getActiveCodeBlockElement(editor, codeBlock.pos, visibleMermaidMode);
      const overlayRect = controlsElement.getBoundingClientRect();
      const targetRect = getAnchoredRect(targetElement, overlayRect);

      if (!targetRect) {
        setPosition((previousPosition) => (previousPosition?.pos === codeBlock.pos ? previousPosition : null));
        setLanguageMenuPosition((previousPosition) => (languageMenuOpen ? previousPosition : null));
        return;
      }

      const nextPosition = {
        pos: codeBlock.pos,
        top: Math.round(targetRect.top - overlayRect.top + 10),
        left: Math.round(targetRect.left - overlayRect.left + 10),
        right: Math.max(10, Math.round(overlayRect.right - targetRect.right + 10)),
      };

      setPosition(nextPosition);

      if (languageMenuOpen && languageButtonRef.current) {
        const buttonRect = languageButtonRef.current.getBoundingClientRect();
        const visibleLeft = Math.max(overlayRect.left, 8) - overlayRect.left;
        const visibleRight = Math.min(overlayRect.right, window.innerWidth - 8) - overlayRect.left;
        const visibleTop = Math.max(overlayRect.top, 8) - overlayRect.top;
        const visibleBottom = Math.min(overlayRect.bottom, window.innerHeight - 8) - overlayRect.top;
        const visibleHeight = Math.max(120, visibleBottom - visibleTop);
        const menuHeight = Math.min(codeBlockLanguageMenuMaxHeight, visibleHeight - 16, overlayRect.height - 16);
        const rawLeft = buttonRect.right - overlayRect.left - codeBlockLanguageMenuWidth;
        const rawTop = buttonRect.bottom - overlayRect.top + 6;
        const flippedTop = buttonRect.top - overlayRect.top - menuHeight - 6;
        const top = rawTop + menuHeight > visibleBottom - 8 ? flippedTop : rawTop;

        setLanguageMenuPosition({
          left: Math.round(clamp(rawLeft, visibleLeft + 8, Math.max(visibleLeft + 8, visibleRight - codeBlockLanguageMenuWidth - 8))),
          top: Math.round(clamp(top, visibleTop + 8, Math.max(visibleTop + 8, visibleBottom - menuHeight - 8))),
        });
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showTargetControls, collapseRevision, codeBlock?.pos, editor, languageMenuOpen, visibleMermaidMode]);

  if (!showTargetControls && mermaidTargets.length === 0 && !fullscreenViewer) {
    return null;
  }

  const controlStyle: CSSProperties | undefined = position
    ? {
        top: position.top,
        right: position.right,
      }
    : undefined;

  const copyCode = async () => {
    if (!focusCodeBlockTarget(editor, codeBlock)) {
      return;
    }

    const didCopy = await copyActiveCodeBlock(editor);
    setCopyFeedback(getCodeBlockCopyFeedbackSnapshot(getActiveCodeBlockState(editor), didCopy ? "copied" : "failed"));
    editor.view.focus();
  };

  const setMermaidModeForTarget = (target: CodeBlockTargetState, mode: MermaidPreviewMode) => {
    if (!focusCodeBlockTarget(editor, target)) {
      return;
    }

    if (setActiveCodeBlockMermaidPreviewMode(editor, mode)) {
      onMermaidModeChange(mode);
    }
  };

  const setMermaidMode = (mode: MermaidPreviewMode) => {
    if (!codeBlock) {
      return;
    }

    setMermaidModeForTarget(codeBlock, mode);
  };

  const selectLanguage = (language: MarkweaveCodeBlockLanguage) => {
    if (!focusCodeBlockTarget(editor, codeBlock)) {
      return;
    }

    if (setActiveCodeBlockLanguage(editor, language)) {
      if (language === "mermaid" && setActiveCodeBlockMermaidPreviewMode(editor, "preview")) {
        onMermaidModeChange("preview");
      }

      setLanguageMenuOpen(false);
      setLanguageQuery("");
      editor.view.focus();
    }
  };

  const toggleCollapse = () => {
    if (!codeBlock) {
      return;
    }

    if (setCodeBlockCollapsedAtPosition(editor, codeBlock.pos, !collapsed)) {
      setCollapseRevision((revision) => revision + 1);
      setHoveredCodeBlockPos(null);
    }
  };

  const downloadMermaidSvg = () => {
    if (!codeBlock) {
      return;
    }

    const svg = getMermaidSvgMarkup(editor, codeBlock.pos);

    if (!svg) {
      return;
    }

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "markweave-mermaid.svg";
    anchor.click();
    URL.revokeObjectURL(url);
    editor.view.focus();
  };

  const openMermaidFullscreen = () => {
    if (!codeBlock) {
      return;
    }

    const svg = getMermaidSvgMarkup(editor, codeBlock.pos);

    if (svg) {
      setFullscreenViewer(createMermaidFullscreenViewerState(svg));
      setFullscreenTooltip(null);
      setFullscreenDragging(false);
      fullscreenDragRef.current = { active: false, lastX: 0, lastY: 0 };
    }
  };

  const closeMermaidFullscreen = () => {
    setFullscreenViewer(null);
    setFullscreenTooltip(null);
    setFullscreenDragging(false);
    fullscreenDragRef.current = { active: false, lastX: 0, lastY: 0 };
    editor.view.focus();
  };

  const zoomMermaidFullscreen = (delta: number) => {
    setFullscreenViewer((current) =>
      current
        ? {
            ...current,
            scale: clampFullscreenScale(current.scale + delta),
          }
        : current,
    );
  };

  const resetMermaidFullscreen = () => {
    setFullscreenViewer((current) => (current ? createMermaidFullscreenViewerState(current.svg) : current));
    fullscreenDragRef.current = { active: false, lastX: 0, lastY: 0 };
    setFullscreenDragging(false);
  };

  const handleFullscreenWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoomMermaidFullscreen(event.deltaY < 0 ? mermaidFullscreenZoomStep : -mermaidFullscreenZoomStep);
  };

  const startFullscreenDrag = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    fullscreenDragRef.current = {
      active: true,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    setFullscreenDragging(true);
  };

  const moveFullscreenDrag = (event: ReactMouseEvent<HTMLDivElement>) => {
    const drag = fullscreenDragRef.current;

    if (!drag.active) {
      return;
    }

    const deltaX = event.clientX - drag.lastX;
    const deltaY = event.clientY - drag.lastY;
    fullscreenDragRef.current = {
      active: true,
      lastX: event.clientX,
      lastY: event.clientY,
    };

    setFullscreenViewer((current) =>
      current
        ? {
            ...current,
            translateX: current.translateX + deltaX,
            translateY: current.translateY + deltaY,
          }
        : current,
    );
  };

  const stopFullscreenDrag = () => {
    fullscreenDragRef.current = { active: false, lastX: 0, lastY: 0 };
    setFullscreenDragging(false);
  };

  return (
    <div ref={controlsRef} className="markweave-codeblock-overlay" data-testid="markweave-codeblock-overlay">
      {mermaidTargets.map((target) => {
        const tabPosition = mermaidTabPositions.find((candidate) => candidate.pos === target.pos);

        return (
          <div
            key={target.pos}
            className="markweave-mermaid-tabs"
            data-testid="markweave-mermaid-tabs"
            data-code-block-pos={target.pos}
            data-positioned={tabPosition ? "true" : "false"}
            style={tabPosition ? { top: tabPosition.top, left: tabPosition.left } : undefined}
          >
            {(["code", "preview"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                data-testid={`markweave-mermaid-mode-${mode}`}
                data-active={target.mermaidPreviewMode === mode}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setMermaidModeForTarget(target, mode)}
              >
                {mode === "code" ? "Code" : "Preview"}
              </button>
            ))}
          </div>
        );
      })}
      {showTargetControls ? (
        <div
          className="markweave-codeblock-controls"
          data-testid="markweave-codeblock-controls"
          data-positioned={position ? "true" : "false"}
          data-collapsed={collapsed ? "true" : "false"}
          aria-label="Code block controls"
          style={controlStyle}
        >
          <button
            ref={languageButtonRef}
            type="button"
            className="markweave-codeblock-language-button"
            aria-label="Code block language"
            aria-expanded={languageMenuOpen}
            aria-haspopup="listbox"
            data-testid="markweave-codeblock-language"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setLanguageMenuOpen((open) => !open)}
          >
            <span>{currentLanguageLabel}</span>
            <Icon icon="chevron" />
          </button>
          <button
            type="button"
            className="markweave-codeblock-icon-button markweave-codeblock-collapse-button"
            aria-label={collapsed ? "Expand code block" : "Collapse code block"}
            title={collapsed ? "Expand code block" : "Collapse code block"}
            data-testid="markweave-codeblock-collapse"
            data-collapsed={collapsed ? "true" : "false"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={toggleCollapse}
          >
            <Icon icon="chevron" />
          </button>
          <span className="markweave-codeblock-copy-wrap">
            <button
              type="button"
              className="markweave-codeblock-icon-button"
              aria-label="Copy to clipboard"
              data-testid="markweave-codeblock-copy"
              data-copy-state={copyState}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setCopyTooltipVisible(true)}
              onMouseLeave={() => setCopyTooltipVisible(false)}
              onFocus={() => setCopyTooltipVisible(true)}
              onBlur={() => setCopyTooltipVisible(false)}
              onClick={copyCode}
            >
              <Icon icon={copyState === "copied" ? "check" : "clipboard"} />
            </button>
            {copyTooltipVisible ? (
              <span className="markweave-codeblock-tooltip" role="tooltip" data-testid="markweave-codeblock-copy-tooltip">
                Copy to clipboard
              </span>
            ) : null}
          </span>
          {isMermaid && visibleMermaidMode === "preview" ? (
            <div className="markweave-mermaid-preview-actions" data-testid="markweave-mermaid-preview-actions">
              <button
                type="button"
                className="markweave-codeblock-icon-button"
                aria-label="Fullscreen Mermaid preview"
                data-testid="markweave-mermaid-fullscreen"
                disabled={!svgAvailable}
                onMouseDown={(event) => event.preventDefault()}
                onClick={openMermaidFullscreen}
              >
                <Icon icon="expand" />
              </button>
              <button
                type="button"
                className="markweave-codeblock-icon-button"
                aria-label="Download Mermaid SVG"
                data-testid="markweave-mermaid-download"
                disabled={!svgAvailable}
                onMouseDown={(event) => event.preventDefault()}
                onClick={downloadMermaidSvg}
              >
                <Icon icon="download" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {showTargetControls && languageMenuOpen ? (
        <div
          className="markweave-codeblock-language-menu"
          role="listbox"
          aria-label="Code block languages"
          data-testid="markweave-codeblock-language-menu"
          data-positioned={languageMenuPosition ? "true" : "false"}
          style={
            languageMenuPosition
              ? {
                  left: languageMenuPosition.left,
                  top: languageMenuPosition.top,
                }
              : undefined
          }
        >
          <label className="markweave-codeblock-language-search">
            <input
              ref={searchInputRef}
              value={languageQuery}
              placeholder="Search..."
              data-testid="markweave-codeblock-language-search"
              onChange={(event) => setLanguageQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setLanguageMenuOpen(false);
                  editor.view.focus();
                }
              }}
            />
            <Icon icon="search" />
          </label>
          <div className="markweave-codeblock-language-list">
            {languageItems.map((item) => {
              const selected = item.language === codeBlock.language;

              return (
                <button
                  key={item.language}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid={`markweave-codeblock-language-option-${item.language}`}
                  data-active={selected ? "true" : "false"}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectLanguage(item.language)}
                >
                  <span>{item.label}</span>
                  {selected ? <Icon icon="check" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {fullscreenViewer ? (
        <div className="markweave-mermaid-fullscreen-layer" role="dialog" aria-modal="true" aria-label="Mermaid preview" data-testid="markweave-mermaid-fullscreen-layer">
          <div className="markweave-mermaid-fullscreen-toolbar" data-testid="markweave-mermaid-fullscreen-toolbar">
            <button
              type="button"
              className="markweave-mermaid-fullscreen-control"
              aria-label="Zoom out"
              data-testid="markweave-mermaid-fullscreen-zoom-out"
              onMouseEnter={() => setFullscreenTooltip("zoom-out")}
              onMouseLeave={() => setFullscreenTooltip(null)}
              onFocus={() => setFullscreenTooltip("zoom-out")}
              onBlur={() => setFullscreenTooltip(null)}
              onClick={() => zoomMermaidFullscreen(-mermaidFullscreenZoomStep)}
            >
              <Icon icon="zoomOut" />
            </button>
            <span className="markweave-mermaid-fullscreen-zoom-label" data-testid="markweave-mermaid-fullscreen-zoom-label">
              {formatFullscreenZoom(fullscreenViewer.scale)}
            </span>
            <button
              type="button"
              className="markweave-mermaid-fullscreen-control"
              aria-label="Zoom in"
              data-testid="markweave-mermaid-fullscreen-zoom-in"
              onMouseEnter={() => setFullscreenTooltip("zoom-in")}
              onMouseLeave={() => setFullscreenTooltip(null)}
              onFocus={() => setFullscreenTooltip("zoom-in")}
              onBlur={() => setFullscreenTooltip(null)}
              onClick={() => zoomMermaidFullscreen(mermaidFullscreenZoomStep)}
            >
              <Icon icon="zoomIn" />
            </button>
            <button
              type="button"
              className="markweave-mermaid-fullscreen-control"
              aria-label="Reset zoom"
              data-testid="markweave-mermaid-fullscreen-reset"
              onMouseEnter={() => setFullscreenTooltip("reset")}
              onMouseLeave={() => setFullscreenTooltip(null)}
              onFocus={() => setFullscreenTooltip("reset")}
              onBlur={() => setFullscreenTooltip(null)}
              onClick={resetMermaidFullscreen}
            >
              <Icon icon="reset" />
            </button>
            {fullscreenTooltip ? (
              <span className="markweave-mermaid-fullscreen-tooltip" role="tooltip" data-testid="markweave-mermaid-fullscreen-tooltip">
                {fullscreenTooltip === "zoom-out" ? "Zoom out" : fullscreenTooltip === "zoom-in" ? "Zoom in" : "Reset"}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="markweave-mermaid-fullscreen-close"
            aria-label="Close fullscreen Mermaid preview"
            data-testid="markweave-mermaid-fullscreen-close"
            onClick={closeMermaidFullscreen}
          >
            <Icon icon="close" />
          </button>
          <div
            className="markweave-mermaid-fullscreen-viewport"
            data-testid="markweave-mermaid-fullscreen-viewport"
            data-dragging={fullscreenDragging ? "true" : "false"}
            onWheel={handleFullscreenWheel}
            onMouseDown={startFullscreenDrag}
            onMouseMove={moveFullscreenDrag}
            onMouseUp={stopFullscreenDrag}
            onMouseLeave={stopFullscreenDrag}
          >
            <div
              className="markweave-mermaid-fullscreen-content"
              data-testid="markweave-mermaid-fullscreen-content"
              data-scale-percent={Math.round(fullscreenViewer.scale * 100)}
              data-translate={`${Math.round(fullscreenViewer.translateX)},${Math.round(fullscreenViewer.translateY)}`}
              style={{
                width: `${fullscreenViewer.width}px`,
                height: `${fullscreenViewer.height}px`,
                transform: `translate(${fullscreenViewer.translateX}px, ${fullscreenViewer.translateY}px) scale(${fullscreenViewer.scale})`,
              }}
              dangerouslySetInnerHTML={{ __html: fullscreenViewer.svg }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
