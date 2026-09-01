// @vitest-environment jsdom

import Vue from "../../markweave-vue2/node_modules/vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkweaveEditor } from "../../markweave-vue2/src/MarkweaveEditor";
import type { MarkweaveDocumentLoadState } from "../src/editor-core/document-load";
import type { MarkweaveSearchController } from "../src/plugins/search/search-controller";

vi.mock("vue", () => import("../../markweave-vue2/node_modules/vue"));

let activeVm: Vue | null = null;

afterEach(() => {
  activeVm?.$destroy();
  activeVm = null;
  document.body.replaceChildren();
});

async function waitUntil(predicate: () => boolean) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (predicate()) return;
    await Vue.nextTick();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for Vue 2 document load.");
}

describe("Vue 2 document load bridge", () => {
  it("shares canonical loading and search-controller lifecycle", async () => {
    const states: MarkweaveDocumentLoadState[] = [];
    const searchControllers: Array<MarkweaveSearchController | null> = [];
    const onUpdate = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeVm = new Vue({
      render(createElement) {
        return createElement(MarkweaveEditor as never, {
          props: {
            defaultContent: "# Title\n\n[go][target]\n\n## End\n\n[target]: https://example.com",
            performancePolicy: "large",
            onDocumentLoadStateChange: (state: MarkweaveDocumentLoadState) => states.push(state),
            onSearchControllerChange: (controller: MarkweaveSearchController | null) => searchControllers.push(controller),
            onUpdate,
          },
        });
      },
    });
    activeVm.$mount(container);
    await waitUntil(() => states.at(-1)?.phase === "ready");

    expect(activeVm.$el.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(activeVm.$el.getAttribute("data-markweave-performance-tier")).toBe("large");
    expect(searchControllers.some(Boolean)).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
