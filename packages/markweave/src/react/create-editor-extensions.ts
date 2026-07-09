import { createMarkweaveEditorExtensions as createMarkweaveCoreEditorExtensions } from "../editor-core/create-editor-extensions";
import type { MarkweaveLang } from "../i18n";
import { MarkweaveImage } from "./media/image-node";
import { MarkweaveVideo } from "./media/video-node";
import type { MarkweaveSlashCommandUploadHandler } from "../plugins/slash-command/upload";
import { createMarkweaveAdapterMediaExtensions } from "../plugins/media/media-extension-factory";

export interface CreateMarkweaveReactEditorExtensionsOptions {
  readonly lang?: MarkweaveLang;
  readonly onImageUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onVideoUpload?: MarkweaveSlashCommandUploadHandler;
}

export function createMarkweaveReactEditorExtensions(options: CreateMarkweaveReactEditorExtensionsOptions = {}) {
  return createMarkweaveCoreEditorExtensions({
    lang: options.lang,
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
