import type { AnyExtension, Extensions, JSONContent, MarkdownRendererHelpers, RenderContext } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Emoji, { emojis } from "@tiptap/extension-emoji";
import Highlight from "@tiptap/extension-highlight";
import { Heading } from "@tiptap/extension-heading";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Link from "@tiptap/extension-link";
import { Markdown } from "@tiptap/markdown";
import Mathematics from "@tiptap/extension-mathematics";
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
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { MarkweaveCompositionGuard } from "./composition-guard";
import { MarkweaveMarkBoundary } from "./mark-boundary";
import { MarkweaveCallout } from "../plugins/callout/callout-node";
import { MarkweaveCodeBlockClickFocus, MarkweaveCodeBlockCollapse, markweaveCodeBlockBehavior } from "../plugins/codeblock/codeblock-behavior";
import { MarkweaveIndent } from "../plugins/indent/indent-extension";
import { MarkweaveLinkCard } from "../plugins/link-card/link-card-node";
import { MarkweaveMarkdownInput } from "../plugins/markdown/markdown-input";
import {
  needsMarkweaveTableHtmlFallback,
  normalizeMarkweaveHtmlColor,
  renderMarkweaveHtmlFallback,
} from "../plugins/markdown/lossless-html";
import { MarkweaveCoreImage, MarkweaveCoreVideo } from "../plugins/media/core-media-nodes";
import { MarkweaveAttachment } from "../plugins/media/media-nodes";
import { MarkweaveMermaidInlinePreview } from "../plugins/mermaid/mermaid-inline-preview";
import { MarkweaveTableClipboard } from "../plugins/table/table-clipboard";
import { MarkweaveTableArrowNavigation } from "../plugins/table/table-arrow-navigation";
import { MarkweaveTableInteractionLayer } from "../plugins/table/table-interaction-layer";
import { MarkweaveTableKeyboard } from "../plugins/table/table-keyboard";
import { MarkweaveMarkdownTableInput } from "../plugins/table/table-markdown-input";

import type { MarkweaveLang } from "../i18n";

export interface CreateMarkweaveEditorExtensionsOptions {
  readonly lang?: MarkweaveLang;
  readonly mediaExtensions?: Extensions;
  readonly linkCardExtension?: AnyExtension;
}

const markweaveLowlight = createLowlight(common);
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

export function createMarkweaveEditorExtensions(options: CreateMarkweaveEditorExtensionsOptions = {}) {
  return [
    MarkweaveCompositionGuard,
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
    options.linkCardExtension ?? MarkweaveLinkCard,
    ...(options.mediaExtensions ?? [MarkweaveCoreImage, MarkweaveCoreVideo]),
    MarkweaveAttachment,
    HorizontalRule.configure({
      HTMLAttributes: {
        class: "markweave-separator",
      },
    }),
    TaskList.configure({
      HTMLAttributes: {
        class: "markweave-task-list",
      },
    }),
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
