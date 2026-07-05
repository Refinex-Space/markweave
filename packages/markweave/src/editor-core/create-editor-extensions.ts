import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Emoji, { emojis } from "@tiptap/extension-emoji";
import Highlight from "@tiptap/extension-highlight";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Link from "@tiptap/extension-link";
import Mathematics from "@tiptap/extension-mathematics";
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
import { MarkweaveMarkdownInput } from "../plugins/markdown/markdown-input";
import { MarkweaveImage } from "../plugins/media/image-node";
import { MarkweaveAttachment } from "../plugins/media/media-nodes";
import { MarkweaveVideo } from "../plugins/media/video-node";
import { MarkweaveMermaidInlinePreview } from "../plugins/mermaid/mermaid-inline-preview";
import { MarkweaveTableClipboard } from "../plugins/table/table-clipboard";
import { MarkweaveTableArrowNavigation } from "../plugins/table/table-arrow-navigation";
import { MarkweaveTableInteractionLayer } from "../plugins/table/table-interaction-layer";
import { MarkweaveTableKeyboard } from "../plugins/table/table-keyboard";
import { MarkweaveMarkdownTableInput } from "../plugins/table/table-markdown-input";

import { getMarkweaveMessages, type MarkweaveLang } from "../i18n";
import type { MarkweaveSlashCommandUploadHandler } from "../plugins/slash-command/upload";

export interface CreateMarkweaveEditorExtensionsOptions {
  readonly lang?: MarkweaveLang;
  readonly onImageUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onVideoUpload?: MarkweaveSlashCommandUploadHandler;
}

const markweaveLowlight = createLowlight(common);

export function createMarkweaveEditorExtensions(options: CreateMarkweaveEditorExtensionsOptions = {}) {
  const messages = getMarkweaveMessages(options.lang);

  return [
    MarkweaveCompositionGuard,
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
      codeBlock: false,
      horizontalRule: false,
      link: false,
      underline: false,
    }),
    MarkweaveCallout,
    MarkweaveIndent,
    TextStyle,
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
    Highlight.configure({
      multicolor: true,
      HTMLAttributes: {
        class: "markweave-highlight",
      },
    }),
    MarkweaveMarkBoundary,
    MarkweaveImage.configure({
      inline: false,
      allowBase64: true,
      messages,
      onUpload: options.onImageUpload,
      HTMLAttributes: {
        class: "markweave-image",
      },
    }),
    MarkweaveVideo.configure({
      messages,
      onUpload: options.onVideoUpload,
      HTMLAttributes: {
        class: "markweave-video",
      },
    }),
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
    Table.configure({
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
