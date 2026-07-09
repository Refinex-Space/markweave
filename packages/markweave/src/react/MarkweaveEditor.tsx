import type { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type HTMLAttributes, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { isEditorComposing } from "../editor-core/composition-guard";
import { createSelectionSnapshot, type EditorSelectionSnapshot } from "../editor-core/selection-state";
import { getLocalizedSlashCommandSpecs, getMarkweaveMessages, normalizeMarkweaveLang, type MarkweaveLang } from "../i18n";
import { getActiveCodeBlockState, markweaveCodeBlockBehavior, type MarkweaveCodeBlockState } from "../plugins/codeblock/codeblock-behavior";
import { normalizeMarkdownLinkHref } from "../plugins/markdown/markdown-input";
import { isMermaidInlinePreviewTransaction, setMermaidInlinePreviewEditorMode } from "../plugins/mermaid/mermaid-inline-preview";
import { getMermaidPreviewState, type MermaidPreviewMode, type MermaidPreviewState } from "../plugins/mermaid/mermaid-renderer";
import {
  getMarkweaveMathTargetAtPos,
  getMarkweaveMathTargetFromDomEvent,
  getMarkweaveMathTargetFromSelection,
  setMarkweaveMathSelectionInView,
  type MarkweaveMathTarget,
} from "../plugins/math/math-ui-model";
import { filterSlashCommands, isExecutableSlashCommand, type SlashCommandSpec } from "../plugins/slash-command/command-spec";
import { getSlashCommandKeyboardAction } from "../plugins/slash-command/slash-keyboard";
import {
  executeSlashCommand,
  getNextSlashCommandState,
  getSlashCommandAnchoredMenuPosition,
  getSlashCommandContext,
  type ExecuteSlashCommandOptions,
  type SlashCommandMenuPosition,
} from "../plugins/slash-command/slash-runtime";
import { initialSlashCommandState, reduceSlashCommandState, type SlashCommandState } from "../plugins/slash-command/slash-state";
import { getDirectUploadResult, type MarkweaveSlashCommandUploadHandler } from "../plugins/slash-command/upload";
import type { MarkweaveMenuCopyPayload } from "../plugins/table/table-clipboard";
import { getFirstTableDebugSnapshot, type TableDebugSnapshot } from "../plugins/table/table-debug-snapshot";
import { focusFirstTableBodyCell } from "../plugins/table/table-focus-position";
import { getTableFocusState, type TableFocusState } from "../plugins/table/table-focus-state";
import {
  initialTableInteractionState,
  tableInteractionPluginKey,
  type TableInteractionState,
} from "../plugins/table/table-interaction-layer";
import { CodeBlockControls } from "./ui/codeblock/CodeBlockControls";
import { FloatingToolbar } from "./ui/floating-toolbar/FloatingToolbar";
import { MathEditorPopover } from "./ui/math/MathEditorPopover";
import { SlashCommandMenu } from "./ui/slash-command/SlashCommandMenu";
import { TableControls } from "./ui/table/TableControls";
import { TableSelectionOverlay } from "./ui/table/TableSelectionOverlay";
import { MarkweaveInnerToc } from "./ui/toc/MarkweaveInnerToc";
import { normalizeMarkweaveEditorMode, setMarkweaveEditorModeState, type MarkweaveEditorMode } from "../core/editor-mode-state";
import type {
  FloatingToolbarAssistantRequest,
  MarkweaveContentFormat,
  MarkweaveContentValue,
  MarkweaveEditorRuntimeSnapshot,
  MarkweaveEditorSetContentOptions,
  MarkweaveEditorUpdatePayload,
  TableCommandResult,
  TableEditWithAiRequest,
} from "../core/public-types";
import {
  createMarkweaveTocState,
  emptyMarkweaveTocState,
  getActiveMarkweaveTocId,
  getMarkweaveTocItems,
  getValidMarkweaveTocActiveId,
  type MarkweaveTocState,
} from "../core/toc-state";
import { createMarkweaveReactEditorExtensions } from "./create-editor-extensions";

export interface MarkweaveEditorControllerActions {
  readonly closeSlashMenu: () => void;
  readonly focusFirstTableBodyCell: () => boolean;
  readonly setContent: (content: MarkweaveContentValue, options?: MarkweaveEditorSetContentOptions) => boolean;
}

export interface MarkweaveEditorOverlayProps {
  readonly floatingToolbar: ComponentProps<typeof FloatingToolbar> | null;
  readonly slashCommandMenu: ComponentProps<typeof SlashCommandMenu> | null;
  readonly tableControls: ComponentProps<typeof TableControls> | null;
  readonly tableSelectionOverlay: ComponentProps<typeof TableSelectionOverlay> | null;
  readonly codeBlockControls: ComponentProps<typeof CodeBlockControls> | null;
  readonly innerToc: ComponentProps<typeof MarkweaveInnerToc> | null;
  readonly mathEditorPopover: ComponentProps<typeof MathEditorPopover> | null;
}

export interface MarkweaveEditorFrameProps extends HTMLAttributes<HTMLElement> {
  readonly "data-testid": string;
  readonly "data-markweave-mode": MarkweaveEditorMode;
  readonly "data-markweave-inner-toc": "true" | "false";
  readonly "data-mermaid-mode": MermaidPreviewMode;
  readonly "data-table-focus-mode": TableFocusState["mode"];
}

export interface MarkweaveEditorController {
  readonly editor: Editor | null;
  readonly frameProps: MarkweaveEditorFrameProps;
  readonly overlayProps: MarkweaveEditorOverlayProps;
  readonly runtimeSnapshot: MarkweaveEditorRuntimeSnapshot;
  readonly actions: MarkweaveEditorControllerActions;
}

export interface MarkweaveEditorControllerOptions {
  readonly defaultContent?: MarkweaveContentValue;
  readonly defaultContentFormat?: MarkweaveContentFormat;
  readonly content?: MarkweaveContentValue;
  readonly contentFormat?: MarkweaveContentFormat;
  readonly editable?: boolean;
  readonly mode?: MarkweaveEditorMode;
  readonly innerToc?: boolean;
  readonly autofocus?: boolean;
  readonly lang?: MarkweaveLang;
  readonly ariaLabel?: string;
  readonly autoFocusFirstTableBodyCell?: boolean;
  readonly onUpdate?: (payload: MarkweaveEditorUpdatePayload) => void;
  readonly onEditWithAi?: (request: TableEditWithAiRequest) => void;
  readonly onRewriteSelection?: (request: FloatingToolbarAssistantRequest) => void;
  readonly onExtractToNote?: (request: FloatingToolbarAssistantRequest) => void;
  readonly onSlashCommandUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onTableCopyPayload?: (payload: MarkweaveMenuCopyPayload) => void;
  readonly onTableCommandResult?: (result: TableCommandResult) => void;
  readonly onRuntimeStateChange?: (snapshot: MarkweaveEditorRuntimeSnapshot) => void;
  readonly onTocChange?: (state: MarkweaveTocState) => void;
}

export interface MarkweaveEditorProps extends MarkweaveEditorControllerOptions {
  readonly className?: string;
}

const outsideTableFocusState: TableFocusState = {
  active: false,
  mode: "outside",
  activeCellPos: null,
  anchorCellPos: null,
  selectedCellCount: 0,
  selectionFrom: 0,
  selectionTo: 0,
};

const inactiveCodeBlockState: MarkweaveCodeBlockState = {
  active: false,
  language: markweaveCodeBlockBehavior.defaultLanguage,
  mermaidPreviewMode: "code",
  pos: null,
  text: "",
};

const hiddenMermaidPreviewState = getMermaidPreviewState({
  active: false,
  mode: "code",
  source: "",
});

function normalizeMarkweaveContentFormat(format: MarkweaveContentFormat | undefined): MarkweaveContentFormat {
  return format === "html" || format === "json" || format === "markdown" ? format : "markdown";
}

function getMarkweaveContentType(format: MarkweaveContentFormat) {
  return normalizeMarkweaveContentFormat(format);
}

function getEditorMarkdown(editor: Editor) {
  return (editor as Editor & { getMarkdown?: () => string }).getMarkdown?.() ?? editor.getText();
}

function stringifyJsonContent(content: MarkweaveContentValue) {
  return typeof content === "string" ? content : JSON.stringify(content);
}

function isEditorContentCurrent(editor: Editor, content: MarkweaveContentValue, format: MarkweaveContentFormat) {
  if (format === "html") {
    return typeof content === "string" && editor.getHTML() === content;
  }

  if (format === "json") {
    return JSON.stringify(editor.getJSON()) === stringifyJsonContent(content);
  }

  return typeof content === "string" && getEditorMarkdown(editor).trim() === content.trim();
}

function createUpdatePayload(editor: Editor): MarkweaveEditorUpdatePayload {
  return {
    editor,
    html: editor.getHTML(),
    json: editor.getJSON(),
    markdown: getEditorMarkdown(editor),
    text: editor.getText(),
  };
}

function getTableInteractionState(editor: Editor) {
  return tableInteractionPluginKey.getState(editor.state) ?? initialTableInteractionState;
}

function openReadonlyLinkFromEvent(event: MouseEvent) {
  const target = event.target;

  if (!(target instanceof Element)) {
    return false;
  }

  const anchor = target.closest<HTMLAnchorElement>("a[href]");

  if (!anchor) {
    return false;
  }

  const href = normalizeMarkdownLinkHref(anchor.getAttribute("href") ?? "");
  event.preventDefault();

  if (!href || typeof window === "undefined" || typeof window.open !== "function") {
    return true;
  }

  window.open(href, "_blank", "noopener,noreferrer");
  return true;
}

function getNearestScrollableAncestor(element: HTMLElement | null): HTMLElement | null {
  if (!element || typeof window === "undefined") {
    return null;
  }

  let current = element.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflow = `${style.overflow} ${style.overflowY}`;

    if (/(auto|scroll|overlay)/.test(overflow) && current.scrollHeight > current.clientHeight) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function requestAnimationFrameSafe(callback: FrameRequestCallback): number {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return globalThis.setTimeout(() => callback(0), 0) as unknown as number;
  }

  return window.requestAnimationFrame(callback);
}

function cancelAnimationFrameSafe(id: number) {
  if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(id);
    return;
  }

  globalThis.clearTimeout(id);
}

export function useMarkweaveEditorController({
  ariaLabel,
  autoFocusFirstTableBodyCell = false,
  autofocus = false,
  content,
  contentFormat,
  defaultContent = "",
  defaultContentFormat,
  editable = true,
  innerToc = true,
  lang,
  mode = "live",
  onEditWithAi,
  onExtractToNote,
  onRewriteSelection,
  onRuntimeStateChange,
  onSlashCommandUpload,
  onTableCommandResult,
  onTableCopyPayload,
  onTocChange,
  onUpdate,
}: MarkweaveEditorControllerOptions = {}): MarkweaveEditorController {
  const editorMode = normalizeMarkweaveEditorMode(mode);
  const effectiveEditable = editorMode === "live" && editable !== false;
  const activeContentFormat = normalizeMarkweaveContentFormat(content === undefined ? defaultContentFormat : contentFormat);
  const runtimeModeRef = useRef({ editorMode, effectiveEditable });
  runtimeModeRef.current = { editorMode, effectiveEditable };
  const langRef = useRef<MarkweaveLang | null>(null);
  if (langRef.current === null) {
    langRef.current = normalizeMarkweaveLang(lang);
  }
  const resolvedLang = langRef.current;
  const messages = useMemo(() => getMarkweaveMessages(resolvedLang), [resolvedLang]);
  const slashCommands = useMemo(() => getLocalizedSlashCommandSpecs(resolvedLang), [resolvedLang]);
  const uploadHandlerRef = useRef(onSlashCommandUpload);
  uploadHandlerRef.current = onSlashCommandUpload;
  const extensions = useMemo(
    () =>
      createMarkweaveReactEditorExtensions({
        lang: resolvedLang,
        onImageUpload: (request) => {
          if (uploadHandlerRef.current) {
            return uploadHandlerRef.current(request);
          }

          const directResult = getDirectUploadResult(request);
          if (!directResult) {
            throw new Error("File upload requires an upload handler.");
          }

          return directResult;
        },
        onVideoUpload: (request) => {
          if (uploadHandlerRef.current) {
            return uploadHandlerRef.current(request);
          }

          const directResult = getDirectUploadResult(request);
          if (!directResult) {
            throw new Error("File upload requires an upload handler.");
          }

          return directResult;
        },
      }),
    [resolvedLang],
  );
  const [selectionSnapshot, setSelectionSnapshot] = useState<EditorSelectionSnapshot | null>(null);
  const [slashState, setSlashState] = useState<SlashCommandState>(initialSlashCommandState);
  const [slashMenuPosition, setSlashMenuPosition] = useState<SlashCommandMenuPosition | null>(null);
  const [slashInputCommand, setSlashInputCommand] = useState<SlashCommandSpec | null>(null);
  const [mermaidMode, setMermaidMode] = useState<MermaidPreviewMode>("code");
  const [mathTarget, setMathTarget] = useState<MarkweaveMathTarget | null>(null);
  const [tableInteractionState, setTableInteractionState] = useState<TableInteractionState>(initialTableInteractionState);
  const [tocActiveId, setTocActiveId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const applyingControlledContentRef = useRef(false);
  const callbacksRef = useRef({ onUpdate });
  const filteredSlashCommands = useMemo(() => filterSlashCommands(slashState.query, slashCommands), [slashCommands, slashState.query]);

  callbacksRef.current = { onUpdate };

  const closeSlashMenu = useCallback(() => {
    setSlashMenuPosition(null);
    setSlashInputCommand(null);
    setSlashState(initialSlashCommandState);
  }, []);

  const syncSlashCommandStateFromView = useCallback((view: EditorView) => {
    const slashContext = getSlashCommandContext(view.state);

    if (!slashContext) {
      setSlashState((state) => (state.name === "idle" ? state : initialSlashCommandState));
      setSlashMenuPosition(null);
      setSlashInputCommand(null);
      return;
    }

    const cursorRect = view.coordsAtPos(slashContext.cursor);
    const triggerRect = view.coordsAtPos(slashContext.triggerFrom);
    const frameRect = view.dom.closest(".markweave-editor-frame")?.getBoundingClientRect();
    setSlashMenuPosition(getSlashCommandAnchoredMenuPosition(cursorRect, { frameRect, triggerRect }));
    setSlashState((state) => getNextSlashCommandState(state, slashContext));
  }, []);

  const syncSlashCommandState = useCallback((activeEditor: Editor) => syncSlashCommandStateFromView(activeEditor.view), [syncSlashCommandStateFromView]);

  const syncSelectionState = useCallback((editor: Editor) => {
    setSelectionSnapshot(createSelectionSnapshot(editor));
    const selectedMathTarget = getMarkweaveMathTargetFromSelection(editor);
    if (selectedMathTarget) {
      setMathTarget(selectedMathTarget);
    }

    const codeBlock = getActiveCodeBlockState(editor);
    if (codeBlock.active && codeBlock.language === "mermaid") {
      setMermaidMode(codeBlock.mermaidPreviewMode);
    }
  }, []);

  const syncTableInteractionState = useCallback((editor: Editor) => {
    setTableInteractionState(getTableInteractionState(editor));
  }, []);

  const editor = useEditor({
    extensions,
    content: content ?? defaultContent,
    contentType: getMarkweaveContentType(activeContentFormat),
    editable: effectiveEditable,
    autofocus,
    editorProps: {
      attributes: {
        class: "markweave-editor-surface",
        "data-testid": "markweave-editor-surface",
        autocapitalize: "off",
        autocorrect: "off",
        spellcheck: "false",
        translate: "no",
      },
      handleClick: (_view, _pos, event) => {
        if (runtimeModeRef.current.effectiveEditable) {
          return false;
        }

        return openReadonlyLinkFromEvent(event);
      },
      handleDOMEvents: {
        compositionstart: () => {
          if (!runtimeModeRef.current.effectiveEditable) {
            return false;
          }

          setSlashState((state) => reduceSlashCommandState(state, { type: "composition-start" }));
          setSlashMenuPosition(null);
          return false;
        },
        compositionend: (view) => {
          if (!runtimeModeRef.current.effectiveEditable) {
            return false;
          }

          window.setTimeout(() => syncSlashCommandStateFromView(view), 0);
          return false;
        },
        click: (view, event) => {
          if (runtimeModeRef.current.effectiveEditable) {
            const nextMathTarget = getMarkweaveMathTargetFromDomEvent(view, event);

            if (nextMathTarget) {
              event.preventDefault();
              event.stopPropagation();
              closeSlashMenu();
              setMarkweaveMathSelectionInView(view, nextMathTarget);
              setMathTarget(nextMathTarget);
              return true;
            }

            setMathTarget(null);
            return false;
          }

          return openReadonlyLinkFromEvent(event);
        },
      },
    },
    onSelectionUpdate: ({ editor: activeEditor }) => {
      syncSelectionState(activeEditor);
    },
    onCreate: ({ editor: activeEditor }) => {
      if (autoFocusFirstTableBodyCell && runtimeModeRef.current.effectiveEditable) {
        focusFirstTableBodyCell(activeEditor);
      }

      syncTableInteractionState(activeEditor);
      syncSelectionState(activeEditor);
      setRevision((current) => current + 1);
    },
    onTransaction: ({ editor: activeEditor, transaction }) => {
      syncTableInteractionState(activeEditor);
      if (transaction.docChanged || isMermaidInlinePreviewTransaction(transaction)) {
        setRevision((current) => current + 1);
      }
      if (transaction.docChanged) {
        setMathTarget((current) => {
          if (!current) {
            return null;
          }

          const nextTarget = getMarkweaveMathTargetAtPos(activeEditor, current.pos);
          return nextTarget?.kind === current.kind ? nextTarget : null;
        });
      }
    },
    onUpdate: ({ editor: activeEditor }) => {
      syncSelectionState(activeEditor);
      if (runtimeModeRef.current.effectiveEditable) {
        syncSlashCommandState(activeEditor);
      }

      if (!applyingControlledContentRef.current) {
        callbacksRef.current.onUpdate?.(createUpdatePayload(activeEditor));
      }
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(effectiveEditable);
    setMarkweaveEditorModeState(editor, { mode: editorMode, editable: effectiveEditable });
    setMermaidInlinePreviewEditorMode(editor, effectiveEditable ? "live" : "view");

    if (!effectiveEditable) {
      closeSlashMenu();
    }
  }, [closeSlashMenu, editor, editorMode, effectiveEditable]);

  useEffect(() => {
    if (!editor || content === undefined || isEditorContentCurrent(editor, content, normalizeMarkweaveContentFormat(contentFormat))) {
      return;
    }

    applyingControlledContentRef.current = true;
    editor.commands.setContent(content, { contentType: getMarkweaveContentType(normalizeMarkweaveContentFormat(contentFormat)), emitUpdate: false });
    applyingControlledContentRef.current = false;
    syncSelectionState(editor);
    if (effectiveEditable) {
      syncSlashCommandState(editor);
    }
    syncTableInteractionState(editor);
    setRevision((current) => current + 1);
  }, [content, contentFormat, effectiveEditable, editor, syncSelectionState, syncSlashCommandState, syncTableInteractionState]);

  useEffect(() => {
    if (!slashMenuPosition) {
      return undefined;
    }

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest(".markweave-slash-menu") || target.closest(".markweave-slash-trigger")) {
        return;
      }

      closeSlashMenu();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
  }, [closeSlashMenu, slashMenuPosition]);

  const codeBlockState = useMemo(() => (editor ? getActiveCodeBlockState(editor) : inactiveCodeBlockState), [editor, revision, selectionSnapshot]);
  const tableFocusState = useMemo(() => (editor ? getTableFocusState(editor.state) : outsideTableFocusState), [editor, revision, selectionSnapshot, tableInteractionState]);
  const isCodeBlockActive = selectionSnapshot?.currentNode === "codeBlock";
  const isMermaidActive = isCodeBlockActive && codeBlockState.language === "mermaid";
  const mermaidPreviewState = useMemo(
    () => (editor ? getMermaidPreviewState({ active: isMermaidActive, mode: mermaidMode, source: codeBlockState.text }) : hiddenMermaidPreviewState),
    [codeBlockState.text, editor, isMermaidActive, mermaidMode],
  );
  const tableDebugSnapshot = useMemo(() => (editor ? getFirstTableDebugSnapshot(editor.state) : null), [editor, revision]);
  const tocItems = useMemo(() => (editor ? getMarkweaveTocItems(editor.state.doc) : emptyMarkweaveTocState.items), [editor, revision]);
  const normalizedTocActiveId = useMemo(() => getValidMarkweaveTocActiveId(tocItems, tocActiveId), [tocActiveId, tocItems]);
  const tocState = useMemo(() => createMarkweaveTocState(tocItems, normalizedTocActiveId), [normalizedTocActiveId, tocItems]);

  const updateTocActiveFromScroll = useCallback(() => {
    if (!editor || !tocItems.length) {
      setTocActiveId(null);
      return;
    }

    const nextActiveId = getActiveMarkweaveTocId(editor, tocItems);
    setTocActiveId((current) => (current === nextActiveId ? current : nextActiveId));
  }, [editor, tocItems]);

  useEffect(() => {
    setTocActiveId((current) => {
      const nextActiveId = getValidMarkweaveTocActiveId(tocItems, current);
      return current === nextActiveId ? current : nextActiveId;
    });
  }, [tocItems]);

  useEffect(() => {
    if (!editor || !tocItems.length || typeof window === "undefined") {
      return undefined;
    }

    let frameId: number | null = null;
    const scheduleUpdate = () => {
      if (frameId !== null) {
        cancelAnimationFrameSafe(frameId);
      }

      frameId = requestAnimationFrameSafe(() => {
        frameId = null;
        updateTocActiveFromScroll();
      });
    };
    const scrollTarget = getNearestScrollableAncestor(editor.view.dom);

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    scrollTarget?.addEventListener("scroll", scheduleUpdate, { passive: true });
    scheduleUpdate();

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      scrollTarget?.removeEventListener("scroll", scheduleUpdate);
      if (frameId !== null) {
        cancelAnimationFrameSafe(frameId);
      }
    };
  }, [editor, tocItems.length, updateTocActiveFromScroll]);

  const runtimeSnapshot = useMemo<MarkweaveEditorRuntimeSnapshot>(
    () => ({
      revision,
      mode: editorMode,
      editable: effectiveEditable,
      toc: tocState,
      selection: selectionSnapshot,
      slash: slashState,
      table: tableFocusState,
      tableInteraction: tableInteractionState,
      codeBlock: codeBlockState,
      mermaid: mermaidPreviewState,
      tableDebugSnapshot,
    }),
    [
      codeBlockState,
      editorMode,
      effectiveEditable,
      mermaidPreviewState,
      revision,
      selectionSnapshot,
      slashState,
      tableDebugSnapshot,
      tableFocusState,
      tableInteractionState,
      tocState,
    ],
  );

  useEffect(() => {
    onRuntimeStateChange?.(runtimeSnapshot);
  }, [onRuntimeStateChange, runtimeSnapshot]);

  useEffect(() => {
    onTocChange?.(tocState);
  }, [onTocChange, tocState]);

  const runSlashCommand = useCallback(
    (command: SlashCommandSpec, options?: ExecuteSlashCommandOptions) => {
      if (!editor || !effectiveEditable) {
        return;
      }

      if (!isExecutableSlashCommand(command)) {
        return;
      }

      if (command.inputKind && !options?.emoji && !options?.uploadResult) {
        setSlashInputCommand(command);
        return;
      }

      executeSlashCommand(editor, slashState, command, options);
      setSlashState((state) => reduceSlashCommandState(state, { type: "execute" }));
      closeSlashMenu();
    },
    [closeSlashMenu, effectiveEditable, editor, slashState],
  );

  const setSlashActiveIndex = useCallback(
    (index: number) => {
      setSlashState((state) =>
        reduceSlashCommandState(state, {
          type: "set-active",
          index,
          optionCount: filteredSlashCommands.length,
        }),
      );
    },
    [filteredSlashCommands.length],
  );

  const handleEditorKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (!editor || slashInputCommand || !effectiveEditable) {
        return;
      }

      const action = getSlashCommandKeyboardAction(slashState, filteredSlashCommands, event.key, {
        isComposing: event.nativeEvent.isComposing || isEditorComposing(editor.state),
      });

      if (action.type === "ignore") {
        return;
      }

      if (action.type === "close") {
        event.preventDefault();
        setSlashState((state) => reduceSlashCommandState(state, { type: "escape" }));
        closeSlashMenu();
        return;
      }

      if (action.type === "move-active") {
        event.preventDefault();
        setSlashState((state) =>
          reduceSlashCommandState(state, {
            type: "move-active",
            delta: action.delta,
            optionCount: action.optionCount,
          }),
        );
        return;
      }

      if (action.type === "execute-active") {
        event.preventDefault();
        runSlashCommand(action.command);
      }
    },
    [closeSlashMenu, effectiveEditable, editor, filteredSlashCommands, runSlashCommand, slashInputCommand, slashState],
  );

  const actions = useMemo<MarkweaveEditorControllerActions>(
    () => ({
      closeSlashMenu,
      focusFirstTableBodyCell: () => (editor ? focusFirstTableBodyCell(editor) : false),
      setContent: (nextContent, options = {}) => {
        if (!editor) {
          return false;
        }

        const nextFormat = normalizeMarkweaveContentFormat(options.format);
        editor.commands.setContent(nextContent, { contentType: getMarkweaveContentType(nextFormat), emitUpdate: options.emitUpdate ?? false });
        if (options.focusFirstTableBodyCell) {
          focusFirstTableBodyCell(editor);
        }
        syncSelectionState(editor);
        if (effectiveEditable) {
          syncSlashCommandState(editor);
        }
        syncTableInteractionState(editor);
        setRevision((current) => current + 1);
        return true;
      },
    }),
    [closeSlashMenu, effectiveEditable, editor, syncSelectionState, syncSlashCommandState, syncTableInteractionState],
  );

  const frameProps = useMemo<MarkweaveEditorFrameProps>(
    () => ({
      className: "markweave-editor-frame",
      "aria-label": ariaLabel ?? messages.common.editorAriaLabel,
      "data-testid": "markweave-editor-frame",
      "data-markweave-mode": editorMode,
      "data-markweave-inner-toc": innerToc ? "true" : "false",
      "data-mermaid-mode": mermaidPreviewState.mode,
      "data-table-focus-mode": tableFocusState.mode,
      onKeyDownCapture: handleEditorKeyDown,
    }),
    [ariaLabel, editorMode, handleEditorKeyDown, innerToc, mermaidPreviewState.mode, messages.common.editorAriaLabel, tableFocusState.mode],
  );

  const overlayProps = useMemo<MarkweaveEditorOverlayProps>(
    () => ({
      floatingToolbar: editor && effectiveEditable
        ? {
            editor,
            messages,
            selectionSnapshot,
            onRewriteSelection,
            onExtractToNote,
          }
        : null,
      slashCommandMenu: editor && effectiveEditable
        ? {
            commands: filteredSlashCommands,
            state: slashState,
            position: slashMenuPosition,
            inputCommand: slashInputCommand,
            messages,
            onActiveIndexChange: setSlashActiveIndex,
            onInputCommandChange: setSlashInputCommand,
            onSelect: runSlashCommand,
            onUpload: onSlashCommandUpload,
          }
        : null,
      tableControls: editor && effectiveEditable
        ? {
            editor,
            active: tableFocusState.active,
            interactionState: tableInteractionState,
            messages,
            onCopyPayload: onTableCopyPayload,
            onCommandResult: onTableCommandResult,
            onEditWithAi,
          }
        : null,
      tableSelectionOverlay: editor && effectiveEditable
        ? {
            editor,
            focusState: tableFocusState,
          }
        : null,
      codeBlockControls: editor
        ? {
            editor,
            active: effectiveEditable && isCodeBlockActive,
            mermaidMode,
            onMermaidModeChange: setMermaidMode,
            readOnly: !effectiveEditable,
          }
        : null,
      innerToc: editor && innerToc && tocState.items.length
        ? {
            editor,
            editable: effectiveEditable,
            messages,
            state: tocState,
          }
        : null,
      mathEditorPopover: editor && effectiveEditable && mathTarget
        ? {
            editor,
            messages,
            target: mathTarget,
            onClose: () => setMathTarget(null),
          }
        : null,
    }),
    [
      effectiveEditable,
      editor,
      filteredSlashCommands,
      innerToc,
      isCodeBlockActive,
      mermaidMode,
      messages,
      mathTarget,
      onEditWithAi,
      onExtractToNote,
      onRewriteSelection,
      onSlashCommandUpload,
      onTableCommandResult,
      onTableCopyPayload,
      runSlashCommand,
      selectionSnapshot,
      setSlashActiveIndex,
      slashInputCommand,
      slashMenuPosition,
      slashState,
      tableFocusState,
      tableInteractionState,
      tocState,
    ],
  );

  return {
    editor,
    frameProps,
    overlayProps,
    runtimeSnapshot,
    actions,
  };
}

export function MarkweaveEditor({ className, ...controllerOptions }: MarkweaveEditorProps) {
  const controller = useMarkweaveEditorController(controllerOptions);

  if (!controller.editor) {
    return null;
  }

  const frameClassName = [controller.frameProps.className, className].filter(Boolean).join(" ");

  return (
    <section {...controller.frameProps} className={frameClassName}>
      {controller.overlayProps.floatingToolbar ? <FloatingToolbar {...controller.overlayProps.floatingToolbar} /> : null}
      {controller.overlayProps.slashCommandMenu ? <SlashCommandMenu {...controller.overlayProps.slashCommandMenu} /> : null}
      {controller.overlayProps.tableControls ? <TableControls {...controller.overlayProps.tableControls} /> : null}
      {controller.overlayProps.tableSelectionOverlay ? <TableSelectionOverlay {...controller.overlayProps.tableSelectionOverlay} /> : null}
      {controller.overlayProps.codeBlockControls ? <CodeBlockControls {...controller.overlayProps.codeBlockControls} /> : null}
      {controller.overlayProps.innerToc ? <MarkweaveInnerToc {...controller.overlayProps.innerToc} /> : null}
      {controller.overlayProps.mathEditorPopover ? <MathEditorPopover {...controller.overlayProps.mathEditorPopover} /> : null}
      <EditorContent editor={controller.editor} />
    </section>
  );
}
