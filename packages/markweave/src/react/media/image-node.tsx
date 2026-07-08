import type { NodeViewProps } from "@tiptap/core";
import type { ImageOptions } from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Captions,
  Download,
  ImageUp,
  Replace,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import {
  detectUploadSource,
  resolveMarkweaveUploadResult,
  type MarkweaveSlashCommandUploadHandler,
  type MarkweaveUploadSource,
} from "../../plugins/slash-command/upload";
import {
  attrsFromMarkweaveImageUploadResult,
  clampMarkweaveImageWidth,
  createMarkweaveImageUploadRequest,
  downloadMarkweaveImage,
  MarkweaveCoreImage,
  normalizeMarkweaveCoreImageAlign,
  numberAttribute,
  stringAttribute,
  type MarkweaveCoreImageAlign,
} from "../../plugins/media/core-media-nodes";
import { getMarkweaveMessages, type MarkweaveMessages } from "../../i18n";
import { isMarkweaveEditorLiveEditable } from "../../core/editor-mode-state";
import { useMarkweaveEditorModeState } from "../editor-mode-state";

export type MarkweaveImageAlign = MarkweaveCoreImageAlign;

export interface MarkweaveImageOptions extends ImageOptions {
  readonly messages?: MarkweaveMessages;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
}

export const normalizeMarkweaveImageAlign = normalizeMarkweaveCoreImageAlign;

function isImageUiEventTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-markweave-image-ui="true"]'));
}

function MarkweaveImageNodeView(props: NodeViewProps) {
  const { deleteNode, editor, getPos, node, selected, updateAttributes } = props;
  const options = props.extension.options as MarkweaveImageOptions;
  const messages = options.messages ?? getMarkweaveMessages("zh");
  const imageMessages = messages.image;
  const modeState = useMarkweaveEditorModeState(editor);
  const canEditImage = isMarkweaveEditorLiveEditable(modeState);
  const src = stringAttribute(node.attrs.src);
  const align = normalizeMarkweaveImageAlign(node.attrs.align);
  const width = numberAttribute(node.attrs.width);
  const caption = stringAttribute(node.attrs.caption);
  const imageBoxRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(Boolean(caption));
  const [captionValue, setCaptionValue] = useState(caption ?? "");
  const showPlaceholder = canEditImage && (!src || replacing);

  useEffect(() => {
    if (!captionOpen) {
      setCaptionValue(caption ?? "");
    }
  }, [caption, captionOpen]);

  const selectImageNode = () => {
    if (!canEditImage) {
      return;
    }

    const pos = getPos();

    if (typeof pos === "number") {
      editor.chain().focus().setNodeSelection(pos).run();
    }
  };

  const closePlaceholder = () => {
    if (!canEditImage) {
      return;
    }

    setInputValue("");
    setError(null);
    setDragActive(false);

    if (src) {
      setReplacing(false);
      return;
    }

    deleteNode();
  };

  const submitUploadSource = async (source: MarkweaveUploadSource) => {
    if (!canEditImage) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const result = await resolveMarkweaveUploadResult(createMarkweaveImageUploadRequest(source, src && replacing ? "image-replace" : "image-insert"), options.onUpload);
      updateAttributes(attrsFromMarkweaveImageUploadResult(node.attrs, result));
      setReplacing(false);
      setInputValue("");
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : imageMessages.uploadFailedError);
    } finally {
      setIsSubmitting(false);
      setDragActive(false);
    }
  };

  const submitInputValue = () => {
    if (!canEditImage) {
      return;
    }

    if (!inputValue.trim()) {
      setError(imageMessages.uploadRequiredError);
      return;
    }

    void submitUploadSource(detectUploadSource(inputValue));
  };

  const submitFile = (file: File | null) => {
    if (!canEditImage || !file) {
      return;
    }

    void submitUploadSource({ type: "file", file, mimeType: file.type });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    submitFile(event.currentTarget.files?.[0] ?? null);
    event.currentTarget.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canEditImage) {
      return;
    }

    submitFile(event.dataTransfer.files?.[0] ?? null);
  };

  const toggleCaption = () => {
    if (!canEditImage) {
      return;
    }

    setCaptionOpen((value) => !value);
    if (!captionOpen) {
      setCaptionValue(caption ?? "");
    }
  };

  const updateCaption = (value: string) => {
    if (!canEditImage) {
      return;
    }

    setCaptionValue(value);
    updateAttributes({ caption: value.trim() ? value : null });
  };

  const beginResize = (side: "left" | "right", event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canEditImage) {
      return;
    }

    selectImageNode();

    const box = imageBoxRef.current;
    if (!box) {
      return;
    }

    const startX = event.clientX;
    const startWidth = box.getBoundingClientRect().width || width || 320;
    const surfaceWidth = box.closest(".markweave-editor-surface")?.getBoundingClientRect().width ?? box.parentElement?.getBoundingClientRect().width ?? startWidth;

    const move = (moveEvent: PointerEvent) => {
      const delta = side === "right" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      updateAttributes({ width: clampMarkweaveImageWidth(startWidth + delta, surfaceWidth) });
    };

    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  return (
    <NodeViewWrapper
      as="figure"
      className="markweave-image-node"
      data-testid="markweave-image-node"
      data-align={align}
      data-selected={canEditImage && selected ? "true" : "false"}
      data-hovered={canEditImage && hovered ? "true" : "false"}
      data-empty={showPlaceholder ? "true" : "false"}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onMouseDown={(event: ReactMouseEvent<HTMLElement>) => {
        if (canEditImage && !isImageUiEventTarget(event.target)) {
          selectImageNode();
        }
      }}
    >
      {showPlaceholder ? (
        <ImageUploadPlaceholder
          dragActive={dragActive}
          error={error}
          inputValue={inputValue}
          isSubmitting={isSubmitting}
          fileInputRef={fileInputRef}
          messages={messages}
          onCancel={closePlaceholder}
          onDrop={handleDrop}
          onDragActiveChange={setDragActive}
          onFileChange={handleFileChange}
          onInputChange={setInputValue}
          onSubmit={submitInputValue}
        />
      ) : (
        <>
          {canEditImage ? (
            <ImageToolbar
              align={align}
              captionActive={captionOpen || Boolean(caption)}
              messages={messages}
              onAlign={(nextAlign) => updateAttributes({ align: nextAlign })}
              onCaption={toggleCaption}
              onDelete={deleteNode}
              onDownload={() => {
                if (src) {
                  downloadMarkweaveImage(src);
                }
              }}
              onReplace={() => {
                setInputValue("");
                setError(null);
                setReplacing(true);
              }}
            />
          ) : null}
          <div className="markweave-image-box" ref={imageBoxRef} style={width ? { width: `${width}px` } : undefined}>
            {src ? (
              <img className="markweave-image" src={src} alt={stringAttribute(node.attrs.alt) ?? ""} title={stringAttribute(node.attrs.title) ?? undefined} draggable={false} />
            ) : (
              <div className="markweave-image-readonly-empty" data-testid="markweave-image-readonly-empty" aria-hidden="true" />
            )}
            {canEditImage ? <ResizeHandle side="left" messages={messages} onPointerDown={beginResize} /> : null}
            {canEditImage ? <ResizeHandle side="right" messages={messages} onPointerDown={beginResize} /> : null}
          </div>
          {canEditImage && (captionOpen || caption) ? (
            <input
              className="markweave-image-caption-input"
              data-markweave-image-ui="true"
              data-testid="markweave-image-caption-input"
              value={captionValue}
              placeholder={imageMessages.captionPlaceholder}
              aria-label={imageMessages.captionAriaLabel}
              onChange={(event) => updateCaption(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setCaptionOpen(false);
                }
              }}
            />
          ) : caption ? (
            <figcaption className="markweave-image-caption" data-testid="markweave-image-caption">
              {caption}
            </figcaption>
          ) : null}
        </>
      )}
    </NodeViewWrapper>
  );
}

function ImageUploadPlaceholder({
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
  const imageMessages = messages.image;

  return (
    <section
      className="markweave-image-upload-placeholder"
      data-testid="markweave-image-upload-placeholder"
      data-drag-active={dragActive ? "true" : "false"}
      data-markweave-image-ui="true"
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
      <input ref={fileInputRef} data-testid="markweave-image-file-input" type="file" accept="image/*" hidden onChange={onFileChange} />
      <div className="markweave-image-upload-icon" aria-hidden="true">
        <ImageUp size={46} strokeWidth={1.6} />
      </div>
      <div className="markweave-image-upload-copy">
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          {imageMessages.clickToUpload}
        </button>
        <span>{imageMessages.dragAndDrop}</span>
      </div>
      <div className="markweave-image-upload-note">{imageMessages.uploadNote}</div>
      <div className="markweave-image-upload-row">
        <input
          data-testid="markweave-image-url-input"
          value={inputValue}
          placeholder={imageMessages.uploadInputPlaceholder}
          aria-label={imageMessages.uploadInputAriaLabel}
          onChange={(event) => onInputChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <button type="button" data-testid="markweave-image-upload-submit" disabled={isSubmitting || !inputValue.trim()} onClick={onSubmit}>
          <ImageUp size={16} strokeWidth={1.8} />
          {messages.common.insert}
        </button>
        <button type="button" data-testid="markweave-image-upload-cancel" onClick={onCancel}>
          {messages.common.cancel}
        </button>
      </div>
      {error ? <div className="markweave-image-upload-error">{error}</div> : null}
    </section>
  );
}

function ImageToolbar({
  align,
  captionActive,
  messages,
  onAlign,
  onCaption,
  onDelete,
  onDownload,
  onReplace,
}: {
  readonly align: MarkweaveImageAlign;
  readonly captionActive: boolean;
  readonly messages: MarkweaveMessages;
  readonly onAlign: (align: MarkweaveImageAlign) => void;
  readonly onCaption: () => void;
  readonly onDelete: () => void;
  readonly onDownload: () => void;
  readonly onReplace: () => void;
}) {
  const imageMessages = messages.image;

  return (
    <div className="markweave-image-toolbar" data-testid="markweave-image-toolbar" data-markweave-image-ui="true" aria-label={imageMessages.toolsAriaLabel}>
      <ToolbarButton testId="markweave-image-align-left" label={imageMessages.alignLeft} icon={AlignLeft} active={align === "left"} onClick={() => onAlign("left")} />
      <ToolbarButton testId="markweave-image-align-center" label={imageMessages.alignCenter} icon={AlignCenter} active={align === "center"} onClick={() => onAlign("center")} />
      <ToolbarButton testId="markweave-image-align-right" label={imageMessages.alignRight} icon={AlignRight} active={align === "right"} onClick={() => onAlign("right")} />
      <span className="markweave-image-toolbar-divider" aria-hidden="true" />
      <ToolbarButton testId="markweave-image-caption" label={imageMessages.caption} icon={Captions} active={captionActive} onClick={onCaption} />
      <ToolbarButton testId="markweave-image-download" label={imageMessages.download} icon={Download} onClick={onDownload} />
      <ToolbarButton testId="markweave-image-replace" label={imageMessages.replace} icon={Replace} onClick={onReplace} />
      <span className="markweave-image-toolbar-divider" aria-hidden="true" />
      <ToolbarButton testId="markweave-image-delete" label={imageMessages.delete} icon={Trash2} onClick={onDelete} />
    </div>
  );
}

function ToolbarButton({
  active = false,
  icon: Icon,
  label,
  onClick,
  testId,
}: {
  readonly active?: boolean;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onClick: () => void;
  readonly testId: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      data-active={active ? "true" : "false"}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Icon size={20} strokeWidth={1.8} />
      <span className="markweave-image-tooltip" role="tooltip">
        {label}
      </span>
    </button>
  );
}

function ResizeHandle({
  messages,
  onPointerDown,
  side,
}: {
  readonly messages: MarkweaveMessages;
  readonly onPointerDown: (side: "left" | "right", event: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly side: "left" | "right";
}) {
  return (
    <button
      type="button"
      className="markweave-image-resize-handle"
      data-testid={`markweave-image-resize-${side}`}
      data-side={side}
      data-markweave-image-ui="true"
      aria-label={side === "left" ? messages.image.resizeLeft : messages.image.resizeRight}
      onPointerDown={(event) => onPointerDown(side, event)}
    />
  );
}

export const MarkweaveImage = MarkweaveCoreImage.extend<MarkweaveImageOptions>({
  addOptions() {
    return {
      ...(this.parent?.() as ImageOptions),
      messages: getMarkweaveMessages("zh"),
      onUpload: undefined,
    };
  },

  addNodeView() {
    if (typeof document === "undefined") {
      return null;
    }

    return ReactNodeViewRenderer(MarkweaveImageNodeView, {
      stopEvent: ({ event }) => isImageUiEventTarget(event.target),
    });
  },
});
