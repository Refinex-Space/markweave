import { createMarkweaveEditorExtensions as createMarkweaveCoreEditorExtensions } from "../editor-core/create-editor-extensions";
import { getMarkweaveMessages, type MarkweaveLang } from "../i18n";
import type { MarkweaveSlashCommandUploadHandler } from "../plugins/slash-command/upload";
import { MarkweaveVueImage, MarkweaveVueVideo } from "./media-nodeviews";

export interface CreateMarkweaveVue3EditorExtensionsOptions {
  readonly lang?: MarkweaveLang;
  readonly onImageUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onVideoUpload?: MarkweaveSlashCommandUploadHandler;
}

export function createMarkweaveVue3EditorExtensions(options: CreateMarkweaveVue3EditorExtensionsOptions = {}) {
  const messages = getMarkweaveMessages(options.lang);

  return createMarkweaveCoreEditorExtensions({
    lang: options.lang,
    mediaExtensions: [
      MarkweaveVueImage.configure({
        inline: false,
        allowBase64: true,
        messages,
        onUpload: options.onImageUpload,
        HTMLAttributes: {
          class: "markweave-image",
        },
      }),
      MarkweaveVueVideo.configure({
        messages,
        onUpload: options.onVideoUpload,
        HTMLAttributes: {
          class: "markweave-video",
        },
      }),
    ],
  });
}

export { createMarkweaveVue3EditorExtensions as createMarkweaveEditorExtensions };
