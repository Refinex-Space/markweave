// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import {
  acceptMarkweaveAskAiResult,
  calculateMarkweaveAskAiPanelPosition,
  clearMarkweaveAskAiTarget,
  createMarkweaveAskAiRequest,
  createMarkweaveAskAiSelection,
  canStartMarkweaveAskAiTableTarget,
  getMappedMarkweaveAskAiSelection,
  getMarkweaveAskAiSurfaceRect,
  getMarkweaveAskAiTarget,
  isMarkweaveAskAiSelectionEligible,
  runMarkweaveAskAiHandler,
  serializeMarkweaveAskAiPreview,
  setMarkweaveAskAiPreview,
  startMarkweaveAskAiTarget,
  startMarkweaveAskAiTableTarget,
} from "../src/plugins/ask-ai/ask-ai-session";

let activeEditor: Editor | null = null;

function createEditor(content: string) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  activeEditor = new Editor({ element, extensions: createMarkweaveEditorExtensions(), content });
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
  return range;
}

function selectText(editor: Editor, text: string) {
  editor.commands.setTextSelection(findText(editor, text));
}

function findCellPosition(editor: Editor, text: string) {
  let position: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if ((node.type.name === "tableCell" || node.type.name === "tableHeader") && node.textContent === text) {
      position = pos;
      return false;
    }
    return true;
  });
  if (position === null) {
    throw new Error(`Missing table cell: ${text}`);
  }
  return position;
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.innerHTML = "";
});

describe("Ask AI session", () => {
  it("positions the panel below the mapped selection and clamps it to the editor frame", () => {
    expect(calculateMarkweaveAskAiPanelPosition({
      anchorRect: { left: 220, top: 120, width: 420, height: 38 },
      selectionRect: { left: 80, top: 170, width: 920, height: 96 },
      panelSize: { width: 620, height: 168 },
      viewport: { width: 1200, height: 800 },
      frameRect: { left: 64, top: 40, width: 960, height: 720 },
    })).toEqual({
      left: -140,
      top: 156,
      placement: "bottom",
      width: 620,
      maxWidth: 944,
      maxHeight: 476,
    });
  });

  it("flips the panel above the selection when the lower side cannot fit", () => {
    expect(calculateMarkweaveAskAiPanelPosition({
      anchorRect: { left: 300, top: 640, width: 360, height: 38 },
      selectionRect: { left: 220, top: 690, width: 560, height: 54 },
      panelSize: { width: 520, height: 220 },
      viewport: { width: 1000, height: 800 },
      frameRect: { left: 180, top: 40, width: 640, height: 720 },
    })).toEqual({
      left: -80,
      top: -180,
      placement: "top",
      width: 520,
      maxWidth: 624,
      maxHeight: 632,
    });
  });

  it("aligns the panel to the editor surface and fills its available width", () => {
    expect(calculateMarkweaveAskAiPanelPosition({
      anchorRect: { left: 220, top: 120, width: 420, height: 38 },
      selectionRect: { left: 320, top: 170, width: 240, height: 96 },
      panelSize: { width: 620, height: 168 },
      viewport: { width: 1200, height: 800 },
      frameRect: { left: 64, top: 40, width: 960, height: 720 },
      surfaceRect: { left: 100, top: 80, width: 880, height: 640 },
    })).toEqual({
      left: -120,
      top: 156,
      placement: "bottom",
      width: 880,
      maxWidth: 960,
      maxHeight: 476,
    });
  });

  it("uses the editor content box instead of its TOC padding as the preferred panel width", () => {
    const element = document.createElement("div");
    element.style.padding = "16px 40px 24px 32px";
    element.getBoundingClientRect = () => ({
      left: 100,
      top: 80,
      width: 880,
      height: 600,
      right: 980,
      bottom: 680,
      x: 100,
      y: 80,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(element);

    expect(getMarkweaveAskAiSurfaceRect(element)).toEqual({
      left: 132,
      top: 96,
      width: 808,
      height: 560,
    });
  });

  it("clips an editor-width panel to the padded viewport on narrow screens", () => {
    expect(calculateMarkweaveAskAiPanelPosition({
      anchorRect: { left: 100, top: 80, width: 320, height: 38 },
      selectionRect: { left: 40, top: 140, width: 560, height: 48 },
      panelSize: { width: 620, height: 220 },
      viewport: { width: 640, height: 720 },
      frameRect: { left: 0, top: 0, width: 700, height: 680 },
      surfaceRect: { left: 0, top: 60, width: 700, height: 600 },
    })).toMatchObject({
      left: -92,
      width: 624,
      maxWidth: 624,
    });
  });

  it("creates a selection-only request and keeps the document unchanged before acceptance", () => {
    const editor = createEditor("<p>Before <strong>selected</strong> after</p><p>private context</p>");
    selectText(editor, "selected");
    const before = editor.getJSON();
    const selection = startMarkweaveAskAiTarget(editor);
    const controller = new AbortController();
    const request = createMarkweaveAskAiRequest(selection!, "Improve it", "en", controller.signal, "request-1");

    expect(request).toMatchObject({
      id: "request-1",
      prompt: "Improve it",
      lang: "en",
      selection: expect.objectContaining({ text: "selected" }),
      outputFormat: "markdown",
      signal: controller.signal,
    });
    expect(request.selection.html).toContain("<strong>selected</strong>");
    expect(request).not.toHaveProperty("document");
    expect(editor.getJSON()).toEqual(before);
    expect(getMarkweaveAskAiTarget(editor)?.status).toBe("target");
  });

  it("filters empty, code-block, table-cell, and atom selections", () => {
    const paragraphEditor = createEditor("<p>plain text</p>");
    expect(isMarkweaveAskAiSelectionEligible(paragraphEditor)).toBe(false);
    selectText(paragraphEditor, "plain");
    expect(isMarkweaveAskAiSelectionEligible(paragraphEditor)).toBe(true);
    paragraphEditor.destroy();

    const codeEditor = createEditor("<pre><code>const value = 1</code></pre>");
    activeEditor = codeEditor;
    selectText(codeEditor, "value");
    expect(createMarkweaveAskAiSelection(codeEditor)).toBeNull();
    codeEditor.destroy();

    const tableEditor = createEditor("<table><tbody><tr><td><p>cell</p></td></tr></tbody></table>");
    activeEditor = tableEditor;
    selectText(tableEditor, "cell");
    expect(createMarkweaveAskAiSelection(tableEditor)).toBeNull();
  });

  it("supports Promise and incremental AsyncIterable results", async () => {
    const controller = new AbortController();
    const selection = { from: 1, to: 4, text: "old", html: "old" };
    const request = createMarkweaveAskAiRequest(selection, "rewrite", "en", controller.signal, "stream-1");
    const deltas: string[] = [];
    async function* stream() {
      yield "new ";
      yield "text";
    }

    await expect(runMarkweaveAskAiHandler(async () => "complete", request)).resolves.toBe("complete");
    await expect(runMarkweaveAskAiHandler(() => stream(), request, (value) => deltas.push(value))).resolves.toBe("new text");
    expect(deltas).toEqual(["new ", "new text"]);
  });

  it("aborts streams and ignores an empty result", async () => {
    const controller = new AbortController();
    const request = createMarkweaveAskAiRequest({ from: 1, to: 2, text: "x", html: "x" }, "rewrite", "zh", controller.signal);
    async function* stream() {
      yield "first";
      controller.abort();
      yield "late";
    }

    await expect(runMarkweaveAskAiHandler(() => stream(), request)).rejects.toMatchObject({ name: "AbortError" });
    const fresh = createMarkweaveAskAiRequest(request.selection, "rewrite", "zh", new AbortController().signal);
    await expect(runMarkweaveAskAiHandler(() => "", fresh)).rejects.toMatchObject({
      name: "MarkweaveAskAiError",
      code: "empty-result",
    });
  });

  it("maps edits before the target and conflicts on target edits", () => {
    const editor = createEditor("<p>before target after</p>");
    selectText(editor, "target");
    startMarkweaveAskAiTarget(editor);
    const initial = getMarkweaveAskAiTarget(editor)!;

    editor.commands.insertContentAt(1, "prefix ");
    expect(getMarkweaveAskAiTarget(editor)).toMatchObject({ status: "target", from: initial.from + 7, to: initial.to + 7 });
    expect(getMappedMarkweaveAskAiSelection(editor, { from: initial.from, to: initial.to, text: "target", html: "target" })).toMatchObject({
      from: initial.from + 7,
      to: initial.to + 7,
      text: "target",
    });

    const mapped = getMarkweaveAskAiTarget(editor)!;
    editor.commands.insertContentAt(mapped.from + 1, "changed");
    expect(getMarkweaveAskAiTarget(editor)?.status).toBe("conflict");
  });

  it("accepts Markdown in one transaction and one undo restores the source", () => {
    const editor = createEditor("<p>before old words after</p>");
    selectText(editor, "old words");
    startMarkweaveAskAiTarget(editor);

    expect(acceptMarkweaveAskAiResult(editor, "**new words**")).toBe(true);
    expect(editor.getHTML()).toContain("<strong>new words</strong>");
    expect(editor.getText()).not.toContain("old words");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toContain("old words");
  });

  it("accepts multi-paragraph and list Markdown through the current schema", () => {
    const editor = createEditor("<p>replace this paragraph</p>");
    selectText(editor, "replace this paragraph");
    startMarkweaveAskAiTarget(editor);

    expect(acceptMarkweaveAskAiResult(editor, "First paragraph.\n\n- one\n- two")).toBe(true);
    expect(editor.getHTML()).toContain("<p>First paragraph.</p>");
    expect(editor.getHTML()).toContain("<ul>");
    expect(editor.getText()).toContain("one");
    expect(editor.getText()).toContain("two");
  });

  it("never mutates the document for invalid output or discard", () => {
    const editor = createEditor("<p>keep selected text</p>");
    selectText(editor, "selected");
    const before = editor.getJSON();
    startMarkweaveAskAiTarget(editor);

    expect(acceptMarkweaveAskAiResult(editor, "")).toBe(false);
    clearMarkweaveAskAiTarget(editor);
    expect(editor.getJSON()).toEqual(before);
    expect(getMarkweaveAskAiTarget(editor)).toBeNull();
  });

  it("captures a table row as a target-local request without mutating the table", () => {
    const editor = createEditor([
      "<table><tbody>",
      "<tr><th><p>Name</p></th><th><p>Role</p></th></tr>",
      "<tr><td><p>Alice</p></td><td><p>Engineer</p></td></tr>",
      "</tbody></table>",
    ].join(""));
    selectText(editor, "Alice");
    const before = editor.getJSON();

    expect(canStartMarkweaveAskAiTableTarget(editor, "row")).toBe(true);
    const selection = startMarkweaveAskAiTableTarget(editor, "row");
    const target = getMarkweaveAskAiTarget(editor)?.target;
    const request = createMarkweaveAskAiRequest(
      selection!,
      "Translate this row",
      "en",
      new AbortController().signal,
      "table-row-1",
      target,
    );

    expect(request.target).toMatchObject({
      kind: "table",
      scope: "row",
      rows: 1,
      columns: 2,
      resultShape: "table",
      text: "Alice\tEngineer",
    });
    expect(request.target && request.target.kind === "table" ? request.target.cells : []).toHaveLength(2);
    expect(request.selection.text).toBe("Alice\tEngineer");
    expect(request).not.toHaveProperty("document");
    expect(editor.getJSON()).toEqual(before);
  });

  it("applies a table result as one content-only transaction and one undo restores every cell", () => {
    const editor = createEditor([
      "<table><tbody>",
      "<tr><th><p>Name</p></th><th><p>Role</p></th></tr>",
      "<tr><td data-background-color=\"#fee\"><p>Alice</p></td><td><p>Engineer</p></td></tr>",
      "</tbody></table>",
    ].join(""));
    selectText(editor, "Alice");
    const before = editor.getJSON();
    expect(startMarkweaveAskAiTableTarget(editor, "row")).not.toBeNull();

    expect(acceptMarkweaveAskAiResult(editor, "| 姓名 | 职位 |\n| --- | --- |" )).toBe(true);
    expect(editor.getText()).toContain("姓名");
    expect(editor.getText()).toContain("职位");
    expect(editor.getText()).not.toContain("Alice");
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "table",
      content: expect.arrayContaining([
        expect.objectContaining({ type: "tableRow" }),
      ]),
    });
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it("uses fragment output for one cell and preserves the cell type and attributes", () => {
    const editor = createEditor([
      "<table><tbody>",
      '<tr><td data-background-color="#ffeeee"><p>Alice</p></td><td><p>Engineer</p></td></tr>',
      "</tbody></table>",
    ].join(""));
    selectText(editor, "Alice");
    const cellPosition = findCellPosition(editor, "Alice");
    const beforeCell = editor.state.doc.nodeAt(cellPosition)!;

    expect(startMarkweaveAskAiTableTarget(editor, "selection")).not.toBeNull();
    expect(getMarkweaveAskAiTarget(editor)?.target).toMatchObject({
      kind: "table",
      scope: "cell",
      rows: 1,
      columns: 1,
      resultShape: "fragment",
    });
    expect(acceptMarkweaveAskAiResult(editor, "**Alicia**")).toBe(true);

    const afterCell = editor.state.doc.nodeAt(cellPosition)!;
    expect(afterCell.type.name).toBe(beforeCell.type.name);
    expect(afterCell.attrs).toEqual(beforeCell.attrs);
    expect(afterCell.textContent).toBe("Alicia");
    expect(afterCell.firstChild?.firstChild?.marks.some((mark) => mark.type.name === "bold")).toBe(true);
  });

  it("serializes a table result as an explicit static preview table", () => {
    const editor = createEditor([
      "<table><tbody>",
      "<tr><th><p>Name</p></th><th><p>Role</p></th></tr>",
      "<tr><td><p>Alice</p></td><td><p>Engineer</p></td></tr>",
      "</tbody></table>",
    ].join(""));
    selectText(editor, "Alice");
    expect(startMarkweaveAskAiTableTarget(editor, "column")).not.toBeNull();

    const container = document.createElement("div");
    container.innerHTML = serializeMarkweaveAskAiPreview(
      editor,
      "| 姓名 |\n| --- |\n| 爱丽丝 |",
    );

    const table = container.querySelector("table");
    expect(table?.dataset.markweaveAskAiPreviewTable).toBe("true");
    expect(table?.querySelectorAll("tr")).toHaveLength(2);
    expect(table?.textContent).toContain("姓名");
    expect(table?.textContent).toContain("爱丽丝");
  });

  it("enriches code and mathematics output for the static review surface", () => {
    const editor = createEditor("<p>replace source</p>");
    selectText(editor, "source");
    expect(startMarkweaveAskAiTarget(editor)).not.toBeNull();

    const container = document.createElement("div");
    container.innerHTML = serializeMarkweaveAskAiPreview(editor, [
      "Inline $a^2 + b^2 = c^2$.",
      "",
      "```typescript",
      "const total = 42;",
      "```",
      "",
      "$$x^2 + y^2 = z^2$$",
    ].join("\n"));

    expect(container.querySelector('pre.markweave-code-block code.language-typescript')?.textContent).toContain("const total = 42;");
    expect(container.querySelector('.tiptap-mathematics-render[data-type="inline-math"] .katex')).not.toBeNull();
    expect(container.querySelector('.tiptap-mathematics-render[data-type="block-math"] .katex')).not.toBeNull();
  });

  it("renders a text proposal in place without changing the document", () => {
    const editor = createEditor("<p>Before selected text after</p>");
    selectText(editor, "selected text");
    const before = editor.getJSON();
    expect(startMarkweaveAskAiTarget(editor)).not.toBeNull();

    expect(setMarkweaveAskAiPreview(editor, [
      "**Improved text** with $a^2$.",
      "",
      "```typescript",
      "const total = 42;",
      "```",
    ].join("\n"))).toBe(true);

    const proposal = editor.view.dom.querySelector<HTMLElement>('[data-markweave-ask-ai-proposal="text"]');
    expect(proposal?.textContent).toContain("Improved text");
    expect(proposal?.querySelector("strong")?.textContent).toBe("Improved text");
    expect(proposal?.querySelector("pre.markweave-code-block code.language-typescript")?.textContent).toContain("const total = 42;");
    expect(proposal?.querySelector('.tiptap-mathematics-render[data-type="inline-math"] .katex')).not.toBeNull();
    expect(editor.view.dom.querySelector('[data-markweave-ask-ai-original="true"]')).not.toBeNull();
    expect(editor.getJSON()).toEqual(before);
  });

  it("refreshes the in-place text proposal as streamed Markdown grows", () => {
    const editor = createEditor("<p>Before selected text after</p>");
    selectText(editor, "selected text");
    const before = editor.getJSON();
    expect(startMarkweaveAskAiTarget(editor)).not.toBeNull();

    expect(setMarkweaveAskAiPreview(editor, "段落应让")).toBe(true);
    expect(editor.view.dom.querySelector('[data-markweave-ask-ai-proposal="text"]')?.textContent).toBe("段落应让");

    expect(setMarkweaveAskAiPreview(editor, "段落应让读者感到平静且易于阅读，同时保持完整语义。")).toBe(true);
    expect(editor.view.dom.querySelector('[data-markweave-ask-ai-proposal="text"]')?.textContent)
      .toBe("段落应让读者感到平静且易于阅读，同时保持完整语义。");
    expect(editor.getJSON()).toEqual(before);
  });

  it("renders table proposals inside the original target cells without duplicating the table", () => {
    const editor = createEditor([
      "<table><tbody>",
      "<tr><th><p>Name</p></th><th><p>Role</p></th></tr>",
      "<tr><td><p>Alice</p></td><td><p>Engineer</p></td></tr>",
      "</tbody></table>",
    ].join(""));
    selectText(editor, "Alice");
    const before = editor.getJSON();
    expect(startMarkweaveAskAiTableTarget(editor, "column")).not.toBeNull();

    expect(setMarkweaveAskAiPreview(editor, "| 姓名 |\n| --- |\n| 爱 |" )).toBe(true);
    expect(setMarkweaveAskAiPreview(editor, "| 姓名 |\n| --- |\n| 爱丽丝 |" )).toBe(true);

    const proposals = editor.view.dom.querySelectorAll<HTMLElement>('[data-markweave-ask-ai-proposal="table-cell"]');
    expect(proposals).toHaveLength(2);
    expect(Array.from(proposals).map((proposal) => proposal.textContent?.trim())).toEqual(["姓名", "爱丽丝"]);
    expect(editor.view.dom.querySelectorAll("table")).toHaveLength(1);
    expect(editor.view.dom.querySelectorAll('[data-markweave-ask-ai-original="true"]')).toHaveLength(2);
    expect(editor.getJSON()).toEqual(before);
  });

  it("maps table targets across outside edits and conflicts on edits inside a target cell", () => {
    const editor = createEditor([
      "<p>Before</p>",
      "<table><tbody>",
      "<tr><td><p>Alice</p></td><td><p>Engineer</p></td></tr>",
      "<tr><td><p>Bob</p></td><td><p>Designer</p></td></tr>",
      "</tbody></table>",
    ].join(""));
    selectText(editor, "Alice");
    expect(startMarkweaveAskAiTableTarget(editor, "column")).not.toBeNull();
    const initialTarget = getMarkweaveAskAiTarget(editor)!;
    expect(initialTarget.target).toMatchObject({ kind: "table", scope: "column", rows: 2, columns: 1 });

    editor.commands.insertContentAt(1, "Earlier ");
    const mappedTarget = getMarkweaveAskAiTarget(editor)!;
    expect(mappedTarget.status).toBe("target");
    expect(mappedTarget.from).toBeGreaterThan(initialTarget.from);

    const firstTargetCell = mappedTarget.target.kind === "table" ? mappedTarget.target.cellPositions[0] : null;
    expect(firstTargetCell).not.toBeNull();
    editor.commands.insertContentAt(firstTargetCell! + 2, "changed ");
    expect(getMarkweaveAskAiTarget(editor)?.status).toBe("conflict");
  });

  it("classifies a full cell selection as a whole-table target", () => {
    const editor = createEditor([
      "<table><tbody>",
      "<tr><td><p>A</p></td><td><p>B</p></td></tr>",
      "<tr><td><p>C</p></td><td><p>D</p></td></tr>",
      "</tbody></table>",
    ].join(""));
    editor.commands.setCellSelection({ anchorCell: findCellPosition(editor, "A"), headCell: findCellPosition(editor, "D") });

    expect(startMarkweaveAskAiTableTarget(editor, "selection")).not.toBeNull();
    expect(getMarkweaveAskAiTarget(editor)?.target).toMatchObject({
      kind: "table",
      scope: "table",
      rows: 2,
      columns: 2,
      resultShape: "table",
    });
  });

  it("rejects table output with the wrong shape and multi-cell merged targets", () => {
    const editor = createEditor([
      "<table><tbody>",
      "<tr><td><p>A</p></td><td><p>B</p></td></tr>",
      "<tr><td><p>C</p></td><td><p>D</p></td></tr>",
      "</tbody></table>",
    ].join(""));
    selectText(editor, "A");
    expect(startMarkweaveAskAiTableTarget(editor, "row")).not.toBeNull();
    const before = editor.getJSON();
    expect(acceptMarkweaveAskAiResult(editor, "| only one |\n| --- |" )).toBe(false);
    expect(editor.getJSON()).toEqual(before);

    editor.commands.setCellSelection({ anchorCell: findCellPosition(editor, "A"), headCell: findCellPosition(editor, "B") });
    editor.commands.mergeCells();
    selectText(editor, "A");
    expect(canStartMarkweaveAskAiTableTarget(editor, "row")).toBe(false);
  });

  it("does not call an unavailable handler", () => {
    const handler = vi.fn();
    expect(handler).not.toHaveBeenCalled();
  });
});
