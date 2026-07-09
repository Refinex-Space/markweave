import { createMarkweaveEditorExtensions as createMarkweaveCoreEditorExtensions } from "markweave/internal/editor-core/create-editor-extensions";
import type { MarkweaveLang } from "markweave/internal/i18n";
import type { MarkweaveSlashCommandUploadHandler } from "markweave/internal/plugins/slash-command/upload";
import { createMarkweaveAdapterMediaExtensions } from "markweave/internal/plugins/media/media-extension-factory";
import { MarkweaveVueImage, MarkweaveVueVideo } from "./media-nodeviews";

export interface CreateMarkweaveVue2EditorExtensionsOptions {
  readonly lang?: MarkweaveLang;
  readonly onImageUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onVideoUpload?: MarkweaveSlashCommandUploadHandler;
}

export function createMarkweaveVue2EditorExtensions(options: CreateMarkweaveVue2EditorExtensionsOptions = {}) {
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

export { createMarkweaveVue2EditorExtensions as createMarkweaveEditorExtensions };
