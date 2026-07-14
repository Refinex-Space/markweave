import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

export interface MarkweaveSearchOptions {
  readonly caseSensitive: boolean;
  readonly regex: boolean;
  readonly wholeWord: boolean;
}

export interface MarkweaveSearchState {
  readonly activeMatchIndex: number;
  readonly error: string | null;
  readonly matchCount: number;
  readonly options: MarkweaveSearchOptions;
  readonly query: string;
}

export interface MarkweaveSearchController {
  readonly clear: () => void;
  readonly findNext: () => boolean;
  readonly findPrevious: () => boolean;
  readonly getState: () => MarkweaveSearchState;
  readonly replaceAll: (replacement: string) => number;
  readonly replaceCurrent: (replacement: string) => boolean;
  readonly setOptions: (options: Partial<MarkweaveSearchOptions>) => void;
  readonly setQuery: (query: string, options?: Partial<MarkweaveSearchOptions>) => void;
  readonly subscribe: (listener: (state: MarkweaveSearchState) => void) => () => void;
}

interface SearchMatch {
  readonly captures: readonly (string | undefined)[];
  readonly from: number;
  readonly groups: Readonly<Record<string, string>> | null;
  readonly input: string;
  readonly inputIndex: number;
  readonly text: string;
  readonly to: number;
}

interface SearchPluginState extends MarkweaveSearchState {
  readonly matches: readonly SearchMatch[];
}

type SearchAction =
  | { readonly type: "clear" }
  | { readonly type: "next" | "previous" }
  | {
      readonly type: "set-query";
      readonly options?: Partial<MarkweaveSearchOptions>;
      readonly query: string;
    }
  | {
      readonly type: "set-options";
      readonly options: Partial<MarkweaveSearchOptions>;
    };

interface TextChunk {
  readonly positions: readonly number[];
  readonly text: string;
}

const defaultSearchOptions: MarkweaveSearchOptions = {
  caseSensitive: false,
  regex: false,
  wholeWord: false,
};
const wordSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "word" })
    : null;

const searchPluginKey = new PluginKey<SearchPluginState>("markweaveSearch");
const searchListeners = new WeakMap<EditorView, Set<(state: MarkweaveSearchState) => void>>();

function emptySearchState(): SearchPluginState {
  return {
    activeMatchIndex: -1,
    error: null,
    matchCount: 0,
    matches: [],
    options: defaultSearchOptions,
    query: "",
  };
}

function publicSearchState(state: SearchPluginState): MarkweaveSearchState {
  return {
    activeMatchIndex: state.activeMatchIndex,
    error: state.error,
    matchCount: state.matchCount,
    options: state.options,
    query: state.query,
  };
}

function searchStatesEqual(left: MarkweaveSearchState, right: MarkweaveSearchState) {
  return (
    left.activeMatchIndex === right.activeMatchIndex &&
    left.error === right.error &&
    left.matchCount === right.matchCount &&
    left.query === right.query &&
    left.options.caseSensitive === right.options.caseSensitive &&
    left.options.regex === right.options.regex &&
    left.options.wholeWord === right.options.wholeWord
  );
}

function notifySearchListeners(view: EditorView, state: MarkweaveSearchState) {
  searchListeners.get(view)?.forEach((listener) => listener(state));
}

function createSearchPlugin() {
  return new Plugin<SearchPluginState>({
    key: searchPluginKey,
    state: {
      init: () => emptySearchState(),
      apply(transaction, current) {
        const action = transaction.getMeta(searchPluginKey) as SearchAction | undefined;

        if (action?.type === "clear") {
          return emptySearchState();
        }

        if (action?.type === "set-query") {
          return createSearchState(
            transaction.doc,
            action.query,
            { ...current.options, ...action.options },
            0,
          );
        }

        if (action?.type === "set-options") {
          return createSearchState(
            transaction.doc,
            current.query,
            { ...current.options, ...action.options },
            current.activeMatchIndex,
          );
        }

        if (action?.type === "next" || action?.type === "previous") {
          if (current.matches.length === 0) {
            return current;
          }

          const delta = action.type === "next" ? 1 : -1;
          const activeMatchIndex =
            (current.activeMatchIndex + delta + current.matches.length) %
            current.matches.length;
          return { ...current, activeMatchIndex };
        }

        if (transaction.docChanged && current.query) {
          return createSearchState(
            transaction.doc,
            current.query,
            current.options,
            current.activeMatchIndex,
          );
        }

        return current;
      },
    },
    props: {
      decorations(state) {
        const searchState = searchPluginKey.getState(state);

        if (!searchState?.matches.length) {
          return DecorationSet.empty;
        }

        return DecorationSet.create(
          state.doc,
          searchState.matches.map((match, index) =>
            Decoration.inline(match.from, match.to, {
              class:
                index === searchState.activeMatchIndex
                  ? "markweave-search-match markweave-search-match--active"
                  : "markweave-search-match",
              "data-markweave-search-match":
                index === searchState.activeMatchIndex ? "active" : "match",
            }),
          ),
        );
      },
    },
    view(view) {
      let previous = publicSearchState(getSearchPluginState(view.state));

      return {
        update(nextView) {
          const next = publicSearchState(getSearchPluginState(nextView.state));

          if (!searchStatesEqual(previous, next)) {
            previous = next;
            notifySearchListeners(nextView, next);
          }
        },
        destroy() {
          searchListeners.delete(view);
        },
      };
    },
  });
}

export const MarkweaveSearch = Extension.create({
  name: "markweaveSearch",
  addProseMirrorPlugins() {
    return [createSearchPlugin()];
  },
});

export function createMarkweaveSearchController(editor: Editor): MarkweaveSearchController {
  getSearchPluginState(editor.state);

  return {
    clear: () => {
      dispatchSearchAction(editor, { type: "clear" });
    },
    findNext: () => navigateSearch(editor, "next"),
    findPrevious: () => navigateSearch(editor, "previous"),
    getState: () => publicSearchState(getSearchPluginState(editor.state)),
    replaceAll: (replacement) => replaceAllMatches(editor, replacement),
    replaceCurrent: (replacement) => replaceCurrentMatch(editor, replacement),
    setOptions: (options) => {
      dispatchSearchAction(editor, { options, type: "set-options" });
      revealActiveMatch(editor);
    },
    setQuery: (query, options) => {
      dispatchSearchAction(editor, { options, query, type: "set-query" });
      revealActiveMatch(editor);
    },
    subscribe: (listener) => {
      const listeners = searchListeners.get(editor.view) ?? new Set();
      listeners.add(listener);
      searchListeners.set(editor.view, listeners);
      listener(publicSearchState(getSearchPluginState(editor.state)));

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          searchListeners.delete(editor.view);
        }
      };
    },
  };
}

function getSearchPluginState(state: EditorState) {
  const searchState = searchPluginKey.getState(state);

  if (!searchState) {
    throw new Error("MarkweaveSearch is not registered in this editor.");
  }

  return searchState;
}

function dispatchSearchAction(editor: Editor, action: SearchAction) {
  editor.view.dispatch(editor.state.tr.setMeta(searchPluginKey, action));
}

function navigateSearch(editor: Editor, type: "next" | "previous") {
  if (getSearchPluginState(editor.state).matches.length === 0) {
    return false;
  }

  dispatchSearchAction(editor, { type });
  revealActiveMatch(editor);
  return true;
}

function revealActiveMatch(editor: Editor) {
  const searchState = getSearchPluginState(editor.state);
  const match = searchState.matches[searchState.activeMatchIndex];

  if (!match) {
    return false;
  }

  editor.view.dom
    .querySelector<HTMLElement>(".markweave-search-match--active")
    ?.scrollIntoView?.({ block: "center", inline: "nearest" });
  return true;
}

function replaceCurrentMatch(editor: Editor, replacement: string) {
  if (!editor.isEditable) {
    return false;
  }

  const searchState = getSearchPluginState(editor.state);
  const match = searchState.matches[searchState.activeMatchIndex];

  if (!match) {
    return false;
  }

  const transaction = editor.state.tr.insertText(
    expandReplacement(replacement, match),
    match.from,
    match.to,
  );
  editor.view.dispatch(transaction);
  revealActiveMatch(editor);
  return true;
}

function replaceAllMatches(editor: Editor, replacement: string) {
  if (!editor.isEditable) {
    return 0;
  }

  const matches = getSearchPluginState(editor.state).matches;

  if (matches.length === 0) {
    return 0;
  }

  const transaction = matches
    .slice()
    .reverse()
    .reduce<Transaction>(
      (current, match) =>
        current.insertText(
          expandReplacement(replacement, match),
          match.from,
          match.to,
        ),
      editor.state.tr,
    );
  editor.view.dispatch(transaction);
  revealActiveMatch(editor);
  return matches.length;
}

function createSearchState(
  doc: ProseMirrorNode,
  query: string,
  options: MarkweaveSearchOptions,
  preferredActiveIndex: number,
): SearchPluginState {
  if (!query) {
    return { ...emptySearchState(), options };
  }

  const result = findMatches(doc, query, options);
  const activeMatchIndex = result.matches.length
    ? Math.min(Math.max(preferredActiveIndex, 0), result.matches.length - 1)
    : -1;

  return {
    activeMatchIndex,
    error: result.error,
    matchCount: result.matches.length,
    matches: result.matches,
    options,
    query,
  };
}

function findMatches(
  doc: ProseMirrorNode,
  query: string,
  options: MarkweaveSearchOptions,
): { readonly error: string | null; readonly matches: readonly SearchMatch[] } {
  let matcher: RegExp;

  try {
    matcher = new RegExp(
      options.regex ? query : escapeRegExp(query),
      `gu${options.caseSensitive ? "" : "i"}`,
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Invalid regular expression",
      matches: [],
    };
  }

  const matches: SearchMatch[] = [];

  for (const chunk of getTextChunks(doc)) {
    matcher.lastIndex = 0;
    let result: RegExpExecArray | null;

    while ((result = matcher.exec(chunk.text)) !== null) {
      if (result[0].length === 0) {
        matcher.lastIndex = advanceStringIndex(chunk.text, matcher.lastIndex);
        continue;
      }

      const start = result.index;
      const end = start + result[0].length;

      if (options.wholeWord && !isWholeWordMatch(chunk.text, start, end)) {
        continue;
      }

      const from = chunk.positions[start];
      const to = chunk.positions[end];

      if (from === undefined || to === undefined || from >= to) {
        continue;
      }

      matches.push({
        captures: result.slice(1),
        from,
        groups: result.groups ?? null,
        input: chunk.text,
        inputIndex: start,
        text: result[0],
        to,
      });
    }
  }

  return { error: null, matches };
}

function getTextChunks(doc: ProseMirrorNode) {
  const chunks: TextChunk[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true;
    }

    let chunkText = "";
    let positions: number[] = [];

    const flush = () => {
      if (chunkText) {
        chunks.push({ positions, text: chunkText });
      }
      chunkText = "";
      positions = [];
    };

    node.descendants((child, childPos) => {
      if (!child.isText || !child.text) {
        return true;
      }

      const absolutePos = pos + 1 + childPos;
      const previousEnd = positions[positions.length - 1];

      if (previousEnd !== undefined && previousEnd !== absolutePos) {
        flush();
      }

      if (positions.length === 0) {
        positions.push(absolutePos);
      }

      chunkText += child.text;
      for (let index = 1; index <= child.text.length; index += 1) {
        positions.push(absolutePos + index);
      }

      return false;
    });

    flush();
    return false;
  });

  return chunks;
}

function isWholeWordMatch(text: string, start: number, end: number) {
  if (wordSegmenter) {
    for (const segment of wordSegmenter.segment(text)) {
      if (segment.index > start) {
        return false;
      }

      if (segment.index === start) {
        return segment.isWordLike === true && start + segment.segment.length === end;
      }
    }

    return false;
  }

  return !isWordCharacter(characterBefore(text, start)) && !isWordCharacter(characterAfter(text, end));
}

function characterBefore(text: string, index: number) {
  return Array.from(text.slice(Math.max(0, index - 2), index)).at(-1) ?? "";
}

function characterAfter(text: string, index: number) {
  return Array.from(text.slice(index, index + 2))[0] ?? "";
}

function isWordCharacter(value: string) {
  return value ? /[\p{L}\p{N}_]/u.test(value) : false;
}

function advanceStringIndex(text: string, index: number) {
  const codePoint = text.codePointAt(index);
  return index + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expandReplacement(replacement: string, match: SearchMatch) {
  return replacement.replace(
    /\$(\$|&|`|'|<([^>]+)>|(\d{1,2}))/g,
    (token, marker: string, groupName: string | undefined, groupIndex: string | undefined) => {
      if (marker === "$") return "$";
      if (marker === "&") return match.text;
      if (marker === "`") return match.input.slice(0, match.inputIndex);
      if (marker === "'") return match.input.slice(match.inputIndex + match.text.length);
      if (groupName !== undefined) return match.groups?.[groupName] ?? "";
      if (groupIndex !== undefined) {
        const capture = match.captures[Number(groupIndex) - 1];
        return capture === undefined ? token : capture;
      }
      return token;
    },
  );
}
