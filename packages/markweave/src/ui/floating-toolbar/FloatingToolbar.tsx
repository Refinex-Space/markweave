import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { DOMSerializer } from "@tiptap/pm/model";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
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
  type FloatingToolbarVariant,
} from "../../editor-core/selection-state";
import { normalizeMarkweaveCalloutType, type MarkweaveCalloutType } from "../../plugins/callout/callout-node";
import { normalizeMarkweaveIndentLevel } from "../../plugins/indent/indent-extension";

interface FloatingToolbarProps {
  readonly editor: Editor;
  readonly selectionSnapshot: EditorSelectionSnapshot | null;
  readonly onRewriteSelection?: (request: FloatingToolbarAssistantRequest) => void;
  readonly onExtractToNote?: (request: FloatingToolbarAssistantRequest) => void;
}

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
export type FloatingToolbarAssistantSource = "rewrite-selection" | "extract-to-note";
export type FloatingToolbarMenu = "block-type" | "color" | "more";
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

export interface FloatingToolbarAssistantRequest {
  readonly source: FloatingToolbarAssistantSource;
  readonly from: number;
  readonly to: number;
  readonly text: string;
  readonly html: string;
}

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

export type FloatingToolbarLinkPrompt = (message: string, defaultValue: string) => string | null;

export const floatingToolbarBlockTypes: readonly FloatingToolbarBlockType[] = [
  { id: "paragraph", label: "Text", glyph: "Text", level: null },
  { id: "heading-1", label: "Heading 1", glyph: "Heading 1", level: 1 },
  { id: "heading-2", label: "Heading 2", glyph: "Heading 2", level: 2 },
  { id: "heading-3", label: "Heading 3", glyph: "Heading 3", level: 3 },
];

export const floatingToolbarTurnIntoOptions: readonly FloatingToolbarTurnIntoOption[] = [
  { id: "paragraph", label: "Text", glyph: "T" },
  { id: "heading-1", label: "Heading 1", glyph: "H1" },
  { id: "heading-2", label: "Heading 2", glyph: "H2" },
  { id: "heading-3", label: "Heading 3", glyph: "H3" },
  { id: "bullet-list", label: "Bulleted list", glyph: "bullet-list" },
  { id: "numbered-list", label: "Numbered list", glyph: "numbered-list" },
  { id: "todo-list", label: "To-do list", glyph: "todo-list" },
  { id: "quote", label: "Blockquote", glyph: "quote" },
  { id: "code-block", label: "Code block", glyph: "code-block" },
];

export const floatingToolbarTextColorOptions: readonly FloatingToolbarColorOption[] = [
  { id: "default", label: "Default text", value: null },
  { id: "gray", label: "Gray text", value: "#6b7280" },
  { id: "brown", label: "Brown text", value: "#92400e" },
  { id: "orange", label: "Orange text", value: "#f97316" },
  { id: "yellow", label: "Yellow text", value: "#ca8a04" },
  { id: "green", label: "Green text", value: "#22c55e" },
  { id: "blue", label: "Blue text", value: "#3b82f6" },
  { id: "purple", label: "Purple text", value: "#a855f7" },
  { id: "pink", label: "Pink text", value: "#ec4899" },
  { id: "red", label: "Red text", value: "#ef4444" },
];

export const floatingToolbarHighlightColorOptions: readonly FloatingToolbarColorOption[] = [
  { id: "default", label: "Default highlight", value: null },
  { id: "gray", label: "Gray highlight", value: "#f3f4f6" },
  { id: "brown", label: "Brown highlight", value: "#f4eee8" },
  { id: "orange", label: "Orange highlight", value: "#ffedd5" },
  { id: "yellow", label: "Yellow highlight", value: "#fef9c3" },
  { id: "green", label: "Green highlight", value: "#dcfce7" },
  { id: "blue", label: "Blue highlight", value: "#dbeafe" },
  { id: "purple", label: "Purple highlight", value: "#ede9fe" },
  { id: "pink", label: "Pink highlight", value: "#fce7f3" },
  { id: "red", label: "Red highlight", value: "#fee2e2" },
];

export const floatingToolbarColorOptions = floatingToolbarTextColorOptions;

export const floatingToolbarMoreActions: readonly FloatingToolbarMoreAction[] = [
  { id: "superscript", label: "Superscript", group: "script" },
  { id: "subscript", label: "Subscript", group: "script" },
  { id: "inline-math", label: "Inline math", group: "script" },
  { id: "align-left", label: "Align left", group: "align" },
  { id: "align-center", label: "Align center", group: "align" },
  { id: "align-right", label: "Align right", group: "align" },
  { id: "align-justify", label: "Justify", group: "align" },
  { id: "decrease-indent", label: "Decrease indent", group: "indent" },
  { id: "increase-indent", label: "Increase indent", group: "indent" },
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
    run: (editor) => {
      runFloatingToolbarLinkCommand(editor);
    },
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

function getDefaultFloatingToolbarLinkPrompt(): FloatingToolbarLinkPrompt | null {
  return typeof window === "undefined" || typeof window.prompt !== "function" ? null : window.prompt.bind(window);
}

export function runFloatingToolbarLinkCommand(
  editor: Editor,
  prompt: FloatingToolbarLinkPrompt | null = getDefaultFloatingToolbarLinkPrompt(),
) {
  if (!prompt) {
    return false;
  }

  const previousHref = editor.getAttributes("link").href as string | undefined;
  const href = prompt("Link URL", previousHref ?? "https://");

  if (href === null) {
    return false;
  }

  const normalizedHref = href.trim();

  if (normalizedHref === "") {
    return editor.chain().focus().extendMarkRange("link").unsetLink().run();
  }

  if (editor.isActive("link")) {
    return editor.chain().focus().extendMarkRange("link").setLink({ href: normalizedHref }).run();
  }

  return editor.chain().focus().setLink({ href: normalizedHref }).run();
}

export function getCurrentFloatingToolbarBlockType(editor: Editor): FloatingToolbarBlockType {
  for (const blockType of floatingToolbarBlockTypes) {
    if (blockType.level !== null && editor.isActive("heading", { level: blockType.level })) {
      return blockType;
    }
  }

  return floatingToolbarBlockTypes[0];
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

  if (!resolvedLatex) {
    return false;
  }

  if (from !== to) {
    return editor.chain().focus().deleteRange({ from, to }).insertInlineMath({ latex: resolvedLatex }).run();
  }

  return editor.chain().focus().insertInlineMath({ latex: resolvedLatex }).run();
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

export function getFloatingToolbarButtonModels(editor: Editor, variant: FloatingToolbarVariant): readonly FloatingToolbarButtonModel[] {
  return getFloatingToolbarButtonSpecs(variant).map((button) => {
    const blockType = button.id === "block-type" ? getCurrentFloatingToolbarBlockType(editor) : null;

    return {
      id: button.id,
      label: button.label,
      glyph: blockType?.glyph ?? button.glyph,
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

export function preventFloatingToolbarPointerFocusLoss(event: Pick<ReactMouseEvent<HTMLElement>, "preventDefault">) {
  event.preventDefault();
}

function getFloatingToolbarButtonSpecs(variant: FloatingToolbarVariant) {
  const order = variant === "default" ? defaultToolbarOrder : variant === "table-compact" ? tableCompactToolbarOrder : [];
  return order
    .map((id) => toolbarButtonSpecs.find((button) => button.id === id && button.variants.includes(variant)))
    .filter((button): button is ToolbarButtonSpec => Boolean(button));
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

function getNativeSelectionDomRects(editor: Editor) {
  const ownerDocument = editor.view.dom.ownerDocument;
  const nativeSelection = ownerDocument.getSelection();

  if (!nativeSelection || nativeSelection.rangeCount === 0 || nativeSelection.isCollapsed || !isNativeSelectionInsideEditor(editor, nativeSelection)) {
    return null;
  }

  const range = nativeSelection.getRangeAt(0);
  const clientRects = Array.from(range.getClientRects())
    .filter(isMeasurableToolbarRect)
    .map((rect) => createToolbarDomRect(rect.left, rect.top, rect.width, rect.height));

  if (clientRects.length > 0) {
    return clientRects;
  }

  const boundingRect = range.getBoundingClientRect();
  return isMeasurableToolbarRect(boundingRect) ? [createToolbarDomRect(boundingRect.left, boundingRect.top, boundingRect.width, boundingRect.height)] : null;
}

function getProseMirrorSelectionDomRects(editor: Editor) {
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

function getCurrentSelectionDomRects(editor: Editor) {
  return getNativeSelectionDomRects(editor) ?? getProseMirrorSelectionDomRects(editor);
}

function getCurrentSelectionDomRect(editor: Editor) {
  const rects = getCurrentSelectionDomRects(editor);
  return rects && rects.length > 0 ? combineToolbarDomRects(rects) : null;
}

function getFloatingToolbarSelectionVirtualElement(editor: Editor) {
  return {
    getBoundingClientRect: () => getCurrentSelectionDomRect(editor) ?? createToolbarDomRect(0, 0, 0, 0),
    getClientRects: () => {
      return getCurrentSelectionDomRects(editor) ?? [];
    },
  };
}

function isMenuButton(id: FloatingToolbarButtonId): id is FloatingToolbarMenu {
  return id === "block-type" || id === "color" || id === "more";
}

function isFloatingToolbarTurnIntoActive(editor: Editor, id: FloatingToolbarTurnIntoId) {
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

function isFloatingToolbarMoreActionActive(editor: Editor, id: FloatingToolbarMoreActionId) {
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

function runAssistantAction(
  editor: Editor,
  source: FloatingToolbarAssistantSource,
  callback: ((request: FloatingToolbarAssistantRequest) => void) | undefined,
) {
  callback?.(createFloatingToolbarAssistantRequest(editor, source));
  editor.commands.focus();
}

export function FloatingToolbar({ editor, selectionSnapshot, onRewriteSelection }: FloatingToolbarProps) {
  const stableToolbarState = getFloatingToolbarState(selectionSnapshot, { editable: editor.isEditable });
  const [toolbarState, setToolbarState] = useState(stableToolbarState);
  const [tooltipButtonId, setTooltipButtonId] = useState<FloatingToolbarButtonId | FloatingToolbarMoreActionId | null>(null);
  const [tooltipAnchorX, setTooltipAnchorX] = useState<number | null>(null);
  const [openMenu, setOpenMenu] = useState<FloatingToolbarMenu | null>(null);
  const [frameShiftPx, setFrameShiftPx] = useState(0);
  const [topBoundaryPaddingPx, setTopBoundaryPaddingPx] = useState(stableToolbarState.boundaryPadding);
  const frameShiftRef = useRef(0);
  const toolbarRootRef = useRef<HTMLDivElement | null>(null);
  const toolbarContentRef = useRef<HTMLDivElement | null>(null);
  const visibleButtons = getFloatingToolbarButtonModels(editor, toolbarState.variant);
  const tooltipModel = getFloatingToolbarTooltipModel(visibleButtons.find((button) => button.id === tooltipButtonId) ?? null);
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
    if (openMenu === "more" && floatingToolbarMoreActions.some((action) => action.id === tooltipButtonId)) {
      return;
    }

    if (!visibleButtons.some((button) => button.id === tooltipButtonId)) {
      setTooltipButtonId(null);
      setTooltipAnchorX(null);
    }
  }, [openMenu, tooltipButtonId, visibleButtons]);

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

  const runButton = (button: FloatingToolbarButtonModel) => {
    if (isMenuButton(button.id)) {
      const menuId = button.id;
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
        {openMenu === "block-type" ? <TurnIntoMenu editor={editor} onClose={() => setOpenMenu(null)} /> : null}
        {openMenu === "color" ? <ColorMenu editor={editor} onClose={() => setOpenMenu(null)} /> : null}
        {openMenu === "more" ? (
          <MoreMenu editor={editor} activeTooltipId={tooltipButtonId} onTooltipChange={setTooltipButtonId} onClose={() => setOpenMenu(null)} />
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
  readonly onPointerDown: (event: Pick<ReactMouseEvent<HTMLElement>, "preventDefault">) => void;
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

function TurnIntoMenu({ editor, onClose }: { readonly editor: Editor; readonly onClose: () => void }) {
  return (
    <div className="markweave-floating-toolbar-popover markweave-floating-toolbar-turn-menu" data-testid="markweave-floating-toolbar-turn-menu">
      <div className="markweave-floating-toolbar-menu-title">Turn Into</div>
      {floatingToolbarTurnIntoOptions.map((option) => (
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

function ColorMenu({ editor, onClose }: { readonly editor: Editor; readonly onClose: () => void }) {
  const activeTextColor = editor.getAttributes("textStyle").color as string | undefined;
  const activeHighlightColor = editor.getAttributes("highlight").color as string | undefined;

  return (
    <div className="markweave-floating-toolbar-popover markweave-floating-toolbar-color-popover" data-testid="markweave-floating-toolbar-color-menu">
      <ColorSection
        title="Text Color"
        mode="text"
        activeColor={activeTextColor ?? null}
        options={floatingToolbarTextColorOptions}
        onSelect={(color) => {
          setFloatingToolbarTextColor(editor, color);
          onClose();
        }}
      />
      <ColorSection
        title="Highlight Color"
        mode="highlight"
        activeColor={activeHighlightColor ?? null}
        options={floatingToolbarHighlightColorOptions}
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
  activeTooltipId,
  onTooltipChange,
  onClose,
}: {
  readonly editor: Editor;
  readonly activeTooltipId: FloatingToolbarButtonId | FloatingToolbarMoreActionId | null;
  readonly onTooltipChange: (buttonId: FloatingToolbarButtonId | FloatingToolbarMoreActionId | null) => void;
  readonly onClose: () => void;
}) {
  return (
    <div className="markweave-floating-toolbar-popover markweave-floating-toolbar-more-menu" data-testid="markweave-floating-toolbar-more-menu">
      {floatingToolbarMoreActions.map((action, index) => (
        <MoreMenuButton
          key={action.id}
          action={action}
          active={isFloatingToolbarMoreActionActive(editor, action.id)}
          tooltipActive={activeTooltipId === action.id}
          showDivider={index > 0 && floatingToolbarMoreActions[index - 1].group !== action.group}
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
  | "increase-indent";

const floatingToolbarIconMap: Record<FloatingToolbarIconName, LucideIcon> = {
  sparkles: Sparkles,
  "chevron-down": ChevronDown,
  "chevron-up": ChevronUp,
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
};

function Icon({ name }: { readonly name: FloatingToolbarIconName }) {
  const Lucide = floatingToolbarIconMap[name];

  return <Lucide aria-hidden="true" absoluteStrokeWidth size={18} strokeWidth={1.6} />;
}
