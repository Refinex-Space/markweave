// @vitest-environment jsdom

import { EditorContent } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMarkweaveEditorController, type MarkweaveEditorController, type MarkweaveEditorMode, type MarkweaveLang } from "@markweave/react";
import type { MarkweaveSlashCommandUploadHandler } from "../src/plugins/slash-command/upload";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let activeRoot: Root | null = null;
let activeController: MarkweaveEditorController | null = null;

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

function installLayoutMocks() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => createRect(0, 0, 800, 500));
}

function Harness({
  defaultContent,
  lang,
  mode,
  onReady,
  onUpload,
}: {
  readonly defaultContent: string;
  readonly lang?: MarkweaveLang;
  readonly mode?: MarkweaveEditorMode;
  readonly onReady: (controller: MarkweaveEditorController) => void;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
}) {
  const controller = useMarkweaveEditorController({
    defaultContent,
    lang,
    mode,
    onSlashCommandUpload: onUpload,
  });

  useEffect(() => {
    if (controller.editor) {
      onReady(controller);
    }
  }, [controller, onReady]);

  return controller.editor ? createElement("section", controller.frameProps, createElement(EditorContent, { editor: controller.editor })) : null;
}

async function flushReact() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function renderEditor(defaultContent = "<p></p>", onUpload?: MarkweaveSlashCommandUploadHandler, lang?: MarkweaveLang, mode?: MarkweaveEditorMode) {
  installLayoutMocks();
  const host = document.createElement("div");
  document.body.appendChild(host);
  activeRoot = createRoot(host);

  await act(async () => {
    activeRoot?.render(
      createElement(Harness, {
        defaultContent,
        lang,
        mode,
        onReady: (controller: MarkweaveEditorController) => {
          activeController = controller;
        },
        onUpload,
      }),
    );
  });
  await flushReact();

  if (!activeController?.editor) {
    throw new Error("Expected editor controller.");
  }

  return activeController;
}

async function insertEmptyVideo(controller: MarkweaveEditorController) {
  await act(async () => {
    controller.editor?.commands.insertContent({
      type: "markweaveVideo",
      attrs: {
        src: null,
      },
    });
  });
  await flushReact();
}

function getByTestId<T extends HTMLElement = HTMLElement>(testId: string) {
  const element = document.querySelector<T>(`[data-testid="${testId}"]`);

  if (!element) {
    throw new Error(`Expected test id "${testId}".`);
  }

  return element;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flushReact();
}

async function keyDown(element: Element, key: string) {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  await flushReact();
}

async function inputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, data: value, inputType: "insertText" }));
    input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  });
  await flushReact();
}

async function changeFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
  });

  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  });
  await flushReact();
}

afterEach(() => {
  activeRoot?.unmount();
  activeRoot = null;
  activeController?.editor?.destroy();
  activeController = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("video node view", () => {
  it("renders the video upload placeholder and inserts a direct video URL", async () => {
    const controller = await renderEditor();

    await insertEmptyVideo(controller);
    expect(getByTestId("markweave-video-upload-placeholder")).not.toBeNull();
    expect(getByTestId("markweave-video-upload-placeholder").textContent).toContain("点击上传");

    await inputValue(getByTestId<HTMLInputElement>("markweave-video-url-input"), " https://cdn.example.com/media/demo.mp4 ");
    await click(getByTestId("markweave-video-upload-submit"));

    const video = document.querySelector<HTMLVideoElement>("video.markweave-video");
    const videoNode = getByTestId("markweave-video-node");
    expect(video?.getAttribute("src")).toBe("https://cdn.example.com/media/demo.mp4");
    expect(controller.editor?.getHTML()).toContain('data-markweave-video="true"');

    if (!video) {
      throw new Error("Expected direct video element.");
    }

    await act(async () => {
      controller.editor?.commands.setTextSelection(1);
    });
    await flushReact();
    expect(videoNode.dataset.selected).toBe("false");

    await click(video);
    expect(videoNode.dataset.selected).toBe("false");
  });

  it("uses the host upload handler for local video files", async () => {
    const onUpload = vi.fn<MarkweaveSlashCommandUploadHandler>((request) => ({
      src: "blob:markweave-video",
      name: request.source.file?.name,
      mimeType: request.source.file?.type,
    }));
    const controller = await renderEditor("<p></p>", onUpload);

    await insertEmptyVideo(controller);
    await changeFile(getByTestId<HTMLInputElement>("markweave-video-file-input"), new File(["video"], "clip.mp4", { type: "video/mp4" }));

    expect(onUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "video",
        trigger: "video-insert",
        source: expect.objectContaining({ type: "file", mimeType: "video/mp4" }),
      }),
    );
    expect(document.querySelector("video.markweave-video")?.getAttribute("src")).toBe("blob:markweave-video");
  });

  it("renders YouTube and Bilibili URLs as embedded players", async () => {
    const controller = await renderEditor();

    await insertEmptyVideo(controller);
    await inputValue(getByTestId<HTMLInputElement>("markweave-video-url-input"), "https://youtu.be/dQw4w9WgXcQ");
    await click(getByTestId("markweave-video-upload-submit"));

    const youtubeFrame = document.querySelector<HTMLIFrameElement>("iframe.markweave-video-iframe");
    expect(youtubeFrame?.getAttribute("src")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(youtubeFrame?.getAttribute("allow")).not.toContain("autoplay");
    expect(youtubeFrame?.dataset.markweaveVideoProvider).toBe("youtube");

    await act(async () => {
      controller.editor?.commands.clearContent();
    });
    await flushReact();

    await insertEmptyVideo(controller);
    await inputValue(getByTestId<HTMLInputElement>("markweave-video-url-input"), "https://www.bilibili.com/video/BV1xx411c7mD/?p=2");
    await click(getByTestId("markweave-video-upload-submit"));

    const bilibiliFrame = document.querySelector<HTMLIFrameElement>("iframe.markweave-video-iframe");
    expect(bilibiliFrame?.getAttribute("src")).toBe("https://player.bilibili.com/player.html?bvid=BV1xx411c7mD&p=2&autoplay=0");
    expect(bilibiliFrame?.getAttribute("allow")).not.toContain("autoplay");
    expect(bilibiliFrame?.dataset.markweaveVideoProvider).toBe("bilibili");
    expect(controller.editor?.getHTML()).toContain('data-markweave-video-embed="true"');
  });

  it("preserves original platform embed source URLs and query strings", async () => {
    const controller = await renderEditor();

    await insertEmptyVideo(controller);
    await inputValue(getByTestId<HTMLInputElement>("markweave-video-url-input"), "https://www.youtube.com/embed/fPiUC5NxFic?si=GifL60l94AOaMV93");
    await click(getByTestId("markweave-video-upload-submit"));

    const youtubeFrame = document.querySelector<HTMLIFrameElement>("iframe.markweave-video-iframe");
    expect(youtubeFrame?.getAttribute("src")).toBe("https://www.youtube.com/embed/fPiUC5NxFic?si=GifL60l94AOaMV93");
    expect(youtubeFrame?.dataset.markweaveVideoProvider).toBe("youtube");

    await act(async () => {
      controller.editor?.commands.clearContent();
    });
    await flushReact();

    await insertEmptyVideo(controller);
    await inputValue(
      getByTestId<HTMLInputElement>("markweave-video-url-input"),
      "//player.bilibili.com/player.html?isOutside=true&aid=116254899899358&bvid=BV18nwkzoEMk&cid=38742722382&p=1",
    );
    await click(getByTestId("markweave-video-upload-submit"));

    const bilibiliFrame = document.querySelector<HTMLIFrameElement>("iframe.markweave-video-iframe");
    expect(bilibiliFrame?.getAttribute("src")).toBe(
      "https://player.bilibili.com/player.html?isOutside=true&aid=116254899899358&bvid=BV18nwkzoEMk&cid=38742722382&p=1&autoplay=0",
    );
    expect(bilibiliFrame?.dataset.markweaveVideoProvider).toBe("bilibili");
  });

  it("disables explicit autoplay on platform embeds", async () => {
    const controller = await renderEditor();

    await insertEmptyVideo(controller);
    await inputValue(getByTestId<HTMLInputElement>("markweave-video-url-input"), "https://www.youtube.com/embed/fPiUC5NxFic?autoplay=1&si=GifL60l94AOaMV93");
    await click(getByTestId("markweave-video-upload-submit"));

    const youtubeFrame = document.querySelector<HTMLIFrameElement>("iframe.markweave-video-iframe");
    expect(youtubeFrame?.getAttribute("src")).toBe("https://www.youtube.com/embed/fPiUC5NxFic?autoplay=0&si=GifL60l94AOaMV93");
    expect(youtubeFrame?.getAttribute("allow")).not.toContain("autoplay");
    expect(controller.editor?.getHTML()).not.toContain("autoplay=1");
  });

  it("selects an embedded video on click and deletes it with the Delete key", async () => {
    const controller = await renderEditor();

    await insertEmptyVideo(controller);
    await inputValue(getByTestId<HTMLInputElement>("markweave-video-url-input"), "https://www.youtube.com/embed/fPiUC5NxFic?si=GifL60l94AOaMV93");
    await click(getByTestId("markweave-video-upload-submit"));

    const videoNode = getByTestId("markweave-video-node");
    const youtubeFrame = document.querySelector<HTMLIFrameElement>("iframe.markweave-video-iframe");
    const selectionLayer = getByTestId("markweave-video-selection-layer");

    if (!youtubeFrame) {
      throw new Error("Expected YouTube iframe.");
    }

    await act(async () => {
      controller.editor?.commands.setTextSelection(1);
    });
    await flushReact();
    expect(videoNode.dataset.selected).toBe("false");

    await click(youtubeFrame);
    expect(videoNode.dataset.selected).toBe("false");

    await click(selectionLayer);
    expect(controller.editor?.state.selection).toBeInstanceOf(NodeSelection);
    expect(controller.editor?.state.selection.$from.nodeAfter?.type.name).toBe("markweaveVideo");
    expect(videoNode.dataset.selected).toBe("true");

    if (!controller.editor) {
      throw new Error("Expected editor.");
    }

    await keyDown(controller.editor.view.dom, "Delete");
    expect(document.querySelector("iframe.markweave-video-iframe")).toBeNull();
    expect(controller.editor.getHTML()).not.toContain("fPiUC5NxFic");
  });

  it("renders video content without selection and delete controls in View mode", async () => {
    const controller = await renderEditor(
      '<iframe class="markweave-video-iframe" src="https://www.youtube.com/embed/fPiUC5NxFic?si=GifL60l94AOaMV93" data-markweave-video-embed="true" data-markweave-video-provider="youtube" data-markweave-video-src="https://www.youtube.com/embed/fPiUC5NxFic?si=GifL60l94AOaMV93"></iframe>',
      undefined,
      undefined,
      "view",
    );

    expect(controller.editor?.isEditable).toBe(false);
    expect(document.querySelector("iframe.markweave-video-iframe")?.getAttribute("src")).toBe("https://www.youtube.com/embed/fPiUC5NxFic?si=GifL60l94AOaMV93");
    expect(document.querySelector('[data-testid="markweave-video-selection-layer"]')).toBeNull();
    expect(getByTestId("markweave-video-node").dataset.selected).toBe("false");

    await keyDown(getByTestId("markweave-video-node"), "Delete");
    expect(document.querySelector("iframe.markweave-video-iframe")).not.toBeNull();
    expect(controller.editor?.getHTML()).toContain("fPiUC5NxFic");
  });

  it("keeps the placeholder visible for unsupported video URLs", async () => {
    const controller = await renderEditor();

    await insertEmptyVideo(controller);
    await inputValue(getByTestId<HTMLInputElement>("markweave-video-url-input"), "https://example.com/watch");
    await click(getByTestId("markweave-video-upload-submit"));

    expect(getByTestId("markweave-video-upload-placeholder")).not.toBeNull();
    expect(document.querySelector("video.markweave-video")).toBeNull();
    expect(controller.editor?.getHTML()).toContain('data-markweave-video-empty="true"');
    expect(document.querySelector(".markweave-video-upload-error")?.textContent).toContain("请输入 YouTube");
  });

  it("renders English video placeholder copy when lang is en", async () => {
    const controller = await renderEditor("<p></p>", undefined, "en");

    await insertEmptyVideo(controller);

    expect(getByTestId("markweave-video-upload-placeholder").textContent).toContain("Click to upload");
  });
});
