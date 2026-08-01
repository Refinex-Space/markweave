import type { Editor, JSONContent } from "@tiptap/core";
import { DOMSerializer, type Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type {
  MarkweaveAiEditLineRange,
  MarkweaveAiEditScope,
  MarkweaveAiEditSelectionSnapshot,
  MarkweaveAiEditTarget,
} from "../../core/public-types";
import { isMarkweaveAskAiSelectionEligible } from "../ask-ai/ask-ai-session";

export interface MarkweaveAiEditCaptureRange {
  readonly from: number;
  readonly to: number;
}

function serializeFragmentMarkdown(editor: Editor, content: Fragment) {
  if (!editor.markdown || content.childCount === 0) {
    return "";
  }
  return editor.markdown.serialize({ type: "doc", content: content.toJSON() } as JSONContent).trimEnd();
}

function serializeFragmentHtml(editor: Editor, content: Fragment) {
  const container = editor.view.dom.ownerDocument.createElement("div");
  container.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(content));
  return container.innerHTML;
}

function countLines(value: string) {
  return value ? value.split("\n").length : 1;
}

function blockLineRanges(editor: Editor) {
  const ranges: Array<MarkweaveAiEditLineRange & MarkweaveAiEditCaptureRange> = [];
  let line = 1;
  editor.state.doc.forEach((node, offset) => {
    const markdown = serializeFragmentMarkdown(
      editor,
      editor.state.doc.slice(offset, offset + node.nodeSize).content,
    );
    const end = line + countLines(markdown) - 1;
    ranges.push({
      from: offset,
      to: offset + node.nodeSize,
      start: line,
      end,
      basis: "normalized-markdown",
      precision: "block",
    });
    // Normalized block Markdown is separated by one blank line.
    line = end + 2;
  });
  return ranges;
}

function lineRangeForCapture(editor: Editor, range: MarkweaveAiEditCaptureRange): MarkweaveAiEditLineRange {
  const blocks = blockLineRanges(editor);
  const overlapping = blocks.filter((block) => range.from < block.to && range.to > block.from);
  const fallback = blocks.find((block) => range.from >= block.from && range.from <= block.to)
    ?? blocks[0];
  const first = overlapping[0] ?? fallback;
  const last = overlapping.at(-1) ?? fallback;
  return {
    start: first?.start ?? 1,
    end: last?.end ?? 1,
    basis: "normalized-markdown",
    precision: "block",
  };
}

export function getMarkweaveAiEditBlockRange(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): MarkweaveAiEditCaptureRange | null {
  const matches: MarkweaveAiEditCaptureRange[] = [];
  const empty = from === to;
  doc.forEach((node, offset) => {
    const block = { from: offset, to: offset + node.nodeSize };
    const overlaps = empty
      ? from >= block.from && from <= block.to
      : from < block.to && to > block.from;
    if (!overlaps) {
      return;
    }
    matches.push(block);
  });
  const first = matches[0];
  const last = matches.at(-1);
  return first && last ? { from: first.from, to: last.to } : null;
}

function createTarget(editor: Editor, scope: MarkweaveAiEditScope, range: MarkweaveAiEditCaptureRange): MarkweaveAiEditTarget {
  const content = editor.state.doc.slice(range.from, range.to).content;
  return {
    scope,
    from: range.from,
    to: range.to,
    text: editor.state.doc.textBetween(range.from, range.to, "\n\n", "\n"),
    html: serializeFragmentHtml(editor, content),
    markdown: serializeFragmentMarkdown(editor, content),
    lineRange: lineRangeForCapture(editor, range),
  };
}

export function createMarkweaveAiEditTarget(
  editor: Editor,
  scope: MarkweaveAiEditScope,
): MarkweaveAiEditTarget | null {
  if (scope === "selection") {
    const { selection } = editor.state;
    if (selection.empty) {
      return null;
    }
    return createTarget(editor, scope, { from: selection.from, to: selection.to });
  }
  if (scope === "document") {
    return createTarget(editor, scope, { from: 0, to: editor.state.doc.content.size });
  }
  const { from, to } = editor.state.selection;
  const range = getMarkweaveAiEditBlockRange(editor.state.doc, from, to);
  return range ? createTarget(editor, scope, range) : null;
}

export function inspectMarkweaveAiEditSelection(editor: Editor): MarkweaveAiEditSelectionSnapshot | null {
  if (editor.state.selection.empty) {
    return null;
  }
  const target = createMarkweaveAiEditTarget(editor, "selection");
  if (!target) {
    return null;
  }
  const eligible = isMarkweaveAskAiSelectionEligible(editor);
  return {
    from: target.from,
    to: target.to,
    text: target.text,
    html: target.html,
    markdown: target.markdown,
    lineRange: target.lineRange,
    eligible,
    reason: eligible ? null : "unsupported-selection",
  };
}
