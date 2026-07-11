export type MarkweaveTheme = "light" | "dark";

export function normalizeMarkweaveTheme(theme: unknown): MarkweaveTheme {
  return theme === "dark" ? "dark" : "light";
}
