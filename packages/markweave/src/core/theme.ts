export type MarkweaveTheme = "light" | "dark";

export function normalizeMarkweaveTheme(theme: unknown): MarkweaveTheme {
  return theme === "dark" ? "dark" : "light";
}

/** Returns an optional host-owned canvas override without changing theme defaults. */
export function normalizeMarkweaveCanvasColor(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
