// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import {
  applyMarkweaveMathLatex,
  calculateMarkweaveMathPopoverPosition,
  deleteMarkweaveMathNode,
  getMarkweaveMathTargetAtPos,
  getMarkweaveMathTargetFromSelection,
  getMarkweaveMathRenderedHtml,
  insertMarkweaveBlockMath,
  insertMarkweaveInlineMath,
  renderMarkweaveMathPreview,
  setMarkweaveMathEditingDomState,
} from "../src/plugins/math/math-ui-model";

let activeEditor: Editor | null = null;

function createEditor(content: string, contentType: "html" | "markdown" = "html") {
  const element = document.createElement("div");
  document.body.appendChild(element);
  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions(),
    content,
    contentType,
  });
  return activeEditor;
}

function firstMathTarget(editor: Editor, type: "inlineMath" | "blockMath") {
  let target = null as ReturnType<typeof getMarkweaveMathTargetAtPos>;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === type) {
      target = getMarkweaveMathTargetAtPos(editor, pos);
      return false;
    }
    return true;
  });

  if (!target) {
    throw new Error(`Expected ${type}.`);
  }

  return target;
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("math UI model", () => {
  it("inserts, selects, updates, and deletes inline math", () => {
    const editor = createEditor("<p>before after</p>");

    expect(insertMarkweaveInlineMath(editor, " a^2 + b^2 = c^2 ")).toBe(true);
    const target = getMarkweaveMathTargetFromSelection(editor);

    expect(target).toMatchObject({ kind: "inline", latex: "a^2 + b^2 = c^2" });
    expect(applyMarkweaveMathLatex(editor, target!, " x + y ")).toBe(true);
    expect(editor.getHTML()).toContain('data-latex="x + y"');
    expect(deleteMarkweaveMathNode(editor, { ...target!, latex: "x + y" })).toBe(true);
    expect(editor.getHTML()).not.toContain("inline-math");
  });

  it("updates block math and keeps Markdown serialization", () => {
    const editor = createEditor("Before\n\n$$\na^2\n$$", "markdown");
    const target = firstMathTarget(editor, "blockMath");

    expect(target).toMatchObject({ kind: "block", latex: "a^2" });
    expect(applyMarkweaveMathLatex(editor, target, "\\\\sum_{n=1}^{3} n")).toBe(true);
    expect((editor as Editor & { getMarkdown?: () => string }).getMarkdown?.()).toContain("$$\n\\\\sum_{n=1}^{3} n\n$$");
  });

  it("inserts block math and rejects empty updates", () => {
    const editor = createEditor("<p>before</p>");

    expect(insertMarkweaveBlockMath(editor, "x")).toBe(true);
    const target = getMarkweaveMathTargetFromSelection(editor);

    expect(target).toMatchObject({ kind: "block", latex: "x" });
    expect(applyMarkweaveMathLatex(editor, target!, "   ")).toBe(false);
  });

  it("escapes preview text before injecting it as HTML", () => {
    const preview = renderMarkweaveMathPreview("\\bad{<script>alert(1)</script>", "inline");

    expect(preview.html).not.toContain("<script>");
    expect(preview.html).toContain("&lt;script&gt;");
  });

  it("renders math previews through the shared math node view", () => {
    const editor = createEditor('<p><span data-type="inline-math" data-latex="E = mc^2"></span></p><div data-type="block-math" data-latex="x^2"></div>');
    const inlineTarget = firstMathTarget(editor, "inlineMath");
    const blockTarget = firstMathTarget(editor, "blockMath");

    expect(getMarkweaveMathRenderedHtml(editor, blockTarget)).toContain("katex");
    expect(renderMarkweaveMathPreview("a^2 + b^2 = c^2", "inline", editor).html).toContain("katex");
    expect(renderMarkweaveMathPreview("\\\\int_{-\\\\infty}^{\\\\infty} e^{-x^2}\\\\, dx = \\\\sqrt{\\\\pi}", "block", editor).html).toContain("katex");

    expect(setMarkweaveMathEditingDomState(editor, inlineTarget, true)).toBe(true);
    const inlineDom = editor.view.nodeDOM(inlineTarget.pos);
    expect(inlineDom).toBeInstanceOf(HTMLElement);
    expect((inlineDom as HTMLElement).style.getPropertyValue("--markweave-inline-math-editing-width")).toMatch(/px$/);
    expect(setMarkweaveMathEditingDomState(editor, inlineTarget, false)).toBe(true);
    expect((inlineDom as HTMLElement).style.getPropertyValue("--markweave-inline-math-editing-width")).toBe("");
  });

  it("keeps inline math editing anchored at the formula position", () => {
    const position = calculateMarkweaveMathPopoverPosition({
      anchorRect: { left: 420, top: 360, width: 84, height: 22 } as DOMRect,
      frameRect: { left: 120, top: 40, width: 960, height: 720 } as DOMRect,
      kind: "inline",
      latex: "E = mc^2",
      viewportHeight: 720,
      viewportWidth: 1280,
    });

    expect(position.placement).toBe("bottom");
    expect(position.left).toBe(300);
    expect(position.top).toBe(324);
    expect(position.width).toBeGreaterThan(100);
  });

  it("does not clamp inline math editing to the viewport in long documents", () => {
    const position = calculateMarkweaveMathPopoverPosition({
      anchorRect: { left: 510, top: 624, width: 52, height: 18 } as DOMRect,
      frameRect: { left: 296, top: -2301, width: 1132, height: 4638 } as DOMRect,
      kind: "inline",
      latex: "E = mc^2",
      viewportHeight: 720,
      viewportWidth: 1280,
    });

    expect(position.top).toBe(2929);
  });
});
