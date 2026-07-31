export const markweaveAiEditBehaviorContract = {
  owner: "host",
  requestScope: "selected-text-only",
  supportedSelections: ["inline-text", "formatted-text", "multiple-paragraphs", "lists"],
  excludedTargets: ["code-block", "table", "cell-selection", "node-selection", "atom", "media", "view-mode"],
  proposalFormat: "markdown",
  streamingInput: "complete-accumulated-markdown",
  previewMode: "in-place-decoration-without-document-change",
  controls: ["default", "none"],
  acceptance: "single-transaction-replace",
  conflictPolicy: "map-outside-edits-abort-target-edits",
  concurrency: "one-active-context-per-editor",
  persistence: "memory-only",
} as const;
