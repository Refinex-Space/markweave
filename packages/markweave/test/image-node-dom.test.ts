// @vitest-environment jsdom

import { EditorContent } from "@tiptap/react";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMarkweaveEditorController, type MarkweaveEditorController, type MarkweaveEditorMode, type MarkweaveLang, type MarkweaveMediaSourceResolver } from "@markweave/react";
import { setMarkweaveEditorModeState } from "../src/core/editor-mode-state";
import { getMarkweaveDocumentViewportCoordinatorForElement } from "../src/core/document-viewport";
import {
  markweaveResolveVisualResourceEvent,
  type MarkweaveResolveVisualResourceEventDetail,
} from "../src/editor-core/document-output";
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
    if (vi.isFakeTimers()) {
      await vi.advanceTimersByTimeAsync(0);
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("image node view", () => {
  it("renders the image upload placeholder and inserts an image from a URL", async () => {
    const controller = await renderEditor();

    await insertEmptyImage(controller);
    expect(getByTestId("markweave-image-upload-placeholder")).not.toBeNull();
    expect(getByTestId("markweave-image-upload-placeholder").textContent).toContain("上传或嵌入图片");

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

    expect(getByTestId("markweave-image-upload-placeholder").textContent).toContain("Upload or embed an image");

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

  it("resolves a mounted first-screen image eagerly when Chromium 106 delays the initial observer callback", async () => {
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
    expect(image?.getAttribute("loading")).toBe("eager");
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
    expect(image?.getAttribute("loading")).toBe("eager");
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

  it("resolves an offscreen image through the idle backstop without any viewport signal", async () => {
    installStalledIntersectionObserver();
    const idleGlobals = window as unknown as Record<string, unknown>;
    const previousRequestIdleCallback = idleGlobals.requestIdleCallback;
    const previousCancelIdleCallback = idleGlobals.cancelIdleCallback;
    idleGlobals.requestIdleCallback = (
      cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
    ) => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0);
    idleGlobals.cancelIdleCallback = (handle: number) => window.clearTimeout(handle);

    // The node never comes near the viewport and never receives focus/visibility
    // wake events, so only the guaranteed idle backstop can resolve it.
    lightweightImageRect = createRect(0, window.innerHeight * 8, 400, 240);
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>(() => ({
      src: "asset://resolved/backstop.png",
      width: 320,
      height: 200,
    }));

    try {
      await renderEditor(
        '<p>Before</p><img src="madora-asset://backstop" alt="Backstop">',
        undefined,
        undefined,
        "view",
        resolveMediaSource,
      );
      await flushReact();

      expect(resolveMediaSource).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: "background",
          src: "madora-asset://backstop",
        }),
      );

      const image = await completeLightweightImageLoad();
      const imageNode = document.querySelector<HTMLElement>(
        '[data-markweave-lightweight-image="true"]',
      );
      expect(imageNode?.dataset.mediaState).toBe("resolved");
      expect(image.src).toContain("asset://resolved/backstop.png");
      expect(image.hidden).toBe(false);
    } finally {
      idleGlobals.requestIdleCallback = previousRequestIdleCallback;
      idleGlobals.cancelIdleCallback = previousCancelIdleCallback;
    }
  });

  it("re-resolves the same persisted source after an image load error and commits only after load", async () => {
    installStalledIntersectionObserver();
    let recover = false;
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>(() => ({
      src: recover
        ? "asset://resolved/recovered.png"
        : "asset://resolved/first.png",
    }));
    await renderEditor(
      '<img src="markweave-asset://image-error" alt="Recoverable">',
      undefined,
      undefined,
      "view",
      resolveMediaSource,
    );
    await flushReact();

    const imageNode = getByTestId("markweave-image-node");
    const firstImage = document.querySelector<HTMLImageElement>("img.markweave-image");
    expect(firstImage?.src).toContain("asset://resolved/first.png");
    expect(imageNode.dataset.mediaState).toBe("pending");
    const initialAttempt = resolveMediaSource.mock.calls.at(-1)?.[0].attempt ?? 0;
    resolveMediaSource.mockClear();

    await act(async () => {
      firstImage?.dispatchEvent(new Event("error"));
    });
    await flushReact();
    expect(imageNode.dataset.mediaState).toBe("pending");
    expect(document.querySelector("img.markweave-image")).not.toBe(firstImage);

    recover = true;
    await act(async () => {
      imageNode.dispatchEvent(new Event(markweaveResolveVisualResourceEvent));
    });
    await flushReact();

    expect(resolveMediaSource).toHaveBeenCalledTimes(1);
    expect(resolveMediaSource).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attempt: initialAttempt + 1,
        priority: "visible",
        reason: "output",
        src: "markweave-asset://image-error",
      }),
    );
    const recoveredImage = document.querySelector<HTMLImageElement>("img.markweave-image");
    expect(recoveredImage?.src).toContain("asset://resolved/recovered.png");
    expect(imageNode.dataset.mediaState).toBe("pending");

    await completeLightweightImageLoad();
    expect(imageNode.dataset.mediaState).toBe("resolved");
    expect(recoveredImage?.hidden).toBe(false);
  });

  it("lets selecting a missing image bypass retry backoff immediately", async () => {
    installStalledIntersectionObserver();
    let recover = false;
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>(() =>
      recover ? { src: "asset://resolved/after-missing.png" } : null,
    );
    const controller = await renderEditor(
      '<p>Before</p><img src="markweave-asset://missing-once" alt="Missing once">',
      undefined,
      undefined,
      undefined,
      resolveMediaSource,
    );
    await flushReact();
    expect(getByTestId("markweave-image-node").dataset.mediaState).toBe("pending");
    resolveMediaSource.mockClear();
    recover = true;

    let imagePos = 0;
    controller.editor?.state.doc.descendants((node, pos) => {
      if (node.type.name === "image") {
        imagePos = pos;
        return false;
      }
      return undefined;
    });
    await act(async () => {
      controller.editor?.commands.setNodeSelection(imagePos);
    });
    await flushReact();

    expect(resolveMediaSource).toHaveBeenCalledTimes(1);
    expect(resolveMediaSource).toHaveBeenLastCalledWith(
      expect.objectContaining({ priority: "visible", reason: "viewport" }),
    );
    await completeLightweightImageLoad();
    expect(getByTestId("markweave-image-node").dataset.mediaState).toBe("resolved");
  });

  it("recovers from a rejected resolver without leaving a terminal unreadable cache", async () => {
    installStalledIntersectionObserver();
    let recover = false;
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>(() =>
      recover
        ? { src: "asset://resolved/after-reject.png" }
        : Promise.reject(new Error("temporary resolver failure")),
    );
    await renderEditor(
      '<img src="markweave-asset://reject-once" alt="Reject once">',
      undefined,
      undefined,
      "view",
      resolveMediaSource,
    );
    await flushReact();

    const imageNode = getByTestId("markweave-image-node");
    resolveMediaSource.mockClear();
    recover = true;
    await act(async () => {
      imageNode.dispatchEvent(new Event(markweaveResolveVisualResourceEvent));
    });
    await flushReact();

    expect(resolveMediaSource).toHaveBeenCalledTimes(1);
    expect(resolveMediaSource).toHaveBeenLastCalledWith(
      expect.objectContaining({ reason: "output" }),
    );
    await completeLightweightImageLoad();
    expect(imageNode.dataset.mediaState).toBe("resolved");
  });

  it("times out a stuck resolver, aborts it, and permits immediate output recovery", async () => {
    vi.useFakeTimers();
    installStalledIntersectionObserver();
    const initialSignals: AbortSignal[] = [];
    let recover = false;
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>((request) => {
      if (recover) return { src: "asset://resolved/after-resolver-timeout.png" };
      initialSignals.push(request.signal);
      return new Promise(() => undefined);
    });
    await renderEditor(
      '<img src="markweave-asset://resolver-timeout" alt="Resolver timeout">',
      undefined,
      undefined,
      "view",
      resolveMediaSource,
    );
    await flushReact();
    resolveMediaSource.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_001);
    });
    expect(initialSignals.at(-1)?.aborted).toBe(true);
    expect(getByTestId("markweave-image-node").dataset.mediaState).toBe("pending");

    recover = true;
    await act(async () => {
      getByTestId("markweave-image-node").dispatchEvent(
        new Event(markweaveResolveVisualResourceEvent),
      );
    });
    await flushReact();
    expect(resolveMediaSource).toHaveBeenCalledTimes(1);
    await completeLightweightImageLoad();
    expect(getByTestId("markweave-image-node").dataset.mediaState).toBe("resolved");
  });

  it("times out an image request, discards its element, and retries the source", async () => {
    vi.useFakeTimers();
    installStalledIntersectionObserver();
    const initialSignals: AbortSignal[] = [];
    let recover = false;
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>((request) => {
      if (recover) return { src: "asset://resolved/after-image-timeout.png" };
      initialSignals.push(request.signal);
      return { src: "asset://resolved/stuck-image.png" };
    });
    await renderEditor(
      '<img src="markweave-asset://image-timeout" alt="Image timeout">',
      undefined,
      undefined,
      "view",
      resolveMediaSource,
    );
    await flushReact();
    const stuckImage = document.querySelector<HTMLImageElement>("img.markweave-image");
    resolveMediaSource.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_001);
    });
    expect(initialSignals.at(-1)?.aborted).toBe(true);
    expect(document.querySelector("img.markweave-image")).not.toBe(stuckImage);

    recover = true;
    await act(async () => {
      getByTestId("markweave-image-node").dispatchEvent(
        new Event(markweaveResolveVisualResourceEvent),
      );
    });
    await flushReact();
    expect(resolveMediaSource).toHaveBeenCalledTimes(1);
    await completeLightweightImageLoad();
    expect(getByTestId("markweave-image-node").dataset.mediaState).toBe("resolved");
  });

  it("aborts source A and ignores its stale result after the node switches to source B", async () => {
    installStalledIntersectionObserver();
    let finishSourceA!: (result: { src: string }) => void;
    const observed: { sourceASignal: AbortSignal | null } = {
      sourceASignal: null,
    };
    const sourceA = new Promise<{ src: string }>((resolve) => {
      finishSourceA = resolve;
    });
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>((request) => {
      if (request.src === "markweave-asset://source-a") {
        observed.sourceASignal = request.signal;
        return sourceA;
      }
      return { src: "asset://resolved/source-b.png" };
    });
    const controller = await renderEditor(
      '<img src="markweave-asset://source-a" alt="Switch source">',
      undefined,
      undefined,
      "view",
      resolveMediaSource,
    );
    await flushReact();

    let imagePos = 0;
    controller.editor?.state.doc.descendants((node, pos) => {
      if (node.type.name === "image") {
        imagePos = pos;
        return false;
      }
      return undefined;
    });
    const imageNode = controller.editor?.state.doc.nodeAt(imagePos);
    await act(async () => {
      if (controller.editor && imageNode) {
        controller.editor.view.dispatch(
          controller.editor.state.tr.setNodeMarkup(imagePos, undefined, {
            ...imageNode.attrs,
            src: "markweave-asset://source-b",
          }),
        );
      }
    });
    await flushReact();

    expect(observed.sourceASignal?.aborted).toBe(true);
    expect(resolveMediaSource).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        src: "markweave-asset://source-b",
      }),
    );
    finishSourceA({ src: "asset://resolved/stale-source-a.png" });
    await flushReact();

    const currentImage = document.querySelector<HTMLImageElement>("img.markweave-image");
    expect(currentImage?.src).toContain("asset://resolved/source-b.png");
    expect(currentImage?.src).not.toContain("stale-source-a");
    await completeLightweightImageLoad();
    expect(getByTestId("markweave-image-node").dataset.mediaState).toBe("resolved");
  });

  it("aborts an active resolver when the NodeView is destroyed", async () => {
    installStalledIntersectionObserver();
    const observed: { activeSignal: AbortSignal | null } = {
      activeSignal: null,
    };
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>((request) => {
      observed.activeSignal = request.signal;
      return new Promise(() => undefined);
    });
    const controller = await renderEditor(
      '<img src="markweave-asset://destroy" alt="Destroy">',
      undefined,
      undefined,
      "view",
      resolveMediaSource,
    );
    await flushReact();
    expect(observed.activeSignal?.aborted).toBe(false);

    await act(async () => {
      controller.editor?.destroy();
    });
    expect(observed.activeSignal?.aborted).toBe(true);
  });

  it("registers output waitUntil synchronously and waits through the real image load", async () => {
    installStalledIntersectionObserver();
    let finishResolve!: (result: { src: string }) => void;
    const deferred = new Promise<{ src: string }>((resolve) => {
      finishResolve = resolve;
    });
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>(() => deferred);
    await renderEditor(
      '<img src="markweave-asset://output-wait" alt="Output wait">',
      undefined,
      undefined,
      "view",
      resolveMediaSource,
    );
    await flushReact();

    const outputController = new AbortController();
    const observed: { outputWaiter: Promise<unknown> | null } = {
      outputWaiter: null,
    };
    const detail: MarkweaveResolveVisualResourceEventDetail = {
      kind: "dom-snapshot",
      signal: outputController.signal,
      waitUntil: (promise) => {
        observed.outputWaiter = Promise.resolve(promise);
      },
    };
    getByTestId("markweave-image-node").dispatchEvent(
      new CustomEvent<MarkweaveResolveVisualResourceEventDetail>(
        markweaveResolveVisualResourceEvent,
        { detail },
      ),
    );
    expect(observed.outputWaiter).not.toBeNull();
    let settled = false;
    void observed.outputWaiter?.then(() => {
      settled = true;
    });

    finishResolve({ src: "asset://resolved/output-wait.png" });
    await flushReact();
    expect(settled).toBe(false);
    expect(getByTestId("markweave-image-node").dataset.mediaState).toBe("pending");

    await completeLightweightImageLoad();
    await observed.outputWaiter;
    expect(settled).toBe(true);
    expect(getByTestId("markweave-image-node").dataset.mediaState).toBe("resolved");
  });

  it("keeps a failed output image retry inside the same waitUntil chain", async () => {
    vi.useFakeTimers();
    installStalledIntersectionObserver();
    vi.stubGlobal("requestIdleCallback", vi.fn(() => 1));
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    lightweightImageRect = createRect(0, window.innerHeight * 8, 400, 240);
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>()
      .mockImplementationOnce(() => ({ src: "asset://resolved/output-first.png" }))
      .mockImplementationOnce(() => ({ src: "asset://resolved/output-second.png" }));
    await renderEditor(
      '<p>Before</p><img src="markweave-asset://output-retry" alt="Output retry">',
      undefined,
      undefined,
      "view",
      resolveMediaSource,
    );
    await flushReact();
    expect(resolveMediaSource).not.toHaveBeenCalled();

    const imageNode = getByTestId("markweave-image-node");
    const coordinator = getMarkweaveDocumentViewportCoordinatorForElement(imageNode);
    const releaseOutput = coordinator?.beginOutput() ?? (() => undefined);
    const outputController = new AbortController();
    const observed: { waiter: Promise<unknown> | null } = { waiter: null };
    const detail: MarkweaveResolveVisualResourceEventDetail = {
      kind: "dom-snapshot",
      signal: outputController.signal,
      waitUntil: (promise) => {
        observed.waiter = Promise.resolve(promise);
      },
    };
    imageNode.dispatchEvent(
      new CustomEvent<MarkweaveResolveVisualResourceEventDetail>(
        markweaveResolveVisualResourceEvent,
        { detail },
      ),
    );
    await flushReact();
    expect(resolveMediaSource).toHaveBeenCalledTimes(1);
    const firstImage = document.querySelector<HTMLImageElement>("img.markweave-image");
    expect(firstImage?.src).toContain("output-first.png");

    let waiterSettled = false;
    void observed.waiter?.then(() => {
      waiterSettled = true;
    });
    await act(async () => {
      firstImage?.dispatchEvent(new Event("error"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(waiterSettled).toBe(false);
    expect(imageNode.dataset.mediaState).toBe("pending");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await flushReact();
    expect(resolveMediaSource).toHaveBeenCalledTimes(2);
    expect(resolveMediaSource).toHaveBeenLastCalledWith(
      expect.objectContaining({ attempt: 2, priority: "visible", reason: "output" }),
    );
    expect(waiterSettled).toBe(false);
    const recoveredImage = document.querySelector<HTMLImageElement>("img.markweave-image");
    expect(recoveredImage?.src).toContain("output-second.png");

    await completeLightweightImageLoad();
    await observed.waiter;
    expect(waiterSettled).toBe(true);
    expect(imageNode.dataset.mediaState).toBe("resolved");
    await act(async () => {
      releaseOutput();
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  it("cancels an output retry gap without a late request or permanent pending state", async () => {
    vi.useFakeTimers();
    installStalledIntersectionObserver();
    vi.stubGlobal("requestIdleCallback", vi.fn(() => 1));
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    lightweightImageRect = createRect(0, window.innerHeight * 8, 400, 240);
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>(() => null);
    await renderEditor(
      '<p>Before</p><img src="markweave-asset://output-gap" alt="Output gap">',
      undefined,
      undefined,
      "view",
      resolveMediaSource,
    );
    await flushReact();

    const imageNode = getByTestId("markweave-image-node");
    const coordinator = getMarkweaveDocumentViewportCoordinatorForElement(imageNode);
    const releaseOutput = coordinator?.beginOutput() ?? (() => undefined);
    const outputController = new AbortController();
    const observed: { waiter: Promise<unknown> | null } = { waiter: null };
    const detail: MarkweaveResolveVisualResourceEventDetail = {
      kind: "print",
      signal: outputController.signal,
      waitUntil: (promise) => {
        observed.waiter = Promise.resolve(promise);
      },
    };
    imageNode.dispatchEvent(
      new CustomEvent<MarkweaveResolveVisualResourceEventDetail>(
        markweaveResolveVisualResourceEvent,
        { detail },
      ),
    );
    await flushReact();
    expect(resolveMediaSource).toHaveBeenCalledTimes(1);
    expect(imageNode.dataset.mediaState).toBe("pending");

    await act(async () => {
      outputController.abort();
      await vi.advanceTimersByTimeAsync(0);
    });
    await observed.waiter;
    expect(imageNode.dataset.mediaState).toBe("missing");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(resolveMediaSource).toHaveBeenCalledTimes(1);
    expect(imageNode.dataset.mediaState).not.toBe("pending");
    await act(async () => {
      releaseOutput();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(resolveMediaSource).toHaveBeenCalledTimes(1);
  });

  it("recovers after the visual scheduler aborts a running nearby resolver", async () => {
    installStalledIntersectionObserver();
    vi.stubGlobal("requestIdleCallback", vi.fn(() => 1));
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => callback(window.performance.now()), 0),
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => {
      window.clearTimeout(handle);
    });
    let scrollY = 0;
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      get: () => scrollY,
    });
    lightweightImageRect = createRect(0, window.innerHeight * 8, 400, 240);
    const scheduledSignals: AbortSignal[] = [];
    let recover = false;
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>((request) => {
      if (recover) return { src: "asset://resolved/after-scheduler-abort.png" };
      scheduledSignals.push(request.signal);
      return new Promise(() => undefined);
    });
    await renderEditor(
      '<p>Before</p><img src="markweave-asset://scheduler-abort" alt="Scheduler abort">',
      undefined,
      undefined,
      "view",
      resolveMediaSource,
    );
    await flushReact();
    const imageNode = getByTestId("markweave-image-node");
    const coordinator = getMarkweaveDocumentViewportCoordinatorForElement(imageNode);
    expect(coordinator).not.toBeNull();

    window.dispatchEvent(new Event("scroll"));
    scrollY = 100;
    window.dispatchEvent(new Event("scroll"));
    await flushReact();
    expect(coordinator?.snapshot.state).toBe("rapid");

    lightweightImageRect = createRect(0, window.innerHeight * 2, 400, 240);
    window.dispatchEvent(new Event("focus"));
    await flushReact();
    expect(coordinator?.visualWork.pendingCount).toBe(1);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 130));
    });
    await flushReact();
    expect(resolveMediaSource).toHaveBeenCalled();
    expect(resolveMediaSource).toHaveBeenLastCalledWith(
      expect.objectContaining({ priority: "nearby" }),
    );
    resolveMediaSource.mockClear();
    coordinator?.visualWork.destroy();
    await flushReact();
    expect(scheduledSignals.some((signal) => signal.aborted)).toBe(true);
    expect(getByTestId("markweave-image-node").dataset.mediaState).toBe("pending");

    recover = true;
    await act(async () => {
      getByTestId("markweave-image-node").dispatchEvent(
        new Event(markweaveResolveVisualResourceEvent),
      );
    });
    await flushReact();
    expect(resolveMediaSource).toHaveBeenCalledTimes(1);
    await completeLightweightImageLoad();
    expect(getByTestId("markweave-image-node").dataset.mediaState).toBe("resolved");
  });

  it("throttles terminal automatic recovery before layout reads while selection bypasses the cooldown", async () => {
    vi.useFakeTimers();
    installStalledIntersectionObserver();
    let recover = false;
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>(() =>
      recover ? { src: "asset://resolved/cooldown-recovery.png" } : null,
    );
    const controller = await renderEditor(
      '<p>Before</p><img src="markweave-asset://cooldown" alt="Cooldown">',
      undefined,
      undefined,
      undefined,
      resolveMediaSource,
    );
    await flushReact();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await flushReact();

    const imageNode = getByTestId("markweave-image-node");
    expect(imageNode.dataset.mediaState).toBe("missing");
    resolveMediaSource.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await vi.advanceTimersByTimeAsync(0);
      window.dispatchEvent(new Event("resize"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(resolveMediaSource).not.toHaveBeenCalled();

    recover = true;
    let imagePos = 0;
    controller.editor?.state.doc.descendants((node, pos) => {
      if (node.type.name === "image") {
        imagePos = pos;
        return false;
      }
      return undefined;
    });
    await act(async () => {
      controller.editor?.commands.setNodeSelection(imagePos);
    });
    await flushReact();
    expect(resolveMediaSource).toHaveBeenCalledTimes(1);
    expect(resolveMediaSource).toHaveBeenLastCalledWith(
      expect.objectContaining({ priority: "visible", reason: "viewport" }),
    );
    await completeLightweightImageLoad();
    expect(imageNode.dataset.mediaState).toBe("resolved");
  });

  it("does not start viewport recovery during output stabilization frames", async () => {
    vi.useFakeTimers();
    installStalledIntersectionObserver();
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>(() => null);
    await renderEditor(
      '<p>Before</p><img src="markweave-asset://output-layout" alt="Output layout">',
      undefined,
      undefined,
      "view",
      resolveMediaSource,
    );
    await flushReact();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await flushReact();

    const imageNode = getByTestId("markweave-image-node");
    expect(imageNode.dataset.mediaState).toBe("missing");
    const coordinator = getMarkweaveDocumentViewportCoordinatorForElement(imageNode);
    expect(coordinator).not.toBeNull();
    const releaseOutput = coordinator?.beginOutput() ?? (() => undefined);
    resolveMediaSource.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_001);
      window.dispatchEvent(new Event("resize"));
      await vi.advanceTimersByTimeAsync(0);
      window.dispatchEvent(new Event("resize"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(coordinator?.snapshot.state).toBe("output");
    expect(resolveMediaSource).not.toHaveBeenCalled();
    await act(async () => {
      releaseOutput();
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  it("rebuilds the rich empty placeholder when a populated lightweight image clears src", async () => {
    installStalledIntersectionObserver();
    const observed: { signal: AbortSignal | null } = { signal: null };
    const resolveMediaSource = vi.fn<MarkweaveMediaSourceResolver>((request) => {
      observed.signal = request.signal;
      return new Promise(() => undefined);
    });
    const controller = await renderEditor(
      '<p>Before</p><img src="markweave-asset://clear-src" alt="Clear source">',
      undefined,
      undefined,
      undefined,
      resolveMediaSource,
    );
    await flushReact();

    let imagePos = 0;
    controller.editor?.state.doc.descendants((node, pos) => {
      if (node.type.name === "image") {
        imagePos = pos;
        return false;
      }
      return undefined;
    });
    const imageNode = controller.editor?.state.doc.nodeAt(imagePos);
    await act(async () => {
      if (controller.editor && imageNode) {
        controller.editor.view.dispatch(
          controller.editor.state.tr.setNodeMarkup(imagePos, undefined, {
            ...imageNode.attrs,
            src: null,
          }),
        );
      }
    });
    await flushReact();

    expect(observed.signal?.aborted).toBe(true);
    expect(document.querySelector('[data-markweave-lightweight-image="true"]')).toBeNull();
    expect(getByTestId("markweave-image-upload-placeholder")).not.toBeNull();
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
