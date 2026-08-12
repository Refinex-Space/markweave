import type { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { attrsFromMarkweaveAttachmentUploadResult } from "../plugins/media/attachment-download";
import type { MarkweaveUploadResult } from "../plugins/slash-command/upload";

export interface MarkweaveBuiltinCommandPayload {
  readonly emoji?: string;
  readonly uploadResult?: MarkweaveUploadResult;
}

function selectFirstTableBodyCellInTransaction(transaction: Transaction, from: number) {
  let fallbackPosition: number | null = null;
  let bodyCellPosition: number | null = null;
  transaction.doc.descendants((node, pos) => {
    if ((node.type.name !== "tableCell" && node.type.name !== "tableHeader") || pos < from) return true;
    let cursorPosition = pos + 1;
    node.descendants((child, childPos) => {
      if (!child.isTextblock) return true;
      cursorPosition = pos + childPos + 2;
      return false;
    });
    fallbackPosition ??= cursorPosition;
    if (node.type.name === "tableCell") {
      bodyCellPosition ??= cursorPosition;
      return false;
    }
    return true;
  });
  const position = bodyCellPosition ?? fallbackPosition;
  if (position !== null) transaction.setSelection(TextSelection.create(transaction.doc, position));
  return true;
}

export function executeMarkweaveBuiltinCommand(
  editor: Editor,
  commandId: string,
  target: { readonly from: number; readonly to: number },
  payload: MarkweaveBuiltinCommandPayload = {},
) {
  const from = Math.max(0, Math.min(target.from, editor.state.doc.content.size));
  const to = Math.max(from, Math.min(target.to, editor.state.doc.content.size));
  const base = editor.chain().focus();
  const chain = from < to ? base.deleteRange({ from, to }) : base;

  if (commandId === "emoji") {
    return payload.emoji ? chain.insertContent(payload.emoji).run() : false;
  }

  switch (commandId) {
    case "paragraph":
      return chain.setParagraph().run();
    case "heading-1":
      return chain.toggleHeading({ level: 1 }).run();
    case "heading-2":
      return chain.toggleHeading({ level: 2 }).run();
    case "heading-3":
      return chain.toggleHeading({ level: 3 }).run();
    case "bullet-list":
      return chain.toggleBulletList().run();
    case "ordered-list":
      return chain.toggleOrderedList().run();
    case "task-list":
      return chain.toggleTaskList().run();
    case "blockquote":
      return chain.toggleBlockquote().run();
    case "code-block":
      return chain.setCodeBlock({ language: "text" }).run();
    case "separator":
      return chain.setHorizontalRule().run();
    case "block-math":
      return chain
        .insertBlockMath({ latex: "x", pos: from })
        .command(({ tr }) => {
          let blockMathPosition: number | null = null;
          tr.doc.descendants((node, pos) => {
            if (node.type.name !== "blockMath" || pos < from) return true;
            blockMathPosition = pos;
            return false;
          });
          if (blockMathPosition !== null) tr.setSelection(NodeSelection.create(tr.doc, blockMathPosition));
          return true;
        })
        .run();
    case "callout-info":
    case "callout-tip":
    case "callout-warning":
    case "callout-error":
    case "callout-success":
      return chain.insertContent({
        type: "markweaveCallout",
        attrs: { type: commandId.slice("callout-".length) },
        content: [{ type: "paragraph" }],
      }).run();
    case "table": {
      return chain
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .command(({ tr }) => selectFirstTableBodyCellInTransaction(tr, from))
        .run();
    }
    case "image":
      return chain.insertContent({
        type: "image",
        attrs: payload.uploadResult
          ? {
              src: payload.uploadResult.src,
              alt: payload.uploadResult.alt ?? payload.uploadResult.name,
              title: payload.uploadResult.title,
            }
          : { src: null, align: "center" },
      }).run();
    case "video":
      return chain.insertContent({
        type: "markweaveVideo",
        attrs: payload.uploadResult
          ? {
              src: payload.uploadResult.src,
              title: payload.uploadResult.title ?? payload.uploadResult.name,
              mimeType: payload.uploadResult.mimeType,
            }
          : { src: null },
      }).run();
    case "attachment":
      return chain.insertContent({
        type: "markweaveAttachment",
        attrs: payload.uploadResult
          ? attrsFromMarkweaveAttachmentUploadResult(payload.uploadResult)
          : { src: null, name: null, mimeType: null, size: null },
      }).run();
    case "mermaid":
      return chain
        .setCodeBlock({ language: "mermaid" })
        .updateAttributes("codeBlock", { mermaidPreviewMode: "code" })
        .insertContent("graph TD\n  A[Start] --> B[End]")
        .run();
    default:
      return false;
  }
}
