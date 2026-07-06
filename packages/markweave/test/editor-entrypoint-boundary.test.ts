// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MarkweaveEditor,
  useMarkweaveEditorController,
  type MarkweaveContentFormat,
  type MarkweaveEditorController,
  type MarkweaveEditorMode,
  type MarkweaveTocItem,
  type MarkweaveTocState,
  type MarkweaveLang,
} from "../src";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readProjectFile = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

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
  activeRoot?.unmount();
  activeRoot = null;
  activeContainer = null;
  document.body.replaceChildren();
});

describe("editor entrypoint boundary", () => {
  it("exports the public React editor surface from the package root", async () => {
    const packageJson = JSON.parse(readProjectFile("package.json")) as { exports?: Record<string, { import?: string; types?: string } | string> };
    const indexSource = readProjectFile("src/index.ts");

    expect(packageJson.exports?.["."]).toEqual({
      import: "./dist/index.js",
      types: "./dist/types/index.d.ts",
    });
    expect(packageJson.exports?.["./styles.css"]).toBe("./dist/styles.css");
    expect(indexSource).toContain("MarkweaveEditor");
    expect(indexSource).toContain("useMarkweaveEditorController");
    expect(indexSource).toContain("createMarkweaveEditorExtensions");
    expect(indexSource).toContain("MarkweaveLang");
    expect(indexSource).toContain("MarkweaveEditorMode");
    expect(indexSource).toContain("MarkweaveContentFormat");
    expect(indexSource).toContain("MarkweaveTocItem");
    expect(indexSource).toContain("MarkweaveTocState");

    const defaultFormat: MarkweaveContentFormat = "markdown";
    const tocState: MarkweaveTocState = { activeId: null, items: [] };
    const tocItem: MarkweaveTocItem | undefined = tocState.items[0];
    expect(defaultFormat).toBe("markdown");
    expect(tocItem).toBeUndefined();
  });

  it("keeps playground code out of the publishable package", () => {
    const packageJson = JSON.parse(readProjectFile("package.json")) as { files?: string[] };

    expect(existsSync(resolve(repoRoot, "src/playground"))).toBe(false);
    expect(packageJson.files).toEqual(["dist", "README.md", "LICENSE"]);
    expect(existsSync(resolve(repoRoot, "src/editor-core/initial-document.ts"))).toBe(false);
  });

  it("renders the complete editor frame through the public component", async () => {
    const snapshots: unknown[] = [];
    const container = await renderReact(
      createElement(MarkweaveEditor, {
        defaultContent: "<p>hello editor</p>",
        defaultContentFormat: "html",
        onRuntimeStateChange: (snapshot) => snapshots.push(snapshot),
      }),
    );

    expect(container.querySelector('[data-testid="markweave-editor-frame"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("aria-label")).toBe("Markweave 编辑器");
    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("data-markweave-mode")).toBe("live");
    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("data-markweave-inner-toc")).toBe("true");
    expect(container.querySelector('[data-testid="markweave-editor-surface"]')?.innerHTML).toContain("hello editor");
    expect(snapshots.length).toBeGreaterThan(0);
    expect((snapshots.at(-1) as { mode?: string; editable?: boolean } | undefined)?.mode).toBe("live");
    expect((snapshots.at(-1) as { mode?: string; editable?: boolean } | undefined)?.editable).toBe(true);
    expect((snapshots.at(-1) as { toc?: MarkweaveTocState } | undefined)?.toc?.items).toEqual([]);
  });

  it("accepts an explicit English editor locale", async () => {
    const lang: MarkweaveLang = "en";
    const container = await renderReact(createElement(MarkweaveEditor, { defaultContent: "<p>hello editor</p>", defaultContentFormat: "html", lang }));

    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("aria-label")).toBe("Markweave editor");
  });

  it("switches between Live and View modes without recreating the editor", async () => {
    let controller: MarkweaveEditorController | null = null;

    function Harness({ editable, mode }: { readonly editable?: boolean; readonly mode: MarkweaveEditorMode }) {
      controller = useMarkweaveEditorController({
        defaultContent: '<p><a href="https://example.com">link</a></p>',
        defaultContentFormat: "html",
        editable,
        mode,
      });

      return controller.editor ? createElement("section", controller.frameProps, createElement("div", { "data-testid": "html" }, controller.editor.getHTML())) : null;
    }

    const getController = () => {
      if (!controller?.editor) {
        throw new Error("Expected Markweave editor controller to be created.");
      }

      return controller;
    };

    const container = await renderReact(createElement(Harness, { mode: "live" }));
    const firstEditor = getController().editor;

    expect(firstEditor?.isEditable).toBe(true);
    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("data-markweave-mode")).toBe("live");
    expect(getController().overlayProps.floatingToolbar).toBeTruthy();

    await act(async () => {
      activeRoot?.render(createElement(Harness, { mode: "view" }));
    });
    await flushReact();

    expect(getController().editor).toBe(firstEditor);
    expect(getController().editor?.isEditable).toBe(false);
    expect(getController().runtimeSnapshot.mode).toBe("view");
    expect(getController().runtimeSnapshot.editable).toBe(false);
    expect(getController().overlayProps.floatingToolbar).toBeNull();
    expect(getController().overlayProps.slashCommandMenu).toBeNull();
    expect(getController().overlayProps.tableControls).toBeNull();
    expect(getController().overlayProps.tableSelectionOverlay).toBeNull();
    expect(getController().overlayProps.codeBlockControls).toEqual(expect.objectContaining({ readOnly: true }));
    expect(container.querySelector('[data-testid="html"]')?.textContent).toContain("example.com");

    await act(async () => {
      activeRoot?.render(createElement(Harness, { mode: "live" }));
    });
    await flushReact();

    expect(getController().editor).toBe(firstEditor);
    expect(getController().editor?.isEditable).toBe(true);

    await act(async () => {
      activeRoot?.render(createElement(Harness, { editable: false, mode: "live" }));
    });
    await flushReact();

    expect(getController().runtimeSnapshot.mode).toBe("live");
    expect(getController().runtimeSnapshot.editable).toBe(false);
    expect(getController().editor?.isEditable).toBe(false);
  });

  it("opens safe links in View mode and ignores unsafe link protocols", async () => {
    const openWindow = vi.spyOn(window, "open").mockImplementation(() => null);
    const container = await renderReact(
      createElement(MarkweaveEditor, {
        defaultContent: '<p><a href="https://example.com/docs">safe</a> <a href="javascript:alert(1)">unsafe</a></p>',
        defaultContentFormat: "html",
        mode: "view",
      }),
    );
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>("a"));

    await act(async () => {
      links[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      links[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flushReact();

    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(openWindow).toHaveBeenCalledWith("https://example.com/docs", "_blank", "noopener,noreferrer");
  });

  it("renders Mermaid blocks as Preview by default in View mode", async () => {
    const container = await renderReact(
      createElement(MarkweaveEditor, {
        defaultContent: `<pre><code class="language-mermaid">flowchart TB
  A --> B</code></pre>`,
        defaultContentFormat: "html",
        mode: "view",
      }),
    );
    await flushReact();

    const frame = container.querySelector('[data-testid="markweave-editor-frame"]');
    const mermaidCodeBlock = container.querySelector("pre.markweave-code-block");
    const preview = container.querySelector('[data-testid="markweave-mermaid-inline-preview"]');

    expect(frame?.getAttribute("data-markweave-mode")).toBe("view");
    expect(mermaidCodeBlock?.getAttribute("data-mermaid-preview-mode")).toBe("preview");
    expect(preview).toBeTruthy();
    expect(container.querySelector('[data-testid="markweave-mermaid-tabs"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="markweave-mermaid-mode-preview"]')?.getAttribute("data-active")).toBe("true");
  });

  it("supports controlled content synchronization and onUpdate payloads", async () => {
    let controller: MarkweaveEditorController | null = null;
    const updates: string[] = [];

    function Harness({ value }: { readonly value: string }) {
      controller = useMarkweaveEditorController({
        content: value,
        contentFormat: "html",
        onUpdate: ({ html }) => updates.push(html),
      });

      return controller.editor
        ? createElement("section", controller.frameProps, createElement("div", { "data-testid": "html" }, controller.editor.getHTML()))
        : null;
    }

    const getController = () => {
      if (!controller) {
        throw new Error("Expected Markweave editor controller to be created.");
      }

      return controller;
    };

    const container = await renderReact(createElement(Harness, { value: "<p>one</p>" }));
    expect(container.querySelector('[data-testid="html"]')?.textContent).toBe("<p>one</p>");
    expect(getController().overlayProps.floatingToolbar).toBeTruthy();
    expect(getController().overlayProps.slashCommandMenu).toBeTruthy();
    expect(getController().overlayProps.tableControls).toBeTruthy();
    expect(getController().overlayProps.tableSelectionOverlay).toBeTruthy();
    expect(getController().overlayProps.codeBlockControls).toBeTruthy();

    await act(async () => {
      activeRoot?.render(createElement(Harness, { value: "<p>two</p>" }));
    });
    await flushReact();
    expect(container.querySelector('[data-testid="html"]')?.textContent).toBe("<p>two</p>");

    await act(async () => {
      getController().editor?.commands.insertContent(" updated");
    });
    await flushReact();
    expect(updates.at(-1)).toContain("updated");
  });
});
