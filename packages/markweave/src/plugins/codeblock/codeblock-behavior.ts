import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { normalizeMermaidPreviewMode, type MermaidPreviewMode } from "../mermaid/mermaid-renderer";

export const defaultMarkweaveCodeBlockLanguages = [
  "angular-html",
  "css",
  "fsharp",
  "go",
  "hjson",
  "html",
  "html-derivative",
  "java",
  "javascript",
  "json",
  "json5",
  "jsonc",
  "jsonl",
  "jsonnet",
  "markdown",
  "mermaid",
  "nushell",
  "plsql",
  "postcss",
  "powershell",
  "python",
  "rust",
  "scss",
  "shellscript",
  "shellsession",
  "sql",
  "tsx",
  "typescript",
  "vue-html",
  "vyper",
  "yaml",
] as const;

export const localCodeBlockLanguageAliases = ["js", "ts"] as const;

export const markweaveCodeBlockLanguages = [
  "text",
  ...defaultMarkweaveCodeBlockLanguages,
  ...localCodeBlockLanguageAliases,
] as const;

export type MarkweaveCodeBlockLanguage = (typeof markweaveCodeBlockLanguages)[number];

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

export const codeBlockCollapsePluginKey = new PluginKey<ReadonlySet<string>>("markweaveCodeBlockCollapse");

function compactCodeBlockPrefix(content: string) {
  return content.substring(0, 50).replace(/\s/g, "").substring(0, 20);
}

function formatCodeBlockCollapsedLanguage(language: MarkweaveCodeBlockLanguage) {
  const labels: Partial<Record<MarkweaveCodeBlockLanguage, string>> = {
    "angular-html": "Angular HTML",
    css: "CSS",
    fsharp: "F#",
    hjson: "Hjson",
    html: "HTML",
    "html-derivative": "HTML derivative",
    java: "Java",
    javascript: "JavaScript",
    js: "JavaScript",
    json: "JSON",
    json5: "JSON5",
    jsonc: "JSONC",
    jsonl: "JSONL",
    jsonnet: "Jsonnet",
    markdown: "Markdown",
    mermaid: "Mermaid",
    plsql: "PL/SQL",
    postcss: "PostCSS",
    powershell: "PowerShell",
    python: "Python",
    rust: "Rust",
    scss: "SCSS",
    shellscript: "Shell",
    shellsession: "Shell Session",
    sql: "SQL",
    text: "Plain Text",
    ts: "TypeScript",
    tsx: "TSX",
    typescript: "TypeScript",
    "vue-html": "Vue HTML",
    yaml: "YAML",
  };

  return (
    labels[language] ??
    language
      .split("-")
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(" ")
  );
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

function getCodeBlockContextForElement(view: EditorView, codeBlockElement: HTMLElement): CodeBlockContext | null {
  let context: CodeBlockContext | null = null;

  view.state.doc.descendants((node, pos) => {
    if (!isCodeBlockNode(node)) {
      return true;
    }

    if (view.nodeDOM(pos) === codeBlockElement) {
      context = { node, pos };
      return false;
    }

    return false;
  });

  return context;
}

function setCodeBlockCollapsed(tr: Transaction, key: string, collapsed: boolean) {
  return tr.setMeta(codeBlockCollapsePluginKey, { type: "set", key, collapsed } satisfies CodeBlockCollapsePluginMeta);
}

function toggleCodeBlockCollapsed(tr: Transaction, key: string) {
  return tr.setMeta(codeBlockCollapsePluginKey, { type: "toggle", key } satisfies CodeBlockCollapsePluginMeta);
}

function createCodeBlockCollapseDecorations(state: EditorState, collapsedCodeBlocks: ReadonlySet<string>) {
  const decorations: Decoration[] = [];

  state.doc.descendants((node, pos) => {
    if (!isCodeBlockNode(node)) {
      return true;
    }

    const key = getCodeBlockCollapseKey(pos, node);

    if (collapsedCodeBlocks.has(key)) {
      const language = normalizeCodeBlockLanguage(node.attrs.language);

      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          "data-markweave-collapsed": "true",
          "data-markweave-collapsed-language": formatCodeBlockCollapsedLanguage(language),
          "data-markweave-collapsed-lines": formatCodeBlockCollapsedLines(node.textContent),
        }),
      );
    }

    return false;
  });

  return DecorationSet.create(state.doc, decorations);
}

export const MarkweaveCodeBlockCollapse = Extension.create({
  name: "markweaveCodeBlockCollapse",
  priority: 650,

  addProseMirrorPlugins() {
    return [
      new Plugin<ReadonlySet<string>>({
        key: codeBlockCollapsePluginKey,
        state: {
          init: () => new Set<string>(),
          apply(transaction, previous) {
            const meta = transaction.getMeta(codeBlockCollapsePluginKey) as CodeBlockCollapsePluginMeta | undefined;

            if (!meta) {
              return previous;
            }

            const next = new Set(previous);

            if (meta.type === "toggle") {
              if (next.has(meta.key)) {
                next.delete(meta.key);
              } else {
                next.add(meta.key);
              }
            } else if (meta.collapsed) {
              next.add(meta.key);
            } else {
              next.delete(meta.key);
            }

            return next;
          },
        },
        props: {
          decorations(state) {
            return createCodeBlockCollapseDecorations(state, codeBlockCollapsePluginKey.getState(state) ?? new Set());
          },
        },
      }),
    ];
  },
});

export const MarkweaveCodeBlockClickFocus = Extension.create({
  name: "markweaveCodeBlockClickFocus",
  priority: 660,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClick(view, _pos, event) {
            const target = event.target;

            if (!(target instanceof HTMLElement)) {
              return false;
            }

            const codeBlockElement = target.closest<HTMLElement>("pre.markweave-code-block");

            if (!codeBlockElement || !view.dom.contains(codeBlockElement)) {
              return false;
            }

            if (codeBlockElement.getAttribute("data-markweave-collapsed") === "true") {
              const collapsedContext = getCodeBlockContextForElement(view, codeBlockElement);

              if (!collapsedContext) {
                return false;
              }

              const key = getCodeBlockCollapseKey(collapsedContext.pos, collapsedContext.node);
              const selectionPosition = collapsedContext.pos + 1;
              view.dispatch(setCodeBlockCollapsed(view.state.tr, key, false).setSelection(TextSelection.create(view.state.doc, selectionPosition)));
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

  return editor.chain().focus().updateAttributes("codeBlock", { language }).run();
}

export function setActiveCodeBlockMermaidPreviewMode(editor: Editor, mode: MermaidPreviewMode) {
  const codeBlock = getActiveCodeBlockState(editor);

  if (!codeBlock.active || codeBlock.language !== "mermaid") {
    return false;
  }

  return editor.chain().focus().updateAttributes("codeBlock", { mermaidPreviewMode: mode }).run();
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
  editor.view.dispatch(setCodeBlockCollapsed(editor.state.tr, key, collapsed));
  editor.view.focus();
  return true;
}

export function setCodeBlockCollapsedAtPosition(editor: Editor, codeBlockPos: number, collapsed: boolean) {
  const context = getCodeBlockContextAtPos(editor.state, codeBlockPos);

  if (!context) {
    return false;
  }

  const key = getCodeBlockCollapseKey(context.pos, context.node);
  editor.view.dispatch(setCodeBlockCollapsed(editor.state.tr, key, collapsed));
  editor.view.focus();
  return true;
}

export function toggleActiveCodeBlockCollapsed(editor: Editor) {
  const context = getActiveCodeBlockContext(editor.state);

  if (!context) {
    return false;
  }

  const key = getCodeBlockCollapseKey(context.pos, context.node);
  editor.view.dispatch(toggleCodeBlockCollapsed(editor.state.tr, key));
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
