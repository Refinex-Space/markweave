import { mergeAttributes, Node, type MarkdownToken } from "@tiptap/core";

export const markweaveCalloutTypes = ["info", "warning", "error", "success", "tip"] as const;
export type MarkweaveCalloutType = (typeof markweaveCalloutTypes)[number];

export function normalizeMarkweaveCalloutType(value: unknown): MarkweaveCalloutType {
  return markweaveCalloutTypes.includes(value as MarkweaveCalloutType) ? (value as MarkweaveCalloutType) : "info";
}

export const MarkweaveCallout = Node.create({
  name: "markweaveCallout",
  markdownTokenName: "markweaveCallout",
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

  markdownTokenizer: {
    name: "markweaveCallout",
    level: "block",
    start: (src: string) => {
      const match = src.match(/^:::(info|warning|error|success|tip)\b/m);
      return match?.index ?? -1;
    },
    tokenize: (src: string, _tokens: MarkdownToken[], lexer) => {
      const openingMatch = src.match(/^:::(info|warning|error|success|tip)\s*\n/);

      if (!openingMatch) {
        return undefined;
      }

      const calloutType = normalizeMarkweaveCalloutType(openingMatch[1]);
      const bodyStart = openingMatch[0].length;
      const body = src.slice(bodyStart);
      const closingMatch = body.match(/^:::\s*$/m);

      if (!closingMatch || closingMatch.index === undefined) {
        return undefined;
      }

      const rawContent = body.slice(0, closingMatch.index);
      const raw = src.slice(0, bodyStart + closingMatch.index + closingMatch[0].length);

      return {
        type: "markweaveCallout",
        raw,
        calloutType,
        tokens: lexer.blockTokens(rawContent),
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    return helpers.createNode("markweaveCallout", { type: normalizeMarkweaveCalloutType(token.calloutType) }, helpers.parseBlockChildren?.(token.tokens ?? []) ?? helpers.parseChildren(token.tokens ?? []));
  },

  renderMarkdown: (node, helpers) => {
    const type = normalizeMarkweaveCalloutType(node.attrs?.type);
    const content = helpers.renderChildren(node.content ?? [], "\n\n").trim();
    return content ? `:::${type}\n${content}\n:::` : `:::${type}\n:::`;
  },
});
