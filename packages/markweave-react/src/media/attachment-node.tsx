import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { getMarkweaveEditorModeState, isMarkweaveEditorLiveEditable } from "markweave/internal/core/editor-mode-state";
import { getMarkweaveMessages, type MarkweaveMessages } from "markweave/internal/i18n";
import {
  activateMarkweaveAttachmentDownload,
  attrsFromMarkweaveAttachmentUploadResult,
  createMarkweaveAttachmentRefFromAttrs,
  createMarkweaveAttachmentUploadRequest,
  formatMarkweaveAttachmentSize,
  type MarkweaveAttachmentDownloadHandler,
} from "markweave/internal/plugins/media/attachment-download";
import { stringAttribute } from "markweave/internal/plugins/media/core-media-nodes";
import { MarkweaveAttachment } from "markweave/internal/plugins/media/media-nodes";
import { resolveMarkweaveUploadResult, type MarkweaveSlashCommandUploadHandler } from "markweave/internal/plugins/slash-command/upload";
import { useMarkweaveEditorModeState } from "../editor-mode-state";

export interface MarkweaveAttachmentOptions {
  readonly messages?: MarkweaveMessages;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
  readonly onDownload?: MarkweaveAttachmentDownloadHandler;
  readonly HTMLAttributes?: Record<string, unknown>;
}

function isAttachmentUiEventTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        '[data-markweave-attachment-ui="true"], .markweave-attachment-upload-placeholder, .markweave-attachment-uploading',
      ),
    )
  );
}

function progressPercent(loaded: number, total: number | null) {
  if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
}

function MarkweaveAttachmentNodeView(props: NodeViewProps) {
  const { deleteNode, editor, getPos, node, selected, updateAttributes } = props;
  const options = props.extension.options as MarkweaveAttachmentOptions;
  const messages = options.messages ?? getMarkweaveMessages("zh");
  const attachmentMessages = messages.attachment;
  const modeState = useMarkweaveEditorModeState(editor);
  const canEdit = isMarkweaveEditorLiveEditable(modeState);
  const attachment = createMarkweaveAttachmentRefFromAttrs(node.attrs);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [uploadingSize, setUploadingSize] = useState<number | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const showPlaceholder = canEdit && !attachment && !isSubmitting;
  const showUploading = isSubmitting;
  const showActions = Boolean(attachment) && (hovered || selected);

  const selectAttachmentNode = () => {
    if (!canEdit) {
      return;
    }

    const pos = getPos();
    if (typeof pos === "number") {
      editor.chain().focus().setNodeSelection(pos).run();
    }
  };

  const selectFromMouseDown = (event: ReactMouseEvent<HTMLElement>) => {
    if (!canEdit || isAttachmentUiEventTarget(event.target)) {
      return;
    }

    event.preventDefault();
    selectAttachmentNode();
  };

  const deleteSelectedAttachment = (event: KeyboardEvent<HTMLElement>) => {
    if (canEdit && selected && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      deleteNode();
    }
  };

  const openFilePicker = () => {
    if (!canEdit || isSubmitting) {
      return;
    }

    fileInputRef.current?.click();
  };

  const submitFile = async (file: File | null) => {
    if (!canEdit || !file || isSubmitting) {
      return;
    }

    setUploadError(null);
    setIsSubmitting(true);
    setUploadingName(file.name);
    setUploadingSize(file.size);
    setUploadPercent(null);

    try {
      const result = await resolveMarkweaveUploadResult(
        {
          ...createMarkweaveAttachmentUploadRequest({
            type: "file",
            file,
            mimeType: file.type || undefined,
          }),
          onProgress: (progress) => {
            setUploadPercent(progressPercent(progress.loaded, progress.total));
          },
        },
        options.onUpload,
      );
      updateAttributes(attrsFromMarkweaveAttachmentUploadResult(result));
    } catch (errorValue) {
      setUploadError(errorValue instanceof Error ? errorValue.message : attachmentMessages.uploadFailedError);
    } finally {
      setIsSubmitting(false);
      setUploadingName(null);
      setUploadingSize(null);
      setUploadPercent(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void submitFile(event.currentTarget.files?.[0] ?? null);
  };

  const handleActivate = (event: ReactMouseEvent<HTMLElement>) => {
    if (isAttachmentUiEventTarget(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (showPlaceholder) {
      openFilePicker();
      return;
    }

    if (!attachment) {
      return;
    }

    activateMarkweaveAttachmentDownload(
      attachment,
      {
        mode: getMarkweaveEditorModeState(editor).mode,
        event: event.nativeEvent,
      },
      options.onDownload,
    );
  };

  const handleDownload = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!attachment) {
      return;
    }

    activateMarkweaveAttachmentDownload(
      attachment,
      {
        mode: getMarkweaveEditorModeState(editor).mode,
        event: event.nativeEvent,
      },
      options.onDownload,
    );
  };

  const handleDelete = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deleteNode();
  };

  const label = attachment?.name ?? stringAttribute(node.attrs.src) ?? attachmentMessages.missingSrc;
  const metaParts = [
    stringAttribute(node.attrs.mimeType),
    formatMarkweaveAttachmentSize(typeof node.attrs.size === "number" ? node.attrs.size : null),
  ].filter(Boolean);
  const uploadingMeta = [
    formatMarkweaveAttachmentSize(uploadingSize),
    uploadPercent === null ? null : `${uploadPercent}%`,
  ]
    .filter(Boolean)
    .join(" · ");

  if (showPlaceholder) {
    return (
      <NodeViewWrapper
        as="div"
        className="markweave-attachment markweave-attachment-upload-placeholder"
        data-markweave-attachment="true"
        data-markweave-attachment-nodeview="true"
        data-empty="true"
        data-testid="markweave-attachment-node"
        data-selected={selected ? "true" : "false"}
        aria-label={attachmentMessages.uploadLabel}
        onKeyDown={deleteSelectedAttachment}
      >
        <input ref={fileInputRef} data-testid="markweave-attachment-file-input" type="file" hidden onChange={handleFileChange} />
        <button
          type="button"
          className="markweave-attachment-upload-trigger"
          data-markweave-attachment-ui="true"
          data-testid="markweave-attachment-upload-trigger"
          aria-label={attachmentMessages.uploadLabel}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openFilePicker}
        >
          <span className="markweave-attachment-icon" aria-hidden="true">
            <Upload size={16} strokeWidth={1.8} />
          </span>
          <span className="markweave-attachment-upload-label">{attachmentMessages.uploadLabel}</span>
          {uploadError ? <span className="markweave-attachment-upload-error">{uploadError}</span> : null}
        </button>
      </NodeViewWrapper>
    );
  }

  if (showUploading) {
    return (
      <NodeViewWrapper
        as="div"
        className="markweave-attachment markweave-attachment-uploading"
        data-markweave-attachment="true"
        data-markweave-attachment-nodeview="true"
        data-markweave-attachment-ui="true"
        data-uploading="true"
        data-testid="markweave-attachment-node"
        data-selected={selected ? "true" : "false"}
        aria-label={attachmentMessages.uploading}
        onMouseDown={(event: ReactMouseEvent<HTMLElement>) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDown={deleteSelectedAttachment}
      >
        <span className="markweave-attachment-icon" aria-hidden="true">
          <Upload size={16} strokeWidth={1.8} />
        </span>
        <span className="markweave-attachment-body">
          <span className="markweave-attachment-name">{uploadingName ?? attachmentMessages.uploading}</span>
          <span className="markweave-attachment-meta">
            <span className="markweave-attachment-spinner" aria-hidden="true" />
            {uploadingMeta || attachmentMessages.uploading}
          </span>
        </span>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="div"
      className="markweave-attachment"
      data-markweave-attachment="true"
      data-markweave-attachment-nodeview="true"
      data-testid="markweave-attachment-node"
      data-selected={selected ? "true" : "false"}
      data-hovered={hovered ? "true" : "false"}
      aria-label={attachmentMessages.nodeAriaLabel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={selectFromMouseDown}
      onKeyDown={deleteSelectedAttachment}
      onClick={handleActivate}
    >
      <span className="markweave-attachment-icon" aria-hidden="true">
        <Paperclip size={16} strokeWidth={1.8} />
      </span>
      <span className="markweave-attachment-body">
        <span className="markweave-attachment-name">{label}</span>
        {metaParts.length > 0 ? <span className="markweave-attachment-meta">{metaParts.join(" · ")}</span> : null}
      </span>
      {showActions ? (
        <span className="markweave-attachment-actions" data-markweave-attachment-ui="true">
          <button
            type="button"
            className="markweave-attachment-download"
            data-markweave-attachment-ui="true"
            data-testid="markweave-attachment-download"
            aria-label={attachmentMessages.downloadAriaLabel}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleDownload}
          >
            <Download size={16} strokeWidth={1.8} />
            <span className="markweave-attachment-tooltip" role="tooltip">
              {attachmentMessages.download}
            </span>
          </button>
          {canEdit ? (
            <button
              type="button"
              className="markweave-attachment-delete"
              data-markweave-attachment-ui="true"
              data-testid="markweave-attachment-delete"
              aria-label={attachmentMessages.deleteAriaLabel}
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleDelete}
            >
              <Trash2 size={16} strokeWidth={1.8} />
              <span className="markweave-attachment-tooltip" role="tooltip">
                {attachmentMessages.delete}
              </span>
            </button>
          ) : null}
        </span>
      ) : null}
    </NodeViewWrapper>
  );
}

export const MarkweaveReactAttachment = MarkweaveAttachment.extend<MarkweaveAttachmentOptions>({
  addOptions() {
    return {
      ...(this.parent?.() as object),
      messages: getMarkweaveMessages("zh"),
      onUpload: undefined,
      onDownload: undefined,
      HTMLAttributes: {
        class: "markweave-attachment",
      },
    };
  },

  addNodeView() {
    if (typeof document === "undefined") {
      return null;
    }

    return ReactNodeViewRenderer(MarkweaveAttachmentNodeView, {
      stopEvent: ({ event }) => isAttachmentUiEventTarget(event.target),
    });
  },
});
