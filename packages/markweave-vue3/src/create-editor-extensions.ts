import { createMarkweaveEditorExtensions as createMarkweaveCoreEditorExtensions } from "markweave/internal/editor-core/create-editor-extensions";
import { getMarkweaveMessages, type MarkweaveLang } from "markweave/internal/i18n";
import type { MarkweaveLinkCardResolver } from "markweave/internal/plugins/link-card/link-card";
import type { MarkweaveSlashCommandUploadHandler } from "markweave/internal/plugins/slash-command/upload";
import type { MarkweaveMediaSourceResolver } from "markweave/internal/plugins/media/media-source";
import { createMarkweaveAdapterMediaExtensions } from "markweave/internal/plugins/media/media-extension-factory";
import { MarkweaveVueImage, MarkweaveVueLinkCard, MarkweaveVueVideo } from "./media-nodeviews";

export interface CreateMarkweaveVue3EditorExtensionsOptions {
  readonly lang?: MarkweaveLang;
  readonly onImageUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onVideoUpload?: MarkweaveSlashCommandUploadHandler;
  readonly linkCardResolver?: MarkweaveLinkCardResolver;
  readonly resolveMediaSource?: MarkweaveMediaSourceResolver;
}

export function createMarkweaveVue3EditorExtensions(options: CreateMarkweaveVue3EditorExtensionsOptions = {}) {
  return createMarkweaveCoreEditorExtensions({
    lang: options.lang,
    onImageUpload: options.onImageUpload,
    linkCardExtension: MarkweaveVueLinkCard.configure({ lang: options.lang, messages: getMarkweaveMessages(options.lang), resolver: options.linkCardResolver }),
    mediaExtensions: createMarkweaveAdapterMediaExtensions({
      image: MarkweaveVueImage,
      video: MarkweaveVueVideo,
      lang: options.lang,
      onImageUpload: options.onImageUpload,
      onVideoUpload: options.onVideoUpload,
      resolveMediaSource: options.resolveMediaSource,
    }),
  });
}

export { createMarkweaveVue3EditorExtensions as createMarkweaveEditorExtensions };
