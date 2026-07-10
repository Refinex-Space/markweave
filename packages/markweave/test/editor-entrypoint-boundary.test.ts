// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
} from "@markweave/react";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const readPackageFile = (path: string) => readFileSync(resolve(packageRoot, path), "utf8");
const readWorkspaceFile = (path: string) => readFileSync(resolve(workspaceRoot, path), "utf8");
const repositoryUrl = "git+https://github.com/Refinex-Space/markweave.git";
const homepageUrl = "https://github.com/Refinex-Space/markweave#readme";
const bugsUrl = "https://github.com/Refinex-Space/markweave/issues";

function listProjectFiles(path: string): string[] {
  const absolutePath = resolve(packageRoot, path);
  return readdirSync(absolutePath).flatMap((entry) => {
    const relativePath = `${path}/${entry}`;
    const entryPath = resolve(packageRoot, relativePath);
    const stat = statSync(entryPath);

    if (stat.isDirectory()) {
      return listProjectFiles(relativePath);
    }

    return relativePath;
  });
}

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
  it("keeps npm publishing metadata explicit for every publishable package", () => {
    const packages = [
      { path: "packages/markweave", scoped: false },
      { path: "packages/markweave-react", scoped: true },
      { path: "packages/markweave-vue2", scoped: true },
      { path: "packages/markweave-vue3", scoped: true },
    ] as const;

    for (const item of packages) {
      const packageJson = JSON.parse(readWorkspaceFile(`${item.path}/package.json`)) as {
        bugs?: { url?: string };
        homepage?: string;
        keywords?: string[];
        publishConfig?: { access?: string; registry?: string };
        repository?: { directory?: string; type?: string; url?: string };
      };

      expect(packageJson.homepage).toBe(homepageUrl);
      expect(packageJson.bugs).toEqual({ url: bugsUrl });
      expect(packageJson.repository).toEqual({
        directory: item.path,
        type: "git",
        url: repositoryUrl,
      });
      expect(packageJson.keywords).toEqual(expect.arrayContaining(["markdown", "wysiwyg", "editor", "tiptap", "prosemirror"]));
      expect(packageJson.publishConfig?.registry).toBe("https://registry.npmjs.org/");
      expect(packageJson.publishConfig?.access).toBe(item.scoped ? "public" : undefined);
    }
  });

  it("exports framework-neutral root APIs plus legacy adapter shims", async () => {
    const packageJson = JSON.parse(readPackageFile("package.json")) as { exports?: Record<string, { import?: string; types?: string } | string> };
    const indexSource = readPackageFile("src/index.ts");
    const reactShim = readPackageFile("react.js");
    const vue2Shim = readPackageFile("vue2.js");
    const vue3Shim = readPackageFile("vue3.js");
    const reactIndexSource = readWorkspaceFile("packages/markweave-react/src/index.ts");
    const vue2IndexSource = readWorkspaceFile("packages/markweave-vue2/src/index.ts");
    const vue3IndexSource = readWorkspaceFile("packages/markweave-vue3/src/index.ts");

    expect(packageJson.exports?.["."]).toEqual({
      import: "./dist/index.js",
      types: "./dist/types/index.d.ts",
    });
    expect(packageJson.exports?.["./react"]).toEqual({
      import: "./react.js",
      types: "./react.d.ts",
    });
    expect(packageJson.exports?.["./vue3"]).toEqual({
      import: "./vue3.js",
      types: "./vue3.d.ts",
    });
    expect(packageJson.exports?.["./vue2"]).toEqual({
      import: "./vue2.js",
      types: "./vue2.d.ts",
    });
    expect(packageJson.exports?.["./internal/*"]).toEqual({
      import: "./dist/*.js",
      types: "./dist/types/*.d.ts",
    });
    expect(packageJson.exports?.["./styles.css"]).toBe("./dist/styles.css");
    expect(indexSource).not.toContain("from \"./react");
    expect(indexSource).not.toContain("from \"./ui/");
    expect(indexSource).not.toContain("useMarkweaveEditorController");
    expect(indexSource).toContain("createMarkweaveEditorExtensions");
    expect(indexSource).toContain("MarkweaveLang");
    expect(indexSource).toContain("MarkweaveEditorMode");
    expect(indexSource).toContain("MarkweaveContentFormat");
    expect(indexSource).toContain("MarkweaveTocItem");
    expect(indexSource).toContain("MarkweaveTocState");
    expect(reactShim).toContain('from "@markweave/react"');
    expect(vue2Shim).toContain('from "@markweave/vue2"');
    expect(vue3Shim).toContain('from "@markweave/vue3"');
    expect(reactIndexSource).toContain("MarkweaveEditor");
    expect(reactIndexSource).toContain("useMarkweaveEditorController");
    expect(vue2IndexSource).toContain("MarkweaveEditor");
    expect(vue2IndexSource).toContain("useMarkweaveEditorController");
    expect(vue3IndexSource).toContain("MarkweaveEditor");
    expect(vue3IndexSource).toContain("useMarkweaveEditorController");

    const defaultFormat: MarkweaveContentFormat = "markdown";
    const tocState: MarkweaveTocState = { activeId: null, items: [] };
    const tocItem: MarkweaveTocItem | undefined = tocState.items[0];
    expect(defaultFormat).toBe("markdown");
    expect(tocItem).toBeUndefined();
  });

  it("keeps playground code out of the publishable package", () => {
    const packageJson = JSON.parse(readPackageFile("package.json")) as { files?: string[] };

    expect(existsSync(resolve(packageRoot, "src/playground"))).toBe(false);
    expect(packageJson.files).toEqual(["dist", "react.js", "react.d.ts", "vue2.js", "vue2.d.ts", "vue3.js", "vue3.d.ts", "styles.css", "README.md", "LICENSE"]);
    expect(existsSync(resolve(packageRoot, "src/editor-core/initial-document.ts"))).toBe(false);
  });

  it("keeps framework source out of the core package", () => {
    const tsxFiles = listProjectFiles("src").filter((path) => path.endsWith(".tsx"));

    expect(tsxFiles).toEqual([]);
    expect(existsSync(resolve(packageRoot, "src/react"))).toBe(false);
    expect(existsSync(resolve(packageRoot, "src/vue2"))).toBe(false);
    expect(existsSync(resolve(packageRoot, "src/vue3"))).toBe(false);
  });

  it("keeps core, editor-core, and plugin layers framework-neutral", () => {
    const forbiddenImports = [
      "from \"react\"",
      "from \"@tiptap/react\"",
      "from \"@tiptap/react/menus\"",
      "from \"lucide-react\"",
      "from \"vue\"",
      "from \"@tiptap/vue-2\"",
      "from \"@tiptap/vue-2/menus\"",
      "from \"lucide-vue\"",
      "from \"@tiptap/vue-3\"",
      "from \"@tiptap/vue-3/menus\"",
      "from \"lucide-vue-next\"",
    ];
    const scannedFiles = [
      "src/index.ts",
      ...listProjectFiles("src/core"),
      ...listProjectFiles("src/editor-core"),
      ...listProjectFiles("src/plugins"),
    ].filter((path) => /\.(ts|tsx)$/.test(path));
    const violations = scannedFiles.flatMap((path) => {
      const source = readPackageFile(path);
      return forbiddenImports.filter((importText) => source.includes(importText)).map((importText) => `${path}: ${importText}`);
    });

    expect(violations).toEqual([]);
  });

  it("keeps adapter package dependencies scoped to their owning frameworks", () => {
    const corePackage = JSON.parse(readPackageFile("package.json")) as { version?: string };
    const reactPackage = JSON.parse(readWorkspaceFile("packages/markweave-react/package.json")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const vue2Package = JSON.parse(readWorkspaceFile("packages/markweave-vue2/package.json")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const vue3Package = JSON.parse(readWorkspaceFile("packages/markweave-vue3/package.json")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const publishedCoreDependency = `^${corePackage.version}`;

    expect(reactPackage.dependencies).toEqual(expect.objectContaining({ markweave: "workspace:^", "@tiptap/react": "^3.27.1" }));
    expect(publishedCoreDependency).toBe("^0.1.6");
    expect(reactPackage.peerDependencies).toEqual({ react: "^18.2.0 || ^19.0.0", "react-dom": "^18.2.0 || ^19.0.0" });
    expect(reactPackage.dependencies).not.toHaveProperty("@tiptap/vue-2");
    expect(reactPackage.dependencies).not.toHaveProperty("@tiptap/vue-3");

    expect(vue2Package.dependencies).toEqual(expect.objectContaining({ markweave: "workspace:^", "@tiptap/vue-2": "3.27.1" }));
    expect(publishedCoreDependency).toBe("^0.1.6");
    expect(vue2Package.peerDependencies).toEqual({ vue: "^2.6.12" });
    expect(vue2Package.dependencies).not.toHaveProperty("@tiptap/react");
    expect(vue2Package.dependencies).not.toHaveProperty("@tiptap/vue-3");

    expect(vue3Package.dependencies).toEqual(expect.objectContaining({ markweave: "workspace:^", "@tiptap/vue-3": "^3.27.1" }));
    expect(publishedCoreDependency).toBe("^0.1.6");
    expect(vue3Package.peerDependencies).toEqual({ vue: "^3.3.0" });
    expect(vue3Package.dependencies).not.toHaveProperty("@tiptap/react");
    expect(vue3Package.dependencies).not.toHaveProperty("@tiptap/vue-2");
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
    expect(container.querySelector('[data-testid="markweave-editor-frame"]')?.getAttribute("data-markweave-inner-toc-placement")).toBe("container");
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
  }, 15000);

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
