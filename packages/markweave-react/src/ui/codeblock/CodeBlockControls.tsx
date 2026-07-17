import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent } from "react";
import type { Editor } from "@tiptap/react";
import type { Transaction } from "@tiptap/pm/state";
import { saveMarkweaveBrowserFile } from "markweave/internal/core/browser-file-save";
import {
  copyActiveCodeBlock,
  codeBlockCollapsePluginKey,
  getActiveCodeBlockState,
  getCodeBlockCopyFeedbackSnapshot,
  setCodeBlockCollapsedAtPosition,
  setCodeBlockLanguageAtPosition,
  setCodeBlockMermaidPreviewModeAtPosition,
  type MarkweaveCodeBlockCopyFeedbackSnapshot,
  type MarkweaveCodeBlockLanguage,
} from "markweave/internal/plugins/codeblock/codeblock-behavior";
import {
  calculateCodeBlockLanguageMenuPosition,
  clampFullscreenScale,
  codeBlockCopyFeedbackTimeoutMs,
  copyCodeBlockText,
  createCodeBlockOverlayPosition,
  createMermaidFullscreenViewerState,
  createMermaidTabPosition,
  focusCodeBlockTarget,
  formatCodeBlockLanguageLabel,
  formatFullscreenZoom,
  getActiveCodeBlockElement,
  getAnchoredRect,
  getCodeBlockLanguageItems,
  getCodeBlockPositionFromEventTarget,
  getCodeBlockStateAtPosition,
  getFrameElement,
  getMermaidCodeBlockTargets,
  getMermaidSvgMarkup,
  isCodeBlockTargetCollapsed,
  mergeStableMermaidTabPositions,
  mermaidFullscreenZoomStep,
  moveMermaidFullscreenViewer,
  type CodeBlockOverlayPosition,
  type CodeBlockMenuPosition,
  type CodeBlockTargetState,
  type MermaidFullscreenDragState,
  type MermaidFullscreenTooltip,
  type MermaidFullscreenViewerState,
  type MermaidTabPosition,
} from "markweave/internal/plugins/codeblock/codeblock-ui-model";
import { setReadonlyMermaidPreviewMode } from "markweave/internal/plugins/mermaid/mermaid-inline-preview";
import type { MermaidPreviewMode } from "markweave/internal/plugins/mermaid/mermaid-renderer";

export { mergeStableMermaidTabPositions } from "markweave/internal/plugins/codeblock/codeblock-ui-model";

interface CodeBlockControlsProps {
  readonly active: boolean;
  readonly editor: Editor;
  readonly mermaidMode: MermaidPreviewMode;
  readonly onMermaidModeChange: (mode: MermaidPreviewMode) => void;
  readonly readOnly?: boolean;
}

type IconName = "chevron" | "clipboard" | "search" | "check" | "expand" | "download" | "close" | "zoomIn" | "zoomOut" | "reset";

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

export function CodeBlockControls({ active, editor, mermaidMode, onMermaidModeChange, readOnly = false }: CodeBlockControlsProps) {
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const languageButtonRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const fullscreenDragRef = useRef<MermaidFullscreenDragState>({ active: false, lastX: 0, lastY: 0 });
  const [hoveredCodeBlockPos, setHoveredCodeBlockPos] = useState<number | null>(null);
  const [position, setPosition] = useState<CodeBlockOverlayPosition | null>(null);
  const [mermaidTabPositions, setMermaidTabPositions] = useState<readonly MermaidTabPosition[]>([]);
  const [languageMenuPosition, setLanguageMenuPosition] = useState<CodeBlockMenuPosition | null>(null);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<MarkweaveCodeBlockCopyFeedbackSnapshot | null>(null);
  const [copyTooltipVisible, setCopyTooltipVisible] = useState(false);
  const [fullscreenViewer, setFullscreenViewer] = useState<MermaidFullscreenViewerState | null>(null);
  const [fullscreenTooltip, setFullscreenTooltip] = useState<MermaidFullscreenTooltip | null>(null);
  const [fullscreenDragging, setFullscreenDragging] = useState(false);
  const [collapseRevision, setCollapseRevision] = useState(0);
  const [controlsRevision, setControlsRevision] = useState(0);
  const activeCodeBlock = getActiveCodeBlockState(editor);
  const hoveredCodeBlock = getCodeBlockStateAtPosition(editor, hoveredCodeBlockPos);
  const activeTarget =
    !readOnly && active && activeCodeBlock.active && activeCodeBlock.pos !== null ? { ...activeCodeBlock, pos: activeCodeBlock.pos, active: true as const } : null;
  const codeBlock = hoveredCodeBlock ?? activeTarget;
  const codeBlockActive = codeBlock !== null;
  const isMermaid = codeBlock?.language === "mermaid";
  const collapsed = isCodeBlockTargetCollapsed(editor, codeBlock);
  const showTargetControls = codeBlockActive && codeBlock !== null && !collapsed;
  const showWritableControls = !readOnly;
  const currentLanguageLabel = codeBlock ? formatCodeBlockLanguageLabel(codeBlock.language) : formatCodeBlockLanguageLabel("text");
  const copyState = copyFeedback?.status ?? "idle";
  const visibleMermaidMode = codeBlock?.mermaidPreviewMode ?? mermaidMode;
  const svgAvailable = isMermaid && visibleMermaidMode === "preview";
  const mermaidTargets = getMermaidCodeBlockTargets(editor);
  const mermaidTargetKey = `${controlsRevision}|${mermaidTargets
    .map((target) => `${target.pos}:${target.mermaidPreviewMode}:${target.text.length}`)
    .join("|")}`;

  const languageItems = useMemo(() => {
    const query = languageQuery.trim().toLowerCase();

    return getCodeBlockLanguageItems(query);
  }, [languageQuery]);

  useEffect(() => {
    if (readOnly) {
      setLanguageMenuOpen(false);
      setLanguageQuery("");
    }
  }, [readOnly]);

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

    searchInputRef.current?.focus({ preventScroll: true });
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

        return [createMermaidTabPosition(target, targetRect, overlayRect)];
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

      const nextPosition = createCodeBlockOverlayPosition(codeBlock.pos, targetRect, overlayRect);

      setPosition(nextPosition);

      if (languageMenuOpen && languageButtonRef.current) {
        const buttonRect = languageButtonRef.current.getBoundingClientRect();
        setLanguageMenuPosition(calculateCodeBlockLanguageMenuPosition({ overlayRect, buttonRect, windowWidth: window.innerWidth, windowHeight: window.innerHeight }));
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
    if (readOnly) {
      if (!codeBlock) {
        return;
      }

      const didCopy = await copyCodeBlockText(codeBlock.text);
      setCopyFeedback(getCodeBlockCopyFeedbackSnapshot(codeBlock, didCopy ? "copied" : "failed"));
      return;
    }

    if (!focusCodeBlockTarget(editor, codeBlock)) {
      return;
    }

    const didCopy = await copyActiveCodeBlock(editor);
    setCopyFeedback(getCodeBlockCopyFeedbackSnapshot(getActiveCodeBlockState(editor), didCopy ? "copied" : "failed"));
    editor.view.focus();
  };

  const setMermaidModeForTarget = (target: CodeBlockTargetState, mode: MermaidPreviewMode) => {
    if (readOnly) {
      if (setReadonlyMermaidPreviewMode(editor, target.pos, mode)) {
        setControlsRevision((revision) => revision + 1);
      }
      return;
    }

    const refocusEditor = activeCodeBlock.active && activeCodeBlock.pos === target.pos;

    if (setCodeBlockMermaidPreviewModeAtPosition(editor, target.pos, mode)) {
      onMermaidModeChange(mode);
      setControlsRevision((revision) => revision + 1);
      if (refocusEditor) {
        editor.view.focus();
      }
    }
  };

  const setMermaidMode = (mode: MermaidPreviewMode) => {
    if (!codeBlock) {
      return;
    }

    setMermaidModeForTarget(codeBlock, mode);
  };

  const selectLanguage = (language: MarkweaveCodeBlockLanguage) => {
    if (readOnly) {
      return;
    }

    if (!codeBlock) {
      return;
    }

    const refocusEditor = activeCodeBlock.active && activeCodeBlock.pos === codeBlock.pos;

    if (setCodeBlockLanguageAtPosition(editor, codeBlock.pos, language)) {
      if (language === "mermaid" && setCodeBlockMermaidPreviewModeAtPosition(editor, codeBlock.pos, "preview")) {
        onMermaidModeChange("preview");
      }

      setLanguageMenuOpen(false);
      setLanguageQuery("");
      setControlsRevision((revision) => revision + 1);
      if (refocusEditor) {
        editor.view.focus();
      }
    }
  };

  const toggleCollapse = () => {
    if (readOnly || !codeBlock) {
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

    saveMarkweaveBrowserFile({
      data: new Blob([svg], { type: "image/svg+xml" }),
      fileName: "markweave-mermaid.svg",
      onSettled: () => editor.view.focus(),
      ownerDocument: document,
    });
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
    setFullscreenViewer((current) => (current ? { ...current, scale: clampFullscreenScale(current.scale + delta) } : current));
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

    setFullscreenViewer((current) => moveMermaidFullscreenViewer(current, deltaX, deltaY));
  };

  const stopFullscreenDrag = () => {
    fullscreenDragRef.current = { active: false, lastX: 0, lastY: 0 };
    setFullscreenDragging(false);
  };

  return (
    <div ref={controlsRef} className="markweave-codeblock-overlay" data-testid="markweave-codeblock-overlay" data-read-only={readOnly ? "true" : "false"}>
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
          data-read-only={readOnly ? "true" : "false"}
          aria-label="Code block controls"
          style={controlStyle}
        >
          {readOnly ? (
            <span
              className="markweave-codeblock-language-button markweave-codeblock-language-label"
              aria-label="Code block language"
              data-testid="markweave-codeblock-language"
            >
              <span>{currentLanguageLabel}</span>
            </span>
          ) : (
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
          )}
          {showWritableControls ? (
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
          ) : null}
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
      {showWritableControls && showTargetControls && languageMenuOpen ? (
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
