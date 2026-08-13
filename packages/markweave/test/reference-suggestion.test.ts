// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import {
  DEFAULT_MARKWEAVE_REFERENCE_TRIGGER,
  insertMarkweaveReferenceLink,
  markweaveReferenceSuggestionPluginKey,
  type MarkweaveReferenceItem,
  type MarkweaveReferenceSuggestionConfig,
} from "../src/plugins/reference/reference-suggestion";

let activeEditor: Editor | null = null;

function createEditor(options: {
  content?: string;
  referenceSuggestion?: MarkweaveReferenceSuggestionConfig | null;
} = {}) {
  const element = document.createElement("div");
  document.body.appendChild(element);

  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions({
      referenceSuggestion: options.referenceSuggestion ?? null,
    }),
    content: options.content ?? "<p></p>",
  });

  return activeEditor;
}

function markAttrsForText(editor: Editor, text: string, markName: string) {
  let attrs: Record<string, unknown> | null = null;

  editor.state.doc.descendants((node) => {
    if (attrs || !node.isText || node.text !== text) {
      return;
    }

    const mark = node.marks.find((candidate) => candidate.type.name === markName);
    if (mark) {
      attrs = mark.attrs;
    }
  });

  return attrs;
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("markweave reference suggestion", () => {
  it("registers no suggestion plugin when host config is absent", () => {
    const editor = createEditor();

    expect(
      markweaveReferenceSuggestionPluginKey.getState(editor.state),
    ).toBeUndefined();
  });

  it("registers the suggestion plugin when host config is provided", () => {
    const editor = createEditor({
      referenceSuggestion: {
        items: () => [],
      },
    });

    expect(
      markweaveReferenceSuggestionPluginKey.getState(editor.state),
    ).toBeDefined();
  });

  it("defaults the trigger to the wiki-style double bracket", () => {
    expect(DEFAULT_MARKWEAVE_REFERENCE_TRIGGER).toBe("[[");
  });

  it("inserts a selected item as a plain Markdown link and clears the stored mark", () => {
    const editor = createEditor({ content: "<p></p>" });

    const item: MarkweaveReferenceItem = {
      href: "notes/agentscope.md",
      label: "AgentScope 介绍",
    };

    editor.commands.setTextSelection({ from: 1, to: 1 });

    expect(insertMarkweaveReferenceLink(editor, { from: 1, to: 1 }, item)).toBe(
      true,
    );

    expect(editor.getText()).toBe("AgentScope 介绍");
    expect(markAttrsForText(editor, "AgentScope 介绍", "link")).toMatchObject({
      href: "notes/agentscope.md",
    });

    const paragraph = editor.state.doc.firstChild;
    expect(paragraph?.childCount).toBe(1);

    editor.commands.insertContent("X");
    expect(markAttrsForText(editor, "X", "link")).toBeNull();
  });

  it("prefers an explicit title over the label when inserting", () => {
    const editor = createEditor();

    const item: MarkweaveReferenceItem = {
      href: "notes/agentscope.md",
      label: "AgentScope 介绍",
      title: "AgentScope",
    };

    insertMarkweaveReferenceLink(editor, { from: 1, to: 1 }, item);

    expect(editor.getText()).toBe("AgentScope");
    expect(markAttrsForText(editor, "AgentScope", "link")).toMatchObject({
      href: "notes/agentscope.md",
    });
  });

  it("rejects insertion when the href is blank", () => {
    const editor = createEditor();

    expect(
      insertMarkweaveReferenceLink(
        editor,
        { from: 1, to: 1 },
        { href: "   ", label: "Broken" },
      ),
    ).toBe(false);
    expect(editor.getText()).toBe("");
  });

  it("builds the plugin with a host command override and custom trigger", () => {
    const editor = createEditor({
      referenceSuggestion: {
        char: "@",
        items: () => [],
        command: () => {},
      },
    });

    expect(
      markweaveReferenceSuggestionPluginKey.getState(editor.state),
    ).toBeDefined();
  });
});
