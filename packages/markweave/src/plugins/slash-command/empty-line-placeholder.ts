import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { getSlashCommandOpenDecision } from "./slash-runtime";

export interface MarkweaveSlashEmptyLinePlaceholderOptions {
  readonly placeholder: string;
}

export const MarkweaveSlashEmptyLinePlaceholder = Extension.create<MarkweaveSlashEmptyLinePlaceholderOptions>({
  name: "markweaveSlashEmptyLinePlaceholder",

  addOptions() {
    return {
      placeholder: "",
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const { $from } = state.selection;

            if (
              !this.editor.isEditable
              || !this.options.placeholder
              || $from.parent.content.size > 0
              || !getSlashCommandOpenDecision(state).canOpen
            ) {
              return DecorationSet.empty;
            }

            return DecorationSet.create(state.doc, [
              Decoration.node($from.before(), $from.after(), {
                class: "markweave-slash-empty-line-placeholder",
                "data-markweave-slash-placeholder": this.options.placeholder,
              }),
            ]);
          },
        },
      }),
    ];
  },
});
