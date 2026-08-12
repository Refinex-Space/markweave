import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/**
 * Metadata a host resolves for an internal document link. All fields are
 * optional so the card degrades gracefully (falling back to the link text) while
 * async resolution is pending or when a target cannot be described.
 */
export interface MarkweaveInternalLinkCardMeta {
  /** Overrides the displayed title (defaults to the link text). */
  readonly title?: string | null;
  /** Secondary line, e.g. a workspace-relative path or breadcrumb. */
  readonly subtitle?: string | null;
  /** Icon hint exposed as `data-icon-name` for host CSS theming. */
  readonly iconName?: string | null;
  /** When `false`, the card renders a "missing target" state. */
  readonly exists?: boolean;
}

export interface MarkweaveInternalLinkCardResolveRequest {
  readonly href: string;
  readonly title: string;
  readonly signal: AbortSignal;
}

export type MarkweaveInternalLinkCardResolver = (
  request: MarkweaveInternalLinkCardResolveRequest,
) =>
  | MarkweaveInternalLinkCardMeta
  | null
  | Promise<MarkweaveInternalLinkCardMeta | null>;

export interface MarkweaveInternalLinkCardConfig {
  /**
   * Classifies whether a link href points at an internal workspace document.
   * Only the host knows workspace semantics, so this predicate is required.
   */
  readonly isInternalLink: (href: string) => boolean;
  /** Resolves display metadata for a card. Optional; title-only when omitted. */
  readonly resolve?: MarkweaveInternalLinkCardResolver;
}

export interface MarkweaveInternalLinkCardExtensionOptions {
  readonly config?: MarkweaveInternalLinkCardConfig | null;
}

interface InternalLinkCardTarget {
  readonly from: number;
  readonly to: number;
  readonly href: string;
  readonly title: string;
}

export const markweaveInternalLinkCardPluginKey = new PluginKey(
  "markweaveInternalLinkCard",
);

export const INTERNAL_LINK_CARD_ATTRIBUTE = "data-internal-link-card";

const DOCUMENT_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>';

function getLinkHref(node: ProseMirrorNode): string | null {
  const mark = node.marks.find((candidate) => candidate.type.name === "link");
  const href = mark?.attrs.href;
  return typeof href === "string" && href.trim() ? href : null;
}

/**
 * Finds the whole-line internal-document-link paragraph at `pos`, if any. A
 * paragraph qualifies only when it contains exactly one text node carrying a
 * link mark whose href the host classifies as internal. Inline links inside
 * longer paragraphs never qualify, preserving them as plain `[]()` links.
 */
function readInternalLinkTarget(
  node: ProseMirrorNode,
  pos: number,
  config: MarkweaveInternalLinkCardConfig,
): InternalLinkCardTarget | null {
  if (node.type.name !== "paragraph" || node.childCount !== 1) {
    return null;
  }

  const child = node.firstChild;
  if (!child?.isText || !child.text) {
    return null;
  }

  const href = getLinkHref(child);
  if (!href || !config.isInternalLink(href)) {
    return null;
  }

  return { from: pos, to: pos + node.nodeSize, href, title: child.text };
}

function applyCardMeta(
  root: HTMLElement,
  titleEl: HTMLElement,
  bodyEl: HTMLElement,
  meta: MarkweaveInternalLinkCardMeta | null,
) {
  if (!meta) {
    return;
  }

  const title = typeof meta.title === "string" ? meta.title.trim() : "";
  if (title) {
    titleEl.textContent = title;
  }

  if (typeof meta.iconName === "string" && meta.iconName.trim()) {
    root.dataset.iconName = meta.iconName.trim();
  }

  if (meta.exists === false) {
    root.dataset.exists = "false";
  } else if (meta.exists === true) {
    root.dataset.exists = "true";
  }

  const subtitle = typeof meta.subtitle === "string" ? meta.subtitle.trim() : "";
  if (subtitle) {
    let subtitleEl = bodyEl.querySelector<HTMLElement>(
      ".markweave-internal-link-card-subtitle",
    );
    if (!subtitleEl) {
      subtitleEl = document.createElement("span");
      subtitleEl.className = "markweave-internal-link-card-subtitle";
      bodyEl.appendChild(subtitleEl);
    }
    subtitleEl.textContent = subtitle;
  }
}

function createCardElement(
  target: InternalLinkCardTarget,
  config: MarkweaveInternalLinkCardConfig,
): HTMLElement {
  const root = document.createElement("a");
  root.className = "markweave-internal-link-card";
  root.setAttribute("href", target.href);
  root.setAttribute("contenteditable", "false");
  root.setAttribute("role", "link");
  root.dataset.cardFrom = String(target.from);

  const iconEl = document.createElement("span");
  iconEl.className = "markweave-internal-link-card-icon";
  iconEl.setAttribute("aria-hidden", "true");
  iconEl.innerHTML = DOCUMENT_ICON_SVG;

  const bodyEl = document.createElement("span");
  bodyEl.className = "markweave-internal-link-card-body";

  const titleEl = document.createElement("span");
  titleEl.className = "markweave-internal-link-card-title";
  titleEl.textContent = target.title;

  bodyEl.appendChild(titleEl);
  root.append(iconEl, bodyEl);

  if (config.resolve) {
    const controller = new AbortController();
    Promise.resolve(
      config.resolve({
        href: target.href,
        title: target.title,
        signal: controller.signal,
      }),
    )
      .then((meta) => {
        if (root.isConnected) {
          applyCardMeta(root, titleEl, bodyEl, meta);
        }
      })
      .catch(() => {
        /* host resolver failures leave the title-only fallback in place */
      });
  }

  return root;
}

function isSelectionInsideRange(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  const { selection } = state;
  return !(selection.to <= from || selection.from >= to);
}

function buildInternalLinkCardDecorations(
  state: EditorState,
  config: MarkweaveInternalLinkCardConfig,
): DecorationSet {
  const decorations: Decoration[] = [];

  state.doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph") {
      return true;
    }

    const target = readInternalLinkTarget(node, pos, config);
    if (!target) {
      return false;
    }

    // While the caret sits on this line, expose the raw [](path) link so it can
    // be edited; the card reappears once the selection leaves and the line still
    // qualifies. The document itself is never mutated.
    if (isSelectionInsideRange(state, target.from, target.to)) {
      return false;
    }

    decorations.push(
      Decoration.node(target.from, target.to, {
        [INTERNAL_LINK_CARD_ATTRIBUTE]: "true",
      }),
    );
    decorations.push(
      Decoration.widget(
        target.from + 1,
        () => createCardElement(target, config),
        {
          key: `markweave-internal-link-card-${target.from}-${target.href}`,
          side: -1,
        },
      ),
    );

    return false;
  });

  return DecorationSet.create(state.doc, decorations);
}

function handleInternalLinkCardClick(
  view: EditorView,
  _pos: number,
  event: MouseEvent,
): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const card = target.closest<HTMLElement>(".markweave-internal-link-card");
  if (!card) {
    return false;
  }

  // Modifier clicks are reserved for host navigation (the card is an <a href>).
  if (event.metaKey || event.ctrlKey) {
    return false;
  }

  if (!view.editable) {
    return false;
  }

  const from = Number(card.dataset.cardFrom);
  if (!Number.isFinite(from)) {
    return false;
  }

  const node = view.state.doc.nodeAt(from);
  if (!node || node.type.name !== "paragraph") {
    return false;
  }

  const caret = from + node.nodeSize - 1;
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, caret))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

/**
 * Renders whole-line internal document links as Markweave-styled cards without
 * changing storage: the document stays plain Markdown `[title](path)`, and the
 * card is a selection-aware ProseMirror decoration. Enabled only when a trusted
 * host supplies a classifier (and optional metadata resolver).
 */
export const MarkweaveInternalLinkCard =
  Extension.create<MarkweaveInternalLinkCardExtensionOptions>({
    name: "markweaveInternalLinkCard",
    priority: 500,

    addOptions() {
      return { config: null };
    },

    addProseMirrorPlugins() {
      const config = this.options.config;

      if (!config) {
        return [];
      }

      return [
        new Plugin({
          key: markweaveInternalLinkCardPluginKey,
          props: {
            decorations: (state) =>
              buildInternalLinkCardDecorations(state, config),
            handleClick: handleInternalLinkCardClick,
          },
        }),
      ];
    },
  });
