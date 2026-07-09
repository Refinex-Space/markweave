export const floatingToolbarRules = [
  "show-on-non-empty-text-selection",
  "hide-on-collapsed-selection",
  "hide-on-suppressed-node-selection",
  "do-not-steal-editor-focus",
  "narrow-controls-for-table-selection",
  "stable-position-after-selection-settles",
  "animate-show-hide",
  "show-button-tooltips",
] as const;

export type FloatingToolbarRule = (typeof floatingToolbarRules)[number];
