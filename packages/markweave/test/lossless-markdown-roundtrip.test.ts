// @vitest-environment jsdom

import { Editor, Node, type AnyExtension, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";

let activeEditors: Editor[] = [];

const TestHostField = Node.create({
  name: "testHostField",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      fieldCode: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-test-host-field") ?? "",
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-test-host-field]" }];
  },

  renderHTML({ node }) {
    const fieldCode = String(node.attrs.fieldCode ?? "");
    return ["span", { "data-test-host-field": fieldCode }, `{{${fieldCode}}}`];
  },

  renderMarkdown(node) {
    return `{{${String(node.attrs?.fieldCode ?? "")}}}`;
  },
});

function createEditor(
  content: string,
  contentType: "html" | "markdown",
  editorExtensions: readonly AnyExtension[] = [],
) {
  const editor = new Editor({
    extensions: createMarkweaveEditorExtensions({ editorExtensions }),
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
  it("preserves trusted host inline nodes in aligned blocks, colored marks, and merged tables", () => {
    const editor = createEditor(
      '<p style="text-align: center">Before <span data-test-host-field="invoice_no">{{invoice_no}}</span> after</p>' +
        '<h2 style="text-align: right">Title <span data-test-host-field="title_no">{{title_no}}</span></h2>' +
        '<p><span style="color: #e11d48"><span data-test-host-field="owner">{{owner}}</span></span></p>' +
        '<table><tbody><tr><td colspan="2"><p><span data-test-host-field="amount">{{amount}}</span></p></td></tr><tr><td><p>Left</p></td><td><p>Right</p></td></tr></tbody></table>',
      "html",
      [TestHostField],
    );

    const markdown = getMarkdown(editor);

    expect(markdown).toContain('data-test-host-field="invoice_no"');
    expect(markdown).toContain('data-test-host-field="title_no"');
    expect(markdown).toContain('data-test-host-field="owner"');
    expect(markdown).toContain('data-test-host-field="amount"');

    const reloaded = createEditor(markdown, "markdown", [TestHostField]);
    const hostFieldCodes: string[] = [];
    let ownerTextColor: unknown = null;
    reloaded.state.doc.descendants((node) => {
      if (node.type.name === "testHostField") {
        hostFieldCodes.push(String(node.attrs.fieldCode));
        if (node.attrs.fieldCode === "owner") {
          ownerTextColor = node.marks.find((mark) => mark.type.name === "textStyle")?.attrs.color;
        }
      }
    });

    expect(hostFieldCodes).toEqual(["invoice_no", "title_no", "owner", "amount"]);
    expect(ownerTextColor).toBe("rgb(225, 29, 72)");
  });

  it("round-trips subscript, superscript, and paragraph or heading indentation", () => {
    const editor = createEditor(
      '<p>H<sub>2</sub>O and x<sup>2</sup></p>' +
        '<p data-markweave-indent-level="2">Indented paragraph</p>' +
        '<h3 data-markweave-indent-level="1">Indented heading</h3>',
      "html",
    );

    const markdown = getMarkdown(editor);

    expect(markdown).toContain("H<sub>2</sub>O and x<sup>2</sup>");
    expect(markdown).toContain('<p data-markweave-indent-level="2">Indented paragraph</p>');
    expect(markdown).toContain('<h3 data-markweave-indent-level="1">Indented heading</h3>');

    const reloaded = createEditor(markdown, "markdown");
    const documentJson = reloaded.getJSON() as JSONContent;
    const formulaParagraph = documentJson.content?.[0];
    const indentedParagraph = documentJson.content?.[1];
    const indentedHeading = documentJson.content?.[2];

    expect(formulaParagraph?.content?.some((node) => node.marks?.some((mark) => mark.type === "subscript"))).toBe(true);
    expect(formulaParagraph?.content?.some((node) => node.marks?.some((mark) => mark.type === "superscript"))).toBe(true);
    expect(indentedParagraph?.attrs?.markweaveIndentLevel).toBe(2);
    expect(indentedHeading?.attrs?.markweaveIndentLevel).toBe(1);
  });

  it("uses native HTML only for alignments, colored marks, and merged tables", () => {
    const editor = createEditor(
      '<p>Plain Markdown</p><p>Colored <span style="color: #e11d48">red</span> <mark data-color="#fde68a" style="background-color: #fde68a; color: inherit">highlighted</mark></p><p style="text-align: center;">Aligned</p><table><tbody><tr><td colspan="2"><p>Merged</p></td></tr><tr><td><p>Left</p></td><td><p>Right</p></td></tr></tbody></table>',
      "html",
    );

    const markdown = getMarkdown(editor);

    expect(markdown).toContain("Plain Markdown");
    expect(markdown).toMatch(/<p style="text-align: center;?">Aligned<\/p>/);
    expect(markdown).toContain('<span style="color: #e11d48">red</span>');
    expect(markdown).toContain('<mark data-color="#fde68a">highlighted</mark>');
    expect(markdown).toMatch(/<td colspan="2"(?: rowspan="1")?><p>Merged<\/p><\/td>/);

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

  it("round-trips styled table cells through the HTML fallback", () => {
    const editor = createEditor(
      '<table><tbody><tr><th style="color: #327da9; background-color: #fef9c3; text-align: center; vertical-align: top"><p>Name</p></th></tr><tr><td><p>Markweave</p></td></tr></tbody></table>',
      "html",
    );
    const markdown = getMarkdown(editor);

    expect(markdown).toContain("<th");
    expect(markdown).toContain("color: rgb(50, 125, 169)");
    expect(markdown).toContain("background-color: rgb(254, 249, 195)");
    expect(markdown).toContain("text-align: center");
    expect(markdown).toContain("vertical-align: top");

    const reloaded = createEditor(markdown, "markdown");
    const cell = (reloaded.getJSON() as JSONContent).content?.find((node) => node.type === "table")?.content?.[0]?.content?.[0];
    expect(cell?.attrs).toMatchObject({
      textColor: "rgb(50, 125, 169)",
      backgroundColor: "rgb(254, 249, 195)",
      textAlign: "center",
      verticalAlign: "top",
    });
  });
});
