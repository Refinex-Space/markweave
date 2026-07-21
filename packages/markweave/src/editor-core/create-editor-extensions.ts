import { mergeAttributes, Node, type AnyExtension, type Extensions, type JSONContent, type MarkdownRendererHelpers, type MarkdownTokenizer, type RenderContext } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Emoji, { emojis } from "@tiptap/extension-emoji";
import Highlight from "@tiptap/extension-highlight";
import { Heading } from "@tiptap/extension-heading";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Link from "@tiptap/extension-link";
import { Markdown } from "@tiptap/markdown";
import Mathematics from "@tiptap/extension-mathematics";
import OrderedList from "@tiptap/extension-ordered-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import TextAlign from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import TaskItem from "@tiptap/extension-task-item";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { MarkweaveCompositionGuard } from "./composition-guard";
import { MarkweaveLinkClick } from "./link-click";
import { MarkweaveMarkBoundary } from "./mark-boundary";
import { MarkweaveCallout } from "../plugins/callout/callout-node";
import { MarkweaveCodeBlockClickFocus, MarkweaveCodeBlockCollapse, markweaveCodeBlockBehavior } from "../plugins/codeblock/codeblock-behavior";
import { createMarkweaveLowlight } from "../plugins/codeblock/codeblock-lowlight";
import { MarkweaveIndent } from "../plugins/indent/indent-extension";
import { MarkweaveLinkCard } from "../plugins/link-card/link-card-node";
import { MarkweaveMarkdownInput } from "../plugins/markdown/markdown-input";
import {
  needsMarkweaveTableHtmlFallback,
  normalizeMarkweaveHtmlColor,
  renderMarkweaveHtmlFallback,
} from "../plugins/markdown/lossless-html";
import { MarkweaveCoreImage, MarkweaveCoreVideo } from "../plugins/media/core-media-nodes";
import { MarkweaveImageClipboard } from "../plugins/media/image-clipboard";
import { MarkweaveAttachment } from "../plugins/media/media-nodes";
import { MarkweaveMermaidInlinePreview } from "../plugins/mermaid/mermaid-inline-preview";
import { MarkweaveSearch } from "../plugins/search/search-controller";
import { MarkweaveTableClipboard } from "../plugins/table/table-clipboard";
import { MarkweaveTableArrowNavigation } from "../plugins/table/table-arrow-navigation";
import { MarkweaveTableInteractionLayer } from "../plugins/table/table-interaction-layer";
import { MarkweaveTableKeyboard } from "../plugins/table/table-keyboard";
import { MarkweaveMarkdownTableInput } from "../plugins/table/table-markdown-input";

import type { MarkweaveLang } from "../i18n";
import type { MarkweaveSlashCommandUploadHandler } from "../plugins/slash-command/upload";
import { MarkweaveTocProjection } from "../core/toc-state";

export interface CreateMarkweaveEditorExtensionsOptions {
  readonly lang?: MarkweaveLang;
  readonly mediaExtensions?: Extensions;
  readonly linkCardExtension?: AnyExtension;
  readonly onImageUpload?: MarkweaveSlashCommandUploadHandler;
}

const markweaveLowlight = createMarkweaveLowlight();
const renderStandardTableMarkdown = (Table.config as {
  renderMarkdown?: (node: JSONContent, helpers: MarkdownRendererHelpers, context: RenderContext) => string;
}).renderMarkdown;

const MarkweaveTextStyle = TextStyle.extend({
  renderMarkdown(node, helpers) {
    const color = normalizeMarkweaveHtmlColor(node.attrs?.color);
    const content = helpers.renderChildren(node.content ?? []);
    return color ? `<span style="color: ${color}">${content}</span>` : content;
  },
});

const MarkweaveHighlight = Highlight.extend({
  renderMarkdown(node, helpers) {
    const color = normalizeMarkweaveHtmlColor(node.attrs?.color);
    const content = helpers.renderChildren(node.content ?? []);
    return color ? `<mark data-color="${color}">${content}</mark>` : `==${content}==`;
  },
});

const MarkweaveParagraph = Paragraph.extend({
  renderMarkdown(node, helpers) {
    return node.attrs?.textAlign && node.attrs.textAlign !== "left"
      ? renderMarkweaveHtmlFallback(node)
      : helpers.renderChildren(node.content ?? []);
  },
});

const MarkweaveHeading = Heading.extend({
  renderMarkdown(node, helpers) {
    if (node.attrs?.textAlign && node.attrs.textAlign !== "left") {
      return renderMarkweaveHtmlFallback(node);
    }

    const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
    return `#`.repeat(level) + ` ${helpers.renderChildren(node.content ?? [])}`;
  },
});

const MarkweaveTable = Table.extend({
  renderMarkdown(node, helpers, context) {
    if (needsMarkweaveTableHtmlFallback(node)) {
      return renderMarkweaveHtmlFallback(node);
    }

    return renderStandardTableMarkdown?.(node, helpers, context) ?? "";
  },
});

const MarkweaveTaskList = Node.create<{
  readonly HTMLAttributes: Record<string, unknown>;
  readonly itemTypeName: string;
}>({
  name: "taskList",

  addOptions() {
    return {
      HTMLAttributes: {},
      itemTypeName: "taskItem",
    };
  },

  group: "block list",

  content() {
    return `${this.options.itemTypeName}+`;
  },

  parseHTML() {
    return [{ tag: `ul[data-type="${this.name}"]`, priority: 51 }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "ul",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": this.name,
      }),
      0,
    ];
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode(
      "taskList",
      {},
      helpers.parseChildren(token.items ?? []),
    );
  },

  renderMarkdown(node, helpers) {
    return node.content ? helpers.renderChildren(node.content, "\n") : "";
  },

  markdownOptions: { indentsContent: true },

  markdownTokenizer: {
    name: "taskList",
    level: "block",
    start(src) {
      return /^\s*[-+*]\s+\[([ xX])\]\s+/.test(src) ? 0 : -1;
    },
    tokenize(src, _tokens, lexer) {
      const firstLine = readMarkdownLine(src, 0);
      const firstMatch = firstLine.text.match(
        /^(\s*)([-+*])\s+\[([ xX])\]\s+(.*)$/,
      );
      if (!firstMatch) {
        return undefined;
      }

      const baseIndent = firstMatch[1]!.length;
      const rawParts: string[] = [];
      const items: Array<Record<string, unknown>> = [];
      let offset = 0;

      while (offset < src.length) {
        const line = readMarkdownLine(src, offset);
        const match = line.text.match(
          /^(\s*)([-+*])\s+\[([ xX])\]\s+(.*)$/,
        );
        if (!match || match[1]!.length !== baseIndent) {
          break;
        }

        rawParts.push(line.raw);
        offset = line.end;
        const nestedParts: string[] = [];
        while (offset < src.length) {
          const nextLine = readMarkdownLine(src, offset);
          const nextTask = nextLine.text.match(
            /^(\s*)([-+*])\s+\[([ xX])\]\s+(.*)$/,
          );
          if (nextTask && nextTask[1]!.length === baseIndent) {
            break;
          }

          const indent = nextLine.text.match(/^(\s*)/)?.[1]?.length ?? 0;
          if (nextLine.text.trim() && indent <= baseIndent) {
            break;
          }
          if (!nextLine.text.trim() && !hasIndentedContinuation(src, nextLine.end, baseIndent)) {
            break;
          }

          rawParts.push(nextLine.raw);
          nestedParts.push(stripMarkdownIndent(nextLine.raw, baseIndent + 2));
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
          nestedTokens: nestedParts.length
            ? lexer.blockTokens(nestedParts.join(""))
            : [],
        });
      }

      if (!items.length) {
        return undefined;
      }
      return {
        type: "taskList",
        raw: rawParts.join(""),
        items,
      };
    },
  },

  addCommands() {
    return {
      toggleTaskList:
        () =>
        ({ commands }) =>
          commands.toggleList(this.name, this.options.itemTypeName),
    };
  },

  addKeyboardShortcuts() {
    return { "Mod-Shift-9": () => this.editor.commands.toggleTaskList() };
  },
});

const orderedListMarkdownTokenizer = (
  OrderedList.config as { readonly markdownTokenizer: MarkdownTokenizer }
).markdownTokenizer;
const orderedListStartRegex =
  /^(\s*)(?:\d+|[ivxlcdmIVXLCDM]+|[a-zA-Z]{1,2})[.)]\s+/;

const MarkweaveOrderedList = OrderedList.extend({
  markdownTokenizer: {
    ...orderedListMarkdownTokenizer,
    start(src) {
      const match = src.slice(0, 8_192).match(orderedListStartRegex);
      return match?.index ?? -1;
    },
    tokenize(src, tokens, lexer) {
      if (!orderedListStartRegex.test(readMarkdownLine(src, 0).text)) {
        return undefined;
      }
      return orderedListMarkdownTokenizer.tokenize(src, tokens, lexer);
    },
  },
});

function readMarkdownLine(source: string, offset: number) {
  const newline = source.indexOf("\n", offset);
  const end = newline === -1 ? source.length : newline + 1;
  const raw = source.slice(offset, end);
  return {
    end,
    raw,
    text: raw.endsWith("\n") ? raw.slice(0, -1) : raw,
  };
}

function hasIndentedContinuation(
  source: string,
  offset: number,
  baseIndent: number,
) {
  let cursor = offset;
  while (cursor < source.length) {
    const line = readMarkdownLine(source, cursor);
    if (line.text.trim()) {
      return (line.text.match(/^(\s*)/)?.[1]?.length ?? 0) > baseIndent;
    }
    cursor = line.end;
  }
  return false;
}

function stripMarkdownIndent(line: string, count: number) {
  let index = 0;
  while (index < line.length && index < count && line[index] === " ") {
    index += 1;
  }
  return line.slice(index);
}

export function createMarkweaveEditorExtensions(options: CreateMarkweaveEditorExtensionsOptions = {}) {
  return [
    MarkweaveCompositionGuard,
    MarkweaveTocProjection,
    Markdown.configure({
      markedOptions: {
        breaks: false,
        gfm: true,
      },
    }),
    StarterKit.configure({
      heading: false,
      paragraph: false,
      codeBlock: false,
      horizontalRule: false,
      link: false,
      orderedList: false,
      underline: false,
    }),
    MarkweaveParagraph,
    MarkweaveHeading.configure({
      levels: [1, 2, 3, 4, 5, 6],
    }),
    MarkweaveCallout,
    MarkweaveIndent,
    MarkweaveTextStyle,
    Color.configure({
      types: [TextStyle.name],
    }),
    Subscript,
    Superscript,
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Mathematics.configure({
      katexOptions: {
        throwOnError: false,
      },
    }),
    CodeBlockLowlight.configure({
      lowlight: markweaveLowlight,
      defaultLanguage: markweaveCodeBlockBehavior.defaultLanguage,
      enableTabIndentation: true,
      tabSize: markweaveCodeBlockBehavior.tabSize,
      exitOnTripleEnter: markweaveCodeBlockBehavior.exitOnTripleEnter,
      exitOnArrowDown: markweaveCodeBlockBehavior.exitOnArrowDown,
      HTMLAttributes: {
        class: "markweave-code-block",
        spellcheck: "false",
      },
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: "https",
      protocols: ["markweave"],
      HTMLAttributes: {
        class: "markweave-link",
      },
    }),
    MarkweaveLinkClick,
    MarkweaveMarkdownInput,
    Emoji.configure({
      emojis,
      enableEmoticons: true,
      HTMLAttributes: {
        class: "markweave-emoji",
      },
    }),
    MarkweaveCodeBlockCollapse,
    MarkweaveCodeBlockClickFocus,
    MarkweaveMermaidInlinePreview,
    Underline,
    MarkweaveHighlight.configure({
      multicolor: true,
      HTMLAttributes: {
        class: "markweave-highlight",
      },
    }),
    MarkweaveMarkBoundary,
    MarkweaveSearch,
    options.linkCardExtension ?? MarkweaveLinkCard,
    ...(options.mediaExtensions ?? [MarkweaveCoreImage, MarkweaveCoreVideo]),
    MarkweaveImageClipboard.configure({
      onUpload: options.onImageUpload,
    }),
    MarkweaveAttachment,
    HorizontalRule.configure({
      HTMLAttributes: {
        class: "markweave-separator",
      },
    }),
    MarkweaveTaskList.configure({
      HTMLAttributes: {
        class: "markweave-task-list",
      },
    }),
    MarkweaveOrderedList,
    TaskItem.configure({
      nested: true,
      HTMLAttributes: {
        class: "markweave-task-item",
      },
    }),
    MarkweaveTable.configure({
      resizable: false,
      allowTableNodeSelection: true,
      HTMLAttributes: {
        class: "markweave-table",
      },
    }),
    TableRow,
    TableHeader,
    TableCell,
    MarkweaveTableClipboard,
    MarkweaveMarkdownTableInput,
    MarkweaveTableArrowNavigation,
    MarkweaveTableInteractionLayer,
    MarkweaveTableKeyboard,
  ];
}
