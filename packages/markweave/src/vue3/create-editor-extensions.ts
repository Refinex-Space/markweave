import { createMarkweaveEditorExtensions as createMarkweaveCoreEditorExtensions } from "../editor-core/create-editor-extensions";
import type { MarkweaveLang } from "../i18n";
import type { MarkweaveSlashCommandUploadHandler } from "../plugins/slash-command/upload";
import { createMarkweaveAdapterMediaExtensions } from "../plugins/media/media-extension-factory";
import { MarkweaveVueImage, MarkweaveVueVideo } from "./media-nodeviews";

export interface CreateMarkweaveVue3EditorExtensionsOptions {
  readonly lang?: MarkweaveLang;
  readonly onImageUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onVideoUpload?: MarkweaveSlashCommandUploadHandler;
}

export function createMarkweaveVue3EditorExtensions(options: CreateMarkweaveVue3EditorExtensionsOptions = {}) {
  return createMarkweaveCoreEditorExtensions({
    lang: options.lang,
    mediaExtensions: createMarkweaveAdapterMediaExtensions({
      image: MarkweaveVueImage,
      video: MarkweaveVueVideo,
      lang: options.lang,
      onImageUpload: options.onImageUpload,
      onVideoUpload: options.onVideoUpload,
    }),
  });
}

export { createMarkweaveVue3EditorExtensions as createMarkweaveEditorExtensions };
