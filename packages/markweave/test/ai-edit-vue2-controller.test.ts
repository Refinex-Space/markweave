// @vitest-environment jsdom

import Vue from "../../markweave-vue2/node_modules/vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkweaveEditor } from "../../markweave-vue2/src/MarkweaveEditor";
import type { MarkweaveAiEditController } from "../src/core/public-types";

vi.mock("vue", () => import("../../markweave-vue2/node_modules/vue"));

let activeVm: Vue | null = null;

async function flushVue2() {
  await Vue.nextTick();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  await Vue.nextTick();
}

afterEach(() => {
  activeVm?.$destroy();
  activeVm = null;
  document.body.replaceChildren();
});

describe("Vue 2 AI edit controller bridge", () => {
  it("keeps the successor controller after a keyed editor replacement", async () => {
    const controllers: Array<MarkweaveAiEditController | null> = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeVm = new Vue({
      data: () => ({ editorKey: 0 }),
      render(createElement) {
        return createElement(MarkweaveEditor as never, {
          key: (this as Vue & { editorKey: number }).editorKey,
          props: {
            defaultContent: "Selectable content",
            onAiEditControllerChange: (controller: MarkweaveAiEditController | null) => controllers.push(controller),
          },
        });
      },
    });
    activeVm.$mount(container);
    await flushVue2();

    expect(controllers.at(-1)?.getState().phase).toBe("idle");
    (activeVm as Vue & { editorKey: number }).editorKey += 1;
    await flushVue2();

    expect(controllers.at(-1)).not.toBeNull();
    expect(controllers.at(-1)?.getState().phase).toBe("idle");

    activeVm.$destroy();
    activeVm = null;
    expect(controllers.at(-1)).toBeNull();
  });
});
