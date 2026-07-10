import type { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import {
  createMarkweaveEditorUpdatePayload,
  isMarkweaveControlledContentEchoCurrent,
} from "../src/editor-core/editor-content";
import { areEditorSelectionSnapshotsEquivalent, markweaveRuntimeProjectionDelayMs, type EditorSelectionSnapshot } from "../src/editor-core/selection-state";

function createEditorStub() {
  const doc = {};
  return {
    state: { doc },
    getHTML: vi.fn(() => "<p>Document</p>"),
    getJSON: vi.fn(() => ({ type: "doc" })),
    getMarkdown: vi.fn(() => "Document"),
    getText: vi.fn(() => "Document"),
  } as unknown as Editor;
}

const collapsedSelection: EditorSelectionSnapshot = {
  kind: "collapsed",
  from: 8,
  to: 8,
  empty: true,
  activeMarks: [],
  currentNode: "paragraph",
  ancestorNodes: ["doc", "paragraph"],
  inTable: false,
  surface: "collapsed",
  floatingToolbarVariant: "hidden",
};

describe("editor performance contract", () => {
  it("serializes update payload fields lazily and caches each requested representation", () => {
    const editor = createEditorStub();
    const payload = createMarkweaveEditorUpdatePayload(editor);

    expect(editor.getHTML).not.toHaveBeenCalled();
    expect(editor.getJSON).not.toHaveBeenCalled();
    expect(editor.getMarkdown).not.toHaveBeenCalled();
    expect(editor.getText).not.toHaveBeenCalled();

    expect(payload.markdown).toBe("Document");
    expect(payload.markdown).toBe("Document");
    expect(editor.getMarkdown).toHaveBeenCalledTimes(1);
    expect(editor.getHTML).not.toHaveBeenCalled();
    expect(editor.getJSON).not.toHaveBeenCalled();
    expect(editor.getText).not.toHaveBeenCalled();

    expect(payload.html).toContain("Document");
    expect(payload.json).toEqual({ type: "doc" });
    expect(payload.text).toBe("Document");
    expect(editor.getHTML).toHaveBeenCalledTimes(1);
    expect(editor.getJSON).toHaveBeenCalledTimes(1);
    expect(editor.getText).toHaveBeenCalledTimes(1);
  });

  it("accepts only an exact controlled echo from the current editor document", () => {
    const editor = createEditorStub();
    const echo = { content: "Document", format: "markdown" as const, doc: editor.state.doc };

    expect(isMarkweaveControlledContentEchoCurrent(editor, echo, "Document", "markdown")).toBe(true);
    expect(isMarkweaveControlledContentEchoCurrent(editor, echo, "External", "markdown")).toBe(false);
    expect(isMarkweaveControlledContentEchoCurrent(editor, echo, "Document", "html")).toBe(false);

    const changedEditor = { ...editor, state: { doc: {} } } as Editor;
    expect(isMarkweaveControlledContentEchoCurrent(changedEditor, echo, "Document", "markdown")).toBe(false);
  });

  it("keeps collapsed cursor moves in the same visual surface out of the framework render path", () => {
    expect(areEditorSelectionSnapshotsEquivalent(collapsedSelection, { ...collapsedSelection, from: 72, to: 72 })).toBe(true);
    expect(areEditorSelectionSnapshotsEquivalent(collapsedSelection, { ...collapsedSelection, currentNode: "codeBlock" })).toBe(false);
    expect(areEditorSelectionSnapshotsEquivalent(collapsedSelection, { ...collapsedSelection, kind: "range", empty: false, to: 12, surface: "text-range", floatingToolbarVariant: "default" })).toBe(false);
    expect(markweaveRuntimeProjectionDelayMs).toBe(120);
  });
});
