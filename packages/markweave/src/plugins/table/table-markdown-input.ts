import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { isEditorComposing } from "../../editor-core/composition-guard";
import { parsedClipboardTableToHtml, parseMarkdownTable } from "./table-clipboard";

interface ParagraphCandidate {
  readonly index: number;
  readonly from: number;
  readonly to: number;
  readonly text: string;
}

function findCurrentTopLevelParagraphIndex(editor: Editor) {
  const { doc, selection } = editor.state;
  let currentIndex: number | null = null;

  doc.forEach((node, offset, index) => {
    if (currentIndex !== null || node.type.name !== "paragraph") {
      return;
    }

    const from = offset;
    const to = offset + node.nodeSize;

    if (selection.from > from && selection.from < to) {
      currentIndex = index;
    }
  });

  return currentIndex;
}

function collectMarkdownTableParagraphs(editor: Editor, currentIndex: number) {
  const candidates: ParagraphCandidate[] = [];

  editor.state.doc.forEach((node, offset, index) => {
    if (index > currentIndex || node.type.name !== "paragraph") {
      return;
    }

    const text = node.textContent.trim();

    if (!text.includes("|")) {
      candidates.length = 0;
      return;
    }

    candidates.push({
      index,
      from: offset,
      to: offset + node.nodeSize,
      text,
    });
  });

  const tableStartIndex = candidates.findIndex((candidate) => candidate.index === currentIndex);

  if (tableStartIndex < 0) {
    return [];
  }

  return candidates.slice(0, tableStartIndex + 1);
}

export function convertMarkdownTableAtSelection(editor: Editor) {
  if (isEditorComposing(editor.state)) {
    return false;
  }

  if (editor.state.selection.$from.parent.type.name !== "paragraph") {
    return false;
  }

  const currentIndex = findCurrentTopLevelParagraphIndex(editor);

  if (currentIndex === null) {
    return false;
  }

  const candidates = collectMarkdownTableParagraphs(editor, currentIndex);
  const parsedTable = parseMarkdownTable(candidates.map((candidate) => candidate.text).join("\n"));

  if (!parsedTable || candidates.length < 3) {
    return false;
  }

  const firstCandidate = candidates[0];
  const lastCandidate = candidates[candidates.length - 1];

  return editor
    .chain()
    .focus()
    .insertContentAt({ from: firstCandidate.from, to: lastCandidate.to }, parsedClipboardTableToHtml(parsedTable))
    .run();
}

export const MarkweaveMarkdownTableInput = Extension.create({
  name: "markweaveMarkdownTableInput",
  priority: 980,

  addKeyboardShortcuts() {
    return {
      Enter: () => convertMarkdownTableAtSelection(this.editor),
    };
  },
});
