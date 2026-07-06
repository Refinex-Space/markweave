// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MarkweaveEditor } from "markweave/react";
import { initialPlaygroundDocument, mergedTablePlaygroundDocument } from "@markweave/playground-fixtures";

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
  act(() => {
    activeRoot?.unmount();
  });
  activeRoot = null;
  activeContainer = null;
  document.body.replaceChildren();
});

describe("playground fixtures", () => {
  it("keeps the default fixture focused on the editor demo surface", () => {
    expect(initialPlaygroundDocument).toContain("# Markweave Editor");
    expect(initialPlaygroundDocument).toContain("Markdown syntax checklist");
    expect(initialPlaygroundDocument).toContain("###### Heading 6: Integration Surface");
    expect(initialPlaygroundDocument).toContain("| Capability | Markdown surface | What to inspect |");
    expect(initialPlaygroundDocument).toContain("```mermaid");
    expect(initialPlaygroundDocument).toContain("```ts");
    expect(initialPlaygroundDocument).toContain("- [x] Ship a stable Live mode editing surface.");
    expect(initialPlaygroundDocument).toContain(":::info");
    expect(initialPlaygroundDocument).toContain('data-markweave-image="true"');
    expect(initialPlaygroundDocument).toContain('data-markweave-video-embed="true"');
    expect(initialPlaygroundDocument).toContain('data-markweave-attachment="true"');
    expect(initialPlaygroundDocument).toContain('data-type="block-math"');
  });

  it("renders the default fixture through the public Markweave editor", async () => {
    const container = await renderReact(createElement(MarkweaveEditor, { defaultContent: initialPlaygroundDocument }));

    expect(container.querySelector("h1")?.textContent).toBe("Markweave Editor");
    expect(container.querySelectorAll("table").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector("pre.markweave-code-block")).toBeTruthy();
    expect(container.querySelector('[data-markweave-callout-type="info"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="markweave-image-node"]')).toBeTruthy();
    expect(container.querySelector('[data-markweave-video-embed="true"]')).toBeTruthy();
    expect(container.querySelector('[data-type="taskList"]')).toBeTruthy();
    expect(container.querySelector('[data-markweave-attachment="true"]')).toBeTruthy();
  });

  it("exposes merged table cases without creating another editor entry", () => {
    expect(mergedTablePlaygroundDocument).toContain('colspan="2"');
    expect(mergedTablePlaygroundDocument).toContain('rowspan="2"');
    expect(mergedTablePlaygroundDocument).toContain("Merged Header");
    expect(mergedTablePlaygroundDocument).toContain("Clipboard Targets");
  });
});
