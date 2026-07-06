// @vitest-environment jsdom

import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import { MarkweaveEditor, type MarkweaveEditorMode, type MarkweaveEditorRuntimeSnapshot } from "../src/vue3";

let activeApp: App<Element> | null = null;
let activeContainer: HTMLDivElement | null = null;

async function flushVue() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

async function mountVue(component: unknown) {
  activeContainer = document.createElement("div");
  document.body.appendChild(activeContainer);
  activeApp = createApp(component as never);
  activeApp.mount(activeContainer);
  await flushVue();
  return activeContainer;
}

afterEach(() => {
  activeApp?.unmount();
  activeApp = null;
  activeContainer = null;
  document.body.replaceChildren();
});

describe("Markweave Vue3 editor", () => {
  it("renders Markdown content and exposes runtime state", async () => {
    const snapshots: MarkweaveEditorRuntimeSnapshot[] = [];
    const container = await mountVue(
      defineComponent({
        setup() {
          return () =>
            h(MarkweaveEditor, {
              defaultContent: "# Title\n\n## Section\n\nA **bold** paragraph.",
              onRuntimeStateChange: (snapshot: MarkweaveEditorRuntimeSnapshot) => snapshots.push(snapshot),
            });
        },
      }),
    );

    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector('[data-testid="markweave-inner-toc"]')).toBeTruthy();
    expect(container.querySelector(".markweave-inner-toc-item")?.textContent).toBe("Section");
    expect(snapshots.at(-1)?.mode).toBe("live");
  });

  it("switches between Live and View modes", async () => {
    const mode = ref<MarkweaveEditorMode>("live");
    const container = await mountVue(
      defineComponent({
        setup() {
          return () => h(MarkweaveEditor, { defaultContent: "[safe](https://example.com)", mode: mode.value });
        },
      }),
    );

    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("data-markweave-mode")).toBe("live");
    mode.value = "view";
    await flushVue();
    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("data-markweave-mode")).toBe("view");
  });

  it("renders image and video placeholders through Vue NodeViews", async () => {
    const container = await mountVue(
      defineComponent({
        setup() {
          return () =>
            h(MarkweaveEditor, {
              defaultContentFormat: "json",
              defaultContent: {
                type: "doc",
                content: [
                  { type: "image", attrs: { src: null, align: "center", caption: null } },
                  { type: "markweaveVideo", attrs: { src: null } },
                ],
              },
            });
        },
      }),
    );

    expect(container.querySelector('[data-testid="markweave-image-node"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="markweave-video-node"]')).toBeTruthy();
    expect(container.querySelectorAll(".markweave-media-placeholder")).toHaveLength(2);
  });
});
