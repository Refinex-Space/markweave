// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { setMarkweaveEditorModeState } from "../src/core/editor-mode-state";
import { createMarkweaveAiEditController } from "../src/plugins/ai-edit/ai-edit-controller";

let activeEditor: Editor | null = null;

function createEditor(content: string, lang: "zh" | "en" = "zh") {
  const element = document.createElement("div");
  document.body.appendChild(element);
  activeEditor = new Editor({ element, extensions: createMarkweaveEditorExtensions({ lang }), content });
  return activeEditor;
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
    await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
    expect(editor.view.dom.querySelector('[data-markweave-ask-ai-proposal="text"]')?.textContent).toBe("Improved");
    expect(editor.view.dom.querySelector(".markweave-ai-edit-original")?.textContent).toBe("selected text");
    expect(editor.view.dom.querySelector(".markweave-ai-edit-controls")?.getAttribute("data-markweave-ai-edit-phase")).toBe("streaming");

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
    expect(controller.getState()).toEqual({ phase: "idle", context: null, proposal: null, error: null });
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
    expect(editor.view.dom.querySelector(".markweave-ai-edit-controls")).toBeNull();
  });
});
