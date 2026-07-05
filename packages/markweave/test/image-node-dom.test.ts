// @vitest-environment jsdom

import { EditorContent } from "@tiptap/react";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMarkweaveEditorController, type MarkweaveEditorController } from "../src";
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
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect(this: HTMLElement) {
    if (this.classList.contains("markweave-editor-surface")) {
      return createRect(0, 0, 800, 500);
    }

    if (this.classList.contains("markweave-image-box")) {
      return createRect(0, 0, 400, 240);
    }

    return createRect(0, 0, 120, 40);
  });
}

function Harness({
  defaultContent,
  onReady,
  onUpload,
}: {
  readonly defaultContent: string;
  readonly onReady: (controller: MarkweaveEditorController) => void;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
}) {
  const controller = useMarkweaveEditorController({
    defaultContent,
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

async function renderEditor(defaultContent = "<p></p>", onUpload?: MarkweaveSlashCommandUploadHandler) {
  installLayoutMocks();
  const host = document.createElement("div");
  document.body.appendChild(host);
  activeRoot = createRoot(host);

  await act(async () => {
    activeRoot?.render(
      createElement(Harness, {
        defaultContent,
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
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("image node view", () => {
  it("renders the image upload placeholder and inserts an image from a URL", async () => {
    const controller = await renderEditor();

    await insertEmptyImage(controller);
    expect(getByTestId("markweave-image-upload-placeholder")).not.toBeNull();

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

    await click(getByTestId("markweave-image-caption"));
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
});
