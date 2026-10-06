import type { JSONContent } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";

function normalizeNode(schema: Schema, source: JSONContent): JSONContent[] {
  if (!source.content) return [source];

  const node = {
    ...source,
    content: source.content.flatMap((child) => normalizeNode(schema, child)),
  };

  if (node.type === "listItem" || node.type === "taskItem") {
    const firstType = schema.nodes[node.content[0]?.type ?? ""];
    const match = schema.nodes[node.type]?.contentMatch;
    const paragraph = schema.nodes.paragraph;
    // Lifting a leading block image must not remove the paragraph required by
    // list schemas. Keep all following blocks inside their original list item.
    if (firstType && match && paragraph &&
        !match.matchType(firstType) && match.matchType(paragraph)) {
      node.content.unshift({ type: "paragraph" });
    }
  }

  if (node.type !== "paragraph" ||
      !node.content.some((child) => schema.nodes[child.type ?? ""]?.isBlock)) {
    return [node];
  }

  const siblings: JSONContent[] = [];
  let inlineContent: JSONContent[] = [];
  const flushInlineContent = () => {
    const first = inlineContent[0];
    if (first?.type === "text" && first.text) {
      inlineContent[0] = { ...first, text: first.text.trimStart() };
      if (!inlineContent[0]!.text) inlineContent.shift();
    }
    const last = inlineContent[inlineContent.length - 1];
    if (last?.type === "text" && last.text) {
      inlineContent[inlineContent.length - 1] = { ...last, text: last.text.trimEnd() };
      if (!inlineContent[inlineContent.length - 1]!.text) inlineContent.pop();
    }
    if (inlineContent.length) siblings.push({ ...node, content: inlineContent });
    inlineContent = [];
  };

  for (const child of node.content) {
    if (schema.nodes[child.type ?? ""]?.isBlock) {
      flushInlineContent();
      siblings.push(child);
    } else {
      inlineContent.push(child);
    }
  }
  flushInlineContent();
  return siblings;
}

export function normalizeMarkweaveMarkdownDocument(schema: Schema, content: JSONContent): JSONContent {
  return normalizeNode(schema, content)[0]!;
}
