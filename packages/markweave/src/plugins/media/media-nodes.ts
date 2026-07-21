import { mergeAttributes, Node, type MarkdownToken } from "@tiptap/core";

function stringAttribute(value: unknown) {
  return typeof value === "string" ? value : null;
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function compactAttributes(attributes: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

function getAttachmentAttrsFromHtml(html: string) {
  if (typeof DOMParser === "undefined") {
    return null;
  }

  const document = new DOMParser().parseFromString(html, "text/html");
  const anchor = document.querySelector("a[data-markweave-attachment]");

  if (!anchor) {
    return null;
  }

  return {
    src: stringAttribute(anchor.getAttribute("href")),
    name: stringAttribute(anchor.getAttribute("data-markweave-attachment-name") ?? anchor.textContent),
    mimeType: stringAttribute(anchor.getAttribute("data-markweave-mime-type")),
    size: anchor.getAttribute("data-markweave-attachment-size") ? Number(anchor.getAttribute("data-markweave-attachment-size")) : null,
  };
}

export const MarkweaveAttachment = Node.create({
  name: "markweaveAttachment",
  markdownTokenName: "markweaveAttachment",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => stringAttribute(element.getAttribute("href")),
        renderHTML: (attributes) => (attributes.src ? { href: attributes.src } : {}),
      },
      name: {
        default: null,
        parseHTML: (element) => stringAttribute(element.getAttribute("data-markweave-attachment-name") ?? element.textContent),
        renderHTML: (attributes) => (attributes.name ? { "data-markweave-attachment-name": attributes.name } : {}),
      },
      mimeType: {
        default: null,
        parseHTML: (element) => stringAttribute(element.getAttribute("data-markweave-mime-type")),
        renderHTML: (attributes) => (attributes.mimeType ? { "data-markweave-mime-type": attributes.mimeType } : {}),
      },
      size: {
        default: null,
        parseHTML: (element) => {
          const rawValue = element.getAttribute("data-markweave-attachment-size");
          return rawValue ? Number(rawValue) : null;
        },
        renderHTML: (attributes) => (typeof attributes.size === "number" ? { "data-markweave-attachment-size": String(attributes.size) } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "a[data-markweave-attachment]",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = stringAttribute(node.attrs.name) ?? stringAttribute(node.attrs.src) ?? "Attachment";
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        class: "markweave-attachment",
        "data-markweave-attachment": "true",
      }),
      label,
    ];
  },

  markdownTokenizer: {
    name: "markweaveAttachment",
    level: "block",
    start: (src: string) => {
      const prefix = src.slice(0, 8_192);
      const index = prefix.indexOf("data-markweave-attachment");
      return index >= 0 ? Math.max(0, prefix.lastIndexOf("<a", index)) : -1;
    },
    tokenize: (src: string) => {
      const match = src.match(/^<a\b[^>]*data-markweave-attachment[^>]*>[\s\S]*?<\/a>/);

      if (!match) {
        return undefined;
      }

      return {
        type: "markweaveAttachment",
        raw: match[0],
        text: match[0],
      };
    },
  },

  parseMarkdown: (token: MarkdownToken, helpers) => {
    const attrs = getAttachmentAttrsFromHtml(token.raw ?? token.text ?? "");

    if (!attrs?.src) {
      return [];
    }

    return helpers.createNode("markweaveAttachment", attrs);
  },

  renderMarkdown: (node) => {
    const src = stringAttribute(node.attrs?.src);
    const label = stringAttribute(node.attrs?.name) ?? src ?? "Attachment";
    const attrs = compactAttributes({
      href: src,
      class: "markweave-attachment",
      "data-markweave-attachment": "true",
      "data-markweave-attachment-name": stringAttribute(node.attrs?.name),
      "data-markweave-mime-type": stringAttribute(node.attrs?.mimeType),
      "data-markweave-attachment-size": typeof node.attrs?.size === "number" ? String(node.attrs.size) : null,
    });
    const attrString = Object.entries(attrs)
      .map(([key, value]) => `${key}="${escapeHtmlAttribute(String(value))}"`)
      .join(" ");

    return `<a ${attrString}>${escapeHtmlText(label)}</a>`;
  },
});
