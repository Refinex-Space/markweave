import type { AnyExtension, Extensions } from "@tiptap/core";
import { getMarkweaveMessages, type MarkweaveLang, type MarkweaveMessages } from "../../i18n";
import type { MarkweaveSlashCommandUploadHandler } from "../slash-command/upload";
import type { MarkweaveAttachmentDownloadHandler } from "./attachment-download";
import type { MarkweaveMediaSourceResolver } from "./media-source";

export interface CreateMarkweaveMediaExtensionOptions {
  readonly lang?: MarkweaveLang;
  readonly onImageUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onVideoUpload?: MarkweaveSlashCommandUploadHandler;
  readonly resolveMediaSource?: MarkweaveMediaSourceResolver;
}

export interface MarkweaveAdapterImageExtensionOptions {
  readonly inline: boolean;
  readonly allowBase64: boolean;
  readonly messages: MarkweaveMessages;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
  readonly resolveMediaSource?: MarkweaveMediaSourceResolver;
  readonly HTMLAttributes: {
    readonly class: "markweave-image";
  };
}

export interface MarkweaveAdapterVideoExtensionOptions {
  readonly messages: MarkweaveMessages;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
  readonly resolveMediaSource?: MarkweaveMediaSourceResolver;
  readonly HTMLAttributes: {
    readonly class: "markweave-video";
  };
}

export interface MarkweaveAdapterAttachmentExtensionOptions {
  readonly messages: MarkweaveMessages;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onDownload?: MarkweaveAttachmentDownloadHandler;
  readonly HTMLAttributes: {
    readonly class: "markweave-attachment";
  };
}

interface ConfigurableMediaExtension<Options> {
  configure(options: Options): AnyExtension;
}

export function createMarkweaveAdapterMediaExtensions(options: {
  readonly image: ConfigurableMediaExtension<MarkweaveAdapterImageExtensionOptions>;
  readonly video: ConfigurableMediaExtension<MarkweaveAdapterVideoExtensionOptions>;
  readonly attachment: ConfigurableMediaExtension<MarkweaveAdapterAttachmentExtensionOptions>;
  readonly lang?: MarkweaveLang;
  readonly onImageUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onVideoUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onAttachmentUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onAttachmentDownload?: MarkweaveAttachmentDownloadHandler;
  readonly resolveMediaSource?: MarkweaveMediaSourceResolver;
}): Extensions {
  const messages = getMarkweaveMessages(options.lang);

  return [
    options.image.configure({
      inline: false,
      allowBase64: true,
      messages,
      onUpload: options.onImageUpload,
      resolveMediaSource: options.resolveMediaSource,
      HTMLAttributes: {
        class: "markweave-image",
      },
    }),
    options.video.configure({
      messages,
      onUpload: options.onVideoUpload,
      resolveMediaSource: options.resolveMediaSource,
      HTMLAttributes: {
        class: "markweave-video",
      },
    }),
    options.attachment.configure({
      messages,
      onUpload: options.onAttachmentUpload,
      onDownload: options.onAttachmentDownload,
      HTMLAttributes: {
        class: "markweave-attachment",
      },
    }),
  ];
}
