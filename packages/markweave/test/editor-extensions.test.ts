// @vitest-environment jsdom

import { Editor, Node, type MarkdownToken } from "@tiptap/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { createMarkweaveReactEditorExtensions } from "../../markweave-react/src/create-editor-extensions";
import { createMarkweaveVue3EditorExtensions } from "../../markweave-vue3/src/create-editor-extensions";
import { setMarkweaveEditorModeState } from "../src/core/editor-mode-state";

const HostInlineToken = Node.create({
  name: "hostInlineToken",
  markdownTokenName: "hostInlineToken",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return { label: { default: "", parseHTML: (element) => element.getAttribute("data-label") } };
  },

  parseHTML() {
    return [{ tag: "span[data-host-inline-token]" }];
  },

  renderHTML({ node }) {
    return ["span", { "data-host-inline-token": "true", "data-label": node.attrs.label }, node.attrs.label];
  },

  markdownTokenizer: {
    name: "hostInlineToken",
    level: "inline",
    start: (src: string) => src.indexOf("%%token:"),
    tokenize: (src: string) => {
      const match = src.match(/^%%token:([^%]+)%%/);
      return match ? { type: "hostInlineToken", raw: match[0], label: match[1] } : undefined;
    },
  },

  parseMarkdown(token: MarkdownToken, helpers) {
    return helpers.createNode("hostInlineToken", { label: token.label });
  },

  renderMarkdown(node) {
    return `%%token:${node.attrs?.label ?? ""}%%`;
  },
});

const HostBlock = Node.create({
  name: "hostBlock",
  markdownTokenName: "hostBlock",
  group: "block",
  content: "block+",

  addAttributes() {
    return { kind: { default: "note", parseHTML: (element) => element.getAttribute("data-kind") } };
  },

  parseHTML() {
    return [{ tag: "section[data-host-block]" }];
  },

  renderHTML({ node }) {
    return ["section", { "data-host-block": "true", "data-kind": node.attrs.kind }, 0];
  },

  markdownTokenizer: {
    name: "hostBlock",
    level: "block",
    start: (src: string) => src.search(/^:::host\b/m),
    tokenize: (src: string, _tokens: MarkdownToken[], lexer) => {
      const match = src.match(/^:::host\s+([a-z-]+)\s*\n([\s\S]*?)\n:::/);
      return match ? {
        type: "hostBlock",
        raw: match[0],
        kind: match[1],
        tokens: lexer.blockTokens(match[2] ?? ""),
      } : undefined;
    },
  },

  parseMarkdown(token: MarkdownToken, helpers) {
    return helpers.createNode(
      "hostBlock",
      { kind: token.kind },
      helpers.parseBlockChildren?.(token.tokens ?? []) ?? helpers.parseChildren(token.tokens ?? []),
    );
  },

  renderMarkdown(node, helpers) {
    return `:::host ${node.attrs?.kind ?? "note"}\n${helpers.renderChildren(node.content ?? [], "\n\n").trim()}\n:::`;
  },
});

const activeEditors: Editor[] = [];

function createEditor(extensions = createMarkweaveEditorExtensions({ editorExtensions: [HostInlineToken, HostBlock] })) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({ element, extensions, content: "", contentType: "markdown" });
  activeEditors.push(editor);
  return editor;
}

afterEach(() => {
  activeEditors.splice(0).forEach((editor) => editor.destroy());
  document.body.innerHTML = "";
});

describe("advanced editorExtensions boundary", () => {
  it("round-trips custom inline and block nodes through Markdown, HTML, and JSON", () => {
    const editor = createEditor();
    editor.commands.setContent("Before %%token:approved%%.\n\n:::host warning\nHost content\n:::", { contentType: "markdown" });

    const json = editor.getJSON();
    expect(JSON.stringify(json)).toContain("hostInlineToken");
    expect(JSON.stringify(json)).toContain("hostBlock");
    expect(editor.getMarkdown()).toContain("%%token:approved%%");
    expect(editor.getMarkdown()).toContain(":::host warning");
    expect(editor.getHTML()).toContain("data-host-inline-token");
    expect(editor.getHTML()).toContain("data-host-block");

    editor.commands.setContent(editor.getHTML());
    expect(JSON.stringify(editor.getJSON())).toContain("hostInlineToken");
    editor.commands.setContent(json);
    expect(editor.getMarkdown()).toContain("Host content");

    setMarkweaveEditorModeState(editor, { mode: "view", editable: false });
    editor.setEditable(false);
    expect(editor.getHTML()).toContain("data-host-block");
  });

  it("passes custom extensions through the runtime-compatible framework factories", () => {
    const factories = [
      createMarkweaveReactEditorExtensions,
      createMarkweaveVue3EditorExtensions,
    ];
    for (const factory of factories) {
      const editor = createEditor(factory({ editorExtensions: [HostInlineToken, HostBlock] }));
      editor.commands.setContent("%%token:adapter%%", { contentType: "markdown" });
      expect(editor.getMarkdown()).toContain("%%token:adapter%%");
    }
  });

  it("keeps editorExtensions wired through the Vue 2 factory verified by its Webpack build", () => {
    const source = readFileSync(resolve(process.cwd(), "packages/markweave-vue2/src/create-editor-extensions.ts"), "utf8");
    expect(source).toContain("editorExtensions?: readonly AnyExtension[]");
    expect(source).toContain("editorExtensions: options.editorExtensions");
  });

  it("rejects host collisions with builtins, StarterKit children, and other host extensions before editor creation", () => {
    expect(() => createMarkweaveEditorExtensions({ editorExtensions: [Node.create({ name: "paragraph" })] }))
      .toThrow("paragraph");
    expect(() => createMarkweaveEditorExtensions({ editorExtensions: [HostBlock, HostBlock] }))
      .toThrow("hostBlock");
  });
});
