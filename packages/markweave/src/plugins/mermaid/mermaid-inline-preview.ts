import { Extension } from "@tiptap/core";
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

export const mermaidInlinePreviewPluginKey = new PluginKey("markweaveMermaidInlinePreview");
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

    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        "data-markweave-mermaid-block": "true",
      }),
    );

    if (getNodePreviewMode(node) !== "preview") {
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
