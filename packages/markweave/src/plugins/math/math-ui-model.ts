import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export type MarkweaveMathKind = "inline" | "block";

export interface MarkweaveMathTarget {
  readonly kind: MarkweaveMathKind;
  readonly pos: number;
  readonly latex: string;
}

export interface MarkweaveMathPopoverPosition {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly placement: "top" | "bottom";
}

export interface MarkweaveMathPreview {
  readonly html: string;
  readonly error: boolean;
}

const mathNodeNames: Record<MarkweaveMathKind, string> = {
  inline: "inlineMath",
  block: "blockMath",
};

function getMathKindFromNode(node: ProseMirrorNode | null | undefined): MarkweaveMathKind | null {
  if (!node) {
    return null;
  }

  if (node.type.name === mathNodeNames.inline) {
    return "inline";
  }

  if (node.type.name === mathNodeNames.block) {
    return "block";
  }

  return null;
}

function createTargetFromNode(node: ProseMirrorNode, pos: number): MarkweaveMathTarget | null {
  const kind = getMathKindFromNode(node);

  if (!kind) {
    return null;
  }

  const latex = typeof node.attrs.latex === "string" ? node.attrs.latex : "";

  return {
    kind,
    pos,
    latex,
  };
}

function findInsertedMathTarget(editor: Editor, kind: MarkweaveMathKind, latex: string, preferredPos: number) {
  let fallbackTarget: MarkweaveMathTarget | null = null;
  let nearestTarget: MarkweaveMathTarget | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  editor.state.doc.descendants((node, pos) => {
    const target = createTargetFromNode(node, pos);
    if (!target || target.kind !== kind || target.latex !== latex) {
      return true;
    }

    fallbackTarget = target;
    const distance = Math.abs(pos - preferredPos);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestTarget = target;
    }

    return true;
  });

  return nearestTarget ?? fallbackTarget;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getInlineMathSourceWidth(anchorWidth: number, latex?: string) {
  const sourceWidth = Math.min(560, Math.max(96, (latex?.length ?? 8) * 7 + 48));
  return Math.max(anchorWidth, sourceWidth);
}

function getMarkweaveMathNodeElementFromView(view: EditorView, target: MarkweaveMathTarget): HTMLElement | null {
  let nodeDom: unknown;

  try {
    nodeDom = view.nodeDOM(target.pos);
  } catch {
    return null;
  }

  return nodeDom instanceof HTMLElement ? nodeDom : null;
}

function getMarkweaveMathNodeElement(editor: Editor, target: MarkweaveMathTarget): HTMLElement | null {
  return getMarkweaveMathNodeElementFromView(editor.view, target);
}

export function getMarkweaveMathTargetAtPos(editor: Editor, pos: number): MarkweaveMathTarget | null {
  if (pos < 0 || pos > editor.state.doc.content.size) {
    return null;
  }

  const direct = editor.state.doc.nodeAt(pos);
  const directTarget = direct ? createTargetFromNode(direct, pos) : null;

  if (directTarget) {
    return directTarget;
  }

  const $pos = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size));
  const before = $pos.nodeBefore;
  if (before) {
    const beforeTarget = createTargetFromNode(before, pos - before.nodeSize);
    if (beforeTarget) {
      return beforeTarget;
    }
  }

  const after = $pos.nodeAfter;
  if (after) {
    const afterTarget = createTargetFromNode(after, pos);
    if (afterTarget) {
      return afterTarget;
    }
  }

  return null;
}

function extractRenderedMathHtml(element: HTMLElement) {
  const clone = element.cloneNode(true);

  if (!(clone instanceof HTMLElement)) {
    return "";
  }

  clone.removeAttribute("data-markweave-math-editing");
  clone.style.removeProperty("--markweave-inline-math-editing-width");
  clone.style.removeProperty("min-width");
  clone.querySelectorAll(".katex-mathml").forEach((mathElement) => mathElement.remove());
  clone.querySelectorAll("annotation").forEach((annotation) => annotation.remove());

  const katex = clone.querySelector(".katex");
  const katexHtml = clone.querySelector(".katex-html");
  if (katex instanceof HTMLElement && katexHtml instanceof HTMLElement) {
    const katexClone = katex.cloneNode(false);
    if (katexClone instanceof HTMLElement) {
      katexClone.appendChild(katexHtml.cloneNode(true));
      return katexClone.outerHTML;
    }
  }

  return clone.innerHTML;
}

export function getMarkweaveMathTargetFromSelection(editor: Editor): MarkweaveMathTarget | null {
  const { selection } = editor.state;

  if (!(selection instanceof NodeSelection)) {
    return null;
  }

  return createTargetFromNode(selection.node, selection.from);
}

export function getMarkweaveMathTargetFromDomEvent(view: EditorView, event: MouseEvent): MarkweaveMathTarget | null {
  const eventTarget = event.target;

  if (!(eventTarget instanceof Element)) {
    return null;
  }

  const element = eventTarget.closest<HTMLElement>(".tiptap-mathematics-render[data-type]");

  if (!element || !view.dom.contains(element)) {
    return null;
  }

  const editor = { state: view.state } as Editor;
  const expectedKind = element.dataset.type === "block-math" ? "block" : element.dataset.type === "inline-math" ? "inline" : null;
  let exactTarget: MarkweaveMathTarget | null = null;

  view.state.doc.descendants((node, pos) => {
    const target = createTargetFromNode(node, pos);
    if (!target || (expectedKind && target.kind !== expectedKind)) {
      return true;
    }

    try {
      if (view.nodeDOM(pos) === element) {
        exactTarget = target;
        return false;
      }
    } catch {
      return true;
    }

    return true;
  });

  if (exactTarget) {
    return exactTarget;
  }

  let domPos: number;
  try {
    domPos = view.posAtDOM(element, 0);
  } catch {
    return null;
  }

  const candidatePositions = [domPos, domPos - 1, domPos + 1, domPos - 2, domPos + 2];

  for (const pos of candidatePositions) {
    const target = getMarkweaveMathTargetAtPos(editor, pos);
    if (target && (!expectedKind || target.kind === expectedKind)) {
      return target;
    }
  }

  return null;
}

export function setMarkweaveMathSelection(editor: Editor, target: MarkweaveMathTarget) {
  const node = editor.state.doc.nodeAt(target.pos);

  if (!node || !getMathKindFromNode(node)) {
    return false;
  }

  const transaction = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, target.pos));
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

export function setMarkweaveMathSelectionInView(view: EditorView, target: MarkweaveMathTarget) {
  const node = view.state.doc.nodeAt(target.pos);

  if (!node || !getMathKindFromNode(node)) {
    return false;
  }

  const transaction = view.state.tr.setSelection(NodeSelection.create(view.state.doc, target.pos));
  view.dispatch(transaction);
  view.focus();
  return true;
}

export function applyMarkweaveMathLatex(editor: Editor, target: MarkweaveMathTarget, latex: string) {
  const normalizedLatex = latex.trim();

  if (!normalizedLatex) {
    return false;
  }

  const node = editor.state.doc.nodeAt(target.pos);
  if (!node || getMathKindFromNode(node) !== target.kind) {
    return false;
  }

  if (target.kind === "inline") {
    return editor.chain().focus().updateInlineMath({ pos: target.pos, latex: normalizedLatex }).setNodeSelection(target.pos).run();
  }

  return editor.chain().focus().updateBlockMath({ pos: target.pos, latex: normalizedLatex }).setNodeSelection(target.pos).run();
}

export function deleteMarkweaveMathNode(editor: Editor, target: MarkweaveMathTarget) {
  const node = editor.state.doc.nodeAt(target.pos);
  if (!node || getMathKindFromNode(node) !== target.kind) {
    return false;
  }

  if (target.kind === "inline") {
    return editor.chain().focus().deleteInlineMath({ pos: target.pos }).run();
  }

  return editor.chain().focus().deleteBlockMath({ pos: target.pos }).run();
}

export function insertMarkweaveInlineMath(editor: Editor, latex: string) {
  const normalizedLatex = latex.trim();
  const { from, to } = editor.state.selection;
  const insertPos = Math.min(from, to);

  if (!normalizedLatex) {
    return false;
  }

  return editor
    .chain()
    .focus()
    .deleteRange({ from: Math.min(from, to), to: Math.max(from, to) })
    .insertContent({ type: "inlineMath", attrs: { latex: normalizedLatex } })
    .setNodeSelection(insertPos)
    .run();
}

export function insertMarkweaveBlockMath(editor: Editor, latex = "x") {
  const normalizedLatex = latex.trim();
  const insertPos = Math.min(editor.state.selection.from, editor.state.selection.to);

  if (!normalizedLatex) {
    return false;
  }

  const inserted = editor.chain().focus().insertBlockMath({ latex: normalizedLatex, pos: insertPos }).run();

  if (!inserted) {
    return false;
  }

  const target = findInsertedMathTarget(editor, "block", normalizedLatex, insertPos);
  if (!target) {
    return true;
  }

  return setMarkweaveMathSelection(editor, target);
}

export function renderMarkweaveMathPreview(latex: string, kind: MarkweaveMathKind, editor?: Editor): MarkweaveMathPreview {
  const normalizedLatex = latex.trim();

  if (!normalizedLatex) {
    return {
      html: "",
      error: false,
    };
  }

  if (editor && typeof document !== "undefined") {
    const type = editor.schema.nodes[mathNodeNames[kind]];
    const renderNodeView = editor.extensionManager.nodeViews[mathNodeNames[kind]];

    if (type && renderNodeView) {
      const node = type.create({ latex: normalizedLatex });
      const nodeView = renderNodeView(node, editor.view, () => 0, [], undefined as never);
      const html = nodeView.dom instanceof HTMLElement ? extractRenderedMathHtml(nodeView.dom) : "";
      nodeView.destroy?.();

      if (html) {
        return {
          html,
          error: nodeView.dom instanceof HTMLElement && nodeView.dom.classList.contains(`${kind}-math-error`),
        };
      }
    }
  }

  return {
    html: `<code>${escapeHtml(kind === "block" ? `$$\n${normalizedLatex}\n$$` : `$${normalizedLatex}$`)}</code>`,
    error: false,
  };
}

export function calculateMarkweaveMathPopoverPosition(input: {
  readonly anchorRect: DOMRect;
  readonly frameRect: DOMRect;
  readonly kind: MarkweaveMathKind;
  readonly latex?: string;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}): MarkweaveMathPopoverPosition {
  const edgePadding = 12;
  const sourceWidth = getInlineMathSourceWidth(input.anchorRect.width, input.latex);
  const blockWidth = Math.max(320, Math.min(input.anchorRect.width, input.frameRect.width - edgePadding * 2, input.viewportWidth - edgePadding * 2));
  const width = input.kind === "block" ? blockWidth : sourceWidth;
  const minLeft = edgePadding;
  const maxLeft = Math.max(minLeft, Math.min(input.frameRect.width, input.viewportWidth) - width - edgePadding);
  const anchorLeft = input.anchorRect.left - input.frameRect.left;
  const anchorCenter = anchorLeft + input.anchorRect.width / 2;
  const left = input.kind === "block" ? Math.round(Math.min(maxLeft, Math.max(minLeft, anchorLeft))) : Math.round(Math.min(maxLeft, Math.max(minLeft, anchorLeft)));

  if (input.kind === "block") {
    return {
      left,
      top: Math.round(Math.max(edgePadding, input.anchorRect.top - input.frameRect.top)),
      width,
      placement: "bottom",
    };
  }

  const topBelow = input.anchorRect.top - input.frameRect.top + 4;
  const estimatedHeight = 92;
  const maxTop = Math.max(edgePadding, input.frameRect.height - estimatedHeight - edgePadding);

  return {
    left,
    top: Math.round(Math.min(maxTop, Math.max(edgePadding, topBelow))),
    width,
    placement: "bottom",
  };
}

export function getMarkweaveMathAnchorRect(editor: Editor, target: MarkweaveMathTarget): DOMRect | null {
  const nodeDom = getMarkweaveMathNodeElement(editor, target);

  if (!nodeDom) {
    return null;
  }

  return nodeDom.getBoundingClientRect();
}

export function getMarkweaveMathRenderedHtml(editor: Editor, target: MarkweaveMathTarget) {
  const nodeDom = getMarkweaveMathNodeElement(editor, target);

  if (!nodeDom) {
    return "";
  }

  return extractRenderedMathHtml(nodeDom);
}

export function getMarkweaveMathBlockIndex(editor: Editor, target: MarkweaveMathTarget) {
  if (target.kind !== "block") {
    return null;
  }

  let index = 0;
  let targetIndex: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (getMathKindFromNode(node) !== "block") {
      return true;
    }

    index += 1;
    if (pos === target.pos) {
      targetIndex = index;
      return false;
    }

    return true;
  });

  return targetIndex;
}

export function setMarkweaveMathEditingDomState(editor: Editor, target: MarkweaveMathTarget, editing: boolean) {
  return setMarkweaveMathEditingDomStateInView(editor.view, target, editing);
}

export function setMarkweaveMathEditingDomStateInView(view: EditorView, target: MarkweaveMathTarget, editing: boolean) {
  const nodeDom = getMarkweaveMathNodeElementFromView(view, target);

  if (!nodeDom) {
    return false;
  }

  if (editing) {
    if (target.kind === "inline") {
      const width = getInlineMathSourceWidth(nodeDom.getBoundingClientRect().width, target.latex);
      nodeDom.style.setProperty("--markweave-inline-math-editing-width", `${Math.ceil(width)}px`);
    }
    nodeDom.setAttribute("data-markweave-math-editing", "true");
    return true;
  }

  nodeDom.removeAttribute("data-markweave-math-editing");
  nodeDom.style.removeProperty("--markweave-inline-math-editing-width");
  return true;
}
