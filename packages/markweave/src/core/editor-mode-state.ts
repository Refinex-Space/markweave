import type { Editor } from "@tiptap/core";

export type MarkweaveEditorMode = "live" | "view";

export interface MarkweaveEditorModeState {
  readonly mode: MarkweaveEditorMode;
  readonly editable: boolean;
}

const defaultModeState: MarkweaveEditorModeState = {
  mode: "live",
  editable: true,
};

const defaultReadonlyModeState: MarkweaveEditorModeState = {
  mode: "view",
  editable: false,
};

const editorModeStates = new WeakMap<Editor, MarkweaveEditorModeState>();
const editorModeListeners = new WeakMap<Editor, Set<() => void>>();

export function normalizeMarkweaveEditorMode(mode: unknown): MarkweaveEditorMode {
  return mode === "view" ? "view" : "live";
}

export function getMarkweaveEditorModeState(editor: Editor | null | undefined): MarkweaveEditorModeState {
  if (!editor) {
    return defaultModeState;
  }

  return editorModeStates.get(editor) ?? (editor.isEditable ? defaultModeState : defaultReadonlyModeState);
}

export function isMarkweaveEditorLiveEditable(state: MarkweaveEditorModeState) {
  return state.mode === "live" && state.editable;
}

export function setMarkweaveEditorModeState(editor: Editor, state: MarkweaveEditorModeState) {
  const nextState: MarkweaveEditorModeState = {
    mode: normalizeMarkweaveEditorMode(state.mode),
    editable: state.editable,
  };
  const previousState = getMarkweaveEditorModeState(editor);

  if (previousState.mode === nextState.mode && previousState.editable === nextState.editable) {
    return;
  }

  editorModeStates.set(editor, nextState);
  editorModeListeners.get(editor)?.forEach((listener) => listener());
}

export function subscribeToMarkweaveEditorMode(editor: Editor | null | undefined, listener: () => void) {
  if (!editor) {
    return () => undefined;
  }

  let listeners = editorModeListeners.get(editor);

  if (!listeners) {
    listeners = new Set();
    editorModeListeners.set(editor, listeners);
  }

  listeners.add(listener);

  return () => {
    listeners?.delete(listener);
  };
}
