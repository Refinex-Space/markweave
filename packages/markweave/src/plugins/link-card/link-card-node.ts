import { mergeAttributes, Node, type MarkdownToken } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { getMarkweaveEditorModeState, isMarkweaveEditorLiveEditable } from "../../core/editor-mode-state";
import { getMarkweaveMessages, type MarkweaveLang, type MarkweaveMessages } from "../../i18n";
import { openMarkweaveLinkCardComposer } from "./link-card-composer";
import { getMarkweaveLinkCardTargetAtPos, normalizeMarkweaveLinkCardAttrs, type MarkweaveLinkCardResolver } from "./link-card";

export interface MarkweaveLinkCardExtensionOptions {
  readonly lang?: MarkweaveLang;
  readonly messages?: MarkweaveMessages;
  readonly resolver?: MarkweaveLinkCardResolver;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function getAttrs(element: Element) {
  return normalizeMarkweaveLinkCardAttrs({
    href: element.getAttribute("href"),
    title: element.getAttribute("data-markweave-link-card-title") ?? element.textContent,
    description: element.getAttribute("data-markweave-link-card-description"),
    siteName: element.getAttribute("data-markweave-link-card-site-name"),
    imageUrl: element.getAttribute("data-markweave-link-card-image-url"),
    faviconUrl: element.getAttribute("data-markweave-link-card-favicon-url"),
  });
}

export const MarkweaveLinkCard = Node.create<MarkweaveLinkCardExtensionOptions>({
  name: "markweaveLinkCard",
  markdownTokenName: "markweaveLinkCard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { lang: "zh" };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const messages = this.options.messages ?? getMarkweaveMessages(this.options.lang ?? "zh");
    const resolver = this.options.resolver;
    return [
      new Plugin({
        props: {
          handleClick(view, pos, event) {
            if (!isMarkweaveEditorLiveEditable(getMarkweaveEditorModeState(editor))) return false;
            const target = event.target;
            if (!(target instanceof HTMLElement) || !target.closest("a[href]")) return false;
            const linkTarget = getMarkweaveLinkCardTargetAtPos(editor, pos);
            if (!linkTarget) return false;
            event.preventDefault();
            return openMarkweaveLinkCardComposer({
              anchor: target.closest<HTMLElement>("a[href]") ?? target,
              editor,
              messages,
              resolver,
              target: linkTarget,
            });
          },
        },
      }),
    ];
  },

  addAttributes() {
    return {
      href: { default: null, parseHTML: (element) => getAttrs(element)?.href ?? null },
      title: { default: null, parseHTML: (element) => getAttrs(element)?.title ?? null },
      description: { default: null, parseHTML: (element) => getAttrs(element)?.description ?? null },
      siteName: { default: null, parseHTML: (element) => getAttrs(element)?.siteName ?? null },
      imageUrl: { default: null, parseHTML: (element) => getAttrs(element)?.imageUrl ?? null },
      faviconUrl: { default: null, parseHTML: (element) => getAttrs(element)?.faviconUrl ?? null },
    };
  },

  parseHTML() {
    return [{ tag: "a[data-markweave-link-card]", getAttrs: (element) => getAttrs(element as Element) || false }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = normalizeMarkweaveLinkCardAttrs(node.attrs ?? {}) ?? { href: "", title: "", description: null, siteName: null, imageUrl: null, faviconUrl: null };
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        class: "markweave-link-card",
        href: attrs.href,
        "data-markweave-link-card": "true",
        "data-markweave-link-card-title": attrs.title,
        "data-markweave-link-card-description": attrs.description,
        "data-markweave-link-card-site-name": attrs.siteName,
        "data-markweave-link-card-image-url": attrs.imageUrl,
        "data-markweave-link-card-favicon-url": attrs.faviconUrl,
      }),
      attrs.title,
    ];
  },

  markdownTokenizer: {
    name: "markweaveLinkCard",
    level: "block",
    start: (src: string) => {
      const index = src.indexOf("data-markweave-link-card");
      return index >= 0 ? Math.max(0, src.lastIndexOf("<a", index)) : -1;
    },
    tokenize: (src: string) => {
      const match = src.match(/^<a\b[^>]*data-markweave-link-card[^>]*>[\s\S]*?<\/a>/);
      return match ? { type: "markweaveLinkCard", raw: match[0], text: match[0] } : undefined;
    },
  },

  parseMarkdown: (token: MarkdownToken, helpers) => {
    if (typeof DOMParser === "undefined") return [];
    const document = new DOMParser().parseFromString(token.raw ?? token.text ?? "", "text/html");
    const element = document.querySelector("a[data-markweave-link-card]");
    const attrs = element ? getAttrs(element) : null;
    return attrs ? helpers.createNode("markweaveLinkCard", attrs) : [];
  },

  renderMarkdown: (node) => {
    const attrs = normalizeMarkweaveLinkCardAttrs(node.attrs ?? {});
    if (!attrs) return "";
    const pairs = {
      href: attrs.href,
      class: "markweave-link-card",
      "data-markweave-link-card": "true",
      "data-markweave-link-card-title": attrs.title,
      "data-markweave-link-card-description": attrs.description,
      "data-markweave-link-card-site-name": attrs.siteName,
      "data-markweave-link-card-image-url": attrs.imageUrl,
      "data-markweave-link-card-favicon-url": attrs.faviconUrl,
    };
    const attributes = Object.entries(pairs)
      .filter(([, value]) => value)
      .map(([name, value]) => `${name}="${escapeHtml(String(value))}"`)
      .join(" ");
    return `<a ${attributes}>${escapeHtml(attrs.title)}</a>`;
  },
});
