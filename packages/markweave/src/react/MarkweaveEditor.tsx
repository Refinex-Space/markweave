import type { JSONContent } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type HTMLAttributes, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { isEditorComposing } from "../editor-core/composition-guard";
import { createMarkweaveEditorExtensions } from "../editor-core/create-editor-extensions";
import { createSelectionSnapshot, type EditorSelectionSnapshot } from "../editor-core/selection-state";
import { getActiveCodeBlockState, markweaveCodeBlockBehavior, type MarkweaveCodeBlockState } from "../plugins/codeblock/codeblock-behavior";
import { getMermaidPreviewState, type MermaidPreviewMode, type MermaidPreviewState } from "../plugins/mermaid/mermaid-renderer";
import { defaultSlashCommandSpecs, filterSlashCommands, type SlashCommandSpec } from "../plugins/slash-command/command-spec";
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
import { CodeBlockControls } from "../ui/codeblock/CodeBlockControls";
import { FloatingToolbar, type FloatingToolbarAssistantRequest } from "../ui/floating-toolbar/FloatingToolbar";
import { SlashCommandMenu } from "../ui/slash-command/SlashCommandMenu";
import { TableControls, type TableCommandResult, type TableEditWithAiRequest } from "../ui/table/TableControls";
import { TableSelectionOverlay } from "../ui/table/TableSelectionOverlay";

export interface MarkweaveEditorUpdatePayload {
  readonly editor: Editor;
  readonly html: string;
  readonly json: JSONContent;
  readonly text: string;
}

export interface MarkweaveEditorRuntimeSnapshot {
  readonly revision: number;
  readonly selection: EditorSelectionSnapshot | null;
  readonly slash: SlashCommandState;
  readonly table: TableFocusState;
  readonly tableInteraction: TableInteractionState;
  readonly codeBlock: MarkweaveCodeBlockState;
  readonly mermaid: MermaidPreviewState;
  readonly tableDebugSnapshot: TableDebugSnapshot | null;
}

export interface MarkweaveEditorSetContentOptions {
  readonly emitUpdate?: boolean;
  readonly focusFirstTableBodyCell?: boolean;
}

export interface MarkweaveEditorControllerActions {
  readonly closeSlashMenu: () => void;
  readonly focusFirstTableBodyCell: () => boolean;
  readonly setContent: (content: string, options?: MarkweaveEditorSetContentOptions) => boolean;
}

export interface MarkweaveEditorOverlayProps {
  readonly floatingToolbar: ComponentProps<typeof FloatingToolbar> | null;
  readonly slashCommandMenu: ComponentProps<typeof SlashCommandMenu> | null;
  readonly tableControls: ComponentProps<typeof TableControls> | null;
  readonly tableSelectionOverlay: ComponentProps<typeof TableSelectionOverlay> | null;
  readonly codeBlockControls: ComponentProps<typeof CodeBlockControls> | null;
}

export interface MarkweaveEditorFrameProps extends HTMLAttributes<HTMLElement> {
  readonly "data-testid": string;
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
  readonly defaultContent?: string;
  readonly content?: string;
  readonly editable?: boolean;
  readonly autofocus?: boolean;
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

function createUpdatePayload(editor: Editor): MarkweaveEditorUpdatePayload {
  return {
    editor,
    html: editor.getHTML(),
    json: editor.getJSON(),
    text: editor.getText(),
  };
}

function getTableInteractionState(editor: Editor) {
  return tableInteractionPluginKey.getState(editor.state) ?? initialTableInteractionState;
}

export function useMarkweaveEditorController({
  ariaLabel = "Markweave editor",
  autoFocusFirstTableBodyCell = false,
  autofocus = false,
  content,
  defaultContent = "",
  editable = true,
  onEditWithAi,
  onExtractToNote,
  onRewriteSelection,
  onRuntimeStateChange,
  onSlashCommandUpload,
  onTableCommandResult,
  onTableCopyPayload,
  onUpdate,
}: MarkweaveEditorControllerOptions = {}): MarkweaveEditorController {
  const uploadHandlerRef = useRef(onSlashCommandUpload);
  uploadHandlerRef.current = onSlashCommandUpload;
  const extensions = useMemo(
    () =>
      createMarkweaveEditorExtensions({
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
      }),
    [],
  );
  const [selectionSnapshot, setSelectionSnapshot] = useState<EditorSelectionSnapshot | null>(null);
  const [slashState, setSlashState] = useState<SlashCommandState>(initialSlashCommandState);
  const [slashMenuPosition, setSlashMenuPosition] = useState<SlashCommandMenuPosition | null>(null);
  const [slashInputCommand, setSlashInputCommand] = useState<SlashCommandSpec | null>(null);
  const [mermaidMode, setMermaidMode] = useState<MermaidPreviewMode>("code");
  const [tableInteractionState, setTableInteractionState] = useState<TableInteractionState>(initialTableInteractionState);
  const [revision, setRevision] = useState(0);
  const applyingControlledContentRef = useRef(false);
  const callbacksRef = useRef({ onUpdate });
  const filteredSlashCommands = useMemo(() => filterSlashCommands(slashState.query), [slashState.query]);

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
    editable,
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
      handleDOMEvents: {
        compositionstart: () => {
          setSlashState((state) => reduceSlashCommandState(state, { type: "composition-start" }));
          setSlashMenuPosition(null);
          return false;
        },
        compositionend: (view) => {
          window.setTimeout(() => syncSlashCommandStateFromView(view), 0);
          return false;
        },
      },
    },
    onSelectionUpdate: ({ editor: activeEditor }) => {
      syncSelectionState(activeEditor);
    },
    onCreate: ({ editor: activeEditor }) => {
      if (autoFocusFirstTableBodyCell) {
        focusFirstTableBodyCell(activeEditor);
      }

      syncTableInteractionState(activeEditor);
      syncSelectionState(activeEditor);
      setRevision((current) => current + 1);
    },
    onTransaction: ({ editor: activeEditor, transaction }) => {
      syncTableInteractionState(activeEditor);
      if (transaction.docChanged) {
        setRevision((current) => current + 1);
      }
    },
    onUpdate: ({ editor: activeEditor }) => {
      syncSelectionState(activeEditor);
      syncSlashCommandState(activeEditor);

      if (!applyingControlledContentRef.current) {
        callbacksRef.current.onUpdate?.(createUpdatePayload(activeEditor));
      }
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor || content === undefined || editor.getHTML() === content) {
      return;
    }

    applyingControlledContentRef.current = true;
    editor.commands.setContent(content, { emitUpdate: false });
    applyingControlledContentRef.current = false;
    syncSelectionState(editor);
    syncSlashCommandState(editor);
    syncTableInteractionState(editor);
    setRevision((current) => current + 1);
  }, [content, editor, syncSelectionState, syncSlashCommandState, syncTableInteractionState]);

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

  const runtimeSnapshot = useMemo<MarkweaveEditorRuntimeSnapshot>(
    () => ({
      revision,
      selection: selectionSnapshot,
      slash: slashState,
      table: tableFocusState,
      tableInteraction: tableInteractionState,
      codeBlock: codeBlockState,
      mermaid: mermaidPreviewState,
      tableDebugSnapshot,
    }),
    [codeBlockState, mermaidPreviewState, revision, selectionSnapshot, slashState, tableDebugSnapshot, tableFocusState, tableInteractionState],
  );

  useEffect(() => {
    onRuntimeStateChange?.(runtimeSnapshot);
  }, [onRuntimeStateChange, runtimeSnapshot]);

  const runSlashCommand = useCallback(
    (command: SlashCommandSpec, options?: ExecuteSlashCommandOptions) => {
      if (!editor) {
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
    [closeSlashMenu, editor, slashState],
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
      if (!editor || slashInputCommand) {
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
    [closeSlashMenu, editor, filteredSlashCommands, runSlashCommand, slashInputCommand, slashState],
  );

  const actions = useMemo<MarkweaveEditorControllerActions>(
    () => ({
      closeSlashMenu,
      focusFirstTableBodyCell: () => (editor ? focusFirstTableBodyCell(editor) : false),
      setContent: (nextContent, options = {}) => {
        if (!editor) {
          return false;
        }

        editor.commands.setContent(nextContent, { emitUpdate: options.emitUpdate ?? false });
        if (options.focusFirstTableBodyCell) {
          focusFirstTableBodyCell(editor);
        }
        syncSelectionState(editor);
        syncSlashCommandState(editor);
        syncTableInteractionState(editor);
        setRevision((current) => current + 1);
        return true;
      },
    }),
    [closeSlashMenu, editor, syncSelectionState, syncSlashCommandState, syncTableInteractionState],
  );

  const frameProps = useMemo<MarkweaveEditorFrameProps>(
    () => ({
      className: "markweave-editor-frame",
      "aria-label": ariaLabel,
      "data-testid": "markweave-editor-frame",
      "data-mermaid-mode": mermaidPreviewState.mode,
      "data-table-focus-mode": tableFocusState.mode,
      onKeyDownCapture: handleEditorKeyDown,
    }),
    [ariaLabel, handleEditorKeyDown, mermaidPreviewState.mode, tableFocusState.mode],
  );

  const overlayProps = useMemo<MarkweaveEditorOverlayProps>(
    () => ({
      floatingToolbar: editor
        ? {
            editor,
            selectionSnapshot,
            onRewriteSelection,
            onExtractToNote,
          }
        : null,
      slashCommandMenu: editor
        ? {
            commands: filteredSlashCommands,
            state: slashState,
            position: slashMenuPosition,
            inputCommand: slashInputCommand,
            onActiveIndexChange: setSlashActiveIndex,
            onInputCommandChange: setSlashInputCommand,
            onSelect: runSlashCommand,
            onUpload: onSlashCommandUpload,
          }
        : null,
      tableControls: editor
        ? {
            editor,
            active: tableFocusState.active,
            interactionState: tableInteractionState,
            onCopyPayload: onTableCopyPayload,
            onCommandResult: onTableCommandResult,
            onEditWithAi,
          }
        : null,
      tableSelectionOverlay: editor
        ? {
            editor,
            focusState: tableFocusState,
          }
        : null,
      codeBlockControls: editor
        ? {
            editor,
            active: isCodeBlockActive,
            mermaidMode,
            onMermaidModeChange: setMermaidMode,
          }
        : null,
    }),
    [
      editor,
      filteredSlashCommands,
      isCodeBlockActive,
      mermaidMode,
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
      <EditorContent editor={controller.editor} />
    </section>
  );
}
