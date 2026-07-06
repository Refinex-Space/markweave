import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  getMermaidPreviewPresentation,
  normalizeMermaidPreviewMode,
  renderMermaidDiagram,
  type MermaidPreviewMode,
  type MermaidRenderResult,
} from "./mermaid-renderer";

type MermaidInlinePreviewEditorMode = "live" | "view";

interface MermaidInlinePreviewPluginState {
  readonly editorMode: MermaidInlinePreviewEditorMode;
  readonly readonlyModesByPos: ReadonlyMap<number, MermaidPreviewMode>;
}

type MermaidInlinePreviewPluginMeta =
  | {
      readonly type: "set-editor-mode";
      readonly mode: MermaidInlinePreviewEditorMode;
    }
  | {
      readonly type: "set-readonly-mode";
      readonly mode: MermaidPreviewMode;
      readonly pos: number;
    };

const initialMermaidInlinePreviewPluginState: MermaidInlinePreviewPluginState = {
  editorMode: "live",
  readonlyModesByPos: new Map(),
};

export const mermaidInlinePreviewPluginKey = new PluginKey<MermaidInlinePreviewPluginState>("markweaveMermaidInlinePreview");
export const mermaidPreviewModeAttribute = "mermaidPreviewMode";

const initialPreviewResult: MermaidRenderResult = {
  status: "empty",
  svg: "",
  error: null,
};

function isMermaidCodeBlock(node: ProseMirrorNode) {
  return node.type.name === "codeBlock" && node.attrs.language === "mermaid";
}

function getNodePreviewMode(node: ProseMirrorNode): MermaidPreviewMode {
  return normalizeMermaidPreviewMode(node.attrs[mermaidPreviewModeAttribute]);
}

function getMermaidInlinePreviewPluginState(state: EditorState) {
  return mermaidInlinePreviewPluginKey.getState(state) ?? initialMermaidInlinePreviewPluginState;
}

function getEffectiveNodePreviewMode(state: EditorState, node: ProseMirrorNode, pos: number): MermaidPreviewMode {
  const pluginState = getMermaidInlinePreviewPluginState(state);

  if (pluginState.editorMode === "view") {
    return pluginState.readonlyModesByPos.get(pos) ?? "preview";
  }

  return getNodePreviewMode(node);
}

export function getEffectiveMermaidPreviewMode(state: EditorState, node: ProseMirrorNode, pos: number): MermaidPreviewMode {
  return isMermaidCodeBlock(node) ? getEffectiveNodePreviewMode(state, node, pos) : getNodePreviewMode(node);
}

function mapReadonlyMermaidModes(transaction: Transaction, readonlyModesByPos: ReadonlyMap<number, MermaidPreviewMode>) {
  if (!transaction.docChanged || readonlyModesByPos.size === 0) {
    return readonlyModesByPos;
  }

  const nextModesByPos = new Map<number, MermaidPreviewMode>();

  readonlyModesByPos.forEach((mode, pos) => {
    const mappedPos = transaction.mapping.mapResult(pos, 1);

    if (mappedPos.deleted) {
      return;
    }

    const node = transaction.doc.nodeAt(mappedPos.pos);

    if (node && isMermaidCodeBlock(node)) {
      nextModesByPos.set(mappedPos.pos, mode);
    }
  });

  return nextModesByPos;
}

function applyMermaidInlinePreviewMeta(
  previousState: MermaidInlinePreviewPluginState,
  transaction: Transaction,
): MermaidInlinePreviewPluginState {
  const meta = transaction.getMeta(mermaidInlinePreviewPluginKey) as MermaidInlinePreviewPluginMeta | undefined;
  const mappedReadonlyModesByPos = mapReadonlyMermaidModes(transaction, previousState.readonlyModesByPos);

  if (!meta) {
    return mappedReadonlyModesByPos === previousState.readonlyModesByPos
      ? previousState
      : {
          ...previousState,
          readonlyModesByPos: mappedReadonlyModesByPos,
        };
  }

  if (meta.type === "set-editor-mode") {
    return {
      editorMode: meta.mode,
      readonlyModesByPos: new Map(),
    };
  }

  const readonlyModesByPos = new Map(mappedReadonlyModesByPos);

  if (meta.mode === "preview") {
    readonlyModesByPos.delete(meta.pos);
  } else {
    readonlyModesByPos.set(meta.pos, meta.mode);
  }

  return {
    editorMode: previousState.editorMode,
    readonlyModesByPos,
  };
}

export function isMermaidInlinePreviewTransaction(transaction: Transaction) {
  return Boolean(transaction.getMeta(mermaidInlinePreviewPluginKey));
}

export function setMermaidInlinePreviewEditorMode(editor: Editor, mode: MermaidInlinePreviewEditorMode) {
  const normalizedMode: MermaidInlinePreviewEditorMode = mode === "view" ? "view" : "live";
  const pluginState = getMermaidInlinePreviewPluginState(editor.state);

  if (pluginState.editorMode === normalizedMode) {
    return false;
  }

  editor.view.dispatch(
    editor.state.tr.setMeta(mermaidInlinePreviewPluginKey, {
      type: "set-editor-mode",
      mode: normalizedMode,
    } satisfies MermaidInlinePreviewPluginMeta),
  );
  return true;
}

export function setReadonlyMermaidPreviewMode(editor: Editor, pos: number, mode: MermaidPreviewMode) {
  const node = editor.state.doc.nodeAt(pos);
  const pluginState = getMermaidInlinePreviewPluginState(editor.state);

  if (!node || !isMermaidCodeBlock(node) || pluginState.editorMode !== "view") {
    return false;
  }

  const normalizedMode = normalizeMermaidPreviewMode(mode);

  if (getEffectiveNodePreviewMode(editor.state, node, pos) === normalizedMode) {
    return false;
  }

  editor.view.dispatch(
    editor.state.tr.setMeta(mermaidInlinePreviewPluginKey, {
      type: "set-readonly-mode",
      mode: normalizedMode,
      pos,
    } satisfies MermaidInlinePreviewPluginMeta),
  );
  return true;
}

function getOldPositionForNewPosition(transactions: readonly Transaction[], pos: number) {
  let mappedPos = pos;

  for (let index = transactions.length - 1; index >= 0; index -= 1) {
    const result = transactions[index].mapping.invert().mapResult(mappedPos, 1);
    mappedPos = result.pos;
  }

  return mappedPos;
}

function wasAlreadyMermaidCodeBlock(oldState: EditorState, transactions: readonly Transaction[], pos: number) {
  const oldPos = getOldPositionForNewPosition(transactions, pos);
  const oldNode = oldPos === null ? null : oldState.doc.nodeAt(oldPos);
  return Boolean(oldNode && isMermaidCodeBlock(oldNode));
}

export function setNewMermaidCodeBlocksToPreview(oldState: EditorState, newState: EditorState, transactions: readonly Transaction[] = []) {
  let tr = newState.tr;
  let changed = false;

  newState.doc.descendants((node, pos) => {
    if (!isMermaidCodeBlock(node) || getNodePreviewMode(node) === "preview" || wasAlreadyMermaidCodeBlock(oldState, transactions, pos)) {
      return true;
    }

    tr = tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      [mermaidPreviewModeAttribute]: "preview",
    });
    changed = true;
    return false;
  });

  return changed ? tr : null;
}

function hashPreviewKey(source: string, pos: number) {
  let hash = pos;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function applyPreviewResult(element: HTMLElement, source: string, result: MermaidRenderResult) {
  const presentation = getMermaidPreviewPresentation({
    active: true,
    mode: "preview",
    result,
  });

  element.className = "markweave-mermaid-preview markweave-mermaid-preview--inline";
  element.dataset.testid = "markweave-mermaid-inline-preview";
  element.dataset.sourceLength = String(source.length);

  if (presentation.visibility === "rendered") {
    element.dataset.state = "rendered";
    element.innerHTML = presentation.svg;
    return;
  }

  if (presentation.visibility === "error") {
    element.dataset.state = "error";
    element.classList.add("markweave-mermaid-preview--error");
    element.textContent = presentation.message;
    return;
  }

  element.dataset.state = "empty";
  element.classList.add("markweave-mermaid-preview--empty");
  element.textContent = presentation.visibility === "empty" ? presentation.label : "Mermaid preview";
}

function createInlinePreviewElement(source: string, pos: number) {
  const element = document.createElement("div");
  const previewKey = `markweave-mermaid-inline-${hashPreviewKey(source, pos)}`;

  element.setAttribute("aria-label", "Mermaid preview");
  applyPreviewResult(element, source, initialPreviewResult);
  element.dataset.codeBlockPos = String(pos);

  void renderMermaidDiagram(source, { id: previewKey }).then((result) => {
    if (element.isConnected) {
      applyPreviewResult(element, source, result);
    }
  });

  return element;
}

export function createMermaidInlinePreviewDecorations(state: Parameters<NonNullable<Plugin["props"]["decorations"]>>[0]) {
  const decorations: Decoration[] = [];

  state.doc.descendants((node, pos) => {
    if (!isMermaidCodeBlock(node)) {
      return true;
    }

    const previewMode = getEffectiveNodePreviewMode(state, node, pos);

    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        "data-markweave-mermaid-block": "true",
        ...(previewMode === "preview" ? { "data-mermaid-preview-mode": "preview" } : {}),
      }),
    );

    if (previewMode !== "preview") {
      return false;
    }

    const source = node.textContent;
    const previewPos = pos + node.nodeSize;

    decorations.push(
      Decoration.widget(previewPos, () => createInlinePreviewElement(source, pos), {
        key: `markweave-mermaid-preview-${previewPos}-${hashPreviewKey(source, pos)}`,
        side: 1,
      }),
    );

    return false;
  });

  return DecorationSet.create(state.doc, decorations);
}

export const MarkweaveMermaidInlinePreview = Extension.create({
  name: "markweaveMermaidInlinePreview",
  priority: 700,

  addGlobalAttributes() {
    return [
      {
        types: ["codeBlock"],
        attributes: {
          [mermaidPreviewModeAttribute]: {
            default: "code",
            parseHTML: (element) => normalizeMermaidPreviewMode(element.getAttribute("data-mermaid-preview-mode")),
            renderHTML: (attributes) => {
              const mode = normalizeMermaidPreviewMode(attributes[mermaidPreviewModeAttribute]);
              return mode === "preview" ? { "data-mermaid-preview-mode": mode } : {};
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: mermaidInlinePreviewPluginKey,
        state: {
          init: () => initialMermaidInlinePreviewPluginState,
          apply(transaction, previousState) {
            return applyMermaidInlinePreviewMeta(previousState, transaction);
          },
        },
        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          return setNewMermaidCodeBlocksToPreview(oldState, newState, transactions);
        },
        props: {
          decorations: createMermaidInlinePreviewDecorations,
          handleClick(view, _pos, event) {
            const target = event.target;

            if (!(target instanceof HTMLElement)) {
              return false;
            }

            const previewElement = target.closest<HTMLElement>('[data-testid="markweave-mermaid-inline-preview"][data-code-block-pos]');

            if (!previewElement) {
              return false;
            }

            const codeBlockPos = Number(previewElement.dataset.codeBlockPos);
            const codeBlock = Number.isFinite(codeBlockPos) ? view.state.doc.nodeAt(codeBlockPos) : null;

            if (!codeBlock || !isMermaidCodeBlock(codeBlock)) {
              return false;
            }

            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, codeBlockPos + 1)).scrollIntoView());
            view.focus();
            return true;
          },
        },
      }),
    ];
  },
});
