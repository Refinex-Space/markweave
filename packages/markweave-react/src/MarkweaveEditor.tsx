import type { AnyExtension } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type HTMLAttributes, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { isEditorComposing } from "markweave/internal/editor-core/composition-guard";
import { createMarkweaveFrameScheduler } from "markweave/internal/editor-core/frame-scheduler";
import {
  createMarkweaveEditorUpdatePayload,
  getMarkweaveContentType,
  isMarkweaveControlledContentEchoCurrent,
  isEditorContentCurrent,
  normalizeMarkweaveContentFormat,
  type MarkweaveControlledContentEcho,
} from "markweave/internal/editor-core/editor-content";
import { openMarkweaveReadonlyLinkFromEvent } from "markweave/internal/editor-core/readonly-link";
import { createMarkweaveEditorRuntimeSnapshot } from "markweave/internal/editor-core/runtime-snapshot";
import {
  areEditorSelectionSnapshotsEquivalent,
  createSelectionSnapshot,
  markweaveRuntimeProjectionDelayMs,
  type EditorSelectionSnapshot,
} from "markweave/internal/editor-core/selection-state";
import { getMarkweaveMessages, normalizeMarkweaveLang, type MarkweaveLang } from "markweave/internal/i18n";
import { getActiveCodeBlockState, markweaveCodeBlockBehavior, type MarkweaveCodeBlockState } from "markweave/internal/plugins/codeblock/codeblock-behavior";
import { isMermaidInlinePreviewTransaction, setMarkweaveMermaidTheme, setMermaidInlinePreviewEditorMode } from "markweave/internal/plugins/mermaid/mermaid-inline-preview";
import { getMermaidPreviewState, type MermaidPreviewMode, type MermaidPreviewState } from "markweave/internal/plugins/mermaid/mermaid-renderer";
import {
  getMarkweaveMathTargetAtPos,
  getMarkweaveMathTargetFromDomEvent,
  getMarkweaveMathTargetFromSelection,
  setMarkweaveMathEditingDomState,
  setMarkweaveMathEditingDomStateInView,
  setMarkweaveMathSelectionInView,
  type MarkweaveMathTarget,
} from "markweave/internal/plugins/math/math-ui-model";
import { createResolvedSlashCommandSpecs, filterSlashCommands, isExecutableSlashCommand, type SlashCommandSpec } from "markweave/internal/plugins/slash-command/command-spec";
import { getSlashCommandKeyboardAction } from "markweave/internal/plugins/slash-command/slash-keyboard";
import {
  areSlashCommandMenuPositionsEquivalent,
  getNextSlashCommandState,
  getSlashCommandAnchoredMenuPosition,
  getSlashCommandContext,
  isMarkweaveSlashMenuScrollTarget,
  isSlashCommandAnchorVisible,
  type ExecuteSlashCommandOptions,
  type SlashCommandMenuPosition,
} from "markweave/internal/plugins/slash-command/slash-runtime";
import {
  createMarkweaveCommandController,
  executeMarkweaveSlashCommand,
  setMarkweaveCommandContentFormat,
  setMarkweaveCommandRegistry,
} from "markweave/internal/commands/command-runtime";
import { createMarkweaveCommandRegistry } from "markweave/internal/commands/command-registry";
import type {
  MarkweaveBuiltinCommandsConfig,
  MarkweaveCommandController,
  MarkweaveCommandErrorHandler,
  MarkweaveCommandGroupSpec,
  MarkweaveCommandSpec,
} from "markweave/internal/commands/command-types";
import { initialSlashCommandState, reduceSlashCommandState, type SlashCommandState } from "markweave/internal/plugins/slash-command/slash-state";
import { getDirectUploadResult, type MarkweaveSlashCommandUploadHandler } from "markweave/internal/plugins/slash-command/upload";
import type { MarkweaveAttachmentDownloadHandler } from "markweave/internal/plugins/media/attachment-download";
import type { MarkweaveMenuCopyPayload } from "markweave/internal/plugins/table/table-clipboard";
import { getFirstTableDebugSnapshot, type TableDebugSnapshot } from "markweave/internal/plugins/table/table-debug-snapshot";
import { focusFirstTableBodyCell } from "markweave/internal/plugins/table/table-focus-position";
import { getTableFocusState, type TableFocusState } from "markweave/internal/plugins/table/table-focus-state";
import {
  initialTableInteractionState,
  tableInteractionPluginKey,
  type TableInteractionState,
} from "markweave/internal/plugins/table/table-interaction-layer";
import { CodeBlockControls } from "./ui/codeblock/CodeBlockControls";
import { FloatingToolbar } from "./ui/floating-toolbar/FloatingToolbar";
import { MathEditorPopover } from "./ui/math/MathEditorPopover";
import { SlashCommandMenu } from "./ui/slash-command/SlashCommandMenu";
import { TableControls } from "./ui/table/TableControls";
import { TableSelectionOverlay } from "./ui/table/TableSelectionOverlay";
import { MarkweaveInnerToc } from "./ui/toc/MarkweaveInnerToc";
import { normalizeMarkweaveEditorMode, setMarkweaveEditorModeState, type MarkweaveEditorMode } from "markweave/internal/core/editor-mode-state";
import { normalizeMarkweaveCanvasColor, normalizeMarkweaveTheme, type MarkweaveTheme } from "markweave/internal/core/theme";
import type {
  FloatingToolbarAssistantRequest,
  MarkweaveAiEditController,
  MarkweaveAskAiConfig,
  MarkweaveContentFormat,
  MarkweaveContentValue,
  MarkweaveEditorRuntimeSnapshot,
  MarkweaveEditorSetContentOptions,
  MarkweaveEditorUpdatePayload,
  TableCommandResult,
  TableEditWithAiRequest,
} from "markweave/internal/core/public-types";
import {
  createMarkweaveTocState,
  emptyMarkweaveTocState,
  getActiveMarkweaveTocId,
  getMarkweaveTocItemsFromState,
  getValidMarkweaveTocActiveId,
  normalizeMarkweaveInnerTocPlacement,
  type MarkweaveInnerTocPlacement,
  type MarkweaveTocState,
} from "markweave/internal/core/toc-state";
import { createMarkweaveReactEditorExtensions } from "./create-editor-extensions";
import type { MarkweaveLinkCardResolver } from "markweave/internal/plugins/link-card/link-card";
import type { MarkweaveMediaSourceResolver } from "markweave/internal/plugins/media/media-source";
import { splitMarkweaveLargeMarkdown } from "markweave/internal/core/large-document";
import {
  createMarkweaveSearchController,
  type MarkweaveSearchController,
} from "markweave/internal/plugins/search/search-controller";
import { createMarkweaveAiEditController } from "markweave/internal/plugins/ai-edit/ai-edit-controller";

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
  readonly "data-markweave-theme": MarkweaveTheme;
  readonly "data-markweave-inner-toc": "true" | "false";
  readonly "data-markweave-inner-toc-placement": MarkweaveInnerTocPlacement;
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
  readonly theme?: MarkweaveTheme;
  /** Overrides the editor canvas only; omit to retain the light/dark theme default. */
  readonly canvasColor?: string;
  readonly innerToc?: boolean;
  readonly innerTocPlacement?: MarkweaveInnerTocPlacement;
  readonly autofocus?: boolean;
  readonly lang?: MarkweaveLang;
  readonly ariaLabel?: string;
  readonly autoFocusFirstTableBodyCell?: boolean;
  readonly onUpdate?: (payload: MarkweaveEditorUpdatePayload) => void;
  /** @deprecated Compatibility callback for table AI actions; Ask AI v1 does not replace it. */
  readonly onEditWithAi?: (request: TableEditWithAiRequest) => void;
  readonly askAi?: MarkweaveAskAiConfig;
  /** @deprecated Use `askAi` for new text-selection AI integrations. */
  readonly onRewriteSelection?: (request: FloatingToolbarAssistantRequest) => void;
  /** @deprecated Compatibility callback retained for existing integrations. */
  readonly onExtractToNote?: (request: FloatingToolbarAssistantRequest) => void;
  readonly onSlashCommandUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onAttachmentDownload?: MarkweaveAttachmentDownloadHandler;
  readonly onTableCopyPayload?: (payload: MarkweaveMenuCopyPayload) => void;
  readonly onTableCommandResult?: (result: TableCommandResult) => void;
  readonly onRuntimeStateChange?: (snapshot: MarkweaveEditorRuntimeSnapshot) => void;
  readonly onAiEditControllerChange?: (controller: MarkweaveAiEditController | null) => void;
  readonly onSearchControllerChange?: (controller: MarkweaveSearchController | null) => void;
  readonly commandGroups?: readonly MarkweaveCommandGroupSpec[];
  readonly commands?: readonly MarkweaveCommandSpec[];
  readonly builtinCommands?: MarkweaveBuiltinCommandsConfig;
  readonly editorExtensions?: readonly AnyExtension[];
  readonly onCommandControllerChange?: (controller: MarkweaveCommandController | null) => void;
  readonly onCommandError?: MarkweaveCommandErrorHandler;
  readonly onTocChange?: (state: MarkweaveTocState) => void;
  readonly linkCardResolver?: MarkweaveLinkCardResolver;
  readonly resolveMediaSource?: MarkweaveMediaSourceResolver;
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

function getTableInteractionState(editor: Editor) {
  return tableInteractionPluginKey.getState(editor.state) ?? initialTableInteractionState;
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

function areSlashCommandSpecsEquivalent(left: readonly SlashCommandSpec[], right: readonly SlashCommandSpec[]) {
  return left.length === right.length && left.every((command, index) => {
    const candidate = right[index];
    return candidate
      && command.id === candidate.id
      && command.label === candidate.label
      && command.description === candidate.description
      && command.group === candidate.group
      && command.disabled === candidate.disabled
      && command.disabledReason === candidate.disabledReason
      && JSON.stringify(command.icon) === JSON.stringify(candidate.icon);
  });
}

export function useMarkweaveEditorController({
  askAi,
  ariaLabel,
  autoFocusFirstTableBodyCell = false,
  autofocus = false,
  content,
  contentFormat,
  defaultContent = "",
  defaultContentFormat,
  editable = true,
  innerToc = true,
  innerTocPlacement,
  lang,
  mode = "live",
  theme,
  canvasColor,
  onEditWithAi,
  onExtractToNote,
  onRewriteSelection,
  onAiEditControllerChange,
  onRuntimeStateChange,
  onSearchControllerChange,
  commandGroups,
  commands,
  builtinCommands,
  editorExtensions,
  onCommandControllerChange,
  onCommandError,
  onSlashCommandUpload,
  onAttachmentDownload,
  onTableCommandResult,
  onTableCopyPayload,
  onTocChange,
  onUpdate,
  linkCardResolver,
  resolveMediaSource,
}: MarkweaveEditorControllerOptions = {}): MarkweaveEditorController {
  const editorMode = normalizeMarkweaveEditorMode(mode);
  const resolvedTheme = normalizeMarkweaveTheme(theme);
  const resolvedCanvasColor = normalizeMarkweaveCanvasColor(canvasColor);
  const resolvedInnerTocPlacement = normalizeMarkweaveInnerTocPlacement(innerTocPlacement);
  const effectiveEditable = editorMode === "live" && editable !== false;
  const activeContentFormat = normalizeMarkweaveContentFormat(content === undefined ? defaultContentFormat : contentFormat);
  const initialContent = content ?? defaultContent;
  const largeDocument =
    typeof initialContent === "string" && initialContent.length >= 200_000;
  const progressivelyLoadLargeDocument =
    content === undefined &&
    activeContentFormat === "markdown" &&
    largeDocument &&
    typeof initialContent === "string";
  const progressiveMarkdownRef = useRef(
    progressivelyLoadLargeDocument ? initialContent : null,
  );
  const [largeDocumentLoading, setLargeDocumentLoading] = useState(
    progressivelyLoadLargeDocument,
  );
  const runtimeModeRef = useRef({ editorMode, effectiveEditable });
  runtimeModeRef.current = { editorMode, effectiveEditable };
  const langRef = useRef<MarkweaveLang | null>(null);
  if (langRef.current === null) {
    langRef.current = normalizeMarkweaveLang(lang);
  }
  const resolvedLang = langRef.current;
  const messages = useMemo(() => getMarkweaveMessages(resolvedLang), [resolvedLang]);
  const commandRegistry = useMemo(() => createMarkweaveCommandRegistry({
    lang: resolvedLang,
    commandGroups,
    commands,
    builtinCommands,
  }), [builtinCommands, commandGroups, commands, resolvedLang]);
  const editorExtensionsRef = useRef(editorExtensions);
  const uploadHandlerRef = useRef(onSlashCommandUpload);
  uploadHandlerRef.current = onSlashCommandUpload;
  const attachmentDownloadHandlerRef = useRef(onAttachmentDownload);
  attachmentDownloadHandlerRef.current = onAttachmentDownload;
  const searchControllerChangeRef = useRef(onSearchControllerChange);
  searchControllerChangeRef.current = onSearchControllerChange;
  const aiEditControllerChangeRef = useRef(onAiEditControllerChange);
  aiEditControllerChangeRef.current = onAiEditControllerChange;
  const commandControllerChangeRef = useRef(onCommandControllerChange);
  commandControllerChangeRef.current = onCommandControllerChange;
  const commandErrorRef = useRef(onCommandError);
  commandErrorRef.current = onCommandError;
  const linkCardResolverRef = useRef(linkCardResolver);
  linkCardResolverRef.current = linkCardResolver;
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
        onAttachmentUpload: (request) => {
          if (uploadHandlerRef.current) {
            return uploadHandlerRef.current(request);
          }

          const directResult = getDirectUploadResult(request);
          if (!directResult) {
            throw new Error("File upload requires an upload handler.");
          }

          return directResult;
        },
        onAttachmentDownload: (attachment, context) => attachmentDownloadHandlerRef.current?.(attachment, context),
        linkCardResolver: (request) => linkCardResolverRef.current?.(request) ?? Promise.resolve(null),
        resolveMediaSource,
        editorExtensions: editorExtensionsRef.current,
      }),
    [resolveMediaSource, resolvedLang],
  );
  const [selectionSnapshot, setSelectionSnapshot] = useState<EditorSelectionSnapshot | null>(null);
  const [slashState, setSlashState] = useState<SlashCommandState>(initialSlashCommandState);
  const [slashMenuPosition, setSlashMenuPosition] = useState<SlashCommandMenuPosition | null>(null);
  const [slashInputCommand, setSlashInputCommand] = useState<SlashCommandSpec | null>(null);
  const [slashCommands, setSlashCommands] = useState<readonly SlashCommandSpec[]>(
    () => createResolvedSlashCommandSpecs(commandRegistry.commands, resolvedLang),
  );
  const [slashCommandError, setSlashCommandError] = useState<string | null>(null);
  const [mermaidMode, setMermaidMode] = useState<MermaidPreviewMode>("code");
  const [mathTarget, setMathTarget] = useState<MarkweaveMathTarget | null>(null);
  const [tableInteractionState, setTableInteractionState] = useState<TableInteractionState>(initialTableInteractionState);
  const [tocActiveId, setTocActiveId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const applyingControlledContentRef = useRef(false);
  const controlledContentRef = useRef({ content, format: activeContentFormat });
  const controlledContentEchoRef = useRef<MarkweaveControlledContentEcho | null>(null);
  const projectionTimerRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onUpdate });
  const filteredSlashCommands = useMemo(() => filterSlashCommands(slashState.query, slashCommands), [slashCommands, slashState.query]);

  callbacksRef.current = { onUpdate };
  controlledContentRef.current = { content, format: activeContentFormat };

  const flushRuntimeProjection = useCallback(() => {
    if (projectionTimerRef.current !== null) {
      window.clearTimeout(projectionTimerRef.current);
      projectionTimerRef.current = null;
    }
    setRevision((current) => current + 1);
  }, []);

  const scheduleRuntimeProjection = useCallback(() => {
    if (projectionTimerRef.current !== null) {
      window.clearTimeout(projectionTimerRef.current);
    }
    projectionTimerRef.current = window.setTimeout(() => {
      projectionTimerRef.current = null;
      setRevision((current) => current + 1);
    }, markweaveRuntimeProjectionDelayMs);
  }, []);

  useEffect(() => () => {
    if (projectionTimerRef.current !== null) {
      window.clearTimeout(projectionTimerRef.current);
    }
  }, []);

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
    if (!isSlashCommandAnchorVisible(triggerRect, { frameRect })) {
      setSlashMenuPosition(null);
      setSlashInputCommand(null);
      setSlashState(initialSlashCommandState);
      return;
    }

    const nextPosition = getSlashCommandAnchoredMenuPosition(cursorRect, { frameRect, triggerRect });
    setSlashMenuPosition((current) => (areSlashCommandMenuPositionsEquivalent(current, nextPosition) ? current : nextPosition));
    setSlashState((state) => getNextSlashCommandState(state, slashContext));
  }, []);

  const syncSlashCommandState = useCallback((activeEditor: Editor) => syncSlashCommandStateFromView(activeEditor.view), [syncSlashCommandStateFromView]);

  const syncSelectionState = useCallback((editor: Editor) => {
    const nextSnapshot = createSelectionSnapshot(editor);
    setSelectionSnapshot((current) => (areEditorSelectionSnapshotsEquivalent(current, nextSnapshot) ? current : nextSnapshot));
    const selectedMathTarget = getMarkweaveMathTargetFromSelection(editor);
    if (selectedMathTarget) {
      setMarkweaveMathEditingDomState(editor, selectedMathTarget, true);
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
    shouldRerenderOnTransaction: false,
    extensions,
    content: progressivelyLoadLargeDocument ? "" : initialContent,
    contentType: getMarkweaveContentType(activeContentFormat),
    editable: effectiveEditable,
    autofocus,
    editorProps: {
      attributes: {
        class: "markweave-editor-surface",
        "data-testid": "markweave-editor-surface",
        "data-markweave-large-document": largeDocument ? "true" : "false",
        autocapitalize: "off",
        autocorrect: "off",
        spellcheck: "false",
        translate: "no",
      },
      handleClick: (_view, _pos, event) => {
        if (runtimeModeRef.current.effectiveEditable) {
          return false;
        }

        return openMarkweaveReadonlyLinkFromEvent(event);
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
              setMarkweaveMathEditingDomStateInView(view, nextMathTarget, true);
              setMarkweaveMathSelectionInView(view, nextMathTarget);
              setMathTarget(nextMathTarget);
              return true;
            }

            setMathTarget(null);
            return false;
          }

          return openMarkweaveReadonlyLinkFromEvent(event);
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
      flushRuntimeProjection();
    },
    onTransaction: ({ editor: activeEditor, transaction }) => {
      syncTableInteractionState(activeEditor);
      if (transaction.docChanged || isMermaidInlinePreviewTransaction(transaction)) {
        scheduleRuntimeProjection();
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
        callbacksRef.current.onUpdate?.(createMarkweaveEditorUpdatePayload(activeEditor, {
          onContentRead: (kind, value) => {
            const controlled = controlledContentRef.current;
            if (controlled.content !== undefined && kind === controlled.format) {
              controlledContentEchoRef.current = { content: value, format: kind, doc: activeEditor.state.doc };
            }
          },
        }));
      }
    },
  });

  useEffect(() => {
    const markdown = progressiveMarkdownRef.current;
    if (!editor || !markdown) {
      return;
    }

    let cancelled = false;
    void (async () => {
      applyingControlledContentRef.current = true;
      try {
        let firstChunk = true;
        for (const chunk of splitMarkweaveLargeMarkdown(markdown)) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
          if (cancelled) {
            return;
          }
          const parsed = editor.markdown?.parse(chunk);
          if (!parsed) {
            throw new Error("Markdown parser is unavailable.");
          }
          const fragment = editor.schema.nodeFromJSON(parsed).content;
          const transaction = firstChunk
            ? editor.state.tr.replaceWith(
                0,
                editor.state.doc.content.size,
                fragment,
              )
            : editor.state.tr.insert(editor.state.doc.content.size, fragment);
          editor.view.dispatch(transaction.setMeta("addToHistory", false));
          firstChunk = false;
        }
        if (cancelled) {
          return;
        }

        syncSelectionState(editor);
        syncTableInteractionState(editor);
        flushRuntimeProjection();
        progressiveMarkdownRef.current = null;
        setLargeDocumentLoading(false);
      } finally {
        applyingControlledContentRef.current = false;
      }
    })().catch(() => {
      if (cancelled) {
        return;
      }
      editor.commands.setContent(markdown, {
        contentType: "markdown",
        emitUpdate: false,
      });
      progressiveMarkdownRef.current = null;
      setLargeDocumentLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [editor, flushRuntimeProjection, syncSelectionState, syncTableInteractionState]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    searchControllerChangeRef.current?.(createMarkweaveSearchController(editor));

    return () => {
      searchControllerChangeRef.current?.(null);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    commandControllerChangeRef.current?.(createMarkweaveCommandController(editor));
    return () => commandControllerChangeRef.current?.(null);
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      const nextCommands = createResolvedSlashCommandSpecs(commandRegistry.commands, resolvedLang);
      setSlashCommands((current) => areSlashCommandSpecsEquivalent(current, nextCommands) ? current : nextCommands);
      return;
    }

    setMarkweaveCommandRegistry(editor, commandRegistry, (error) => {
      setSlashCommandError(error.message);
      commandErrorRef.current?.(error);
    });
    setMarkweaveCommandContentFormat(editor, activeContentFormat);
  }, [activeContentFormat, commandRegistry, editor, resolvedLang]);

  useEffect(() => {
    if (!editor) return;
    const resolved = createMarkweaveCommandController(editor).getCommands({
      surface: "slash",
      query: slashState.query,
    });
    const nextCommands = createResolvedSlashCommandSpecs(resolved, resolvedLang);
    setSlashCommands((current) => areSlashCommandSpecsEquivalent(current, nextCommands) ? current : nextCommands);
  }, [commandRegistry, editor, effectiveEditable, resolvedLang, revision, selectionSnapshot, slashState.query]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    aiEditControllerChangeRef.current?.(createMarkweaveAiEditController(editor));

    return () => {
      aiEditControllerChangeRef.current?.(null);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const editableNow = effectiveEditable && !largeDocumentLoading;
    editor.setEditable(editableNow);
    setMarkweaveEditorModeState(editor, { mode: editorMode, editable: editableNow });
    setMermaidInlinePreviewEditorMode(editor, editableNow ? "live" : "view");
    flushRuntimeProjection();

    if (!effectiveEditable) {
      closeSlashMenu();
    }
  }, [closeSlashMenu, editor, editorMode, effectiveEditable, flushRuntimeProjection, largeDocumentLoading]);

  useEffect(() => {
    if (editor) {
      setMarkweaveMermaidTheme(editor, resolvedTheme);
    }
  }, [editor, resolvedTheme]);

  useEffect(() => {
    const normalizedContentFormat = normalizeMarkweaveContentFormat(contentFormat);
    if (!editor || content === undefined) {
      return;
    }

    if (isMarkweaveControlledContentEchoCurrent(editor, controlledContentEchoRef.current, content, normalizedContentFormat)) {
      controlledContentEchoRef.current = null;
      return;
    }

    controlledContentEchoRef.current = null;
    if (isEditorContentCurrent(editor, content, normalizedContentFormat)) {
      return;
    }

    applyingControlledContentRef.current = true;
    editor.commands.setContent(content, { contentType: getMarkweaveContentType(normalizedContentFormat), emitUpdate: false });
    applyingControlledContentRef.current = false;
    syncSelectionState(editor);
    if (effectiveEditable) {
      syncSlashCommandState(editor);
    }
    syncTableInteractionState(editor);
    flushRuntimeProjection();
  }, [content, contentFormat, effectiveEditable, editor, flushRuntimeProjection, syncSelectionState, syncSlashCommandState, syncTableInteractionState]);

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

  const slashMenuOpen = slashMenuPosition !== null;
  useEffect(() => {
    if (!editor || !slashMenuOpen) {
      return undefined;
    }

    const slashMenuPositionScheduler = createMarkweaveFrameScheduler(() => {
      if (!editor.isDestroyed) {
        syncSlashCommandStateFromView(editor.view);
      }
    });
    const scheduleSlashMenuPositionUpdate = (event?: Event) => {
      if (event?.type === "scroll" && isMarkweaveSlashMenuScrollTarget(event.target)) {
        return;
      }

      slashMenuPositionScheduler.schedule();
    };

    window.addEventListener("resize", scheduleSlashMenuPositionUpdate);
    window.addEventListener("scroll", scheduleSlashMenuPositionUpdate, true);
    scheduleSlashMenuPositionUpdate();

    return () => {
      slashMenuPositionScheduler.cancel();
      window.removeEventListener("resize", scheduleSlashMenuPositionUpdate);
      window.removeEventListener("scroll", scheduleSlashMenuPositionUpdate, true);
    };
  }, [editor, slashMenuOpen, syncSlashCommandStateFromView]);

  const codeBlockState = useMemo(() => (editor ? getActiveCodeBlockState(editor) : inactiveCodeBlockState), [editor, revision, selectionSnapshot]);
  const tableFocusState = useMemo(() => (editor ? getTableFocusState(editor.state) : outsideTableFocusState), [editor, revision, selectionSnapshot, tableInteractionState]);
  const isCodeBlockActive = selectionSnapshot?.currentNode === "codeBlock";
  const isMermaidActive = isCodeBlockActive && codeBlockState.language === "mermaid";
  const mermaidPreviewState = useMemo(
    () => (editor ? getMermaidPreviewState({ active: isMermaidActive, mode: mermaidMode, source: codeBlockState.text }) : hiddenMermaidPreviewState),
    [codeBlockState.text, editor, isMermaidActive, mermaidMode],
  );
  const tableDebugSnapshot = useMemo(
    () => (editor && onRuntimeStateChange ? getFirstTableDebugSnapshot(editor.state) : null),
    [editor, onRuntimeStateChange, revision],
  );
  const tocItems = useMemo(() => (editor ? getMarkweaveTocItemsFromState(editor.state) : emptyMarkweaveTocState.items), [editor, revision]);
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
    () => createMarkweaveEditorRuntimeSnapshot({
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

      const context = getSlashCommandContext(editor.state);
      if (!context) return;
      setSlashCommandError(null);
      setSlashState((state) => reduceSlashCommandState(state, { type: "execute" }));
      setSlashInputCommand(null);
      void executeMarkweaveSlashCommand(editor, command.id, context, options).then((result) => {
        if (result.ok && result.outcome === "applied") {
          closeSlashMenu();
          return;
        }
        if (!result.ok) setSlashCommandError(result.message);
        syncSlashCommandState(editor);
        editor.commands.focus();
      });
    },
    [closeSlashMenu, effectiveEditable, editor, syncSlashCommandState],
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

      if (slashState.name === "executing" && event.key === "Escape") {
        event.preventDefault();
        createMarkweaveCommandController(editor).cancel();
        closeSlashMenu();
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
        createMarkweaveCommandController(editor).cancel();
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

      if (action.type === "set-active") {
        event.preventDefault();
        setSlashState((state) => reduceSlashCommandState(state, action));
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
        flushRuntimeProjection();
        return true;
      },
    }),
    [closeSlashMenu, effectiveEditable, editor, flushRuntimeProjection, syncSelectionState, syncSlashCommandState, syncTableInteractionState],
  );

  const frameProps = useMemo<MarkweaveEditorFrameProps>(
    () => ({
      className: "markweave-editor-frame",
      role: "combobox",
      "aria-label": ariaLabel ?? messages.common.editorAriaLabel,
      "aria-expanded": slashMenuPosition !== null && slashState.name !== "executing",
      "aria-controls": "markweave-slash-command-listbox",
      "aria-activedescendant": filteredSlashCommands.length && slashState.name !== "executing"
        ? `markweave-slash-command-option-${Math.min(filteredSlashCommands.length - 1, Math.max(0, slashState.activeIndex))}`
        : undefined,
      "data-testid": "markweave-editor-frame",
      "data-markweave-mode": editorMode,
      "aria-busy": largeDocumentLoading || slashState.name === "executing",
      "data-markweave-large-document-loading": largeDocumentLoading ? "true" : "false",
      "data-markweave-theme": resolvedTheme,
      style: resolvedCanvasColor ? ({ "--markweave-canvas": resolvedCanvasColor } as CSSProperties) : undefined,
      "data-markweave-inner-toc": innerToc ? "true" : "false",
      "data-markweave-inner-toc-placement": resolvedInnerTocPlacement,
      "data-mermaid-mode": mermaidPreviewState.mode,
      "data-table-focus-mode": tableFocusState.mode,
      onKeyDownCapture: handleEditorKeyDown,
    }),
    [ariaLabel, editorMode, filteredSlashCommands.length, handleEditorKeyDown, innerToc, largeDocumentLoading, mermaidPreviewState.mode, messages.common.editorAriaLabel, resolvedCanvasColor, resolvedInnerTocPlacement, resolvedTheme, slashMenuPosition, slashState.activeIndex, slashState.name, tableFocusState.mode],
  );

  const overlayProps = useMemo<MarkweaveEditorOverlayProps>(
    () => ({
      floatingToolbar: editor && effectiveEditable
        ? {
            editor,
            lang: resolvedLang,
            messages,
            selectionSnapshot,
            askAi,
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
            busy: slashState.name === "executing",
            error: slashCommandError,
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
            askAi,
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
            placement: resolvedInnerTocPlacement,
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
      askAi,
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
      slashCommandError,
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
