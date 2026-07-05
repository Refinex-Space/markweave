export const slashCommandLifecycle = [
  "open-on-valid-slash-prefix",
  "classify-valid-nested-textblock-scope",
  "filter-by-label-description-search-terms",
  "show-empty-menu-without-execution",
  "arrow-key-active-option",
  "hover-focus-active-option",
  "enter-executes-active-command",
  "tab-executes-active-command",
  "escape-closes-without-mutation",
  "composition-start-closes-menu",
  "composition-end-reopens-valid-query",
  "suppress-code-range-composition",
  "remove-query-range-only",
] as const;

export type SlashCommandLifecycleStep = (typeof slashCommandLifecycle)[number];
