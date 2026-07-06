import type { Editor } from "@tiptap/core";
import { useSyncExternalStore } from "react";
import { getMarkweaveEditorModeState, subscribeToMarkweaveEditorMode } from "../core/editor-mode-state";

const defaultModeState = {
  mode: "live",
  editable: true,
} as const;

export function useMarkweaveEditorModeState(editor: Editor | null | undefined) {
  return useSyncExternalStore(
    (listener) => subscribeToMarkweaveEditorMode(editor, listener),
    () => getMarkweaveEditorModeState(editor),
    () => defaultModeState,
  );
}
