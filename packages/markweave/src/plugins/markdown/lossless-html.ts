import { getHTMLFromFragment, getSchema, type Extensions, type JSONContent } from "@tiptap/core";
import { Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model";

const cssColorPattern = /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([0-9.%\s,/-]+\)|[a-z]+)$/i;
const textAlignmentValues = new Set(["left", "center", "right", "justify"]);
const tableVerticalAlignmentValues = new Set(["top", "middle", "bottom"]);

export function normalizeMarkweaveHtmlColor(value: unknown) {
  const color = typeof value === "string" ? value.trim() : "";
  return cssColorPattern.test(color) ? color : null;
}

/**
 * 使用完整编辑器 Schema 序列化 Markdown 无法无损表达的内容。
 *
 * 宿主扩展节点由其自身的 renderHTML/parseHTML 契约负责往返，避免手写回退逻辑
 * 因不了解宿主节点而静默丢失内容。Schema 仅在首次使用时创建并复用，避免富格式
 * 文档序列化时为每个节点重复构建 Schema。
 */
export function createMarkweaveHtmlFallbackRenderer(getExtensions: () => Extensions) {
  let schema: Schema | null = null;

  const getEditorSchema = () => {
    schema ??= getSchema(getExtensions());
    return schema;
  };

  return {
    renderBlock(node: JSONContent) {
      const editorSchema = getEditorSchema();
      const documentNode = ProseMirrorNode.fromJSON(editorSchema, {
        type: "doc",
        content: [node],
      });

      return getHTMLFromFragment(documentNode.content, editorSchema);
    },
    renderInline(content: readonly JSONContent[] = []) {
      const editorSchema = getEditorSchema();
      const documentNode = ProseMirrorNode.fromJSON(editorSchema, {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content,
          },
        ],
      });

      return getHTMLFromFragment(documentNode.firstChild?.content ?? documentNode.content, editorSchema);
    },
  };
}

/**
 * 原子行内节点携带 Mark 时，节点自身的 Markdown 渲染器通常无法表达这些 Mark。
 * 此时必须提升为块级 HTML 回退，才能同时保存宿主节点身份与格式信息。
 */
export function needsMarkweaveInlineNodeHtmlFallback(node: JSONContent) {
  return (node.content ?? []).some((child) => child.type !== "text" && Boolean(child.marks?.length));
}

export function needsMarkweaveTableHtmlFallback(node: JSONContent) {
  let requiresFallback = false;
  const visit = (current: JSONContent) => {
    if (requiresFallback) return;

    if (current.type !== "text" && Boolean(current.marks?.length)) {
      requiresFallback = true;
      return;
    }

    if (current.type === "tableCell" || current.type === "tableHeader") {
      const attrs = current.attrs ?? {};
      const hasSpans = (Number(attrs.colspan) || 1) > 1 || (Number(attrs.rowspan) || 1) > 1;
      const hasCellStyle =
        Boolean(normalizeMarkweaveHtmlColor(attrs.textColor)) ||
        Boolean(normalizeMarkweaveHtmlColor(attrs.backgroundColor)) ||
        (typeof attrs.textAlign === "string" && textAlignmentValues.has(attrs.textAlign) && attrs.textAlign !== "left") ||
        (typeof attrs.verticalAlign === "string" && tableVerticalAlignmentValues.has(attrs.verticalAlign) && attrs.verticalAlign !== "middle");

      if (hasSpans || hasCellStyle) {
        requiresFallback = true;
        return;
      }
    }

    current.content?.forEach(visit);
  };

  visit(node);
  return requiresFallback;
}
