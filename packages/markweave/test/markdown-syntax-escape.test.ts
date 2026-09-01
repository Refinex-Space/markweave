// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { escapeMarkweaveMarkdownSyntax } from "../src/plugins/markdown/markdown-syntax-escape";

let activeEditors: Editor[] = [];

function createEditor(content: string) {
  const editor = new Editor({
    content,
    contentType: "markdown",
    extensions: createMarkweaveEditorExtensions(),
  });
  activeEditors.push(editor);
  return editor;
}

function getMarkdown(editor: Editor) {
  return (editor as Editor & { getMarkdown: () => string }).getMarkdown();
}

afterEach(() => {
  activeEditors.forEach((editor) => editor.destroy());
  activeEditors = [];
  document.body.replaceChildren();
});

describe("escapeMarkweaveMarkdownSyntax", () => {
  it("keeps GFM intra-word underscores unescaped", () => {
    expect(escapeMarkweaveMarkdownSyntax("doc_review_agent")).toBe("doc_review_agent");
    expect(escapeMarkweaveMarkdownSyntax("v260817_1")).toBe("v260817_1");
    expect(escapeMarkweaveMarkdownSyntax("测试_文档")).toBe("测试_文档");
  });

  it("escapes underscores that can open or close emphasis", () => {
    expect(escapeMarkweaveMarkdownSyntax("_draft")).toBe("\\_draft");
    expect(escapeMarkweaveMarkdownSyntax("draft_")).toBe("draft\\_");
    expect(escapeMarkweaveMarkdownSyntax("say _no_")).toBe("say \\_no\\_");
  });

  it("still escapes other inline markdown punctuation", () => {
    expect(escapeMarkweaveMarkdownSyntax("a*b")).toBe("a\\*b");
    expect(escapeMarkweaveMarkdownSyntax("see [ref]")).toBe("see \\[ref\\]");
  });

  it("collapses over-escaped intra-word underscores before serializing", () => {
    expect(escapeMarkweaveMarkdownSyntax("doc\\_review\\_agent")).toBe("doc_review_agent");
    expect(escapeMarkweaveMarkdownSyntax("v260817\\\\\\\\_1")).toBe("v260817_1");
  });
});

describe("Markdown underscore serialization", () => {
  it("round-trips identifier underscores without writing backslashes", () => {
    const editor = createEditor("# doc_review_agent\n\nv260817_1\n");
    const markdown = getMarkdown(editor);

    expect(markdown).toContain("# doc_review_agent");
    expect(markdown).toContain("v260817_1");
    expect(markdown).not.toContain("\\_");
  });

  it("heals previously escaped identifier underscores on serialize", () => {
    const editor = createEditor("# doc\\_review\\_agent\n\nv260817\\_1\n");
    const markdown = getMarkdown(editor);

    expect(markdown).toContain("# doc_review_agent");
    expect(markdown).toContain("v260817_1");
    expect(markdown).not.toContain("\\_");
  });

  it("keeps italic marks as markdown emphasis rather than escaped underscores", () => {
    const editor = createEditor("before *italic* after\n");
    expect(getMarkdown(editor)).toMatch(/before \*italic\* after/);
  });
});
