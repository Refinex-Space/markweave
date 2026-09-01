// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveDocumentViewportCoordinator } from "../src/core/document-viewport";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { markweaveDocumentLoadMetaKey } from "../src/editor-core/document-load";
import { createMarkweaveSearchController } from "../src/plugins/search/search-controller";

let activeEditor: Editor | null = null;
const testCleanups: Array<() => void> = [];

interface FakeSearchWorker {
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
}

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
  } else {
    Reflect.deleteProperty(target, property);
  }
}

function installFakeWorker(
  onPostMessage: (worker: FakeSearchWorker, message: unknown) => void,
) {
  const workerDescriptor = Object.getOwnPropertyDescriptor(window, "Worker");
  const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(window.URL, "createObjectURL");
  const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(window.URL, "revokeObjectURL");

  class FakeWorker implements FakeSearchWorker {
    onerror: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;

    postMessage(message: unknown) {
      onPostMessage(this, message);
    }

    terminate() {}
  }

  Object.defineProperty(window, "Worker", {
    configurable: true,
    value: FakeWorker as unknown as typeof Worker,
  });
  Object.defineProperty(window.URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:markweave-search-test",
  });
  Object.defineProperty(window.URL, "revokeObjectURL", {
    configurable: true,
    value: () => undefined,
  });
  testCleanups.push(() => {
    restoreProperty(window, "Worker", workerDescriptor);
    restoreProperty(window.URL, "createObjectURL", createObjectUrlDescriptor);
    restoreProperty(window.URL, "revokeObjectURL", revokeObjectUrlDescriptor);
  });
}

function createEditor(content: string) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  activeEditor = new Editor({
    content,
    element,
    extensions: createMarkweaveEditorExtensions(),
  });
  return activeEditor;
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  testCleanups.splice(0).reverse().forEach((cleanup) => cleanup());
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("Markweave search controller", () => {
  it("highlights literal matches across inline marks and supports case and whole-word matching", () => {
    const editor = createEditor("<p>Alpha <strong>alpha</strong> ALPHA alphabet</p><p>Alpha</p>");
    const search = createMarkweaveSearchController(editor);

    search.setQuery("alpha");
    expect(search.getState()).toMatchObject({
      activeMatchIndex: 0,
      error: null,
      matchCount: 5,
      query: "alpha",
    });
    expect(editor.view.dom.querySelectorAll(".markweave-search-match")).toHaveLength(5);
    expect(editor.view.dom.querySelectorAll(".markweave-search-match--active")).toHaveLength(1);

    search.setOptions({ caseSensitive: true, wholeWord: true });
    expect(search.getState().matchCount).toBe(1);

    search.setQuery("alpha", { caseSensitive: false, wholeWord: true });
    expect(search.getState().matchCount).toBe(4);
  });

  it("navigates in both directions with wraparound and notifies subscribers", () => {
    const editor = createEditor("<p>one two one three one</p>");
    const search = createMarkweaveSearchController(editor);
    const listener = vi.fn();
    const unsubscribe = search.subscribe(listener);

    search.setQuery("one");
    expect(search.getState().activeMatchIndex).toBe(0);
    search.findPrevious();
    expect(search.getState().activeMatchIndex).toBe(2);
    search.findNext();
    expect(search.getState().activeMatchIndex).toBe(0);
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    const callCount = listener.mock.calls.length;
    search.findNext();
    expect(listener).toHaveBeenCalledTimes(callCount);
  });

  it("keeps the editor selection unchanged while revealing search matches", () => {
    const editor = createEditor("<p>one two one</p>");
    const search = createMarkweaveSearchController(editor);
    editor.commands.setTextSelection(5);
    const initialSelection = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };

    search.setQuery("one");
    expect(editor.state.selection).toMatchObject(initialSelection);

    search.findNext();
    expect(editor.state.selection).toMatchObject(initialSelection);
  });

  it("uses Unicode word segmentation for exact Chinese matches", () => {
    const editor = createEditor("<p>在文档中搜索内容，也可以搜索工作区。</p>");
    const search = createMarkweaveSearchController(editor);

    search.setQuery("搜索", { wholeWord: true });
    expect(search.getState().matchCount).toBe(2);
  });

  it("supports regex matching, capture-group replacement, and invalid-pattern errors", () => {
    const editor = createEditor("<p>foo-12 foo-34</p>");
    const search = createMarkweaveSearchController(editor);

    search.setQuery("(foo)-(\\d+)", { regex: true });
    expect(search.getState().matchCount).toBe(2);
    expect(search.replaceAll("$2:$1")).toBe(2);
    expect(editor.getText()).toContain("12:foo 34:foo");

    search.setQuery("(", { regex: true });
    expect(search.getState()).toMatchObject({
      activeMatchIndex: -1,
      matchCount: 0,
    });
    expect(search.getState().error).toBeTruthy();
  });

  it("isolates current replacement from adjacent typing history", () => {
    const editor = createEditor("<p>cat</p>");
    editor.commands.insertContentAt(1, "x");
    const search = createMarkweaveSearchController(editor);

    search.setQuery("cat");
    expect(search.replaceCurrent("dog")).toBe(true);
    expect(editor.getText()).toBe("xdog");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("xcat");
    expect(editor.commands.redo()).toBe(true);
    expect(editor.getText()).toBe("xdog");
  });

  it("isolates replace-all as one undoable history event", () => {
    const editor = createEditor("<p>cat</p>");
    editor.commands.insertContentAt(1, "x");
    const search = createMarkweaveSearchController(editor);

    search.setQuery("cat");
    expect(search.replaceAll("dog")).toBe(1);
    expect(editor.getText()).toBe("xdog");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("xcat");
    expect(editor.commands.redo()).toBe(true);
    expect(editor.getText()).toBe("xdog");
  });

  it("replaces the active match or every match and recomputes results after document changes", () => {
    const editor = createEditor("<p><strong>cat</strong> cat cat</p>");
    const search = createMarkweaveSearchController(editor);

    search.setQuery("cat");
    expect(search.replaceCurrent("dog")).toBe(true);
    expect(editor.getText()).toContain("dog cat cat");
    expect(search.getState().matchCount).toBe(2);
    expect(search.replaceAll("fox")).toBe(2);
    expect(editor.getText()).toContain("dog fox fox");
    expect(search.getState().matchCount).toBe(0);

    editor.commands.insertContentAt(editor.state.doc.content.size - 1, " cat");
    expect(search.getState().matchCount).toBe(1);
  });

  it("maps unchanged text segments and rebuilds only changed top-level content", () => {
    const editor = createEditor("<p>cat first</p><p>cat second</p><p>cat third</p>");
    const search = createMarkweaveSearchController(editor);
    search.setQuery("cat");
    expect(search.getState().matchCount).toBe(3);

    const secondParagraphPosition = editor.state.doc.child(0).nodeSize + 1;
    editor.commands.insertContentAt(
      { from: secondParagraphPosition, to: secondParagraphPosition + 3 },
      "dog",
    );

    expect(search.getState()).toMatchObject({
      error: null,
      execution: { revision: 1, status: "ready" },
      matchCount: 2,
    });
    expect(editor.view.dom.querySelectorAll(".markweave-search-match")).toHaveLength(2);
  });

  it("allows searching but blocks replacement when the editor is read-only", () => {
    const editor = createEditor("<p>locked locked</p>");
    const search = createMarkweaveSearchController(editor);
    editor.setEditable(false);

    search.setQuery("locked");
    expect(search.getState().matchCount).toBe(2);
    expect(search.replaceCurrent("changed")).toBe(false);
    expect(search.replaceAll("changed")).toBe(0);
    expect(editor.getText()).toContain("locked locked");
  });

  it("clears all decorations without changing the document", () => {
    const editor = createEditor("<p>keep keep</p>");
    const search = createMarkweaveSearchController(editor);

    search.setQuery("keep");
    search.clear();

    expect(search.getState()).toMatchObject({
      activeMatchIndex: -1,
      matchCount: 0,
      query: "",
    });
    expect(editor.view.dom.querySelectorAll(".markweave-search-match")).toHaveLength(0);
    expect(editor.getText()).toContain("keep keep");
  });

  it("cancels an in-flight reveal when a new query has no results or search is cleared", () => {
    const editor = createEditor("<p>one two</p>");
    editor.view.dom.classList.add("markweave-editor-surface");
    const viewport = createMarkweaveDocumentViewportCoordinator(editor);
    testCleanups.push(() => viewport.destroy());
    const revealSignals: AbortSignal[] = [];
    vi.spyOn(viewport, "revealPosition").mockImplementation((pos, options) => {
      if (options.signal) revealSignals.push(options.signal);
      return Promise.resolve({
        correctionCount: 0,
        finalErrorPx: 0,
        pos,
        status: "revealed",
      });
    });
    const search = createMarkweaveSearchController(editor);

    search.setQuery("one");
    expect(revealSignals).toHaveLength(1);
    search.setQuery("missing");
    expect(revealSignals[0].aborted).toBe(true);

    search.setQuery("one");
    expect(revealSignals).toHaveLength(2);
    search.clear();
    expect(revealSignals[1].aborted).toBe(true);
  });

  it("keeps every result while projecting at most 256 DOM decorations", () => {
    const editor = createEditor(`<p>${Array.from({ length: 10_000 }, () => "hit").join(" ")}</p>`);
    const search = createMarkweaveSearchController(editor);

    search.setQuery("hit");

    expect(search.getState()).toMatchObject({
      activeMatchIndex: 0,
      execution: { status: "ready" },
      matchCount: 10_000,
    });
    expect(editor.view.dom.querySelectorAll(".markweave-search-match")).toHaveLength(256);

    search.findPrevious();
    expect(search.getState().activeMatchIndex).toBe(9_999);
    expect(editor.view.dom.querySelectorAll(".markweave-search-match")).toHaveLength(256);
    expect(editor.view.dom.querySelectorAll(".markweave-search-match--active")).toHaveLength(1);
  });

  it("runs large-document searches cooperatively and cancels stale queries", async () => {
    const filler = "x".repeat(200_000);
    const editor = createEditor(`<p>alpha ${filler} beta beta</p>`);
    const search = createMarkweaveSearchController(editor);

    search.setQuery("alpha");
    expect(search.getState()).toMatchObject({
      execution: { revision: 0, status: "searching" },
      query: "alpha",
    });
    expect(search.replaceCurrent("blocked")).toBe(false);

    search.setQuery("beta");
    expect(search.findNext()).toBe(true);

    await vi.waitFor(
      () => {
        expect(search.getState()).toMatchObject({
          activeMatchIndex: 1,
          error: null,
          execution: { progress: 1, revision: 0, status: "ready" },
          matchCount: 2,
          query: "beta",
        });
      },
      { timeout: 5_000 },
    );
    expect(editor.getText()).not.toContain("blocked");
  });

  it("hydrates compact Worker matches without cloning the complete segment per result", async () => {
    let postedMessage: unknown = null;
    installFakeWorker((worker, message) => {
      postedMessage = message;
      const segment = (message as { segments: Array<{ text: string }> }).segments[0];
      const inputIndex = segment.text.indexOf("target");
      queueMicrotask(() => worker.onmessage?.(new MessageEvent("message", {
        data: {
          type: "result",
          matches: [{
            captures: [],
            groups: null,
            inputIndex,
            segmentIndex: 0,
            text: "target",
          }],
        },
      })));
    });
    const editor = createEditor(`<p>prefix target ${"x".repeat(200_000)}</p>`);
    const search = createMarkweaveSearchController(editor);

    search.setQuery("target");
    await vi.waitFor(() => expect(search.getState().execution?.status).toBe("ready"));
    expect(postedMessage).toMatchObject({ query: "target" });
    expect(search.getState().matchCount).toBe(1);
    expect(search.replaceCurrent("$`")).toBe(true);
    expect(editor.getText().startsWith("prefix prefix ")).toBe(true);
  });

  it("falls back to cooperative literal search after an asynchronous Worker failure", async () => {
    installFakeWorker((worker) => {
      queueMicrotask(() => worker.onerror?.(new Event("error")));
    });
    const editor = createEditor(`<p>target ${"x".repeat(200_000)}</p>`);
    const search = createMarkweaveSearchController(editor);

    search.setQuery("target");
    await vi.waitFor(() => {
      expect(search.getState()).toMatchObject({
        error: null,
        execution: { status: "ready" },
        matchCount: 1,
      });
    });
  });

  it("does not apply the regex timeout to a slow literal Worker search", async () => {
    vi.useFakeTimers();
    installFakeWorker((worker, message) => {
      const segment = (message as { segments: Array<{ text: string }> }).segments[0];
      const inputIndex = segment.text.indexOf("target");
      window.setTimeout(() => worker.onmessage?.(new MessageEvent("message", {
        data: {
          type: "result",
          matches: [{
            captures: [],
            groups: null,
            inputIndex,
            segmentIndex: 0,
            text: "target",
          }],
        },
      })), 2_500);
    });
    const editor = createEditor(`<p>target ${"x".repeat(200_000)}</p>`);
    const search = createMarkweaveSearchController(editor);

    search.setQuery("target");
    await vi.advanceTimersByTimeAsync(2_001);
    expect(search.getState().execution?.status).toBe("searching");
    await vi.advanceTimersByTimeAsync(500);
    expect(search.getState()).toMatchObject({
      error: null,
      execution: { status: "ready" },
      matchCount: 1,
    });
  });

  it("terminates a timed-out regex Worker with a visible error", async () => {
    vi.useFakeTimers();
    installFakeWorker(() => undefined);
    const editor = createEditor(`<p>target ${"x".repeat(200_000)}</p>`);
    const search = createMarkweaveSearchController(editor);

    search.setQuery("target", { regex: true });
    await vi.advanceTimersByTimeAsync(2_001);
    expect(search.getState()).toMatchObject({
      execution: { status: "error" },
      matchCount: 0,
    });
    expect(search.getState().error).toContain("timed out after 2000ms");
  });

  it("routes complex regex off the main thread and rejects it when Worker is unavailable", async () => {
    const editor = createEditor(`<p>${"a".repeat(20_000)}!</p>`);
    const search = createMarkweaveSearchController(editor);

    search.setQuery("(a+)+$", { regex: true });
    await vi.waitFor(() => expect(search.getState().execution?.status).toBe("error"));
    expect(search.getState().error).toContain("requires Web Worker support");
  });

  it("blocks replacement until results match the current document revision", async () => {
    const filler = "x".repeat(200_000);
    const editor = createEditor(`<p>target ${filler}</p>`);
    const search = createMarkweaveSearchController(editor);

    search.setQuery("target");
    await vi.waitFor(() => expect(search.getState().execution?.status).toBe("ready"), {
      timeout: 5_000,
    });
    const initialRevision = search.getState().execution?.revision;

    editor.commands.insertContentAt(editor.state.doc.content.size - 1, " target");
    expect(search.getState()).toMatchObject({
      execution: { status: "searching" },
    });
    expect(search.getState().execution?.revision).toBe((initialRevision ?? 0) + 1);
    expect(search.replaceAll("changed")).toBe(0);

    await vi.waitFor(
      () => {
        expect(search.getState()).toMatchObject({
          execution: { status: "ready" },
          matchCount: 2,
        });
      },
      { timeout: 5_000 },
    );
  });

  it("defers rebuilding the search index until progressive document loading completes", () => {
    const editor = createEditor("<p>target</p>");
    const search = createMarkweaveSearchController(editor);
    search.setQuery("target");

    editor.view.dispatch(
      editor.state.tr
        .insertText(" target", editor.state.doc.content.size - 1)
        .setMeta(markweaveDocumentLoadMetaKey, { phase: "mounting" }),
    );
    expect(search.getState()).toMatchObject({
      execution: { status: "searching" },
      matchCount: 1,
    });

    search.setQuery("target");
    expect(search.getState()).toMatchObject({
      execution: { status: "searching" },
      matchCount: 0,
    });
    expect(search.findNext()).toBe(true);

    editor.view.dispatch(
      editor.state.tr.setMeta(markweaveDocumentLoadMetaKey, { phase: "complete" }),
    );
    expect(search.getState()).toMatchObject({
      activeMatchIndex: 1,
      execution: { status: "ready" },
      matchCount: 2,
    });
  });

  it("resumes a queued search after progressive document loading is cancelled", () => {
    const editor = createEditor("<p>target</p>");
    const search = createMarkweaveSearchController(editor);

    editor.view.dispatch(
      editor.state.tr
        .insertText(" target", editor.state.doc.content.size - 1)
        .setMeta(markweaveDocumentLoadMetaKey, { phase: "mounting" }),
    );
    search.setQuery("target");
    expect(search.findNext()).toBe(true);

    editor.view.dispatch(
      editor.state.tr.setMeta(markweaveDocumentLoadMetaKey, {
        outcome: "cancelled",
        phase: "complete",
      }),
    );
    expect(search.getState()).toMatchObject({
      activeMatchIndex: 1,
      error: null,
      execution: { status: "ready" },
      matchCount: 2,
    });
  });
});
