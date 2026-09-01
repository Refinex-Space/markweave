import { Extension, type MarkdownTokenizer } from "@tiptap/core";
import OrderedList from "@tiptap/extension-ordered-list";
import { Table } from "@tiptap/extension-table";
import { MarkdownManager } from "@tiptap/markdown";

interface MarkdownParserWorkerRequest {
  readonly id: number;
  readonly markdown: string;
}

interface MarkdownParserWorkerScope {
  onmessage: ((event: MessageEvent<MarkdownParserWorkerRequest>) => void) | null;
  postMessage(message: unknown): void;
}

const lookahead = 8_192;
const detailsBodyLimit = 32_768;
const orderedListStart = /^(\s*)(?:\d+|[ivxlcdmIVXLCDM]+|[a-zA-Z]{1,2})[.)]\s+/;
const detailsOpening = /^:::details(\{open\})?[ \t]*([^\n]*?)[ \t]*(?:\n|$)/;
const detailsOpeningStart = /^:::details(?:\{open\})?(?:\s|$)/m;

function lineAt(source: string, offset: number) {
  const newline = source.indexOf("\n", offset);
  const end = newline === -1 ? source.length : newline + 1;
  const raw = source.slice(offset, end);
  return { end, raw, text: raw.endsWith("\n") ? raw.slice(0, -1) : raw };
}

function stripIndent(line: string, count: number) {
  let index = 0;
  while (index < line.length && index < count && line[index] === " ") index += 1;
  return line.slice(index);
}

function hasIndentedContinuation(source: string, offset: number, baseIndent: number) {
  let cursor = offset;
  while (cursor < source.length) {
    const line = lineAt(source, cursor);
    if (line.text.trim()) {
      return (line.text.match(/^(\s*)/)?.[1]?.length ?? 0) > baseIndent;
    }
    cursor = line.end;
  }
  return false;
}

function findDetailsClose(source: string, bodyStart: number) {
  const limit = Math.min(source.length, bodyStart + detailsBodyLimit);
  let depth = 1;
  let index = bodyStart;
  let fence: string | null = null;
  while (index < limit) {
    const newline = source.indexOf("\n", index);
    const lineEnd = newline === -1 ? source.length : newline + 1;
    const line = source.slice(index, newline === -1 ? source.length : newline);
    if (fence) {
      if (line.startsWith(fence)) fence = null;
    } else {
      const fenceMatch = /^(```+|~~~+)/.exec(line);
      if (fenceMatch) {
        fence = fenceMatch[1] ?? null;
      } else if (/^:::[A-Za-z]/.test(line)) {
        depth += 1;
      } else if (/^:::\s*$/.test(line)) {
        depth -= 1;
        if (depth === 0) return { closeEnd: lineEnd, closeStart: index };
      }
    }
    if (newline === -1) break;
    index = lineEnd;
  }
  return null;
}

const taskListTokenizer: MarkdownTokenizer = {
  name: "taskList",
  level: "block",
  start: (source) => /^\s*[-+*]\s+\[([ xX])\]\s+/.test(source) ? 0 : -1,
  tokenize(source, _tokens, lexer) {
    const first = lineAt(source, 0).text.match(/^(\s*)([-+*])\s+\[([ xX])\]\s+(.*)$/);
    if (!first) return undefined;
    const baseIndent = first[1]!.length;
    const rawParts: string[] = [];
    const items: Array<Record<string, unknown>> = [];
    let offset = 0;
    while (offset < source.length) {
      const line = lineAt(source, offset);
      const match = line.text.match(/^(\s*)([-+*])\s+\[([ xX])\]\s+(.*)$/);
      if (!match || match[1]!.length !== baseIndent) break;
      rawParts.push(line.raw);
      offset = line.end;
      const nestedParts: string[] = [];
      while (offset < source.length) {
        const nextLine = lineAt(source, offset);
        const nextTask = nextLine.text.match(/^(\s*)([-+*])\s+\[([ xX])\]\s+(.*)$/);
        if (nextTask && nextTask[1]!.length === baseIndent) break;
        const indent = nextLine.text.match(/^(\s*)/)?.[1]?.length ?? 0;
        if (nextLine.text.trim() && indent <= baseIndent) break;
        if (!nextLine.text.trim() && !hasIndentedContinuation(source, nextLine.end, baseIndent)) break;
        rawParts.push(nextLine.raw);
        nestedParts.push(stripIndent(nextLine.raw, baseIndent + 2));
        offset = nextLine.end;
      }
      const mainContent = match[4]!;
      items.push({
        type: "taskItem",
        raw: "",
        mainContent,
        indentLevel: baseIndent,
        checked: match[3]!.toLowerCase() === "x",
        text: mainContent,
        tokens: lexer.inlineTokens(mainContent),
        nestedTokens: nestedParts.length ? lexer.blockTokens(nestedParts.join("")) : [],
      });
    }
    return items.length
      ? { type: "taskList", raw: rawParts.join(""), items }
      : undefined;
  },
};

const orderedListTokenizer = (
  OrderedList.config as { readonly markdownTokenizer: MarkdownTokenizer }
).markdownTokenizer;
const tableTokenizer = (
  Table.config as { readonly markdownTokenizer: MarkdownTokenizer }
).markdownTokenizer;

const tokenizers: MarkdownTokenizer[] = [
  taskListTokenizer,
  {
    ...orderedListTokenizer,
    start(source) {
      return source.slice(0, lookahead).match(orderedListStart)?.index ?? -1;
    },
    tokenize(source, tokens, lexer) {
      return orderedListStart.test(lineAt(source, 0).text)
        ? orderedListTokenizer.tokenize(source, tokens, lexer)
        : undefined;
    },
  },
  {
    ...tableTokenizer,
    start(source) {
      const first = lineAt(source, 0);
      if (first.end >= source.length || !first.text.includes("|")) return -1;
      const second = lineAt(source, first.end).text;
      return /^[ \t|:]*-[ \t|:-]*$/.test(second) && second.includes("|") ? 0 : -1;
    },
  },
  {
    name: "blockMath",
    level: "block",
    start: (source) => source.slice(0, lookahead).indexOf("$$"),
    tokenize(source) {
      const match = source.match(/^\$\$([^$]+)\$\$/);
      return match
        ? { type: "blockMath", raw: match[0], latex: match[1]!.trim() }
        : undefined;
    },
  },
  {
    name: "inlineMath",
    level: "inline",
    start: (source) => source.indexOf("$"),
    tokenize(source) {
      const match = source.match(/^\$([^$]+)\$(?!\$)/);
      return match
        ? { type: "inlineMath", raw: match[0], latex: match[1]!.trim() }
        : undefined;
    },
  },
  {
    name: "markweaveCallout",
    level: "block",
    start: (source) => source.slice(0, lookahead).match(/^:::(info|warning|error|success|tip)\b/m)?.index ?? -1,
    tokenize(source, _tokens, lexer) {
      const opening = source.match(/^:::(info|warning|error|success|tip)\s*\n/);
      if (!opening) return undefined;
      const bodyStart = opening[0].length;
      const body = source.slice(bodyStart);
      const closing = body.match(/^:::\s*$/m);
      if (!closing || closing.index === undefined) return undefined;
      return {
        type: "markweaveCallout",
        raw: source.slice(0, bodyStart + closing.index + closing[0].length),
        calloutType: opening[1],
        tokens: lexer.blockTokens(body.slice(0, closing.index)),
      };
    },
  },
  {
    name: "markweaveDetails",
    level: "block",
    start: (source) => source.slice(0, lookahead).search(detailsOpeningStart),
    tokenize(source, _tokens, lexer) {
      const opening = source.match(detailsOpening);
      if (!opening) return undefined;
      const bodyStart = opening[0].length;
      const closing = findDetailsClose(source, bodyStart);
      if (!closing) return undefined;
      const title = (opening[2] ?? "").replace(/\s+/g, " ").trim();
      return {
        type: "markweaveDetails",
        raw: source.slice(0, closing.closeEnd),
        open: Boolean(opening[1]),
        summaryTokens: title ? lexer.inlineTokens(title) : [],
        tokens: lexer.blockTokens(source.slice(bodyStart, closing.closeStart)),
      };
    },
  },
  ...["markweaveAttachment", "markweaveLinkCard"].map((name): MarkdownTokenizer => ({
    name,
    level: "block",
    start(source) {
      const attribute = name === "markweaveAttachment"
        ? "data-markweave-attachment"
        : "data-markweave-link-card";
      const prefix = source.slice(0, lookahead);
      const index = prefix.indexOf(attribute);
      return index >= 0 ? Math.max(0, prefix.lastIndexOf("<a", index)) : -1;
    },
    tokenize(source) {
      const attribute = name === "markweaveAttachment"
        ? "data-markweave-attachment"
        : "data-markweave-link-card";
      const match = source.match(new RegExp(`^<a\\b[^>]*${attribute}[^>]*>[\\s\\S]*?<\\/a>`));
      return match ? { type: name, raw: match[0], text: match[0] } : undefined;
    },
  })),
];

const tokenizerExtensions = tokenizers.map((markdownTokenizer, index) =>
  Extension.create({
    name: `markweaveMarkdownWorkerTokenizer${index}`,
    markdownTokenizer,
  }),
);
const manager = new MarkdownManager({
  extensions: tokenizerExtensions,
  markedOptions: { breaks: false, gfm: true },
});
const workerScope = globalThis as unknown as MarkdownParserWorkerScope;

workerScope.onmessage = (event) => {
  try {
    workerScope.postMessage({
      id: event.data.id,
      tokens: manager.instance.lexer(event.data.markdown),
      type: "result",
    });
  } catch (error) {
    workerScope.postMessage({
      error: error instanceof Error ? error.message : "Markdown lexing failed.",
      id: event.data.id,
      type: "error",
    });
  }
};
