import { mergeAttributes, type NodeViewProps } from "@tiptap/core";
import Image, { type ImageOptions } from "@tiptap/extension-image";
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
  type MarkweaveUploadRequest,
  type MarkweaveUploadResult,
  type MarkweaveUploadSource,
} from "../slash-command/upload";

export type MarkweaveImageAlign = "left" | "center" | "right";

export interface MarkweaveImageOptions extends ImageOptions {
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
}

const imageAlignments = new Set<MarkweaveImageAlign>(["left", "center", "right"]);

function stringAttribute(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberAttribute(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseDimension(value: string | null) {
  if (!value) {
    return null;
  }

  return numberAttribute(value.replace(/px$/i, ""));
}

function compactAttributes(attributes: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

export function normalizeMarkweaveImageAlign(value: unknown): MarkweaveImageAlign {
  return typeof value === "string" && imageAlignments.has(value as MarkweaveImageAlign) ? (value as MarkweaveImageAlign) : "center";
}

export function clampMarkweaveImageWidth(width: number, containerWidth: number) {
  const safeContainerWidth = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : 720;
  const minWidth = Math.min(safeContainerWidth, Math.max(120, safeContainerWidth * 0.2));
  return Math.round(Math.min(safeContainerWidth, Math.max(minWidth, width)));
}

function getImageFileName(src: string) {
  const cleanSrc = src.split(/[?#]/)[0] ?? "";
  const lastSegment = cleanSrc.split("/").filter(Boolean).at(-1);
  return lastSegment || "markweave-image";
}

export function downloadMarkweaveImage(src: string, ownerDocument: Document = document) {
  const trimmedSrc = src.trim();

  if (!trimmedSrc) {
    return false;
  }

  const anchor = ownerDocument.createElement("a");
  anchor.href = trimmedSrc;
  anchor.download = getImageFileName(trimmedSrc);
  anchor.rel = "noopener noreferrer";
  ownerDocument.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

function getImageAttrsFromElement(element: Element) {
  const imageElement = element.matches("img") ? element : element.querySelector("img");

  if (!(imageElement instanceof HTMLElement)) {
    return false;
  }

  const src = imageElement.getAttribute("src");
  if (!src) {
    return false;
  }

  const figure = imageElement.closest("figure[data-markweave-image]");
  const caption = figure?.querySelector("figcaption")?.textContent?.trim() || null;

  return {
    src,
    alt: imageElement.getAttribute("alt"),
    title: imageElement.getAttribute("title"),
    width: parseDimension(imageElement.getAttribute("width") ?? imageElement.style.width),
    height: parseDimension(imageElement.getAttribute("height") ?? imageElement.style.height),
    align: normalizeMarkweaveImageAlign(figure?.getAttribute("data-markweave-image-align") ?? imageElement.getAttribute("data-markweave-image-align")),
    caption,
  };
}

function attrsFromUploadResult(nodeAttrs: Record<string, unknown>, result: MarkweaveUploadResult) {
  return {
    src: result.src,
    alt: result.alt ?? result.name ?? stringAttribute(nodeAttrs.alt),
    title: result.title ?? stringAttribute(nodeAttrs.title),
    width: null,
    height: null,
  };
}

function createImageRequest(source: MarkweaveUploadSource, trigger: MarkweaveUploadRequest["trigger"]): MarkweaveUploadRequest {
  return {
    kind: "image",
    source,
    trigger,
  };
}

function isImageUiEventTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-markweave-image-ui="true"]'));
}

function MarkweaveImageNodeView(props: NodeViewProps) {
  const { deleteNode, editor, getPos, node, selected, updateAttributes } = props;
  const options = props.extension.options as MarkweaveImageOptions;
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
  const showPlaceholder = !src || replacing;

  useEffect(() => {
    if (!captionOpen) {
      setCaptionValue(caption ?? "");
    }
  }, [caption, captionOpen]);

  const selectImageNode = () => {
    const pos = getPos();

    if (typeof pos === "number") {
      editor.chain().focus().setNodeSelection(pos).run();
    }
  };

  const closePlaceholder = () => {
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
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await resolveMarkweaveUploadResult(createImageRequest(source, src && replacing ? "image-replace" : "image-insert"), options.onUpload);
      updateAttributes(attrsFromUploadResult(node.attrs, result));
      setReplacing(false);
      setInputValue("");
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : "Image upload failed.");
    } finally {
      setIsSubmitting(false);
      setDragActive(false);
    }
  };

  const submitInputValue = () => {
    if (!inputValue.trim()) {
      setError("Enter a URL, path, or Base64 value.");
      return;
    }

    void submitUploadSource(detectUploadSource(inputValue));
  };

  const submitFile = (file: File | null) => {
    if (!file) {
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
    submitFile(event.dataTransfer.files?.[0] ?? null);
  };

  const toggleCaption = () => {
    setCaptionOpen((value) => !value);
    if (!captionOpen) {
      setCaptionValue(caption ?? "");
    }
  };

  const updateCaption = (value: string) => {
    setCaptionValue(value);
    updateAttributes({ caption: value.trim() ? value : null });
  };

  const beginResize = (side: "left" | "right", event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
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
      data-selected={selected ? "true" : "false"}
      data-hovered={hovered ? "true" : "false"}
      data-empty={showPlaceholder ? "true" : "false"}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onMouseDown={(event: ReactMouseEvent<HTMLElement>) => {
        if (!isImageUiEventTarget(event.target)) {
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
          onCancel={closePlaceholder}
          onDrop={handleDrop}
          onDragActiveChange={setDragActive}
          onFileChange={handleFileChange}
          onInputChange={setInputValue}
          onSubmit={submitInputValue}
        />
      ) : (
        <>
          <ImageToolbar
            align={align}
            captionActive={captionOpen || Boolean(caption)}
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
          <div className="markweave-image-box" ref={imageBoxRef} style={width ? { width: `${width}px` } : undefined}>
            <img className="markweave-image" src={src ?? ""} alt={stringAttribute(node.attrs.alt) ?? ""} title={stringAttribute(node.attrs.title) ?? undefined} draggable={false} />
            <ResizeHandle side="left" onPointerDown={beginResize} />
            <ResizeHandle side="right" onPointerDown={beginResize} />
          </div>
          {captionOpen || caption ? (
            <input
              className="markweave-image-caption-input"
              data-markweave-image-ui="true"
              data-testid="markweave-image-caption-input"
              value={captionValue}
              placeholder="Write a caption..."
              aria-label="Image caption"
              onChange={(event) => updateCaption(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setCaptionOpen(false);
                }
              }}
            />
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
  readonly onCancel: () => void;
  readonly onDragActiveChange: (active: boolean) => void;
  readonly onDrop: (event: DragEvent<HTMLElement>) => void;
  readonly onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onInputChange: (value: string) => void;
  readonly onSubmit: () => void;
}) {
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
          Click to upload
        </button>
        <span> or drag and drop</span>
      </div>
      <div className="markweave-image-upload-note">URL, path, Base64, or one local image file</div>
      <div className="markweave-image-upload-row">
        <input
          data-testid="markweave-image-url-input"
          value={inputValue}
          placeholder="https://..., /path/file, data:..."
          aria-label="Image URL, path, or Base64"
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
          Insert
        </button>
        <button type="button" data-testid="markweave-image-upload-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error ? <div className="markweave-image-upload-error">{error}</div> : null}
    </section>
  );
}

function ImageToolbar({
  align,
  captionActive,
  onAlign,
  onCaption,
  onDelete,
  onDownload,
  onReplace,
}: {
  readonly align: MarkweaveImageAlign;
  readonly captionActive: boolean;
  readonly onAlign: (align: MarkweaveImageAlign) => void;
  readonly onCaption: () => void;
  readonly onDelete: () => void;
  readonly onDownload: () => void;
  readonly onReplace: () => void;
}) {
  return (
    <div className="markweave-image-toolbar" data-testid="markweave-image-toolbar" data-markweave-image-ui="true" aria-label="Image tools">
      <ToolbarButton testId="markweave-image-align-left" label="Image align left" icon={AlignLeft} active={align === "left"} onClick={() => onAlign("left")} />
      <ToolbarButton testId="markweave-image-align-center" label="Image align center" icon={AlignCenter} active={align === "center"} onClick={() => onAlign("center")} />
      <ToolbarButton testId="markweave-image-align-right" label="Image align right" icon={AlignRight} active={align === "right"} onClick={() => onAlign("right")} />
      <span className="markweave-image-toolbar-divider" aria-hidden="true" />
      <ToolbarButton testId="markweave-image-caption" label="Caption" icon={Captions} active={captionActive} onClick={onCaption} />
      <ToolbarButton testId="markweave-image-download" label="Download image" icon={Download} onClick={onDownload} />
      <ToolbarButton testId="markweave-image-replace" label="Replace image" icon={Replace} onClick={onReplace} />
      <span className="markweave-image-toolbar-divider" aria-hidden="true" />
      <ToolbarButton testId="markweave-image-delete" label="Delete image" icon={Trash2} onClick={onDelete} />
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
  onPointerDown,
  side,
}: {
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
      aria-label={`Resize image ${side}`}
      onPointerDown={(event) => onPointerDown(side, event)}
    />
  );
}

export const MarkweaveImage = Image.extend<MarkweaveImageOptions>({
  addOptions() {
    return {
      ...(this.parent?.() as ImageOptions),
      onUpload: undefined,
    };
  },

  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      align: {
        default: "center",
        parseHTML: (element: Element) =>
          normalizeMarkweaveImageAlign(element.closest("figure[data-markweave-image]")?.getAttribute("data-markweave-image-align") ?? element.getAttribute("data-markweave-image-align")),
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-markweave-image-align": normalizeMarkweaveImageAlign(attributes.align),
        }),
      },
      caption: {
        default: null,
        parseHTML: (element: Element) => element.closest("figure[data-markweave-image]")?.querySelector("figcaption")?.textContent?.trim() || null,
        renderHTML: () => ({}),
      },
      width: {
        default: null,
        parseHTML: (element: Element) => parseDimension(element.getAttribute("width") ?? (element instanceof HTMLElement ? element.style.width : null)),
        renderHTML: (attributes: Record<string, unknown>) => {
          const width = numberAttribute(attributes.width);
          return width ? { width: String(Math.round(width)) } : {};
        },
      },
      height: {
        default: null,
        parseHTML: (element: Element) => parseDimension(element.getAttribute("height") ?? (element instanceof HTMLElement ? element.style.height : null)),
        renderHTML: (attributes: Record<string, unknown>) => {
          const height = numberAttribute(attributes.height);
          return height ? { height: String(Math.round(height)) } : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-markweave-image]",
        getAttrs: (element) => {
          if (!(element instanceof Element)) {
            return false;
          }

          const attrs = getImageAttrsFromElement(element);
          if (!attrs || (!this.options.allowBase64 && attrs.src.startsWith("data:"))) {
            return false;
          }

          return attrs;
        },
      },
      {
        tag: this.options.allowBase64 ? "img[src]" : 'img[src]:not([src^="data:"])',
      },
    ];
  },

  renderHTML({ node }) {
    const src = stringAttribute(node.attrs.src);
    const align = normalizeMarkweaveImageAlign(node.attrs.align);
    const caption = stringAttribute(node.attrs.caption);
    const imageAttributes = mergeAttributes(
      this.options.HTMLAttributes,
      compactAttributes({
        src,
        alt: stringAttribute(node.attrs.alt),
        title: stringAttribute(node.attrs.title),
        width: numberAttribute(node.attrs.width) ? String(Math.round(numberAttribute(node.attrs.width) ?? 0)) : null,
        height: numberAttribute(node.attrs.height) ? String(Math.round(numberAttribute(node.attrs.height) ?? 0)) : null,
        "data-markweave-image-align": align,
      }),
    );

    if (!src) {
      return [
        "figure",
        {
          class: "markweave-image-figure",
          "data-markweave-image": "true",
          "data-markweave-image-empty": "true",
          "data-markweave-image-align": align,
        },
      ];
    }

    if (!caption) {
      return ["img", imageAttributes];
    }

    return [
      "figure",
      {
        class: "markweave-image-figure",
        "data-markweave-image": "true",
        "data-markweave-image-align": align,
      },
      ["img", imageAttributes],
      ["figcaption", { "data-markweave-image-caption": "true" }, caption],
    ];
  },

  addNodeView() {
    if (typeof document === "undefined") {
      return null;
    }

    return ReactNodeViewRenderer(MarkweaveImageNodeView, {
      stopEvent: ({ event }) => isImageUiEventTarget(event.target),
    });
  },

  addInputRules() {
    return [];
  },
});
