// @vitest-environment jsdom

import { Editor, type JSONContent, type MarkdownToken } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import {
  createCheckedMarkweaveMarkdownDocument,
  loadMarkweaveDocument,
  parseMarkweaveDocument,
} from "../src/editor-core/document-load";
import { markweaveMarkdownParserWorkerSource } from "../src/editor-core/markdown-parser-worker-source.generated";

const image = "![Preview](asset://preview)";
const link = "[Open prototype](https://example.com/prototype)";
const editors: Editor[] = [];

function createEditor(content = "") {
  const editor = new Editor({
    extensions: createMarkweaveEditorExtensions(),
    content,
    contentType: "markdown",
  });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe("Markdown block content compatibility", () => {
  it.each([
    ["paragraph", `${image}${link}`],
    ["bullet list", `- ${image}${link}\n- Next item`],
    ["image-only list", `- ${image}\n\n${link}`],
    ["adjacent-image list", `- ${image}${image}${link}`],
    ["list with leading text", `- **Preview:** ${image}${link}`],
    ["ordered list", `1. ${image}${link}\n2. Next item`],
    ["task list", `- [x] ${image}${link}\n- [ ] Next item`],
    ["nested list", `- Parent\n  - ${image}${link}\n  - Next item`],
    ["blockquote", `> - ${image}${link}`],
    ["table", `| Preview |\n| --- |\n| ${image}${link} |`],
  ])("preserves image and link in a %s across standard and coordinated loading", async (_name, source) => {
    const markdown = `${source}\n\nDocument end.`;
    const standard = createEditor(markdown);
    const coordinated = createEditor();

    expect(() => standard.state.doc.check()).not.toThrow();
    await loadMarkweaveDocument(coordinated, {
      content: markdown,
      format: "markdown",
      performancePolicy: "large",
    });

    expect(() => coordinated.state.doc.check()).not.toThrow();
    expect(coordinated.getJSON()).toEqual(standard.getJSON());
    expect(standard.getHTML()).toContain('src="asset://preview"');
    expect(standard.getHTML()).toContain('href="https://example.com/prototype"');
    expect(standard.getText()).toContain("Open prototype");
    const roundTrip = parseMarkweaveDocument(standard, standard.getMarkdown(), "markdown");
    expect(roundTrip.toJSON()).toEqual(standard.getJSON());
  });

  it("uses the same rules for subsequent Markdown commands", () => {
    const editor = createEditor("# Before");
    const markdown = `- ${image}${link}\n\nDocument end.`;
    const expected = parseMarkweaveDocument(editor, markdown, "markdown");

    editor.commands.setContent(markdown, { contentType: "markdown" });
    expect(() => editor.state.doc.check()).not.toThrow();
    expect(editor.getJSON()).toEqual(expected.toJSON());
    editor.commands.insertContentAt(editor.state.doc.content.size, `\n\n${image}${link}`, {
      contentType: "markdown",
    });
    expect(() => editor.state.doc.check()).not.toThrow();
    expect(editor.getHTML().match(/src="asset:\/\/preview"/g)).toHaveLength(2);
  });

  it("normalizes Worker tokens with the same list boundaries without mutating the input", () => {
    const editor = createEditor();
    const markdown = `- ${image}${link}\n- Next item`;
    const posted: Array<{ tokens: MarkdownToken[] }> = [];
    const scope = {
      onmessage: null as ((event: { data: { id: number; markdown: string } }) => void) | null,
      postMessage: (message: { tokens: MarkdownToken[] }) => posted.push(message),
    };
    new Function("globalThis", markweaveMarkdownParserWorkerSource)(scope);
    scope.onmessage!({ data: { id: 1, markdown } });
    const manager = editor.markdown as unknown as {
      parseTokens(tokens: MarkdownToken[], implicitEmptyParagraphs: boolean): JSONContent[];
    };
    const parsed = { type: "doc", content: manager.parseTokens(posted[0]!.tokens, true) };
    const before = JSON.stringify(parsed);
    const document = createCheckedMarkweaveMarkdownDocument(editor, parsed);

    expect(() => document.check()).not.toThrow();
    expect(document.toJSON()).toEqual(createEditor(markdown).getJSON());
    expect(JSON.stringify(parsed)).toBe(before);
  });
});
