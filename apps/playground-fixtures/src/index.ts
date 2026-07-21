export const initialPlaygroundDocument = [
  "# Markweave Editor",
  "",
  "**Markweave Editor** is a Markdown-first WYSIWYG editor built on Tiptap. This playground document is both a product introduction and a Markdown syntax checklist, so Live and View modes can be inspected against the same realistic source.",
  "",
  "Use it to verify headings, inline marks, lists, tasks, quotes, tables, media, math, code, Mermaid, and editor-only interaction surfaces such as image resizing and table handles.",
  "",
  "---",
  "",
  "## 1. Product Snapshot",
  "",
  "| Capability | Markdown surface | What to inspect |",
  "| --- | --- | --- |",
  "| Live editing | Blocks, marks, tables, media | Cursor behavior, toolbar placement, slash menu |",
  "| View mode | Rendered Markdown document | Readable output, links, code copy, Mermaid preview |",
  "| Structured content | Tables, callouts, tasks, embeds | Node views, handles, captions, serialization |",
  "",
  "## 2. Headings And Paragraph Rhythm",
  "",
  "### Heading 3: Editing Surface",
  "",
  "#### Heading 4: Command Surface",
  "",
  "##### Heading 5: Rendering Surface",
  "",
  "###### Heading 6: Integration Surface",
  "",
  "Paragraphs should feel calm and readable. A long paragraph checks wrapping, line-height, punctuation, and inline layout: Markweave keeps Markdown familiar while giving teams rich document controls without forcing them to leave the editor flow.",
  "",
  "Line breaks are represented by separate paragraphs in this fixture. In Live mode, try selecting exactly one character in the first heading and then selecting multiple characters to verify floating toolbar positioning.",
  "",
  "## 3. Inline Markdown Marks",
  "",
  "This sentence includes **bold text**, *italic text*, <u>underlined text</u>, ~~struck text~~, `inlineCode()`, <mark class=\"markweave-highlight\">highlighted text</mark>, H<sub>2</sub>O, E = mc<sup>2</sup>, and an inline formula <span data-type=\"inline-math\" data-latex=\"a^2 + b^2 = c^2\"></span>.",
  "",
  "Links should render safely: [open product docs](https://example.com/docs). In View mode, clicking safe links should use the reader behavior; unsafe protocols should remain blocked by the editor boundary.",
  "",
  "[Lucide Icons](https://lucide.dev/)",
  "",
  "## 4. Blockquote, Lists, And Tasks",
  "",
  "> Markweave is designed for authors who want Markdown semantics, but also need a stable visual editor for repeated daily writing.",
  "",
  "- Use **Live** mode to author content with slash commands and floating toolbar actions.",
  "- Use **View** mode to inspect the final reading experience.",
  "- Use nested lists to check indentation and list marker alignment.",
  "  - Nested unordered item with `inline code`.",
  "  - Nested unordered item with a [link](https://example.com).",
  "",
  "1. Type Markdown shortcuts such as `#`, `>`, `-`, `1.`, and code fences.",
  "2. Select text to verify toolbar actions such as bold, italic, link, color, and more.",
  "3. Use table handles to check row and column menus.",
  "",
  "- [x] Ship a stable Live mode editing surface.",
  "- [ ] Review View mode output before publishing.",
  "- [ ] Confirm media, tables, and code blocks survive serialization.",
  "",
  "## 5. Callouts",
  "",
  ":::info",
  "",
  "**Info:** Slash commands insert structured nodes without making the package consumer wire a separate document shell.",
  "",
  ":::",
  "",
  ":::tip",
  "",
  "**Tip:** In View mode, non-writing actions such as copy, Mermaid fullscreen, and downloads should remain available.",
  "",
  ":::",
  "",
  ":::warning",
  "",
  "**Warning:** This fixture is Markdown input for Tiptap, with HTML fallbacks only where Markdown cannot preserve Markweave-specific node attributes.",
  "",
  ":::",
  "",
  "## 6. Tables",
  "",
  "The table below checks headers, inline marks, code, links, and compact cell layout.",
  "",
  "| Markdown syntax | Rendered example | Expected behavior |",
  "| --- | --- | --- |",
  "| `**bold**` and `*italic*` | **Bold** plus *italic* | Marks stay scoped inside the cell. |",
  "| `[link](url)` | [Markweave link](https://example.com/markweave) | Safe link styling and View mode click behavior. |",
  "| `` `code` `` | `editor.commands.focus()` | Inline code remains readable in dense layouts. |",
  "",
  "## 7. Code Blocks",
  "",
  "Hover a code block in Live or View mode. The language label and copy button should remain available; language switching is only writable in Live mode.",
  "",
  "```ts",
  "type EditorMode = \"live\" | \"view\";",
  "",
  "export function describeMarkweave(mode: EditorMode) {",
  "  return mode === \"live\"",
  "    ? \"Author Markdown with rich controls\"",
  "    : \"Read the rendered document without editing\";",
  "}",
  "```",
  "",
  "```bash",
  "npm login --registry=https://registry.npmjs.org/",
  "```",
  "",
  "```json",
  "{",
  "  \"package\": \"markweave\",",
  "  \"defaultMode\": \"live\",",
  "  \"viewMode\": {",
  "    \"editable\": false,",
  "    \"mermaid\": \"preview\"",
  "  }",
  "}",
  "```",
  "",
  "## 8. Mermaid Fence",
  "",
  "In View mode, Mermaid should default to Preview even if the saved node was in Code mode. The tabs still let readers inspect the diagram source without enabling editing.",
  "",
  "```mermaid",
  "graph TD",
  "  A[Markdown Content] --> B[Markweave Editor]",
  "  B --> C{Mode}",
  "  C -->|Live| D[Editable WYSIWYG]",
  "  C -->|View| E[Readonly Rendering]",
  "  D --> F[Toolbar, Slash, Tables]",
  "  E --> G[Links, Copy, Mermaid Preview]",
  "```",
  "",
  "## 9. Math",
  "",
  "Inline math appears inside text: $E = mc^2$. Display math should stand on its own line:",
  "",
  "$$",
  "\\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}",
  "$$",
  "",
  "## 10. Media And Attachments",
  "",
  "The image below checks image rendering, caption text, alignment, toolbar selection, and View mode hiding of editing handles.",
  "",
  "<figure data-markweave-image=\"true\" data-markweave-image-align=\"center\"><img src=\"https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NzJ8fG5hdHVyYWx8ZW58MHx8MHx8fDA%3D\" alt=\"Markweave editor preview placeholder\" title=\"Markweave Editor Preview\" width=\"720\" /><figcaption>Image node with caption, center alignment, and stable width.</figcaption></figure>",
  "",
  "The video embed checks reader-friendly media rendering. Local uploads are still handled by the host integration.",
  "",
  "<iframe class=\"markweave-video-iframe\" data-markweave-video-embed=\"true\" data-markweave-video-provider=\"youtube\" data-markweave-video-src=\"//player.bilibili.com/player.html?isOutside=true&aid=116858963367837&bvid=BV1xUTf6FEHS&cid=39634469725&p=1\" src=\"//player.bilibili.com/player.html?isOutside=true&aid=116858963367837&bvid=BV1xUTf6FEHS&cid=39634469725&p=1\" title=\"YouTube video player\" allowfullscreen=\"true\"></iframe>",
  "",
  "<a href=\"markweave://sample/spec.pdf\" data-markweave-attachment=\"true\" data-markweave-attachment-name=\"markweave-editor-spec.pdf\" data-markweave-mime-type=\"application/pdf\" data-markweave-attachment-size=\"245760\">markweave-editor-spec.pdf</a>",
  "",
  "## 11. Keyboard And Slash Checks",
  "",
  "Try `/image`, `/video`, `/table`, `/mermaid`, `/callout`, and `/task` in a fresh paragraph. Attachment is intentionally disabled in the slash menu for now.",
  "",
  "Finish by switching between Live and View. Content should remain stable while editing-only overlays disappear and read-only utilities remain available.",
  "",
].join("\n");

export async function resolvePlaygroundLinkCard(request: { readonly href: string; readonly title: string; readonly signal: AbortSignal }) {
  if (request.signal.aborted) return null;

  const url = new URL(request.href);
  if (url.hostname === "lucide.dev") {
    return {
      title: "Lucide Icons",
      description: "Beautiful & consistent icon toolkit made by the community.",
      siteName: "lucide.dev",
      imageUrl: "https://lucide.dev/og.png",
      faviconUrl: "https://lucide.dev/favicon.ico",
    };
  }

  return {
    title: request.title || url.hostname,
    description: `Preview supplied by the Markweave playground for ${url.hostname}.`,
    siteName: url.hostname,
    faviconUrl: `${url.origin}/favicon.ico`,
  };
}

const largeDocumentParagraph = "Markweave performance fixture keeps realistic prose, punctuation, inline `code`, **emphasis**, and stable block boundaries so typing, serialization, outline projection, and overlay state can be exercised together without loading remote media.";

function createLargeDocumentPerformanceFixture(options: {
  readonly sections: number;
  readonly media?: "missing" | "valid";
  readonly mediaCount?: number;
}) {
  const mediaCount = options.mediaCount ?? 0;

  return Array.from({ length: options.sections }, (_, index) => {
  const section = index + 1;
  const blocks = [
    `## Performance section ${section}`,
    "",
    largeDocumentParagraph,
    "",
    largeDocumentParagraph,
    "",
    `- [${section % 2 ? " " : "x"}] Validate input transaction ${section}.`,
  ];

  if (section % 20 === 0) {
    blocks.push(
      "",
      "| Metric | Expected |",
      "| --- | --- |",
      `| Section ${section} | Smooth input and stable overlays |`,
    );
  }

  if (section % 35 === 0) {
    blocks.push("", "```ts", `export const performanceSection${section} = ${section};`, "```");
  }

  if (options.media && index < mediaCount) {
    const assetIndex = index % 421;
    const scheme = options.media === "valid" ? "fixture-asset" : "missing-asset";
    blocks.push("", `![Performance image ${index + 1}](${scheme}://asset-${assetIndex})`);
  }

  return blocks.join("\n");
  }).join("\n\n");
}

export const largeDocumentPerformanceFixture = createLargeDocumentPerformanceFixture({ sections: 180 });
export const largeTextPerformanceFixture = createLargeDocumentPerformanceFixture({ sections: 500 });
export const largeValidMediaPerformanceFixture = createLargeDocumentPerformanceFixture({
  sections: 500,
  media: "valid",
  mediaCount: 426,
});
export const largeMissingMediaPerformanceFixture = createLargeDocumentPerformanceFixture({
  sections: 500,
  media: "missing",
  mediaCount: 426,
});
export const stressDocumentPerformanceFixture = createLargeDocumentPerformanceFixture({ sections: 2_500 });

const playgroundImageDataUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='36' viewBox='0 0 64 36'%3E%3Crect width='64' height='36' fill='%23d9e4f5'/%3E%3C/svg%3E";

export function resolvePlaygroundMediaSource(request: {
  readonly src: string;
  readonly signal: AbortSignal;
}) {
  if (request.signal.aborted || !request.src.startsWith("fixture-asset://")) {
    return null;
  }

  return {
    src: playgroundImageDataUrl,
    width: 64,
    height: 36,
  };
}

export const mergedTablePlaygroundDocument = `
<h1>Table Merge Fixture</h1>
<p>Table sample with merged headers, row-spanned body cells, and clipboard targets.</p>
<table>
  <tbody>
    <tr>
      <th colspan="2"><p>Merged Header</p></th>
      <th><p>Solo</p></th>
    </tr>
    <tr>
      <td rowspan="2"><p>A</p></td>
      <td><p>B</p></td>
      <td><p>C</p></td>
    </tr>
    <tr>
      <td><p>D</p></td>
      <td><p>E</p></td>
    </tr>
  </tbody>
</table>
<p>Visual-axis anchors include B, D, and E across mixed colspan and rowspan coverage.</p>
<h2>Clipboard Targets</h2>
<p>Rows and columns cover merged header, row-spanned body, and ordinary cells.</p>
`;

export const playgroundCapabilityContract = [
  "markdown",
  "live-view-mode",
  "floating-toolbar",
  "slash-command",
  "table",
  "media",
  "codeblock",
  "mermaid",
  "math",
  "toc",
  "upload-callback",
  "ai-callback",
] as const;

export const playgroundDebugTestIds = [
  "markweave-debug-copy",
  "markweave-debug-command",
  "markweave-debug-ai",
  "markweave-debug-toolbar-ai",
  "markweave-debug-slash-upload",
  "markweave-debug-table",
] as const;

export function getPlaygroundUploadResultName(value: string) {
  return value.split("/").filter(Boolean).at(-1);
}

export function createPlaygroundUploadResult(request: {
  readonly source: {
    readonly file?: File;
    readonly value?: string;
    readonly mimeType?: string;
  };
}) {
  if (request.source.file) {
    return {
      src: URL.createObjectURL(request.source.file),
      name: request.source.file.name,
      mimeType: request.source.file.type,
      size: request.source.file.size,
    };
  }

  if (request.source.value) {
    return {
      src: request.source.value,
      name: getPlaygroundUploadResultName(request.source.value),
      mimeType: request.source.mimeType,
    };
  }

  throw new Error("Unsupported upload source.");
}
