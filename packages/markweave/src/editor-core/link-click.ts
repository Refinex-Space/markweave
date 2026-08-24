import { Extension, getMarkRange, type Editor } from "@tiptap/core";
import type { MarkType } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import {
  getMarkweaveEditorModeState,
  isMarkweaveEditorLiveEditable,
  subscribeToMarkweaveEditorMode,
} from "../core/editor-mode-state";
import { normalizeMarkdownLinkHref } from "../plugins/markdown/markdown-input";
import { openMarkweaveReadonlyLinkFromEvent } from "./readonly-link";

interface ActiveInlineLinkSource {
  readonly from: number;
  readonly to: number;
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly draftHref: string;
}

type InlineLinkSourceMeta =
  | { readonly type: "activate"; readonly pos: number }
  | { readonly type: "draft"; readonly href: string }
  | { readonly type: "close" };

export interface MarkweaveLinkClickOptions {
  readonly revealMarkdown: boolean;
  readonly addressLabel: string;
  readonly invalidAddress: string;
}

export const markweaveInlineLinkSourcePluginKey = new PluginKey<ActiveInlineLinkSource | null>(
  "markweaveInlineLinkSource",
);

type LinkOpenEventSource = "dom" | "semantic";

interface RecentLinkOpenGesture {
  readonly source: LinkOpenEventSource;
  readonly href: string;
  readonly timeStamp: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

// ProseMirror can report one physical activation first through handleClick's
// mouseup path and then through the browser click event. Pair those layers so
// the safe opener runs once without suppressing a later independent click.
const recentLinkOpenGestures = new WeakMap<Editor, RecentLinkOpenGesture>();
const linkOpenGesturePairWindowMs = 50;

const percentEncodedUtf8CharacterPattern = /(?:%f[0-4](?:%[89ab][0-9a-f]){3}|%e[0-9a-f](?:%[89ab][0-9a-f]){2}|%(?:c[2-9a-f]|d[0-9a-f])%[89ab][0-9a-f])/gi;

/**
 * Decodes only non-ASCII UTF-8 characters for the human-editable source
 * projection. ASCII escapes such as `%20`, `%2F`, and `%23` stay intact so
 * displaying and recommitting a URL cannot silently change its semantics.
 */
export function decodeMarkdownLinkHrefForEditing(href: string) {
  return href.replace(percentEncodedUtf8CharacterPattern, (encodedCharacter) => {
    try {
      return decodeURIComponent(encodedCharacter);
    } catch {
      return encodedCharacter;
    }
  });
}

function getOrdinaryLinkTarget(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return null;

  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  // External link cards and host-driven internal document cards own their own
  // navigation; never fall through to window.open for those.
  return anchor &&
    !anchor.closest('[data-markweave-link-card="true"]') &&
    !anchor.closest('[data-markweave-internal-link-card="true"]')
    ? anchor
    : null;
}

function linkMarkAtRange(state: EditorState, linkType: MarkType, from: number) {
  return state.doc.resolve(from).nodeAfter?.marks.find((mark) => mark.type === linkType) ?? null;
}

function activeLinkAtPosition(state: EditorState, linkType: MarkType, pos: number) {
  const boundedPos = Math.max(0, Math.min(pos, state.doc.content.size));
  const range = getMarkRange(state.doc.resolve(boundedPos), linkType);
  if (!range) return null;

  const mark = linkMarkAtRange(state, linkType, range.from);
  const href = typeof mark?.attrs.href === "string" ? mark.attrs.href : "";
  if (!mark || !href) return null;

  return {
    from: range.from,
    to: range.to,
    attrs: { ...mark.attrs },
    draftHref: decodeMarkdownLinkHrefForEditing(href),
  } satisfies ActiveInlineLinkSource;
}

function activeLinkAtSelection(state: EditorState, linkType: MarkType) {
  return activeLinkAtPosition(state, linkType, state.selection.head);
}

function sameLink(
  previous: ActiveInlineLinkSource,
  next: ActiveInlineLinkSource,
  mappedFrom: number,
  mappedTo: number,
) {
  return mappedFrom === next.from && mappedTo === next.to;
}

function markdownTitleSuffix(attrs: Readonly<Record<string, unknown>>) {
  const title = typeof attrs.title === "string" ? attrs.title : "";
  return title ? ` \"${title.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}\"` : "";
}

function getEditableHref(element: HTMLElement) {
  return element.textContent ?? "";
}

function setEditableHrefValidity(element: HTMLElement, invalidAddress: string) {
  const valid = normalizeMarkdownLinkHref(getEditableHref(element)) !== null;
  element.setAttribute("aria-invalid", valid ? "false" : "true");
  element.title = valid ? "" : invalidAddress;
  element.closest<HTMLElement>(".markweave-inline-link-source")?.setAttribute(
    "data-invalid",
    valid ? "false" : "true",
  );
}

function insertPlainTextAtSelection(element: HTMLElement, text: string) {
  const selection = element.ownerDocument.defaultView?.getSelection();
  if (!selection || selection.rangeCount === 0 || !element.contains(selection.anchorNode)) {
    element.append(text);
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = element.ownerDocument.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function dispatchMeta(view: EditorView, meta: InlineLinkSourceMeta) {
  view.dispatch(
    view.state.tr
      .setMeta(markweaveInlineLinkSourcePluginKey, meta)
      .setMeta("addToHistory", false),
  );
}

function commitInlineLinkSource(view: EditorView, refocus: boolean) {
  const active = markweaveInlineLinkSourcePluginKey.getState(view.state);
  const linkType = view.state.schema.marks.link;
  if (!active || !linkType) return false;

  const href = normalizeMarkdownLinkHref(active.draftHref);
  if (!href) {
    dispatchMeta(view, { type: "close" });
    if (refocus) view.focus();
    return false;
  }

  const storedHref = typeof active.attrs.href === "string" ? active.attrs.href : "";
  if (href === decodeMarkdownLinkHrefForEditing(storedHref)) {
    dispatchMeta(view, { type: "close" });
  } else {
    const attrs = { ...active.attrs, href };
    view.dispatch(
      view.state.tr
        .removeMark(active.from, active.to, linkType)
        .addMark(active.from, active.to, linkType.create(attrs))
        .setMeta(markweaveInlineLinkSourcePluginKey, { type: "close" } satisfies InlineLinkSourceMeta),
    );
  }

  if (refocus) view.focus();
  return true;
}

function createSourceDecorations(
  view: EditorView,
  active: ActiveInlineLinkSource,
  options: MarkweaveLinkClickOptions,
) {
  const prefix = Decoration.widget(
    active.from,
    () => {
      const element = document.createElement("span");
      element.className = "markweave-inline-link-source-markup";
      element.contentEditable = "false";
      element.setAttribute("aria-hidden", "true");
      element.textContent = "[";
      return element;
    },
    { key: "markweave-inline-link-source-prefix", side: -1 },
  );

  const suffix = Decoration.widget(
    active.to,
    () => {
      const container = document.createElement("span");
      container.className = "markweave-inline-link-source";
      container.contentEditable = "false";
      container.dataset.markweaveLinkSourceUi = "true";

      const opening = document.createElement("span");
      opening.className = "markweave-inline-link-source-markup";
      opening.setAttribute("aria-hidden", "true");
      opening.textContent = "](";

      const target = document.createElement("span");
      target.className = "markweave-inline-link-source-target";
      target.setAttribute("contenteditable", "plaintext-only");
      target.setAttribute("role", "textbox");
      target.setAttribute("aria-label", options.addressLabel);
      target.setAttribute("aria-multiline", "false");
      target.autocapitalize = "off";
      target.spellcheck = false;
      target.textContent = active.draftHref;
      setEditableHrefValidity(target, options.invalidAddress);

      let composing = false;
      const publishDraft = () => {
        dispatchMeta(view, { type: "draft", href: getEditableHref(target) });
        setEditableHrefValidity(target, options.invalidAddress);
      };
      target.addEventListener("compositionstart", () => {
        composing = true;
      });
      target.addEventListener("compositionend", () => {
        composing = false;
        publishDraft();
      });
      target.addEventListener("beforeinput", (event) => {
        if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
          event.preventDefault();
        }
      });
      target.addEventListener("input", () => {
        if (!composing) {
          publishDraft();
        }
      });
      target.addEventListener("paste", (event) => {
        event.preventDefault();
        insertPlainTextAtSelection(target, event.clipboardData?.getData("text/plain") ?? "");
        publishDraft();
      });
      target.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !composing) {
          event.preventDefault();
          event.stopPropagation();
          commitInlineLinkSource(view, true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          dispatchMeta(view, { type: "close" });
          view.focus();
        }
      });
      target.addEventListener("blur", () => {
        commitInlineLinkSource(view, false);
      });

      const title = document.createElement("span");
      title.className = "markweave-inline-link-source-markup";
      title.setAttribute("aria-hidden", "true");
      title.textContent = `${markdownTitleSuffix(active.attrs)})`;

      container.append(opening, target, title);
      return container;
    },
    {
      key: "markweave-inline-link-source-suffix",
      side: 1,
      stopEvent: (event) =>
        event.target instanceof Element &&
        Boolean(event.target.closest("[data-markweave-link-source-ui]")),
    },
  );

  return DecorationSet.create(view.state.doc, [prefix, suffix]);
}

/**
 * Keeps authoring clicks inside the editor while retaining the familiar
 * Ctrl/Cmd-click shortcut for opening an ordinary safe link.
 */
function handleMarkweaveEditorLinkClickFromSource(
  editor: Editor | null | undefined,
  event: MouseEvent,
  source: LinkOpenEventSource,
) {
  const link = getOrdinaryLinkTarget(event);
  if (!link) return false;

  const href = link.getAttribute("href") ?? "";
  const previousGesture = editor ? recentLinkOpenGestures.get(editor) : undefined;
  const pairedGesture =
    previousGesture &&
    previousGesture.source !== source &&
    previousGesture.href === href &&
    Math.abs(event.timeStamp - previousGesture.timeStamp) <= linkOpenGesturePairWindowMs &&
    previousGesture.clientX === event.clientX &&
    previousGesture.clientY === event.clientY &&
    previousGesture.ctrlKey === event.ctrlKey &&
    previousGesture.metaKey === event.metaKey;

  if (pairedGesture) {
    event.preventDefault();
    if (editor) recentLinkOpenGestures.delete(editor);
    return true;
  }

  let handled = false;
  if (!isMarkweaveEditorLiveEditable(getMarkweaveEditorModeState(editor))) {
    handled = openMarkweaveReadonlyLinkFromEvent(event);
  } else {
    event.preventDefault();
    handled = event.metaKey || event.ctrlKey
      ? openMarkweaveReadonlyLinkFromEvent(event)
      : false;
  }

  if (handled && editor) {
    recentLinkOpenGestures.set(editor, {
      source,
      href,
      timeStamp: event.timeStamp,
      clientX: event.clientX,
      clientY: event.clientY,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    });
  }

  return handled;
}

export function handleMarkweaveEditorLinkClick(
  editor: Editor | null | undefined,
  event: MouseEvent,
) {
  return handleMarkweaveEditorLinkClickFromSource(editor, event, "semantic");
}

export const MarkweaveLinkClick = Extension.create<MarkweaveLinkClickOptions>({
  name: "markweaveLinkClick",

  addOptions() {
    return {
      revealMarkdown: true,
      addressLabel: "Link address",
      invalidAddress: "Enter a safe, non-empty link address.",
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const options = this.options;
    const linkType = editor.schema.marks.link;

    return [
      new Plugin<ActiveInlineLinkSource | null>({
        key: markweaveInlineLinkSourcePluginKey,
        state: {
          init: () => null,
          apply: (transaction, previous, _oldState, nextState) => {
            const meta = transaction.getMeta(markweaveInlineLinkSourcePluginKey) as InlineLinkSourceMeta | undefined;
            if (meta?.type === "close") return null;
            if (!options.revealMarkdown || !linkType) return null;
            if (meta?.type === "activate") {
              return activeLinkAtPosition(nextState, linkType, meta.pos);
            }
            if (meta?.type === "draft") {
              return previous ? { ...previous, draftHref: meta.href } : null;
            }

            if (!transaction.selectionSet && !transaction.docChanged) return previous;

            const next = activeLinkAtSelection(nextState, linkType);
            if (!next) return null;
            if (!previous) return transaction.selectionSet ? next : null;

            const mappedFrom = transaction.mapping.map(previous.from, -1);
            const mappedTo = transaction.mapping.map(previous.to, 1);
            return sameLink(previous, next, mappedFrom, mappedTo)
              ? { ...next, draftHref: previous.draftHref }
              : next;
          },
        },
        props: {
          decorations: (state) => {
            const active = markweaveInlineLinkSourcePluginKey.getState(state);
            return active && isMarkweaveEditorLiveEditable(getMarkweaveEditorModeState(editor))
              ? createSourceDecorations(editor.view, active, options)
              : null;
          },
          handleDOMEvents: {
            click: (view, event) => {
              const handled = handleMarkweaveEditorLinkClickFromSource(editor, event, "dom");
              if (handled) {
                dispatchMeta(view, { type: "close" });
              }
              return handled;
            },
          },
          handleClick: (view, pos, event) => {
            const ordinaryLink = getOrdinaryLinkTarget(event);
            if (!ordinaryLink) return false;

            const liveEditable = isMarkweaveEditorLiveEditable(getMarkweaveEditorModeState(editor));
            const handled = handleMarkweaveEditorLinkClick(editor, event);
            if (!liveEditable) {
              dispatchMeta(view, { type: "close" });
              return handled;
            }

            if (event.metaKey || event.ctrlKey) {
              dispatchMeta(view, { type: "close" });
              return handled;
            }

            if (options.revealMarkdown) {
              dispatchMeta(view, { type: "activate", pos });
            }
            return false;
          },
        },
        view: (view) => {
          let destroyed = false;
          const unsubscribe = subscribeToMarkweaveEditorMode(editor, () => {
            if (
              !destroyed &&
              !isMarkweaveEditorLiveEditable(getMarkweaveEditorModeState(editor)) &&
              markweaveInlineLinkSourcePluginKey.getState(view.state)
            ) {
              dispatchMeta(view, { type: "close" });
            }
          });
          return {
            destroy() {
              destroyed = true;
              unsubscribe();
            },
          };
        },
      }),
    ];
  },
});
