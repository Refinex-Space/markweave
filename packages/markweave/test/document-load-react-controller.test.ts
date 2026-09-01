// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkweaveEditor } from "../../markweave-react/src/MarkweaveEditor";
import type { MarkweaveDocumentLoadState } from "../src/editor-core/document-load";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let activeRoot: Root | null = null;

afterEach(() => {
  act(() => activeRoot?.unmount());
  activeRoot = null;
  document.body.replaceChildren();
});

async function waitUntil(predicate: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    });
  }
  throw new Error("Timed out waiting for document load.");
}

describe("React document load bridge", () => {
  it("keeps canonical semantics and publishes a single ready editor", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeRoot = createRoot(container);
    const states: MarkweaveDocumentLoadState[] = [];
    const onUpdate = vi.fn();

    await act(async () => {
      activeRoot?.render(createElement(MarkweaveEditor, {
        defaultContent: "# Title\n\n[go][target]\n\n## End\n\n[target]: https://example.com",
        performancePolicy: "large",
        onDocumentLoadStateChange: (state) => states.push(state),
        onUpdate,
      }));
    });
    await waitUntil(() => states.at(-1)?.phase === "ready");

    expect(states.map((state) => state.phase)).toContain("mounting");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("aria-busy")).toBe("false");
    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("data-markweave-performance-tier")).toBe("large");
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
