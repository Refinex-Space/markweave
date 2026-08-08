export const slashCommandLifecycle = [
  "open-on-valid-slash-prefix",
  "classify-valid-nested-textblock-scope",
  "filter-by-label-description-search-terms",
  "show-empty-menu-without-execution",
  "arrow-key-active-option",
  "arrow-key-scroll-active-option-into-view",
  "hover-focus-active-option",
  "enter-executes-active-command",
  "tab-executes-active-command",
  "escape-closes-without-mutation",
  "composition-start-closes-menu",
  "composition-end-reopens-valid-query",
  "suppress-code-range-composition",
  "localized-active-empty-line-placeholder",
  "suppress-empty-line-placeholder-outside-valid-scope",
  "suppress-empty-line-placeholder-while-composing-or-readonly",
  "reposition-on-scroll-and-resize",
  "close-when-trigger-leaves-visible-editor",
  "remove-query-range-only",
] as const;

export type SlashCommandLifecycleStep = (typeof slashCommandLifecycle)[number];
