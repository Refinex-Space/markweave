import { mergeAttributes, Node, type NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Upload, Video as VideoIcon } from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import {
  resolveMarkweaveUploadResult,
  type MarkweaveSlashCommandUploadHandler,
  type MarkweaveUploadRequest,
  type MarkweaveUploadResult,
  type MarkweaveUploadSource,
} from "../slash-command/upload";
import { getMarkweaveMessages, type MarkweaveMessages } from "../../i18n";
import { isMarkweaveEditorLiveEditable, useMarkweaveEditorModeState } from "../../react/editor-mode-state";

export type MarkweaveVideoProvider = "youtube" | "bilibili";

export interface MarkweaveVideoOptions {
  readonly HTMLAttributes: Record<string, unknown>;
  readonly messages?: MarkweaveMessages;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
}

export interface MarkweaveVideoEmbed {
  readonly provider: MarkweaveVideoProvider;
  readonly embedUrl: string;
}

const videoFileUrlRegex = /\.(?:mp4|webm|ogg|mov|m4v)(?:[?#].*)?$/i;

function stringAttribute(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeVideoUrl(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function toHttpsUrl(url: URL) {
  const nextUrl = new URL(url.href);
  nextUrl.protocol = "https:";
  return nextUrl.toString();
}

function compactAttributes(attributes: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderHtmlAttributes(attributes: Record<string, unknown>) {
  return Object.entries(compactAttributes(attributes))
    .map(([key, value]) => `${key}="${escapeHtmlAttribute(String(value))}"`)
    .join(" ");
}

function firstMatchValue(url: URL, keys: readonly string[]) {
  for (const key of keys) {
    const value = url.searchParams.get(key);

    if (value) {
      return value;
    }
  }

  return null;
}

export function parseMarkweaveVideoEmbed(input: string): MarkweaveVideoEmbed | null {
  const url = normalizeVideoUrl(input);

  if (!url) {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id ? { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(id)}` } : null;
  }

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (pathParts[0] === "embed" && pathParts[1]) {
      return { provider: "youtube", embedUrl: toHttpsUrl(url) };
    }

    const id = pathParts[0] === "shorts" ? pathParts[1] : url.searchParams.get("v");
    return id ? { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(id)}` } : null;
  }

  if (host === "player.bilibili.com" && url.pathname === "/player.html") {
    const hasVideoIdentity = ["aid", "bvid", "cid"].some((key) => url.searchParams.has(key));
    return hasVideoIdentity ? { provider: "bilibili", embedUrl: toHttpsUrl(url) } : null;
  }

  if (host.endsWith("bilibili.com")) {
    const bvid = firstMatchValue(url, ["bvid"]) ?? url.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1];
    const aid = firstMatchValue(url, ["aid"]) ?? url.pathname.match(/\/video\/av(\d+)/i)?.[1];
    const cid = firstMatchValue(url, ["cid"]);
    const page = firstMatchValue(url, ["p", "page"]);
    const params = new URLSearchParams();

    if (bvid) {
      params.set("bvid", bvid);
    } else if (aid) {
      params.set("aid", aid);
    }

    if (cid) {
      params.set("cid", cid);
    }

    if (page) {
      params.set("p", page);
    }

    const query = params.toString();
    return query ? { provider: "bilibili", embedUrl: `https://player.bilibili.com/player.html?${query}` } : null;
  }

  return null;
}

export function isDirectVideoUrl(input: string) {
  const url = normalizeVideoUrl(input);
  return Boolean(url && videoFileUrlRegex.test(url.href));
}

function attrsFromVideoUrl(url: string) {
  const embed = parseMarkweaveVideoEmbed(url);

  if (embed) {
    return {
      src: url.trim(),
      embedUrl: embed.embedUrl,
      provider: embed.provider,
      mimeType: null,
      title: null,
    };
  }

  if (!isDirectVideoUrl(url)) {
    return null;
  }

  return {
    src: url.trim(),
    embedUrl: null,
    provider: null,
    mimeType: null,
    title: url.trim().split("/").filter(Boolean).at(-1),
  };
}

function attrsFromUploadResult(result: MarkweaveUploadResult) {
  return {
    src: result.src,
    embedUrl: null,
    provider: null,
    title: result.title ?? result.name,
    mimeType: result.mimeType,
  };
}

function createVideoRequest(source: MarkweaveUploadSource): MarkweaveUploadRequest {
  return {
    kind: "video",
    source,
    trigger: "video-insert",
  };
}

function isVideoUiEventTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-markweave-video-ui="true"]'));
}

function getVideoAttrsFromElement(element: Element) {
  if (element.matches("iframe[data-markweave-video-embed]")) {
    const iframe = element as HTMLIFrameElement;
    return {
      src: stringAttribute(iframe.getAttribute("data-markweave-video-src")) ?? iframe.src,
      embedUrl: iframe.src,
      provider: stringAttribute(iframe.getAttribute("data-markweave-video-provider")),
      title: stringAttribute(iframe.getAttribute("title")),
      mimeType: null,
    };
  }

  if (element.matches("video[data-markweave-video]")) {
    const video = element as HTMLVideoElement;
    return {
      src: stringAttribute(video.getAttribute("src")),
      embedUrl: null,
      provider: null,
      title: stringAttribute(video.getAttribute("title")),
      mimeType: stringAttribute(video.getAttribute("data-markweave-mime-type")),
    };
  }

  return false;
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
      const result = await resolveMarkweaveUploadResult(createVideoRequest({ type: "file", file, mimeType: file.type }), options.onUpload);
      updateAttributes(attrsFromUploadResult(result));
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

    const attrs = attrsFromVideoUrl(inputValue);

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
      {embedUrl ? (
        <div className="markweave-video-embed">
          <iframe
            className="markweave-video-iframe"
            src={embedUrl}
            title={title ?? `${provider ?? "Video"} embed`}
            data-markweave-video-embed="true"
            data-markweave-video-provider={provider ?? undefined}
            data-markweave-video-src={src ?? undefined}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
          {canEditVideo ? <button type="button" className="markweave-video-selection-layer" data-testid="markweave-video-selection-layer" tabIndex={-1} aria-label={videoMessages.selectAriaLabel} /> : null}
        </div>
      ) : !src ? (
        <div className="markweave-video-readonly-empty" data-testid="markweave-video-readonly-empty" aria-hidden="true" />
      ) : (
        <div className="markweave-video-box">
          <video className="markweave-video" src={src} title={title ?? undefined} data-markweave-video="true" data-markweave-mime-type={mimeType ?? undefined} controls />
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

export const MarkweaveVideo = Node.create<MarkweaveVideoOptions>({
  name: "markweaveVideo",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      messages: getMarkweaveMessages("zh"),
      onUpload: undefined,
    };
  },

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => stringAttribute(element.getAttribute("src") ?? element.getAttribute("data-markweave-video-src")),
      },
      title: {
        default: null,
        parseHTML: (element) => stringAttribute(element.getAttribute("title")),
      },
      mimeType: {
        default: null,
        parseHTML: (element) => stringAttribute(element.getAttribute("data-markweave-mime-type")),
        renderHTML: (attributes) => (attributes.mimeType ? { "data-markweave-mime-type": attributes.mimeType } : {}),
      },
      embedUrl: {
        default: null,
        parseHTML: (element) => stringAttribute(element.getAttribute("src")),
        renderHTML: () => ({}),
      },
      provider: {
        default: null,
        parseHTML: (element) => stringAttribute(element.getAttribute("data-markweave-video-provider")),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "iframe[data-markweave-video-embed]",
        getAttrs: (element) => (element instanceof Element ? getVideoAttrsFromElement(element) : false),
      },
      {
        tag: "video[data-markweave-video]",
        getAttrs: (element) => (element instanceof Element ? getVideoAttrsFromElement(element) : false),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const src = stringAttribute(node.attrs.src);
    const embedUrl = stringAttribute(node.attrs.embedUrl);
    const provider = stringAttribute(node.attrs.provider);

    if (!src) {
      return [
        "figure",
        {
          class: "markweave-video-figure",
          "data-markweave-video-empty": "true",
        },
      ];
    }

    if (embedUrl) {
      return [
        "iframe",
        mergeAttributes(
          HTMLAttributes,
          compactAttributes({
            class: "markweave-video-iframe",
            src: embedUrl,
            title: stringAttribute(node.attrs.title) ?? `${provider ?? "Video"} embed`,
            "data-markweave-video-embed": "true",
            "data-markweave-video-provider": provider,
            "data-markweave-video-src": src,
            allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
            allowfullscreen: "true",
          }),
        ),
      ];
    }

    return [
      "video",
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        compactAttributes({
          class: "markweave-video",
          src,
          title: stringAttribute(node.attrs.title),
          controls: "",
          "data-markweave-video": "true",
          "data-markweave-mime-type": stringAttribute(node.attrs.mimeType),
        }),
      ),
    ];
  },

  renderMarkdown: (node) => {
    const src = stringAttribute(node.attrs?.src);
    const embedUrl = stringAttribute(node.attrs?.embedUrl);
    const provider = stringAttribute(node.attrs?.provider);

    if (!src) {
      return '<figure class="markweave-video-figure" data-markweave-video-empty="true"></figure>';
    }

    if (embedUrl) {
      return `<iframe ${renderHtmlAttributes({
        class: "markweave-video-iframe",
        src: embedUrl,
        title: stringAttribute(node.attrs?.title) ?? `${provider ?? "Video"} embed`,
        "data-markweave-video-embed": "true",
        "data-markweave-video-provider": provider,
        "data-markweave-video-src": src,
        allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
        allowfullscreen: "true",
      })}></iframe>`;
    }

    return `<video ${renderHtmlAttributes({
      class: "markweave-video",
      src,
      title: stringAttribute(node.attrs?.title),
      controls: "",
      "data-markweave-video": "true",
      "data-markweave-mime-type": stringAttribute(node.attrs?.mimeType),
    })}></video>`;
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
