import { describe, expect, it } from "vitest";
import {
  getMermaidPreviewPresentation,
  getMermaidPreviewState,
  normalizeMermaidPreviewMode,
  markweaveMermaidBehavior,
  renderMermaidDiagram,
  type MermaidRenderer,
} from "../src/plugins/mermaid/mermaid-renderer";

describe("mermaid renderer baseline", () => {
  it("renders non-empty source through the configured renderer", async () => {
    const calls: Array<{ id: string; source: string; theme: string }> = [];
    const renderer: MermaidRenderer = {
      render: async (id, source, theme) => {
        calls.push({ id, source, theme });
        return { svg: `<svg data-id="${id}">${source}</svg>` };
      },
    };

    await expect(renderMermaidDiagram("  graph TD\nA --> B  ", { id: "diagram-1", renderer })).resolves.toEqual({
      status: "rendered",
      svg: '<svg data-id="diagram-1">graph TD\nA --> B</svg>',
      error: null,
    });
    expect(calls).toEqual([{ id: "diagram-1", source: "graph TD\nA --> B", theme: "light" }]);
  });

  it("passes the selected dark theme through to a renderer", async () => {
    const renderer: MermaidRenderer = {
      render: async (_id, _source, theme) => ({ svg: `<svg data-theme="${theme}" />` }),
    };

    await expect(renderMermaidDiagram("graph TD\nA --> B", { renderer, theme: "dark" })).resolves.toMatchObject({
      status: "rendered",
      svg: '<svg data-theme="dark" />',
    });
  });

  it("keeps empty source recoverable without invoking Mermaid", async () => {
    const renderer: MermaidRenderer = {
      render: async () => {
        throw new Error("render should not run");
      },
    };

    await expect(renderMermaidDiagram("  \n ", { renderer })).resolves.toEqual({
      status: "empty",
      svg: "",
      error: null,
    });
  });

  it("returns an error state instead of losing source on invalid diagrams", async () => {
    const renderer: MermaidRenderer = {
      render: async () => {
        throw new Error("Parse error");
      },
    };

    await expect(renderMermaidDiagram(">", { renderer })).resolves.toEqual({
      status: "error",
      svg: "",
      error: "Parse error",
    });
  });

  it("uses strict Mermaid security for the local preview baseline", () => {
    expect(markweaveMermaidBehavior.securityLevel).toBe("strict");
    expect(markweaveMermaidBehavior.defaultMode).toBe("code");
    expect(markweaveMermaidBehavior.theme).toBe("base");
    expect(markweaveMermaidBehavior.themeVariables).toMatchObject({
      background: "transparent",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      primaryColor: "#eef0ea",
      primaryTextColor: "#2f352e",
      primaryBorderColor: "#bcc6b7",
      lineColor: "#7c8a74",
      tertiaryColor: "#f8faf6",
    });
  });

  it("models Code and Preview mode without losing source text", () => {
    expect(normalizeMermaidPreviewMode("invalid")).toBe("code");

    expect(getMermaidPreviewState({ active: true, mode: "preview", source: "graph TD\nA --> B" })).toEqual({
      active: true,
      mode: "preview",
      source: "graph TD\nA --> B",
      shouldRenderPreview: true,
      sourceRecoverable: true,
    });

    expect(getMermaidPreviewState({ active: true, mode: "code", source: "graph TD\nA --> B" })).toMatchObject({
      mode: "code",
      shouldRenderPreview: false,
      sourceRecoverable: true,
    });

    expect(getMermaidPreviewState({ active: false, mode: "preview", source: "graph TD\nA --> B" })).toEqual({
      active: false,
      mode: "code",
      source: "",
      shouldRenderPreview: false,
      sourceRecoverable: false,
    });
  });

  it("maps render results to recoverable preview presentation states", () => {
    expect(
      getMermaidPreviewPresentation({
        active: false,
        mode: "preview",
        result: { status: "rendered", svg: "<svg />", error: null },
      }),
    ).toEqual({
      visibility: "hidden",
      sourceRecoverable: false,
    });

    expect(
      getMermaidPreviewPresentation({
        active: true,
        mode: "code",
        result: { status: "rendered", svg: "<svg />", error: null },
      }),
    ).toEqual({
      visibility: "hidden",
      sourceRecoverable: false,
    });

    expect(
      getMermaidPreviewPresentation({
        active: true,
        mode: "preview",
        result: { status: "empty", svg: "", error: null },
      }),
    ).toEqual({
      visibility: "empty",
      label: "Mermaid preview",
      sourceRecoverable: true,
    });

    expect(
      getMermaidPreviewPresentation({
        active: true,
        mode: "preview",
        result: { status: "rendered", svg: "<svg>diagram</svg>", error: null },
      }),
    ).toEqual({
      visibility: "rendered",
      svg: "<svg>diagram</svg>",
      sourceRecoverable: true,
    });

    expect(
      getMermaidPreviewPresentation({
        active: true,
        mode: "preview",
        result: { status: "error", svg: "", error: "Parse error" },
      }),
    ).toEqual({
      visibility: "error",
      message: "Parse error",
      sourceRecoverable: true,
    });
  });
});
