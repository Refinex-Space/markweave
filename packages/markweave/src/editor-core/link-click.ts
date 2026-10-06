import { Extension, getMarkRange, type Editor } from "@tiptap/core";
import type { MarkType } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { getMarkweaveVisibleBoundaryRect } from "../core/visible-boundary";
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

function createLinkAddressPopover(
  view: EditorView,
  active: ActiveInlineLinkSource,
  options: MarkweaveLinkClickOptions,
  isCurrent: () => boolean,
) {
  const container = view.dom.ownerDocument.createElement("div");
  container.className = "markweave-inline-link-source";
  container.dataset.markweaveLinkSourceUi = "true";
  container.setAttribute("role", "group");
  container.setAttribute("aria-label", options.addressLabel);
  const label = view.dom.ownerDocument.createElement("div");
  label.className = "markweave-inline-link-source-label";
  label.textContent = options.addressLabel;
  const target = view.dom.ownerDocument.createElement("span");
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
    if (isCurrent()) commitInlineLinkSource(view, false);
  });
  container.append(label, target);
  return container;
}

function createLinkAddressView(editor: Editor, view: EditorView, options: MarkweaveLinkClickOptions) {
  const ownerDocument = view.dom.ownerDocument;
  const window = ownerDocument.defaultView!;
  const frame = view.dom.closest<HTMLElement>(".markweave-editor-frame") ?? view.dom;
  let popup: HTMLElement | null = null;
  let key = "";
  let scheduled: number | null = null;
  let observer: ResizeObserver | null = null;
  let visibilityObserver: MutationObserver | null = null;

  const anchorFor = (active: ActiveInlineLinkSource) => {
    const node = view.domAtPos(Math.min(active.from + 1, active.to)).node;
    const element = node instanceof Element ? node : node.parentElement;
    return element?.closest<HTMLAnchorElement>("a[href]") ?? null;
  };
  const position = () => {
    scheduled = null;
    const active = markweaveInlineLinkSourcePluginKey.getState(view.state);
    if (!popup || !active) return;
    const anchor = anchorFor(active);
    const boundary = getMarkweaveVisibleBoundaryRect(frame);
    const rect = anchor?.getBoundingClientRect();
    const theme = window.getComputedStyle(frame);
    if (theme.visibility === "hidden" || frame.closest('[hidden], [inert], [aria-hidden="true"]')) {
      dispatchMeta(view, { type: "close" });
      return;
    }
    if (!rect || boundary.width <= 0 || boundary.height <= 0 ||
        rect.bottom <= boundary.top || rect.top >= boundary.top + boundary.height ||
        rect.right <= boundary.left || rect.left >= boundary.left + boundary.width) {
      popup.style.visibility = "hidden";
      return;
    }
    for (const token of ["--markweave-text", "--markweave-text-muted", "--markweave-surface", "--markweave-border", "--markweave-focus"]) {
      popup.style.setProperty(token, theme.getPropertyValue(token));
    }
    const margin = 8;
    popup.style.width = `${Math.max(0, Math.min(360, boundary.width - margin * 2))}px`;
    popup.style.maxHeight = `${Math.max(0, boundary.height - margin * 2)}px`;
    const height = popup.getBoundingClientRect().height;
    const width = popup.getBoundingClientRect().width;
    const left = Math.max(boundary.left + margin, Math.min(rect.left, boundary.left + boundary.width - width - margin));
    const below = rect.bottom + margin;
    const top = below + height <= boundary.top + boundary.height - margin
      ? below
      : Math.max(boundary.top + margin, rect.top - height - margin);
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
    popup.style.visibility = "visible";
  };
  const schedulePosition = () => {
    if (popup && scheduled === null) scheduled = window.requestAnimationFrame(position);
  };
  const closePopup = () => {
    const previous = popup;
    popup = null;
    key = "";
    previous?.remove();
    observer?.disconnect();
    observer = null;
    visibilityObserver?.disconnect();
    visibilityObserver = null;
    if (scheduled !== null) window.cancelAnimationFrame(scheduled);
    scheduled = null;
    ownerDocument.removeEventListener("scroll", schedulePosition, true);
    window.removeEventListener("resize", schedulePosition);
    ownerDocument.removeEventListener("pointerdown", outsidePointerDown, true);
  };
  const outsidePointerDown = (event: PointerEvent) => {
    if (!popup || !(event.target instanceof Node) || popup.contains(event.target)) return;
    const active = markweaveInlineLinkSourcePluginKey.getState(view.state);
    if (active && anchorFor(active)?.contains(event.target)) return;
    commitInlineLinkSource(view, false);
  };
  const update = () => {
    const active = markweaveInlineLinkSourcePluginKey.getState(view.state);
    if (!active || !isMarkweaveEditorLiveEditable(getMarkweaveEditorModeState(editor))) {
      closePopup();
      return;
    }
    const nextKey = `${active.from}:${active.to}:${String(active.attrs.href)}`;
    if (!popup || nextKey !== key) {
      closePopup();
      const element = createLinkAddressPopover(view, active, options, () => popup === element);
      popup = element;
      key = nextKey;
      ownerDocument.body.append(element);
      const ResizeObserverClass = window.ResizeObserver ?? globalThis.ResizeObserver;
      observer = ResizeObserverClass ? new ResizeObserverClass(schedulePosition) : null;
      observer?.observe(frame);
      observer?.observe(element);
      visibilityObserver = new window.MutationObserver(schedulePosition);
      for (let ancestor: HTMLElement | null = frame; ancestor; ancestor = ancestor.parentElement) {
        visibilityObserver.observe(ancestor, {
          attributes: true,
          attributeFilter: ["class", "style", "hidden", "inert", "aria-hidden", "data-markweave-theme"],
        });
      }
      ownerDocument.addEventListener("scroll", schedulePosition, true);
      window.addEventListener("resize", schedulePosition);
      ownerDocument.addEventListener("pointerdown", outsidePointerDown, true);
    }
    position();
  };
  return { update, destroy: closePopup };
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
            if (!previous) return null;

            const mappedFrom = transaction.mapping.map(previous.from, -1);
            const mappedTo = transaction.mapping.map(previous.to, 1);
            return sameLink(previous, next, mappedFrom, mappedTo)
              ? { ...next, draftHref: previous.draftHref }
              : null;
          },
        },
        props: {
          handleKeyDown: (view, event) => {
            if (event.key !== "Escape" || !markweaveInlineLinkSourcePluginKey.getState(view.state)) return false;
            event.preventDefault();
            dispatchMeta(view, { type: "close" });
            return true;
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
          const popover = createLinkAddressView(editor, view, options);
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
            update: () => popover.update(),
            destroy() {
              popover.destroy();
              destroyed = true;
              unsubscribe();
            },
          };
        },
      }),
    ];
  },
});
