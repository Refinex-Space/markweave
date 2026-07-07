import type { EditorView } from "@tiptap/pm/view";
import type { Editor as CoreEditor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/vue-3/menus";
import { EditorContent, useEditor, type Editor as VueEditor } from "@tiptap/vue-3";
import {
  AlignJustify,
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlertTriangle,
  Bold,
  Braces,
  Captions,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleX,
  Code2,
  CornerDownLeft,
  Download,
  Eye,
  ExternalLink,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Info,
  Lightbulb,
  Minus,
  MoreVertical,
  Paperclip,
  PencilLine,
  Quote,
  Sigma,
  SmilePlus,
  Sparkles,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  Text as TextIcon,
  Trash2,
  Type as TypeIcon,
  Underline,
  Video as VideoIcon,
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
import { createSelectionSnapshot, shouldShowFloatingToolbar, type EditorSelectionSnapshot } from "../editor-core/selection-state";
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
import {
  copyActiveCodeBlock,
  getActiveCodeBlockState,
  markweaveCodeBlockBehavior,
  normalizeCodeBlockLanguage,
  setActiveCodeBlockMermaidPreviewMode,
  type MarkweaveCodeBlockState,
} from "../plugins/codeblock/codeblock-behavior";
import { normalizeMarkdownLinkHref } from "../plugins/markdown/markdown-input";
import {
  getEffectiveMermaidPreviewMode,
  isMermaidInlinePreviewTransaction,
  setMermaidInlinePreviewEditorMode,
  setReadonlyMermaidPreviewMode,
} from "../plugins/mermaid/mermaid-inline-preview";
import { getMermaidPreviewState, type MermaidPreviewMode } from "../plugins/mermaid/mermaid-renderer";
import { filterSlashCommands, isExecutableSlashCommand, type SlashCommandIconName, type SlashCommandSpec } from "../plugins/slash-command/command-spec";
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
import {
  detectUploadSource,
  getDirectUploadResult,
  resolveMarkweaveUploadResult,
  type MarkweaveSlashCommandUploadHandler,
  type MarkweaveUploadRequest,
  type MarkweaveUploadResult,
} from "../plugins/slash-command/upload";
import { setMarkweaveTableMenuAxisTarget, type MarkweaveMenuCopyPayload } from "../plugins/table/table-clipboard";
import { type TableCommandId } from "../plugins/table/table-command-spec";
import { getFirstTableDebugSnapshot } from "../plugins/table/table-debug-snapshot";
import { focusFirstTableBodyCell } from "../plugins/table/table-focus-position";
import { getTableFocusState, type TableFocusState } from "../plugins/table/table-focus-state";
import {
  getTableSelectionOverlayState,
  initialTableInteractionState,
  tableInteractionPluginKey,
  type TableInteractionState,
} from "../plugins/table/table-interaction-layer";
import {
  calculateAnchoredTableMenuPosition,
  calculateTableEdgeHandlePosition,
  canRunTableCommand,
  executeTableMenuCommand,
  formatTableCopyFeedback,
  getActiveTableElement,
  getAvailableCellMenuCommandSpecs,
  getTableAxisTargetRect,
  getTableControlAxisSelectionModel,
  getTableEditWithAiRequest,
  getTableMenuItemGroup,
  getTableMenuItemLabel,
  getTableMenuItems,
  getTableSelectionTargetRect,
  measureTableSelectionOverlay,
  selectTableAxisFromCell,
  tableCopyFeedbackTimeoutMs,
  tableMenuLabel,
  type TableCopyFeedbackSnapshot,
  type TableEdgeHandlePosition,
  type TableMenuAnchor,
  type TableMenuKind,
  type TableMenuPosition,
  type TableSelectionOverlayRect,
} from "../plugins/table/table-ui-model";
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
  readonly tableInteractionState: Ref<TableInteractionState>;
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

function createIcon(iconComponent: Component, label: string, size = 18, strokeWidth = 1.8) {
  return h(iconComponent, { size, strokeWidth, "aria-hidden": "true" }, { default: () => label });
}

function preventVuePointerFocusLoss(event: Event) {
  event.preventDefault();
}

function maybeOpenLinkHref(href: string) {
  const normalized = normalizeMarkdownLinkHref(href);
  if (!normalized || typeof window === "undefined" || typeof window.open !== "function") {
    return false;
  }

  window.open(normalized, "_blank", "noopener,noreferrer");
  return true;
}

const toolbarIconMap: Record<string, Component> = {
  improve: Sparkles,
  bold: Bold,
  italic: Italic,
  underline: Underline,
  strike: Strikethrough,
  "inline-code": Code2,
  link: Link2,
  more: MoreVertical,
  superscript: Superscript,
  subscript: Subscript,
  "inline-math": Sigma,
  "align-left": AlignLeft,
  "align-center": AlignCenter,
  "align-right": AlignRight,
  "align-justify": AlignJustify,
  "decrease-indent": IndentDecrease,
  "increase-indent": IndentIncrease,
};

const slashIconMap: Record<SlashCommandIconName, Component> = {
  type: TextIcon,
  "heading-1": Heading1,
  "heading-2": Heading2,
  "heading-3": Heading3,
  "bullet-list": List,
  "ordered-list": ListOrdered,
  "task-list": ListChecks,
  blockquote: Quote,
  "code-block": Braces,
  info: Info,
  tip: Lightbulb,
  warning: AlertTriangle,
  error: CircleX,
  success: CheckCircle2,
  emoji: SmilePlus,
  table: Table2,
  separator: Minus,
  image: ImageIcon,
  video: VideoIcon,
  attachment: Paperclip,
};

function createSlashIcon(name: SlashCommandIconName) {
  const Icon = slashIconMap[name];
  return h(Icon, { size: 18, strokeWidth: 1.6, absoluteStrokeWidth: true, "aria-hidden": "true" });
}

type VueColorOption = readonly [id: string, value: string | null, label: string];

function currentBlockType(editor: CoreEditor, messages: MarkweaveMessages) {
  if (editor.isActive("heading", { level: 1 })) {
    return messages.floatingToolbar.blockTypes["heading-1"];
  }
  if (editor.isActive("heading", { level: 2 })) {
    return messages.floatingToolbar.blockTypes["heading-2"];
  }
  if (editor.isActive("heading", { level: 3 })) {
    return messages.floatingToolbar.blockTypes["heading-3"];
  }
  return messages.floatingToolbar.blockTypes.paragraph;
}

function setBlockType(editor: CoreEditor, id: string) {
  if (id === "paragraph") {
    return editor.chain().focus().setParagraph().run();
  }
  if (id === "heading-1" || id === "heading-2" || id === "heading-3") {
    return editor.chain().focus().setHeading({ level: Number(id.at(-1)) as 1 | 2 | 3 }).run();
  }
  if (id === "bullet-list") {
    return editor.chain().focus().toggleBulletList().run();
  }
  if (id === "numbered-list") {
    return editor.chain().focus().toggleOrderedList().run();
  }
  if (id === "todo-list") {
    return editor.chain().focus().toggleTaskList().run();
  }
  if (id === "quote") {
    return editor.chain().focus().toggleBlockquote().run();
  }
  if (id === "code-block") {
    return editor.chain().focus().setCodeBlock({ language: "text" }).run();
  }
  return false;
}

function runToolbarMoreAction(editor: CoreEditor, id: string) {
  if (id === "superscript") {
    return editor.chain().focus().toggleSuperscript().run();
  }
  if (id === "subscript") {
    return editor.chain().focus().toggleSubscript().run();
  }
  if (id === "inline-math") {
    return editor.chain().focus().insertContent({ type: "inlineMath", attrs: { latex: "x" } }).run();
  }
  if (id === "align-left" || id === "align-center" || id === "align-right" || id === "align-justify") {
    return editor.chain().focus().setTextAlign(id.replace("align-", "")).run();
  }
  if (id === "decrease-indent") {
    editor.commands.focus();
    return (editor.commands as unknown as { decreaseIndent?: () => boolean }).decreaseIndent?.() ?? false;
  }
  if (id === "increase-indent") {
    editor.commands.focus();
    return (editor.commands as unknown as { increaseIndent?: () => boolean }).increaseIndent?.() ?? false;
  }
  return false;
}

function getCodeBlockStateAtPosition(editor: CoreEditor, pos: number | null): MarkweaveCodeBlockState | null {
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
      language === "mermaid" ? getEffectiveMermaidPreviewMode(editor.state, node, pos) : "code",
    pos,
    text: node.textContent,
  };
}

function getCodeBlockPositionFromElement(editor: CoreEditor, element: Element) {
  const previewElement = element.closest<HTMLElement>("[data-code-block-pos]");
  if (previewElement) {
    const pos = Number.parseInt(previewElement.dataset.codeBlockPos ?? "", 10);
    return Number.isFinite(pos) ? pos : null;
  }

  const codeBlockElement = element.closest<HTMLElement>("pre.markweave-code-block");
  if (!codeBlockElement) {
    return null;
  }

  const positions: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") {
      positions.push(pos);
      return false;
    }

    return true;
  });

  const codeBlockElements = Array.from(editor.view.dom.querySelectorAll("pre.markweave-code-block"));
  const index = codeBlockElements.indexOf(codeBlockElement);
  return index >= 0 ? positions[index] ?? null : null;
}

const VueFloatingToolbar = defineComponent({
  name: "MarkweaveVueFloatingToolbar",
  props: {
    editor: { type: Object as PropType<CoreEditor>, required: true },
    messages: { type: Object as PropType<MarkweaveMessages>, required: true },
    onRewriteSelection: { type: Function as PropType<((request: FloatingToolbarAssistantRequest) => void) | undefined>, default: undefined },
  },
  setup(props) {
    const openMenu = ref<"block-type" | "link" | "color" | "more" | null>(null);
    const linkValue = ref("");
    const safeHref = computed(() => normalizeMarkdownLinkHref(linkValue.value.trim()));
    const toolbarMessages = computed(() => props.messages.floatingToolbar);
    const blockOptions = computed(() => [
      ["paragraph", toolbarMessages.value.turnInto.paragraph, TypeIcon],
      ["heading-1", toolbarMessages.value.turnInto["heading-1"], Heading1],
      ["heading-2", toolbarMessages.value.turnInto["heading-2"], Heading2],
      ["heading-3", toolbarMessages.value.turnInto["heading-3"], Heading3],
      ["bullet-list", toolbarMessages.value.turnInto["bullet-list"], List],
      ["numbered-list", toolbarMessages.value.turnInto["numbered-list"], ListOrdered],
      ["todo-list", toolbarMessages.value.turnInto["todo-list"], ListChecks],
      ["quote", toolbarMessages.value.turnInto.quote, Quote],
      ["code-block", toolbarMessages.value.turnInto["code-block"], Braces],
    ] as const);
    const textColorOptions = computed(() => [
      ["default", null, toolbarMessages.value.textColors.default],
      ["gray", "#646970", toolbarMessages.value.textColors.gray],
      ["brown", "#8a5a44", toolbarMessages.value.textColors.brown],
      ["orange", "#c76f2b", toolbarMessages.value.textColors.orange],
      ["yellow", "#9a7400", toolbarMessages.value.textColors.yellow],
      ["green", "#2f7d4f", toolbarMessages.value.textColors.green],
      ["blue", "#2f66d0", toolbarMessages.value.textColors.blue],
      ["purple", "#7651d5", toolbarMessages.value.textColors.purple],
      ["pink", "#bf4e85", toolbarMessages.value.textColors.pink],
      ["red", "#c23b3b", toolbarMessages.value.textColors.red],
    ] as const);
    const highlightOptions = computed(() => [
      ["default", null, toolbarMessages.value.highlightColors.default],
      ["gray", "#eceff3", toolbarMessages.value.highlightColors.gray],
      ["brown", "#f1e6df", toolbarMessages.value.highlightColors.brown],
      ["orange", "#fde7d1", toolbarMessages.value.highlightColors.orange],
      ["yellow", "#fff4bf", toolbarMessages.value.highlightColors.yellow],
      ["green", "#dff4e8", toolbarMessages.value.highlightColors.green],
      ["blue", "#ddeaff", toolbarMessages.value.highlightColors.blue],
      ["purple", "#ebe4ff", toolbarMessages.value.highlightColors.purple],
      ["pink", "#fde3ef", toolbarMessages.value.highlightColors.pink],
      ["red", "#ffe0df", toolbarMessages.value.highlightColors.red],
    ] as const);
    const moreActions = computed(() => [
      "superscript",
      "subscript",
      "inline-math",
      "align-left",
      "align-center",
      "align-right",
      "align-justify",
      "decrease-indent",
      "increase-indent",
    ]);

    const applyLink = () => {
      if (!safeHref.value) {
        return;
      }
      props.editor.chain().focus().extendMarkRange("link").setLink({ href: safeHref.value }).run();
      openMenu.value = null;
    };

    const unsetLink = () => {
      if (props.editor.isActive("link")) {
        props.editor.chain().focus().extendMarkRange("link").unsetLink().run();
      }
      linkValue.value = "";
      openMenu.value = null;
    };

    const toggleMenu = (menu: typeof openMenu.value) => {
      openMenu.value = openMenu.value === menu ? null : menu;
      if (menu === "link") {
        linkValue.value = (props.editor.getAttributes("link").href as string | undefined) ?? "";
      }
    };

    const toolbarButton = (id: string, label: string, iconComponent: Component, onClick: () => void, active = false, glyph?: string) =>
      h(
        "button",
        {
          type: "button",
          class: `markweave-floating-toolbar-button markweave-floating-toolbar-button--${id}`,
          "aria-label": label,
          "aria-expanded": ["block-type", "link", "color", "more"].includes(id) ? openMenu.value === id : undefined,
          "data-active": active || openMenu.value === id,
          "data-testid": `markweave-floating-toolbar-button-${id}`,
          onMousedown: preventVuePointerFocusLoss,
          onClick,
        },
        id === "block-type"
          ? [
              h("span", { class: "markweave-floating-toolbar-button-inner" }, [
                h("span", { class: "markweave-floating-toolbar-block-label" }, currentBlockType(props.editor, props.messages)),
                createIcon(openMenu.value === "block-type" ? ChevronUp : ChevronDown, label),
              ]),
            ]
          : id === "color"
            ? [
                h("span", { class: "markweave-floating-toolbar-button-inner markweave-floating-toolbar-button-inner--color" }, [
                  h("span", { class: "markweave-floating-toolbar-color-trigger" }, "A"),
                  createIcon(openMenu.value === "color" ? ChevronUp : ChevronDown, label),
                ]),
              ]
            : id === "improve"
              ? [h("span", { class: "markweave-floating-toolbar-button-inner" }, [createIcon(iconComponent, label), h("span", null, glyph ?? label)])]
              : [createIcon(iconComponent, label)],
      );

    const divider = () => h("span", { class: "markweave-floating-toolbar-divider", "aria-hidden": "true" });

    const colorSection = (title: string, mode: "text" | "highlight", options: readonly VueColorOption[]) =>
      h("section", { class: "markweave-floating-toolbar-color-section", "aria-label": title }, [
        h("div", { class: "markweave-floating-toolbar-menu-title" }, title),
        h("div", { class: "markweave-floating-toolbar-swatch-grid" }, options.map(([id, value, label]) =>
          h(
            "button",
            {
              key: `${mode}-${id}`,
              type: "button",
              "aria-label": label,
              "data-testid": `markweave-floating-toolbar-${mode}-${id}`,
              onMousedown: preventVuePointerFocusLoss,
              onClick: () => {
                if (mode === "text") {
                  value ? props.editor.chain().focus().setColor(value).run() : props.editor.chain().focus().unsetColor().run();
                } else {
                  value ? props.editor.chain().focus().toggleHighlight({ color: value }).run() : props.editor.chain().focus().unsetHighlight().run();
                }
                openMenu.value = null;
              },
            },
            mode === "text"
              ? [h("span", { class: "markweave-floating-toolbar-text-swatch", style: { color: value ?? "#646970" } }, "A")]
              : [h("span", { class: "markweave-floating-toolbar-highlight-swatch", style: { backgroundColor: value ?? "#ffffff" }, "aria-hidden": "true" })],
          ),
        )),
      ]);

    const createAssistantRequest = (): FloatingToolbarAssistantRequest => ({
      source: "rewrite-selection",
      text: props.editor.state.doc.textBetween(props.editor.state.selection.from, props.editor.state.selection.to, "\n"),
      html: props.editor.getHTML(),
      from: props.editor.state.selection.from,
      to: props.editor.state.selection.to,
    });

    const renderPopover = () => {
      if (openMenu.value === "block-type") {
        return h("div", { class: "markweave-floating-toolbar-popover markweave-floating-toolbar-turn-menu", "data-testid": "markweave-floating-toolbar-turn-menu" }, [
          h("div", { class: "markweave-floating-toolbar-menu-title" }, toolbarMessages.value.turnIntoTitle),
          ...blockOptions.value.map(([id, label, icon]) =>
            h(
              "button",
              {
                key: id,
                type: "button",
                "data-testid": `markweave-floating-toolbar-turn-${id}`,
                onMousedown: preventVuePointerFocusLoss,
                onClick: () => {
                  setBlockType(props.editor, id);
                  openMenu.value = null;
                },
              },
              [h("span", { class: "markweave-floating-toolbar-menu-icon" }, [createIcon(icon, label)]), h("span", null, label)],
            ),
          ),
        ]);
      }

      if (openMenu.value === "link") {
        return h(
          "form",
          {
            class: "markweave-floating-toolbar-popover markweave-floating-toolbar-link-popover",
            "data-testid": "markweave-floating-toolbar-link-popover",
            onSubmit: (event: Event) => {
              event.preventDefault();
              applyLink();
            },
          },
          [
            h("input", {
              value: linkValue.value,
              placeholder: toolbarMessages.value.linkPlaceholder,
              "aria-label": toolbarMessages.value.linkUrlLabel,
              "data-testid": "markweave-floating-toolbar-link-input",
              onInput: (event: Event) => {
                linkValue.value = (event.target as HTMLInputElement).value;
              },
            }),
            h("span", { class: "markweave-floating-toolbar-link-actions" }, [
              h("button", { type: "submit", disabled: !safeHref.value, "aria-label": toolbarMessages.value.applyLink, "data-testid": "markweave-floating-toolbar-link-apply", onMousedown: preventVuePointerFocusLoss }, [
                createIcon(CornerDownLeft, toolbarMessages.value.applyLink),
              ]),
              h("span", { class: "markweave-floating-toolbar-link-divider", "aria-hidden": "true" }),
              h(
                "button",
                {
                  type: "button",
                  disabled: !safeHref.value,
                  "aria-label": toolbarMessages.value.openLink,
                  "data-testid": "markweave-floating-toolbar-link-open",
                  onMousedown: preventVuePointerFocusLoss,
                  onClick: () => maybeOpenLinkHref(linkValue.value),
                },
                [createIcon(ExternalLink, toolbarMessages.value.openLink)],
              ),
              h("button", { type: "button", "aria-label": toolbarMessages.value.removeLink, "data-testid": "markweave-floating-toolbar-link-remove", onMousedown: preventVuePointerFocusLoss, onClick: unsetLink }, [
                createIcon(Trash2, toolbarMessages.value.removeLink),
              ]),
            ]),
          ],
        );
      }

      if (openMenu.value === "color") {
        return h("div", { class: "markweave-floating-toolbar-popover markweave-floating-toolbar-color-popover", "data-testid": "markweave-floating-toolbar-color-menu" }, [
          colorSection(toolbarMessages.value.textColorTitle, "text", textColorOptions.value),
          colorSection(toolbarMessages.value.highlightColorTitle, "highlight", highlightOptions.value),
        ]);
      }

      if (openMenu.value === "more") {
        return h("div", { class: "markweave-floating-toolbar-popover markweave-floating-toolbar-more-menu", "data-testid": "markweave-floating-toolbar-more-menu" }, moreActions.value.map((id) =>
          h("span", { key: id, class: "markweave-floating-toolbar-more-item" }, [
            h(
              "button",
              {
                type: "button",
                "aria-label": toolbarMessages.value.moreActions[id],
                "data-testid": `markweave-floating-toolbar-more-${id}`,
                onMousedown: preventVuePointerFocusLoss,
                onClick: () => {
                  runToolbarMoreAction(props.editor, id);
                  openMenu.value = null;
                },
              },
              [createIcon(toolbarIconMap[id], toolbarMessages.value.moreActions[id])],
            ),
          ]),
        ));
      }

      return null;
    };

    return () =>
      h(
        BubbleMenu as unknown as Component,
        {
          editor: props.editor as unknown as VueEditor,
          shouldShow: ({ editor }: { editor: CoreEditor }) => editor.isEditable && shouldShowFloatingToolbar(createSelectionSnapshot(editor)),
          options: { placement: "top" },
        } as Record<string, unknown>,
        {
          default: () =>
            h("div", { class: "markweave-floating-toolbar markweave-floating-toolbar--default markweave-floating-toolbar--motion-entered", "data-testid": "markweave-floating-toolbar" }, [
              h("div", { class: "markweave-floating-toolbar-content", "data-menu": openMenu.value ?? "none" }, [
                toolbarButton("improve", toolbarMessages.value.buttons.improve, Sparkles, () => props.onRewriteSelection?.(createAssistantRequest()), false, toolbarMessages.value.buttons.improve),
                divider(),
                toolbarButton("block-type", toolbarMessages.value.buttons["block-type"], TypeIcon, () => toggleMenu("block-type"), openMenu.value === "block-type"),
                divider(),
                toolbarButton("bold", toolbarMessages.value.buttons.bold, Bold, () => props.editor.chain().focus().toggleBold().run(), props.editor.isActive("bold")),
                toolbarButton("italic", toolbarMessages.value.buttons.italic, Italic, () => props.editor.chain().focus().toggleItalic().run(), props.editor.isActive("italic")),
                toolbarButton("underline", toolbarMessages.value.buttons.underline, Underline, () => props.editor.chain().focus().toggleUnderline().run(), props.editor.isActive("underline")),
                toolbarButton("strike", toolbarMessages.value.buttons.strike, Strikethrough, () => props.editor.chain().focus().toggleStrike().run(), props.editor.isActive("strike")),
                toolbarButton("inline-code", toolbarMessages.value.buttons["inline-code"], Code2, () => props.editor.chain().focus().toggleCode().run(), props.editor.isActive("code")),
                divider(),
                toolbarButton("link", toolbarMessages.value.buttons.link, Link2, () => toggleMenu("link"), props.editor.isActive("link")),
                toolbarButton("color", toolbarMessages.value.buttons.color, TypeIcon, () => toggleMenu("color"), openMenu.value === "color"),
                divider(),
                toolbarButton("more", toolbarMessages.value.buttons.more, MoreVertical, () => toggleMenu("more"), openMenu.value === "more"),
                renderPopover(),
              ]),
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
    const file = ref<File | null>(null);
    const error = ref<string | null>(null);
    const isSubmitting = ref(false);
    const emojiQuery = ref("");
    const emojiActiveIndex = ref(0);
    const visibleEmojiItems = computed(() => {
      const query = emojiQuery.value.trim().toLowerCase();
      const items = query
        ? props.messages.slash.emojiItems.filter((item) => [item.emoji, item.label, ...item.terms].join(" ").toLowerCase().includes(query))
        : props.messages.slash.emojiItems;
      return items.slice(0, 12);
    });

    const insertUpload = async () => {
      if (!props.inputCommand) {
        return;
      }
      error.value = null;
      isSubmitting.value = true;
      try {
        const request: MarkweaveUploadRequest = file.value
          ? { kind: props.inputCommand.uploadKind ?? "attachment", trigger: "slash-command", source: { type: "file", file: file.value, mimeType: file.value.type } }
          : { kind: props.inputCommand.uploadKind ?? "attachment", trigger: "slash-command", source: detectUploadSource(inputValue.value) };
        if (!file.value && !inputValue.value.trim()) {
          error.value = props.messages.slash.uploadRequiredError;
          return;
        }
        const uploadResult: MarkweaveUploadResult = await resolveMarkweaveUploadResult(request, props.onUpload);
        props.onSelect(props.inputCommand, { uploadResult });
        props.onInputCommandChange(null);
        inputValue.value = "";
        file.value = null;
      } catch (errorValue) {
        error.value = errorValue instanceof Error ? errorValue.message : props.messages.slash.uploadFailedError;
      } finally {
        isSubmitting.value = false;
      }
    };

    const chooseEmoji = (index: number) => {
      if (!props.inputCommand) {
        return;
      }
      const item = visibleEmojiItems.value[Math.min(visibleEmojiItems.value.length - 1, Math.max(0, index))];
      if (item) {
        props.onSelect(props.inputCommand, { emoji: item.emoji });
        props.onInputCommandChange(null);
      }
    };

    return () => {
      if (!props.position) {
        return null;
      }

      const style = {
        left: `${props.position.left}px`,
        top: `${props.position.top}px`,
        maxHeight: `${props.position.maxHeight}px`,
        "--markweave-slash-menu-max-height": `${props.position.maxHeight}px`,
      };
      const triggerStyle = {
        left: `${props.position.triggerLeft}px`,
        top: `${props.position.triggerTop}px`,
      };

      const groupedCommands = Object.values(props.messages.slash.groups)
        .map((group) => ({ group, commands: props.commands.filter((command) => command.group === group) }))
        .filter((entry) => entry.commands.length);

      return [
        h("div", { class: "markweave-slash-trigger", style: triggerStyle, "aria-hidden": "true", "data-testid": "markweave-slash-trigger" }, [
          h("span", null, "/"),
          h("em", null, props.state.query || props.messages.slash.filterPlaceholder),
        ]),
        h(
          "div",
          { class: "markweave-slash-menu", style, role: "listbox", "aria-label": props.messages.slash.ariaLabel, "data-placement": props.position.placement, "data-testid": "markweave-slash-menu" },
          [
            props.inputCommand?.inputKind === "emoji"
              ? h("div", { class: "markweave-slash-subpanel", "data-testid": "markweave-slash-emoji-picker" }, [
                  h("div", { class: "markweave-slash-subpanel-header" }, [
                    h("button", { type: "button", onMousedown: preventVuePointerFocusLoss, onClick: () => props.onInputCommandChange(null) }, props.messages.common.back),
                    h("span", null, props.messages.slash.emojiTitle),
                  ]),
                  h("label", { class: "markweave-slash-input" }, [
                    h("span", null, "/"),
                    h("input", {
                      autofocus: true,
                      value: emojiQuery.value,
                      placeholder: props.messages.slash.emojiSearchPlaceholder,
                      onInput: (event: Event) => {
                        emojiQuery.value = (event.target as HTMLInputElement).value;
                        emojiActiveIndex.value = 0;
                      },
                      onKeydown: (event: KeyboardEvent) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          props.onInputCommandChange(null);
                        } else if (event.key === "ArrowDown") {
                          event.preventDefault();
                          emojiActiveIndex.value = visibleEmojiItems.value.length ? (emojiActiveIndex.value + 1) % visibleEmojiItems.value.length : 0;
                        } else if (event.key === "ArrowUp") {
                          event.preventDefault();
                          emojiActiveIndex.value = visibleEmojiItems.value.length ? (emojiActiveIndex.value - 1 + visibleEmojiItems.value.length) % visibleEmojiItems.value.length : 0;
                        } else if (event.key === "Enter" || event.key === "Tab") {
                          event.preventDefault();
                          chooseEmoji(emojiActiveIndex.value);
                        }
                      },
                    }),
                  ]),
                  h("div", { class: "markweave-slash-emoji-grid", role: "listbox", "aria-label": props.messages.slash.emojiTitle }, visibleEmojiItems.value.map((item, index) =>
                    h("button", { key: `${item.emoji}-${item.label}`, type: "button", role: "option", "aria-selected": index === emojiActiveIndex.value, "data-active": index === emojiActiveIndex.value, onMouseenter: () => (emojiActiveIndex.value = index), onMousedown: preventVuePointerFocusLoss, onClick: () => chooseEmoji(index) }, [
                      h("span", null, item.emoji),
                      h("small", null, item.label),
                    ]),
                  )),
                ])
              : props.inputCommand?.inputKind === "upload"
                ? h("div", { class: "markweave-slash-subpanel", "data-testid": "markweave-slash-upload-panel" }, [
                h("div", { class: "markweave-slash-upload-header" }, [
                  h("button", { type: "button", onMousedown: preventVuePointerFocusLoss, onClick: () => props.onInputCommandChange(null) }, props.messages.common.back),
                  h("strong", null, props.inputCommand ? props.messages.slash.uploadKindLabels[props.inputCommand.uploadKind ?? "upload"] : props.messages.slash.uploadKindLabels.upload),
                ]),
                h("label", { class: "markweave-slash-upload-field" }, [
                  h("span", null, props.messages.slash.uploadValueLabel),
                  h("input", {
                    autofocus: true,
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
                h("label", { class: "markweave-slash-upload-field" }, [
                  h("span", null, props.messages.common.file),
                  h("input", { type: "file", onChange: (event: Event) => (file.value = (event.target as HTMLInputElement).files?.[0] ?? null) }),
                ]),
                error.value ? h("div", { class: "markweave-slash-upload-error", role: "alert" }, error.value) : null,
                h("div", { class: "markweave-slash-upload-actions" }, [
                  h("button", { type: "button", onMousedown: preventVuePointerFocusLoss, onClick: () => props.onInputCommandChange(null) }, props.messages.common.cancel),
                  h("button", { type: "button", "data-primary": "true", disabled: isSubmitting.value, onMousedown: preventVuePointerFocusLoss, onClick: insertUpload }, props.messages.common.insert),
                ]),
              ])
                : props.commands.length
                  ? h("div", { class: "markweave-slash-command-list" }, groupedCommands.map((entry) =>
                      h("section", { key: entry.group, class: "markweave-slash-group", "aria-label": entry.group }, [
                        h("div", { class: "markweave-slash-group-title" }, entry.group),
                        ...entry.commands.map((command) => {
                          const flatIndex = props.commands.indexOf(command);
                          const active = flatIndex === props.state.activeIndex;
                          const executable = isExecutableSlashCommand(command);
                          return h(
                            "button",
                            {
                              key: command.id,
                              type: "button",
                              role: "option",
                              "aria-selected": active,
                              "aria-disabled": !executable || command.disabled ? "true" : undefined,
                              "data-active": active,
                              "data-disabled": command.disabled ? "true" : "false",
                              "data-execution-kind": command.executionKind,
                              "data-testid": `markweave-slash-command-${command.id}`,
                              title: command.disabledReason,
                              onMousedown: preventVuePointerFocusLoss,
                              onClick: () => {
                                if (!executable) {
                                  return;
                                }
                                if (command.inputKind) {
                                  props.onInputCommandChange(command);
                                  return;
                                }
                                props.onSelect(command);
                              },
                            },
                            [createSlashIcon(command.icon), h("span", null, command.label), command.disabledReason ? h("small", null, command.disabledReason) : null],
                          );
                        }),
                      ]),
                    ))
                  : h("div", { class: "markweave-slash-menu__empty", role: "option", "aria-disabled": "true" }, props.messages.slash.noResults),
          ],
        ),
      ];
    };
  },
});

const VueTableControls = defineComponent({
  name: "MarkweaveVueTableControls",
  props: {
    editor: { type: Object as PropType<CoreEditor>, required: true },
    active: { type: Boolean, required: true },
    interactionState: { type: Object as PropType<TableInteractionState>, required: true },
    messages: { type: Object as PropType<MarkweaveMessages>, required: true },
    onCopyPayload: { type: Function as PropType<((payload: MarkweaveMenuCopyPayload) => void) | undefined>, default: undefined },
    onCommandResult: { type: Function as PropType<((result: TableCommandResult) => void) | undefined>, default: undefined },
    onEditWithAi: { type: Function as PropType<((request: TableEditWithAiRequest) => void) | undefined>, default: undefined },
  },
  setup(props) {
    const openMenu = ref<TableMenuKind | null>(null);
    const menuAnchor = ref<TableMenuAnchor>("row-edge");
    const rowEdgePosition = ref<TableEdgeHandlePosition | null>(null);
    const columnEdgePosition = ref<TableEdgeHandlePosition | null>(null);
    const selectionEdgePosition = ref<TableEdgeHandlePosition | null>(null);
    const menuPosition = ref<TableMenuPosition | null>(null);
    const copyFeedback = ref<TableCopyFeedbackSnapshot | null>(null);
    const controlsRef = ref<HTMLElement | null>(null);
    const rowEdgeRef = ref<HTMLElement | null>(null);
    const columnEdgeRef = ref<HTMLElement | null>(null);
    const selectionEdgeRef = ref<HTMLElement | null>(null);
    const menuRef = ref<HTMLElement | null>(null);
    let copyFeedbackTimeout: number | null = null;

    const focusState = computed(() => (props.active ? getTableFocusState(props.editor.state) : outsideTableFocusState));
    const rowAxisModel = computed(() => getTableControlAxisSelectionModel(props.editor, props.interactionState, "row", focusState.value.activeCellPos));
    const columnAxisModel = computed(() => getTableControlAxisSelectionModel(props.editor, props.interactionState, "column", focusState.value.activeCellPos));
    const cellMenuCommands = computed(() => getAvailableCellMenuCommandSpecs(props.editor));
    const hasCellMenuCommands = computed(() => cellMenuCommands.value.length > 0);
    const menuItems = computed(() => (openMenu.value ? getTableMenuItems(props.editor, openMenu.value) : []));

    const clearCopyFeedbackTimeout = () => {
      if (copyFeedbackTimeout === null || typeof window === "undefined") {
        return;
      }
      window.clearTimeout(copyFeedbackTimeout);
      copyFeedbackTimeout = null;
    };

    const setCopyFeedbackSnapshot = (snapshot: TableCopyFeedbackSnapshot | null) => {
      clearCopyFeedbackTimeout();
      copyFeedback.value = snapshot;
      if (!snapshot || typeof window === "undefined") {
        return;
      }
      copyFeedbackTimeout = window.setTimeout(() => {
        copyFeedback.value = null;
        copyFeedbackTimeout = null;
      }, tableCopyFeedbackTimeoutMs);
    };

    const updateEdgePositions = () => {
      if (!props.active) {
        rowEdgePosition.value = null;
        columnEdgePosition.value = null;
        selectionEdgePosition.value = null;
        setCopyFeedbackSnapshot(null);
        return;
      }

      const frameElement = props.editor.view.dom.closest<HTMLElement>(".markweave-editor-frame") ?? props.editor.view.dom.parentElement;
      if (!frameElement) {
        rowEdgePosition.value = null;
        columnEdgePosition.value = null;
        selectionEdgePosition.value = null;
        return;
      }

      const frameRect = frameElement.getBoundingClientRect();
      const rowAxisRect = rowAxisModel.value ? getTableAxisTargetRect(props.editor, rowAxisModel.value) : null;
      const columnAxisRect = columnAxisModel.value ? getTableAxisTargetRect(props.editor, columnAxisModel.value) : null;
      const selectionRect = hasCellMenuCommands.value ? getTableSelectionTargetRect(props.editor) : null;

      if (rowAxisRect) {
        rowEdgePosition.value = calculateTableEdgeHandlePosition({ targetRect: rowAxisRect, frameRect, kind: "row" });
      } else if (!(openMenu.value === "row" && menuAnchor.value === "row-edge")) {
        rowEdgePosition.value = null;
      }

      if (columnAxisRect) {
        columnEdgePosition.value = calculateTableEdgeHandlePosition({ targetRect: columnAxisRect, frameRect, kind: "column" });
      } else if (!(openMenu.value === "column" && menuAnchor.value === "column-edge")) {
        columnEdgePosition.value = null;
      }

      if (selectionRect) {
        selectionEdgePosition.value = calculateTableEdgeHandlePosition({ targetRect: selectionRect, frameRect, kind: "selection" });
      } else if (!(openMenu.value === "selection" && menuAnchor.value === "selection-edge")) {
        selectionEdgePosition.value = null;
      }
    };

    const updateMenuPosition = () => {
      if (!props.active || !openMenu.value) {
        menuPosition.value = null;
        return;
      }

      const frameElement = props.editor.view.dom.closest<HTMLElement>(".markweave-editor-frame") ?? props.editor.view.dom.parentElement;
      const anchorElement =
        menuAnchor.value === "row-edge" ? rowEdgeRef.value : menuAnchor.value === "column-edge" ? columnEdgeRef.value : selectionEdgeRef.value;

      if (!frameElement || !anchorElement || !menuRef.value) {
        menuPosition.value = null;
        return;
      }

      const rawAnchorRect = anchorElement.getBoundingClientRect();
      const tableRect = openMenu.value === "row" ? getActiveTableElement(props.editor)?.getBoundingClientRect() : null;
      const anchorRect = tableRect
        ? {
            left: rawAnchorRect.left,
            top: tableRect.top,
            width: rawAnchorRect.width,
            height: rawAnchorRect.height,
          }
        : rawAnchorRect;
      const frameRect = frameElement.getBoundingClientRect();
      const menuRect = menuRef.value.getBoundingClientRect();
      menuPosition.value = calculateAnchoredTableMenuPosition({
        anchorRect,
        frameRect,
        menuSize: {
          width: menuRect.width || 204,
          height: menuRect.height || 220,
        },
        kind: openMenu.value,
      });
    };

    const updatePositions = () => {
      updateEdgePositions();
      updateMenuPosition();
    };

    const scheduleUpdatePositions = () => {
      void nextTick(updatePositions);
    };

    const toggleMenu = (menu: TableMenuKind, anchor: TableMenuAnchor) => {
      const shouldClose = openMenu.value === menu && menuAnchor.value === anchor;
      menuAnchor.value = anchor;
      openMenu.value = shouldClose ? null : menu;
      scheduleUpdatePositions();
    };

    const clearMenuAxisTarget = () => {
      props.editor.view.dispatch(setMarkweaveTableMenuAxisTarget(props.editor.state.tr, null));
    };

    const openAxisMenuFromEdge = (menu: "row" | "column", anchor: Extract<TableMenuAnchor, "row-edge" | "column-edge">) => {
      const targetCellPos = props.interactionState.hoverCellPos ?? focusState.value.activeCellPos;
      const visualIndex = props.interactionState.hoverCellPos === null ? null : menu === "row" ? props.interactionState.hoverVisualRowIndex : props.interactionState.hoverVisualColumnIndex;

      if (targetCellPos !== null) {
        selectTableAxisFromCell(props.editor, targetCellPos, menu, { visualIndex });
      }

      toggleMenu(menu, anchor);
    };

    const openSelectionMenuFromEdge = () => {
      clearMenuAxisTarget();
      toggleMenu("selection", "selection-edge");
    };

    const closeMenu = (focusEditor = false) => {
      openMenu.value = null;
      menuPosition.value = null;
      if (focusEditor) {
        props.editor.view.focus();
      }
    };

    const runMenuCommand = async (commandId: TableCommandId, menuOverride?: TableMenuKind) => {
      const result = await executeTableMenuCommand({
        editor: props.editor,
        commandId,
        menu: menuOverride ?? openMenu.value ?? "selection",
        messages: props.messages,
      });

      if (result.copyFeedback) {
        setCopyFeedbackSnapshot(result.copyFeedback);
        if (result.copyPayload) {
          props.onCopyPayload?.(result.copyPayload);
        }
      } else {
        setCopyFeedbackSnapshot(null);
      }

      props.onCommandResult?.(result.commandResult);
      return result.success;
    };

    const runEditWithAi = (source: TableEditWithAiRequest["source"]) => {
      const request = getTableEditWithAiRequest(props.editor, source);

      if (request) {
        props.onEditWithAi?.(request);
      }

      closeMenu(true);
    };

    const onDocumentKeydown = (event: KeyboardEvent) => {
      if (!openMenu.value || event.key !== "Escape") {
        return;
      }
      closeMenu(true);
    };

    const onDocumentMousedown = (event: MouseEvent) => {
      if (!openMenu.value) {
        return;
      }
      if (event.target instanceof Node && controlsRef.value?.contains(event.target)) {
        return;
      }
      closeMenu();
    };

    onMounted(() => {
      updatePositions();
      window.addEventListener("resize", updatePositions);
      window.addEventListener("scroll", updatePositions, true);
      document.addEventListener("keydown", onDocumentKeydown);
      document.addEventListener("mousedown", onDocumentMousedown);
    });

    onBeforeUnmount(() => {
      clearCopyFeedbackTimeout();
      window.removeEventListener("resize", updatePositions);
      window.removeEventListener("scroll", updatePositions, true);
      document.removeEventListener("keydown", onDocumentKeydown);
      document.removeEventListener("mousedown", onDocumentMousedown);
    });

    watch(
      () => [
        props.active,
        focusState.value.activeCellPos,
        focusState.value.selectionFrom,
        focusState.value.selectionTo,
        props.interactionState.hoverCellPos,
        props.interactionState.hoverVisualColumnIndex,
        props.interactionState.hoverVisualRowIndex,
        openMenu.value,
        menuAnchor.value,
      ],
      scheduleUpdatePositions,
      { flush: "post" },
    );

    const menu = () => {
      if (!openMenu.value) {
        return null;
      }

      return h(
        "div",
        {
          ref: menuRef,
          class: "markweave-table-menu",
          role: "menu",
          "aria-label": tableMenuLabel(openMenu.value, props.messages),
          "data-testid": "markweave-table-menu",
          "data-positioned": menuPosition.value ? "true" : "false",
          style: menuPosition.value ? { left: `${menuPosition.value.left}px`, top: `${menuPosition.value.top}px` } : undefined,
        },
        menuItems.value.map((item, index) => {
          const group = getTableMenuItemGroup(item);
          const previousGroup = index === 0 ? group : getTableMenuItemGroup(menuItems.value[index - 1]);
          const startsGroup = index > 0 && previousGroup !== group;
          const enabled = item.commandId === null ? Boolean(props.onEditWithAi) : canRunTableCommand(props.editor, item.commandId);
          const label = getTableMenuItemLabel(item, props.messages);

          return h(
            "button",
            {
              key: `${item.id}-${index}`,
              type: "button",
              role: "menuitem",
              "aria-label": label,
              "aria-disabled": !enabled,
              disabled: !enabled,
              "data-menu-group": group,
              "data-starts-group": startsGroup ? "true" : "false",
              "data-command-enabled": enabled ? "true" : "false",
              "data-testid": item.commandId ? `markweave-table-menu-command-${item.commandId}` : "markweave-table-menu-command-edit-with-ai",
              onMousedown: preventVuePointerFocusLoss,
              onClick: () => {
                if (!enabled) {
                  return;
                }
                if (item.commandId === null) {
                  runEditWithAi(openMenu.value === "row" || openMenu.value === "column" ? openMenu.value : "selection");
                  return;
                }
                void runMenuCommand(item.commandId).finally(() => closeMenu());
              },
            },
            label,
          );
        }),
      );
    };

    return () =>
      props.active
        ? h("div", { ref: controlsRef, class: "markweave-table-controls", "data-testid": "markweave-table-controls", "aria-label": props.messages.table.controlsAriaLabel, "data-open-menu": openMenu.value ?? "none", "data-positioned": rowEdgePosition.value || columnEdgePosition.value || selectionEdgePosition.value ? "true" : "false" }, [
            copyFeedback.value
              ? h("div", { class: "markweave-table-copy-feedback", role: "status", "aria-live": "polite", "data-testid": "markweave-table-copy-feedback", "data-copy-kind": copyFeedback.value.kind, "data-text-length": copyFeedback.value.textLength, "data-html-length": copyFeedback.value.htmlLength }, formatTableCopyFeedback(copyFeedback.value))
              : null,
            rowEdgePosition.value
              ? h("button", { ref: rowEdgeRef, type: "button", class: "markweave-table-edge-handle markweave-table-edge-handle--row", "aria-label": props.messages.table.activeRowActions, "aria-expanded": openMenu.value === "row" && menuAnchor.value === "row-edge", "aria-haspopup": "menu", title: props.messages.table.rowActions, "data-testid": "markweave-table-hover-row-handle", "data-axis-index": rowAxisModel.value?.index ?? "", "data-axis-selected-cells": rowAxisModel.value?.selectedCellCount ?? "", "data-axis-visual-cells": rowAxisModel.value?.visualCellCount ?? "", "data-axis-visual-size": rowAxisModel.value?.visualHeight ?? "", style: { left: `${rowEdgePosition.value.left}px`, top: `${rowEdgePosition.value.top}px` }, onMousedown: preventVuePointerFocusLoss, onClick: () => openAxisMenuFromEdge("row", "row-edge") }, [h("span", { "aria-hidden": "true" }, "...")])
              : null,
            columnEdgePosition.value
              ? h("button", { ref: columnEdgeRef, type: "button", class: "markweave-table-edge-handle markweave-table-edge-handle--column", "aria-label": props.messages.table.activeColumnActions, "aria-expanded": openMenu.value === "column" && menuAnchor.value === "column-edge", "aria-haspopup": "menu", title: props.messages.table.columnActions, "data-testid": "markweave-table-hover-column-handle", "data-axis-index": columnAxisModel.value?.index ?? "", "data-axis-selected-cells": columnAxisModel.value?.selectedCellCount ?? "", "data-axis-visual-cells": columnAxisModel.value?.visualCellCount ?? "", "data-axis-visual-size": columnAxisModel.value?.visualWidth ?? "", style: { left: `${columnEdgePosition.value.left}px`, top: `${columnEdgePosition.value.top}px` }, onMousedown: preventVuePointerFocusLoss, onClick: () => openAxisMenuFromEdge("column", "column-edge") }, [h("span", { "aria-hidden": "true" }, "...")])
              : null,
            hasCellMenuCommands.value && selectionEdgePosition.value
              ? h("button", { ref: selectionEdgeRef, type: "button", class: "markweave-table-edge-handle markweave-table-edge-handle--selection", "aria-label": props.messages.table.selectionActions, "aria-expanded": openMenu.value === "selection" && menuAnchor.value === "selection-edge", "aria-haspopup": "menu", title: props.messages.table.selectionActions, "data-testid": "markweave-table-cell-handle", style: { left: `${selectionEdgePosition.value.left}px`, top: `${selectionEdgePosition.value.top}px` }, onMousedown: preventVuePointerFocusLoss, onClick: openSelectionMenuFromEdge }, [h("span", { "aria-hidden": "true" }, "...")])
              : null,
            menu(),
          ])
        : null;
  },
});

const VueTableSelectionOverlay = defineComponent({
  name: "MarkweaveVueTableSelectionOverlay",
  props: {
    editor: { type: Object as PropType<CoreEditor>, required: true },
    focusState: { type: Object as PropType<TableFocusState>, required: true },
  },
  setup(props) {
    const overlayRect = ref<TableSelectionOverlayRect | null>(null);

    const updateOverlayRect = () => {
      if (props.focusState.mode !== "cell-selection") {
        overlayRect.value = null;
        return;
      }
      overlayRect.value = measureTableSelectionOverlay(props.editor, getTableSelectionOverlayState(props.editor.state));
    };

    onMounted(() => {
      updateOverlayRect();
      window.addEventListener("resize", updateOverlayRect);
      window.addEventListener("scroll", updateOverlayRect, true);
    });

    onBeforeUnmount(() => {
      window.removeEventListener("resize", updateOverlayRect);
      window.removeEventListener("scroll", updateOverlayRect, true);
    });

    watch(
      () => [
        props.focusState.activeCellPos,
        props.focusState.anchorCellPos,
        props.focusState.mode,
        props.focusState.selectedCellCount,
        props.focusState.selectionFrom,
        props.focusState.selectionTo,
      ],
      () => {
        void nextTick(updateOverlayRect);
      },
      { flush: "post" },
    );

    return () => {
      const rect = overlayRect.value;
      if (!rect) {
        return null;
      }

      return h("div", {
        "aria-hidden": "true",
        class: "markweave-table-selection-overlay",
        "data-anchor-cell-pos": rect.anchorCellPos ?? "",
        "data-head-cell-pos": rect.headCellPos ?? "",
        "data-selected-cells": rect.selectedCellCount,
        "data-visual-columns": rect.visualColumnCount,
        "data-visual-rows": rect.visualRowCount,
        "data-visual-slots": rect.visualSlotCount,
        "data-testid": "markweave-table-selection-overlay",
        style: {
          "--markweave-table-selection-columns": rect.visualColumnCount,
          "--markweave-table-selection-rows": rect.visualRowCount,
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        },
      });
    };
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
    const hoveredCodeBlockState = ref<MarkweaveCodeBlockState | null>(null);
    let frameElement: HTMLElement | null = null;
    const hoverEventNames = ["mousemove", "pointermove", "mouseover", "click"] as const;

    const displayedState = computed(() => (props.readOnly ? hoveredCodeBlockState.value ?? props.state : props.state));
    const visible = computed(() => (props.readOnly ? Boolean(displayedState.value.active && displayedState.value.text) : props.active && props.state.active));
    const copyDisplayedCodeBlock = () => {
      const text = displayedState.value.text;
      if (!text) {
        return;
      }
      void (globalThis.navigator?.clipboard?.writeText(text) ?? Promise.resolve(false));
    };

    const updateHoveredCodeBlock = (event: MouseEvent) => {
      if (!props.readOnly || !(event.target instanceof Element)) {
        return;
      }

      const pos = getCodeBlockPositionFromElement(props.editor, event.target);
      hoveredCodeBlockState.value = getCodeBlockStateAtPosition(props.editor, pos);
    };

    onMounted(() => {
      frameElement = props.editor.view.dom.closest<HTMLElement>(".markweave-editor-frame");
      hoverEventNames.forEach((eventName) => frameElement?.addEventListener(eventName, updateHoveredCodeBlock));
    });

    onBeforeUnmount(() => {
      hoverEventNames.forEach((eventName) => frameElement?.removeEventListener(eventName, updateHoveredCodeBlock));
      frameElement = null;
    });

    return () =>
      visible.value
        ? h("div", { class: "markweave-codeblock-controls", "data-testid": "markweave-codeblock-controls", "data-positioned": "false", "data-readonly": props.readOnly ? "true" : "false" }, [
            h("button", { type: "button", class: "markweave-codeblock-language-button", disabled: props.readOnly, title: displayedState.value.language, "data-testid": "markweave-codeblock-language" }, displayedState.value.language),
            displayedState.value.language === "mermaid"
              ? h(
                  "button",
                  {
                    type: "button",
                    class: "markweave-codeblock-preview-button",
                    "data-testid": "markweave-codeblock-mermaid-preview",
                    onClick: () => {
                      const nextMode = displayedState.value.mermaidPreviewMode === "preview" ? "code" : "preview";
                      if (props.readOnly && displayedState.value.pos !== null) {
                        setReadonlyMermaidPreviewMode(props.editor, displayedState.value.pos, nextMode);
                        hoveredCodeBlockState.value = getCodeBlockStateAtPosition(props.editor, displayedState.value.pos);
                        return;
                      }
                      setActiveCodeBlockMermaidPreviewMode(props.editor, nextMode);
                    },
                  },
                  displayedState.value.mermaidPreviewMode === "preview" ? "Code" : "Preview",
                )
              : null,
            h("button", { type: "button", class: "markweave-codeblock-copy-button", "data-testid": "markweave-codeblock-copy", onClick: () => (props.readOnly ? copyDisplayedCodeBlock() : copyActiveCodeBlock(props.editor)) }, "Copy"),
            displayedState.value.language === "mermaid" ? h("button", { type: "button", class: "markweave-codeblock-download-button", "data-testid": "markweave-codeblock-download" }, [createIcon(Download, "Download")]) : null,
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
      tableInteractionState,
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
          render.effectiveEditable.value
            ? h(VueTableControls, {
                editor,
                active: render.tableFocusState.value.active,
                interactionState: render.tableInteractionState.value,
                messages: render.messages,
                onCopyPayload: props.onTableCopyPayload,
                onCommandResult: props.onTableCommandResult,
                onEditWithAi: props.onEditWithAi,
              })
            : null,
          render.effectiveEditable.value ? h(VueTableSelectionOverlay, { editor, focusState: render.tableFocusState.value }) : null,
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
