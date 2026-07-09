// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MarkweaveEditor,
  useMarkweaveEditorController,
  type MarkweaveEditorController,
  type MarkweaveTocState,
} from "@markweave/react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let activeRoot: Root | null = null;
let activeContainer: HTMLDivElement | null = null;

async function flushReact() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function renderReact(node: ReactNode) {
  activeContainer = document.createElement("div");
  document.body.appendChild(activeContainer);
  activeRoot = createRoot(activeContainer);

  await act(async () => {
    activeRoot?.render(node);
  });
  await flushReact();

  return activeContainer;
}

afterEach(() => {
  activeRoot?.unmount();
  activeRoot = null;
  activeContainer = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("Markweave inner TOC DOM", () => {
  it("renders the inner TOC by default and exposes localized labels", async () => {
    const container = await renderReact(createElement(MarkweaveEditor, { defaultContent: "# 标题\n\n## 二级标题" }));
    const toc = container.querySelector('[data-testid="markweave-inner-toc"]');
    const items = Array.from(container.querySelectorAll<HTMLButtonElement>(".markweave-inner-toc-item"));

    expect(toc).toBeTruthy();
    expect(toc?.getAttribute("aria-label")).toBe("文档目录");
    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("data-markweave-inner-toc")).toBe("true");
    expect(container.querySelector(".markweave-inner-toc-title")).toBeNull();
    expect(items.map((item) => item.textContent)).toEqual(["二级标题"]);
    expect(items[0]?.getAttribute("aria-label")).toBe("跳转到标题: 二级标题");
  });

  it("hides the built-in TOC when disabled while still exposing TOC state", async () => {
    const tocUpdates: MarkweaveTocState[] = [];
    let controller: MarkweaveEditorController | null = null;

    const getController = () => {
      if (!controller) {
        throw new Error("Expected Markweave editor controller.");
      }

      return controller;
    };

    function Harness() {
      controller = useMarkweaveEditorController({
        defaultContent: "# Hidden UI\n\n## Still Available",
        innerToc: false,
        onTocChange: (state) => tocUpdates.push(state),
      });

      return controller.editor ? createElement("section", controller.frameProps) : null;
    }

    const container = await renderReact(createElement(Harness));
    await flushReact();

    expect(container.querySelector('[data-testid="markweave-inner-toc"]')).toBeNull();
    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("data-markweave-inner-toc")).toBe("false");
    expect(getController().runtimeSnapshot.toc.items.map((item) => item.text)).toEqual(["Still Available"]);
    expect(tocUpdates.at(-1)?.items.map((item) => item.text)).toEqual(["Still Available"]);
  });

  it("scrolls to the heading when a TOC item is clicked", async () => {
    const scrollIntoView = vi.fn();
    const container = await renderReact(createElement(MarkweaveEditor, { defaultContent: "# One\n\n## Two" }));
    const secondHeading = container.querySelector("h2");
    if (!secondHeading) {
      throw new Error("Expected second heading.");
    }

    Object.defineProperty(secondHeading, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>(".markweave-inner-toc-item")[0]?.click();
    });
    await flushReact();

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("uses English TOC labels when lang is en", async () => {
    const container = await renderReact(createElement(MarkweaveEditor, { defaultContent: "# Title\n\n## Section", lang: "en" }));
    const toc = container.querySelector('[data-testid="markweave-inner-toc"]');
    const item = container.querySelector(".markweave-inner-toc-item");

    expect(toc?.getAttribute("aria-label")).toBe("Document outline");
    expect(item?.getAttribute("aria-label")).toBe("Jump to heading: Section");
  });
});
