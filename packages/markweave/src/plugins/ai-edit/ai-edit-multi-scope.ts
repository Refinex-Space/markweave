import type { Editor, JSONContent } from "@tiptap/core";
import { DOMSerializer, Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type {
  MarkweaveAiEditHunk,
  MarkweaveAiEditLineRange,
} from "../../core/public-types";

const maxDiffHunks = 200;

export interface MarkweaveAiEditInternalHunk extends MarkweaveAiEditHunk {
  readonly replacement: Fragment;
}

export type MarkweaveAiEditDiffResult =
  | { readonly ok: true; readonly hunks: readonly MarkweaveAiEditInternalHunk[] }
  | { readonly ok: false; readonly reason: "invalid-markdown" | "schema-incompatible" | "proposal-too-complex" };

function fragmentNodes(fragment: Fragment) {
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((node) => nodes.push(node));
  return nodes;
}

function serializeNodes(editor: Editor, nodes: readonly ProseMirrorNode[]) {
  if (!editor.markdown || nodes.length === 0) {
    return "";
  }
  return editor.markdown.serialize({
    type: "doc",
    content: nodes.map((node) => node.toJSON()),
  } as JSONContent).trimEnd();
}

function countLines(value: string) {
  return value ? value.split("\n").length : 1;
}

function createBlockLines(editor: Editor, nodes: readonly ProseMirrorNode[], startLine: number) {
  let line = startLine;
  return nodes.map((node) => {
    const markdown = serializeNodes(editor, [node]);
    const current = { start: line, end: line + countLines(markdown) - 1 };
    line = current.end + 2;
    return current;
  });
}

function hunkLineRange(
  blockLines: readonly { readonly start: number; readonly end: number }[],
  start: number,
  end: number,
  fallbackLine: number,
): MarkweaveAiEditLineRange {
  const previous = start > 0 ? blockLines[start - 1] : null;
  const first = blockLines[start];
  const last = end > start ? blockLines[end - 1] : null;
  return {
    start: first?.start ?? previous?.end ?? fallbackLine,
    end: last?.end ?? first?.end ?? previous?.end ?? fallbackLine,
    basis: "normalized-markdown",
    precision: "block",
  };
}

function uniquePositions(keys: readonly string[], start: number, end: number) {
  const positions = new Map<string, number | null>();
  for (let index = start; index < end; index += 1) {
    const key = keys[index]!;
    positions.set(key, positions.has(key) ? null : index);
  }
  return positions;
}

function increasingAnchors(candidates: readonly (readonly [number, number])[]) {
  const tails: number[] = [];
  const previous = new Int32Array(candidates.length).fill(-1);
  candidates.forEach((candidate, index) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (candidates[tails[middle]!]![1] < candidate[1]) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    if (low > 0) {
      previous[index] = tails[low - 1]!;
    }
    tails[low] = index;
  });

  const anchors: Array<readonly [number, number]> = [];
  let index = tails.at(-1) ?? -1;
  while (index >= 0) {
    anchors.push(candidates[index]!);
    index = previous[index]!;
  }
  return anchors.reverse();
}

/**
 * Patience-diff anchors keep the common long-document case near O(n log n),
 * while recursive prefix/suffix matching still preserves repeated unchanged
 * blocks around each unique anchor.
 */
function matchingPairs(oldNodes: readonly ProseMirrorNode[], newNodes: readonly ProseMirrorNode[]) {
  const oldKeys = oldNodes.map((node) => JSON.stringify(node.toJSON()));
  const newKeys = newNodes.map((node) => JSON.stringify(node.toJSON()));
  const pairs: Array<readonly [number, number]> = [];

  const visit = (initialOldStart: number, initialOldEnd: number, initialNewStart: number, initialNewEnd: number) => {
    let oldStart = initialOldStart;
    let newStart = initialNewStart;
    const suffix: Array<readonly [number, number]> = [];
    while (oldStart < initialOldEnd && newStart < initialNewEnd
      && oldNodes[oldStart]!.eq(newNodes[newStart]!)) {
      pairs.push([oldStart, newStart]);
      oldStart += 1;
      newStart += 1;
    }

    let oldEnd = initialOldEnd;
    let newEnd = initialNewEnd;
    while (oldEnd > oldStart && newEnd > newStart
      && oldNodes[oldEnd - 1]!.eq(newNodes[newEnd - 1]!)) {
      oldEnd -= 1;
      newEnd -= 1;
      suffix.unshift([oldEnd, newEnd]);
    }

    if (oldStart < oldEnd && newStart < newEnd) {
      const oldUnique = uniquePositions(oldKeys, oldStart, oldEnd);
      const newUnique = uniquePositions(newKeys, newStart, newEnd);
      const candidates: Array<readonly [number, number]> = [];
      for (let oldIndex = oldStart; oldIndex < oldEnd; oldIndex += 1) {
        const key = oldKeys[oldIndex]!;
        const newIndex = newUnique.get(key);
        if (oldUnique.get(key) === oldIndex && newIndex !== null && newIndex !== undefined) {
          candidates.push([oldIndex, newIndex]);
        }
      }
      const anchors = increasingAnchors(candidates);
      let previousOld = oldStart;
      let previousNew = newStart;
      anchors.forEach(([oldIndex, newIndex]) => {
        visit(previousOld, oldIndex, previousNew, newIndex);
        pairs.push([oldIndex, newIndex]);
        previousOld = oldIndex + 1;
        previousNew = newIndex + 1;
      });
      if (anchors.length > 0) {
        visit(previousOld, oldEnd, previousNew, newEnd);
      }
    }
    pairs.push(...suffix);
  };

  visit(0, oldNodes.length, 0, newNodes.length);
  return pairs;
}

export function parseMarkweaveAiEditProposal(editor: Editor, markdown: string) {
  if (!editor.markdown) {
    return { ok: false, reason: "schema-incompatible" } as const;
  }
  let parsed: JSONContent;
  try {
    parsed = editor.markdown.parse(markdown);
  } catch {
    return { ok: false, reason: "invalid-markdown" } as const;
  }
  try {
    return { ok: true, content: editor.schema.nodeFromJSON(parsed).content } as const;
  } catch {
    return { ok: false, reason: "schema-incompatible" } as const;
  }
}

export function createMarkweaveAiEditDiff(
  editor: Editor,
  original: Fragment,
  proposed: Fragment,
  absoluteFrom: number,
  startLine: number,
): MarkweaveAiEditDiffResult {
  const oldNodes = fragmentNodes(original);
  const newNodes = fragmentNodes(proposed);
  const pairs = matchingPairs(oldNodes, newNodes);

  const offsets = [0];
  oldNodes.forEach((node) => offsets.push(offsets[offsets.length - 1]! + node.nodeSize));
  const lines = createBlockLines(editor, oldNodes, startLine);
  const matches = [...pairs, [oldNodes.length, newNodes.length] as const];
  const hunks: MarkweaveAiEditInternalHunk[] = [];
  let previousOld = -1;
  let previousNew = -1;

  for (const [matchedOld, matchedNew] of matches) {
    const oldStart = previousOld + 1;
    const oldEnd = matchedOld;
    const newStart = previousNew + 1;
    const newEnd = matchedNew;
    if (oldStart !== oldEnd || newStart !== newEnd) {
      const originalNodes = oldNodes.slice(oldStart, oldEnd);
      const proposedNodes = newNodes.slice(newStart, newEnd);
      const from = absoluteFrom + offsets[oldStart]!;
      const to = absoluteFrom + offsets[oldEnd]!;
      hunks.push({
        id: `hunk-${hunks.length + 1}-${from}-${to}`,
        kind: oldStart === oldEnd ? "insert" : newStart === newEnd ? "delete" : "replace",
        from,
        to,
        originalMarkdown: serializeNodes(editor, originalNodes),
        proposedMarkdown: serializeNodes(editor, proposedNodes),
        lineRange: hunkLineRange(lines, oldStart, oldEnd, startLine),
        disposition: "pending",
        replacement: Fragment.fromArray(proposedNodes),
      });
    }
    previousOld = matchedOld;
    previousNew = matchedNew;
  }

  return hunks.length > maxDiffHunks
    ? { ok: false, reason: "proposal-too-complex" }
    : { ok: true, hunks };
}

export function createMarkweaveAiEditProposalDom(
  editor: Editor,
  hunk: MarkweaveAiEditInternalHunk,
) {
  const element = editor.view.dom.ownerDocument.createElement("div");
  element.className = "markweave-ask-ai-proposal markweave-ask-ai-proposal--text markweave-ai-edit-hunk-proposal";
  element.dataset.markweaveAskAiProposal = "text";
  element.dataset.markweaveAskAiLayout = "block";
  element.dataset.markweaveAiEditHunk = hunk.id;
  element.dataset.markweaveAiEditHunkKind = hunk.kind;
  element.dataset.markweaveAiEditDisposition = hunk.disposition;
  element.contentEditable = "false";
  if (hunk.replacement.childCount > 0) {
    element.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(hunk.replacement));
  } else {
    element.classList.add("markweave-ai-edit-hunk-proposal--delete");
    element.setAttribute("aria-hidden", "true");
  }
  return element;
}

export function applyMarkweaveAiEditHunks(
  transaction: Transaction,
  hunks: readonly MarkweaveAiEditInternalHunk[],
) {
  [...hunks]
    .sort((left, right) => right.from - left.from)
    .forEach((hunk) => transaction.replaceWith(hunk.from, hunk.to, hunk.replacement));
  return transaction;
}
