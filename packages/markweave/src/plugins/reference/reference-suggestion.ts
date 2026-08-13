import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";

/**
 * A reference-suggestion item. The host owns display metadata; Markweave only
 * needs a link `href` and the human label. `title` overrides the inserted link
 * text (defaults to `label`). Hosts may extend this with their own fields.
 */
export interface MarkweaveReferenceItem {
  readonly href: string;
  readonly label: string;
  readonly title?: string;
}

/**
 * Framework-neutral render state handed to the host popup. It deliberately hides
 * the underlying Tiptap/ProseMirror and Floating UI types so adapters and hosts
 * stay free of a direct Tiptap dependency. `mount` takes over positioning of the
 * provided element (anchored to the trigger, repositioned on scroll/resize) and
 * returns an unmount callback that must be invoked on exit.
 */
export interface MarkweaveReferenceRenderState<
  TItem extends MarkweaveReferenceItem = MarkweaveReferenceItem,
> {
  readonly items: readonly TItem[];
  readonly query: string;
  readonly loading: boolean;
  readonly command: (item: TItem) => void;
  readonly mount: (element: HTMLElement) => () => void;
  readonly clientRect: (() => DOMRect | null) | null;
}

export interface MarkweaveReferenceKeyDownState {
  readonly event: KeyboardEvent;
}

export interface MarkweaveReferenceRenderer<
  TItem extends MarkweaveReferenceItem = MarkweaveReferenceItem,
> {
  readonly onStart?: (state: MarkweaveReferenceRenderState<TItem>) => void;
  readonly onUpdate?: (state: MarkweaveReferenceRenderState<TItem>) => void;
  readonly onExit?: (state: MarkweaveReferenceRenderState<TItem>) => void;
  readonly onKeyDown?: (state: MarkweaveReferenceKeyDownState) => boolean;
}

export interface MarkweaveReferenceSuggestionConfig<
  TItem extends MarkweaveReferenceItem = MarkweaveReferenceItem,
> {
  /** Trigger string. Defaults to `[[` for wiki-style document references. */
  readonly char?: string;
  /** Allow spaces inside the query. Defaults to `true`. */
  readonly allowSpaces?: boolean;
  /**
   * Characters allowed immediately before the trigger, or `null` to allow the
   * trigger anywhere (recommended for CJK text without word spacing).
   * Defaults to `null`.
   */
  readonly allowedPrefixes?: string[] | null;
  /** Minimum query length before `items` is queried. Defaults to `0`. */
  readonly minQueryLength?: number;
  /** Debounce in milliseconds before `items` runs. Defaults to `0`. */
  readonly debounce?: number;
  /** Resolves candidate items for the current query. */
  readonly items: (options: {
    readonly query: string;
  }) => TItem[] | Promise<TItem[]>;
  /** Host popup renderer. When omitted, no popup is shown. */
  readonly render?: () => MarkweaveReferenceRenderer<TItem>;
  /**
   * Overrides how a selected item is written to the document. When omitted, the
   * item is inserted as an ordinary Markdown link `[title](href)`, preserving the
   * Markdown-first storage model.
   */
  readonly command?: (options: {
    readonly editor: Editor;
    readonly range: { readonly from: number; readonly to: number };
    readonly item: TItem;
  }) => void;
  /** Optional notification after a default or custom insertion completes. */
  readonly onInsert?: (item: TItem) => void;
}

export interface MarkweaveReferenceSuggestionExtensionOptions {
  readonly config?: MarkweaveReferenceSuggestionConfig | null;
}

export const DEFAULT_MARKWEAVE_REFERENCE_TRIGGER = "[[";

export const markweaveReferenceSuggestionPluginKey = new PluginKey(
  "markweaveReferenceSuggestion",
);

/**
 * Inserts a selected reference as an ordinary Markdown link at `range`. The
 * document keeps a plain `[title](href)` link (no HTML projection), and the link
 * mark is not carried into subsequent typing.
 */
export function insertMarkweaveReferenceLink(
  editor: Editor,
  range: { from: number; to: number },
  item: MarkweaveReferenceItem,
): boolean {
  const href = item.href.trim();

  if (!href) {
    return false;
  }

  const title = (item.title ?? item.label ?? "").trim() || href;
  const linkMark = editor.schema.marks.link;

  const chain = editor.chain().focus();

  if (linkMark) {
    chain
      .insertContentAt(range, {
        type: "text",
        text: title,
        marks: [{ type: "link", attrs: { href } }],
      })
      .command(({ tr, state }) => {
        tr.removeStoredMark(state.schema.marks.link);
        return true;
      });
  } else {
    chain.insertContentAt(range, title);
  }

  return chain.run();
}

function toRenderState<TItem extends MarkweaveReferenceItem>(
  props: SuggestionProps<TItem, TItem>,
): MarkweaveReferenceRenderState<TItem> {
  return {
    items: props.items,
    query: props.query,
    loading: props.loading,
    command: (item) => props.command(item),
    mount: (element) => props.mount(element),
    clientRect: props.clientRect ?? null,
  };
}

/**
 * A framework-neutral, host-driven reference suggestion primitive. Trusted hosts
 * supply the data source, popup renderer and (optionally) insertion behavior;
 * Markweave owns the ProseMirror trigger detection, query lifecycle and default
 * Markdown-link insertion. Rendering is delegated to `@tiptap/suggestion`'s
 * managed Floating UI mounting so adapters need no positioning code.
 */
export const MarkweaveReferenceSuggestion =
  Extension.create<MarkweaveReferenceSuggestionExtensionOptions>({
    name: "markweaveReferenceSuggestion",

    addOptions() {
      return { config: null };
    },

    addProseMirrorPlugins() {
      const config = this.options.config;

      if (!config) {
        return [];
      }

      const editor = this.editor;

      return [
        Suggestion<MarkweaveReferenceItem, MarkweaveReferenceItem>({
          editor,
          pluginKey: markweaveReferenceSuggestionPluginKey,
          char: config.char ?? DEFAULT_MARKWEAVE_REFERENCE_TRIGGER,
          allowSpaces: config.allowSpaces ?? true,
          allowedPrefixes:
            config.allowedPrefixes === undefined ? null : config.allowedPrefixes,
          minQueryLength: config.minQueryLength,
          debounce: config.debounce,
          items: ({ query }) => config.items({ query }),
          command: ({ editor: activeEditor, range, props }) => {
            if (config.command) {
              config.command({
                editor: activeEditor,
                range: { from: range.from, to: range.to },
                item: props,
              });
            } else {
              insertMarkweaveReferenceLink(activeEditor, range, props);
            }

            config.onInsert?.(props);
          },
          render: config.render
            ? () => {
                const renderer = config.render!();

                return {
                  onStart: renderer.onStart
                    ? (props: SuggestionProps<MarkweaveReferenceItem, MarkweaveReferenceItem>) =>
                        renderer.onStart!(toRenderState(props))
                    : undefined,
                  onUpdate: renderer.onUpdate
                    ? (props: SuggestionProps<MarkweaveReferenceItem, MarkweaveReferenceItem>) =>
                        renderer.onUpdate!(toRenderState(props))
                    : undefined,
                  onExit: renderer.onExit
                    ? (props: SuggestionProps<MarkweaveReferenceItem, MarkweaveReferenceItem>) =>
                        renderer.onExit!(toRenderState(props))
                    : undefined,
                  onKeyDown: renderer.onKeyDown
                    ? ({ event }: { event: KeyboardEvent }) =>
                        renderer.onKeyDown!({ event })
                    : undefined,
                };
              }
            : undefined,
          allow: ({ range }: { range: Range }) => range.from >= 0,
        }),
      ];
    },
  });
