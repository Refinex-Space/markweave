// @vitest-environment jsdom

import { createApp, nextTick, type App } from "vue";
import { afterEach, describe, expect, it } from "vitest";

import MarkweaveEditorPlayground from "../src/MarkweaveEditorPlayground.vue";

let activeApp: App<Element> | null = null;
let activeContainer: HTMLDivElement | null = null;

function mountVue(component: unknown) {
  activeContainer = document.createElement("div");
  document.body.appendChild(activeContainer);
  activeApp = createApp(component as never);
  activeApp.mount(activeContainer);
  return activeContainer;
}

afterEach(() => {
  activeApp?.unmount();
  activeApp = null;
  activeContainer = null;
  document.body.replaceChildren();
});

describe("Vue3 playground mode toggle", () => {
  it("defaults to Live mode and toggles the MarkweaveEditor mode prop", async () => {
    const container = mountVue(MarkweaveEditorPlayground);
    await nextTick();
    const button = container.querySelector<HTMLButtonElement>('[data-testid="markweave-playground-mode-toggle"]');

    expect(button?.dataset.mode).toBe("live");
    expect(button?.getAttribute("aria-label")).toBe("切换到 View 模式");
    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("data-markweave-mode")).toBe("live");

    button?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await nextTick();

    expect(button?.dataset.mode).toBe("view");
    expect(button?.getAttribute("aria-label")).toBe("切换到 Live 模式");
    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("data-markweave-mode")).toBe("view");
  });
});
