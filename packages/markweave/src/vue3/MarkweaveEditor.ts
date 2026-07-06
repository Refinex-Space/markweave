import type { EditorView } from "@tiptap/pm/view";
import type { Editor as CoreEditor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/vue-3/menus";
import { EditorContent, useEditor, type Editor as VueEditor } from "@tiptap/vue-3";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Eye,
  Italic,
  Link2,
  List,
  ListOrdered,
  MoreVertical,
  PencilLine,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  type LucideIcon,
} from "lucide-vue-next";
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type Component,
  type PropType,
  type Ref,
} from "vue";
import { isEditorComposing } from "../editor-core/composition-guard";
import { createSelectionSnapshot, type EditorSelectionSnapshot } from "../editor-core/selection-state";
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
  scrollToMarkweaveTocItem,
  type MarkweaveTocState,
} from "../core/toc-state";
import { getLocalizedSlashCommandSpecs, getMarkweaveMessages, normalizeMarkweaveLang, type MarkweaveLang, type MarkweaveMessages } from "../i18n";
import { getActiveCodeBlockState, markweaveCodeBlockBehavior, type MarkweaveCodeBlockState } from "../plugins/codeblock/codeblock-behavior";
import { normalizeMarkdownLinkHref } from "../plugins/markdown/markdown-input";
import { isMermaidInlinePreviewTransaction, setMermaidInlinePreviewEditorMode } from "../plugins/mermaid/mermaid-inline-preview";
import { getMermaidPreviewState, type MermaidPreviewMode } from "../plugins/mermaid/mermaid-renderer";
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
import { getFirstTableDebugSnapshot } from "../plugins/table/table-debug-snapshot";
import { focusFirstTableBodyCell } from "../plugins/table/table-focus-position";
import { getTableFocusState, type TableFocusState } from "../plugins/table/table-focus-state";
import {
  initialTableInteractionState,
  tableInteractionPluginKey,
  type TableInteractionState,
} from "../plugins/table/table-interaction-layer";
import { createMarkweaveVue3EditorExtensions } from "./create-editor-extensions";

export interface MarkweaveVue3EditorControllerActions {
  readonly closeSlashMenu: () => void;
  readonly focusFirstTableBodyCell: () => boolean;
  readonly setContent: (content: MarkweaveContentValue, options?: MarkweaveEditorSetContentOptions) => boolean;
}

export interface MarkweaveVue3EditorControllerOptions {
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

export interface MarkweaveVue3EditorController {
  readonly editor: Ref<CoreEditor | null>;
  readonly runtimeSnapshot: Ref<MarkweaveEditorRuntimeSnapshot>;
  readonly actions: MarkweaveVue3EditorControllerActions;
}

export interface MarkweaveVue3EditorProps extends MarkweaveVue3EditorControllerOptions {
  readonly className?: string;
}

interface VueControllerRenderState {
  readonly messages: MarkweaveMessages;
  readonly effectiveEditable: Ref<boolean>;
  readonly tableFocusState: Ref<TableFocusState>;
  readonly codeBlockState: Ref<MarkweaveCodeBlockState>;
  readonly isCodeBlockActive: Ref<boolean>;
  readonly tocState: Ref<MarkweaveTocState>;
  readonly filteredSlashCommands: Ref<readonly SlashCommandSpec[]>;
  readonly slashState: Ref<SlashCommandState>;
  readonly slashMenuPosition: Ref<SlashCommandMenuPosition | null>;
  readonly slashInputCommand: Ref<SlashCommandSpec | null>;
  readonly runSlashCommand: (command: SlashCommandSpec, options?: ExecuteSlashCommandOptions) => void;
  readonly handleEditorKeyDown: (event: KeyboardEvent) => void;
  readonly setSlashInputCommand: (command: SlashCommandSpec | null) => void;
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

function normalizeMarkweaveContentFormat(format: MarkweaveContentFormat | undefined): MarkweaveContentFormat {
  return format === "html" || format === "json" || format === "markdown" ? format : "markdown";
}

function getEditorMarkdown(editor: CoreEditor) {
  return (editor as CoreEditor & { getMarkdown?: () => string }).getMarkdown?.() ?? editor.getText();
}

function stringifyJsonContent(content: MarkweaveContentValue) {
  return typeof content === "string" ? content : JSON.stringify(content);
}

function isEditorContentCurrent(editor: CoreEditor, content: MarkweaveContentValue, format: MarkweaveContentFormat) {
  if (format === "html") {
    return typeof content === "string" && editor.getHTML() === content;
  }

  if (format === "json") {
    return JSON.stringify(editor.getJSON()) === stringifyJsonContent(content);
  }

  return typeof content === "string" && getEditorMarkdown(editor).trim() === content.trim();
}

function createUpdatePayload(editor: CoreEditor): MarkweaveEditorUpdatePayload {
  return {
    editor,
    html: editor.getHTML(),
    json: editor.getJSON(),
    markdown: getEditorMarkdown(editor),
    text: editor.getText(),
  };
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

function getTableInteractionState(editor: CoreEditor) {
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

function createIcon(iconComponent: Component, label: string, size = 18) {
  return h(iconComponent, { size, strokeWidth: 1.8, "aria-hidden": "true" }, { default: () => label });
}

function toolbarButton(label: string, iconComponent: LucideIcon, onClick: () => void, active = false) {
  return h(
    "button",
    {
      type: "button",
      "aria-label": label,
      title: label,
      "data-active": active ? "true" : "false",
      onMousedown: (event: MouseEvent) => event.preventDefault(),
      onClick,
    },
    [createIcon(iconComponent, label)],
  );
}

const VueFloatingToolbar = defineComponent({
  name: "MarkweaveVueFloatingToolbar",
  props: {
    editor: { type: Object as PropType<CoreEditor>, required: true },
    messages: { type: Object as PropType<MarkweaveMessages>, required: true },
  },
  setup(props) {
    const linkOpen = ref(false);
    const linkValue = ref("");
    const safeHref = computed(() => normalizeMarkdownLinkHref(linkValue.value.trim()));

    const applyLink = () => {
      if (!safeHref.value) {
        return;
      }
      props.editor.chain().focus().extendMarkRange("link").setLink({ href: safeHref.value }).run();
      linkOpen.value = false;
    };

    const unsetLink = () => {
      props.editor.chain().focus().extendMarkRange("link").unsetLink().run();
      linkValue.value = "";
      linkOpen.value = false;
    };

    return () =>
      h(
        BubbleMenu as unknown as Component,
        {
          editor: props.editor as unknown as VueEditor,
          shouldShow: ({ editor }: { editor: CoreEditor }) => !editor.state.selection.empty,
          options: { placement: "top" },
        } as Record<string, unknown>,
        {
          default: () =>
            h("div", { class: "markweave-floating-toolbar markweave-floating-toolbar--motion-entered" }, [
              h("div", { class: "markweave-floating-toolbar-content" }, [
                toolbarButton(props.messages.floatingToolbar.buttons.bold, Bold, () => props.editor.chain().focus().toggleBold().run(), props.editor.isActive("bold")),
                toolbarButton(props.messages.floatingToolbar.buttons.italic, Italic, () => props.editor.chain().focus().toggleItalic().run(), props.editor.isActive("italic")),
                toolbarButton(props.messages.floatingToolbar.buttons.underline, Underline, () => props.editor.chain().focus().toggleUnderline().run(), props.editor.isActive("underline")),
                toolbarButton(props.messages.floatingToolbar.buttons.strike, Strikethrough, () => props.editor.chain().focus().toggleStrike().run(), props.editor.isActive("strike")),
                toolbarButton(props.messages.floatingToolbar.buttons.inlineCode, Code2, () => props.editor.chain().focus().toggleCode().run(), props.editor.isActive("code")),
                toolbarButton(
                  props.messages.floatingToolbar.buttons.link,
                  Link2,
                  () => {
                    linkOpen.value = !linkOpen.value;
                    linkValue.value = (props.editor.getAttributes("link").href as string | undefined) ?? "";
                  },
                  props.editor.isActive("link"),
                ),
                toolbarButton(props.messages.floatingToolbar.moreActions["align-left"], AlignLeft, () => props.editor.chain().focus().setTextAlign("left").run(), props.editor.isActive({ textAlign: "left" })),
                toolbarButton(props.messages.floatingToolbar.moreActions["align-center"], AlignCenter, () => props.editor.chain().focus().setTextAlign("center").run(), props.editor.isActive({ textAlign: "center" })),
                toolbarButton(props.messages.floatingToolbar.moreActions["align-right"], AlignRight, () => props.editor.chain().focus().setTextAlign("right").run(), props.editor.isActive({ textAlign: "right" })),
              ]),
              linkOpen.value
                ? h("div", { class: "markweave-floating-toolbar-link-popover" }, [
                    h("input", {
                      value: linkValue.value,
                      placeholder: props.messages.floatingToolbar.linkPlaceholder,
                      "aria-label": props.messages.floatingToolbar.linkUrlLabel,
                      onInput: (event: Event) => {
                        linkValue.value = (event.target as HTMLInputElement).value;
                      },
                      onKeydown: (event: KeyboardEvent) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyLink();
                        }
                      },
                    }),
                    h("div", { class: "markweave-floating-toolbar-link-actions" }, [
                      h("button", { type: "button", disabled: !safeHref.value, "aria-label": props.messages.floatingToolbar.applyLink, onClick: applyLink }, "↵"),
                      h("button", {
                        type: "button",
                        disabled: !safeHref.value,
                        "aria-label": props.messages.floatingToolbar.openLink,
                        onClick: () => safeHref.value && window.open(safeHref.value, "_blank", "noopener,noreferrer"),
                      }, "↗"),
                      h("button", { type: "button", "aria-label": props.messages.floatingToolbar.removeLink, onClick: unsetLink }, "⌫"),
                    ]),
                  ])
                : null,
            ]),
        },
      );
  },
});

const VueSlashCommandMenu = defineComponent({
  name: "MarkweaveVueSlashCommandMenu",
  props: {
    commands: { type: Array as PropType<readonly SlashCommandSpec[]>, required: true },
    state: { type: Object as PropType<SlashCommandState>, required: true },
    position: { type: Object as PropType<SlashCommandMenuPosition | null>, default: null },
    inputCommand: { type: Object as PropType<SlashCommandSpec | null>, default: null },
    messages: { type: Object as PropType<MarkweaveMessages>, required: true },
    onSelect: { type: Function as PropType<(command: SlashCommandSpec, options?: ExecuteSlashCommandOptions) => void>, required: true },
    onInputCommandChange: { type: Function as PropType<(command: SlashCommandSpec | null) => void>, required: true },
    onUpload: { type: Function as PropType<MarkweaveSlashCommandUploadHandler | undefined>, default: undefined },
  },
  setup(props) {
    const inputValue = ref("");
    const error = ref<string | null>(null);

    const insertUpload = async () => {
      if (!props.inputCommand) {
        return;
      }
      const source = inputValue.value.trim();
      if (!source) {
        error.value = props.messages.slash.uploadRequiredError;
        return;
      }
      props.onSelect(props.inputCommand, {
        uploadResult: {
          src: source,
          name: source.split("/").filter(Boolean).at(-1),
        },
      });
      props.onInputCommandChange(null);
      inputValue.value = "";
    };

    return () => {
      if (!props.position && !props.inputCommand) {
        return null;
      }

      const style = props.position
        ? {
            "--markweave-slash-menu-left": `${props.position.left}px`,
            "--markweave-slash-menu-top": `${props.position.top}px`,
            "--markweave-slash-menu-max-height": `${props.position.maxHeight}px`,
          }
        : {};

      return h(
        "div",
        { class: "markweave-slash-menu", style, role: "menu", "aria-label": props.messages.slash.ariaLabel, "data-placement": props.position?.placement ?? "bottom" },
        [
          props.inputCommand
            ? h("div", { class: "markweave-slash-upload" }, [
                h("div", { class: "markweave-slash-upload-header" }, [
                  h("button", { type: "button", onClick: () => props.onInputCommandChange(null) }, props.messages.common.back),
                  h("strong", null, props.inputCommand.label),
                ]),
                h("label", null, [
                  h("span", null, props.messages.slash.uploadValueLabel),
                  h("input", {
                    value: inputValue.value,
                    placeholder: props.messages.slash.uploadValuePlaceholder,
                    onInput: (event: Event) => {
                      inputValue.value = (event.target as HTMLInputElement).value;
                    },
                    onKeydown: (event: KeyboardEvent) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void insertUpload();
                      }
                    },
                  }),
                ]),
                error.value ? h("div", { role: "alert" }, error.value) : null,
                h("div", { class: "markweave-slash-upload-actions" }, [
                  h("button", { type: "button", onClick: () => props.onInputCommandChange(null) }, props.messages.common.cancel),
                  h("button", { type: "button", onClick: insertUpload }, props.messages.common.insert),
                ]),
              ])
            : props.commands.length
              ? props.commands.map((command, index) =>
                  h(
                    "button",
                    {
                      key: command.id,
                      type: "button",
                      role: "menuitem",
                      "data-active": index === props.state.activeIndex ? "true" : "false",
                      disabled: !isExecutableSlashCommand(command),
                      onMouseenter: () => undefined,
                      onClick: () => props.onSelect(command),
                    },
                    [
                      h("span", { class: "markweave-slash-menu__item-icon" }, command.icon ?? command.label.charAt(0)),
                      h("span", { class: "markweave-slash-menu__item-body" }, [
                        h("span", { class: "markweave-slash-menu__item-label" }, command.label),
                        h("span", { class: "markweave-slash-menu__item-description" }, command.description),
                      ]),
                    ],
                  ),
                )
              : h("div", { class: "markweave-slash-menu__empty" }, props.messages.slash.noResults),
        ],
      );
    };
  },
});

const VueTableControls = defineComponent({
  name: "MarkweaveVueTableControls",
  props: {
    editor: { type: Object as PropType<CoreEditor>, required: true },
    active: { type: Boolean, required: true },
    messages: { type: Object as PropType<MarkweaveMessages>, required: true },
  },
  setup(props) {
    return () =>
      props.active
        ? h("div", { class: "markweave-table-controls", "data-positioned": "false" }, [
            toolbarButton(props.messages.table.commands["add-row-before"], List, () => props.editor.chain().focus().addRowBefore().run()),
            toolbarButton(props.messages.table.commands["add-row-after"], ListOrdered, () => props.editor.chain().focus().addRowAfter().run()),
            toolbarButton(props.messages.table.commands["add-column-before"], Table2, () => props.editor.chain().focus().addColumnBefore().run()),
            toolbarButton(props.messages.table.commands["add-column-after"], Table2, () => props.editor.chain().focus().addColumnAfter().run()),
            toolbarButton(props.messages.table.commands["delete-row"], Trash2, () => props.editor.chain().focus().deleteRow().run()),
            toolbarButton(props.messages.table.commands["delete-table"], MoreVertical, () => props.editor.chain().focus().deleteTable().run()),
          ])
        : null;
  },
});

const VueCodeBlockControls = defineComponent({
  name: "MarkweaveVueCodeBlockControls",
  props: {
    editor: { type: Object as PropType<CoreEditor>, required: true },
    state: { type: Object as PropType<MarkweaveCodeBlockState>, required: true },
    active: { type: Boolean, required: true },
    readOnly: { type: Boolean, required: true },
  },
  setup(props) {
    return () =>
      props.active || props.readOnly
        ? h("div", { class: "markweave-codeblock-controls", "data-positioned": "false" }, [
            h("button", { type: "button", disabled: props.readOnly, title: props.state.language }, props.state.language),
            h("button", { type: "button", onClick: () => navigator.clipboard?.writeText(props.state.text) }, "Copy"),
          ])
        : null;
  },
});

const VueInnerToc = defineComponent({
  name: "MarkweaveVueInnerToc",
  props: {
    editor: { type: Object as PropType<CoreEditor>, required: true },
    state: { type: Object as PropType<MarkweaveTocState>, required: true },
    messages: { type: Object as PropType<MarkweaveMessages>, required: true },
    editable: { type: Boolean, required: true },
  },
  setup(props) {
    return () =>
      props.state.items.length
        ? h("nav", { class: "markweave-inner-toc", "data-testid": "markweave-inner-toc", "aria-label": props.messages.toc.ariaLabel }, [
            h("div", { class: "markweave-inner-toc-rail", "aria-hidden": "true" }, props.state.items.map((item) => h("span", { key: item.id, "data-level": item.level, "data-active": item.active ? "true" : "false" }))),
            h("div", { class: "markweave-inner-toc-panel" }, [
              h("div", { class: "markweave-inner-toc-list" }, props.state.items.map((item) =>
                h(
                  "button",
                  {
                    key: item.id,
                    type: "button",
                    class: "markweave-inner-toc-item",
                    "data-level": item.level,
                    "data-active": item.active ? "true" : "false",
                    "aria-current": item.active ? "location" : undefined,
                    "aria-label": `${props.messages.toc.itemAriaLabel}: ${item.text}`,
                    title: item.text,
                    onClick: () => scrollToMarkweaveTocItem(props.editor, item, { behavior: "smooth", focus: props.editable }),
                  },
                  item.text,
                ),
              )),
            ]),
          ])
        : null;
  },
});

export function useMarkweaveEditorController(options: MarkweaveVue3EditorControllerOptions = {}): MarkweaveVue3EditorController {
  const resolvedLang = normalizeMarkweaveLang(options.lang);
  const messages = getMarkweaveMessages(resolvedLang);
  const slashCommands = getLocalizedSlashCommandSpecs(resolvedLang);
  const editorMode = ref(normalizeMarkweaveEditorMode(options.mode));
  const effectiveEditable = computed(() => editorMode.value === "live" && options.editable !== false);
  const revision = ref(0);
  const selectionSnapshot = shallowRef<EditorSelectionSnapshot | null>(null);
  const slashState = ref<SlashCommandState>(initialSlashCommandState);
  const slashMenuPosition = shallowRef<SlashCommandMenuPosition | null>(null);
  const slashInputCommand = shallowRef<SlashCommandSpec | null>(null);
  const mermaidMode = ref<MermaidPreviewMode>("code");
  const tableInteractionState = shallowRef<TableInteractionState>(initialTableInteractionState);
  const tocActiveId = ref<string | null>(null);
  const applyingControlledContent = ref(false);
  const activeFormat = normalizeMarkweaveContentFormat(options.content === undefined ? options.defaultContentFormat : options.contentFormat);

  const uploadHandler = options.onSlashCommandUpload;
  const editorRef = useEditor({
    extensions: createMarkweaveVue3EditorExtensions({
      lang: resolvedLang,
      onImageUpload: (request) => uploadHandler?.(request) ?? getDirectUploadResult(request) ?? Promise.reject(new Error("File upload requires an upload handler.")),
      onVideoUpload: (request) => uploadHandler?.(request) ?? getDirectUploadResult(request) ?? Promise.reject(new Error("File upload requires an upload handler.")),
    }),
    content: options.content ?? options.defaultContent ?? "",
    contentType: activeFormat,
    editable: effectiveEditable.value,
    autofocus: options.autofocus,
    editorProps: {
      attributes: {
        class: "markweave-editor-surface",
        "data-testid": "markweave-editor-surface",
        autocapitalize: "off",
        autocorrect: "off",
        spellcheck: "false",
        translate: "no",
      },
      handleClick: (_view, _pos, event) => (effectiveEditable.value ? false : openReadonlyLinkFromEvent(event)),
      handleDOMEvents: {
        compositionstart: () => {
          if (!effectiveEditable.value) {
            return false;
          }
          slashState.value = reduceSlashCommandState(slashState.value, { type: "composition-start" });
          slashMenuPosition.value = null;
          return false;
        },
        compositionend: (view) => {
          if (!effectiveEditable.value) {
            return false;
          }
          window.setTimeout(() => syncSlashCommandStateFromView(view), 0);
          return false;
        },
        click: (_view, event) => (effectiveEditable.value ? false : openReadonlyLinkFromEvent(event)),
      },
    },
    onSelectionUpdate: ({ editor }) => syncSelectionState(editor),
    onCreate: ({ editor }) => {
      if (options.autoFocusFirstTableBodyCell && effectiveEditable.value) {
        focusFirstTableBodyCell(editor);
      }
      syncTableInteractionState(editor);
      syncSelectionState(editor);
      revision.value += 1;
    },
    onTransaction: ({ editor, transaction }) => {
      syncTableInteractionState(editor);
      if (transaction.docChanged || isMermaidInlinePreviewTransaction(transaction)) {
        revision.value += 1;
      }
    },
    onUpdate: ({ editor }) => {
      syncSelectionState(editor);
      if (effectiveEditable.value) {
        syncSlashCommandState(editor);
      }
      if (!applyingControlledContent.value) {
        options.onUpdate?.(createUpdatePayload(editor));
      }
    },
  }) as Ref<VueEditor | null>;

  const editor = computed<CoreEditor | null>(() => (editorRef.value as unknown as CoreEditor | null) ?? null);

  function closeSlashMenu() {
    slashMenuPosition.value = null;
    slashInputCommand.value = null;
    slashState.value = initialSlashCommandState;
  }

  function syncSlashCommandStateFromView(view: EditorView) {
    const slashContext = getSlashCommandContext(view.state);
    if (!slashContext) {
      slashState.value = slashState.value.name === "idle" ? slashState.value : initialSlashCommandState;
      slashMenuPosition.value = null;
      slashInputCommand.value = null;
      return;
    }

    const cursorRect = view.coordsAtPos(slashContext.cursor);
    const triggerRect = view.coordsAtPos(slashContext.triggerFrom);
    const frameRect = view.dom.closest(".markweave-editor-frame")?.getBoundingClientRect();
    slashMenuPosition.value = getSlashCommandAnchoredMenuPosition(cursorRect, { frameRect, triggerRect });
    slashState.value = getNextSlashCommandState(slashState.value, slashContext);
  }

  function syncSlashCommandState(activeEditor: CoreEditor) {
    syncSlashCommandStateFromView(activeEditor.view);
  }

  function syncSelectionState(activeEditor: CoreEditor) {
    selectionSnapshot.value = createSelectionSnapshot(activeEditor);
    const codeBlock = getActiveCodeBlockState(activeEditor);
    if (codeBlock.active && codeBlock.language === "mermaid") {
      mermaidMode.value = codeBlock.mermaidPreviewMode;
    }
  }

  function syncTableInteractionState(activeEditor: CoreEditor) {
    tableInteractionState.value = getTableInteractionState(activeEditor);
  }

  const codeBlockState = computed(() => (editor.value ? getActiveCodeBlockState(editor.value) : inactiveCodeBlockState));
  const tableFocusState = computed(() => (editor.value ? getTableFocusState(editor.value.state) : outsideTableFocusState));
  const isCodeBlockActive = computed(() => selectionSnapshot.value?.currentNode === "codeBlock");
  const isMermaidActive = computed(() => isCodeBlockActive.value && codeBlockState.value.language === "mermaid");
  const mermaidPreviewState = computed(() =>
    editor.value ? getMermaidPreviewState({ active: isMermaidActive.value, mode: mermaidMode.value, source: codeBlockState.value.text }) : getMermaidPreviewState({ active: false, mode: "code", source: "" }),
  );
  const tableDebugSnapshot = computed(() => (editor.value ? getFirstTableDebugSnapshot(editor.value.state) : null));
  const tocItems = computed(() => (editor.value ? getMarkweaveTocItems(editor.value.state.doc) : emptyMarkweaveTocState.items));
  const normalizedTocActiveId = computed(() => getValidMarkweaveTocActiveId(tocItems.value, tocActiveId.value));
  const tocState = computed(() => createMarkweaveTocState(tocItems.value, normalizedTocActiveId.value));
  const filteredSlashCommands = computed(() => filterSlashCommands(slashState.value.query, slashCommands));

  const runtimeSnapshot = computed<MarkweaveEditorRuntimeSnapshot>(() => ({
    revision: revision.value,
    mode: editorMode.value,
    editable: effectiveEditable.value,
    toc: tocState.value,
    selection: selectionSnapshot.value,
    slash: slashState.value,
    table: tableFocusState.value,
    tableInteraction: tableInteractionState.value,
    codeBlock: codeBlockState.value,
    mermaid: mermaidPreviewState.value,
    tableDebugSnapshot: tableDebugSnapshot.value,
  }));

  const actions: MarkweaveVue3EditorControllerActions = {
    closeSlashMenu,
    focusFirstTableBodyCell: () => (editor.value ? focusFirstTableBodyCell(editor.value) : false),
    setContent: (nextContent, setContentOptions = {}) => {
      if (!editor.value) {
        return false;
      }
      const nextFormat = normalizeMarkweaveContentFormat(setContentOptions.format);
      editor.value.commands.setContent(nextContent, { contentType: nextFormat, emitUpdate: setContentOptions.emitUpdate ?? false });
      if (setContentOptions.focusFirstTableBodyCell) {
        focusFirstTableBodyCell(editor.value);
      }
      syncSelectionState(editor.value);
      if (effectiveEditable.value) {
        syncSlashCommandState(editor.value);
      }
      syncTableInteractionState(editor.value);
      revision.value += 1;
      return true;
    },
  };

  function runSlashCommand(command: SlashCommandSpec, executeOptions?: ExecuteSlashCommandOptions) {
    if (!editor.value || !effectiveEditable.value || !isExecutableSlashCommand(command)) {
      return;
    }
    if (command.inputKind && !executeOptions?.emoji && !executeOptions?.uploadResult) {
      slashInputCommand.value = command;
      return;
    }
    executeSlashCommand(editor.value, slashState.value, command, executeOptions);
    slashState.value = reduceSlashCommandState(slashState.value, { type: "execute" });
    closeSlashMenu();
  }

  function handleEditorKeyDown(event: KeyboardEvent) {
    if (!editor.value || slashInputCommand.value || !effectiveEditable.value) {
      return;
    }
    const action = getSlashCommandKeyboardAction(slashState.value, filteredSlashCommands.value, event.key, {
      isComposing: event.isComposing || isEditorComposing(editor.value.state),
    });
    if (action.type === "ignore") {
      return;
    }
    event.preventDefault();
    if (action.type === "close") {
      slashState.value = reduceSlashCommandState(slashState.value, { type: "escape" });
      closeSlashMenu();
      return;
    }
    if (action.type === "move-active") {
      slashState.value = reduceSlashCommandState(slashState.value, { type: "move-active", delta: action.delta, optionCount: action.optionCount });
      return;
    }
    runSlashCommand(action.command);
  }

  watch(
    () => [options.mode, options.editable] as const,
    () => {
      editorMode.value = normalizeMarkweaveEditorMode(options.mode);
      if (!editor.value) {
        return;
      }
      editor.value.setEditable(effectiveEditable.value);
      setMarkweaveEditorModeState(editor.value, { mode: editorMode.value, editable: effectiveEditable.value });
      setMermaidInlinePreviewEditorMode(editor.value, effectiveEditable.value ? "live" : "view");
      if (!effectiveEditable.value) {
        closeSlashMenu();
      }
    },
    { immediate: true },
  );

  watch(
    () => options.content,
    (nextContent) => {
      if (!editor.value || nextContent === undefined || isEditorContentCurrent(editor.value, nextContent, normalizeMarkweaveContentFormat(options.contentFormat))) {
        return;
      }
      applyingControlledContent.value = true;
      editor.value.commands.setContent(nextContent, { contentType: normalizeMarkweaveContentFormat(options.contentFormat), emitUpdate: false });
      applyingControlledContent.value = false;
      syncSelectionState(editor.value);
      if (effectiveEditable.value) {
        syncSlashCommandState(editor.value);
      }
      syncTableInteractionState(editor.value);
      revision.value += 1;
    },
  );

  watch(runtimeSnapshot, (snapshot) => options.onRuntimeStateChange?.(snapshot), { immediate: true });
  watch(tocState, (state) => options.onTocChange?.(state), { immediate: true });
  watch(tocItems, (items) => {
    const nextActiveId = getValidMarkweaveTocActiveId(items, tocActiveId.value);
    if (tocActiveId.value !== nextActiveId) {
      tocActiveId.value = nextActiveId;
    }
  });

  let cleanupTocListeners: (() => void) | null = null;
  onMounted(() => {
    const updateTocActiveFromScroll = () => {
      if (!editor.value || !tocItems.value.length) {
        tocActiveId.value = null;
        return;
      }
      let nextActiveId: string | null = null;
      try {
        nextActiveId = getActiveMarkweaveTocId(editor.value, tocItems.value);
      } catch {
        return;
      }
      if (tocActiveId.value !== nextActiveId) {
        tocActiveId.value = nextActiveId;
      }
    };
    const scheduleUpdate = () => window.requestAnimationFrame(updateTocActiveFromScroll);
    const scrollTarget = getNearestScrollableAncestor(editor.value?.view.dom ?? null);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    scrollTarget?.addEventListener("scroll", scheduleUpdate, { passive: true });
    scheduleUpdate();
    cleanupTocListeners = () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      scrollTarget?.removeEventListener("scroll", scheduleUpdate);
    };
  });

  onBeforeUnmount(() => {
    cleanupTocListeners?.();
  });

  return {
    editor: editor as Ref<CoreEditor | null>,
    runtimeSnapshot,
    actions,
    // Internal render helpers are attached for the package component below.
    __render: {
      messages,
      effectiveEditable,
      tableFocusState,
      codeBlockState,
      isCodeBlockActive,
      tocState,
      filteredSlashCommands,
      slashState,
      slashMenuPosition,
      slashInputCommand,
      runSlashCommand,
      handleEditorKeyDown,
      setSlashInputCommand: (command: SlashCommandSpec | null) => {
        slashInputCommand.value = command;
      },
    },
  } as MarkweaveVue3EditorController & { readonly __render: VueControllerRenderState };
}

export const MarkweaveEditor = defineComponent({
  name: "MarkweaveEditor",
  props: {
    defaultContent: { type: [String, Object] as PropType<MarkweaveContentValue>, default: "" },
    defaultContentFormat: { type: String as PropType<MarkweaveContentFormat>, default: undefined },
    content: { type: [String, Object] as PropType<MarkweaveContentValue>, default: undefined },
    contentFormat: { type: String as PropType<MarkweaveContentFormat>, default: undefined },
    editable: { type: Boolean, default: true },
    mode: { type: String as PropType<MarkweaveEditorMode>, default: "live" },
    innerToc: { type: Boolean, default: true },
    autofocus: { type: Boolean, default: false },
    lang: { type: String as PropType<MarkweaveLang>, default: undefined },
    ariaLabel: { type: String, default: undefined },
    autoFocusFirstTableBodyCell: { type: Boolean, default: false },
    className: { type: String, default: undefined },
    onUpdate: { type: Function as PropType<(payload: MarkweaveEditorUpdatePayload) => void>, default: undefined },
    onEditWithAi: { type: Function as PropType<(request: TableEditWithAiRequest) => void>, default: undefined },
    onRewriteSelection: { type: Function as PropType<(request: FloatingToolbarAssistantRequest) => void>, default: undefined },
    onExtractToNote: { type: Function as PropType<(request: FloatingToolbarAssistantRequest) => void>, default: undefined },
    onSlashCommandUpload: { type: Function as PropType<MarkweaveSlashCommandUploadHandler>, default: undefined },
    onTableCopyPayload: { type: Function as PropType<(payload: MarkweaveMenuCopyPayload) => void>, default: undefined },
    onTableCommandResult: { type: Function as PropType<(result: TableCommandResult) => void>, default: undefined },
    onRuntimeStateChange: { type: Function as PropType<(snapshot: MarkweaveEditorRuntimeSnapshot) => void>, default: undefined },
    onTocChange: { type: Function as PropType<(state: MarkweaveTocState) => void>, default: undefined },
  },
  setup(props) {
    const controller = useMarkweaveEditorController(props);
    return () => {
      const editor = controller.editor.value;
      if (!editor) {
        return null;
      }

      const render = (controller as MarkweaveVue3EditorController & { readonly __render: VueControllerRenderState }).__render;
      const frameClassName = ["markweave-editor-frame", props.className].filter(Boolean).join(" ");

      return h(
        "section",
        {
          class: frameClassName,
          "aria-label": props.ariaLabel ?? render.messages.common.editorAriaLabel,
          "data-testid": "markweave-editor-frame",
          "data-markweave-mode": controller.runtimeSnapshot.value.mode,
          "data-markweave-inner-toc": props.innerToc ? "true" : "false",
          "data-mermaid-mode": controller.runtimeSnapshot.value.mermaid.mode,
          "data-table-focus-mode": render.tableFocusState.value.mode,
          onKeydownCapture: render.handleEditorKeyDown,
        },
        [
          render.effectiveEditable.value ? h(VueFloatingToolbar, { editor, messages: render.messages }) : null,
          render.effectiveEditable.value
            ? h(VueSlashCommandMenu, {
                commands: render.filteredSlashCommands.value,
                state: render.slashState.value,
                position: render.slashMenuPosition.value,
                inputCommand: render.slashInputCommand.value,
                messages: render.messages,
                onSelect: render.runSlashCommand,
                onInputCommandChange: render.setSlashInputCommand,
                onUpload: props.onSlashCommandUpload,
              })
            : null,
          render.effectiveEditable.value ? h(VueTableControls, { editor, active: render.tableFocusState.value.active, messages: render.messages }) : null,
          h(VueCodeBlockControls, { editor, state: render.codeBlockState.value, active: render.effectiveEditable.value && render.isCodeBlockActive.value, readOnly: !render.effectiveEditable.value }),
          props.innerToc && render.tocState.value.items.length
            ? h(VueInnerToc, { editor, state: render.tocState.value, messages: render.messages, editable: render.effectiveEditable.value })
            : null,
          h(EditorContent as Component, { editor: editor as unknown as VueEditor }),
        ],
      );
    };
  },
});
