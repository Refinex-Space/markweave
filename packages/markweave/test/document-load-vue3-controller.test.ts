// @vitest-environment jsdom

import { createApp, h, type App } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkweaveEditor } from "../../markweave-vue3/src/MarkweaveEditor";
import type { MarkweaveDocumentLoadState } from "../src/editor-core/document-load";
import type { MarkweaveSearchController } from "../src/plugins/search/search-controller";

let activeApp: App<Element> | null = null;

afterEach(() => {
  activeApp?.unmount();
  activeApp = null;
  document.body.replaceChildren();
});

async function waitUntil(predicate: () => boolean) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for Vue 3 document load.");
}

describe("Vue 3 document load bridge", () => {
  it("shares canonical loading and search-controller lifecycle", async () => {
    const states: MarkweaveDocumentLoadState[] = [];
    const searchControllers: Array<MarkweaveSearchController | null> = [];
    const onUpdate = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeApp = createApp({
      render: () => h(MarkweaveEditor, {
        defaultContent: "# Title\n\n[go][target]\n\n## End\n\n[target]: https://example.com",
        performancePolicy: "large",
        onDocumentLoadStateChange: (state: MarkweaveDocumentLoadState) => states.push(state),
        onSearchControllerChange: (controller: MarkweaveSearchController | null) => searchControllers.push(controller),
        onUpdate,
      }),
    });
    activeApp.mount(container);
    await waitUntil(() => states.at(-1)?.phase === "ready");

    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("data-markweave-performance-tier")).toBe("large");
    expect(searchControllers.some(Boolean)).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
