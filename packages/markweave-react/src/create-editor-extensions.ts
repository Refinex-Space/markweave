import { createMarkweaveEditorExtensions as createMarkweaveCoreEditorExtensions } from "markweave/internal/editor-core/create-editor-extensions";
import type { AnyExtension } from "@tiptap/core";
import { getMarkweaveMessages, type MarkweaveLang } from "markweave/internal/i18n";
import type { MarkweaveAttachmentDownloadHandler } from "markweave/internal/plugins/media/attachment-download";
import type { MarkweaveInternalLinkCardConfig } from "markweave/internal/plugins/internal-link-card/internal-link-card";
import type { MarkweaveLinkCardResolver } from "markweave/internal/plugins/link-card/link-card";
import type { MarkweaveReferenceSuggestionConfig } from "markweave/internal/plugins/reference/reference-suggestion";
import type { MarkweaveSlashCommandUploadHandler } from "markweave/internal/plugins/slash-command/upload";
import type { MarkweaveMediaSourceResolver } from "markweave/internal/plugins/media/media-source";
import type { MarkweaveTableCapabilityResolver } from "markweave/internal/plugins/table/table-capabilities";
import { createMarkweaveAdapterMediaExtensions } from "markweave/internal/plugins/media/media-extension-factory";
import { MarkweaveReactAttachment } from "./media/attachment-node";
import { MarkweaveImage } from "./media/image-node";
import { MarkweaveVideo } from "./media/video-node";
import { MarkweaveReactLinkCard } from "./link-card-node";

export interface CreateMarkweaveReactEditorExtensionsOptions {
  readonly lang?: MarkweaveLang;
  readonly onImageUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onVideoUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onAttachmentUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onAttachmentDownload?: MarkweaveAttachmentDownloadHandler;
  readonly linkCardResolver?: MarkweaveLinkCardResolver;
  readonly resolveMediaSource?: MarkweaveMediaSourceResolver;
  readonly tableCapabilities?: MarkweaveTableCapabilityResolver;
  readonly referenceSuggestion?: MarkweaveReferenceSuggestionConfig | null;
  readonly internalLinkCard?: MarkweaveInternalLinkCardConfig | null;
  readonly editorExtensions?: readonly AnyExtension[];
}

export function createMarkweaveReactEditorExtensions(options: CreateMarkweaveReactEditorExtensionsOptions = {}) {
  return createMarkweaveCoreEditorExtensions({
    lang: options.lang,
    onImageUpload: options.onImageUpload,
    tableCapabilities: options.tableCapabilities,
    referenceSuggestion: options.referenceSuggestion,
    internalLinkCard: options.internalLinkCard,
    linkCardExtension: MarkweaveReactLinkCard.configure({
      lang: options.lang,
      messages: getMarkweaveMessages(options.lang),
      resolver: options.linkCardResolver,
    }),
    mediaExtensions: createMarkweaveAdapterMediaExtensions({
      image: MarkweaveImage,
      video: MarkweaveVideo,
      attachment: MarkweaveReactAttachment,
      lang: options.lang,
      onImageUpload: options.onImageUpload,
      onVideoUpload: options.onVideoUpload,
      onAttachmentUpload: options.onAttachmentUpload,
      onAttachmentDownload: options.onAttachmentDownload,
      resolveMediaSource: options.resolveMediaSource,
    }),
    editorExtensions: options.editorExtensions,
  });
}

export { createMarkweaveReactEditorExtensions as createMarkweaveEditorExtensions };
