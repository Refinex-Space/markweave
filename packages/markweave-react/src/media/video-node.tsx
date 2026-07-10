import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Upload, Video as VideoIcon } from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import {
  resolveMarkweaveUploadResult,
  type MarkweaveSlashCommandUploadHandler,
  type MarkweaveUploadSource,
} from "markweave/internal/plugins/slash-command/upload";
import {
  attrsFromMarkweaveVideoUploadResult,
  attrsFromMarkweaveVideoUrl,
  createMarkweaveVideoUploadRequest,
  markweaveVideoIframeAllow,
  MarkweaveCoreVideo,
  normalizeMarkweaveVideoEmbedUrl,
  stringAttribute,
  type MarkweaveCoreVideoEmbed,
  type MarkweaveCoreVideoProvider,
  type MarkweaveCoreVideoOptions,
} from "markweave/internal/plugins/media/core-media-nodes";
import { getMarkweaveMessages, type MarkweaveMessages } from "markweave/internal/i18n";
import { isMarkweaveEditorLiveEditable } from "markweave/internal/core/editor-mode-state";
import { useMarkweaveEditorModeState } from "../editor-mode-state";

export { isDirectMarkweaveVideoUrl as isDirectVideoUrl, parseMarkweaveVideoEmbed } from "markweave/internal/plugins/media/core-media-nodes";
export type MarkweaveVideoProvider = MarkweaveCoreVideoProvider;

export interface MarkweaveVideoOptions extends MarkweaveCoreVideoOptions {
  readonly messages?: MarkweaveMessages;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
}

export type MarkweaveVideoEmbed = MarkweaveCoreVideoEmbed;

function isVideoUiEventTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-markweave-video-ui="true"], iframe[data-markweave-video-embed], video[data-markweave-video]'));
}

function MarkweaveVideoNodeView(props: NodeViewProps) {
  const { deleteNode, editor, getPos, node, selected, updateAttributes } = props;
  const options = props.extension.options as MarkweaveVideoOptions;
  const messages = options.messages ?? getMarkweaveMessages("zh");
  const videoMessages = messages.video;
  const modeState = useMarkweaveEditorModeState(editor);
  const canEditVideo = isMarkweaveEditorLiveEditable(modeState);
  const src = stringAttribute(node.attrs.src);
  const embedUrl = stringAttribute(node.attrs.embedUrl);
  const provider = stringAttribute(node.attrs.provider);
  const safeEmbedUrl = embedUrl ? normalizeMarkweaveVideoEmbedUrl(embedUrl, provider) : null;
  const mimeType = stringAttribute(node.attrs.mimeType);
  const title = stringAttribute(node.attrs.title);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const showPlaceholder = canEditVideo && !src;

  const selectVideoNode = () => {
    if (!canEditVideo) {
      return;
    }

    const pos = getPos();

    if (typeof pos === "number") {
      editor.chain().focus().setNodeSelection(pos).run();
    }
  };

  const selectVideoFromMouseDown = (event: ReactMouseEvent<HTMLElement>) => {
    if (!canEditVideo) {
      return;
    }

    if (isVideoUiEventTarget(event.target)) {
      return;
    }

    event.preventDefault();
    selectVideoNode();
  };

  const deleteSelectedVideo = (event: KeyboardEvent<HTMLElement>) => {
    if (canEditVideo && (event.key === "Delete" || event.key === "Backspace") && selected) {
      event.preventDefault();
      deleteNode();
    }
  };

  const submitFile = async (file: File | null) => {
    if (!canEditVideo || !file) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const result = await resolveMarkweaveUploadResult(createMarkweaveVideoUploadRequest({ type: "file", file, mimeType: file.type }), options.onUpload);
      updateAttributes(attrsFromMarkweaveVideoUploadResult(result));
      setInputValue("");
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : videoMessages.uploadFailedError);
    } finally {
      setIsSubmitting(false);
      setDragActive(false);
    }
  };

  const submitUrl = () => {
    if (!canEditVideo) {
      return;
    }

    const attrs = attrsFromMarkweaveVideoUrl(inputValue);

    if (!attrs) {
      setError(videoMessages.unsupportedUrlError);
      return;
    }

    setError(null);
    updateAttributes(attrs);
    setInputValue("");
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void submitFile(event.currentTarget.files?.[0] ?? null);
    event.currentTarget.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canEditVideo) {
      return;
    }

    void submitFile(event.dataTransfer.files?.[0] ?? null);
  };

  if (showPlaceholder) {
    return (
      <NodeViewWrapper as="figure" className="markweave-video-node" data-testid="markweave-video-node" data-empty="true" data-selected="false">
        <VideoUploadPlaceholder
          dragActive={dragActive}
          error={error}
          fileInputRef={fileInputRef}
          inputValue={inputValue}
          isSubmitting={isSubmitting}
          messages={messages}
          onCancel={deleteNode}
          onDragActiveChange={setDragActive}
          onDrop={handleDrop}
          onFileChange={handleFileChange}
          onInputChange={setInputValue}
          onSubmit={submitUrl}
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="figure"
      className="markweave-video-node"
      data-testid="markweave-video-node"
      data-provider={provider ?? "file"}
      data-empty={src ? "false" : "true"}
      data-selected={canEditVideo && selected ? "true" : "false"}
      tabIndex={canEditVideo ? 0 : undefined}
      aria-label={videoMessages.nodeAriaLabel}
      onFocus={selectVideoNode}
      onKeyDown={deleteSelectedVideo}
      onMouseDown={selectVideoFromMouseDown}
    >
      {safeEmbedUrl ? (
        <div className="markweave-video-embed">
          <iframe
            className="markweave-video-iframe"
            src={safeEmbedUrl}
            title={title ?? `${provider ?? "Video"} embed`}
            data-markweave-video-embed="true"
            data-markweave-video-provider={provider ?? undefined}
            data-markweave-video-src={src ?? undefined}
            allow={markweaveVideoIframeAllow}
            loading="lazy"
            allowFullScreen
          />
          {canEditVideo ? <button type="button" className="markweave-video-selection-layer" data-testid="markweave-video-selection-layer" tabIndex={-1} aria-label={videoMessages.selectAriaLabel} /> : null}
        </div>
      ) : !src ? (
        <div className="markweave-video-readonly-empty" data-testid="markweave-video-readonly-empty" aria-hidden="true" />
      ) : (
        <div className="markweave-video-box">
          <video className="markweave-video" src={src} title={title ?? undefined} data-markweave-video="true" data-markweave-mime-type={mimeType ?? undefined} preload="metadata" controls />
          {canEditVideo ? <button type="button" className="markweave-video-selection-layer" data-testid="markweave-video-selection-layer" tabIndex={-1} aria-label={videoMessages.selectAriaLabel} /> : null}
        </div>
      )}
    </NodeViewWrapper>
  );
}

function VideoUploadPlaceholder({
  dragActive,
  error,
  fileInputRef,
  inputValue,
  isSubmitting,
  messages,
  onCancel,
  onDragActiveChange,
  onDrop,
  onFileChange,
  onInputChange,
  onSubmit,
}: {
  readonly dragActive: boolean;
  readonly error: string | null;
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  readonly inputValue: string;
  readonly isSubmitting: boolean;
  readonly messages: MarkweaveMessages;
  readonly onCancel: () => void;
  readonly onDragActiveChange: (active: boolean) => void;
  readonly onDrop: (event: DragEvent<HTMLElement>) => void;
  readonly onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onInputChange: (value: string) => void;
  readonly onSubmit: () => void;
}) {
  const videoMessages = messages.video;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <section
      className="markweave-video-upload-placeholder"
      data-testid="markweave-video-upload-placeholder"
      data-drag-active={dragActive ? "true" : "false"}
      data-markweave-video-ui="true"
      onDragEnter={(event) => {
        event.preventDefault();
        onDragActiveChange(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        onDragActiveChange(true);
      }}
      onDragLeave={() => onDragActiveChange(false)}
      onDrop={onDrop}
    >
      <input ref={fileInputRef} data-testid="markweave-video-file-input" type="file" accept="video/*" hidden onChange={onFileChange} />
      <div className="markweave-video-upload-icon" aria-hidden="true">
        <VideoIcon size={46} strokeWidth={1.6} />
      </div>
      <div className="markweave-video-upload-copy">
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          {videoMessages.clickToUpload}
        </button>
        <span>{videoMessages.dragAndDrop}</span>
      </div>
      <div className="markweave-video-upload-note">{videoMessages.uploadNote}</div>
      <div className="markweave-video-upload-row">
        <input
          data-testid="markweave-video-url-input"
          value={inputValue}
          placeholder={videoMessages.uploadInputPlaceholder}
          aria-label={videoMessages.uploadInputAriaLabel}
          onChange={(event) => onInputChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" data-testid="markweave-video-upload-submit" disabled={isSubmitting || !inputValue.trim()} onClick={onSubmit}>
          <Upload size={16} strokeWidth={1.8} />
          {messages.common.insert}
        </button>
        <button type="button" data-testid="markweave-video-upload-cancel" onClick={onCancel}>
          {messages.common.cancel}
        </button>
      </div>
      {error ? <div className="markweave-video-upload-error">{error}</div> : null}
    </section>
  );
}

export const MarkweaveVideo = MarkweaveCoreVideo.extend<MarkweaveVideoOptions>({
  addOptions() {
    return {
      ...(this.parent?.() as MarkweaveCoreVideoOptions),
      messages: getMarkweaveMessages("zh"),
      onUpload: undefined,
    };
  },

  addNodeView() {
    if (typeof document === "undefined") {
      return null;
    }

    return ReactNodeViewRenderer(MarkweaveVideoNodeView, {
      stopEvent: ({ event }) => isVideoUiEventTarget(event.target),
    });
  },
});
