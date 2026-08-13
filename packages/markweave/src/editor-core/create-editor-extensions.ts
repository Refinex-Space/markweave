import { flattenExtensions, mergeAttributes, Node, type AnyExtension, type Extensions, type JSONContent, type MarkdownRendererHelpers, type MarkdownTokenizer, type RenderContext } from "@tiptap/core";
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
import "./tiptap-type-augmentations";
import { MarkweaveCompositionGuard } from "./composition-guard";
import { MarkweaveLinkClick } from "./link-click";
import { MarkweaveMarkBoundary } from "./mark-boundary";
import { MarkweaveCallout } from "../plugins/callout/callout-node";
import { MarkweaveAskAi } from "../plugins/ask-ai/ask-ai-session";
import { MarkweaveAiEdit } from "../plugins/ai-edit/ai-edit-controller";
import { MarkweaveCodeBlockClickFocus, MarkweaveCodeBlockCollapse, markweaveCodeBlockBehavior } from "../plugins/codeblock/codeblock-behavior";
import { createMarkweaveLowlight } from "../plugins/codeblock/codeblock-lowlight";
import { MarkweaveIndent, normalizeMarkweaveIndentLevel } from "../plugins/indent/indent-extension";
import {
  MarkweaveInternalLinkCard,
  type MarkweaveInternalLinkCardConfig,
} from "../plugins/internal-link-card/internal-link-card";
import { MarkweaveLinkCard } from "../plugins/link-card/link-card-node";
import { MarkweaveMarkdownInput } from "../plugins/markdown/markdown-input";
import {
  createMarkweaveHtmlFallbackRenderer,
  needsMarkweaveInlineNodeHtmlFallback,
  needsMarkweaveTableHtmlFallback,
  normalizeMarkweaveHtmlColor,
} from "../plugins/markdown/lossless-html";
import { MarkweaveCoreImage, MarkweaveCoreVideo } from "../plugins/media/core-media-nodes";
import { MarkweaveImageClipboard } from "../plugins/media/image-clipboard";
import { MarkweaveAttachment } from "../plugins/media/media-nodes";
import { MarkweaveMermaidInlinePreview } from "../plugins/mermaid/mermaid-inline-preview";
import {
  MarkweaveReferenceSuggestion,
  type MarkweaveReferenceSuggestionConfig,
} from "../plugins/reference/reference-suggestion";
import { MarkweaveSearch } from "../plugins/search/search-controller";
import { MarkweaveSlashEmptyLinePlaceholder } from "../plugins/slash-command/empty-line-placeholder";
import { MarkweaveSlashTriggerDecoration } from "../plugins/slash-command/slash-trigger-decoration";
import { MarkweaveTableClipboard } from "../plugins/table/table-clipboard";
import { MarkweaveTableArrowNavigation } from "../plugins/table/table-arrow-navigation";
import { MarkweaveTableCapabilities, type MarkweaveTableCapabilityResolver } from "../plugins/table/table-capabilities";
import { MarkweaveTableInteractionLayer } from "../plugins/table/table-interaction-layer";
import { MarkweaveTableKeyboard } from "../plugins/table/table-keyboard";
import { MarkweaveMarkdownTableInput } from "../plugins/table/table-markdown-input";

import { getMarkweaveMessages, type MarkweaveLang } from "../i18n";
import type { MarkweaveSlashCommandUploadHandler } from "../plugins/slash-command/upload";
import { MarkweaveTocProjection } from "../core/toc-state";
import { MarkweaveCommands } from "../commands/command-runtime";

export interface CreateMarkweaveEditorExtensionsOptions {
  readonly lang?: MarkweaveLang;
  readonly mediaExtensions?: Extensions;
  readonly linkCardExtension?: AnyExtension;
  readonly onImageUpload?: MarkweaveSlashCommandUploadHandler;
  readonly tableCapabilities?: MarkweaveTableCapabilityResolver;
  readonly referenceSuggestion?: MarkweaveReferenceSuggestionConfig | null;
  readonly internalLinkCard?: MarkweaveInternalLinkCardConfig | null;
  readonly editorExtensions?: readonly AnyExtension[];
}

const markweaveLowlight = createMarkweaveLowlight();
const renderStandardTableMarkdown = (Table.config as {
  renderMarkdown?: (node: JSONContent, helpers: MarkdownRendererHelpers, context: RenderContext) => string;
}).renderMarkdown;

const tableHorizontalAlignmentValues = new Set(["left", "center", "right"]);
const tableVerticalAlignmentValues = new Set(["top", "middle", "bottom"]);

function parseTableCellStyle(element: HTMLElement, property: "color" | "backgroundColor" | "textAlign" | "verticalAlign") {
  const value = element.style[property]?.trim() ?? "";

  if (property === "color" || property === "backgroundColor") {
    return normalizeMarkweaveHtmlColor(value);
  }

  if (property === "textAlign") {
    return tableHorizontalAlignmentValues.has(value) ? value : "left";
  }

  return tableVerticalAlignmentValues.has(value) ? value : "middle";
}

function renderTableCellStyle(name: "color" | "background-color" | "text-align" | "vertical-align", value: unknown) {
  const normalized =
    name === "color" || name === "background-color"
      ? normalizeMarkweaveHtmlColor(value)
      : typeof value === "string"
        ? value
        : null;

  return normalized ? { style: `${name}: ${normalized}` } : {};
}

function tableCellStyleAttributes() {
  return {
    textColor: {
      default: null,
      parseHTML: (element: HTMLElement) => parseTableCellStyle(element, "color"),
      renderHTML: (attributes: Record<string, unknown>) => renderTableCellStyle("color", attributes.textColor),
    },
    backgroundColor: {
      default: null,
      parseHTML: (element: HTMLElement) => parseTableCellStyle(element, "backgroundColor"),
      renderHTML: (attributes: Record<string, unknown>) => renderTableCellStyle("background-color", attributes.backgroundColor),
    },
    textAlign: {
      default: "left",
      parseHTML: (element: HTMLElement) => parseTableCellStyle(element, "textAlign"),
      renderHTML: (attributes: Record<string, unknown>) =>
        tableHorizontalAlignmentValues.has(String(attributes.textAlign)) && attributes.textAlign !== "left"
          ? renderTableCellStyle("text-align", attributes.textAlign)
          : {},
    },
    verticalAlign: {
      default: "middle",
      parseHTML: (element: HTMLElement) => parseTableCellStyle(element, "verticalAlign"),
      renderHTML: (attributes: Record<string, unknown>) =>
        tableVerticalAlignmentValues.has(String(attributes.verticalAlign)) && attributes.verticalAlign !== "middle"
          ? renderTableCellStyle("vertical-align", attributes.verticalAlign)
          : {},
    },
  };
}

const MarkweaveTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...tableCellStyleAttributes(),
    };
  },
});

const MarkweaveTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...tableCellStyleAttributes(),
    };
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
  const messages = getMarkweaveMessages(options.lang);
  let extensions: Extensions = [];
  const htmlFallback = createMarkweaveHtmlFallbackRenderer(() => extensions);
  const markweaveTextStyle = TextStyle.extend({
    renderMarkdown(node, helpers) {
      const color = normalizeMarkweaveHtmlColor(node.attrs?.color);
      const content = color
        ? htmlFallback.renderInline(node.content ?? [])
        : helpers.renderChildren(node.content ?? []);
      return color ? `<span style="color: ${color}">${content}</span>` : content;
    },
  });
  const markweaveHighlight = Highlight.extend({
    renderMarkdown(node, helpers) {
      const color = normalizeMarkweaveHtmlColor(node.attrs?.color);
      const content = color
        ? htmlFallback.renderInline(node.content ?? [])
        : helpers.renderChildren(node.content ?? []);
      return color ? `<mark data-color="${color}">${content}</mark>` : `==${content}==`;
    },
  });
  const markweaveSubscript = Subscript.extend({
    renderMarkdown(node) {
      return `<sub>${htmlFallback.renderInline(node.content ?? [])}</sub>`;
    },
  });
  const markweaveSuperscript = Superscript.extend({
    renderMarkdown(node) {
      return `<sup>${htmlFallback.renderInline(node.content ?? [])}</sup>`;
    },
  });
  const markweaveParagraph = Paragraph.extend({
    renderMarkdown(node, helpers) {
      const requiresHtmlFallback =
        (node.attrs?.textAlign && node.attrs.textAlign !== "left") ||
        normalizeMarkweaveIndentLevel(node.attrs?.markweaveIndentLevel) > 0 ||
        needsMarkweaveInlineNodeHtmlFallback(node);
      return requiresHtmlFallback
        ? htmlFallback.renderBlock(node)
        : helpers.renderChildren(node.content ?? []);
    },
  });
  const markweaveHeading = Heading.extend({
    renderMarkdown(node, helpers) {
      const requiresHtmlFallback =
        (node.attrs?.textAlign && node.attrs.textAlign !== "left") ||
        normalizeMarkweaveIndentLevel(node.attrs?.markweaveIndentLevel) > 0 ||
        needsMarkweaveInlineNodeHtmlFallback(node);
      if (requiresHtmlFallback) {
        return htmlFallback.renderBlock(node);
      }

      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
      return `#`.repeat(level) + ` ${helpers.renderChildren(node.content ?? [])}`;
    },
  });
  const markweaveTable = Table.extend({
    renderMarkdown(node, helpers, context) {
      if (needsMarkweaveTableHtmlFallback(node)) {
        return htmlFallback.renderBlock(node);
      }

      return renderStandardTableMarkdown?.(node, helpers, context) ?? "";
    },
  });

  extensions = [
    MarkweaveCompositionGuard,
    MarkweaveCommands.configure({ lang: options.lang === "en" ? "en" : "zh" }),
    MarkweaveAskAi,
    MarkweaveAiEdit.configure({
      lang: options.lang === "en" ? "en" : "zh",
      messages: messages.aiEdit,
    }),
    MarkweaveSlashEmptyLinePlaceholder.configure({
      placeholder: messages.slash.emptyLinePlaceholder,
    }),
    MarkweaveSlashTriggerDecoration.configure({
      filterPlaceholder: messages.slash.filterPlaceholder,
    }),
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
    markweaveParagraph,
    markweaveHeading.configure({
      levels: [1, 2, 3, 4, 5, 6],
    }),
    MarkweaveCallout,
    MarkweaveIndent,
    markweaveTextStyle,
    Color.configure({
      types: [TextStyle.name],
    }),
    markweaveSubscript,
    markweaveSuperscript,
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
    markweaveHighlight.configure({
      multicolor: true,
      HTMLAttributes: {
        class: "markweave-highlight",
      },
    }),
    MarkweaveMarkBoundary,
    MarkweaveSearch,
    options.linkCardExtension ?? MarkweaveLinkCard,
    ...(options.mediaExtensions ?? [MarkweaveCoreImage, MarkweaveCoreVideo, MarkweaveAttachment]),
    MarkweaveImageClipboard.configure({
      onUpload: options.onImageUpload,
    }),
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
    markweaveTable.configure({
      resizable: false,
      allowTableNodeSelection: true,
      HTMLAttributes: {
        class: "markweave-table",
      },
    }),
    TableRow,
    MarkweaveTableHeader,
    MarkweaveTableCell,
    MarkweaveTableCapabilities.configure({ resolver: options.tableCapabilities }),
    MarkweaveTableClipboard,
    MarkweaveMarkdownTableInput,
    MarkweaveTableArrowNavigation,
    MarkweaveTableInteractionLayer,
    MarkweaveTableKeyboard,
    MarkweaveReferenceSuggestion.configure({
      config: options.referenceSuggestion ?? null,
    }),
    MarkweaveInternalLinkCard.configure({
      config: options.internalLinkCard ?? null,
    }),
    ...(options.editorExtensions ?? []),
  ];

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const extension of flattenExtensions(extensions)) {
    if (seen.has(extension.name)) duplicates.add(extension.name);
    seen.add(extension.name);
  }
  if (duplicates.size > 0) {
    throw new Error(`Duplicate Markweave editor extension name: ${[...duplicates].sort().join(", ")}.`);
  }

  return extensions;
}
