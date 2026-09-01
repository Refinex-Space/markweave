import { MarkdownManager } from "@tiptap/markdown";

const markdownWordCharPattern = /[\p{L}\p{N}]/u;

interface MarkdownSyntaxEscaper {
  escapeMarkdownSyntax(text: string): string;
}

function isMarkdownWordChar(value: string | undefined) {
  return value != null && markdownWordCharPattern.test(value);
}

function collapseIntraWordEscapedUnderscores(text: string) {
  return text.replace(/\\+_/g, (match, offset: number) => {
    const previous = text[offset - 1];
    const next = text[offset + match.length];
    return isMarkdownWordChar(previous) && isMarkdownWordChar(next) ? "_" : match;
  });
}

export function escapeMarkweaveMarkdownSyntax(text: string) {
  const healed = collapseIntraWordEscapedUnderscores(text);
  return healed.replace(/[\\`*[\]~]|_/g, (character, offset: number) => {
    if (character !== "_") {
      return `\\${character}`;
    }

    const previous = healed[offset - 1];
    const next = healed[offset + 1];
    if (isMarkdownWordChar(previous) && isMarkdownWordChar(next)) {
      return "_";
    }

    return "\\_";
  });
}

export function installMarkweaveMarkdownSyntaxEscape() {
  const prototype = MarkdownManager.prototype as unknown as MarkdownSyntaxEscaper;
  if (prototype.escapeMarkdownSyntax === escapeMarkweaveMarkdownSyntax) {
    return;
  }

  prototype.escapeMarkdownSyntax = escapeMarkweaveMarkdownSyntax;
}
