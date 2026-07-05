// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { isEditorComposing } from "../src/editor-core/composition-guard";
import { normalizeMarkdownDocLinkHref, normalizeMarkdownImageSrc } from "../src/plugins/markdown/markdown-input";

let activeEditor: Editor | null = null;

function createEditor(content = "<p></p>") {
  const element = document.createElement("div");
  document.body.appendChild(element);

  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions(),
    content,
  });

  return activeEditor;
}

function dispatchTextInput(editor: Editor, text: string) {
  const { from, to } = editor.state.selection;
  let handled = false;

  editor.view.someProp("handleTextInput", (handler) => {
    const didHandle = handler(editor.view, from, to, text, () => editor.state.tr) === true;
    handled = handled || didHandle;
    return didHandle;
  });

  return handled;
}

function dispatchCompositionEvent(editor: Editor, type: "compositionstart" | "compositionupdate" | "compositionend") {
  return editor.view.dom.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
}

function typeText(editor: Editor, text: string) {
  const handled = dispatchTextInput(editor, text);

  if (!handled) {
    editor.view.dispatch(editor.state.tr.insertText(text));
  }
}

function disposeActiveEditor() {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
}

function topLevelNodeNames(editor: Editor) {
  const names: string[] = [];
  editor.state.doc.forEach((node) => names.push(node.type.name));
  return names;
}

function firstNodeName(editor: Editor) {
  return editor.state.doc.firstChild?.type.name;
}

function firstNodeAttrs(editor: Editor) {
  return editor.state.doc.firstChild?.attrs ?? {};
}

function firstImageAttrs(editor: Editor) {
  let attrs: Record<string, unknown> | null = null;

  editor.state.doc.descendants((node) => {
    if (node.type.name !== "image") {
      return true;
    }

    attrs = node.attrs;
    return false;
  });

  return attrs;
}

function markAttrsForText(editor: Editor, text: string, markName: string) {
  let attrs: Record<string, unknown> | null = null;

  editor.state.doc.descendants((node) => {
    if (!node.isText || node.text !== text) {
      return true;
    }

    const mark = node.marks.find((candidate) => candidate.type.name === markName);
    attrs = mark?.attrs ?? null;
    return false;
  });

  return attrs;
}

function textSegments(editor: Editor) {
  const segments: Array<{ marks: string[]; text: string }> = [];

  editor.state.doc.descendants((node) => {
    if (!node.isText || !node.text) {
      return true;
    }

    segments.push({
      text: node.text,
      marks: node.marks.map((mark) => mark.type.name).sort(),
    });
    return true;
  });

  return segments;
}

function firstTaskItemChecked(editor: Editor) {
  let checked: boolean | null = null;

  editor.state.doc.descendants((node) => {
    if (node.type.name !== "taskItem") {
      return true;
    }

    checked = node.attrs.checked as boolean;
    return false;
  });

  return checked;
}

function placeCursorInText(editor: Editor, text: string) {
  let position: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return true;
    }

    const offset = node.text.indexOf(text);
    if (offset < 0) {
      return true;
    }

    position = pos + offset + text.length;
    return false;
  });

  if (position === null) {
    throw new Error(`Expected text "${text}" in the editor fixture.`);
  }

  expect(editor.commands.setTextSelection(position)).toBe(true);
}

afterEach(() => {
  disposeActiveEditor();
});

describe("markdown WYSIWYG input rules", () => {
  it("converts heading markers into heading nodes", () => {
    const heading1 = createEditor();
    expect(dispatchTextInput(heading1, "# ")).toBe(true);
    expect(firstNodeName(heading1)).toBe("heading");
    expect(topLevelNodeNames(heading1)).toContain("heading");
    expect(firstNodeAttrs(heading1)).toMatchObject({ level: 1 });
    heading1.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const heading2 = createEditor();
    expect(dispatchTextInput(heading2, "## ")).toBe(true);
    expect(firstNodeName(heading2)).toBe("heading");
    expect(topLevelNodeNames(heading2)).toContain("heading");
    expect(firstNodeAttrs(heading2)).toMatchObject({ level: 2 });
  });

  it("converts quote markers into blockquote nodes", () => {
    const editor = createEditor();

    expect(dispatchTextInput(editor, "> ")).toBe(true);

    expect(firstNodeName(editor)).toBe("blockquote");
    expect(topLevelNodeNames(editor)).toContain("blockquote");
  });

  it("converts unordered list markers into bullet list nodes", () => {
    const editor = createEditor();

    expect(dispatchTextInput(editor, "- ")).toBe(true);

    expect(firstNodeName(editor)).toBe("bulletList");
    expect(topLevelNodeNames(editor)).toContain("bulletList");
  });

  it("converts ordered list markers into ordered list nodes", () => {
    const editor = createEditor();

    expect(dispatchTextInput(editor, "1. ")).toBe(true);

    expect(firstNodeName(editor)).toBe("orderedList");
    expect(topLevelNodeNames(editor)).toContain("orderedList");
  });

  it("converts inline markdown marks into rich marks", () => {
    const bold = createEditor("<p>**bold*</p>");
    placeCursorInText(bold, "**bold*");
    expect(dispatchTextInput(bold, "*")).toBe(true);
    expect(markAttrsForText(bold, "bold", "bold")).toEqual({});
    bold.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const italic = createEditor("<p>*em</p>");
    placeCursorInText(italic, "*em");
    expect(dispatchTextInput(italic, "*")).toBe(true);
    expect(markAttrsForText(italic, "em", "italic")).toEqual({});
    italic.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const inlineCode = createEditor("<p>`code</p>");
    placeCursorInText(inlineCode, "`code");
    expect(dispatchTextInput(inlineCode, "`")).toBe(true);
    expect(markAttrsForText(inlineCode, "code", "code")).toEqual({});
    inlineCode.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const strike = createEditor("<p>~~gone~</p>");
    placeCursorInText(strike, "~~gone~");
    expect(dispatchTextInput(strike, "~")).toBe(true);
    expect(markAttrsForText(strike, "gone", "strike")).toEqual({});
  });

  it("converts divider and task-list markdown into block nodes", () => {
    const divider = createEditor("<p>--</p>");
    placeCursorInText(divider, "--");
    expect(dispatchTextInput(divider, "-")).toBe(true);
    expect(firstNodeName(divider)).toBe("horizontalRule");
    divider.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const uncheckedTask = createEditor("<p>[ ]</p>");
    placeCursorInText(uncheckedTask, "[ ]");
    expect(dispatchTextInput(uncheckedTask, " ")).toBe(true);
    expect(firstNodeName(uncheckedTask)).toBe("taskList");
    expect(firstTaskItemChecked(uncheckedTask)).toBe(false);
    uncheckedTask.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const checkedTask = createEditor("<p>[x]</p>");
    placeCursorInText(checkedTask, "[x]");
    expect(dispatchTextInput(checkedTask, " ")).toBe(true);
    expect(firstNodeName(checkedTask)).toBe("taskList");
    expect(firstTaskItemChecked(checkedTask)).toBe(true);
  });

  it("preserves history undo and redo for block markdown shortcuts", () => {
    const blockCases: Array<{
      readonly name: string;
      readonly content: string;
      readonly cursorText?: string;
      readonly input: string;
      readonly nodeName: string;
      readonly restoredText: string;
    }> = [
      { name: "heading", content: "<p>#</p>", cursorText: "#", input: " ", nodeName: "heading", restoredText: "#" },
      { name: "blockquote", content: "<p>></p>", cursorText: ">", input: " ", nodeName: "blockquote", restoredText: ">" },
      { name: "bullet list", content: "<p>-</p>", cursorText: "-", input: " ", nodeName: "bulletList", restoredText: "-" },
      { name: "ordered list", content: "<p>1.</p>", cursorText: "1.", input: " ", nodeName: "orderedList", restoredText: "1." },
      { name: "divider", content: "<p>--</p>", cursorText: "--", input: "-", nodeName: "horizontalRule", restoredText: "--" },
      { name: "unchecked task list", content: "<p>[ ]</p>", cursorText: "[ ]", input: " ", nodeName: "taskList", restoredText: "[ ]" },
      { name: "checked task list", content: "<p>[x]</p>", cursorText: "[x]", input: " ", nodeName: "taskList", restoredText: "[x]" },
    ];

    for (const blockCase of blockCases) {
      const editor = createEditor(blockCase.content);

      if (blockCase.cursorText) {
        placeCursorInText(editor, blockCase.cursorText);
      }

      expect(dispatchTextInput(editor, blockCase.input), blockCase.name).toBe(true);
      expect(firstNodeName(editor), blockCase.name).toBe(blockCase.nodeName);
      expect(editor.commands.undo(), blockCase.name).toBe(true);
      expect(editor.getText(), blockCase.name).toBe(blockCase.restoredText);
      expect(editor.commands.redo(), blockCase.name).toBe(true);
      expect(firstNodeName(editor), blockCase.name).toBe(blockCase.nodeName);

      disposeActiveEditor();
    }
  });

  it("converts markdown links and preserves input-rule undo", () => {
    const editor = createEditor("<p>[OpenAI](https://openai.com</p>");
    placeCursorInText(editor, "[OpenAI](https://openai.com");

    expect(dispatchTextInput(editor, ")")).toBe(true);

    expect(editor.getText()).toBe("OpenAI");
    expect(markAttrsForText(editor, "OpenAI", "link")).toMatchObject({ href: "https://openai.com" });

    expect(editor.commands.undoInputRule()).toBe(true);
    expect(editor.getText()).toBe("[OpenAI](https://openai.com)");
  });

  it("converts markdown doc links and aliases into internal link marks", () => {
    const docLink = createEditor("<p>[[AgentScope 介绍]</p>");
    placeCursorInText(docLink, "[[AgentScope 介绍]");

    expect(dispatchTextInput(docLink, "]")).toBe(true);

    expect(docLink.getText()).toBe("AgentScope 介绍");
    expect(markAttrsForText(docLink, "AgentScope 介绍", "link")).toMatchObject({
      href: "markweave://doc/AgentScope%20%E4%BB%8B%E7%BB%8D",
    });
    expect(docLink.getHTML()).toContain('href="markweave://doc/AgentScope%20%E4%BB%8B%E7%BB%8D"');

    expect(docLink.commands.undoInputRule()).toBe(true);
    expect(docLink.getText()).toBe("[[AgentScope 介绍]]");
    docLink.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const aliasedDocLink = createEditor("<p>[[01_AgentScope 介绍|AgentScope]</p>");
    placeCursorInText(aliasedDocLink, "[[01_AgentScope 介绍|AgentScope]");

    expect(dispatchTextInput(aliasedDocLink, "]")).toBe(true);

    expect(aliasedDocLink.getText()).toBe("AgentScope");
    expect(markAttrsForText(aliasedDocLink, "AgentScope", "link")).toMatchObject({
      href: "markweave://doc/01_AgentScope%20%E4%BB%8B%E7%BB%8D",
    });
    expect(aliasedDocLink.getHTML()).toContain('href="markweave://doc/01_AgentScope%20%E4%BB%8B%E7%BB%8D"');
    expect(normalizeMarkdownDocLinkHref("  ")).toBeNull();
  });

  it("defers custom markdown link, doc-link, and image input rules while IME composition is active", () => {
    const link = createEditor("<p>[OpenAI](https://openai.com</p>");
    placeCursorInText(link, "[OpenAI](https://openai.com");

    expect(dispatchCompositionEvent(link, "compositionstart")).toBe(true);
    expect(isEditorComposing(link.state)).toBe(true);
    expect(dispatchTextInput(link, ")")).toBe(false);
    expect(link.getText()).toBe("[OpenAI](https://openai.com");
    expect(markAttrsForText(link, "[OpenAI](https://openai.com", "link")).toBeNull();

    expect(dispatchCompositionEvent(link, "compositionend")).toBe(true);
    expect(isEditorComposing(link.state)).toBe(false);
    expect(dispatchTextInput(link, ")")).toBe(true);
    expect(link.getText()).toBe("OpenAI");
    expect(markAttrsForText(link, "OpenAI", "link")).toMatchObject({ href: "https://openai.com" });
    link.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const docLink = createEditor("<p>[[AgentScope 介绍]</p>");
    placeCursorInText(docLink, "[[AgentScope 介绍]");

    expect(dispatchCompositionEvent(docLink, "compositionstart")).toBe(true);
    expect(dispatchTextInput(docLink, "]")).toBe(false);
    expect(docLink.getText()).toBe("[[AgentScope 介绍]");
    expect(markAttrsForText(docLink, "[[AgentScope 介绍]", "link")).toBeNull();

    expect(dispatchCompositionEvent(docLink, "compositionend")).toBe(true);
    expect(dispatchTextInput(docLink, "]")).toBe(true);
    expect(docLink.getText()).toBe("AgentScope 介绍");
    expect(markAttrsForText(docLink, "AgentScope 介绍", "link")).toMatchObject({
      href: "markweave://doc/AgentScope%20%E4%BB%8B%E7%BB%8D",
    });
    docLink.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const image = createEditor("<p>![Logo](https://example.com/logo.png</p>");
    placeCursorInText(image, "![Logo](https://example.com/logo.png");

    expect(dispatchCompositionEvent(image, "compositionstart")).toBe(true);
    expect(dispatchTextInput(image, ")")).toBe(false);
    expect(firstImageAttrs(image)).toBeNull();

    expect(dispatchCompositionEvent(image, "compositionend")).toBe(true);
    expect(dispatchTextInput(image, ")")).toBe(true);
    expect(firstImageAttrs(image)).toMatchObject({
      src: "https://example.com/logo.png",
      alt: "Logo",
    });
  });

  it("keeps text typed after inline code and link boundaries outside the ending mark", () => {
    const inlineCode = createEditor("<p><code>code</code></p>");
    placeCursorInText(inlineCode, "code");
    typeText(inlineCode, " plain");

    expect(inlineCode.getText()).toBe("code plain");
    expect(textSegments(inlineCode)).toEqual([
      { text: "code", marks: ["code"] },
      { text: " plain", marks: [] },
    ]);
    inlineCode.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const link = createEditor('<p><a href="https://example.com">OpenAI</a></p>');
    placeCursorInText(link, "OpenAI");
    typeText(link, " plain");

    expect(link.getText()).toBe("OpenAI plain");
    expect(textSegments(link)).toEqual([
      { text: "OpenAI", marks: ["link"] },
      { text: " plain", marks: [] },
    ]);
  });

  it("does not let the mark-boundary helper intercept text while IME composition is active", () => {
    const inlineCode = createEditor("<p><code>code</code></p>");
    placeCursorInText(inlineCode, "code");

    expect(dispatchCompositionEvent(inlineCode, "compositionstart")).toBe(true);
    expect(isEditorComposing(inlineCode.state)).toBe(true);
    expect(dispatchTextInput(inlineCode, " plain")).toBe(false);
    expect(inlineCode.getText()).toBe("code");

    expect(dispatchCompositionEvent(inlineCode, "compositionend")).toBe(true);
    typeText(inlineCode, " plain");
    expect(textSegments(inlineCode)).toEqual([
      { text: "code", marks: ["code"] },
      { text: " plain", marks: [] },
    ]);
    inlineCode.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const link = createEditor('<p><a href="https://example.com">OpenAI</a></p>');
    placeCursorInText(link, "OpenAI");

    expect(dispatchCompositionEvent(link, "compositionstart")).toBe(true);
    expect(dispatchTextInput(link, " plain")).toBe(false);
    expect(link.getText()).toBe("OpenAI");

    expect(dispatchCompositionEvent(link, "compositionend")).toBe(true);
    typeText(link, " plain");
    expect(textSegments(link)).toEqual([
      { text: "OpenAI", marks: ["link"] },
      { text: " plain", marks: [] },
    ]);
  });

  it("preserves inline code and link marks when typing inside the marked text", () => {
    const inlineCode = createEditor("<p><code>code</code></p>");
    placeCursorInText(inlineCode, "co");
    typeText(inlineCode, "X");

    expect(inlineCode.getText()).toBe("coXde");
    expect(textSegments(inlineCode)).toEqual([{ text: "coXde", marks: ["code"] }]);
    inlineCode.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const link = createEditor('<p><a href="https://example.com">OpenAI</a></p>');
    placeCursorInText(link, "Open");
    typeText(link, "X");

    expect(link.getText()).toBe("OpenXAI");
    expect(textSegments(link)).toEqual([{ text: "OpenXAI", marks: ["link"] }]);
  });

  it("does not convert unsafe markdown link protocols", () => {
    const editor = createEditor("<p>[Bad](javascript:alert(1</p>");
    placeCursorInText(editor, "[Bad](javascript:alert(1");

    expect(dispatchTextInput(editor, ")")).toBe(false);
    expect(markAttrsForText(editor, "[Bad](javascript:alert(1", "link")).toBeNull();
  });

  it("converts markdown images into image nodes", () => {
    const editor = createEditor("<p>![Logo](https://example.com/logo.png</p>");
    placeCursorInText(editor, "![Logo](https://example.com/logo.png");

    expect(dispatchTextInput(editor, ")")).toBe(true);

    expect(topLevelNodeNames(editor)).toContain("image");
    expect(firstImageAttrs(editor)).toMatchObject({
      src: "https://example.com/logo.png",
      alt: "Logo",
    });
  });

  it("preserves history undo and redo for markdown image conversion", () => {
    const editor = createEditor("<p>![Logo](https://example.com/logo.png</p>");
    placeCursorInText(editor, "![Logo](https://example.com/logo.png");

    expect(dispatchTextInput(editor, ")")).toBe(true);
    expect(firstImageAttrs(editor)).toMatchObject({
      src: "https://example.com/logo.png",
      alt: "Logo",
    });

    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("![Logo](https://example.com/logo.png");
    expect(firstImageAttrs(editor)).toBeNull();

    expect(editor.commands.redo()).toBe(true);
    expect(firstImageAttrs(editor)).toMatchObject({
      src: "https://example.com/logo.png",
      alt: "Logo",
    });
  });

  it("does not convert unsafe markdown image protocols", () => {
    const editor = createEditor("<p>![Bad](data:image/png;base64,abc</p>");
    placeCursorInText(editor, "![Bad](data:image/png;base64,abc");

    expect(dispatchTextInput(editor, ")")).toBe(false);
    expect(firstImageAttrs(editor)).toBeNull();
    expect(normalizeMarkdownImageSrc("javascript:alert(1)")).toBeNull();
    expect(normalizeMarkdownImageSrc("data:image/png;base64,abc")).toBeNull();
  });
});
