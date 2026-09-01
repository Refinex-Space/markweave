import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { getMarkweaveDocumentLoadMeta } from "../../editor-core/document-load";
import { normalizeMermaidPreviewMode, type MermaidPreviewMode } from "../mermaid/mermaid-renderer";
import {
  defaultMarkweaveCodeBlockLanguages,
  formatCodeBlockLanguageLabel,
  localCodeBlockLanguageAliases,
  markweaveCodeBlockLanguages,
  type MarkweaveCodeBlockLanguage,
} from "./codeblock-language-catalog";

export {
  defaultMarkweaveCodeBlockLanguages,
  localCodeBlockLanguageAliases,
  markweaveCodeBlockLanguages,
  type MarkweaveCodeBlockLanguage,
} from "./codeblock-language-catalog";

export interface MarkweaveCodeBlockState {
  readonly active: boolean;
  readonly language: MarkweaveCodeBlockLanguage;
  readonly mermaidPreviewMode: MermaidPreviewMode;
  readonly pos: number | null;
  readonly text: string;
}

export interface CodeBlockClipboard {
  writeText(text: string): Promise<void>;
}

export type MarkweaveCodeBlockCopyStatus = "copied" | "failed";

export interface MarkweaveCodeBlockCopyFeedbackSnapshot {
  readonly status: MarkweaveCodeBlockCopyStatus;
  readonly label: string;
  readonly language: MarkweaveCodeBlockLanguage;
  readonly textLength: number;
}

interface CodeBlockCollapsePluginMeta {
  readonly type: "toggle" | "set";
  readonly key: string;
  readonly pos: number;
  readonly collapsed?: boolean;
}

interface CodeBlockContext {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

export const markweaveCodeBlockBehavior = {
  defaultLanguage: "text",
  tabSize: 2,
  exitOnTripleEnter: true,
  exitOnArrowDown: true,
  suppressFloatingToolbar: true,
} as const;

interface CollapsedCodeBlockSnapshot {
  readonly node: ProseMirrorNode;
}

export interface MarkweaveCodeBlockCollapsePluginState extends ReadonlySet<string> {
  readonly blocksByPos: ReadonlyMap<number, CollapsedCodeBlockSnapshot>;
  readonly decorations: DecorationSet;
}

export const codeBlockCollapsePluginKey =
  new PluginKey<MarkweaveCodeBlockCollapsePluginState>("markweaveCodeBlockCollapse");

function compactCodeBlockPrefix(content: string) {
  return content.substring(0, 50).replace(/\s/g, "").substring(0, 20);
}

function formatCodeBlockCollapsedLanguage(language: MarkweaveCodeBlockLanguage) {
  return formatCodeBlockLanguageLabel(language);
}

function countCodeBlockLines(content: string) {
  if (!content) {
    return 0;
  }

  return content.split(/\r\n|\r|\n/).length;
}

function formatCodeBlockCollapsedLines(content: string) {
  const lineCount = countCodeBlockLines(content);
  return `${lineCount} ${lineCount === 1 ? "line" : "lines"}`;
}

export function getCodeBlockCollapseKey(codeBlockPos: number, codeBlockNode: ProseMirrorNode) {
  const language = normalizeCodeBlockLanguage(codeBlockNode.attrs.language);
  const prefix = compactCodeBlockPrefix(codeBlockNode.textContent || "") || "empty";
  return `${language}-${prefix}-${codeBlockPos}`;
}

function isCodeBlockNode(node: ProseMirrorNode | null | undefined): node is ProseMirrorNode {
  return node?.type.name === "codeBlock";
}

export function isSelectionInsideCodeBlock(state: EditorState) {
  const { $from, $to } = state.selection;
  return $from.sameParent($to) && isCodeBlockNode($from.parent);
}

function selectActiveCodeBlockContent(editor: Editor) {
  const { state } = editor;

  if (!isSelectionInsideCodeBlock(state)) {
    return false;
  }

  const from = state.selection.$from.start();
  const to = state.selection.$from.end();
  editor.view.dispatch(
    state.tr.setSelection(TextSelection.create(state.doc, from, to)).scrollIntoView(),
  );
  return true;
}

function getActiveCodeBlockContext(state: EditorState) {
  const { selection } = state;
  const { $from } = selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);

    if (isCodeBlockNode(node)) {
      return {
        node,
        pos: depth === 0 ? 0 : $from.before(depth),
      };
    }
  }

  return null;
}

function getCodeBlockContextAtPos(state: EditorState, pos: number): CodeBlockContext | null {
  const node = state.doc.nodeAt(pos);

  if (!isCodeBlockNode(node)) {
    return null;
  }

  return {
    node,
    pos,
  };
}

function getCodeBlockContextAtDocumentPosition(state: EditorState, pos: number): CodeBlockContext | null {
  const normalizedPos = Math.max(0, Math.min(pos, state.doc.content.size));
  const directContext = getCodeBlockContextAtPos(state, normalizedPos);

  if (directContext) {
    return directContext;
  }

  const $position = state.doc.resolve(normalizedPos);

  for (let depth = $position.depth; depth > 0; depth -= 1) {
    const node = $position.node(depth);

    if (isCodeBlockNode(node)) {
      return {
        node,
        pos: $position.before(depth),
      };
    }
  }

  const nodeBefore = $position.nodeBefore;
  const nodeAfter = $position.nodeAfter;

  if (isCodeBlockNode(nodeBefore)) {
    return {
      node: nodeBefore,
      pos: normalizedPos - nodeBefore.nodeSize,
    };
  }

  if (isCodeBlockNode(nodeAfter)) {
    return {
      node: nodeAfter,
      pos: normalizedPos,
    };
  }

  return null;
}

function updateCodeBlockAttrsAtPos(editor: Editor, pos: number, attrs: Record<string, unknown>) {
  const context = getCodeBlockContextAtPos(editor.state, pos);

  if (!context) {
    return false;
  }

  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(context.pos, undefined, {
      ...context.node.attrs,
      ...attrs,
    }),
  );
  return true;
}

function getCodeBlockContextForElement(view: EditorView, codeBlockElement: HTMLElement): CodeBlockContext | null {
  try {
    const domPos = view.posAtDOM(codeBlockElement, 0);
    const context = getCodeBlockContextAtDocumentPosition(view.state, domPos);

    if (context && view.nodeDOM(context.pos) === codeBlockElement) {
      return context;
    }
  } catch {
    // A detached or foreign DOM node is not a valid editor target.
  }

  return null;
}

function setCodeBlockCollapsed(tr: Transaction, pos: number, key: string, collapsed: boolean) {
  return tr.setMeta(codeBlockCollapsePluginKey, { type: "set", key, pos, collapsed } satisfies CodeBlockCollapsePluginMeta);
}

function toggleCodeBlockCollapsed(tr: Transaction, pos: number, key: string) {
  return tr.setMeta(codeBlockCollapsePluginKey, { type: "toggle", key, pos } satisfies CodeBlockCollapsePluginMeta);
}

function createCodeBlockCollapseDecoration(pos: number, node: ProseMirrorNode) {
  const language = normalizeCodeBlockLanguage(node.attrs.language);

  return Decoration.node(pos, pos + node.nodeSize, {
    "data-markweave-collapsed": "true",
    "data-markweave-collapsed-language": formatCodeBlockCollapsedLanguage(language),
    "data-markweave-collapsed-lines": formatCodeBlockCollapsedLines(node.textContent),
  });
}

function createCodeBlockCollapseDecorations(
  doc: ProseMirrorNode,
  blocksByPos: ReadonlyMap<number, CollapsedCodeBlockSnapshot>,
) {
  if (blocksByPos.size === 0) {
    return DecorationSet.empty;
  }

  const decorations: Decoration[] = [];

  blocksByPos.forEach(({ node }, pos) => {
    decorations.push(createCodeBlockCollapseDecoration(pos, node));
  });

  return DecorationSet.create(doc, decorations);
}

function createCodeBlockCollapsePluginState(
  blocksByPos: ReadonlyMap<number, CollapsedCodeBlockSnapshot>,
  decorations: DecorationSet,
) {
  const keys = new Set<string>();

  blocksByPos.forEach(({ node }, pos) => {
    keys.add(getCodeBlockCollapseKey(pos, node));
  });

  Object.defineProperties(keys, {
    blocksByPos: {
      enumerable: false,
      value: blocksByPos,
    },
    decorations: {
      enumerable: false,
      value: decorations,
    },
  });

  return keys as unknown as MarkweaveCodeBlockCollapsePluginState;
}

function mapCollapsedCodeBlocks(
  transaction: Transaction,
  previous: MarkweaveCodeBlockCollapsePluginState,
) {
  const blocksByPos = new Map<number, CollapsedCodeBlockSnapshot>();
  let requiresRebuild = false;

  previous.blocksByPos.forEach((snapshot, oldPos) => {
    const mappedPos = transaction.mapping.map(oldPos, 1);
    const node = transaction.doc.nodeAt(mappedPos);

    if (!isCodeBlockNode(node)) {
      requiresRebuild = true;
      return;
    }

    blocksByPos.set(mappedPos, { node });
    requiresRebuild = requiresRebuild || node !== snapshot.node;
  });

  return { blocksByPos, requiresRebuild };
}

export const MarkweaveCodeBlockCollapse = Extension.create({
  name: "markweaveCodeBlockCollapse",
  priority: 650,

  addProseMirrorPlugins() {
    return [
      new Plugin<MarkweaveCodeBlockCollapsePluginState>({
        key: codeBlockCollapsePluginKey,
        state: {
          init: () => createCodeBlockCollapsePluginState(new Map(), DecorationSet.empty),
          apply(transaction, previous) {
            const meta = transaction.getMeta(codeBlockCollapsePluginKey) as CodeBlockCollapsePluginMeta | undefined;
            const documentLoadMeta = getMarkweaveDocumentLoadMeta(transaction);

            if (documentLoadMeta) {
              return createCodeBlockCollapsePluginState(new Map(), DecorationSet.empty);
            }

            if (!meta && !transaction.docChanged) {
              return previous;
            }

            const mapped = transaction.docChanged
              ? mapCollapsedCodeBlocks(transaction, previous)
              : {
                  blocksByPos: new Map(previous.blocksByPos),
                  requiresRebuild: false,
                };
            const blocksByPos = mapped.blocksByPos;
            let requiresRebuild = mapped.requiresRebuild;

            if (meta) {
              const node = transaction.doc.nodeAt(meta.pos);
              const currentlyCollapsed = blocksByPos.has(meta.pos) || previous.has(meta.key);
              const shouldCollapse = meta.type === "toggle" ? !currentlyCollapsed : Boolean(meta.collapsed);

              if (shouldCollapse && isCodeBlockNode(node)) {
                blocksByPos.set(meta.pos, { node });
              } else {
                blocksByPos.delete(meta.pos);
              }

              requiresRebuild = true;
            }

            const decorations = blocksByPos.size === 0
              ? DecorationSet.empty
              : requiresRebuild
                ? createCodeBlockCollapseDecorations(transaction.doc, blocksByPos)
                : previous.decorations.map(transaction.mapping, transaction.doc);

            return createCodeBlockCollapsePluginState(blocksByPos, decorations);
          },
        },
        props: {
          decorations(state) {
            return codeBlockCollapsePluginKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

export const MarkweaveCodeBlockClickFocus = Extension.create({
  name: "markweaveCodeBlockClickFocus",
  priority: 660,

  addKeyboardShortcuts() {
    return {
      "Mod-a": () => selectActiveCodeBlockContent(this.editor),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClick(view, pos, event) {
            const target = event.target;

            if (!(target instanceof HTMLElement)) {
              return false;
            }

            const codeBlockElement = target.closest<HTMLElement>("pre.markweave-code-block");

            if (!codeBlockElement || !view.dom.contains(codeBlockElement)) {
              return false;
            }

            if (codeBlockElement.getAttribute("data-markweave-collapsed") === "true") {
              const collapsedContext =
                getCodeBlockContextAtDocumentPosition(view.state, pos) ??
                getCodeBlockContextForElement(view, codeBlockElement);

              if (!collapsedContext) {
                return false;
              }

              const key = getCodeBlockCollapseKey(collapsedContext.pos, collapsedContext.node);
              const selectionPosition = collapsedContext.pos + 1;
              view.dispatch(
                setCodeBlockCollapsed(view.state.tr, collapsedContext.pos, key, false)
                  .setSelection(TextSelection.create(view.state.doc, selectionPosition)),
              );
              view.focus();
              return true;
            }

            const resolvedPosition = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });

            if (!resolvedPosition) {
              return false;
            }

            const $position = view.state.doc.resolve(resolvedPosition.pos);

            for (let depth = $position.depth; depth > 0; depth -= 1) {
              const node = $position.node(depth);

              if (!isCodeBlockNode(node)) {
                continue;
              }

              const start = $position.before(depth) + 1;
              const end = $position.after(depth) - 1;
              const selectionPosition = Math.min(Math.max(resolvedPosition.pos, start), end);
              view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selectionPosition)).scrollIntoView());
              view.focus();
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});

export function normalizeCodeBlockLanguage(language: unknown): MarkweaveCodeBlockLanguage {
  if (typeof language !== "string") {
    return markweaveCodeBlockBehavior.defaultLanguage;
  }

  return markweaveCodeBlockLanguages.includes(language as MarkweaveCodeBlockLanguage)
    ? (language as MarkweaveCodeBlockLanguage)
    : markweaveCodeBlockBehavior.defaultLanguage;
}

export function getActiveCodeBlockState(editor: Editor): MarkweaveCodeBlockState {
  const context = getActiveCodeBlockContext(editor.state);

  if (!context) {
    return {
      active: false,
      language: markweaveCodeBlockBehavior.defaultLanguage,
      mermaidPreviewMode: "code",
      pos: null,
      text: "",
    };
  }

  return {
    active: true,
    language: normalizeCodeBlockLanguage(context.node.attrs.language),
    mermaidPreviewMode: normalizeMermaidPreviewMode(context.node.attrs.mermaidPreviewMode),
    pos: context.pos,
    text: context.node.textContent,
  };
}

export function setActiveCodeBlockLanguage(editor: Editor, language: MarkweaveCodeBlockLanguage) {
  if (!getActiveCodeBlockState(editor).active) {
    return false;
  }

  return editor.chain().focus(undefined, { scrollIntoView: false }).updateAttributes("codeBlock", { language }).run();
}

export function setCodeBlockLanguageAtPosition(editor: Editor, pos: number, language: MarkweaveCodeBlockLanguage) {
  return updateCodeBlockAttrsAtPos(editor, pos, { language });
}

export function setActiveCodeBlockMermaidPreviewMode(editor: Editor, mode: MermaidPreviewMode) {
  const codeBlock = getActiveCodeBlockState(editor);

  if (!codeBlock.active || codeBlock.language !== "mermaid") {
    return false;
  }

  return editor.chain().focus(undefined, { scrollIntoView: false }).updateAttributes("codeBlock", { mermaidPreviewMode: mode }).run();
}

export function setCodeBlockMermaidPreviewModeAtPosition(editor: Editor, pos: number, mode: MermaidPreviewMode) {
  const context = getCodeBlockContextAtPos(editor.state, pos);

  if (!context || normalizeCodeBlockLanguage(context.node.attrs.language) !== "mermaid") {
    return false;
  }

  return updateCodeBlockAttrsAtPos(editor, pos, { mermaidPreviewMode: mode });
}

export function isActiveCodeBlockCollapsed(editor: Editor) {
  const context = getActiveCodeBlockContext(editor.state);

  if (!context) {
    return false;
  }

  const collapsedCodeBlocks = codeBlockCollapsePluginKey.getState(editor.state) ?? new Set();
  return collapsedCodeBlocks.has(getCodeBlockCollapseKey(context.pos, context.node));
}

export function setActiveCodeBlockCollapsed(editor: Editor, collapsed: boolean) {
  const context = getActiveCodeBlockContext(editor.state);

  if (!context) {
    return false;
  }

  const key = getCodeBlockCollapseKey(context.pos, context.node);
  editor.view.dispatch(setCodeBlockCollapsed(editor.state.tr, context.pos, key, collapsed));
  editor.view.focus();
  return true;
}

export function setCodeBlockCollapsedAtPosition(editor: Editor, codeBlockPos: number, collapsed: boolean) {
  const context = getCodeBlockContextAtPos(editor.state, codeBlockPos);

  if (!context) {
    return false;
  }

  const key = getCodeBlockCollapseKey(context.pos, context.node);
  editor.view.dispatch(setCodeBlockCollapsed(editor.state.tr, context.pos, key, collapsed));
  editor.view.focus();
  return true;
}

export function toggleActiveCodeBlockCollapsed(editor: Editor) {
  const context = getActiveCodeBlockContext(editor.state);

  if (!context) {
    return false;
  }

  const key = getCodeBlockCollapseKey(context.pos, context.node);
  editor.view.dispatch(toggleCodeBlockCollapsed(editor.state.tr, context.pos, key));
  editor.view.focus();
  return true;
}

export async function copyActiveCodeBlock(editor: Editor, clipboard: CodeBlockClipboard | undefined = globalThis.navigator?.clipboard) {
  const codeBlock = getActiveCodeBlockState(editor);

  if (!codeBlock.active || !clipboard) {
    return false;
  }

  try {
    await clipboard.writeText(codeBlock.text);
    return true;
  } catch {
    return false;
  }
}

export function getCodeBlockCopyFeedbackSnapshot(
  codeBlock: MarkweaveCodeBlockState,
  status: MarkweaveCodeBlockCopyStatus,
): MarkweaveCodeBlockCopyFeedbackSnapshot {
  return {
    status,
    label: status === "copied" ? "Code copied to clipboard" : "Code copy failed",
    language: codeBlock.language,
    textLength: codeBlock.text.length,
  };
}

export function formatCodeBlockCopyFeedback(snapshot: MarkweaveCodeBlockCopyFeedbackSnapshot) {
  return `${snapshot.label} | text ${snapshot.textLength} | ${snapshot.language}`;
}
