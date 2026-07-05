export const markdownTransformTargets = [
  "heading",
  "paragraph",
  "bullet-list",
  "ordered-list",
  "task-list",
  "blockquote-callout",
  "code-fence",
  "mermaid-fence",
  "table",
  "doc-link",
  "file-link",
  "link",
  "highlight",
  "underline",
  "strikethrough",
  "inline-code",
] as const;

export type MarkdownTransformTarget = (typeof markdownTransformTargets)[number];

