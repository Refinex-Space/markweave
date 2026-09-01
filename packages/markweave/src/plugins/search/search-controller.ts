import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { getMarkweaveDocumentViewportCoordinatorForElement } from "../../core/document-viewport";
import { getMarkweaveDocumentLoadMeta } from "../../editor-core/document-load";

export interface MarkweaveSearchOptions {
  readonly caseSensitive: boolean;
  readonly regex: boolean;
  readonly wholeWord: boolean;
}

export interface MarkweaveSearchState {
  readonly activeMatchIndex: number;
  readonly error: string | null;
  readonly execution?: {
    readonly progress: number | null;
    readonly revision: number;
    readonly status: "idle" | "searching" | "ready" | "error";
  };
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

interface TextSegment {
  readonly from: number;
  readonly text: string;
  readonly to: number;
  /** Bit 1 marks a word start and bit 2 marks a word end. */
  readonly wordBoundaries: Uint8Array | null;
}

interface TextIndex {
  readonly segments: readonly TextSegment[];
  readonly totalTextLength: number;
}

interface SearchPluginState extends MarkweaveSearchState {
  readonly decorations: DecorationSet;
  readonly docRevision: number;
  readonly index: TextIndex;
  readonly loadMounting: boolean;
  readonly matches: readonly SearchMatch[];
  readonly matchesRevision: number;
  readonly pendingActiveMatchIndex: number;
  readonly projectedDecorations: ReadonlyMap<number, Decoration>;
  readonly queuedNavigationDelta: number;
  readonly requestToken: number;
}

type SearchAction =
  | { readonly type: "clear" }
  | { readonly type: "next" | "previous" }
  | { readonly delta: number; readonly type: "queue-navigation" }
  | {
      readonly type: "set-query";
      readonly options?: Partial<MarkweaveSearchOptions>;
      readonly query: string;
    }
  | {
      readonly type: "set-options";
      readonly options: Partial<MarkweaveSearchOptions>;
    }
  | {
      readonly progress: number;
      readonly revision: number;
      readonly token: number;
      readonly type: "async-progress";
    }
  | {
      readonly matches: readonly SearchMatch[];
      readonly revision: number;
      readonly token: number;
      readonly type: "async-result";
    }
  | {
      readonly error: string;
      readonly revision: number;
      readonly token: number;
      readonly type: "async-error";
    };

interface ChangedRange {
  readonly from: number;
  readonly to: number;
}

interface SearchRuntime {
  abortController: AbortController | null;
  destroyed: boolean;
  revealAbortController: AbortController | null;
  requestToken: number;
}

interface CompactWorkerSearchMatch {
  readonly captures: readonly (string | undefined)[];
  readonly groups: Readonly<Record<string, string>> | null;
  readonly inputIndex: number;
  readonly segmentIndex: number;
  readonly text: string;
}

interface SearchExecutor {
  readonly execute: (
    segments: readonly TextSegment[],
    query: string,
    options: MarkweaveSearchOptions,
    signal: AbortSignal,
    onProgress: (progress: number) => void,
  ) => Promise<readonly SearchMatch[]>;
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
const emptyCaptures: readonly (string | undefined)[] = [];
const asyncSearchTextThreshold = 200_000;
const maxProjectedDecorations = 256;
const regexTimeoutMs = 2_000;
const searchSliceMs = 6;
const unsafeRegexFallbackError =
  "This regular expression requires Web Worker support to search safely.";

const searchPluginKey = new PluginKey<SearchPluginState>("markweaveSearch");
const searchListeners = new WeakMap<EditorView, Set<(state: MarkweaveSearchState) => void>>();
const searchRuntimes = new WeakMap<EditorView, SearchRuntime>();
const cooperativeSearchExecutor: SearchExecutor = {
  execute: findMatchesCooperatively,
};
const automaticSearchExecutor: SearchExecutor = {
  execute: executeSearchWithWorkerFallback,
};

function searchWorkerMain() {
  const isWordCharacter = (value: string) => value ? /[\p{L}\p{N}_]/u.test(value) : false;
  const characterBefore = (text: string, index: number) => Array.from(text.slice(Math.max(0, index - 2), index)).at(-1) ?? "";
  const characterAfter = (text: string, index: number) => Array.from(text.slice(index, index + 2))[0] ?? "";
  const wholeWord = (segment: { text: string; wordBoundaries: Uint8Array | null }, start: number, end: number) => {
    if (segment.wordBoundaries) {
      return Boolean(segment.wordBoundaries[start] & 1) && Boolean(segment.wordBoundaries[end] & 2);
    }
    return !isWordCharacter(characterBefore(segment.text, start)) && !isWordCharacter(characterAfter(segment.text, end));
  };
  const advance = (text: string, index: number) => {
    const point = text.codePointAt(index);
    return index + (point !== undefined && point > 0xffff ? 2 : 1);
  };

  self.onmessage = (event: MessageEvent<{
    segments: Array<{ from: number; text: string; wordBoundaries: Uint8Array | null }>;
    query: string;
    regex: boolean;
    caseSensitive: boolean;
    wholeWord: boolean;
  }>) => {
    try {
      const data = event.data;
      const matcher = new RegExp(data.query, `gu${data.caseSensitive ? "" : "i"}`);
      const matches: Array<Record<string, unknown>> = [];
      for (let segmentIndex = 0; segmentIndex < data.segments.length; segmentIndex += 1) {
        const segment = data.segments[segmentIndex]!;
        matcher.lastIndex = 0;
        let result: RegExpExecArray | null;
        while ((result = matcher.exec(segment.text)) !== null) {
          if (result[0].length > 0) {
            const start = result.index;
            const end = start + result[0].length;
            if (!data.wholeWord || wholeWord(segment, start, end)) {
              matches.push({
                captures: result.slice(1),
                groups: result.groups ?? null,
                inputIndex: start,
                segmentIndex,
                text: result[0],
              });
            }
          } else {
            matcher.lastIndex = advance(segment.text, matcher.lastIndex);
          }
        }
        if (segmentIndex % 16 === 0) {
          self.postMessage({ type: "progress", progress: (segmentIndex + 1) / Math.max(data.segments.length, 1) });
        }
      }
      self.postMessage({ type: "result", matches });
    } catch (error) {
      self.postMessage({ type: "error", error: error instanceof Error ? error.message : "Search failed" });
    }
  };
}

function executeSearchWithWorkerFallback(
  segments: readonly TextSegment[],
  query: string,
  options: MarkweaveSearchOptions,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
) {
  const ownerWindow = typeof window === "undefined" ? null : window;
  if (!ownerWindow?.Worker || !ownerWindow.Blob || !ownerWindow.URL?.createObjectURL) {
    return executeSafeCooperativeFallback(segments, query, options, signal, onProgress);
  }

  let worker: Worker;
  let objectUrl: string;
  try {
    const source = `(${searchWorkerMain.toString()})();`;
    objectUrl = ownerWindow.URL.createObjectURL(new ownerWindow.Blob([source], { type: "text/javascript" }));
    worker = new ownerWindow.Worker(objectUrl);
  } catch {
    return executeSafeCooperativeFallback(segments, query, options, signal, onProgress);
  }

  return new Promise<readonly SearchMatch[]>((resolve, reject) => {
    let settled = false;
    let timeout: number | null = null;
    const cleanup = () => {
      if (timeout !== null) {
        ownerWindow.clearTimeout(timeout);
      }
      signal.removeEventListener("abort", cancel);
      worker.terminate();
      ownerWindow.URL.revokeObjectURL(objectUrl);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const cancel = () => finish(() => reject(new SearchCancellationError()));
    const fallbackAfterWorkerFailure = () => {
      if (settled) return;
      settled = true;
      cleanup();
      void executeSafeCooperativeFallback(segments, query, options, signal, onProgress)
        .then(resolve, reject);
    };
    if (options.regex) {
      timeout = ownerWindow.setTimeout(() => {
        finish(() => reject(new Error(`Search timed out after ${regexTimeoutMs}ms`)));
      }, regexTimeoutMs);
    }
    signal.addEventListener("abort", cancel, { once: true });
    worker.onerror = (event) => {
      event.preventDefault?.();
      fallbackAfterWorkerFailure();
    };
    worker.onmessage = (event: MessageEvent<{
      type: "progress" | "result" | "error";
      progress?: number;
      matches?: readonly CompactWorkerSearchMatch[];
      error?: string;
    }>) => {
      if (event.data.type === "progress") {
        onProgress(event.data.progress ?? 0);
      } else if (event.data.type === "result") {
        finish(() => resolve(hydrateWorkerMatches(segments, event.data.matches ?? [])));
      } else {
        fallbackAfterWorkerFailure();
      }
    };
    if (signal.aborted) {
      cancel();
      return;
    }
    const matcher = createMatcher(query, options);
    if (typeof matcher === "string") {
      finish(() => reject(new Error(matcher)));
      return;
    }
    try {
      worker.postMessage({
        caseSensitive: options.caseSensitive,
        query: matcher.source,
        regex: options.regex,
        segments,
        wholeWord: options.wholeWord,
      });
    } catch {
      fallbackAfterWorkerFailure();
    }
  });
}

function hydrateWorkerMatches(
  segments: readonly TextSegment[],
  matches: readonly CompactWorkerSearchMatch[],
) {
  return matches.flatMap((match) => {
    const segment = segments[match.segmentIndex];
    if (
      !segment ||
      !Number.isInteger(match.inputIndex) ||
      match.inputIndex < 0 ||
      !match.text ||
      match.inputIndex + match.text.length > segment.text.length ||
      segment.text.slice(match.inputIndex, match.inputIndex + match.text.length) !== match.text
    ) {
      return [];
    }

    return [{
      captures: match.captures,
      from: segment.from + match.inputIndex,
      groups: match.groups,
      input: segment.text,
      inputIndex: match.inputIndex,
      text: match.text,
      to: segment.from + match.inputIndex + match.text.length,
    }];
  });
}

function executeSafeCooperativeFallback(
  segments: readonly TextSegment[],
  query: string,
  options: MarkweaveSearchOptions,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
) {
  if (options.regex && !isRegexSafeForCooperativeSearch(query)) {
    return Promise.reject(new Error(unsafeRegexFallbackError));
  }
  return cooperativeSearchExecutor.execute(segments, query, options, signal, onProgress);
}

function isRegexSafeForCooperativeSearch(query: string) {
  if (query.length > 128) return false;

  let escaped = false;
  let inCharacterClass = false;
  let quantifierCount = 0;
  let unboundedQuantifierCount = 0;
  let lastToken: "group" | "quantifier" | "other" | null = null;
  let lastGroupRisky = false;
  const groups: Array<{
    hasAlternation: boolean;
    hasQuantifier: boolean;
    hasRiskyNestedGroup: boolean;
  }> = [];

  for (let index = 0; index < query.length; index += 1) {
    const character = query[index];
    if (escaped) {
      if (/[1-9k]/.test(character)) return false;
      escaped = false;
      lastToken = "other";
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "[") {
      inCharacterClass = true;
      continue;
    }
    if (character === "]" && inCharacterClass) {
      inCharacterClass = false;
      lastToken = "other";
      continue;
    }
    if (inCharacterClass) continue;
    if (character === "(" && query[index + 1] === "?") {
      return false;
    }
    if (character === "(") {
      groups.push({
        hasAlternation: false,
        hasQuantifier: false,
        hasRiskyNestedGroup: false,
      });
      lastToken = null;
      continue;
    }
    if (character === ")") {
      const group = groups.pop();
      if (!group) return false;
      lastGroupRisky =
        group.hasAlternation || group.hasQuantifier || group.hasRiskyNestedGroup;
      if (lastGroupRisky) {
        const parent = groups[groups.length - 1];
        if (parent) parent.hasRiskyNestedGroup = true;
      }
      lastToken = "group";
      continue;
    }
    if (character === "|") {
      const group = groups[groups.length - 1];
      if (group) group.hasAlternation = true;
      lastToken = null;
      continue;
    }
    if (character === "{" || character === "}") return false;
    if (character === "*" || character === "+" || character === "?") {
      if (character === "?" && lastToken === "quantifier") continue;
      if (lastToken === "group" && lastGroupRisky) return false;
      quantifierCount += 1;
      if (quantifierCount > 2) return false;
      if (character === "*" || character === "+") {
        unboundedQuantifierCount += 1;
        if (unboundedQuantifierCount > 1) return false;
      }
      const group = groups[groups.length - 1];
      if (group) group.hasQuantifier = true;
      lastToken = "quantifier";
      continue;
    }
    lastToken = "other";
  }
  return !escaped && !inCharacterClass && groups.length === 0;
}

function createInitialSearchState(doc: ProseMirrorNode): SearchPluginState {
  return {
    activeMatchIndex: -1,
    decorations: DecorationSet.empty,
    docRevision: 0,
    error: null,
    execution: {
      progress: null,
      revision: 0,
      status: "idle",
    },
    index: createTextIndex(doc),
    loadMounting: false,
    matchCount: 0,
    matches: [],
    matchesRevision: -1,
    options: defaultSearchOptions,
    pendingActiveMatchIndex: 0,
    projectedDecorations: new Map(),
    queuedNavigationDelta: 0,
    query: "",
    requestToken: 0,
  };
}

function publicSearchState(state: SearchPluginState): MarkweaveSearchState {
  return {
    activeMatchIndex: state.activeMatchIndex,
    error: state.error,
    execution: state.execution,
    matchCount: state.matchCount,
    options: state.options,
    query: state.query,
  };
}

function searchStatesEqual(left: MarkweaveSearchState, right: MarkweaveSearchState) {
  return (
    left.activeMatchIndex === right.activeMatchIndex &&
    left.error === right.error &&
    left.execution?.progress === right.execution?.progress &&
    left.execution?.revision === right.execution?.revision &&
    left.execution?.status === right.execution?.status &&
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
      init: (_config, state) => createInitialSearchState(state.doc),
      apply(transaction, current) {
        const action = transaction.getMeta(searchPluginKey) as SearchAction | undefined;
        const documentLoadMeta = getMarkweaveDocumentLoadMeta(transaction);

        if (documentLoadMeta?.phase === "mounting") {
          return mapSearchStateDuringDocumentLoad(transaction, current);
        }
        if (documentLoadMeta?.phase === "complete") {
          return rebuildSearchStateAfterDocumentLoad(transaction, current);
        }

        if (action?.type === "clear") {
          return clearSearchState(current);
        }
        if (action?.type === "set-query") {
          return createSearchState(
            { ...current, queuedNavigationDelta: 0 },
            transaction.doc,
            action.query,
            { ...current.options, ...action.options },
            0,
          );
        }
        if (action?.type === "set-options") {
          return createSearchState(
            { ...current, queuedNavigationDelta: 0 },
            transaction.doc,
            current.query,
            { ...current.options, ...action.options },
            current.activeMatchIndex,
          );
        }
        if (action?.type === "next" || action?.type === "previous") {
          return navigateSearchState(transaction.doc, current, action.type);
        }
        if (action?.type === "queue-navigation") {
          return current.execution?.status === "searching"
            ? {
                ...current,
                queuedNavigationDelta: current.queuedNavigationDelta + action.delta,
              }
            : current;
        }
        if (action?.type === "async-progress") {
          if (!isCurrentAsyncAction(current, action)) {
            return current;
          }
          return {
            ...current,
            execution: {
              progress: Math.max(current.execution?.progress ?? 0, action.progress),
              revision: current.docRevision,
              status: "searching",
            },
          };
        }
        if (action?.type === "async-result") {
          if (!isCurrentAsyncAction(current, action)) {
            return current;
          }
          return createReadyState(
            current,
            transaction.doc,
            action.matches,
            applyNavigationDelta(
              current.pendingActiveMatchIndex,
              current.queuedNavigationDelta,
              action.matches.length,
            ),
          );
        }
        if (action?.type === "async-error") {
          if (!isCurrentAsyncAction(current, action)) {
            return current;
          }
          return createErrorState(current, action.error);
        }
        if (transaction.docChanged) {
          return updateSearchStateForDocumentChange(transaction, current);
        }
        return current;
      },
    },
    props: {
      decorations(state) {
        return searchPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
    view(view) {
      let previous = publicSearchState(getSearchPluginState(view.state));
      ensureSearchExecution(view, getSearchPluginState(view.state));

      return {
        update(nextView) {
          const pluginState = getSearchPluginState(nextView.state);
          const next = publicSearchState(pluginState);

          ensureSearchExecution(nextView, pluginState);
          if (next.activeMatchIndex < 0 || next.matchCount === 0) {
            cancelPendingReveal(nextView);
          }
          if (!searchStatesEqual(previous, next)) {
            previous = next;
            notifySearchListeners(nextView, next);
          }
        },
        destroy() {
          const runtime = searchRuntimes.get(view);
          if (runtime) {
            runtime.destroyed = true;
            runtime.abortController?.abort();
            runtime.revealAbortController?.abort();
          }
          searchRuntimes.delete(view);
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
      cancelPendingSearch(editor.view);
      dispatchSearchAction(editor, { type: "clear" });
    },
    findNext: () => navigateSearch(editor, "next"),
    findPrevious: () => navigateSearch(editor, "previous"),
    getState: () => publicSearchState(getSearchPluginState(editor.state)),
    replaceAll: (replacement) => replaceAllMatches(editor, replacement),
    replaceCurrent: (replacement) => replaceCurrentMatch(editor, replacement),
    setOptions: (options) => {
      cancelPendingSearch(editor.view);
      dispatchSearchAction(editor, { options, type: "set-options" });
      revealActiveMatch(editor.view);
    },
    setQuery: (query, options) => {
      cancelPendingSearch(editor.view);
      dispatchSearchAction(editor, { options, query, type: "set-query" });
      revealActiveMatch(editor.view);
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
  const state = getSearchPluginState(editor.state);
  if (state.execution?.status === "searching") {
    dispatchSearchAction(editor, {
      delta: type === "next" ? 1 : -1,
      type: "queue-navigation",
    });
    return true;
  }
  if (state.execution?.status !== "ready" || state.matches.length === 0) {
    return false;
  }

  dispatchSearchAction(editor, { type });
  revealActiveMatch(editor.view);
  return true;
}

function revealActiveMatch(view: EditorView) {
  const runtime = getSearchRuntime(view);
  runtime.revealAbortController?.abort();
  runtime.revealAbortController = null;
  const searchState = getSearchPluginState(view.state);
  const match = searchState.matches[searchState.activeMatchIndex];
  if (!match) {
    return false;
  }

  const viewport = getMarkweaveDocumentViewportCoordinatorForElement(view.dom);
  if (viewport) {
    const revealAbortController = new AbortController();
    runtime.revealAbortController = revealAbortController;
    void viewport.revealPosition(match.from, {
      align: "center",
      behavior: "auto",
      reason: "search",
      signal: revealAbortController.signal,
    }).finally(() => {
      if (runtime.revealAbortController === revealAbortController) {
        runtime.revealAbortController = null;
      }
    });
    return true;
  }

  view.dom
    .querySelector<HTMLElement>(".markweave-search-match--active")
    ?.scrollIntoView?.({ block: "center", inline: "nearest" });
  return true;
}

function replaceCurrentMatch(editor: Editor, replacement: string) {
  if (!editor.isEditable) {
    return false;
  }

  const searchState = getSearchPluginState(editor.state);
  if (!hasCurrentSearchResults(searchState)) {
    return false;
  }
  const match = searchState.matches[searchState.activeMatchIndex];
  if (!match) {
    return false;
  }

  const transaction = closeHistory(editor.state.tr).insertText(
    expandReplacement(replacement, match),
    match.from,
    match.to,
  );
  editor.view.dispatch(transaction);
  revealActiveMatch(editor.view);
  return true;
}

function replaceAllMatches(editor: Editor, replacement: string) {
  if (!editor.isEditable) {
    return 0;
  }

  const searchState = getSearchPluginState(editor.state);
  if (!hasCurrentSearchResults(searchState) || searchState.matches.length === 0) {
    return 0;
  }

  const matches = searchState.matches;
  const transaction = matches
    .slice()
    .reverse()
    .reduce<Transaction>(
      (current, match) =>
        current.insertText(expandReplacement(replacement, match), match.from, match.to),
      closeHistory(editor.state.tr),
    );
  editor.view.dispatch(transaction);
  revealActiveMatch(editor.view);
  return matches.length;
}

function hasCurrentSearchResults(state: SearchPluginState) {
  return (
    state.execution?.status === "ready" &&
    state.matchesRevision === state.docRevision &&
    state.execution.revision === state.docRevision
  );
}

function clearSearchState(current: SearchPluginState): SearchPluginState {
  return {
    ...current,
    activeMatchIndex: -1,
    decorations: DecorationSet.empty,
    error: null,
    execution: {
      progress: null,
      revision: current.docRevision,
      status: "idle",
    },
    matchCount: 0,
    matches: [],
    matchesRevision: -1,
    options: defaultSearchOptions,
    pendingActiveMatchIndex: 0,
    projectedDecorations: new Map(),
    queuedNavigationDelta: 0,
    query: "",
    requestToken: current.requestToken + 1,
  };
}

function createSearchState(
  current: SearchPluginState,
  doc: ProseMirrorNode,
  query: string,
  options: MarkweaveSearchOptions,
  preferredActiveIndex: number,
): SearchPluginState {
  const requestToken = current.requestToken + 1;
  if (!query) {
    return {
      ...clearSearchState(current),
      options,
      requestToken,
    };
  }

  const matcher = createMatcher(query, options);
  if (typeof matcher === "string") {
    return createErrorState(
      {
        ...current,
        options,
        pendingActiveMatchIndex: preferredActiveIndex,
        query,
        requestToken,
      },
      matcher,
    );
  }

  if (current.loadMounting) {
    return {
      ...current,
      activeMatchIndex: -1,
      decorations: DecorationSet.empty,
      error: null,
      execution: {
        progress: 0,
        revision: current.docRevision,
        status: "searching",
      },
      matchCount: 0,
      matches: [],
      matchesRevision: -1,
      options,
      pendingActiveMatchIndex: preferredActiveIndex,
      projectedDecorations: new Map(),
      query,
      requestToken,
    };
  }

  if (shouldSearchAsynchronously(current.index, query, options)) {
    return {
      ...current,
      activeMatchIndex: -1,
      decorations: DecorationSet.empty,
      error: null,
      execution: {
        progress: 0,
        revision: current.docRevision,
        status: "searching",
      },
      matchCount: 0,
      matches: [],
      matchesRevision: -1,
      options,
      pendingActiveMatchIndex: preferredActiveIndex,
      projectedDecorations: new Map(),
      query,
      requestToken,
    };
  }

  const matches = findMatchesInSegments(current.index.segments, matcher, options);
  const activeMatchIndex = applyNavigationDelta(
    preferredActiveIndex,
    current.queuedNavigationDelta,
    matches.length,
  );
  return createReadyState(
    {
      ...current,
      options,
      pendingActiveMatchIndex: preferredActiveIndex,
      query,
      requestToken,
    },
    doc,
    matches,
    activeMatchIndex,
  );
}

function createReadyState(
  current: SearchPluginState,
  doc: ProseMirrorNode | null,
  matches: readonly SearchMatch[],
  preferredActiveIndex: number,
): SearchPluginState {
  const activeMatchIndex = matches.length
    ? Math.min(Math.max(preferredActiveIndex, 0), matches.length - 1)
    : -1;
  const projection = createDecorationProjection(doc, matches, activeMatchIndex);

  return {
    ...current,
    activeMatchIndex,
    decorations: projection.decorations,
    error: null,
    execution: {
      progress: 1,
      revision: current.docRevision,
      status: "ready",
    },
    matchCount: matches.length,
    matches,
    matchesRevision: current.docRevision,
    pendingActiveMatchIndex: activeMatchIndex,
    projectedDecorations: projection.projectedDecorations,
    queuedNavigationDelta: 0,
  };
}

function createErrorState(current: SearchPluginState, error: string): SearchPluginState {
  return {
    ...current,
    activeMatchIndex: -1,
    decorations: DecorationSet.empty,
    error,
    execution: {
      progress: null,
      revision: current.docRevision,
      status: "error",
    },
    matchCount: 0,
    matches: [],
    matchesRevision: -1,
    projectedDecorations: new Map(),
    queuedNavigationDelta: 0,
  };
}

function isCurrentAsyncAction(
  current: SearchPluginState,
  action: { readonly revision: number; readonly token: number },
) {
  return (
    current.execution?.status === "searching" &&
    action.revision === current.docRevision &&
    action.token === current.requestToken
  );
}

function updateSearchStateForDocumentChange(
  transaction: Transaction,
  current: SearchPluginState,
): SearchPluginState {
  const docRevision = current.docRevision + 1;
  const update = updateTextIndex(current.index, transaction);
  const requestToken = current.requestToken + 1;

  if (!current.query) {
    return {
      ...current,
      docRevision,
      execution: {
        progress: null,
        revision: docRevision,
        status: "idle",
      },
      index: update.index,
      requestToken,
    };
  }

  const matcher = createMatcher(current.query, current.options);
  if (typeof matcher === "string") {
    return createErrorState(
      {
        ...current,
        docRevision,
        index: update.index,
        requestToken,
      },
      matcher,
    );
  }

  if (shouldSearchAsynchronously(update.index, current.query, current.options)) {
    const mappedMatches = mapUnchangedMatches(current.matches, transaction, update.changedRanges);
    return {
      ...current,
      activeMatchIndex: mappedMatches.length
        ? Math.min(Math.max(current.activeMatchIndex, 0), mappedMatches.length - 1)
        : -1,
      decorations: current.decorations.map(transaction.mapping, transaction.doc),
      docRevision,
      error: null,
      execution: {
        progress: 0,
        revision: docRevision,
        status: "searching",
      },
      index: update.index,
      matchCount: mappedMatches.length,
      matches: mappedMatches,
      matchesRevision: current.matchesRevision,
      pendingActiveMatchIndex:
        current.activeMatchIndex >= 0
          ? current.activeMatchIndex
          : current.pendingActiveMatchIndex,
      projectedDecorations: new Map(),
      requestToken,
    };
  }

  const mappedMatches = mapUnchangedMatches(current.matches, transaction, update.changedRanges);
  const changedSegments = update.index.segments.filter((segment) =>
    intersectsAnyRange(segment.from, segment.to, update.changedRanges),
  );
  const changedMatches = findMatchesInSegments(changedSegments, matcher, current.options);
  const matches = [...mappedMatches, ...changedMatches].sort(compareMatches);

  return createReadyState(
    {
      ...current,
      docRevision,
      index: update.index,
      requestToken,
    },
    transaction.doc,
    matches,
    applyNavigationDelta(
      current.activeMatchIndex >= 0
        ? current.activeMatchIndex
        : current.pendingActiveMatchIndex,
      current.queuedNavigationDelta,
      matches.length,
    ),
  );
}

function navigateSearchState(
  doc: ProseMirrorNode,
  current: SearchPluginState,
  type: "next" | "previous",
): SearchPluginState {
  if (current.execution?.status !== "ready" || current.matches.length === 0) {
    return current;
  }

  const delta = type === "next" ? 1 : -1;
  const activeMatchIndex =
    (current.activeMatchIndex + delta + current.matches.length) % current.matches.length;
  if (activeMatchIndex === current.activeMatchIndex) {
    return current;
  }

  const projection = updateActiveDecoration(doc, current, activeMatchIndex);
  return {
    ...current,
    activeMatchIndex,
    decorations: projection.decorations,
    pendingActiveMatchIndex: activeMatchIndex,
    projectedDecorations: projection.projectedDecorations,
  };
}

function createDecorationProjection(
  doc: ProseMirrorNode | null,
  matches: readonly SearchMatch[],
  activeMatchIndex: number,
) {
  if (!doc || matches.length === 0 || activeMatchIndex < 0) {
    return {
      decorations: DecorationSet.empty,
      projectedDecorations: new Map<number, Decoration>(),
    };
  }

  const projectedDecorations = new Map<number, Decoration>();
  const start = Math.max(
    0,
    Math.min(
      activeMatchIndex - Math.floor(maxProjectedDecorations / 2),
      matches.length - maxProjectedDecorations,
    ),
  );
  const end = Math.min(matches.length, start + maxProjectedDecorations);

  for (let index = start; index < end; index += 1) {
    projectedDecorations.set(
      index,
      createMatchDecoration(matches[index], index === activeMatchIndex),
    );
  }

  return {
    decorations: DecorationSet.create(doc, [...projectedDecorations.values()]),
    projectedDecorations,
  };
}

function updateActiveDecoration(
  doc: ProseMirrorNode,
  current: SearchPluginState,
  activeMatchIndex: number,
) {
  const previousIndex = current.activeMatchIndex;
  const previousDecoration = current.projectedDecorations.get(previousIndex);
  const nextDecoration = current.projectedDecorations.get(activeMatchIndex);

  if (!previousDecoration || current.projectedDecorations.size === 0) {
    return createDecorationProjection(doc, current.matches, activeMatchIndex);
  }

  const projectedDecorations = new Map(current.projectedDecorations);
  const remove = [previousDecoration];
  const add: Decoration[] = [];
  projectedDecorations.delete(previousIndex);

  if (nextDecoration) {
    remove.push(nextDecoration);
    const inactivePrevious = createMatchDecoration(current.matches[previousIndex], false);
    add.push(inactivePrevious);
    projectedDecorations.set(previousIndex, inactivePrevious);
  }

  const activeNext = createMatchDecoration(current.matches[activeMatchIndex], true);
  add.push(activeNext);
  projectedDecorations.set(activeMatchIndex, activeNext);

  return {
    decorations: current.decorations.remove(remove).add(doc, add),
    projectedDecorations,
  };
}

function createMatchDecoration(match: SearchMatch, active: boolean) {
  return Decoration.inline(match.from, match.to, {
    class: active
      ? "markweave-search-match markweave-search-match--active"
      : "markweave-search-match",
    "data-markweave-search-match": active ? "active" : "match",
  });
}

function createTextIndex(doc: ProseMirrorNode): TextIndex {
  return createTextIndexFromSegments(collectTextSegments(doc));
}

function createTextIndexFromSegments(segments: readonly TextSegment[]): TextIndex {
  return {
    segments,
    totalTextLength: segments.reduce((total, segment) => total + segment.text.length, 0),
  };
}

function collectTextSegments(doc: ProseMirrorNode, ranges?: readonly ChangedRange[]) {
  const segments: TextSegment[] = [];
  const sortedRanges = ranges?.slice().sort((left, right) => left.from - right.from);
  const lastRangeTo = sortedRanges?.at(-1)?.to ?? Number.POSITIVE_INFINITY;
  let offset = 0;
  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index);
    const nodeTo = offset + node.nodeSize;
    if (offset > lastRangeTo) {
      break;
    }
    if (!sortedRanges || intersectsAnyRange(offset, nodeTo, sortedRanges)) {
      collectTextSegmentsFromNode(node, offset, segments);
    }
    offset = nodeTo;
  }

  return segments;
}

function collectTextSegmentsFromNode(
  node: ProseMirrorNode,
  nodePosition: number,
  segments: TextSegment[],
) {
  if (node.isTextblock) {
    collectTextSegmentsFromTextblock(node, nodePosition, segments);
    return;
  }

  node.descendants((descendant, relativePosition) => {
    if (!descendant.isTextblock) {
      return true;
    }

    collectTextSegmentsFromTextblock(
      descendant,
      nodePosition + 1 + relativePosition,
      segments,
    );
    return false;
  });
}

function collectTextSegmentsFromTextblock(
  node: ProseMirrorNode,
  nodePosition: number,
  segments: TextSegment[],
) {
  let from = -1;
  let text = "";

  const flush = () => {
    if (text && from >= 0) {
      segments.push(createTextSegment(from, text));
    }
    from = -1;
    text = "";
  };

  node.forEach((child, offset) => {
    if (!child.isText || !child.text) {
      flush();
      return;
    }

    const absolutePosition = nodePosition + 1 + offset;
    if (from >= 0 && from + text.length !== absolutePosition) {
      flush();
    }
    if (from < 0) {
      from = absolutePosition;
    }
    text += child.text;
  });

  flush();
}

function createTextSegment(from: number, text: string): TextSegment {
  return {
    from,
    text,
    to: from + text.length,
    wordBoundaries: createWordBoundaryTable(text),
  };
}

function createWordBoundaryTable(text: string) {
  if (!wordSegmenter) {
    return null;
  }

  const boundaries = new Uint8Array(text.length + 1);
  for (const segment of wordSegmenter.segment(text)) {
    if (segment.isWordLike !== true) {
      continue;
    }
    boundaries[segment.index] |= 1;
    boundaries[segment.index + segment.segment.length] |= 2;
  }
  return boundaries;
}

function updateTextIndex(current: TextIndex, transaction: Transaction) {
  const changedRanges = getChangedTopLevelRanges(transaction);
  if (changedRanges.length === 0) {
    return {
      changedRanges: [{ from: 0, to: transaction.doc.content.size }],
      index: createTextIndex(transaction.doc),
    };
  }

  const unchangedSegments = current.segments.flatMap((segment) => {
    const from = transaction.mapping.map(segment.from, 1);
    const to = transaction.mapping.map(segment.to, -1);
    if (from >= to || intersectsAnyRange(from, to, changedRanges)) {
      return [];
    }
    return [{ ...segment, from, to }];
  });
  const changedSegments = collectTextSegments(transaction.doc, changedRanges);
  const segments = mergeSortedTextSegments(unchangedSegments, changedSegments);

  return {
    changedRanges,
    index: createTextIndexFromSegments(segments),
  };
}

function getChangedTopLevelRanges(transaction: Transaction): readonly ChangedRange[] {
  const rawRanges: ChangedRange[] = [];

  transaction.mapping.maps.forEach((stepMap, mapIndex) => {
    stepMap.forEach((_oldFrom, _oldTo, newFrom, newTo) => {
      const remainingMapping = transaction.mapping.slice(mapIndex + 1);
      rawRanges.push({
        from: remainingMapping.map(newFrom, -1),
        to: remainingMapping.map(newTo, 1),
      });
    });
  });

  if (rawRanges.length === 0) {
    return [];
  }
  return mergeRanges(
    rawRanges.map((range) => expandRangeToTopLevel(transaction.doc, range)),
  );
}

function expandRangeToTopLevel(doc: ProseMirrorNode, range: ChangedRange): ChangedRange {
  if (doc.childCount === 0) {
    return { from: 0, to: 0 };
  }

  const from = Math.max(0, Math.min(range.from, doc.content.size));
  const to = Math.max(from, Math.min(range.to, doc.content.size));
  let expandedFrom = Number.POSITIVE_INFINITY;
  let expandedTo = Number.NEGATIVE_INFINITY;

  let offset = 0;
  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index);
    const nodeTo = offset + node.nodeSize;
    if (offset > to) {
      break;
    }
    if (nodeTo < from || offset > to) {
      offset = nodeTo;
      continue;
    }
    expandedFrom = Math.min(expandedFrom, offset);
    expandedTo = Math.max(expandedTo, nodeTo);
    offset = nodeTo;
  }

  if (!Number.isFinite(expandedFrom) || !Number.isFinite(expandedTo)) {
    return { from, to };
  }
  return { from: expandedFrom, to: expandedTo };
}

function mergeSortedTextSegments(
  left: readonly TextSegment[],
  right: readonly TextSegment[],
) {
  const merged: TextSegment[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    const leftSegment = left[leftIndex];
    const rightSegment = right[rightIndex];
    if (
      rightSegment === undefined ||
      (leftSegment !== undefined &&
        (leftSegment.from < rightSegment.from ||
          (leftSegment.from === rightSegment.from && leftSegment.to <= rightSegment.to)))
    ) {
      merged.push(leftSegment!);
      leftIndex += 1;
    } else {
      merged.push(rightSegment);
      rightIndex += 1;
    }
  }
  return merged;
}

function mergeRanges(ranges: readonly ChangedRange[]) {
  const sorted = ranges
    .slice()
    .sort((left, right) => left.from - right.from || left.to - right.to);
  const merged: ChangedRange[] = [];

  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || range.from > previous.to) {
      merged.push(range);
      continue;
    }
    merged[merged.length - 1] = {
      from: previous.from,
      to: Math.max(previous.to, range.to),
    };
  }

  return merged;
}

function mapUnchangedMatches(
  matches: readonly SearchMatch[],
  transaction: Transaction,
  changedRanges: readonly ChangedRange[],
) {
  return matches.flatMap((match) => {
    const from = transaction.mapping.map(match.from, 1);
    const to = transaction.mapping.map(match.to, -1);
    if (from >= to || intersectsAnyRange(from, to, changedRanges)) {
      return [];
    }
    return [{ ...match, from, to }];
  });
}

function mapAllMatches(matches: readonly SearchMatch[], transaction: Transaction) {
  return matches.flatMap((match) => {
    const from = transaction.mapping.map(match.from, 1);
    const to = transaction.mapping.map(match.to, -1);
    return from < to ? [{ ...match, from, to }] : [];
  });
}

function intersectsAnyRange(
  from: number,
  to: number,
  ranges: readonly ChangedRange[],
) {
  return ranges.some((range) => range.from < to && range.to > from);
}

function createMatcher(query: string, options: MarkweaveSearchOptions): RegExp | string {
  try {
    return new RegExp(
      options.regex ? query : escapeRegExp(query),
      `gu${options.caseSensitive ? "" : "i"}`,
    );
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid regular expression";
  }
}

function findMatchesInSegments(
  segments: readonly TextSegment[],
  matcher: RegExp,
  options: MarkweaveSearchOptions,
) {
  const matches: SearchMatch[] = [];

  for (const segment of segments) {
    matcher.lastIndex = 0;
    let result: RegExpExecArray | null;

    while ((result = matcher.exec(segment.text)) !== null) {
      appendMatch(matches, segment, result, options);
      if (result[0].length === 0) {
        matcher.lastIndex = advanceStringIndex(segment.text, matcher.lastIndex);
      }
    }
  }

  return matches;
}

function appendMatch(
  matches: SearchMatch[],
  segment: TextSegment,
  result: RegExpExecArray,
  options: MarkweaveSearchOptions,
) {
  if (result[0].length === 0) {
    return;
  }

  const start = result.index;
  const end = start + result[0].length;
  if (options.wholeWord && !isWholeWordMatch(segment, start, end)) {
    return;
  }

  const from = segment.from + start;
  const to = segment.from + end;
  if (from >= to) {
    return;
  }

  matches.push({
    captures: result.length > 1 ? result.slice(1) : emptyCaptures,
    from,
    groups: result.groups ?? null,
    input: segment.text,
    inputIndex: start,
    text: result[0],
    to,
  });
}

function compareMatches(left: SearchMatch, right: SearchMatch) {
  return left.from - right.from || left.to - right.to;
}

function isWholeWordMatch(segment: TextSegment, start: number, end: number) {
  if (segment.wordBoundaries) {
    return (
      (segment.wordBoundaries[start] & 1) !== 0 &&
      (segment.wordBoundaries[end] & 2) !== 0
    );
  }

  return (
    !isWordCharacter(characterBefore(segment.text, start)) &&
    !isWordCharacter(characterAfter(segment.text, end))
  );
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

function applyNavigationDelta(index: number, delta: number, matchCount: number) {
  if (matchCount === 0) {
    return -1;
  }
  const normalizedIndex = Math.min(Math.max(index, 0), matchCount - 1);
  return ((normalizedIndex + delta) % matchCount + matchCount) % matchCount;
}

function shouldSearchAsynchronously(
  index: TextIndex,
  query: string,
  options: MarkweaveSearchOptions,
) {
  return (
    index.totalTextLength >= asyncSearchTextThreshold ||
    (options.regex && !isRegexSafeForCooperativeSearch(query))
  );
}

function mapSearchStateDuringDocumentLoad(
  transaction: Transaction,
  current: SearchPluginState,
): SearchPluginState {
  const docRevision = current.docRevision + (transaction.docChanged ? 1 : 0);
  const matches = transaction.docChanged
    ? mapAllMatches(current.matches, transaction)
    : current.matches;

  return {
    ...current,
    activeMatchIndex: matches.length
      ? Math.min(Math.max(current.activeMatchIndex, 0), matches.length - 1)
      : -1,
    decorations: transaction.docChanged
      ? current.decorations.map(transaction.mapping, transaction.doc)
      : current.decorations,
    docRevision,
    execution: {
      progress: current.query ? 0 : null,
      revision: docRevision,
      status: current.query ? "searching" : "idle",
    },
    loadMounting: true,
    matchCount: matches.length,
    matches,
    matchesRevision: current.matchesRevision,
    projectedDecorations: new Map(),
    requestToken: current.requestToken + 1,
  };
}

function rebuildSearchStateAfterDocumentLoad(
  transaction: Transaction,
  current: SearchPluginState,
): SearchPluginState {
  const docRevision = current.docRevision + (transaction.docChanged ? 1 : 0);
  const rebuilt: SearchPluginState = {
    ...current,
    decorations: DecorationSet.empty,
    docRevision,
    index: createTextIndex(transaction.doc),
    loadMounting: false,
    matchCount: 0,
    matches: [],
    matchesRevision: -1,
    projectedDecorations: new Map(),
    requestToken: current.requestToken + 1,
  };

  if (!current.query) {
    return {
      ...rebuilt,
      activeMatchIndex: -1,
      error: null,
      execution: {
        progress: null,
        revision: docRevision,
        status: "idle",
      },
    };
  }

  return createSearchState(
    rebuilt,
    transaction.doc,
    current.query,
    current.options,
    current.pendingActiveMatchIndex,
  );
}

function getSearchRuntime(view: EditorView) {
  const current = searchRuntimes.get(view);
  if (current) {
    return current;
  }

  const runtime: SearchRuntime = {
    abortController: null,
    destroyed: false,
    revealAbortController: null,
    requestToken: -1,
  };
  searchRuntimes.set(view, runtime);
  return runtime;
}

function cancelPendingSearch(view: EditorView) {
  const runtime = getSearchRuntime(view);
  runtime.abortController?.abort();
  runtime.abortController = null;
  runtime.requestToken = -1;
  cancelPendingReveal(view);
}

function cancelPendingReveal(view: EditorView) {
  const runtime = getSearchRuntime(view);
  runtime.revealAbortController?.abort();
  runtime.revealAbortController = null;
}

function ensureSearchExecution(view: EditorView, state: SearchPluginState) {
  const runtime = getSearchRuntime(view);
  if (state.loadMounting || state.execution?.status !== "searching" || !state.query) {
    runtime.abortController?.abort();
    runtime.abortController = null;
    runtime.requestToken = state.requestToken;
    return;
  }

  if (runtime.requestToken === state.requestToken && runtime.abortController) {
    return;
  }

  runtime.abortController?.abort();
  const abortController = new AbortController();
  runtime.abortController = abortController;
  runtime.requestToken = state.requestToken;
  const requestToken = state.requestToken;
  const revision = state.docRevision;
  let lastProgress = 0;

  void automaticSearchExecutor.execute(
    state.index.segments,
    state.query,
    state.options,
    abortController.signal,
    (progress) => {
      if (progress < 1 && progress - lastProgress < 0.02) {
        return;
      }
      lastProgress = progress;
      dispatchAsyncSearchAction(view, {
        progress,
        revision,
        token: requestToken,
        type: "async-progress",
      });
    },
  )
    .then((matches) => {
      if (abortController.signal.aborted || runtime.destroyed) {
        return;
      }
      dispatchAsyncSearchAction(view, {
        matches,
        revision,
        token: requestToken,
        type: "async-result",
      });
      revealActiveMatch(view);
    })
    .catch((error: unknown) => {
      if (abortController.signal.aborted || runtime.destroyed || isSearchCancellation(error)) {
        return;
      }
      dispatchAsyncSearchAction(view, {
        error: error instanceof Error ? error.message : "Search failed",
        revision,
        token: requestToken,
        type: "async-error",
      });
    });
}

function dispatchAsyncSearchAction(view: EditorView, action: SearchAction) {
  if (!searchPluginKey.getState(view.state)) {
    return;
  }
  view.dispatch(view.state.tr.setMeta(searchPluginKey, action));
}

async function findMatchesCooperatively(
  segments: readonly TextSegment[],
  query: string,
  options: MarkweaveSearchOptions,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
) {
  const matcher = createMatcher(query, options);
  if (typeof matcher === "string") {
    throw new Error(matcher);
  }

  const matches: SearchMatch[] = [];
  const startedAt = currentTime();
  let sliceStartedAt = startedAt;

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    throwIfSearchCancelled(signal);
    const segment = segments[segmentIndex];
    matcher.lastIndex = 0;
    let result: RegExpExecArray | null;

    while (true) {
      throwIfSearchCancelled(signal);
      if (options.regex && currentTime() - startedAt >= regexTimeoutMs) {
        throw new Error(`Search timed out after ${regexTimeoutMs}ms`);
      }
      result = matcher.exec(segment.text);
      if (options.regex && currentTime() - startedAt >= regexTimeoutMs) {
        throw new Error(`Search timed out after ${regexTimeoutMs}ms`);
      }
      if (result === null) {
        break;
      }
      appendMatch(matches, segment, result, options);
      if (result[0].length === 0) {
        matcher.lastIndex = advanceStringIndex(segment.text, matcher.lastIndex);
      }

      if (currentTime() - sliceStartedAt >= searchSliceMs) {
        const segmentProgress = segment.text.length
          ? Math.min(matcher.lastIndex / segment.text.length, 1)
          : 1;
        onProgress((segmentIndex + segmentProgress) / Math.max(segments.length, 1));
        await yieldSearchTask(signal);
        sliceStartedAt = currentTime();
      }
    }

    if (currentTime() - sliceStartedAt >= searchSliceMs) {
      onProgress((segmentIndex + 1) / Math.max(segments.length, 1));
      await yieldSearchTask(signal);
      sliceStartedAt = currentTime();
    }
  }

  onProgress(1);
  return matches;
}

class SearchCancellationError extends Error {
  constructor() {
    super("Search cancelled");
    this.name = "SearchCancellationError";
  }
}

function throwIfSearchCancelled(signal: AbortSignal) {
  if (signal.aborted) {
    throw new SearchCancellationError();
  }
}

function isSearchCancellation(error: unknown) {
  return error instanceof SearchCancellationError;
}

function yieldSearchTask(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new SearchCancellationError());
      return;
    }

    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new SearchCancellationError());
    };
    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, 0);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function currentTime() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
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
