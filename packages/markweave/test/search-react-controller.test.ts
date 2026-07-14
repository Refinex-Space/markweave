// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkweaveEditor } from "../../markweave-react/src/MarkweaveEditor";
import type { MarkweaveSearchController } from "../src/plugins/search/search-controller";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let activeRoot: Root | null = null;

afterEach(() => {
  act(() => activeRoot?.unmount());
  activeRoot = null;
  document.body.replaceChildren();
});

describe("React search controller bridge", () => {
  it("exposes the search controller for the mounted editor and clears it on unmount", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeRoot = createRoot(container);
    const onSearchControllerChange = vi.fn<
      (controller: MarkweaveSearchController | null) => void
    >();

    await act(async () => {
      activeRoot?.render(
        createElement(MarkweaveEditor, {
          content: "Alpha alpha",
          editable: false,
          onSearchControllerChange,
        }),
      );
    });

    const controller = onSearchControllerChange.mock.calls
      .map(([value]) => value)
      .find((value): value is MarkweaveSearchController => value !== null);
    expect(controller).toBeTruthy();

    act(() => controller?.setQuery("alpha"));
    expect(controller?.getState().matchCount).toBe(2);
    expect(container.querySelectorAll(".markweave-search-match")).toHaveLength(2);

    act(() => activeRoot?.unmount());
    activeRoot = null;
    expect(onSearchControllerChange).toHaveBeenLastCalledWith(null);
  });
});
