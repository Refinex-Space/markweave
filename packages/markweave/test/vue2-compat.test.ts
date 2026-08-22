// @vitest-environment jsdom

import Vue from "../../markweave-vue2/node_modules/vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defineComponent,
  h,
  ref,
  watch,
  type Ref,
} from "../../markweave-vue2/src/vue2-compat";

vi.mock("vue", () => import("../../markweave-vue2/node_modules/vue"));

let activeVm: Vue | null = null;

afterEach(() => {
  activeVm?.$destroy();
  activeVm = null;
  document.body.replaceChildren();
});

describe("Vue 2 compatibility runtime", () => {
  it("runs post-flush watchers after the Vue 2 DOM patch", async () => {
    const observations: string[] = [];
    let count: Ref<number> | null = null;
    const PostFlushComponent = defineComponent({
      name: "PostFlushComponent",
      setup() {
        count = ref(0);
        watch(
          count,
          () => observations.push(document.querySelector('[data-testid="post-flush-value"]')?.textContent ?? "missing"),
          { flush: "post" },
        );
        return () => h("div", { "data-testid": "post-flush-value" }, String(count?.value ?? -1));
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeVm = new Vue({ render: (createElement) => createElement(PostFlushComponent) });
    activeVm.$mount(container);

    count!.value = 1;
    expect(observations).toEqual([]);
    await Vue.nextTick();
    await Vue.nextTick();

    expect(observations).toEqual(["1"]);
  });

  it("cancels queued post-flush callbacks when the component is destroyed", async () => {
    const observations: number[] = [];
    let count: Ref<number> | null = null;
    const PostFlushComponent = defineComponent({
      name: "DisposablePostFlushComponent",
      setup() {
        count = ref(0);
        watch(count, (value) => observations.push(value), { flush: "post" });
        return () => h("div", null, String(count?.value ?? -1));
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeVm = new Vue({ render: (createElement) => createElement(PostFlushComponent) });
    activeVm.$mount(container);

    count!.value = 1;
    activeVm.$destroy();
    activeVm = null;
    await Vue.nextTick();
    await Vue.nextTick();

    expect(observations).toEqual([]);
  });
});
