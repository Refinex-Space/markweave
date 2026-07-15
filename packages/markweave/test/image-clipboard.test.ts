// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { parseMarkweaveClipboardImages, sanitizeMarkweavePastedImageHtml } from "../src/plugins/media/image-clipboard";
import type { MarkweaveSlashCommandUploadHandler, MarkweaveUploadResult } from "../src/plugins/slash-command/upload";

let activeEditor: Editor | null = null;

function createEditor(onUpload?: MarkweaveSlashCommandUploadHandler) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions({ onImageUpload: onUpload }),
    content: "<p>Paste target</p>",
  });
  activeEditor.commands.setTextSelection(1);
  return activeEditor;
}

function dispatchPaste(
  editor: Editor,
  payload: {
    readonly files?: readonly File[];
    readonly html?: string;
    readonly text?: string;
  },
) {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: payload.files ?? [],
      getData: (type: string) => (type === "text/html" ? payload.html ?? "" : type === "text/plain" ? payload.text ?? "" : ""),
    },
  });

  let handled = false;
  editor.view.someProp("handlePaste", (handler) => {
    const didHandle = handler(editor.view, event, Slice.empty) === true;
    handled = handled || didHandle;
    return didHandle;
  });

  return { handled, defaultPrevented: event.defaultPrevented };
}

function imageAttrs(editor: Editor) {
  const images: Array<Record<string, unknown>> = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name === "image") {
      images.push(node.attrs);
      return false;
    }

    return true;
  });

  return images;
}

function firstImagePosition(editor: Editor) {
  let imagePosition: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "image") {
      imagePosition = pos;
      return false;
    }

    return imagePosition === null;
  });

  return imagePosition;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushAsyncUpload() {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Markweave image clipboard parsing", () => {
  it("prefers every image file over duplicate HTML and URL clipboard representations", () => {
    const first = new File(["a"], "first.png", { type: "image/png" });
    const second = new File(["b"], "second.jpg", { type: "image/jpeg" });

    expect(
      parseMarkweaveClipboardImages({
        files: [first, new File(["text"], "notes.txt", { type: "text/plain" }), second],
        getData: (type) => (type === "text/html" ? '<img src="https://example.com/duplicate.png">' : "https://example.com/duplicate.png"),
      }),
    ).toEqual([
      { type: "file", file: first },
      { type: "file", file: second },
    ]);
  });

  it("recognizes image-only HTML and keeps mixed rich HTML on the default paste path", () => {
    expect(
      parseMarkweaveClipboardImages({
        getData: (type) =>
          type === "text/html"
            ? '<div><a href="https://example.com"><img src="//cdn.example.com/a.png" alt="A"></a><br><img src="https://cdn.example.com/b.webp" title="B"></div>'
            : "",
      }),
    ).toEqual([
      { type: "remote", src: "https://cdn.example.com/a.png", alt: "A", title: undefined },
      { type: "remote", src: "https://cdn.example.com/b.webp", alt: undefined, title: "B" },
    ]);

    expect(
      parseMarkweaveClipboardImages({
        getData: (type) => (type === "text/html" ? '<p>说明 <img src="https://example.com/a.png"></p>' : "https://example.com/a.png"),
      }),
    ).toEqual([]);
  });

  it("accepts only standalone HTTP image URLs with a known extension", () => {
    const parseText = (text: string) =>
      parseMarkweaveClipboardImages({
        getData: (type) => (type === "text/plain" ? text : ""),
      });

    expect(parseText("https://cdn.example.com/image.avif?size=large#preview")).toEqual([
      { type: "remote", src: "https://cdn.example.com/image.avif?size=large#preview" },
    ]);
    expect(parseText("https://example.com/article")).toEqual([]);
    expect(parseText("blob:https://example.com/image.png")).toEqual([]);
    expect(parseText("file:///tmp/image.png")).toEqual([]);
    expect(parseText("javascript:alert(1).png")).toEqual([]);
    expect(parseText("https://example.com/a.png\nhttps://example.com/b.png")).toEqual([]);
  });

  it("sanitizes image sources inside mixed rich HTML without removing its text", () => {
    const html = sanitizeMarkweavePastedImageHtml(
      '<p>说明 <img src="//cdn.example.com/safe.png"><img src="file:///tmp/private.png"><img src="javascript:alert(1)"></p>',
    );

    expect(html).toContain("说明");
    expect(html).toContain('src="https://cdn.example.com/safe.png"');
    expect(html).not.toContain("private.png");
    expect(html).not.toContain("javascript:");
  });
});

describe("Markweave image clipboard behavior", () => {
  it("inserts every local image in clipboard order while uploads resolve out of order", async () => {
    const firstUpload = deferred<MarkweaveUploadResult>();
    const secondUpload = deferred<MarkweaveUploadResult>();
    const onUpload = vi
      .fn<MarkweaveSlashCommandUploadHandler>()
      .mockReturnValueOnce(firstUpload.promise)
      .mockReturnValueOnce(secondUpload.promise);
    const editor = createEditor(onUpload);
    const first = new File(["a"], "first.png", { type: "image/png" });
    const second = new File(["b"], "second.png", { type: "image/png" });

    expect(dispatchPaste(editor, { files: [first, second] })).toEqual({ handled: true, defaultPrevented: true });
    expect(imageAttrs(editor).map((attrs) => attrs.src)).toEqual([null, null]);
    expect(onUpload).toHaveBeenNthCalledWith(1, {
      kind: "image",
      source: { type: "file", file: first, mimeType: "image/png" },
      trigger: "image-insert",
    });
    expect(onUpload).toHaveBeenNthCalledWith(2, {
      kind: "image",
      source: { type: "file", file: second, mimeType: "image/png" },
      trigger: "image-insert",
    });

    secondUpload.resolve({ src: "asset://second", name: "second.png" });
    await flushAsyncUpload();
    expect(imageAttrs(editor).map((attrs) => attrs.src)).toEqual([null, "asset://second"]);

    firstUpload.resolve({ src: "asset://first", name: "first.png" });
    await flushAsyncUpload();
    expect(imageAttrs(editor).map((attrs) => attrs.src)).toEqual(["asset://first", "asset://second"]);
    expect(imageAttrs(editor).map((attrs) => attrs.alt)).toEqual(["first.png", "second.png"]);
  });

  it("inserts remote HTML and plain URL images without calling the host upload handler", () => {
    const onUpload = vi.fn<MarkweaveSlashCommandUploadHandler>();
    const editor = createEditor(onUpload);

    expect(dispatchPaste(editor, { html: '<img src="https://example.com/a.png" alt="A">' })).toEqual({ handled: true, defaultPrevented: true });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(dispatchPaste(editor, { text: "https://example.com/b.svg?theme=dark" })).toEqual({ handled: true, defaultPrevented: true });

    expect(imageAttrs(editor).map((attrs) => ({ src: attrs.src, alt: attrs.alt }))).toEqual([
      { src: "https://example.com/a.png", alt: "A" },
      { src: "https://example.com/b.svg?theme=dark", alt: null },
    ]);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("keeps a retryable empty image when upload fails", async () => {
    const upload = deferred<MarkweaveUploadResult>();
    const editor = createEditor(() => upload.promise);

    dispatchPaste(editor, { files: [new File(["a"], "failed.png", { type: "image/png" })] });
    upload.reject(new Error("upload failed"));
    await flushAsyncUpload();

    expect(imageAttrs(editor)).toHaveLength(1);
    expect(imageAttrs(editor)[0]?.src).toBeNull();
    expect(imageAttrs(editor)[0]?.clipboardPasteId).toBeNull();
  });

  it("removes the whole multi-image paste with one undo and ignores late upload results", async () => {
    const uploads = [deferred<MarkweaveUploadResult>(), deferred<MarkweaveUploadResult>()];
    const onUpload = vi
      .fn<MarkweaveSlashCommandUploadHandler>()
      .mockReturnValueOnce(uploads[0].promise)
      .mockReturnValueOnce(uploads[1].promise);
    const editor = createEditor(onUpload);

    dispatchPaste(editor, {
      files: [new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.png", { type: "image/png" })],
    });
    expect(imageAttrs(editor)).toHaveLength(2);
    expect(editor.commands.undo()).toBe(true);
    expect(imageAttrs(editor)).toHaveLength(0);

    uploads[0].resolve({ src: "asset://a" });
    uploads[1].resolve({ src: "asset://b" });
    await flushAsyncUpload();
    expect(imageAttrs(editor)).toHaveLength(0);
  });

  it("keeps completed upload updates inside the original single undo step", async () => {
    const editor = createEditor(async ({ source }) => ({ src: `asset://${source.file?.name}` }));

    dispatchPaste(editor, {
      files: [new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.png", { type: "image/png" })],
    });
    await flushAsyncUpload();
    expect(imageAttrs(editor).map((attrs) => attrs.src)).toEqual(["asset://a.png", "asset://b.png"]);

    expect(editor.commands.undo()).toBe(true);
    expect(imageAttrs(editor)).toHaveLength(0);
  });

  it("ignores an upload result after its placeholder is deleted", async () => {
    const upload = deferred<MarkweaveUploadResult>();
    const editor = createEditor(() => upload.promise);

    dispatchPaste(editor, { files: [new File(["a"], "a.png", { type: "image/png" })] });
    const pos = firstImagePosition(editor);
    expect(pos).not.toBeNull();
    const node = editor.state.doc.nodeAt(pos ?? -1);
    editor.view.dispatch(editor.state.tr.delete(pos ?? 0, (pos ?? 0) + (node?.nodeSize ?? 0)));
    expect(imageAttrs(editor)).toHaveLength(0);

    upload.resolve({ src: "asset://late" });
    await flushAsyncUpload();
    expect(imageAttrs(editor)).toHaveLength(0);
  });

  it("lets ordinary, mixed rich-text, and read-only paste fall through", () => {
    const editor = createEditor();

    expect(dispatchPaste(editor, { text: "ordinary paragraph" })).toEqual({ handled: false, defaultPrevented: false });
    expect(dispatchPaste(editor, { html: '<p>说明 <img src="https://example.com/a.png"></p>', text: "说明" })).toEqual({ handled: false, defaultPrevented: false });

    editor.setEditable(false);
    expect(dispatchPaste(editor, { text: "https://example.com/a.png" })).toEqual({ handled: false, defaultPrevented: false });
    expect(imageAttrs(editor)).toHaveLength(0);
  });
});
