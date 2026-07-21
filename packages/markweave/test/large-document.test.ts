import { describe, expect, it } from "vitest";
import { splitMarkweaveLargeMarkdown } from "../src/core/large-document";

describe("large document chunking", () => {
  it("splits at heading boundaries without cutting fenced or callout blocks", () => {
    const markdown = [
      "# Title",
      "",
      "```md",
      "## Not a boundary",
      "```",
      "",
      ":::info",
      "## Still inside callout",
      ":::",
      "",
      "## Real boundary",
      "Body",
    ].join("\n");
    const chunks = splitMarkweaveLargeMarkdown(markdown, 8);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain("## Still inside callout");
    expect(chunks[1]).toBe("## Real boundary\nBody");
    expect(chunks.join("")).toBe(markdown);
  });
});
