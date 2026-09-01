import { describe, expect, it } from "vitest";
import { splitMarkweaveLargeMarkdown } from "../src/core/large-document";

describe("large document chunking", () => {
  it("keeps one canonical Markdown source instead of parsing independent chunks", () => {
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

    expect(chunks).toEqual([markdown]);
  });
});
