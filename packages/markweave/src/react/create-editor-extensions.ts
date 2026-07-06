import { createMarkweaveEditorExtensions as createMarkweaveCoreEditorExtensions } from "../editor-core/create-editor-extensions";
import { getMarkweaveMessages, type MarkweaveLang } from "../i18n";
import { MarkweaveImage } from "../plugins/media/image-node";
import { MarkweaveVideo } from "../plugins/media/video-node";
import type { MarkweaveSlashCommandUploadHandler } from "../plugins/slash-command/upload";

export interface CreateMarkweaveReactEditorExtensionsOptions {
  readonly lang?: MarkweaveLang;
  readonly onImageUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onVideoUpload?: MarkweaveSlashCommandUploadHandler;
}

export function createMarkweaveReactEditorExtensions(options: CreateMarkweaveReactEditorExtensionsOptions = {}) {
  const messages = getMarkweaveMessages(options.lang);

  return createMarkweaveCoreEditorExtensions({
    lang: options.lang,
    mediaExtensions: [
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
    ],
  });
}

export { createMarkweaveReactEditorExtensions as createMarkweaveEditorExtensions };
