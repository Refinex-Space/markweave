// @vitest-environment jsdom
import { Editor, type JSONContent, type MarkdownToken } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { createCheckedMarkweaveMarkdownDocument, parseMarkweaveDocument } from "../src/editor-core/document-load";
import { parseLocalDocumentLink } from "../src/plugins/markdown/local-document-link";
import { markweaveMarkdownParserWorkerSource } from "../src/editor-core/markdown-parser-worker-source.generated";

const editors: Editor[] = [];
function createEditor(content: string) {
  const editor = new Editor({ extensions: createMarkweaveEditorExtensions(), content, contentType: "markdown" });
  editors.push(editor);
  return editor;
}
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));

const target = "01 开始使用/建立第一个工作区.md";
const label = "建立第一个工作区";

describe("local Markdown links with spaces", () => {
  it.each([
    ["paragraph", `阅读[${label}](${target})，继续整理。`],
    ["ordered list", `1. 阅读[${label}](${target})，理解文档。`],
    ["bullet list", `- 阅读[${label}](${target})，理解文档。`],
    ["task list", `- [ ] 阅读[${label}](${target})，理解文档。`],
    ["table", `| 文档 |\n| --- |\n| 阅读[${label}](${target}) |`],
    ["heading", `## 阅读[${label}](${target})`],
    ["blockquote", `> 阅读[${label}](${target})，理解文档。`],
  ])("renders links inside a %s without a host preprocessor", (_name, markdown) => {
    const editor = createEditor(markdown);
    const link = editor.view.dom.querySelector("a");
    expect(link?.textContent).toBe(label);
    expect(link?.getAttribute("href")).toBe(target.replaceAll(" ", "%20"));
    expect(editor.getText()).not.toContain("](");
    const roundtrip = parseMarkweaveDocument(editor, editor.getMarkdown(), "markdown");
    expect(roundtrip.toJSON()).toEqual(editor.getJSON());
  });
  it("keeps Worker and main-thread tokenization identical", () => {
    const markdown = `1. 阅读[${label}](${target})。\n\n- [ ] 查看[第二篇](02 捕获/Inbox 与 Daily.mdx#今日 计划)。`;
    const editor = createEditor(markdown);
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
    expect(createCheckedMarkweaveMarkdownDocument(editor, parsed).toJSON()).toEqual(editor.getJSON());
  });

  it("preserves adjacent formatted labels, balanced paths, anchors and optional titles", () => {
    const editor = createEditor('阅读[**工作区**](01 开始/文档(初稿).md#第一 节 "说明")和[第二篇](./02 捕获/Daily.md)。');
    const links = editor.view.dom.querySelectorAll("a");
    expect(links).toHaveLength(2);
    expect(links[0]?.querySelector("strong")?.textContent).toBe("工作区");
    expect(links[0]?.getAttribute("href")).toBe("01%20开始/文档%28初稿%29.md#第一%20节");
    expect(links[0]?.getAttribute("title")).toBe("说明");
    expect(parseMarkweaveDocument(editor, editor.getMarkdown(), "markdown").toJSON()).toEqual(editor.getJSON());
  });

  it.each([
    ['[标准](guide.md "说明")', 'guide.md'],
    ['[编码](01%20开始/指南.md)', '01%20开始/指南.md'],
    ['[尖括号](<01 开始/指南.md>)', '01 开始/指南.md'],
    ['[外部](https://example.com/guide)', 'https://example.com/guide'],
  ])("preserves the standard syntax %s", (markdown, href) => {
    expect(createEditor(markdown).view.dom.querySelector("a")?.getAttribute("href")).toBe(href);
  });

  it.each([
    '`[示例](01 开始/文档.md)`',
    '```md\n[示例](01 开始/文档.md)\n```',
    String.raw`\[示例](01 开始/文档.md)`,
    '![图片](01 开始/文档.md)',
    '[危险](javascript:evil path.md)',
    String.raw`[危险](javascript\:evil path.md)`,
    '[远程](//example.com/space path.md)',
    '[断行](01 开始/\n文档.md)',
    '[缺括号](01 开始/文档.md',
  ])("does not reinterpret literal or unsafe input %s", (markdown) => {
    expect(createEditor(markdown).view.dom.querySelector("a")).toBeNull();
  });

  it("bounds compatibility scanning and leaves standard destinations to CommonMark", () => {
    expect(parseLocalDocumentLink(`[${"x".repeat(9000)}](01 开始/文档.md)`)).toBeNull();
    expect(parseLocalDocumentLink('[普通](guide.md "title")')).toBeNull();
    expect(parseLocalDocumentLink('[普通](https://example.com/path with spaces.md)')).toBeNull();
  });

});
