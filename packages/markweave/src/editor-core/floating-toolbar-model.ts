import type { Editor } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";
import type { FloatingToolbarAssistantRequest, FloatingToolbarAssistantSource } from "../core/public-types";
import { getMarkweaveMessages, type MarkweaveMessages } from "../i18n";
import { normalizeMarkweaveCalloutType, type MarkweaveCalloutType } from "../plugins/callout/callout-node";
import { normalizeMarkweaveIndentLevel } from "../plugins/indent/indent-extension";
import { normalizeMarkdownLinkHref } from "../plugins/markdown/markdown-input";
import { insertMarkweaveInlineMath } from "../plugins/math/math-ui-model";
import type { FloatingToolbarVariant } from "./selection-state";

export type FloatingToolbarButtonId =
  | "improve"
  | "block-type"
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "inline-code"
  | "link"
  | "color"
  | "more";
export type FloatingToolbarButtonGroup = "assistant" | "block" | "inline" | "link" | "color" | "more";
export type FloatingToolbarMenu = "block-type" | "link" | "color" | "more";
export type FloatingToolbarTextAlign = "left" | "center" | "right" | "justify";
export type FloatingToolbarTurnIntoId =
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "bullet-list"
  | "numbered-list"
  | "todo-list"
  | "quote"
  | "code-block";
export type FloatingToolbarMoreActionId =
  | "superscript"
  | "subscript"
  | "inline-math"
  | `align-${FloatingToolbarTextAlign}`
  | "decrease-indent"
  | "increase-indent";

export interface FloatingToolbarButtonModel {
  readonly id: FloatingToolbarButtonId;
  readonly label: string;
  readonly glyph: string;
  readonly active: boolean;
  readonly group: FloatingToolbarButtonGroup;
  readonly run: () => void;
}

export interface FloatingToolbarTooltipModel {
  readonly buttonId: string;
  readonly label: string;
  readonly active: boolean;
}

interface ToolbarButtonSpec {
  readonly id: FloatingToolbarButtonId;
  readonly label: string;
  readonly glyph: string;
  readonly group: FloatingToolbarButtonGroup;
  readonly active: (editor: Editor) => boolean;
  readonly run: (editor: Editor) => void;
  readonly variants: readonly FloatingToolbarVariant[];
}

export interface FloatingToolbarBlockType {
  readonly id: "paragraph" | `heading-${1 | 2 | 3}`;
  readonly label: string;
  readonly glyph: string;
  readonly level: 1 | 2 | 3 | null;
}

export interface FloatingToolbarTurnIntoOption {
  readonly id: FloatingToolbarTurnIntoId;
  readonly label: string;
  readonly glyph: string;
}

export interface FloatingToolbarColorOption {
  readonly id: "default" | "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red";
  readonly label: string;
  readonly value: string | null;
}

export interface FloatingToolbarMoreAction {
  readonly id: FloatingToolbarMoreActionId;
  readonly label: string;
  readonly group: "script" | "align" | "indent";
}

type FloatingToolbarWindowOpen = (url?: string | URL, target?: string, features?: string) => WindowProxy | null;

const defaultMarkweaveMessages = getMarkweaveMessages("zh");

const colorValues: readonly Omit<FloatingToolbarColorOption, "label">[] = [
  { id: "default", value: null },
  { id: "gray", value: "#6b7280" },
  { id: "brown", value: "#92400e" },
  { id: "orange", value: "#f97316" },
  { id: "yellow", value: "#ca8a04" },
  { id: "green", value: "#22c55e" },
  { id: "blue", value: "#3b82f6" },
  { id: "purple", value: "#a855f7" },
  { id: "pink", value: "#ec4899" },
  { id: "red", value: "#ef4444" },
];

const highlightColorValues: readonly Omit<FloatingToolbarColorOption, "label">[] = [
  { id: "default", value: null },
  { id: "gray", value: "#f3f4f6" },
  { id: "brown", value: "#f4eee8" },
  { id: "orange", value: "#ffedd5" },
  { id: "yellow", value: "#fef9c3" },
  { id: "green", value: "#dcfce7" },
  { id: "blue", value: "#dbeafe" },
  { id: "purple", value: "#ede9fe" },
  { id: "pink", value: "#fce7f3" },
  { id: "red", value: "#fee2e2" },
];

const defaultToolbarOrder: readonly FloatingToolbarButtonId[] = [
  "block-type",
  "bold",
  "italic",
  "underline",
  "strike",
  "inline-code",
  "link",
  "color",
  "more",
];

const tableCompactToolbarOrder: readonly FloatingToolbarButtonId[] = [
  "bold",
  "italic",
  "underline",
  "strike",
  "inline-code",
  "link",
  "color",
  "more",
];

const toolbarButtonSpecs: readonly ToolbarButtonSpec[] = [
  {
    id: "improve",
    label: "Improve",
    glyph: "Improve",
    group: "assistant",
    active: () => false,
    run: () => undefined,
    variants: ["default"],
  },
  {
    id: "block-type",
    label: "Block type",
    glyph: "Text",
    group: "block",
    active: () => false,
    run: () => undefined,
    variants: ["default"],
  },
  {
    id: "bold",
    label: "Bold",
    glyph: "B",
    group: "inline",
    active: (editor) => editor.isActive("bold"),
    run: (editor) => editor.chain().focus().toggleBold().run(),
    variants: ["default", "table-compact"],
  },
  {
    id: "italic",
    label: "Italic",
    glyph: "I",
    group: "inline",
    active: (editor) => editor.isActive("italic"),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
    variants: ["default", "table-compact"],
  },
  {
    id: "underline",
    label: "Underline",
    glyph: "U",
    group: "inline",
    active: (editor) => editor.isActive("underline"),
    run: (editor) => editor.chain().focus().toggleUnderline().run(),
    variants: ["default", "table-compact"],
  },
  {
    id: "strike",
    label: "Strikethrough",
    glyph: "S",
    group: "inline",
    active: (editor) => editor.isActive("strike"),
    run: (editor) => editor.chain().focus().toggleStrike().run(),
    variants: ["default", "table-compact"],
  },
  {
    id: "inline-code",
    label: "Inline code",
    glyph: "code",
    group: "inline",
    active: (editor) => editor.isActive("code"),
    run: (editor) => editor.chain().focus().toggleCode().run(),
    variants: ["default", "table-compact"],
  },
  {
    id: "link",
    label: "Link",
    glyph: "link",
    group: "link",
    active: (editor) => editor.isActive("link"),
    run: () => undefined,
    variants: ["default", "table-compact"],
  },
  {
    id: "color",
    label: "Color",
    glyph: "A",
    group: "color",
    active: (editor) => Boolean(editor.getAttributes("textStyle").color || editor.getAttributes("highlight").color),
    run: () => undefined,
    variants: ["default", "table-compact"],
  },
  {
    id: "more",
    label: "More",
    glyph: "more",
    group: "more",
    active: (editor) =>
      editor.isActive("subscript") ||
      editor.isActive("superscript") ||
      editor.isActive("inlineMath") ||
      editor.isActive({ textAlign: "center" }) ||
      editor.isActive({ textAlign: "right" }) ||
      editor.isActive({ textAlign: "justify" }) ||
      getCurrentFloatingToolbarIndentLevel(editor) > 0,
    run: () => undefined,
    variants: ["default", "table-compact"],
  },
];

export function getFloatingToolbarMessageSet(messages: MarkweaveMessages = defaultMarkweaveMessages) {
  return messages.floatingToolbar;
}

export function getFloatingToolbarBlockTypes(messages: MarkweaveMessages = defaultMarkweaveMessages): readonly FloatingToolbarBlockType[] {
  const toolbarMessages = getFloatingToolbarMessageSet(messages);

  return [
    { id: "paragraph", label: toolbarMessages.blockTypes.paragraph, glyph: toolbarMessages.blockTypes.paragraph, level: null },
    { id: "heading-1", label: toolbarMessages.blockTypes["heading-1"], glyph: toolbarMessages.blockTypes["heading-1"], level: 1 },
    { id: "heading-2", label: toolbarMessages.blockTypes["heading-2"], glyph: toolbarMessages.blockTypes["heading-2"], level: 2 },
    { id: "heading-3", label: toolbarMessages.blockTypes["heading-3"], glyph: toolbarMessages.blockTypes["heading-3"], level: 3 },
  ];
}

export function getFloatingToolbarTurnIntoOptions(messages: MarkweaveMessages = defaultMarkweaveMessages): readonly FloatingToolbarTurnIntoOption[] {
  const toolbarMessages = getFloatingToolbarMessageSet(messages);

  return [
    { id: "paragraph", label: toolbarMessages.turnInto.paragraph, glyph: "T" },
    { id: "heading-1", label: toolbarMessages.turnInto["heading-1"], glyph: "H1" },
    { id: "heading-2", label: toolbarMessages.turnInto["heading-2"], glyph: "H2" },
    { id: "heading-3", label: toolbarMessages.turnInto["heading-3"], glyph: "H3" },
    { id: "bullet-list", label: toolbarMessages.turnInto["bullet-list"], glyph: "bullet-list" },
    { id: "numbered-list", label: toolbarMessages.turnInto["numbered-list"], glyph: "numbered-list" },
    { id: "todo-list", label: toolbarMessages.turnInto["todo-list"], glyph: "todo-list" },
    { id: "quote", label: toolbarMessages.turnInto.quote, glyph: "quote" },
    { id: "code-block", label: toolbarMessages.turnInto["code-block"], glyph: "code-block" },
  ];
}

export function getFloatingToolbarTextColorOptions(messages: MarkweaveMessages = defaultMarkweaveMessages): readonly FloatingToolbarColorOption[] {
  const toolbarMessages = getFloatingToolbarMessageSet(messages);
  return colorValues.map((option) => ({ ...option, label: toolbarMessages.textColors[option.id] }));
}

export function getFloatingToolbarHighlightColorOptions(messages: MarkweaveMessages = defaultMarkweaveMessages): readonly FloatingToolbarColorOption[] {
  const toolbarMessages = getFloatingToolbarMessageSet(messages);
  return highlightColorValues.map((option) => ({ ...option, label: toolbarMessages.highlightColors[option.id] }));
}

export function getFloatingToolbarMoreActions(messages: MarkweaveMessages = defaultMarkweaveMessages): readonly FloatingToolbarMoreAction[] {
  const toolbarMessages = getFloatingToolbarMessageSet(messages);

  return [
    { id: "superscript", label: toolbarMessages.moreActions.superscript, group: "script" },
    { id: "subscript", label: toolbarMessages.moreActions.subscript, group: "script" },
    { id: "inline-math", label: toolbarMessages.moreActions["inline-math"], group: "script" },
    { id: "align-left", label: toolbarMessages.moreActions["align-left"], group: "align" },
    { id: "align-center", label: toolbarMessages.moreActions["align-center"], group: "align" },
    { id: "align-right", label: toolbarMessages.moreActions["align-right"], group: "align" },
    { id: "align-justify", label: toolbarMessages.moreActions["align-justify"], group: "align" },
    { id: "decrease-indent", label: toolbarMessages.moreActions["decrease-indent"], group: "indent" },
    { id: "increase-indent", label: toolbarMessages.moreActions["increase-indent"], group: "indent" },
  ];
}

export const floatingToolbarBlockTypes: readonly FloatingToolbarBlockType[] = getFloatingToolbarBlockTypes();
export const floatingToolbarTurnIntoOptions: readonly FloatingToolbarTurnIntoOption[] = getFloatingToolbarTurnIntoOptions();
export const floatingToolbarTextColorOptions: readonly FloatingToolbarColorOption[] = getFloatingToolbarTextColorOptions();
export const floatingToolbarHighlightColorOptions: readonly FloatingToolbarColorOption[] = getFloatingToolbarHighlightColorOptions();
export const floatingToolbarColorOptions = floatingToolbarTextColorOptions;
export const floatingToolbarMoreActions: readonly FloatingToolbarMoreAction[] = getFloatingToolbarMoreActions();

export function getFloatingToolbarLinkHref(editor: Editor) {
  const href = editor.getAttributes("link").href;
  return typeof href === "string" ? href : "";
}

export function applyFloatingToolbarLink(editor: Editor, href: string) {
  const normalizedHref = normalizeMarkdownLinkHref(href);

  if (!normalizedHref) {
    return false;
  }

  if (editor.isActive("link")) {
    return editor.chain().focus().extendMarkRange("link").setLink({ href: normalizedHref }).run();
  }

  return editor.chain().focus().setLink({ href: normalizedHref }).run();
}

export function removeFloatingToolbarLink(editor: Editor) {
  if (!editor.isActive("link")) {
    return false;
  }

  return editor.chain().focus().extendMarkRange("link").unsetLink().run();
}

export function openFloatingToolbarLinkHref(
  href: string,
  openWindow: FloatingToolbarWindowOpen | null = typeof window === "undefined" ? null : window.open.bind(window),
) {
  const normalizedHref = normalizeMarkdownLinkHref(href);

  if (!normalizedHref || !openWindow) {
    return false;
  }

  openWindow(normalizedHref, "_blank", "noopener,noreferrer");
  return true;
}

export function getCurrentFloatingToolbarBlockType(editor: Editor, messages: MarkweaveMessages = defaultMarkweaveMessages): FloatingToolbarBlockType {
  const blockTypes = getFloatingToolbarBlockTypes(messages);

  for (const blockType of blockTypes) {
    if (blockType.level !== null && editor.isActive("heading", { level: blockType.level })) {
      return blockType;
    }
  }

  return blockTypes[0];
}

export function setFloatingToolbarBlockType(editor: Editor, level: FloatingToolbarBlockType["level"]) {
  if (level === null) {
    return editor.chain().focus().setParagraph().run();
  }

  return editor.chain().focus().setHeading({ level }).run();
}

export function setFloatingToolbarTurnInto(editor: Editor, id: FloatingToolbarTurnIntoId) {
  if (id === "paragraph") {
    return setFloatingToolbarBlockType(editor, null);
  }

  if (id === "heading-1" || id === "heading-2" || id === "heading-3") {
    return setFloatingToolbarBlockType(editor, Number(id.at(-1)) as 1 | 2 | 3);
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

  return editor.chain().focus().setCodeBlock().run();
}

export function setFloatingToolbarHighlightColor(editor: Editor, color: string | null) {
  if (color === null) {
    return editor.chain().focus().unsetHighlight().run();
  }

  return editor.chain().focus().setHighlight({ color }).run();
}

export function setFloatingToolbarTextColor(editor: Editor, color: string | null) {
  if (color === null) {
    return editor.chain().focus().unsetColor().run();
  }

  return editor.chain().focus().setColor(color).run();
}

export function setFloatingToolbarTextAlign(editor: Editor, alignment: FloatingToolbarTextAlign) {
  if (alignment === "left") {
    return editor.chain().focus().unsetTextAlign().run();
  }

  return editor.chain().focus().setTextAlign(alignment).run();
}

export function insertFloatingToolbarInlineMath(editor: Editor, latex?: string) {
  const { from, to } = editor.state.selection;
  const selectedText = editor.state.doc.textBetween(from, to, " ", " ").trim();
  const resolvedLatex = ((latex ?? selectedText) || "x").trim();
  return insertMarkweaveInlineMath(editor, resolvedLatex);
}

export function increaseFloatingToolbarIndent(editor: Editor) {
  if (editor.isActive("listItem") && editor.chain().focus().sinkListItem("listItem").run()) {
    return true;
  }

  if (editor.isActive("taskItem") && editor.chain().focus().sinkListItem("taskItem").run()) {
    return true;
  }

  return editor.chain().focus().increaseMarkweaveIndent().run();
}

export function decreaseFloatingToolbarIndent(editor: Editor) {
  if (editor.isActive("listItem") && editor.chain().focus().liftListItem("listItem").run()) {
    return true;
  }

  if (editor.isActive("taskItem") && editor.chain().focus().liftListItem("taskItem").run()) {
    return true;
  }

  return editor.chain().focus().decreaseMarkweaveIndent().run();
}

export function runFloatingToolbarMoreAction(editor: Editor, id: FloatingToolbarMoreActionId) {
  if (id === "superscript") {
    return editor.chain().focus().toggleSuperscript().run();
  }

  if (id === "subscript") {
    return editor.chain().focus().toggleSubscript().run();
  }

  if (id === "inline-math") {
    return insertFloatingToolbarInlineMath(editor);
  }

  if (id === "align-left" || id === "align-center" || id === "align-right" || id === "align-justify") {
    return setFloatingToolbarTextAlign(editor, id.replace("align-", "") as FloatingToolbarTextAlign);
  }

  if (id === "decrease-indent") {
    return decreaseFloatingToolbarIndent(editor);
  }

  return increaseFloatingToolbarIndent(editor);
}

export function getCurrentFloatingToolbarIndentLevel(editor: Editor) {
  const { $from } = editor.state.selection;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);

    if (node.type.name === "paragraph" || node.type.name === "heading") {
      return normalizeMarkweaveIndentLevel(node.attrs.markweaveIndentLevel);
    }
  }

  return 0;
}

export function setFloatingToolbarCalloutType(editor: Editor, type: MarkweaveCalloutType) {
  const normalizedType = normalizeMarkweaveCalloutType(type);

  if (editor.isActive("markweaveCallout")) {
    return editor.chain().focus().updateAttributes("markweaveCallout", { type: normalizedType }).run();
  }

  return editor.chain().focus().toggleWrap("markweaveCallout", { type: normalizedType }).run();
}

export function createFloatingToolbarAssistantRequest(editor: Editor, source: FloatingToolbarAssistantSource): FloatingToolbarAssistantRequest {
  const { selection } = editor.state;
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const text = editor.state.doc.textBetween(from, to, "\n\n", "\n");

  return {
    source,
    from,
    to,
    text,
    html: serializeSelectedHtml(editor),
  };
}

export function getFloatingToolbarButtonCount(variant: FloatingToolbarVariant) {
  return getFloatingToolbarButtonSpecs(variant).length;
}

export function getFloatingToolbarButtonModels(
  editor: Editor,
  variant: FloatingToolbarVariant,
  messages: MarkweaveMessages = defaultMarkweaveMessages,
): readonly FloatingToolbarButtonModel[] {
  const toolbarMessages = getFloatingToolbarMessageSet(messages);

  return getFloatingToolbarButtonSpecs(variant).map((button) => {
    const blockType = button.id === "block-type" ? getCurrentFloatingToolbarBlockType(editor, messages) : null;
    const label = toolbarMessages.buttons[button.id] ?? button.label;

    return {
      id: button.id,
      label,
      glyph: blockType?.glyph ?? (button.id === "improve" ? label : button.glyph),
      active: button.active(editor),
      group: button.group,
      run: () => button.run(editor),
    };
  });
}

export function getFloatingToolbarTooltipModel(button: FloatingToolbarButtonModel | null): FloatingToolbarTooltipModel | null {
  if (!button) {
    return null;
  }

  return {
    buttonId: button.id,
    label: button.label,
    active: button.active,
  };
}

export function preventFloatingToolbarPointerFocusLoss(event: Pick<Event, "preventDefault">) {
  event.preventDefault();
}

export function getFloatingToolbarButtonSpecs(variant: FloatingToolbarVariant) {
  const order = variant === "default" ? defaultToolbarOrder : variant === "table-compact" ? tableCompactToolbarOrder : [];
  return order
    .map((id) => toolbarButtonSpecs.find((button) => button.id === id && button.variants.includes(variant)))
    .filter((button): button is ToolbarButtonSpec => Boolean(button));
}

export function isFloatingToolbarTurnIntoActive(editor: Editor, id: FloatingToolbarTurnIntoId) {
  if (id === "paragraph") {
    return editor.isActive("paragraph");
  }

  if (id === "heading-1" || id === "heading-2" || id === "heading-3") {
    return editor.isActive("heading", { level: Number(id.at(-1)) });
  }

  if (id === "bullet-list") {
    return editor.isActive("bulletList");
  }

  if (id === "numbered-list") {
    return editor.isActive("orderedList");
  }

  if (id === "todo-list") {
    return editor.isActive("taskList");
  }

  if (id === "quote") {
    return editor.isActive("blockquote");
  }

  return editor.isActive("codeBlock");
}

export function isFloatingToolbarMoreActionActive(editor: Editor, id: FloatingToolbarMoreActionId) {
  if (id === "superscript") {
    return editor.isActive("superscript");
  }

  if (id === "subscript") {
    return editor.isActive("subscript");
  }

  if (id === "inline-math") {
    return editor.isActive("inlineMath");
  }

  if (id === "align-left") {
    return !editor.isActive({ textAlign: "center" }) && !editor.isActive({ textAlign: "right" }) && !editor.isActive({ textAlign: "justify" });
  }

  if (id === "align-center" || id === "align-right" || id === "align-justify") {
    return editor.isActive({ textAlign: id.replace("align-", "") });
  }

  if (id === "decrease-indent") {
    return getCurrentFloatingToolbarIndentLevel(editor) > 0;
  }

  return false;
}

function serializeSelectedHtml(editor: Editor) {
  if (typeof document === "undefined") {
    return "";
  }

  const selectedContent = editor.state.selection.content();
  const container = document.createElement("div");
  container.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(selectedContent.content));
  return container.innerHTML;
}
