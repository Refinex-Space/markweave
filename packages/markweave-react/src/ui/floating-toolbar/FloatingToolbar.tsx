import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  ChevronDown,
  ChevronUp,
  Code2,
  CornerDownLeft,
  ExternalLink,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  MoreVertical,
  Quote,
  Sigma,
  Sparkles,
  Strikethrough,
  Subscript,
  Superscript,
  Trash2,
  Type as TypeIcon,
  Underline,
  type LucideIcon,
} from "lucide-react";
import {
  advanceFloatingToolbarMotionState,
  calculateFloatingToolbarFrameShift,
  calculateFloatingToolbarTopBoundary,
  createSelectionSnapshot,
  getFloatingToolbarFloatingOptions,
  getFloatingToolbarState,
  shouldShowFloatingToolbar,
  transitionFloatingToolbarState,
  type EditorSelectionSnapshot,
  type FloatingToolbarState,
} from "markweave/internal/editor-core/selection-state";
import {
  applyFloatingToolbarLink,
  createFloatingToolbarAssistantRequest,
  getFloatingToolbarButtonModels,
  getFloatingToolbarHighlightColorOptions,
  getFloatingToolbarLinkHref,
  getFloatingToolbarMessageSet,
  getFloatingToolbarMoreActions,
  getFloatingToolbarTextColorOptions,
  getFloatingToolbarTooltipModel,
  getFloatingToolbarTurnIntoOptions,
  isFloatingToolbarMoreActionActive,
  isFloatingToolbarTurnIntoActive,
  openFloatingToolbarLinkHref,
  preventFloatingToolbarPointerFocusLoss,
  removeFloatingToolbarLink,
  runFloatingToolbarMoreAction,
  setFloatingToolbarHighlightColor,
  setFloatingToolbarTextColor,
  setFloatingToolbarTurnInto,
  type FloatingToolbarButtonId,
  type FloatingToolbarButtonModel,
  type FloatingToolbarColorOption,
  type FloatingToolbarMenu,
  type FloatingToolbarMoreAction,
  type FloatingToolbarMoreActionId,
  type FloatingToolbarTurnIntoOption,
} from "markweave/internal/editor-core/floating-toolbar-model";
import type { FloatingToolbarAssistantRequest, FloatingToolbarAssistantSource } from "markweave/internal/core/public-types";
import { normalizeMarkdownLinkHref } from "markweave/internal/plugins/markdown/markdown-input";
import { getMarkweaveMessages, type MarkweaveMessages } from "markweave/internal/i18n";

export {
  applyFloatingToolbarLink,
  createFloatingToolbarAssistantRequest,
  floatingToolbarBlockTypes,
  floatingToolbarColorOptions,
  floatingToolbarHighlightColorOptions,
  floatingToolbarMoreActions,
  floatingToolbarTextColorOptions,
  floatingToolbarTurnIntoOptions,
  getCurrentFloatingToolbarBlockType,
  getFloatingToolbarBlockTypes,
  getFloatingToolbarButtonCount,
  getFloatingToolbarButtonModels,
  getFloatingToolbarHighlightColorOptions,
  getFloatingToolbarLinkHref,
  getFloatingToolbarMoreActions,
  getFloatingToolbarTextColorOptions,
  getFloatingToolbarTooltipModel,
  getFloatingToolbarTurnIntoOptions,
  insertFloatingToolbarInlineMath,
  openFloatingToolbarLinkHref,
  preventFloatingToolbarPointerFocusLoss,
  removeFloatingToolbarLink,
  runFloatingToolbarMoreAction,
  setFloatingToolbarBlockType,
  setFloatingToolbarCalloutType,
  setFloatingToolbarHighlightColor,
  setFloatingToolbarTextAlign,
  setFloatingToolbarTextColor,
  setFloatingToolbarTurnInto,
} from "markweave/internal/editor-core/floating-toolbar-model";
export type {
  FloatingToolbarBlockType,
  FloatingToolbarButtonGroup,
  FloatingToolbarButtonId,
  FloatingToolbarButtonModel,
  FloatingToolbarColorOption,
  FloatingToolbarMenu,
  FloatingToolbarMoreAction,
  FloatingToolbarMoreActionId,
  FloatingToolbarTextAlign,
  FloatingToolbarTooltipModel,
  FloatingToolbarTurnIntoId,
  FloatingToolbarTurnIntoOption,
} from "markweave/internal/editor-core/floating-toolbar-model";

interface FloatingToolbarProps {
  readonly editor: Editor;
  readonly messages?: MarkweaveMessages;
  readonly selectionSnapshot: EditorSelectionSnapshot | null;
  readonly onRewriteSelection?: (request: FloatingToolbarAssistantRequest) => void;
  readonly onExtractToNote?: (request: FloatingToolbarAssistantRequest) => void;
}

const defaultMarkweaveMessages = getMarkweaveMessages("zh");

function getNowMs() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function getToolbarStyle(toolbarState: FloatingToolbarState, frameShiftPx: number) {
  return {
    "--markweave-toolbar-motion-duration": `${toolbarState.motionDurationMs}ms`,
    "--markweave-toolbar-motion-easing": toolbarState.motionEasing,
    marginLeft: frameShiftPx === 0 ? undefined : `${frameShiftPx}px`,
  } as CSSProperties;
}

function getFloatingToolbarMeasuredHeight(toolbarElement: HTMLElement | null, contentElement: HTMLElement | null) {
  const toolbarHeight = toolbarElement?.getBoundingClientRect().height ?? 0;
  const contentHeight = contentElement?.getBoundingClientRect().height ?? 0;

  return Math.max(toolbarHeight, contentHeight, 44);
}

function getToolbarTooltipStyle(anchorX: number | null) {
  if (anchorX === null) {
    return undefined;
  }

  return {
    "--markweave-floating-toolbar-tooltip-left": `${anchorX}px`,
  } as CSSProperties;
}

function createToolbarDomRect(left: number, top: number, width: number, height: number): DOMRect {
  const rect = {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
  };

  if (typeof DOMRect !== "undefined") {
    return new DOMRect(rect.x, rect.y, rect.width, rect.height);
  }

  return {
    ...rect,
    toJSON: () => rect,
  } as DOMRect;
}

function isMeasurableToolbarRect(rect: Pick<DOMRect, "height" | "width">) {
  return rect.width > 0 && rect.height > 0;
}

function combineToolbarDomRects(rects: readonly DOMRect[]) {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return createToolbarDomRect(left, top, right - left, bottom - top);
}

function isNativeSelectionInsideEditor(editor: Editor, selection: Selection) {
  const elementNodeType = editor.view.dom.ownerDocument.defaultView?.Node.ELEMENT_NODE ?? 1;
  const isNodeInsideEditor = (node: Node | null) => {
    if (!node) {
      return false;
    }

    return editor.view.dom.contains(node.nodeType === elementNodeType ? node : node.parentNode);
  };

  return isNodeInsideEditor(selection.anchorNode) && isNodeInsideEditor(selection.focusNode);
}

function getRangeDomRects(range: Range) {
  if (typeof range.getClientRects !== "function") {
    return null;
  }

  const clientRects = Array.from(range.getClientRects())
    .filter(isMeasurableToolbarRect)
    .map((rect) => createToolbarDomRect(rect.left, rect.top, rect.width, rect.height));

  if (clientRects.length > 0) {
    return clientRects;
  }

  if (typeof range.getBoundingClientRect !== "function") {
    return null;
  }

  const boundingRect = range.getBoundingClientRect();
  return isMeasurableToolbarRect(boundingRect) ? [createToolbarDomRect(boundingRect.left, boundingRect.top, boundingRect.width, boundingRect.height)] : null;
}

function getNativeSelectionPositions(editor: Editor, selection: Selection) {
  if (selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);

  try {
    const from = editor.view.posAtDOM(range.startContainer, range.startOffset);
    const to = editor.view.posAtDOM(range.endContainer, range.endOffset);
    return {
      from: Math.min(from, to),
      to: Math.max(from, to),
    };
  } catch {
    return null;
  }
}

function isNativeSelectionSyncedWithEditor(editor: Editor, selection: Selection) {
  const nativeRange = getNativeSelectionPositions(editor, selection);

  if (!nativeRange) {
    return false;
  }

  const { selection: editorSelection } = editor.state;
  const editorRange = {
    from: Math.min(editorSelection.from, editorSelection.to),
    to: Math.max(editorSelection.from, editorSelection.to),
  };

  return nativeRange.from === editorRange.from && nativeRange.to === editorRange.to;
}

function getNativeSelectionDomRects(editor: Editor) {
  const ownerDocument = editor.view.dom.ownerDocument;
  const nativeSelection = ownerDocument.getSelection();

  if (
    !nativeSelection ||
    nativeSelection.rangeCount === 0 ||
    nativeSelection.isCollapsed ||
    !isNativeSelectionInsideEditor(editor, nativeSelection) ||
    !isNativeSelectionSyncedWithEditor(editor, nativeSelection)
  ) {
    return null;
  }

  return getRangeDomRects(nativeSelection.getRangeAt(0));
}

function getProseMirrorSelectionRangeDomRects(editor: Editor) {
  const { selection } = editor.state;

  if (selection.empty) {
    return null;
  }

  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);

  try {
    const start = editor.view.domAtPos(from);
    const end = editor.view.domAtPos(to);
    const range = editor.view.dom.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return getRangeDomRects(range);
  } catch {
    return null;
  }
}

function getProseMirrorSelectionCoordsDomRects(editor: Editor) {
  const { selection } = editor.state;

  if (selection.empty) {
    return null;
  }

  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const start = editor.view.coordsAtPos(from);
  const end = editor.view.coordsAtPos(to, -1);
  const top = Math.min(start.top, end.top);
  const bottom = Math.max(start.bottom, end.bottom);
  const left = Math.min(start.left, end.left);
  const right = Math.max(start.right, end.right);

  const rect = createToolbarDomRect(left, top, right - left, bottom - top);
  return isMeasurableToolbarRect(rect) ? [rect] : null;
}

export function getFloatingToolbarSelectionDomRects(editor: Editor) {
  return getNativeSelectionDomRects(editor) ?? getProseMirrorSelectionRangeDomRects(editor) ?? getProseMirrorSelectionCoordsDomRects(editor);
}

function getCurrentSelectionDomRect(editor: Editor) {
  const rects = getFloatingToolbarSelectionDomRects(editor);
  return rects && rects.length > 0 ? combineToolbarDomRects(rects) : null;
}

function getFloatingToolbarSelectionVirtualElement(editor: Editor) {
  return {
    getBoundingClientRect: () => getCurrentSelectionDomRect(editor) ?? createToolbarDomRect(0, 0, 0, 0),
    getClientRects: () => {
      return getFloatingToolbarSelectionDomRects(editor) ?? [];
    },
  };
}

function isMenuButton(id: FloatingToolbarButtonId): id is FloatingToolbarMenu {
  return id === "block-type" || id === "link" || id === "color" || id === "more";
}

function runAssistantAction(
  editor: Editor,
  source: FloatingToolbarAssistantSource,
  callback: ((request: FloatingToolbarAssistantRequest) => void) | undefined,
) {
  callback?.(createFloatingToolbarAssistantRequest(editor, source));
  editor.commands.focus();
}

export function FloatingToolbar({ editor, messages = defaultMarkweaveMessages, selectionSnapshot, onRewriteSelection }: FloatingToolbarProps) {
  const moreActions = useMemo(() => getFloatingToolbarMoreActions(messages), [messages]);
  const stableToolbarState = getFloatingToolbarState(selectionSnapshot, { editable: editor.isEditable });
  const [toolbarState, setToolbarState] = useState(stableToolbarState);
  const [tooltipButtonId, setTooltipButtonId] = useState<FloatingToolbarButtonId | FloatingToolbarMoreActionId | null>(null);
  const [tooltipAnchorX, setTooltipAnchorX] = useState<number | null>(null);
  const [openMenu, setOpenMenu] = useState<FloatingToolbarMenu | null>(null);
  const [linkInputValue, setLinkInputValue] = useState("");
  const [linkInitialHref, setLinkInitialHref] = useState("");
  const [linkSelectionRange, setLinkSelectionRange] = useState<{ readonly from: number; readonly to: number } | null>(null);
  const [frameShiftPx, setFrameShiftPx] = useState(0);
  const [topBoundaryPaddingPx, setTopBoundaryPaddingPx] = useState(stableToolbarState.boundaryPadding);
  const frameShiftRef = useRef(0);
  const toolbarRootRef = useRef<HTMLDivElement | null>(null);
  const toolbarContentRef = useRef<HTMLDivElement | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const visibleButtons = getFloatingToolbarButtonModels(editor, toolbarState.variant, messages);
  const tooltipModel = getFloatingToolbarTooltipModel(visibleButtons.find((button) => button.id === tooltipButtonId) ?? null);
  const normalizedLinkInputHref = normalizeMarkdownLinkHref(linkInputValue);
  const applyFrameGeometryClamp = useCallback(() => {
    const toolbarElement = toolbarRootRef.current;
    const frameElement = editor.view.dom.closest(".markweave-editor-frame");

    if (!toolbarElement || !(frameElement instanceof HTMLElement)) {
      return;
    }

    const toolbarRect = toolbarElement.getBoundingClientRect();
    const frameRect = frameElement.getBoundingClientRect();
    const toolbarHeight = getFloatingToolbarMeasuredHeight(toolbarElement, toolbarContentRef.current);
    const currentFrameShift = frameShiftRef.current;
    const nextShift = calculateFloatingToolbarFrameShift({
      toolbarRect: {
        left: toolbarRect.left - currentFrameShift,
        top: toolbarRect.top,
        width: toolbarRect.width,
        height: toolbarRect.height,
      },
      frameRect: {
        left: frameRect.left,
        top: frameRect.top,
        width: frameRect.width,
        height: frameRect.height,
      },
      boundaryPadding: toolbarState.boundaryPadding,
    });
    const nextTopBoundary = calculateFloatingToolbarTopBoundary({
      frameRect: {
        left: frameRect.left,
        top: frameRect.top,
        width: frameRect.width,
        height: frameRect.height,
      },
      toolbarSize: {
        width: toolbarRect.width,
        height: toolbarHeight,
      },
      offset: toolbarState.offset,
      boundaryPadding: toolbarState.boundaryPadding,
    });

    toolbarElement.style.marginLeft = nextShift === 0 ? "" : `${nextShift}px`;
    toolbarElement.style.visibility = "visible";
    toolbarElement.style.opacity = "1";
    frameShiftRef.current = nextShift;
    setFrameShiftPx((current) => (current === nextShift ? current : nextShift));
    setTopBoundaryPaddingPx((current) => (current === nextTopBoundary ? current : nextTopBoundary));
  }, [editor.view.dom, toolbarState.boundaryPadding, toolbarState.offset]);
  const markToolbarPositionPending = useCallback(() => {
    if (toolbarRootRef.current) {
      toolbarRootRef.current.style.visibility = "hidden";
      toolbarRootRef.current.style.opacity = "0";
    }
  }, []);
  const markToolbarPositionReady = useCallback(() => {
    applyFrameGeometryClamp();
  }, [applyFrameGeometryClamp]);
  const getReferencedVirtualElement = useCallback(() => getFloatingToolbarSelectionVirtualElement(editor), [editor]);
  const floatingOptions = useMemo(
    () => ({
      ...getFloatingToolbarFloatingOptions(toolbarState, { topBoundaryPadding: topBoundaryPaddingPx }),
      onShow: markToolbarPositionPending,
      onUpdate: markToolbarPositionReady,
    }),
    [markToolbarPositionPending, markToolbarPositionReady, toolbarState, topBoundaryPaddingPx],
  );

  useEffect(() => {
    const nowMs = getNowMs();
    setToolbarState((previous) => transitionFloatingToolbarState(previous, stableToolbarState, nowMs));
  }, [
    stableToolbarState.hiddenReason,
    stableToolbarState.motionDurationMs,
    stableToolbarState.motionEasing,
    stableToolbarState.motionPhase,
    stableToolbarState.offset,
    stableToolbarState.boundaryPadding,
    stableToolbarState.placement,
    stableToolbarState.updateDelayMs,
    stableToolbarState.variant,
    stableToolbarState.visibility,
  ]);

  useEffect(() => {
    if (toolbarState.motionStartedAtMs === null || toolbarState.motionDurationMs <= 0) {
      return undefined;
    }

    const remainingMs = Math.max(0, toolbarState.motionStartedAtMs + toolbarState.motionDurationMs - getNowMs());
    const timer = window.setTimeout(() => {
      setToolbarState((state) => advanceFloatingToolbarMotionState(state, getNowMs()));
    }, remainingMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toolbarState.motionDurationMs, toolbarState.motionPhase, toolbarState.motionStartedAtMs]);

  useLayoutEffect(() => {
    if (toolbarState.visibility !== "visible") {
      frameShiftRef.current = 0;
      if (toolbarRootRef.current) {
        toolbarRootRef.current.style.marginLeft = "";
        toolbarRootRef.current.style.visibility = "hidden";
        toolbarRootRef.current.style.opacity = "0";
      }
      setFrameShiftPx(0);
      setTopBoundaryPaddingPx(toolbarState.boundaryPadding);
      return undefined;
    }

    let animationFrame = 0;
    animationFrame = window.requestAnimationFrame(applyFrameGeometryClamp);
    window.addEventListener("resize", applyFrameGeometryClamp);
    window.addEventListener("scroll", applyFrameGeometryClamp, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", applyFrameGeometryClamp);
      window.removeEventListener("scroll", applyFrameGeometryClamp, true);
    };
  }, [
    applyFrameGeometryClamp,
    editor.view.dom,
    openMenu,
    selectionSnapshot?.from,
    selectionSnapshot?.to,
    toolbarState.variant,
    toolbarState.visibility,
    visibleButtons.length,
  ]);

  useEffect(() => {
    if (openMenu === "more" && moreActions.some((action) => action.id === tooltipButtonId)) {
      return;
    }

    if (!visibleButtons.some((button) => button.id === tooltipButtonId)) {
      setTooltipButtonId(null);
      setTooltipAnchorX(null);
    }
  }, [moreActions, openMenu, tooltipButtonId, visibleButtons]);

  useEffect(() => {
    if (!openMenu) {
      return undefined;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (toolbarContentRef.current?.contains(event.target as Node)) {
        return;
      }

      setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenMenu(null);
        editor.commands.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [editor, openMenu]);

  useEffect(() => {
    if (openMenu !== "link") {
      return undefined;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [openMenu]);

  const runButton = (button: FloatingToolbarButtonModel) => {
    if (isMenuButton(button.id)) {
      const menuId = button.id;
      if (menuId === "link") {
        const href = getFloatingToolbarLinkHref(editor);
        setLinkInputValue(href);
        setLinkInitialHref(href);
        setLinkSelectionRange({
          from: Math.min(editor.state.selection.from, editor.state.selection.to),
          to: Math.max(editor.state.selection.from, editor.state.selection.to),
        });
      }
      setOpenMenu((current) => (current === menuId ? null : menuId));
      return;
    }

    setOpenMenu(null);

    if (button.id === "improve") {
      runAssistantAction(editor, "rewrite-selection", onRewriteSelection);
      return;
    }

    button.run();
    editor.commands.focus();
  };

  const closeLinkPopover = () => {
    setOpenMenu(null);
    editor.commands.focus();
  };

  const restoreLinkSelection = () => {
    if (!linkSelectionRange) {
      return;
    }

    editor.commands.setTextSelection(linkSelectionRange);
  };

  const submitLinkInput = () => {
    restoreLinkSelection();
    if (!applyFloatingToolbarLink(editor, linkInputValue)) {
      return;
    }

    closeLinkPopover();
  };

  const removeLinkInput = () => {
    restoreLinkSelection();
    if (removeFloatingToolbarLink(editor)) {
      setLinkInputValue("");
      setLinkInitialHref("");
      closeLinkPopover();
      return;
    }

    if (linkInputValue.trim()) {
      setLinkInputValue("");
    }
  };

  const setAnchoredTooltip = (buttonId: FloatingToolbarButtonId | null, element?: HTMLElement | null) => {
    setTooltipButtonId(buttonId);

    if (!buttonId || !element || !toolbarContentRef.current) {
      setTooltipAnchorX(null);
      return;
    }

    const buttonRect = element.getBoundingClientRect();
    const contentRect = toolbarContentRef.current.getBoundingClientRect();
    setTooltipAnchorX(buttonRect.left + buttonRect.width / 2 - contentRect.left);
  };

  return (
    <BubbleMenu
      ref={toolbarRootRef}
      editor={editor}
      className={`markweave-floating-toolbar markweave-floating-toolbar--${toolbarState.variant} markweave-floating-toolbar--motion-${toolbarState.motionPhase}`}
      data-motion={toolbarState.motionPhase}
      data-position-strategy={floatingOptions.strategy}
      data-boundary-padding={toolbarState.boundaryPadding}
      data-testid="markweave-floating-toolbar"
      style={getToolbarStyle(toolbarState, frameShiftPx)}
      updateDelay={0}
      getReferencedVirtualElement={getReferencedVirtualElement}
      options={floatingOptions}
      shouldShow={({ editor: activeEditor }) => {
        return activeEditor.isEditable && shouldShowFloatingToolbar(createSelectionSnapshot(activeEditor));
      }}
    >
      <div ref={toolbarContentRef} className="markweave-floating-toolbar-content" data-menu={openMenu ?? "none"}>
        {visibleButtons.map((button, index) => (
          <FloatingToolbarButton
            key={button.id}
            button={button}
            expanded={openMenu === button.id}
            showDivider={index > 0 && visibleButtons[index - 1].group !== button.group}
            tooltipActive={tooltipButtonId === button.id}
            onPointerDown={preventFloatingToolbarPointerFocusLoss}
            onTooltipChange={setAnchoredTooltip}
            onRun={runButton}
          />
        ))}
        {openMenu === "block-type" ? <TurnIntoMenu editor={editor} messages={messages} onClose={() => setOpenMenu(null)} /> : null}
        {openMenu === "link" ? (
          <LinkPopover
            inputRef={linkInputRef}
            messages={messages}
            value={linkInputValue}
            canApply={Boolean(normalizedLinkInputHref)}
            canOpen={Boolean(normalizedLinkInputHref)}
            canRemove={Boolean(linkInitialHref || linkInputValue.trim())}
            onValueChange={setLinkInputValue}
            onApply={submitLinkInput}
            onOpen={() => openFloatingToolbarLinkHref(linkInputValue)}
            onRemove={removeLinkInput}
          />
        ) : null}
        {openMenu === "color" ? <ColorMenu editor={editor} messages={messages} onClose={() => setOpenMenu(null)} /> : null}
        {openMenu === "more" ? (
          <MoreMenu editor={editor} messages={messages} activeTooltipId={tooltipButtonId} onTooltipChange={setTooltipButtonId} onClose={() => setOpenMenu(null)} />
        ) : null}
        {tooltipModel && openMenu === null ? (
          <div
            className="markweave-floating-toolbar-tooltip"
            role="tooltip"
            data-testid="markweave-floating-toolbar-tooltip"
            data-button-id={tooltipModel.buttonId}
            data-active={tooltipModel.active}
            style={getToolbarTooltipStyle(tooltipAnchorX)}
          >
            {tooltipModel.label}
          </div>
        ) : null}
      </div>
    </BubbleMenu>
  );
}

function LinkPopover({
  inputRef,
  messages,
  value,
  canApply,
  canOpen,
  canRemove,
  onValueChange,
  onApply,
  onOpen,
  onRemove,
}: {
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly messages: MarkweaveMessages;
  readonly value: string;
  readonly canApply: boolean;
  readonly canOpen: boolean;
  readonly canRemove: boolean;
  readonly onValueChange: (value: string) => void;
  readonly onApply: () => void;
  readonly onOpen: () => void;
  readonly onRemove: () => void;
}) {
  const toolbarMessages = getFloatingToolbarMessageSet(messages);

  return (
    <form
      className="markweave-floating-toolbar-popover markweave-floating-toolbar-link-popover"
      data-testid="markweave-floating-toolbar-link-popover"
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
    >
      <input
        ref={inputRef}
        aria-label={toolbarMessages.linkUrlLabel}
        data-testid="markweave-floating-toolbar-link-input"
        placeholder={toolbarMessages.linkPlaceholder}
        value={value}
        onChange={(event) => onValueChange(event.currentTarget.value)}
      />
      <span className="markweave-floating-toolbar-link-actions">
        <button
          type="submit"
          aria-label={toolbarMessages.applyLink}
          data-testid="markweave-floating-toolbar-link-apply"
          disabled={!canApply}
          onMouseDown={preventFloatingToolbarPointerFocusLoss}
        >
          <Icon name="corner-down-left" />
        </button>
        <span className="markweave-floating-toolbar-link-divider" aria-hidden="true" />
        <button
          type="button"
          aria-label={toolbarMessages.openLink}
          data-testid="markweave-floating-toolbar-link-open"
          disabled={!canOpen}
          onMouseDown={preventFloatingToolbarPointerFocusLoss}
          onClick={onOpen}
        >
          <Icon name="external-link" />
        </button>
        <button
          type="button"
          aria-label={toolbarMessages.removeLink}
          data-testid="markweave-floating-toolbar-link-remove"
          disabled={!canRemove}
          onMouseDown={preventFloatingToolbarPointerFocusLoss}
          onClick={onRemove}
        >
          <Icon name="trash" />
        </button>
      </span>
    </form>
  );
}

function FloatingToolbarButton({
  button,
  expanded,
  showDivider,
  tooltipActive,
  onPointerDown,
  onTooltipChange,
  onRun,
}: {
  readonly button: FloatingToolbarButtonModel;
  readonly expanded: boolean;
  readonly showDivider: boolean;
  readonly tooltipActive: boolean;
  readonly onPointerDown: (event: Pick<Event, "preventDefault">) => void;
  readonly onTooltipChange: (buttonId: FloatingToolbarButtonId | null, element?: HTMLElement | null) => void;
  readonly onRun: (button: FloatingToolbarButtonModel) => void;
}) {
  return (
    <>
      {showDivider ? <span className="markweave-floating-toolbar-divider" aria-hidden="true" /> : null}
      <button
        type="button"
        className={`markweave-floating-toolbar-button markweave-floating-toolbar-button--${button.id}`}
        aria-label={button.label}
        aria-expanded={isMenuButton(button.id) ? expanded : undefined}
        data-active={button.active || expanded}
        data-tooltip-active={tooltipActive ? "true" : "false"}
        data-testid={`markweave-floating-toolbar-button-${button.id}`}
        onBlur={() => onTooltipChange(null)}
        onFocus={(event) => onTooltipChange(button.id, event.currentTarget)}
        onMouseDown={onPointerDown}
        onMouseEnter={(event) => onTooltipChange(button.id, event.currentTarget)}
        onMouseLeave={() => onTooltipChange(null)}
        onClick={() => onRun(button)}
      >
        <FloatingToolbarButtonIcon button={button} expanded={expanded} />
      </button>
    </>
  );
}

function FloatingToolbarButtonIcon({ button, expanded }: { readonly button: FloatingToolbarButtonModel; readonly expanded: boolean }) {
  if (button.id === "improve") {
    return (
      <span className="markweave-floating-toolbar-button-inner">
        <Icon name="sparkles" />
        <span>{button.glyph}</span>
      </span>
    );
  }

  if (button.id === "block-type") {
    return (
      <span className="markweave-floating-toolbar-button-inner">
        <span className="markweave-floating-toolbar-block-label">{button.glyph}</span>
        <Icon name={expanded ? "chevron-up" : "chevron-down"} />
      </span>
    );
  }

  if (button.id === "bold") {
    return <Icon name="bold" />;
  }

  if (button.id === "italic") {
    return <Icon name="italic" />;
  }

  if (button.id === "underline") {
    return <Icon name="underline" />;
  }

  if (button.id === "strike") {
    return <Icon name="strike" />;
  }

  if (button.id === "inline-code") {
    return <Icon name="inline-code" />;
  }

  if (button.id === "link") {
    return <Icon name="link" />;
  }

  if (button.id === "color") {
    return (
      <span className="markweave-floating-toolbar-button-inner markweave-floating-toolbar-button-inner--color">
        <span className="markweave-floating-toolbar-color-trigger">A</span>
        <Icon name={expanded ? "chevron-up" : "chevron-down"} />
      </span>
    );
  }

  return <Icon name="more" />;
}

function TurnIntoMenu({ editor, messages, onClose }: { readonly editor: Editor; readonly messages: MarkweaveMessages; readonly onClose: () => void }) {
  const toolbarMessages = getFloatingToolbarMessageSet(messages);
  const options = getFloatingToolbarTurnIntoOptions(messages);

  return (
    <div className="markweave-floating-toolbar-popover markweave-floating-toolbar-turn-menu" data-testid="markweave-floating-toolbar-turn-menu">
      <div className="markweave-floating-toolbar-menu-title">{toolbarMessages.turnIntoTitle}</div>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          data-active={isFloatingToolbarTurnIntoActive(editor, option.id)}
          data-testid={`markweave-floating-toolbar-turn-${option.id}`}
          onMouseDown={preventFloatingToolbarPointerFocusLoss}
          onClick={() => {
            setFloatingToolbarTurnInto(editor, option.id);
            onClose();
          }}
        >
          <span className="markweave-floating-toolbar-menu-icon">
            <TurnIntoIcon option={option} />
          </span>
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function TurnIntoIcon({ option }: { readonly option: FloatingToolbarTurnIntoOption }) {
  if (option.id === "paragraph") {
    return <Icon name="text" />;
  }

  if (option.glyph === "bullet-list" || option.glyph === "numbered-list" || option.glyph === "todo-list" || option.glyph === "quote" || option.glyph === "code-block") {
    return <Icon name={option.glyph} />;
  }

  return <span>{option.glyph}</span>;
}

function ColorMenu({ editor, messages, onClose }: { readonly editor: Editor; readonly messages: MarkweaveMessages; readonly onClose: () => void }) {
  const toolbarMessages = getFloatingToolbarMessageSet(messages);
  const activeTextColor = editor.getAttributes("textStyle").color as string | undefined;
  const activeHighlightColor = editor.getAttributes("highlight").color as string | undefined;

  return (
    <div className="markweave-floating-toolbar-popover markweave-floating-toolbar-color-popover" data-testid="markweave-floating-toolbar-color-menu">
      <ColorSection
        title={toolbarMessages.textColorTitle}
        mode="text"
        activeColor={activeTextColor ?? null}
        options={getFloatingToolbarTextColorOptions(messages)}
        onSelect={(color) => {
          setFloatingToolbarTextColor(editor, color);
          onClose();
        }}
      />
      <ColorSection
        title={toolbarMessages.highlightColorTitle}
        mode="highlight"
        activeColor={activeHighlightColor ?? null}
        options={getFloatingToolbarHighlightColorOptions(messages)}
        onSelect={(color) => {
          setFloatingToolbarHighlightColor(editor, color);
          onClose();
        }}
      />
    </div>
  );
}

function ColorSection({
  title,
  mode,
  activeColor,
  options,
  onSelect,
}: {
  readonly title: string;
  readonly mode: "text" | "highlight";
  readonly activeColor: string | null;
  readonly options: readonly FloatingToolbarColorOption[];
  readonly onSelect: (color: string | null) => void;
}) {
  return (
    <section className="markweave-floating-toolbar-color-section" aria-label={title}>
      <div className="markweave-floating-toolbar-menu-title">{title}</div>
      <div className="markweave-floating-toolbar-swatch-grid">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-label={option.label}
            data-active={option.value === activeColor || (option.value === null && !activeColor)}
            data-testid={`markweave-floating-toolbar-${mode}-${option.id}`}
            onMouseDown={preventFloatingToolbarPointerFocusLoss}
            onClick={() => onSelect(option.value)}
          >
            {mode === "text" ? (
              <span className="markweave-floating-toolbar-text-swatch" style={{ color: option.value ?? "#646970" }}>
                A
              </span>
            ) : (
              <span className="markweave-floating-toolbar-highlight-swatch" style={{ backgroundColor: option.value ?? "#ffffff" }} aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

function MoreMenu({
  editor,
  messages,
  activeTooltipId,
  onTooltipChange,
  onClose,
}: {
  readonly editor: Editor;
  readonly messages: MarkweaveMessages;
  readonly activeTooltipId: FloatingToolbarButtonId | FloatingToolbarMoreActionId | null;
  readonly onTooltipChange: (buttonId: FloatingToolbarButtonId | FloatingToolbarMoreActionId | null) => void;
  readonly onClose: () => void;
}) {
  const actions = getFloatingToolbarMoreActions(messages);

  return (
    <div className="markweave-floating-toolbar-popover markweave-floating-toolbar-more-menu" data-testid="markweave-floating-toolbar-more-menu">
      {actions.map((action, index) => (
        <MoreMenuButton
          key={action.id}
          action={action}
          active={isFloatingToolbarMoreActionActive(editor, action.id)}
          tooltipActive={activeTooltipId === action.id}
          showDivider={index > 0 && actions[index - 1].group !== action.group}
          onTooltipChange={onTooltipChange}
          onRun={() => {
            runFloatingToolbarMoreAction(editor, action.id);
            onClose();
          }}
        />
      ))}
    </div>
  );
}

function MoreMenuButton({
  action,
  active,
  tooltipActive,
  showDivider,
  onTooltipChange,
  onRun,
}: {
  readonly action: FloatingToolbarMoreAction;
  readonly active: boolean;
  readonly tooltipActive: boolean;
  readonly showDivider: boolean;
  readonly onTooltipChange: (buttonId: FloatingToolbarMoreActionId | null) => void;
  readonly onRun: () => void;
}) {
  return (
    <>
      {showDivider ? <span className="markweave-floating-toolbar-divider" aria-hidden="true" /> : null}
      <span className="markweave-floating-toolbar-more-item">
        <button
          type="button"
          aria-label={action.label}
          data-active={active}
          data-tooltip-active={tooltipActive ? "true" : "false"}
          data-testid={`markweave-floating-toolbar-more-${action.id}`}
          onMouseDown={preventFloatingToolbarPointerFocusLoss}
          onMouseEnter={() => onTooltipChange(action.id)}
          onMouseLeave={() => onTooltipChange(null)}
          onClick={onRun}
        >
          <MoreActionIcon id={action.id} />
        </button>
        {tooltipActive ? (
          <div className="markweave-floating-toolbar-tooltip markweave-floating-toolbar-tooltip--more" role="tooltip">
            {action.label}
          </div>
        ) : null}
      </span>
    </>
  );
}

function MoreActionIcon({ id }: { readonly id: FloatingToolbarMoreActionId }) {
  if (id === "superscript") {
    return <Icon name="superscript" />;
  }

  if (id === "subscript") {
    return <Icon name="subscript" />;
  }

  if (id === "inline-math") {
    return <Icon name="math" />;
  }

  if (id === "align-left" || id === "align-center" || id === "align-right" || id === "align-justify") {
    return <Icon name={id} />;
  }

  return <Icon name={id} />;
}

type FloatingToolbarIconName =
  | "sparkles"
  | "chevron-down"
  | "chevron-up"
  | "corner-down-left"
  | "external-link"
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "inline-code"
  | "link"
  | "more"
  | "text"
  | "bullet-list"
  | "numbered-list"
  | "todo-list"
  | "quote"
  | "code-block"
  | "superscript"
  | "subscript"
  | "math"
  | "align-left"
  | "align-center"
  | "align-right"
  | "align-justify"
  | "decrease-indent"
  | "increase-indent"
  | "trash";

const floatingToolbarIconMap: Record<FloatingToolbarIconName, LucideIcon> = {
  sparkles: Sparkles,
  "chevron-down": ChevronDown,
  "chevron-up": ChevronUp,
  "corner-down-left": CornerDownLeft,
  "external-link": ExternalLink,
  bold: Bold,
  italic: Italic,
  underline: Underline,
  strike: Strikethrough,
  "inline-code": Code2,
  link: Link2,
  more: MoreVertical,
  text: TypeIcon,
  "bullet-list": List,
  "numbered-list": ListOrdered,
  "todo-list": ListChecks,
  quote: Quote,
  "code-block": Braces,
  superscript: Superscript,
  subscript: Subscript,
  math: Sigma,
  "align-left": AlignLeft,
  "align-center": AlignCenter,
  "align-right": AlignRight,
  "align-justify": AlignJustify,
  "decrease-indent": IndentDecrease,
  "increase-indent": IndentIncrease,
  trash: Trash2,
};

function Icon({ name }: { readonly name: FloatingToolbarIconName }) {
  const Lucide = floatingToolbarIconMap[name];

  return <Lucide aria-hidden="true" absoluteStrokeWidth size={18} strokeWidth={1.6} />;
}
