import type { Editor } from "@tiptap/core";
import type {
  MarkweaveContentFormat,
  MarkweaveContentValue,
  MarkweaveEditorUpdatePayload,
} from "../core/public-types";

export type MarkweaveEditorSerializedContentKind = MarkweaveContentFormat | "text";

export interface MarkweaveEditorUpdatePayloadOptions {
  readonly onContentRead?: (kind: MarkweaveEditorSerializedContentKind, value: MarkweaveContentValue) => void;
}

export interface MarkweaveControlledContentEcho {
  readonly content: MarkweaveContentValue;
  readonly format: MarkweaveContentFormat;
  readonly doc: unknown;
}

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

export function isMarkweaveControlledContentEchoCurrent(
  editor: Editor,
  echo: MarkweaveControlledContentEcho | null,
  content: MarkweaveContentValue,
  format: MarkweaveContentFormat,
) {
  return Boolean(echo && echo.doc === editor.state.doc && echo.format === format && echo.content === content);
}

export function createMarkweaveEditorUpdatePayload(
  editor: Editor,
  options: MarkweaveEditorUpdatePayloadOptions = {},
): MarkweaveEditorUpdatePayload {
  let html: string | null = null;
  let json: MarkweaveContentValue | null = null;
  let markdown: string | null = null;
  let text: string | null = null;

  const read = <T extends MarkweaveContentValue>(kind: MarkweaveEditorSerializedContentKind, value: T) => {
    options.onContentRead?.(kind, value);
    return value;
  };

  return {
    editor,
    get html() {
      html ??= editor.getHTML();
      return read("html", html);
    },
    get json() {
      json ??= editor.getJSON();
      return read("json", json) as MarkweaveEditorUpdatePayload["json"];
    },
    get markdown() {
      markdown ??= getEditorMarkdown(editor);
      return read("markdown", markdown);
    },
    get text() {
      text ??= editor.getText();
      return read("text", text);
    },
  };
}
