// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const markweaveMocks = vi.hoisted(() => ({
  MarkweaveEditor: vi.fn((props: { readonly mode?: string }) => createElement("div", { "data-testid": "mock-markweave-editor", "data-mode": props.mode })),
}));

vi.mock("markweave/react", () => ({
  MarkweaveEditor: markweaveMocks.MarkweaveEditor,
}));

import { MarkweaveEditorPlayground } from "../src/MarkweaveEditorPlayground";

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
  markweaveMocks.MarkweaveEditor.mockClear();
  document.body.replaceChildren();
});

describe("playground mode toggle", () => {
  it("defaults to Live mode and toggles the MarkweaveEditor mode prop", async () => {
    const container = await renderReact(createElement(MarkweaveEditorPlayground));
    const button = container.querySelector<HTMLButtonElement>('[data-testid="markweave-playground-mode-toggle"]');

    expect(button?.dataset.mode).toBe("live");
    expect(button?.getAttribute("aria-label")).toBe("切换到 View 模式");
    expect(container.querySelector('[data-testid="mock-markweave-editor"]')?.getAttribute("data-mode")).toBe("live");

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flushReact();

    expect(button?.dataset.mode).toBe("view");
    expect(button?.getAttribute("aria-label")).toBe("切换到 Live 模式");
    expect(container.querySelector('[data-testid="mock-markweave-editor"]')?.getAttribute("data-mode")).toBe("view");
  });
});
