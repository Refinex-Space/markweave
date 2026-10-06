import type { MarkdownTokenizer } from "@tiptap/core";

const maxLinkLength = 8_192;
const explicitScheme = /^[a-z][a-z\d+.-]*:/i;

function closingDelimiter(source: string, start: number, open: string, close: string) {
  let depth = 1;
  const limit = Math.min(source.length, maxLinkLength);
  for (let index = start + 1; index < limit; index += 1) {
    const char = source[index];
    if (char === "\n" || char === "\r") return -1;
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close && --depth === 0) return index;
  }
  return -1;
}

export interface LocalDocumentLink {
  raw: string;
  label: string;
  href: string;
  title: string | null;
}

/** Compatibility for unescaped spaces in local .md/.mdx destinations only. */
export function parseLocalDocumentLink(source: string): LocalDocumentLink | null {
  if (source[0] !== "[") return null;
  const labelEnd = closingDelimiter(source, 0, "[", "]");
  if (labelEnd < 0 || source[labelEnd + 1] !== "(") return null;
  const destinationEnd = closingDelimiter(source, labelEnd + 1, "(", ")");
  if (destinationEnd < 0) return null;

  const label = source.slice(1, labelEnd);
  const destination = source.slice(labelEnd + 2, destinationEnd).trim();
  // Standard links, angle destinations, code labels and multiline syntax stay
  // with the CommonMark tokenizer rather than being reinterpreted here.
  if (!label || label.includes("`") || !destination.includes(" ") || destination.startsWith("<")) return null;
  const titled = /^(.*?) +(["'])((?:\\.|[^\\])*?)\2$/.exec(destination);
  const path = (titled?.[1] ?? destination).trim();
  if (!path.includes(" ") || /[<>"\u0000-\u001f\u007f]/.test(path) ||
      explicitScheme.test(path) || path.startsWith("//") ||
      !/\.mdx?(?:[?#][^\r\n]*)?$/i.test(path)) return null;

  const unescape = (value: string) => value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, "$1");
  // Encode delimiter parentheses too so the regular serializer emits portable
  // Markdown, including filenames with escaped, unmatched parentheses.
  const decodedPath = unescape(path);
  if (explicitScheme.test(decodedPath) || /^[\\/]{2}/.test(decodedPath)) return null;
  const href = decodedPath.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
  return { raw: source.slice(0, destinationEnd + 1), label, href, title: titled ? unescape(titled[3]!) : null };
}

export const localDocumentLinkTokenizer: MarkdownTokenizer = {
  name: "markweaveLocalDocumentLink",
  level: "inline",
  start: (source) => source.indexOf("["),
  tokenize(source, tokens, lexer) {
    const previous = tokens[tokens.length - 1];
    if (previous?.raw?.endsWith("!") && !previous.raw.endsWith("\\!")) return undefined;
    const link = parseLocalDocumentLink(source);
    if (!link) return undefined;
    const labelTokens = lexer.inlineTokens(link.label);
    const containsLink = (items: typeof labelTokens): boolean => items.some(token =>
      token.type === "link" || (token.tokens && containsLink(token.tokens)),
    );
    if (containsLink(labelTokens)) return undefined;
    return { type: "link", raw: link.raw, text: link.label, href: link.href, title: link.title, tokens: labelTokens };
  },
};
