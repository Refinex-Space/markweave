// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import {
  calculateFloatingToolbarFrameShift,
  createSelectionSnapshot,
  getFloatingToolbarState,
  shouldShowFloatingToolbar,
} from "../src/editor-core/selection-state";
import {
  applyFloatingToolbarLink,
  createFloatingToolbarAssistantRequest,
  floatingToolbarHighlightColorOptions,
  floatingToolbarMoreActions,
  floatingToolbarTextColorOptions,
  floatingToolbarTurnIntoOptions,
  getCurrentFloatingToolbarBlockType,
  getFloatingToolbarLinkHref,
  getFloatingToolbarButtonModels,
  getFloatingToolbarTooltipModel,
  insertFloatingToolbarInlineMath,
  openFloatingToolbarLinkHref,
  preventFloatingToolbarPointerFocusLoss,
  removeFloatingToolbarLink,
  runFloatingToolbarMoreAction,
  setFloatingToolbarBlockType,
  setFloatingToolbarHighlightColor,
  setFloatingToolbarTextAlign,
  setFloatingToolbarTextColor,
  setFloatingToolbarTurnInto,
} from "../src/ui/floating-toolbar/FloatingToolbar";

let activeEditor: Editor | null = null;

function createEditor(content: string) {
  const element = document.createElement("div");
  document.body.appendChild(element);

  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions(),
    content,
  });

  return activeEditor;
}

function textPosition(editor: Editor, text: string, boundary: "start" | "end" = "end") {
  let position: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return true;
    }

    const offset = node.text.indexOf(text);
    if (offset < 0) {
      return true;
    }

    position = pos + offset + (boundary === "end" ? text.length : 0);
    return false;
  });

  if (position === null) {
    throw new Error(`Expected text "${text}".`);
  }

  return position;
}

function selectText(editor: Editor, text: string) {
  expect(editor.commands.setTextSelection({ from: textPosition(editor, text, "start"), to: textPosition(editor, text, "end") })).toBe(true);
}

function tableCellPositions(editor: Editor) {
  const positions: number[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      positions.push(pos);
      return false;
    }

    return true;
  });

  return positions;
}

function activeButtonIds(editor: Editor, variant: "default" | "table-compact" | "hidden") {
  return getFloatingToolbarButtonModels(editor, variant)
    .filter((button) => button.active)
    .map((button) => button.id);
}

function textMarks(editor: Editor, text: string) {
  let marks: { type: string; attrs: Record<string, unknown> }[] = [];

  editor.state.doc.descendants((node) => {
    if (!node.isText || !node.text?.includes(text)) {
      return true;
    }

    marks = node.marks.map((mark) => ({
      type: mark.type.name,
      attrs: mark.attrs,
    }));
    return false;
  });

  return marks;
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("floating toolbar button model", () => {
  it("models the Tiptap Notion-like default toolbar order and groups", () => {
    const editor = createEditor("<p>plain</p>");
    selectText(editor, "plain");
    const buttons = getFloatingToolbarButtonModels(editor, "default");

    expect(buttons.map((button) => button.id)).toEqual([
      "block-type",
      "bold",
      "italic",
      "underline",
      "strike",
      "inline-code",
      "link",
      "color",
      "more",
    ]);
    expect(buttons.map((button) => button.group)).toEqual([
      "block",
      "inline",
      "inline",
      "inline",
      "inline",
      "inline",
      "link",
      "color",
      "more",
    ]);
  });

  it("tracks active inline marks for default toolbar selections", () => {
    const editor = createEditor('<p><strong>bold</strong> <a href="https://openai.com">link</a> plain</p>');

    selectText(editor, "bold");
    expect(activeButtonIds(editor, "default")).toContain("bold");
    expect(activeButtonIds(editor, "default")).not.toContain("link");

    selectText(editor, "link");
    expect(activeButtonIds(editor, "default")).toContain("link");
    expect(activeButtonIds(editor, "default")).not.toContain("bold");
  });

  it("keeps table compact toolbar limited while preserving active marks", () => {
    const editor = createEditor(`
<table>
  <tbody>
    <tr>
      <td><p><strong>bold</strong> <a href="https://openai.com">link</a></p></td>
    </tr>
  </tbody>
</table>
`);

    selectText(editor, "bold");
    const compactButtons = getFloatingToolbarButtonModels(editor, "table-compact");

    expect(compactButtons.map((button) => button.id)).toEqual([
      "bold",
      "italic",
      "underline",
      "strike",
      "inline-code",
      "link",
      "color",
      "more",
    ]);
    expect(activeButtonIds(editor, "table-compact")).toContain("bold");
  });

  it("runs inline mark commands against table-cell text ranges", () => {
    const editor = createEditor(`
<table>
  <tbody>
    <tr>
      <td><p>Table</p></td>
    </tr>
  </tbody>
</table>
`);

    selectText(editor, "able");
    const boldButton = getFloatingToolbarButtonModels(editor, "table-compact").find((button) => button.id === "bold");

    if (!boldButton) {
      throw new Error("Expected table-compact toolbar to expose Bold.");
    }

    boldButton.run();

    expect(editor.getHTML()).toContain("<p>T<strong>able</strong></p>");
    expect(editor.state.selection.empty).toBe(false);
    expect(createSelectionSnapshot(editor)).toMatchObject({
      surface: "table-cell-text-range",
      floatingToolbarVariant: "table-compact",
    });
    expect(activeButtonIds(editor, "table-compact")).toContain("bold");
  });

  it("suppresses the inline toolbar for whole-cell table selections", () => {
    const editor = createEditor(`
<table>
  <tbody>
    <tr>
      <td><p>alpha</p></td>
      <td><p>beta</p></td>
    </tr>
  </tbody>
</table>
`);
    const [anchorCell, headCell] = tableCellPositions(editor);

    if (anchorCell === undefined || headCell === undefined) {
      throw new Error("Expected two table cells.");
    }

    expect(editor.commands.setCellSelection({ anchorCell, headCell })).toBe(true);

    const snapshot = createSelectionSnapshot(editor);
    expect(snapshot.kind).toBe("cell");
    expect(snapshot.surface).toBe("table-cell-selection");
    expect(snapshot.floatingToolbarVariant).toBe("hidden");
    expect(shouldShowFloatingToolbar(snapshot)).toBe(false);
    expect(getFloatingToolbarState(snapshot)).toMatchObject({
      visibility: "hidden",
      hiddenReason: "table-cell-selection",
      variant: "hidden",
    });
  });

  it("returns no visible button models for hidden toolbar state", () => {
    const editor = createEditor("<p>plain</p>");

    expect(getFloatingToolbarButtonModels(editor, "hidden")).toEqual([]);
  });

  it("prevents toolbar pointer down from moving focus out of the editor", () => {
    let prevented = false;

    preventFloatingToolbarPointerFocusLoss({
      preventDefault: () => {
        prevented = true;
      },
    });

    expect(prevented).toBe(true);
  });

  it("builds tooltip state from the hovered toolbar button model", () => {
    const editor = createEditor("<p><strong>bold</strong> plain</p>");
    selectText(editor, "bold");
    const boldButton = getFloatingToolbarButtonModels(editor, "default").find((button) => button.id === "bold");

    if (!boldButton) {
      throw new Error("Expected default toolbar to expose Bold.");
    }

    expect(getFloatingToolbarTooltipModel(boldButton)).toEqual({
      buttonId: "bold",
      label: "Bold",
      active: true,
    });
    expect(getFloatingToolbarTooltipModel(null)).toBeNull();
  });

  it("derives heading labels and exposes the Turn Into menu order", () => {
    const editor = createEditor("<h2>Heading</h2>");
    selectText(editor, "Heading");

    expect(getCurrentFloatingToolbarBlockType(editor)).toMatchObject({ glyph: "Heading 2", level: 2 });
    expect(getFloatingToolbarButtonModels(editor, "default")[0]).toMatchObject({
      id: "block-type",
      glyph: "Heading 2",
    });
    expect(floatingToolbarTurnIntoOptions.map((option) => option.id)).toEqual([
      "paragraph",
      "heading-1",
      "heading-2",
      "heading-3",
      "bullet-list",
      "numbered-list",
      "todo-list",
      "quote",
      "code-block",
    ]);

    expect(setFloatingToolbarBlockType(editor, 2)).toBe(true);
    expect(editor.getHTML()).toContain("<h2>Heading</h2>");
    expect(setFloatingToolbarTurnInto(editor, "paragraph")).toBe(true);
    expect(editor.getHTML()).toContain("<p>Heading</p>");
    expect(setFloatingToolbarTurnInto(editor, "heading-3")).toBe(true);
    expect(editor.getHTML()).toContain("<h3>Heading</h3>");
  });

  it("runs Turn Into structure commands", () => {
    const bulletEditor = createEditor("<p>item</p>");
    selectText(bulletEditor, "item");
    expect(setFloatingToolbarTurnInto(bulletEditor, "bullet-list")).toBe(true);
    expect(bulletEditor.getHTML()).toContain("<ul>");
    bulletEditor.destroy();

    const quoteEditor = createEditor("<p>quote</p>");
    activeEditor = quoteEditor;
    selectText(quoteEditor, "quote");
    expect(setFloatingToolbarTurnInto(quoteEditor, "quote")).toBe(true);
    expect(quoteEditor.getHTML()).toContain("<blockquote>");
    quoteEditor.destroy();

    const codeEditor = createEditor("<p>code</p>");
    activeEditor = codeEditor;
    selectText(codeEditor, "code");
    expect(setFloatingToolbarTurnInto(codeEditor, "code-block")).toBe(true);
    expect(codeEditor.getHTML()).toContain("<pre");
  });

  it("applies and clears Notion-like text and highlight color groups", () => {
    const editor = createEditor("<p>plain</p>");
    const red = floatingToolbarTextColorOptions.find((option) => option.id === "red")?.value;
    const blueHighlight = floatingToolbarHighlightColorOptions.find((option) => option.id === "blue")?.value;

    if (!red || !blueHighlight) {
      throw new Error("Expected red text and blue highlight options.");
    }

    expect(floatingToolbarTextColorOptions).toHaveLength(10);
    expect(floatingToolbarHighlightColorOptions).toHaveLength(10);

    selectText(editor, "plain");
    expect(setFloatingToolbarHighlightColor(editor, blueHighlight)).toBe(true);
    expect(textMarks(editor, "plain")).toContainEqual({ type: "highlight", attrs: { color: blueHighlight } });

    expect(setFloatingToolbarHighlightColor(editor, null)).toBe(true);
    expect(textMarks(editor, "plain").some((mark) => mark.type === "highlight")).toBe(false);

    selectText(editor, "plain");
    expect(setFloatingToolbarTextColor(editor, red)).toBe(true);
    expect(textMarks(editor, "plain")).toContainEqual({ type: "textStyle", attrs: { color: red } });

    expect(setFloatingToolbarTextColor(editor, null)).toBe(true);
    expect(textMarks(editor, "plain").some((mark) => mark.type === "textStyle")).toBe(false);
  });

  it("runs More toolbar actions for script, math, alignment, and indent", () => {
    expect(floatingToolbarMoreActions.map((action) => action.id)).toEqual([
      "superscript",
      "subscript",
      "inline-math",
      "align-left",
      "align-center",
      "align-right",
      "align-justify",
      "decrease-indent",
      "increase-indent",
    ]);

    const scriptEditor = createEditor("<p>plain</p>");
    selectText(scriptEditor, "plain");
    expect(runFloatingToolbarMoreAction(scriptEditor, "superscript")).toBe(true);
    expect(textMarks(scriptEditor, "plain").some((mark) => mark.type === "superscript")).toBe(true);
    scriptEditor.destroy();

    const mathEditor = createEditor("<p>x + y</p>");
    activeEditor = mathEditor;
    selectText(mathEditor, "x + y");
    expect(insertFloatingToolbarInlineMath(mathEditor)).toBe(true);
    expect(mathEditor.getHTML()).toContain('data-type="inline-math"');
    expect(mathEditor.getHTML()).toContain('data-latex="x + y"');
    mathEditor.destroy();

    const alignEditor = createEditor("<p>align</p>");
    activeEditor = alignEditor;
    selectText(alignEditor, "align");
    expect(setFloatingToolbarTextAlign(alignEditor, "center")).toBe(true);
    expect(alignEditor.getHTML()).toContain('style="text-align: center;"');

    expect(runFloatingToolbarMoreAction(alignEditor, "increase-indent")).toBe(true);
    expect(alignEditor.getHTML()).toContain('data-markweave-indent-level="1"');
    expect(runFloatingToolbarMoreAction(alignEditor, "decrease-indent")).toBe(true);
    expect(alignEditor.getHTML()).not.toContain("data-markweave-indent-level");
  });

  it("clamps the toolbar to the editor frame rather than the viewport", () => {
    expect(
      calculateFloatingToolbarFrameShift({
        toolbarRect: { left: 20, top: 0, width: 200, height: 40 },
        frameRect: { left: 100, top: 0, width: 500, height: 600 },
        boundaryPadding: 8,
      }),
    ).toBe(88);
    expect(
      calculateFloatingToolbarFrameShift({
        toolbarRect: { left: 500, top: 0, width: 200, height: 40 },
        frameRect: { left: 100, top: 0, width: 500, height: 600 },
        boundaryPadding: 8,
      }),
    ).toBe(-108);
    expect(
      calculateFloatingToolbarFrameShift({
        toolbarRect: { left: 160, top: 0, width: 180, height: 40 },
        frameRect: { left: 100, top: 0, width: 500, height: 600 },
        boundaryPadding: 8,
      }),
    ).toBe(0);
  });

  it("builds assistant request payloads without modifying the document", () => {
    const editor = createEditor("<p>OpenAI <strong>plain</strong></p>");
    selectText(editor, "plain");
    const before = editor.state.doc.toJSON();

    expect(createFloatingToolbarAssistantRequest(editor, "rewrite-selection")).toMatchObject({
      source: "rewrite-selection",
      text: "plain",
      html: "<p><strong>plain</strong></p>",
    });
    expect(editor.state.doc.toJSON()).toEqual(before);
  });

  it("applies a trimmed Link URL to selected text", () => {
    const editor = createEditor("<p>OpenAI plain</p>");
    selectText(editor, "OpenAI");

    expect(applyFloatingToolbarLink(editor, " https://openai.com/docs ")).toBe(true);

    expect(editor.getHTML()).toContain('href="https://openai.com/docs"');
    expect(getFloatingToolbarLinkHref(editor)).toBe("https://openai.com/docs");
    expect(activeButtonIds(editor, "default")).toContain("link");
    expect(editor.state.selection.empty).toBe(false);
  });

  it("keeps content unchanged when Link URL is empty or unsafe", () => {
    const editor = createEditor("<p>OpenAI plain</p>");
    selectText(editor, "OpenAI");
    const before = editor.state.doc.toJSON();

    expect(applyFloatingToolbarLink(editor, "   ")).toBe(false);
    expect(applyFloatingToolbarLink(editor, "javascript:alert(1)")).toBe(false);
    expect(applyFloatingToolbarLink(editor, "data:text/html,unsafe")).toBe(false);

    expect(editor.state.doc.toJSON()).toEqual(before);
    expect(activeButtonIds(editor, "default")).not.toContain("link");
  });

  it("updates and removes an active link while preserving the text selection", () => {
    const editor = createEditor('<p><a href="https://openai.com">OpenAI</a> plain</p>');
    selectText(editor, "OpenAI");

    expect(activeButtonIds(editor, "default")).toContain("link");
    expect(getFloatingToolbarLinkHref(editor)).toBe("https://openai.com");
    expect(applyFloatingToolbarLink(editor, "https://openai.com/docs")).toBe(true);
    expect(editor.getHTML()).toContain('href="https://openai.com/docs"');

    expect(removeFloatingToolbarLink(editor)).toBe(true);

    expect(editor.getHTML()).not.toContain('href="https://openai.com"');
    expect(editor.getHTML()).not.toContain('href="https://openai.com/docs"');
    expect(activeButtonIds(editor, "default")).not.toContain("link");
    expect(editor.state.selection.empty).toBe(false);
  });

  it("opens a valid Link URL through an injectable window opener", () => {
    const calls: Array<readonly [string | URL | undefined, string | undefined, string | undefined]> = [];
    const opener = (url?: string | URL, target?: string, features?: string) => {
      calls.push([url, target, features]);
      return null;
    };

    expect(openFloatingToolbarLinkHref(" https://openai.com/docs ", opener)).toBe(true);
    expect(openFloatingToolbarLinkHref("javascript:alert(1)", opener)).toBe(false);
    expect(calls).toEqual([["https://openai.com/docs", "_blank", "noopener,noreferrer"]]);
  });
});
