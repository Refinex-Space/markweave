// @vitest-environment jsdom

import { EditorContent } from "@tiptap/react";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMarkweaveEditorController, type MarkweaveEditorController, type MarkweaveEditorMode, type MarkweaveLang, type MarkweaveMediaSourceResolver } from "@markweave/react";
import { setMarkweaveEditorModeState } from "../src/core/editor-mode-state";
import type { MarkweaveSlashCommandUploadHandler } from "../src/plugins/slash-command/upload";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let activeRoot: Root | null = null;
let activeController: MarkweaveEditorController | null = null;
let lightweightImageRect: DOMRect | null = null;

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
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect(this: HTMLElement) {
    if (this.classList.contains("markweave-editor-surface")) {
      return createRect(0, 0, 800, 500);
    }

    if (this.classList.contains("markweave-image-box")) {
      return createRect(0, 0, 400, 240);
    }

    if (
      this.classList.contains("markweave-image-node") &&
      lightweightImageRect
    ) {
      return lightweightImageRect;
    }

    return createRect(0, 0, 120, 40);
  });
}

function Harness({
  defaultContent,
  lang,
  mode,
  onReady,
  onUpload,
  resolveMediaSource,
}: {
  readonly defaultContent: string;
  readonly lang?: MarkweaveLang;
  readonly mode?: MarkweaveEditorMode;
  readonly onReady: (controller: MarkweaveEditorController) => void;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
  readonly resolveMediaSource?: MarkweaveMediaSourceResolver;
}) {
  const controller = useMarkweaveEditorController({
    defaultContent,
    lang,
    mode,
    onSlashCommandUpload: onUpload,
    resolveMediaSource,
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

function installStalledIntersectionObserver() {
  const observe = vi.fn();
  vi.stubGlobal("IntersectionObserver", class StalledIntersectionObserver {
    readonly root = null;
    readonly rootMargin = "300% 0px";
    readonly thresholds = [0];
    readonly disconnect = vi.fn();
    readonly observe = observe;
    readonly takeRecords = vi.fn(() => []);
    readonly unobserve = vi.fn();
  });
  return observe;
}

async function completeLightweightImageLoad() {
  const image = document.querySelector<HTMLImageElement>("img.markweave-image");
  if (!image) {
    throw new Error("Expected lightweight image.");
  }
  await act(async () => {
    image.dispatchEvent(new Event("load"));
  });
  await flushReact();
  return image;
}

async function renderEditor(defaultContent = "<p></p>", onUpload?: MarkweaveSlashCommandUploadHandler, lang?: MarkweaveLang, mode?: MarkweaveEditorMode, resolveMediaSource?: MarkweaveMediaSourceResolver) {
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
        resolveMediaSource,
      }),
    );
  });
  await flushReact();

  if (!activeController?.editor) {
    throw new Error("Expected editor controller.");
  }

  return activeController;
}

async function insertEmptyImage(controller: MarkweaveEditorController) {
  await act(async () => {
    controller.editor?.commands.insertContent({
      type: "image",
      attrs: {
        src: null,
        align: "center",
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
  lightweightImageRect = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("image node view", () => {
  it("renders the image upload placeholder and inserts an image from a URL", async () => {
    const controller = await renderEditor();

    await insertEmptyImage(controller);
    expect(getByTestId("markweave-image-upload-placeholder")).not.toBeNull();
    expect(getByTestId("markweave-image-upload-placeholder").textContent).toContain("点击上传");

    await inputValue(getByTestId<HTMLInputElement>("markweave-image-url-input"), " https://example.com/image.png ");
    await click(getByTestId("markweave-image-upload-submit"));

    expect(document.querySelector("img.markweave-image")?.getAttribute("src")).toBe("https://example.com/image.png");
    expect(controller.editor?.getHTML()).toContain('src="https://example.com/image.png"');
  });

  it("uses the host upload handler for local image files", async () => {
    const onUpload = vi.fn<MarkweaveSlashCommandUploadHandler>((request) => ({
      src: "blob:markweave-image",
      name: request.source.file?.name,
      mimeType: request.source.file?.type,
    }));
    const controller = await renderEditor("<p></p>", onUpload);

    await insertEmptyImage(controller);
    await changeFile(getByTestId<HTMLInputElement>("markweave-image-file-input"), new File(["image"], "photo.png", { type: "image/png" }));

    expect(onUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "image",
        trigger: "image-insert",
        source: expect.objectContaining({ type: "file", mimeType: "image/png" }),
      }),
    );
    expect(document.querySelector("img.markweave-image")?.getAttribute("src")).toBe("blob:markweave-image");
  });

  it("keeps the original image when replace is cancelled and updates it after confirm", async () => {
    const controller = await renderEditor('<p>before</p><img src="https://example.com/old.png" alt="Old"><p>after</p>');

    await click(getByTestId("markweave-image-replace"));
    expect(getByTestId("markweave-image-upload-placeholder")).not.toBeNull();

    await click(getByTestId("markweave-image-upload-cancel"));
    expect(document.querySelector("img.markweave-image")?.getAttribute("src")).toBe("https://example.com/old.png");

    await click(getByTestId("markweave-image-replace"));
    await inputValue(getByTestId<HTMLInputElement>("markweave-image-url-input"), "https://example.com/new.png");
    await click(getByTestId("markweave-image-upload-submit"));

    expect(document.querySelector("img.markweave-image")?.getAttribute("src")).toBe("https://example.com/new.png");
    expect(controller.editor?.getHTML()).toContain('src="https://example.com/new.png"');
  });

  it("runs toolbar caption, download, resize, alignment, and delete actions", async () => {
    const controller = await renderEditor('<img src="https://example.com/toolbar.png" alt="Toolbar">');
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    await click(getByTestId("markweave-image-align-right"));
    expect(getByTestId("markweave-image-node").dataset.align).toBe("right");
    expect(getByTestId("markweave-image-align-right").getAttribute("aria-label")).toBe("图片右对齐");

    await click(getByTestId("markweave-image-caption"));
    expect(getByTestId<HTMLInputElement>("markweave-image-caption-input").placeholder).toBe("写入题注...");
    await inputValue(getByTestId<HTMLInputElement>("markweave-image-caption-input"), "A useful caption");
    expect(controller.editor?.getHTML()).toContain("<figcaption");
    expect(controller.editor?.getHTML()).toContain("A useful caption");

    await click(getByTestId("markweave-image-download"));
    expect(anchorClick).toHaveBeenCalledTimes(1);

    await act(async () => {
      getByTestId("markweave-image-resize-right").dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 400 }));
      window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, cancelable: true, clientX: 500 }));
      window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, clientX: 500 }));
    });
    await flushReact();
    expect(controller.editor?.getJSON().content?.[0]?.attrs?.width).toBe(500);

    await click(getByTestId("markweave-image-delete"));
    expect(controller.editor?.getHTML()).not.toContain("toolbar.png");
  });

  it("renders English image placeholder and toolbar copy when lang is en", async () => {
    const controller = await renderEditor("<p></p>", undefined, "en");

    await insertEmptyImage(controller);

    expect(getByTestId("markweave-image-upload-placeholder").textContent).toContain("Click to upload");

    await inputValue(getByTestId<HTMLInputElement>("markweave-image-url-input"), "https://example.com/image.png");
    await click(getByTestId("markweave-image-upload-submit"));

    expect(getByTestId("markweave-image-align-right").getAttribute("aria-label")).toBe("Image align right");
  });

  it("renders image content without editing controls in View mode", async () => {
    const controller = await renderEditor('<figure data-markweave-image="true"><img src="https://example.com/view.png" alt="View"><figcaption>Read-only caption</figcaption></figure>', undefined, undefined, "view");

    expect(controller.editor?.isEditable).toBe(false);
    expect(getByTestId("markweave-image-node").dataset.selected).toBe("false");
    expect(document.querySelector('[data-testid="markweave-image-toolbar"]')).toBeNull();
    expect(document.querySelector('[data-testid="markweave-image-resize-left"]')).toBeNull();
    expect(document.querySelector('[data-testid="markweave-image-caption-input"]')).toBeNull();
    expect(getByTestId("markweave-image-caption").textContent).toBe("Read-only caption");
  });

  it("resolves a mounted first-screen image when Chromium 106 delays the initial observer callback", async () => {
    const observe = installStalledIntersectionObserver();
    let finishResolve!: (value: { src: string; width: number; height: number }) => void;
    const deferredSource = new Promise<{ src: string; width: number; height: number }>((resolve) => {
      finishResolve = resolve;
    });
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>(() => deferredSource);
    const controller = await renderEditor(
      '<img src="madora-asset://hash" alt="Asset">',
      undefined,
      undefined,
      undefined,
      resolveMediaSource,
    );
    await flushReact();

    const image = document.querySelector<HTMLImageElement>("img.markweave-image");
    const imageNode = document.querySelector<HTMLElement>(
      '[data-markweave-lightweight-image="true"]',
    );
    const placeholder = document.querySelector<HTMLElement>(
      ".markweave-image-readonly-empty",
    );
    expect(
      imageNode,
    ).not.toBeNull();
    expect(
      document.querySelector('[data-testid="markweave-image-upload-placeholder"]'),
    ).toBeNull();
    expect(resolveMediaSource).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "image",
        priority: "visible",
        src: "madora-asset://hash",
      }),
    );
    expect(observe).toHaveBeenCalledWith(imageNode);
    expect(imageNode?.dataset.mediaState).toBe("pending");
    expect(imageNode?.getAttribute("aria-busy")).toBe("true");
    expect(image?.hidden).toBe(true);
    expect(placeholder?.hidden).toBe(false);
    expect(image?.hasAttribute("src")).toBe(false);

    finishResolve({
      src: "asset://resolved/image.png",
      width: 640,
      height: 360,
    });
    await flushReact();

    expect(image?.src).toContain("asset://resolved/image.png");
    expect(imageNode?.dataset.mediaState).toBe("pending");
    expect(image?.hidden).toBe(true);
    await completeLightweightImageLoad();
    expect(imageNode?.dataset.mediaState).toBe("resolved");
    expect(imageNode?.hasAttribute("aria-busy")).toBe(false);
    expect(image?.hidden).toBe(false);
    expect(placeholder?.hidden).toBe(true);
    expect(image?.getAttribute("loading")).toBe("lazy");
    expect(image?.getAttribute("decoding")).toBe("async");
    expect(image?.getAttribute("width")).toBe("640");
    expect(image?.getAttribute("height")).toBe("360");
    expect(controller.editor?.getHTML()).toContain('src="madora-asset://hash"');
  });

  it("rechecks an unresolved image when an Electron host window regains focus", async () => {
    installStalledIntersectionObserver();
    lightweightImageRect = createRect(0, window.innerHeight * 5, 400, 240);
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>(() => ({
      src: "asset://resolved/focus.png",
    }));

    await renderEditor(
      '<p>Before</p><img src="madora-asset://focus" alt="Focus recovery">',
      undefined,
      undefined,
      "view",
      resolveMediaSource,
    );
    await flushReact();
    expect(resolveMediaSource).not.toHaveBeenCalled();

    lightweightImageRect = createRect(0, 120, 400, 240);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await flushReact();

    expect(resolveMediaSource).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: "visible",
        src: "madora-asset://focus",
      }),
    );
  });

  it("opens resolved lightweight images from the View mode preview action", async () => {
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>(() => ({
      src: "https://example.com/resolved-view.png",
      width: 640,
      height: 360,
    }));
    await renderEditor(
      '<img src="madora-asset://view" alt="Resolved view">',
      undefined,
      undefined,
      "view",
      resolveMediaSource,
    );
    await flushReact();
    await completeLightweightImageLoad();

    expect(
      document.querySelector('[data-markweave-lightweight-image="true"]'),
    ).not.toBeNull();
    const preview = getByTestId("markweave-image-preview");
    expect(preview.classList.contains("markweave-image-preview-trigger")).toBe(true);
    expect(preview.getAttribute("aria-label")).toBe("预览图片");

    await click(preview);

    const layer = getByTestId("markweave-image-preview-layer");
    expect(layer.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/resolved-view.png",
    );
    expect(layer.querySelector("img")?.getAttribute("alt")).toBe("Resolved view");
  });

  it("syncs the lightweight image preview action when editor mode changes", async () => {
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>(() => ({
      src: "https://example.com/mode-switch.png",
    }));
    const controller = await renderEditor(
      '<img src="madora-asset://mode-switch" alt="Mode switch">',
      undefined,
      undefined,
      "live",
      resolveMediaSource,
    );
    await flushReact();
    await completeLightweightImageLoad();

    expect(document.querySelector(".markweave-image-preview-trigger")).toBeNull();

    await act(async () => {
      controller.editor?.setEditable(false);
      if (controller.editor) {
        setMarkweaveEditorModeState(controller.editor, {
          mode: "view",
          editable: false,
        });
      }
    });
    await flushReact();

    expect(document.querySelector(".markweave-image-preview-trigger")).not.toBeNull();

    await act(async () => {
      controller.editor?.setEditable(true);
      if (controller.editor) {
        setMarkweaveEditorModeState(controller.editor, {
          mode: "live",
          editable: true,
        });
      }
    });
    await flushReact();

    expect(document.querySelector(".markweave-image-preview-trigger")).toBeNull();
  });

  it("keeps rich image controls available for resolved lightweight images", async () => {
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>(() => ({
      src: "asset://resolved/controls.png",
      width: 640,
      height: 360,
    }));
    const controller = await renderEditor(
      '<p>Before</p><img src="madora-asset://controls" alt="Controls">',
      undefined,
      undefined,
      undefined,
      resolveMediaSource,
    );
    await flushReact();

    let imagePos: number | null = null;
    controller.editor?.state.doc.descendants((node, pos) => {
      if (node.type.name === "image") {
        imagePos = pos;
        return false;
      }
      return undefined;
    });
    await act(async () => {
      controller.editor?.commands.setNodeSelection(imagePos ?? 0);
    });
    await flushReact();

    expect(getByTestId("markweave-image-toolbar").querySelectorAll("svg")).toHaveLength(8);
    expect(getByTestId("markweave-image-align-center").dataset.active).toBe("true");
    expect(getByTestId("markweave-image-resize-left")).not.toBeNull();
    expect(getByTestId("markweave-image-resize-right")).not.toBeNull();

    await click(getByTestId("markweave-image-align-right"));
    expect(getByTestId("markweave-image-node").dataset.align).toBe("right");
    expect(getByTestId("markweave-image-align-right").dataset.active).toBe("true");

    await click(getByTestId("markweave-image-caption"));
    const captionInput = getByTestId<HTMLInputElement>("markweave-image-caption-input");
    expect(captionInput.placeholder).toBe("写入题注...");
    await inputValue(captionInput, "Resolved caption");
    expect(controller.editor?.getHTML()).toContain("Resolved caption");

    await act(async () => {
      getByTestId("markweave-image-resize-right").dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: 400,
        }),
      );
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          clientX: 500,
        }),
      );
      window.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          clientX: 500,
        }),
      );
    });
    await flushReact();

    expect(controller.editor?.getJSON().content?.[1]?.attrs?.width).toBe(500);
    expect(controller.editor?.getHTML()).toContain('src="madora-asset://controls"');

    await act(async () => {
      controller.editor?.commands.setTextSelection(1);
    });
    await flushReact();

    expect(document.querySelector('[data-testid="markweave-image-toolbar"]')).toBeNull();
    expect(document.querySelector('[data-testid="markweave-image-resize-left"]')).toBeNull();
    expect(document.querySelector('[data-testid="markweave-image-caption-input"]')).toBeNull();
    expect(getByTestId("markweave-image-caption").textContent).toBe("Resolved caption");
  });
});
