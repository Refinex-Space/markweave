import type { Editor } from "@tiptap/core";
import type {
  MarkweaveContentFormat,
  MarkweaveContentValue,
  MarkweaveEditorUpdatePayload,
} from "../core/public-types";

export function normalizeMarkweaveContentFormat(format: MarkweaveContentFormat | undefined): MarkweaveContentFormat {
  return format === "html" || format === "json" || format === "markdown" ? format : "markdown";
}

export function getMarkweaveContentType(format: MarkweaveContentFormat | undefined) {
  return normalizeMarkweaveContentFormat(format);
}

export function getEditorMarkdown(editor: Editor) {
  return (editor as Editor & { getMarkdown?: () => string }).getMarkdown?.() ?? editor.getText();
}

export function stringifyJsonContent(content: MarkweaveContentValue) {
  return typeof content === "string" ? content : JSON.stringify(content);
}

export function isEditorContentCurrent(editor: Editor, content: MarkweaveContentValue, format: MarkweaveContentFormat) {
  if (format === "html") {
    return typeof content === "string" && editor.getHTML() === content;
  }

  if (format === "json") {
    return JSON.stringify(editor.getJSON()) === stringifyJsonContent(content);
  }

  return typeof content === "string" && getEditorMarkdown(editor).trim() === content.trim();
}

export function createMarkweaveEditorUpdatePayload(editor: Editor): MarkweaveEditorUpdatePayload {
  return {
    editor,
    html: editor.getHTML(),
    json: editor.getJSON(),
    markdown: getEditorMarkdown(editor),
    text: editor.getText(),
  };
}
