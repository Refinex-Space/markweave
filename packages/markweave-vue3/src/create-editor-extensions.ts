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
import { MarkweaveVueAttachment, MarkweaveVueImage, MarkweaveVueLinkCard, MarkweaveVueVideo } from "./media-nodeviews";

export interface CreateMarkweaveVue3EditorExtensionsOptions {
  readonly lang?: MarkweaveLang;
  readonly revealLinkMarkdown?: boolean;
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

export function createMarkweaveVue3EditorExtensions(options: CreateMarkweaveVue3EditorExtensionsOptions = {}) {
  return createMarkweaveCoreEditorExtensions({
    lang: options.lang,
    revealLinkMarkdown: options.revealLinkMarkdown,
    onImageUpload: options.onImageUpload,
    tableCapabilities: options.tableCapabilities,
    referenceSuggestion: options.referenceSuggestion,
    internalLinkCard: options.internalLinkCard,
    linkCardExtension: MarkweaveVueLinkCard.configure({ lang: options.lang, messages: getMarkweaveMessages(options.lang), resolver: options.linkCardResolver }),
    mediaExtensions: createMarkweaveAdapterMediaExtensions({
      image: MarkweaveVueImage,
      video: MarkweaveVueVideo,
      attachment: MarkweaveVueAttachment,
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

export { createMarkweaveVue3EditorExtensions as createMarkweaveEditorExtensions };
