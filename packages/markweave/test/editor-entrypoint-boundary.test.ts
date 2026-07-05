// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MarkweaveEditor, useMarkweaveEditorController, type MarkweaveEditorController, type MarkweaveLang } from "../src";

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
        onRuntimeStateChange: (snapshot) => snapshots.push(snapshot),
      }),
    );

    expect(container.querySelector('[data-testid="markweave-editor-frame"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("aria-label")).toBe("Markweave 编辑器");
    expect(container.querySelector('[data-testid="markweave-editor-surface"]')?.innerHTML).toContain("hello editor");
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it("accepts an explicit English editor locale", async () => {
    const lang: MarkweaveLang = "en";
    const container = await renderReact(createElement(MarkweaveEditor, { defaultContent: "<p>hello editor</p>", lang }));

    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("aria-label")).toBe("Markweave editor");
  });

  it("supports controlled content synchronization and onUpdate payloads", async () => {
    let controller: MarkweaveEditorController | null = null;
    const updates: string[] = [];

    function Harness({ value }: { readonly value: string }) {
      controller = useMarkweaveEditorController({
        content: value,
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
