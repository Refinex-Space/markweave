// @vitest-environment jsdom

import { Editor, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";

let activeEditors: Editor[] = [];

function createEditor(content: string, contentType: "html" | "markdown") {
  const editor = new Editor({
    extensions: createMarkweaveEditorExtensions(),
    content,
    contentType,
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

describe("lossless Markdown fallbacks", () => {
  it("uses native HTML only for alignments, colored marks, and merged tables", () => {
    const editor = createEditor(
      '<p>Plain Markdown</p><p>Colored <span style="color: #e11d48">red</span> <mark data-color="#fde68a" style="background-color: #fde68a; color: inherit">highlighted</mark></p><p style="text-align: center;">Aligned</p><table><tbody><tr><td colspan="2"><p>Merged</p></td></tr><tr><td><p>Left</p></td><td><p>Right</p></td></tr></tbody></table>',
      "html",
    );

    const markdown = getMarkdown(editor);

    expect(markdown).toContain("Plain Markdown");
    expect(markdown).toContain('<p style="text-align: center">Aligned</p>');
    expect(markdown).toContain('<span style="color: #e11d48">red</span>');
    expect(markdown).toContain('<mark data-color="#fde68a">highlighted</mark>');
    expect(markdown).toContain('<td colspan="2"><p>Merged</p></td>');

    const reloaded = createEditor(markdown, "markdown");
    const documentJson = reloaded.getJSON() as JSONContent;
    const coloredParagraph = documentJson.content?.find((node) => node.type === "paragraph" && node.content?.[0]?.text === "Colored ");
    const alignedParagraph = documentJson.content?.find((node) => node.type === "paragraph" && node.attrs?.textAlign === "center");
    const table = documentJson.content?.find((node) => node.type === "table");
    const mergedCell = table?.content?.[0]?.content?.[0];

    expect(coloredParagraph?.content?.[1]?.marks).toContainEqual({ type: "textStyle", attrs: { color: "#e11d48" } });
    expect(coloredParagraph?.content?.[3]?.marks).toContainEqual({ type: "highlight", attrs: { color: "#fde68a" } });
    expect(alignedParagraph?.content?.[0]?.text).toBe("Aligned");
    expect(mergedCell?.attrs).toMatchObject({ colspan: 2, rowspan: 1 });
  });

  it("does not create a trailing empty paragraph when callouts round-trip", () => {
    const editor = createEditor(":::info\nFirst\n\nSecond\n:::", "markdown");
    const reloaded = createEditor(getMarkdown(editor), "markdown");
    const callout = (reloaded.getJSON() as JSONContent).content?.find((node) => node.type === "markweaveCallout");

    expect(callout?.content).toHaveLength(2);
    expect(callout?.content?.map((node) => node.content?.[0]?.text)).toEqual(["First", "Second"]);
  });

  it("keeps unmerged tables in standard pipe-table Markdown", () => {
    const editor = createEditor("<table><tbody><tr><th><p>Name</p></th><th><p>Status</p></th></tr><tr><td><p>Markweave</p></td><td><p>Ready</p></td></tr></tbody></table>", "html");
    const markdown = getMarkdown(editor);

    expect(markdown).toContain("| Name");
    expect(markdown).not.toContain("<table>");
  });
});
