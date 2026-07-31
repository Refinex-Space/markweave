// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkweaveEditor } from "../../markweave-react/src/MarkweaveEditor";
import type { MarkweaveAiEditController } from "../src/core/public-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let activeRoot: Root | null = null;

afterEach(() => {
  act(() => activeRoot?.unmount());
  activeRoot = null;
  document.body.replaceChildren();
});

describe("React AI edit controller bridge", () => {
  it("exposes the controller after editor mount and clears it on unmount", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeRoot = createRoot(container);
    const onAiEditControllerChange = vi.fn<
      (controller: MarkweaveAiEditController | null) => void
    >();

    await act(async () => {
      activeRoot?.render(
        createElement(MarkweaveEditor, {
          defaultContent: "Selectable content",
          onAiEditControllerChange,
        }),
      );
    });

    const controller = onAiEditControllerChange.mock.calls
      .map(([value]) => value)
      .find((value): value is MarkweaveAiEditController => value !== null);
    expect(controller).toBeTruthy();
    expect(controller?.getState().phase).toBe("idle");

    act(() => activeRoot?.unmount());
    activeRoot = null;
    expect(onAiEditControllerChange).toHaveBeenLastCalledWith(null);
  });
});
