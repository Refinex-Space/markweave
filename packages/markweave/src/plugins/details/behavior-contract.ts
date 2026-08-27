export const detailsBlockLifecycle = [
  "slash-insert-open-details-with-empty-summary",
  "markdown-details-fence-roundtrip",
  "markdown-details-nested-callout-roundtrip",
  "html-details-parse",
  "toggle-persists-open-in-live",
  "toggle-is-visual-only-in-view",
  "enter-from-summary-opens-and-enters-body",
  "enter-empty-last-paragraph-exits",
  "backspace-at-summary-start-unwraps",
  "backspace-at-first-body-start-returns-to-summary",
  "slash-opens-inside-details-paragraph",
  "slash-does-not-open-in-summary",
  "hidden-body-selection-redirects-to-summary",
] as const;

export type DetailsBlockLifecycleStep = (typeof detailsBlockLifecycle)[number];
