import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";

export interface CompositionGuardState {
  readonly composing: boolean;
}

type CompositionGuardMeta =
  | {
      readonly type: "set-composing";
      readonly composing: boolean;
    }
  | {
      readonly type: "reset";
    };

export const compositionGuardPluginKey = new PluginKey<CompositionGuardState>("markweaveCompositionGuard");

export const initialCompositionGuardState: CompositionGuardState = {
  composing: false,
};

export function isEditorComposing(state: EditorState) {
  return compositionGuardPluginKey.getState(state)?.composing ?? false;
}

export function setCompositionState(tr: Transaction, composing: boolean) {
  return tr.setMeta(compositionGuardPluginKey, { type: "set-composing", composing } satisfies CompositionGuardMeta);
}

function getCompositionGuardMeta(tr: Transaction) {
  return tr.getMeta(compositionGuardPluginKey) as CompositionGuardMeta | undefined;
}

function applyCompositionGuardTransaction(tr: Transaction, previous: CompositionGuardState) {
  const meta = getCompositionGuardMeta(tr);

  if (meta?.type === "set-composing") {
    return { composing: meta.composing };
  }

  if (meta?.type === "reset") {
    return initialCompositionGuardState;
  }

  return previous;
}

export const MarkweaveCompositionGuard = Extension.create({
  name: "markweaveCompositionGuard",
  priority: 1100,

  addProseMirrorPlugins() {
    return [
      new Plugin<CompositionGuardState>({
        key: compositionGuardPluginKey,
        state: {
          init: () => initialCompositionGuardState,
          apply: applyCompositionGuardTransaction,
        },
        props: {
          handleDOMEvents: {
            compositionstart: (view) => {
              view.dispatch(setCompositionState(view.state.tr, true));
              return false;
            },
            compositionupdate: (view) => {
              if (!isEditorComposing(view.state)) {
                view.dispatch(setCompositionState(view.state.tr, true));
              }
              return false;
            },
            compositionend: (view) => {
              view.dispatch(setCompositionState(view.state.tr, false));
              return false;
            },
          },
        },
      }),
    ];
  },
});
