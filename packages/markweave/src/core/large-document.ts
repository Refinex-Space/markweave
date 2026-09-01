/**
 * @deprecated Markweave no longer parses independent Markdown chunks because
 * doing so changes global reference and block semantics. The compatibility
 * helper now preserves one canonical source unit; progressive mounting happens
 * only after a whole-document parse in DocumentLoadCoordinator.
 */
export function splitMarkweaveLargeMarkdown(
  markdown: string,
  _targetSize = 32_768,
) {
  return [markdown];
}
