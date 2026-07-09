// @vitest-environment jsdom

import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { act, createElement, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  MarkweaveEditor,
  useMarkweaveEditorController,
  type MarkweaveContentFormat,
  type MarkweaveContentValue,
  type MarkweaveEditorController,
  type MarkweaveEditorUpdatePayload,
} from "@markweave/react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let activeRoot: Root | null = null;
let activeController: MarkweaveEditorController | null = null;
let activeContainer: HTMLDivElement | null = null;

async function flushReact() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function getActiveController() {
  if (!activeController?.editor) {
    throw new Error("Expected Markweave editor controller.");
  }

  return activeController;
}

function Harness({
  content,
  contentFormat,
  defaultContent,
  defaultContentFormat,
  onReady,
  onUpdate,
}: {
  readonly content?: MarkweaveContentValue;
  readonly contentFormat?: MarkweaveContentFormat;
  readonly defaultContent?: MarkweaveContentValue;
  readonly defaultContentFormat?: MarkweaveContentFormat;
  readonly onReady?: (controller: MarkweaveEditorController) => void;
  readonly onUpdate?: (payload: MarkweaveEditorUpdatePayload) => void;
}) {
  const controller = useMarkweaveEditorController({
    content,
    contentFormat,
    defaultContent,
    defaultContentFormat,
    onUpdate,
  });

  useEffect(() => {
    if (controller.editor) {
      activeController = controller;
      onReady?.(controller);
    }
  }, [controller, onReady]);

  return controller.editor ? createElement("section", controller.frameProps, createElement(EditorContent, { editor: controller.editor })) : null;
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
  activeController = null;
  activeContainer = null;
  document.body.replaceChildren();
});

describe("Markdown-first content API", () => {
  it("parses defaultContent as Markdown when no format is provided", async () => {
    const container = await renderReact(createElement(MarkweaveEditor, { defaultContent: "# Markdown Title\n\nA **bold** paragraph." }));

    expect(container.querySelector("h1")?.textContent).toBe("Markdown Title");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
  });

  it("keeps explicit HTML input available for compatibility", async () => {
    const container = await renderReact(createElement(MarkweaveEditor, { defaultContent: "<h2>HTML Title</h2>", defaultContentFormat: "html" }));

    expect(container.querySelector("h2")?.textContent).toBe("HTML Title");
  });

  it("accepts explicit JSON input for compatibility", async () => {
    const json: JSONContent = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "JSON Title" }],
        },
      ],
    };
    const container = await renderReact(createElement(MarkweaveEditor, { defaultContent: json, defaultContentFormat: "json" }));

    expect(container.querySelector("h2")?.textContent).toBe("JSON Title");
  });

  it("synchronizes controlled Markdown content and setContent format", async () => {
    const container = await renderReact(createElement(Harness, { content: "# One", contentFormat: "markdown" }));

    expect(container.querySelector("h1")?.textContent).toBe("One");

    await act(async () => {
      activeRoot?.render(createElement(Harness, { content: "## Two", contentFormat: "markdown" }));
    });
    await flushReact();

    expect(container.querySelector("h2")?.textContent).toBe("Two");

    await act(async () => {
      getActiveController().actions.setContent("<h3>Three</h3>", { format: "html" });
    });
    await flushReact();

    expect(container.querySelector("h3")?.textContent).toBe("Three");

    await act(async () => {
      getActiveController().actions.setContent(
        {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Four from JSON" }] }],
        },
        { format: "json" },
      );
    });
    await flushReact();

    expect(container.querySelector("p")?.textContent).toBe("Four from JSON");
  });

  it("emits markdown as the canonical update payload", async () => {
    const updates: MarkweaveEditorUpdatePayload[] = [];
    await renderReact(createElement(Harness, { defaultContent: "# Start", onUpdate: (payload) => updates.push(payload) }));

    await act(async () => {
      getActiveController().editor?.commands.insertContent(" updated");
    });
    await flushReact();

    expect(updates.at(-1)?.markdown).toContain("updated");
    expect(updates.at(-1)?.html).toContain("updated");
    expect(updates.at(-1)?.json.type).toBe("doc");
  });

  it("round-trips Markweave markdown nodes without losing custom content", async () => {
    const markdown = [
      "# Markweave",
      "",
      "- [x] Ship Markdown",
      "- [ ] Keep View stable",
      "",
      "| Capability | Status |",
      "| --- | --- |",
      "| Markdown | first |",
      "",
      "```mermaid",
      "graph TD",
      "  A --> B",
      "```",
      "",
      ":::warning",
      "",
      "Use explicit fallbacks for custom nodes.",
      "",
      ":::",
      "",
      '<figure data-markweave-image="true" data-markweave-image-align="right"><img src="https://example.com/diagram.png" alt="Diagram" width="480" /><figcaption>Diagram caption</figcaption></figure>',
      "",
      '<iframe data-markweave-video-embed="true" data-markweave-video-provider="youtube" data-markweave-video-src="https://www.youtube.com/embed/fPiUC5NxFic" src="https://www.youtube.com/embed/fPiUC5NxFic"></iframe>',
      "",
      '<a href="markweave://sample/spec.pdf" data-markweave-attachment="true" data-markweave-attachment-name="spec.pdf">spec.pdf</a>',
    ].join("\n");

    await renderReact(createElement(Harness, { defaultContent: markdown }));
    const editor = getActiveController().editor;

    expect(editor?.getJSON().content?.some((node) => node.type === "taskList")).toBe(true);
    expect(editor?.getJSON().content?.some((node) => node.type === "table")).toBe(true);
    expect(editor?.getJSON().content?.some((node) => node.type === "codeBlock" && node.attrs?.language === "mermaid")).toBe(true);
    expect(editor?.getJSON().content?.some((node) => node.type === "markweaveCallout" && node.attrs?.type === "warning")).toBe(true);
    expect(editor?.getJSON().content?.some((node) => node.type === "image" && node.attrs?.caption === "Diagram caption")).toBe(true);
    expect(editor?.getJSON().content?.some((node) => node.type === "markweaveVideo" && node.attrs?.provider === "youtube")).toBe(true);
    expect(editor?.getJSON().content?.some((node) => node.type === "markweaveAttachment")).toBe(true);

    const serialized = editor?.getMarkdown() ?? "";
    expect(serialized).toContain("```mermaid");
    expect(serialized).toContain(":::warning");
    expect(serialized).toContain("data-markweave-image");
    expect(serialized).toContain("data-markweave-video-embed");
    expect(serialized).toContain("data-markweave-attachment");
  });
});
