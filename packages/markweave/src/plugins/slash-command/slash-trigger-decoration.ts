import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { getSlashCommandContext } from "./slash-runtime";

export interface MarkweaveSlashTriggerDecorationOptions {
  readonly filterPlaceholder: string;
}

/**
 * Styles the in-document `/query` trigger text in place while the slash menu is
 * active, and shows the localized filter hint after a lone `/`.
 *
 * The trigger is the real editor text (the same range the menu opens from), so
 * there is a single source of truth and nothing to mask. This replaces the old
 * floating overlay pill that duplicated the `/` on top of the live text and
 * leaked the underlying glyph and caret (visible flicker).
 */
export const MarkweaveSlashTriggerDecoration = Extension.create<MarkweaveSlashTriggerDecorationOptions>({
  name: "markweaveSlashTriggerDecoration",

  addOptions() {
    return {
      filterPlaceholder: "",
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            if (!this.editor.isEditable) {
              return DecorationSet.empty;
            }

            const context = getSlashCommandContext(state);
            if (!context || context.triggerTo <= context.triggerFrom) {
              return DecorationSet.empty;
            }

            const attributes: Record<string, string> = {
              class: "markweave-slash-trigger-active",
            };
            if (context.query.length === 0 && this.options.filterPlaceholder) {
              attributes["data-markweave-slash-filter"] = this.options.filterPlaceholder;
            }

            return DecorationSet.create(state.doc, [
              Decoration.inline(context.triggerFrom, context.triggerTo, attributes),
            ]);
          },
        },
      }),
    ];
  },
});
