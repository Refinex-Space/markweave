import { mergeAttributes, Node } from "@tiptap/core";

function stringAttribute(value: unknown) {
  return typeof value === "string" ? value : null;
}

export const MarkweaveAttachment = Node.create({
  name: "markweaveAttachment",
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
});
