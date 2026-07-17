// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { createSelectionSnapshot } from "../src/editor-core/selection-state";
import {
  copyActiveCodeBlock,
  formatCodeBlockCopyFeedback,
  getActiveCodeBlockState,
  getCodeBlockCopyFeedbackSnapshot,
  isActiveCodeBlockCollapsed,
  normalizeCodeBlockLanguage,
  markweaveCodeBlockBehavior,
  markweaveCodeBlockLanguages,
  defaultMarkweaveCodeBlockLanguages,
  setActiveCodeBlockLanguage,
  setActiveCodeBlockCollapsed,
  toggleActiveCodeBlockCollapsed,
} from "../src/plugins/codeblock/codeblock-behavior";
import { createMarkweaveLowlight } from "../src/plugins/codeblock/codeblock-lowlight";
import {
  codeBlockHighlightFixtures,
  intentionallyUnhighlightedCodeBlockLanguages,
} from "./fixtures/codeblock-highlight-fixtures";

let activeEditor: Editor | null = null;
const addedMockMethods: Array<{ prototype: object; key: string }> = [];

function createEditor(content = "<p></p>") {
  const element = document.createElement("div");
  document.body.appendChild(element);

  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions(),
    content,
  });

  return activeEditor;
}

function textPosition(editor: Editor, text: string, boundary: "start" | "end" = "end") {
  let position: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return true;
    }

    const offset = node.text.indexOf(text);
    if (offset < 0) {
      return true;
    }

    position = pos + offset + (boundary === "end" ? text.length : 0);
    return false;
  });

  if (position === null) {
    throw new Error(`Expected text "${text}".`);
  }

  return position;
}

function codeBlockSnapshot(editor: Editor): { language: string | null; text: string } | null {
  let snapshot: { language: string | null; text: string } | null = null;

  editor.state.doc.descendants((node) => {
    if (node.type.name !== "codeBlock") {
      return true;
    }

    snapshot = {
      language: node.attrs.language ?? null,
      text: node.textContent,
    };
    return false;
  });

  return snapshot;
}

function collectHighlightClasses(node: unknown): string[] {
  if (!node || typeof node !== "object") {
    return [];
  }

  const candidate = node as {
    properties?: { className?: unknown };
    children?: unknown;
  };
  const classNames = Array.isArray(candidate.properties?.className)
    ? candidate.properties.className.filter((className): className is string => typeof className === "string")
    : [];

  for (const child of Array.isArray(candidate.children) ? candidate.children : []) {
    classNames.push(...collectHighlightClasses(child));
  }

  return classNames;
}

function collectHighlightTokenText(node: unknown, className: string): string[] {
  if (!node || typeof node !== "object") {
    return [];
  }

  const candidate = node as {
    type?: unknown;
    value?: unknown;
    properties?: { className?: unknown };
    children?: unknown;
  };
  const children = Array.isArray(candidate.children) ? candidate.children : [];
  const text = children
    .map((child) => {
      if (!child || typeof child !== "object") {
        return "";
      }
      const textNode = child as { type?: unknown; value?: unknown };
      return textNode.type === "text" && typeof textNode.value === "string" ? textNode.value : "";
    })
    .join("");
  const tokens = Array.isArray(candidate.properties?.className) && candidate.properties.className.includes(className)
    ? [text]
    : [];

  for (const child of children) {
    tokens.push(...collectHighlightTokenText(child, className));
  }

  return tokens;
}

function dispatchKey(editor: Editor, key: string, shiftKey = false) {
  const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  let handled = false;

  editor.view.someProp("handleKeyDown", (handler) => {
    const didHandle = handler(editor.view, event) === true;
    handled = handled || didHandle;
    return didHandle;
  });

  return handled;
}

function dispatchTextInput(editor: Editor, text: string) {
  const { from, to } = editor.state.selection;
  let handled = false;

  editor.view.someProp("handleTextInput", (handler) => {
    const didHandle = handler(editor.view, from, to, text, () => editor.state.tr) === true;
    handled = handled || didHandle;
    return didHandle;
  });

  return handled;
}

function installLayoutMocks() {
  const rect = {
    bottom: 20,
    height: 20,
    left: 0,
    right: 80,
    top: 0,
    width: 80,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
  const rects = Object.assign([rect], { item: (index: number) => rects[index] ?? null }) as unknown as DOMRectList;

  mockPrototypeMethod(Range.prototype, "getClientRects", () => rects);
  mockPrototypeMethod(Range.prototype, "getBoundingClientRect", () => rect);
  mockPrototypeMethod(HTMLElement.prototype, "getClientRects", () => rects);
  mockPrototypeMethod(HTMLElement.prototype, "getBoundingClientRect", () => rect);
}

function mockPrototypeMethod(prototype: object, key: string, implementation: () => unknown) {
  if (key in prototype) {
    vi.spyOn(prototype as Record<string, () => unknown>, key).mockImplementation(implementation);
    return;
  }

  Object.defineProperty(prototype, key, {
    configurable: true,
    value: vi.fn(implementation),
  });
  addedMockMethods.push({ prototype, key });
}

afterEach(() => {
  vi.restoreAllMocks();
  while (addedMockMethods.length > 0) {
    const method = addedMockMethods.pop();
    if (method) {
      delete (method.prototype as Record<string, unknown>)[method.key];
    }
  }
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("code block behavior", () => {
  it("tracks Markweave-bundled language assets while preserving local fence aliases", () => {
    expect(defaultMarkweaveCodeBlockLanguages).toEqual(
      expect.arrayContaining([
        "angular-html",
        "javascript",
        "typescript",
        "tsx",
        "python",
        "rust",
        "go",
        "json",
        "xml",
        "properties",
        "dockerfile",
        "graphql",
        "kotlin",
        "scala",
        "yaml",
      ]),
    );
    expect(defaultMarkweaveCodeBlockLanguages).toContain("shellscript");
    expect(defaultMarkweaveCodeBlockLanguages).toContain("mermaid");
    expect(defaultMarkweaveCodeBlockLanguages).toContain("java");
    expect(markweaveCodeBlockLanguages).toEqual(expect.arrayContaining(["text", "js", "jsx", "ts"]));
    expect(normalizeCodeBlockLanguage("typescript")).toBe("typescript");
    expect(normalizeCodeBlockLanguage("java")).toBe("java");
    expect(normalizeCodeBlockLanguage("ts")).toBe("ts");
    expect(normalizeCodeBlockLanguage("unsupported-language")).toBe(markweaveCodeBlockBehavior.defaultLanguage);
  });

  it("registers a Lowlight grammar or compatibility alias for every selectable language", () => {
    const lowlight = createMarkweaveLowlight();

    expect(markweaveCodeBlockLanguages.filter((language) => !lowlight.registered(language))).toEqual([]);
  });

  it.each(["bash", "shell", "shellscript"] as const)(
    "highlights commands, options, and URLs in %s code blocks",
    (language) => {
      const lowlight = createMarkweaveLowlight();
      const result = lowlight.highlight(language, "npm login --registry=https://registry.npmjs.org/");

      expect(collectHighlightClasses(result)).toEqual(
        expect.arrayContaining(["hljs-title", "function_", "hljs-attr", "hljs-link"]),
      );
    },
  );

  it("uses the terminal-session grammar for shellsession fences", () => {
    const lowlight = createMarkweaveLowlight();
    const result = lowlight.highlight(
      "shellsession",
      "$ npm login --registry=https://registry.npmjs.org/\nLogged in as refinex",
    );

    expect(collectHighlightClasses(result)).toEqual(
      expect.arrayContaining(["hljs-meta", "prompt_", "hljs-title", "function_", "hljs-attr", "hljs-link"]),
    );
  });

  it("preserves standard Bash keyword and built-in classifications", () => {
    const lowlight = createMarkweaveLowlight();
    const result = lowlight.highlight("bash", 'if true; then echo "$HOME"; fi\nreturn 0');

    expect(collectHighlightTokenText(result, "hljs-keyword")).toEqual(expect.arrayContaining(["if", "then", "fi"]));
    expect(collectHighlightTokenText(result, "hljs-built_in")).toEqual(expect.arrayContaining(["echo", "return"]));
    expect(collectHighlightTokenText(result, "hljs-title")).not.toEqual(
      expect.arrayContaining(["if", "then", "echo", "fi", "return"]),
    );
  });

  it.each(markweaveCodeBlockLanguages)("produces the expected syntax token coverage for %s", (language) => {
    const lowlight = createMarkweaveLowlight();
    const result = lowlight.highlight(language, codeBlockHighlightFixtures[language]);
    const classNames = collectHighlightClasses(result);

    if (intentionallyUnhighlightedCodeBlockLanguages.has(language)) {
      expect(classNames).toEqual([]);
      return;
    }

    expect(classNames.some((className) => className.startsWith("hljs-"))).toBe(true);
  });

  it("renders lowlight syntax tokens while preserving the code block language", () => {
    const editor = createEditor('<pre><code class="language-java">public class HarnessAgent {}</code></pre>');
    expect(editor.commands.setTextSelection(textPosition(editor, "HarnessAgent"))).toBe(true);

    const code = editor.view.dom.querySelector("pre.markweave-code-block code");

    expect(codeBlockSnapshot(editor)).toEqual({ language: "java", text: "public class HarnessAgent {}" });
    expect(code?.querySelector(".hljs-keyword")?.textContent).toBe("public");
    expect(code?.querySelector(".hljs-title")?.textContent).toBe("HarnessAgent");
  });

  it("renders XML syntax tokens", () => {
    const editor = createEditor(
      '<pre><code class="language-xml">&lt;root enabled="true"&gt;&lt;child&gt;value&lt;/child&gt;&lt;/root&gt;</code></pre>',
    );
    const code = editor.view.dom.querySelector("pre.markweave-code-block code");

    expect(codeBlockSnapshot(editor)).toEqual({ language: "xml", text: '<root enabled="true"><child>value</child></root>' });
    expect(code?.querySelector(".hljs-name")?.textContent).toBe("root");
    expect(code?.querySelector(".hljs-attr")?.textContent).toBe("enabled");
  });

  it("renders Properties syntax tokens", () => {
    const editor = createEditor(`<pre><code class="language-properties">server.port=8080
feature.enabled=true</code></pre>`);
    const code = editor.view.dom.querySelector("pre.markweave-code-block code");

    expect(codeBlockSnapshot(editor)).toEqual({ language: "properties", text: "server.port=8080\nfeature.enabled=true" });
    expect(code?.querySelector(".hljs-attr")?.textContent).toBe("server.port");
    expect(code?.querySelector(".hljs-string")?.textContent).toBe("8080");
  });

  it("disables browser spellcheck inside rendered code blocks", () => {
    const editor = createEditor('<pre><code class="language-ts">const value = "markweave-editor";</code></pre>');

    const codeBlock = editor.view.dom.querySelector("pre.markweave-code-block");

    expect(codeBlock?.getAttribute("spellcheck")).toBe("false");
  });

  it("restores code block focus when a highlighted code token is clicked", () => {
    const editor = createEditor('<pre><code class="language-java">public class HarnessAgent {}</code></pre><p>after</p>');
    expect(editor.commands.setTextSelection(textPosition(editor, "after"))).toBe(true);
    expect(getActiveCodeBlockState(editor).active).toBe(false);
    const target = editor.view.dom.querySelector<HTMLElement>("pre.markweave-code-block .hljs-keyword");
    const targetPosition = textPosition(editor, "public", "end");

    if (!target) {
      throw new Error("Expected highlighted code token.");
    }

    vi.spyOn(editor.view, "posAtCoords").mockReturnValue({ pos: targetPosition, inside: -1 });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 24, clientY: 24 });
    Object.defineProperty(event, "target", { value: target });
    let handled = false;

    editor.view.someProp("handleClick", (handler) => {
      const didHandle = handler(editor.view, targetPosition, event) === true;
      handled = handled || didHandle;
      return didHandle;
    });

    expect(handled).toBe(true);
    expect(getActiveCodeBlockState(editor)).toMatchObject({
      active: true,
      language: "java",
      text: "public class HarnessAgent {}",
    });
  });

  it("converts fenced backtick input into a language-tagged code block", () => {
    const editor = createEditor("<p></p>");

    expect(dispatchTextInput(editor, "```ts ")).toBe(true);

    expect(codeBlockSnapshot(editor)).toEqual({ language: "ts", text: "" });
  });

  it("changes the active code block language without changing code text", () => {
    const editor = createEditor('<pre><code class="language-ts">const value = 1;</code></pre>');
    expect(editor.commands.setTextSelection(textPosition(editor, "value"))).toBe(true);

    expect(setActiveCodeBlockLanguage(editor, "json")).toBe(true);

    expect(codeBlockSnapshot(editor)).toEqual({ language: "json", text: "const value = 1;" });
  });

  it("copies only the active code block text payload", async () => {
    const editor = createEditor('<pre><code class="language-ts">const value = 1;</code></pre>');
    const writes: string[] = [];
    expect(editor.commands.setTextSelection(textPosition(editor, "value"))).toBe(true);

    await expect(
      copyActiveCodeBlock(editor, {
        writeText: async (text) => {
          writes.push(text);
        },
      }),
    ).resolves.toBe(true);

    expect(writes).toEqual(["const value = 1;"]);
  });

  it("collapses and expands the active code block without mutating document content", () => {
    const editor = createEditor(`<pre><code>alpha
beta
gamma</code></pre>`);
    expect(editor.commands.setTextSelection(textPosition(editor, "beta"))).toBe(true);
    const initialHtml = editor.getHTML();

    expect(isActiveCodeBlockCollapsed(editor)).toBe(false);
    expect(toggleActiveCodeBlockCollapsed(editor)).toBe(true);

    expect(isActiveCodeBlockCollapsed(editor)).toBe(true);
    const collapsedCodeBlock = editor.view.dom.querySelector<HTMLElement>("pre");
    expect(collapsedCodeBlock?.getAttribute("data-markweave-collapsed")).toBe("true");
    expect(collapsedCodeBlock?.getAttribute("data-markweave-collapsed-language")).toBe("Plain Text");
    expect(collapsedCodeBlock?.getAttribute("data-markweave-collapsed-lines")).toBe("3 lines");
    expect(editor.getHTML()).toBe(initialHtml);

    if (!collapsedCodeBlock) {
      throw new Error("Expected collapsed code block.");
    }

    const event = new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 24, clientY: 24 });
    Object.defineProperty(event, "target", { value: collapsedCodeBlock });
    let handled = false;

    editor.view.someProp("handleClick", (handler) => {
      const didHandle = handler(editor.view, 1, event) === true;
      handled = handled || didHandle;
      return didHandle;
    });

    expect(handled).toBe(true);
    expect(isActiveCodeBlockCollapsed(editor)).toBe(false);
    expect(editor.view.dom.querySelector("pre")?.hasAttribute("data-markweave-collapsed")).toBe(false);
    expect(editor.getHTML()).toBe(initialHtml);

    expect(toggleActiveCodeBlockCollapsed(editor)).toBe(true);
    expect(setActiveCodeBlockCollapsed(editor, false)).toBe(true);
    expect(isActiveCodeBlockCollapsed(editor)).toBe(false);
    expect(editor.getHTML()).toBe(initialHtml);
  });

  it("returns a stable failed result when the code block clipboard write is rejected", async () => {
    const editor = createEditor('<pre><code class="language-ts">const value = 1;</code></pre>');
    expect(editor.commands.setTextSelection(textPosition(editor, "value"))).toBe(true);

    await expect(
      copyActiveCodeBlock(editor, {
        writeText: async () => {
          throw new Error("NotAllowedError");
        },
      }),
    ).resolves.toBe(false);
  });

  it("formats code block copy feedback from the active code payload", () => {
    const editor = createEditor('<pre><code class="language-ts">const value = 1;</code></pre>');
    expect(editor.commands.setTextSelection(textPosition(editor, "value"))).toBe(true);

    const feedback = getCodeBlockCopyFeedbackSnapshot(getActiveCodeBlockState(editor), "copied");

    expect(feedback).toEqual({
      status: "copied",
      label: "Code copied to clipboard",
      language: "ts",
      textLength: 16,
    });
    expect(formatCodeBlockCopyFeedback(feedback)).toBe("Code copied to clipboard | text 16 | ts");
  });

  it("indents code lines with Tab", () => {
    const editor = createEditor('<pre><code class="language-ts">alpha</code></pre>');
    expect(editor.commands.setTextSelection(textPosition(editor, "alpha"))).toBe(true);

    expect(dispatchKey(editor, "Tab")).toBe(true);
    expect(codeBlockSnapshot(editor)?.text).toBe(`alpha${" ".repeat(markweaveCodeBlockBehavior.tabSize)}`);
  });

  it("reverse-indents leading spaces with Shift+Tab", () => {
    const editor = createEditor('<pre><code class="language-ts">  alpha</code></pre>');
    expect(editor.commands.setTextSelection(textPosition(editor, "alpha"))).toBe(true);

    expect(dispatchKey(editor, "Tab", true)).toBe(true);
    expect(codeBlockSnapshot(editor)?.text).toBe("alpha");
  });

  it("keeps Enter inside a code block as code text before triple-enter exit", () => {
    const editor = createEditor('<pre><code class="language-ts">alpha</code></pre>');
    expect(editor.commands.setTextSelection(textPosition(editor, "alpha"))).toBe(true);

    expect(dispatchKey(editor, "Enter")).toBe(true);

    const codeBlock = codeBlockSnapshot(editor);
    expect(codeBlock?.text).toBe("alpha\n");
    expect(getActiveCodeBlockState(editor).active).toBe(true);
  });

  it("exits a code block after triple Enter", () => {
    const editor = createEditor('<pre><code class="language-ts">alpha</code></pre>');
    expect(editor.commands.setTextSelection(textPosition(editor, "alpha"))).toBe(true);

    expect(dispatchKey(editor, "Enter")).toBe(true);
    expect(dispatchKey(editor, "Enter")).toBe(true);
    expect(dispatchKey(editor, "Enter")).toBe(true);

    expect(getActiveCodeBlockState(editor).active).toBe(false);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
  });

  it("exits a final code block on ArrowDown at the end", () => {
    installLayoutMocks();
    const editor = createEditor('<pre><code class="language-ts">alpha</code></pre>');
    expect(editor.commands.setTextSelection(textPosition(editor, "alpha"))).toBe(true);

    expect(dispatchKey(editor, "ArrowDown")).toBe(true);

    expect(getActiveCodeBlockState(editor).active).toBe(false);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
  });

  it("suppresses the floating toolbar for code block selections", () => {
    const editor = createEditor('<pre><code class="language-ts">alpha beta</code></pre>');
    const start = textPosition(editor, "alpha", "start");
    const end = textPosition(editor, "beta", "end");

    expect(editor.commands.setTextSelection({ from: start, to: end })).toBe(true);

    const snapshot = createSelectionSnapshot(editor);
    expect(snapshot.currentNode).toBe("codeBlock");
    expect(snapshot.surface).toBe("suppressed");
    expect(snapshot.floatingToolbarVariant).toBe("hidden");
  });
});
