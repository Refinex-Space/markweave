import { createMarkweaveEditorExtensions as createMarkweaveCoreEditorExtensions } from "markweave/internal/editor-core/create-editor-extensions";
import { getMarkweaveMessages, type MarkweaveLang } from "markweave/internal/i18n";
import type { MarkweaveAttachmentDownloadHandler } from "markweave/internal/plugins/media/attachment-download";
import type { MarkweaveLinkCardResolver } from "markweave/internal/plugins/link-card/link-card";
import type { MarkweaveSlashCommandUploadHandler } from "markweave/internal/plugins/slash-command/upload";
import type { MarkweaveMediaSourceResolver } from "markweave/internal/plugins/media/media-source";
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
}

export function createMarkweaveReactEditorExtensions(options: CreateMarkweaveReactEditorExtensionsOptions = {}) {
  return createMarkweaveCoreEditorExtensions({
    lang: options.lang,
    onImageUpload: options.onImageUpload,
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
  });
}

export { createMarkweaveReactEditorExtensions as createMarkweaveEditorExtensions };
