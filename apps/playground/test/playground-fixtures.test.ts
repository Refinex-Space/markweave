import { describe, expect, it } from "vitest";
import { initialPlaygroundDocument, mergedTablePlaygroundDocument } from "../src/fixtures";

describe("playground fixtures", () => {
  it("keeps the default fixture focused on the editor demo surface", () => {
    expect(initialPlaygroundDocument).toContain("<h1>Markweave Editor Playground</h1>");
    expect(initialPlaygroundDocument).toContain("<table>");
    expect(initialPlaygroundDocument).toContain("language-mermaid");
  });

  it("exposes merged table cases without creating another editor entry", () => {
    expect(mergedTablePlaygroundDocument).toContain('colspan="2"');
    expect(mergedTablePlaygroundDocument).toContain('rowspan="2"');
    expect(mergedTablePlaygroundDocument).toContain("Merged Header");
    expect(mergedTablePlaygroundDocument).toContain("Clipboard Targets");
  });
});
