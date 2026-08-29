export const markdownTransformTargets = [
  "heading",
  "paragraph",
  "bullet-list",
  "ordered-list",
  "task-list",
  "blockquote-callout",
  "details-block",
  "code-fence",
  "mermaid-fence",
  "table",
  "doc-link",
  "file-link",
  "link",
  "highlight",
  "underline",
  "subscript",
  "superscript",
  "block-indent",
  "trusted-host-inline-node",
  "strikethrough",
  "inline-code",
] as const;

export type MarkdownTransformTarget = (typeof markdownTransformTargets)[number];

