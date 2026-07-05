import { mergeAttributes, Node } from "@tiptap/core";

export const markweaveCalloutTypes = ["info", "warning", "error", "success", "tip"] as const;
export type MarkweaveCalloutType = (typeof markweaveCalloutTypes)[number];

export function normalizeMarkweaveCalloutType(value: unknown): MarkweaveCalloutType {
  return markweaveCalloutTypes.includes(value as MarkweaveCalloutType) ? (value as MarkweaveCalloutType) : "info";
}

export const MarkweaveCallout = Node.create({
  name: "markweaveCallout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      type: {
        default: "info",
        parseHTML: (element) => normalizeMarkweaveCalloutType(element.getAttribute("data-markweave-callout-type")),
        renderHTML: (attributes) => ({
          "data-markweave-callout-type": normalizeMarkweaveCalloutType(attributes.type),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-markweave-callout-type]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "markweave-callout",
        "data-markweave-callout-type": normalizeMarkweaveCalloutType(HTMLAttributes["data-markweave-callout-type"] ?? HTMLAttributes.type),
      }),
      0,
    ];
  },
});
