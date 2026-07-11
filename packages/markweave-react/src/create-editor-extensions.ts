import { createMarkweaveEditorExtensions as createMarkweaveCoreEditorExtensions } from "markweave/internal/editor-core/create-editor-extensions";
import { getMarkweaveMessages, type MarkweaveLang } from "markweave/internal/i18n";
import { MarkweaveImage } from "./media/image-node";
import { MarkweaveVideo } from "./media/video-node";
import type { MarkweaveSlashCommandUploadHandler } from "markweave/internal/plugins/slash-command/upload";
import type { MarkweaveLinkCardResolver } from "markweave/internal/plugins/link-card/link-card";
import { createMarkweaveAdapterMediaExtensions } from "markweave/internal/plugins/media/media-extension-factory";
import { MarkweaveReactLinkCard } from "./link-card-node";

export interface CreateMarkweaveReactEditorExtensionsOptions {
  readonly lang?: MarkweaveLang;
  readonly onImageUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onVideoUpload?: MarkweaveSlashCommandUploadHandler;
  readonly linkCardResolver?: MarkweaveLinkCardResolver;
}

export function createMarkweaveReactEditorExtensions(options: CreateMarkweaveReactEditorExtensionsOptions = {}) {
  return createMarkweaveCoreEditorExtensions({
    lang: options.lang,
    linkCardExtension: MarkweaveReactLinkCard.configure({
      lang: options.lang,
      messages: getMarkweaveMessages(options.lang),
      resolver: options.linkCardResolver,
    }),
    mediaExtensions: createMarkweaveAdapterMediaExtensions({
      image: MarkweaveImage,
      video: MarkweaveVideo,
      lang: options.lang,
      onImageUpload: options.onImageUpload,
      onVideoUpload: options.onVideoUpload,
    }),
  });
}

export { createMarkweaveReactEditorExtensions as createMarkweaveEditorExtensions };
