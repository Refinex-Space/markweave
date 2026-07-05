import { Extension } from "@tiptap/core";
import type { MarkType, ResolvedPos } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { isEditorComposing } from "./composition-guard";

const boundaryMarkNames = ["code", "link"] as const;

export const markweaveMarkBoundaryPluginKey = new PluginKey("markweaveMarkBoundary");

function getTextMarkAtBoundary($from: ResolvedPos, markType: MarkType) {
  const before = $from.nodeBefore;

  if (!before?.isText) {
    return null;
  }

  return markType.isInSet(before.marks) ?? null;
}

function getTextMarkAfterBoundary($from: ResolvedPos, markType: MarkType) {
  const after = $from.nodeAfter;

  if (!after?.isText) {
    return null;
  }

  return markType.isInSet(after.marks) ?? null;
}

function isEndingMarkBoundary($from: ResolvedPos, markType: MarkType) {
  const beforeMark = getTextMarkAtBoundary($from, markType);

  if (!beforeMark) {
    return false;
  }

  const afterMark = getTextMarkAfterBoundary($from, markType);
  return !afterMark || !beforeMark.eq(afterMark);
}

export function getEndingBoundaryMarkTypes(state: EditorState) {
  const { selection } = state;

  if (!(selection instanceof TextSelection) || !selection.empty || state.storedMarks !== null) {
    return [];
  }

  return boundaryMarkNames
    .map((name) => state.schema.marks[name])
    .filter((markType): markType is MarkType => Boolean(markType))
    .filter((markType) => isEndingMarkBoundary(selection.$from, markType));
}

export const MarkweaveMarkBoundary = Extension.create({
  name: "markweaveMarkBoundary",
  priority: 930,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: markweaveMarkBoundaryPluginKey,
        props: {
          handleTextInput: (view, from, to, text) => {
            if (isEditorComposing(view.state)) {
              return false;
            }

            if (from !== to || !text) {
              return false;
            }

            const endingMarkTypes = getEndingBoundaryMarkTypes(view.state);

            if (endingMarkTypes.length === 0) {
              return false;
            }

            const tr = endingMarkTypes.reduce((transaction, markType) => {
              return transaction.removeStoredMark(markType);
            }, view.state.tr);

            view.dispatch(tr.insertText(text, from, to));
            return true;
          },
        },
      }),
    ];
  },
});
