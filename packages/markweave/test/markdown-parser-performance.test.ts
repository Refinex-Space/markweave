import type { MarkdownTokenizer } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions, MarkweaveBlockMath } from "../src/editor-core/create-editor-extensions";

describe("Markdown parser performance guards", () => {
  it("checks a table boundary without splitting the remaining document tail", () => {
    const table = createMarkweaveEditorExtensions().find((extension) => extension.name === "table");
    const tokenizer = (table?.config as { markdownTokenizer?: MarkdownTokenizer } | undefined)?.markdownTokenizer;
    const start = tokenizer?.start;
    if (typeof start !== "function") throw new Error("Expected Markweave table tokenizer.");
    const source = `Paragraph\n\n${"tail\n".repeat(100_000)}`;
    const split = vi.spyOn(String.prototype, "split");

    expect(start(source)).toBe(-1);
    expect(split).not.toHaveBeenCalled();
    split.mockRestore();
  });

  it("recognizes a table from only its first two lines", () => {
    const table = createMarkweaveEditorExtensions().find((extension) => extension.name === "table");
    const tokenizer = (table?.config as { markdownTokenizer?: MarkdownTokenizer } | undefined)?.markdownTokenizer;
    const start = tokenizer?.start;
    if (typeof start !== "function") throw new Error("Expected Markweave table tokenizer.");

    expect(start("| A | B |\n| --- | --- |\n| 1 | 2 |\n\nBody")).toBe(0);
  });

  it("bounds block-math look-ahead on documents without formulas", () => {
    const tokenizer = (MarkweaveBlockMath.config as { markdownTokenizer?: MarkdownTokenizer }).markdownTokenizer;
    const start = tokenizer?.start;
    if (typeof start !== "function") throw new Error("Expected Markweave block-math tokenizer.");
    const source = `Paragraph\n\n${"tail\n".repeat(100_000)}`;
    const indexOf = vi.spyOn(String.prototype, "indexOf");

    expect(start(source)).toBe(-1);
    expect(indexOf).toHaveBeenCalledWith("$$");
    expect(String(indexOf.mock.instances[0]).length).toBeLessThanOrEqual(8_192);
    indexOf.mockRestore();
  });
});
