// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { setMarkweaveEditorModeState } from "../src/core/editor-mode-state";
import { createMarkweaveAiEditController } from "../src/plugins/ai-edit/ai-edit-controller";

let activeEditor: Editor | null = null;

function createEditor(content: string, lang: "zh" | "en" = "zh") {
  const frame = document.createElement("section");
  frame.className = "markweave-editor-frame";
  const element = document.createElement("div");
  element.className = "markweave-editor-surface";
  frame.appendChild(element);
  document.body.appendChild(frame);
  activeEditor = new Editor({ element, extensions: createMarkweaveEditorExtensions({ lang }), content });
  return activeEditor;
}

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function findText(editor: Editor, text: string) {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    const offset = node.isText ? node.text?.indexOf(text) ?? -1 : -1;
    if (offset >= 0) {
      range = { from: pos + offset, to: pos + offset + text.length };
      return false;
    }
    return true;
  });
  if (!range) {
    throw new Error(`Missing text: ${text}`);
  }
  return range as { from: number; to: number };
}

function selectText(editor: Editor, text: string) {
  editor.commands.setTextSelection(findText(editor, text));
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("Markweave AI edit controller", () => {
  it("captures only the selected content in text, HTML, and Markdown", () => {
    const editor = createEditor("<p>Before <strong>selected</strong> after</p><p>private context</p>", "en");
    selectText(editor, "selected");
    const controller = createMarkweaveAiEditController(editor);

    const result = controller.captureSelection({ metadata: { request: "host-1" }, controls: "none" });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toMatchObject({
      lang: "en",
      metadata: { request: "host-1" },
      selection: {
        text: "selected",
        html: "<p><strong>selected</strong></p>",
        markdown: "**selected**",
      },
    });
    expect(result.value.selection.markdown).not.toContain("private context");
    expect(result.value.signal.aborted).toBe(false);
    expect(controller.getState().phase).toBe("captured");
  });

  it("streams an in-place proposal without changing the document and accepts it as one undoable transaction", async () => {
    const editor = createEditor("<p>Before selected text after</p>");
    selectText(editor, "selected text");
    const before = editor.getJSON();
    const controller = createMarkweaveAiEditController(editor);
    const captured = controller.captureSelection();
    expect(captured.ok).toBe(true);
    if (!captured.ok) {
      return;
    }

    expect(controller.updateProposal({
      contextId: captured.value.id,
      markdown: "**Improved**",
      status: "streaming",
    })).toMatchObject({ ok: true });
    expect(controller.getState().phase).toBe("streaming");
    expect(editor.getJSON()).toEqual(before);
    await vi.waitFor(() => {
      const proposal = editor.view.dom.querySelector<HTMLElement>('[data-markweave-ask-ai-proposal="text"]');
      const controls = document.body.querySelector(".markweave-ai-edit-controls--floating");
      expect(proposal?.textContent).toContain("Improved");
      expect(controls).not.toBeNull();
      expect(editor.view.dom.contains(controls)).toBe(false);
    });
    expect(editor.view.dom.querySelector(".markweave-ai-edit-original")?.textContent).toBe("selected text");
    expect(document.body.querySelector(".markweave-ai-edit-controls")?.getAttribute("data-markweave-ai-edit-phase")).toBe("streaming");

    expect(controller.updateProposal({
      contextId: captured.value.id,
      markdown: "**Improved text** with $a^2$.",
      status: "complete",
    })).toMatchObject({ ok: true });
    expect(controller.getState().phase).toBe("review");
    expect(editor.getJSON()).toEqual(before);

    const decision = controller.accept(captured.value.id);
    expect(decision).toMatchObject({ ok: true, value: { decision: "accepted" } });
    expect(editor.getText()).toContain("Improved text with");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it("renders multi-block Markdown as a block proposal before one-step acceptance", () => {
    const editor = createEditor("<p>First paragraph</p><p>Second paragraph</p>");
    const first = findText(editor, "First paragraph");
    const second = findText(editor, "Second paragraph");
    editor.commands.setTextSelection({ from: first.from, to: second.to });
    const before = editor.getJSON();
    const controller = createMarkweaveAiEditController(editor);
    const captured = controller.captureSelection({ controls: "none" });
    expect(captured.ok).toBe(true);
    if (!captured.ok) {
      return;
    }

    const proposal = [
      "Improved introduction.",
      "",
      "- First item",
      "- Second item with $a^2$",
      "",
      "```ts",
      "const value = 1;",
      "```",
    ].join("\n");
    expect(controller.updateProposal({
      contextId: captured.value.id,
      markdown: proposal,
      status: "complete",
    })).toMatchObject({ ok: true });

    const preview = editor.view.dom.querySelector<HTMLElement>('[data-markweave-ask-ai-proposal="text"]');
    expect(preview?.dataset.markweaveAskAiLayout).toBe("block");
    expect(preview?.querySelector("ul")).not.toBeNull();
    expect(preview?.querySelector("pre.markweave-code-block")).not.toBeNull();
    expect(editor.getJSON()).toEqual(before);

    expect(controller.accept(captured.value.id)).toMatchObject({ ok: true });
    expect(editor.getText()).toContain("Improved introduction");
    expect(editor.getText()).toContain("const value = 1");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it("discards without a document transaction and aborts the host request", () => {
    const editor = createEditor("<p>Before selected text after</p>");
    selectText(editor, "selected text");
    const before = editor.getJSON();
    const controller = createMarkweaveAiEditController(editor);
    const decisions = vi.fn();
    controller.onDecision(decisions);
    const captured = controller.captureSelection();
    expect(captured.ok).toBe(true);
    if (!captured.ok) {
      return;
    }

    const discarded = controller.discard(captured.value.id);

    expect(discarded).toMatchObject({ ok: true, value: { decision: "discarded" } });
    expect(captured.value.signal.aborted).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(controller.getState()).toEqual({ phase: "idle", context: null, proposal: null, error: null, hunks: [] });
    expect(decisions).toHaveBeenCalledTimes(1);
  });

  it("maps edits before the target and fails closed when the target content changes", async () => {
    const editor = createEditor("<p>Before</p><p>selected text</p>");
    selectText(editor, "selected text");
    const controller = createMarkweaveAiEditController(editor);
    const decisions = vi.fn();
    controller.onDecision(decisions);
    const captured = controller.captureSelection({ controls: "none" });
    expect(captured.ok).toBe(true);
    if (!captured.ok) {
      return;
    }

    editor.commands.insertContentAt(1, "Earlier ");
    expect(controller.updateProposal({
      contextId: captured.value.id,
      markdown: "Mapped replacement",
      status: "complete",
    })).toMatchObject({ ok: true });

    const selected = findText(editor, "selected text");
    editor.commands.insertContentAt(selected.from + 1, "changed ");
    await Promise.resolve();

    expect(controller.getState().phase).toBe("conflict");
    expect(captured.value.signal.aborted).toBe(true);
    expect(controller.accept(captured.value.id)).toMatchObject({ ok: false, code: "conflict" });
    expect(decisions).toHaveBeenCalledWith(expect.objectContaining({ decision: "conflict" }));
  });

  it("rejects stale, concurrent, readonly, empty, code, and table selections", () => {
    const editor = createEditor([
      "<p>regular text</p>",
      '<pre><code class="language-typescript">const value = 1</code></pre>',
      "<table><tbody><tr><td><p>cell value</p></td></tr></tbody></table>",
    ].join(""));
    const controller = createMarkweaveAiEditController(editor);

    expect(controller.captureSelection()).toMatchObject({ ok: false, code: "no-selection" });
    selectText(editor, "const value = 1");
    expect(controller.captureSelection()).toMatchObject({ ok: false, code: "unsupported-selection" });
    selectText(editor, "cell value");
    expect(controller.captureSelection()).toMatchObject({ ok: false, code: "unsupported-selection" });

    selectText(editor, "regular text");
    const captured = controller.captureSelection({ controls: "none" });
    expect(captured.ok).toBe(true);
    expect(controller.captureSelection()).toMatchObject({ ok: false, code: "active-review" });
    expect(controller.updateProposal({ contextId: "late", markdown: "Late", status: "complete" }))
      .toMatchObject({ ok: false, code: "stale-context" });
    if (captured.ok) {
      controller.discard(captured.value.id);
    }

    setMarkweaveEditorModeState(editor, { mode: "view", editable: false });
    expect(controller.captureSelection()).toMatchObject({ ok: false, code: "readonly" });
  });

  it("keeps the inline proposal headless when built-in controls are disabled", () => {
    const editor = createEditor("<p>selected text</p>");
    selectText(editor, "selected text");
    const controller = createMarkweaveAiEditController(editor);
    const captured = controller.captureSelection({ controls: "none" });
    expect(captured.ok).toBe(true);
    if (!captured.ok) {
      return;
    }

    controller.updateProposal({
      contextId: captured.value.id,
      markdown: "Headless replacement",
      status: "complete",
    });

    expect(editor.view.dom.querySelector('[data-markweave-ask-ai-proposal="text"]')?.textContent).toBe("Headless replacement");
    expect(document.body.querySelector(".markweave-ai-edit-controls")).toBeNull();
  });

  it("keeps the default decision toolbar viewport-fixed inside the visible editor boundary", async () => {
    const editor = createEditor("<p>Before selected text after</p>");
    const frame = editor.view.dom.closest<HTMLElement>(".markweave-editor-frame");
    expect(frame).not.toBeNull();
    frame!.getBoundingClientRect = () => createRect(20, 40, 800, 600);
    selectText(editor, "selected text");
    const controller = createMarkweaveAiEditController(editor);
    const captured = controller.captureSelection();
    expect(captured.ok).toBe(true);
    if (!captured.ok) {
      return;
    }

    expect(controller.updateProposal({
      contextId: captured.value.id,
      markdown: "Improved text",
      status: "complete",
    })).toMatchObject({ ok: true });

    const controls = await vi.waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(".markweave-ai-edit-controls--floating");
      expect(element).not.toBeNull();
      return element!;
    });
    controls.getBoundingClientRect = () => createRect(0, 0, 120, 34);
    document.dispatchEvent(new Event("scroll"));

    await vi.waitFor(() => {
      expect(controls.dataset.markweavePositioned).toBe("true");
      expect(controls.style.left).toBe("688px");
      expect(controls.style.top).toBe("594px");
      expect(controls.style.visibility).toBe("visible");
    });

    frame!.getBoundingClientRect = () => createRect(30, 50, 700, 500);
    window.dispatchEvent(new Event("pageshow"));
    await vi.waitFor(() => {
      expect(controls.style.left).toBe("598px");
      expect(controls.style.top).toBe("504px");
    });
    expect(document.body.querySelectorAll(".markweave-ai-edit-controls--floating")).toHaveLength(1);
    expect(editor.view.dom.querySelector(".markweave-ai-edit-controls")).toBeNull();
  });

  it("keeps one body-level decision toolbar for a multi-hunk document proposal", async () => {
    const editor = createEditor("<h1>Original title</h1><p>Keep this paragraph</p><p>Original ending</p>");
    const controller = createMarkweaveAiEditController(editor);
    const captured = controller.capture({ scope: "document", controls: "default" });
    expect(captured.ok).toBe(true);
    if (!captured.ok) {
      return;
    }

    expect(controller.updateProposal({
      contextId: captured.value.id,
      markdown: "# Revised title\n\nKeep this paragraph\n\nRevised ending",
      status: "complete",
    })).toMatchObject({ ok: true });

    await vi.waitFor(() => {
      expect(editor.view.dom.querySelectorAll(".markweave-ai-edit-hunk-proposal")).toHaveLength(2);
      expect(document.body.querySelectorAll(".markweave-ai-edit-controls--floating")).toHaveLength(1);
    });
    expect(editor.view.dom.querySelector(".markweave-ai-edit-controls")).toBeNull();
    expect(document.body.querySelector(".markweave-ai-edit-controls")?.getAttribute("data-markweave-ai-edit-phase")).toBe("review");
  });

  it("exposes a lazy selection snapshot with normalized Markdown block lines", () => {
    const editor = createEditor("<h1>Title</h1><p>First line</p><p>Second selected line</p>");
    selectText(editor, "selected");
    const controller = createMarkweaveAiEditController(editor);
    const listener = vi.fn();
    const unsubscribe = controller.subscribeSelection(listener);

    expect(controller.getSelection()).toMatchObject({
      text: "selected",
      markdown: "selected",
      eligible: true,
      reason: null,
      lineRange: {
        start: 5,
        end: 5,
        basis: "normalized-markdown",
        precision: "block",
      },
    });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ text: "selected" }));

    editor.commands.setTextSelection(findText(editor, "First line"));
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
      text: "First line",
      lineRange: expect.objectContaining({ start: 3, end: 3 }),
    }));
    unsubscribe();
  });

  it("captures a document without a selection and reviews multiple disjoint block changes atomically", () => {
    const editor = createEditor("<h1>Original title</h1><p>Keep this paragraph</p><p>Original ending</p>");
    const before = editor.getJSON();
    const controller = createMarkweaveAiEditController(editor);
    const captured = controller.capture({ scope: "document", controls: "none" });
    expect(captured.ok).toBe(true);
    if (!captured.ok) {
      return;
    }
    expect(captured.value.target).toMatchObject({ scope: "document", from: 0 });

    expect(controller.updateProposal({
      contextId: captured.value.id,
      markdown: "# Revised title\n\nKeep this paragraph\n\nRevised ending",
      status: "streaming",
    })).toMatchObject({ ok: true });
    expect(editor.view.dom.querySelectorAll("[data-markweave-ai-edit-hunk]")).toHaveLength(0);

    expect(controller.updateProposal({
      contextId: captured.value.id,
      markdown: "# Revised title\n\nKeep this paragraph\n\nRevised ending",
      status: "complete",
    })).toMatchObject({ ok: true });
    expect(controller.getState().hunks).toHaveLength(2);
    expect(editor.view.dom.querySelectorAll(".markweave-ai-edit-hunk-proposal")).toHaveLength(2);
    expect(editor.getJSON()).toEqual(before);

    const accepted = controller.accept(captured.value.id);
    expect(accepted).toMatchObject({
      ok: true,
      value: { decision: "accepted", appliedRanges: expect.any(Array) },
    });
    if (accepted.ok) {
      expect(accepted.value.appliedRanges).toHaveLength(2);
    }
    expect(editor.getText()).toContain("Revised title");
    expect(editor.getText()).toContain("Keep this paragraph");
    expect(editor.getText()).toContain("Revised ending");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it("expands a collapsed cursor to the current block and maps unrelated edits before it", () => {
    const editor = createEditor("<p>Before block</p><p>Target block</p><p>After block</p>");
    const target = findText(editor, "Target block");
    editor.commands.setTextSelection(target.from + 2);
    const controller = createMarkweaveAiEditController(editor);
    const captured = controller.capture({ scope: "blocks", controls: "none" });
    expect(captured.ok).toBe(true);
    if (!captured.ok) {
      return;
    }
    expect(captured.value.target).toMatchObject({ scope: "blocks", markdown: "Target block" });

    editor.commands.insertContentAt(1, "Earlier ");
    expect(controller.updateProposal({
      contextId: captured.value.id,
      markdown: "Revised target block",
      status: "complete",
    })).toMatchObject({ ok: true });
    expect(controller.accept(captured.value.id)).toMatchObject({ ok: true });
    expect(editor.getText()).toContain("Earlier Before block");
    expect(editor.getText()).toContain("Revised target block");
    expect(editor.getText()).toContain("After block");
  });

  it("captures all top-level blocks covered by a non-empty selection", () => {
    const editor = createEditor("<p>Before block</p><p>First target</p><p>Second target</p><p>After block</p>");
    const first = findText(editor, "First target");
    const second = findText(editor, "Second target");
    editor.commands.setTextSelection({ from: first.from + 2, to: second.to - 2 });
    const controller = createMarkweaveAiEditController(editor);
    const captured = controller.capture({ scope: "blocks", controls: "none" });

    expect(captured).toMatchObject({
      ok: true,
      value: {
        target: {
          scope: "blocks",
          markdown: "First target\n\nSecond target",
        },
      },
    });
  });

  it("fails closed when the captured multi-block target changes before acceptance", () => {
    const editor = createEditor("<p>Before block</p><p>Target block</p><p>After block</p>");
    const target = findText(editor, "Target block");
    editor.commands.setTextSelection(target);
    const controller = createMarkweaveAiEditController(editor);
    const captured = controller.capture({ scope: "blocks", controls: "none" });
    expect(captured.ok).toBe(true);
    if (!captured.ok) {
      return;
    }

    editor.commands.insertContentAt(target.from + 2, "changed ");
    expect(controller.getState().phase).toBe("conflict");
    expect(captured.value.signal.aborted).toBe(true);
    expect(controller.accept(captured.value.id)).toMatchObject({ ok: false, code: "conflict" });
    expect(editor.getText()).toContain("changed");
  });

  it("keeps unchanged media blocks intact during a document-wide multi-hunk acceptance", () => {
    const editor = createEditor([
      "<h1>Old title</h1>",
      '<p><img src="markweave://asset/image.png" alt="Diagram"></p>',
      "<p>Old ending</p>",
    ].join(""));
    let imageBlock = editor.state.doc.firstChild;
    editor.state.doc.forEach((node) => {
      if (node.type.name === "image") {
        imageBlock = node;
      }
    });
    const controller = createMarkweaveAiEditController(editor);
    const captured = controller.capture({ scope: "document", controls: "none" });
    expect(captured.ok).toBe(true);
    if (!captured.ok) {
      return;
    }

    expect(controller.updateProposal({
      contextId: captured.value.id,
      markdown: "# New title\n\n![Diagram](markweave://asset/image.png)\n\nNew ending",
      status: "complete",
    })).toMatchObject({ ok: true });
    expect(controller.getState().hunks).toHaveLength(2);
    expect(controller.accept(captured.value.id)).toMatchObject({ ok: true });
    let acceptedImage = editor.state.doc.firstChild;
    editor.state.doc.forEach((node) => {
      if (node.type.name === "image") {
        acceptedImage = node;
      }
    });
    expect(acceptedImage).toBe(imageBlock);
  });

  it("reviews sparse changes in a document with more than 200 top-level blocks", () => {
    const paragraphs = Array.from({ length: 300 }, (_, index) => `Paragraph ${index + 1}`);
    const editor = createEditor(paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join(""));
    const controller = createMarkweaveAiEditController(editor);
    const captured = controller.capture({ scope: "document", controls: "none" });
    expect(captured.ok).toBe(true);
    if (!captured.ok) {
      return;
    }
    const revised = [...paragraphs];
    revised[19] = "Revised paragraph 20";
    revised[149] = "Revised paragraph 150";
    revised[279] = "Revised paragraph 280";

    expect(controller.updateProposal({
      contextId: captured.value.id,
      markdown: revised.join("\n\n"),
      status: "complete",
    })).toMatchObject({ ok: true });
    expect(controller.getState().hunks).toHaveLength(3);
    expect(controller.accept(captured.value.id)).toMatchObject({ ok: true });
    expect(editor.getText()).toContain("Revised paragraph 20");
    expect(editor.getText()).toContain("Revised paragraph 150");
    expect(editor.getText()).toContain("Revised paragraph 280");
  });

  it("accepts a proposal containing exactly 200 disjoint hunks", () => {
    const hunkCount = 200;
    const paragraphs = Array.from(
      { length: hunkCount * 2 + 1 },
      (_, index) => `Boundary paragraph ${index + 1}`,
    );
    const revised = paragraphs.map((paragraph, index) => (
      index % 2 === 0 && index < hunkCount * 2 ? `${paragraph} revised` : paragraph
    ));
    const editor = createEditor(paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join(""));
    const controller = createMarkweaveAiEditController(editor);
    const captured = controller.capture({ scope: "document", controls: "none" });
    expect(captured.ok).toBe(true);
    if (!captured.ok) {
      return;
    }

    expect(controller.updateProposal({
      contextId: captured.value.id,
      markdown: revised.join("\n\n"),
      status: "complete",
    })).toMatchObject({ ok: true });
    expect(controller.getState().hunks).toHaveLength(hunkCount);
    expect(controller.accept(captured.value.id)).toMatchObject({
      ok: true,
      value: { appliedRanges: expect.any(Array) },
    });
    expect(editor.getText()).toContain("Boundary paragraph 399 revised");
  });

  it("rejects a proposal containing 201 disjoint hunks", () => {
    const hunkCount = 201;
    const paragraphs = Array.from(
      { length: hunkCount * 2 + 1 },
      (_, index) => `Rejected paragraph ${index + 1}`,
    );
    const revised = paragraphs.map((paragraph, index) => (
      index % 2 === 0 && index < hunkCount * 2 ? `${paragraph} revised` : paragraph
    ));
    const editor = createEditor(paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join(""));
    const before = editor.getJSON();
    const controller = createMarkweaveAiEditController(editor);
    const captured = controller.capture({ scope: "document", controls: "none" });
    expect(captured.ok).toBe(true);
    if (!captured.ok) {
      return;
    }

    expect(controller.updateProposal({
      contextId: captured.value.id,
      markdown: revised.join("\n\n"),
      status: "complete",
    })).toMatchObject({ ok: false, code: "proposal-too-complex" });
    expect(controller.getState()).toMatchObject({ phase: "error", hunks: [] });
    expect(editor.getJSON()).toEqual(before);
  });
});
