import { mergeAttributes, Node, type Editor, type NodeViewProps } from "@tiptap/core";
import Image, { type ImageOptions } from "@tiptap/extension-image";
import { NodeViewWrapper, VueNodeViewRenderer } from "@tiptap/vue-3";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Captions,
  Download,
  ImageUp,
  Replace,
  Trash2,
  Upload,
  Video as VideoIcon,
} from "lucide-vue-next";
import { computed, defineComponent, h, onBeforeUnmount, ref, watch, type Component } from "vue";
import { getMarkweaveEditorModeState, isMarkweaveEditorLiveEditable } from "../core/editor-mode-state";
import { getMarkweaveMessages, type MarkweaveMessages } from "../i18n";
import {
  detectUploadSource,
  resolveMarkweaveUploadResult,
  type MarkweaveSlashCommandUploadHandler,
  type MarkweaveUploadRequest,
  type MarkweaveUploadResult,
  type MarkweaveUploadSource,
} from "../plugins/slash-command/upload";

export type MarkweaveVueImageAlign = "left" | "center" | "right";
export type MarkweaveVueVideoProvider = "youtube" | "bilibili";

export interface MarkweaveVueImageOptions extends ImageOptions {
  readonly messages?: MarkweaveMessages;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
}

export interface MarkweaveVueVideoOptions {
  readonly HTMLAttributes: Record<string, unknown>;
  readonly messages?: MarkweaveMessages;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
}

const imageAlignments = new Set<MarkweaveVueImageAlign>(["left", "center", "right"]);
const videoFileUrlRegex = /\.(?:mp4|webm|ogg|mov|m4v)(?:[?#].*)?$/i;

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

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderHtmlAttributes(attributes: Record<string, unknown>) {
  return Object.entries(compactAttributes(attributes))
    .map(([key, value]) => `${key}="${escapeHtmlAttribute(String(value))}"`)
    .join(" ");
}

function normalizeImageAlign(value: unknown): MarkweaveVueImageAlign {
  return typeof value === "string" && imageAlignments.has(value as MarkweaveVueImageAlign) ? (value as MarkweaveVueImageAlign) : "center";
}

function clampImageWidth(width: number, containerWidth: number) {
  const safeContainerWidth = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : 720;
  const minWidth = Math.min(safeContainerWidth, Math.max(120, safeContainerWidth * 0.2));
  return Math.round(Math.min(safeContainerWidth, Math.max(minWidth, width)));
}

function getImageFileName(src: string) {
  const cleanSrc = src.split(/[?#]/)[0] ?? "";
  return cleanSrc.split("/").filter(Boolean).at(-1) || "markweave-image";
}

function downloadImage(src: string, ownerDocument: Document = document) {
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
  return {
    src,
    alt: imageElement.getAttribute("alt"),
    title: imageElement.getAttribute("title"),
    width: parseDimension(imageElement.getAttribute("width") ?? imageElement.style.width),
    height: parseDimension(imageElement.getAttribute("height") ?? imageElement.style.height),
    align: normalizeImageAlign(figure?.getAttribute("data-markweave-image-align") ?? imageElement.getAttribute("data-markweave-image-align")),
    caption: figure?.querySelector("figcaption")?.textContent?.trim() || null,
  };
}

function attrsFromImageUploadResult(nodeAttrs: Record<string, unknown>, result: MarkweaveUploadResult) {
  return {
    src: result.src,
    alt: result.alt ?? result.name ?? stringAttribute(nodeAttrs.alt),
    title: result.title ?? stringAttribute(nodeAttrs.title),
    width: null,
    height: null,
  };
}

function createImageRequest(source: MarkweaveUploadSource, trigger: MarkweaveUploadRequest["trigger"]): MarkweaveUploadRequest {
  return { kind: "image", source, trigger };
}

function isImageUiEventTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-markweave-image-ui="true"]'));
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

function firstMatchValue(url: URL, keys: readonly string[]) {
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value) {
      return value;
    }
  }

  return null;
}

function parseVideoEmbed(input: string): { readonly provider: MarkweaveVueVideoProvider; readonly embedUrl: string } | null {
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

function isDirectVideoUrl(input: string) {
  const url = normalizeVideoUrl(input);
  return Boolean(url && videoFileUrlRegex.test(url.href));
}

function attrsFromVideoUrl(url: string) {
  const embed = parseVideoEmbed(url);
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

function attrsFromVideoUploadResult(result: MarkweaveUploadResult) {
  return {
    src: result.src,
    embedUrl: null,
    provider: null,
    title: result.title ?? result.name,
    mimeType: result.mimeType,
  };
}

function createVideoRequest(source: MarkweaveUploadSource): MarkweaveUploadRequest {
  return { kind: "video", source, trigger: "video-insert" };
}

function getVideoAttrsFromElement(element: Element) {
  const src = stringAttribute(element.getAttribute("data-markweave-video-src") ?? element.getAttribute("src"));
  if (!src) {
    return false;
  }

  const attrsFromUrl = attrsFromVideoUrl(src);
  return {
    src,
    title: stringAttribute(element.getAttribute("title")),
    mimeType: stringAttribute(element.getAttribute("data-markweave-mime-type")),
    embedUrl: stringAttribute(element.getAttribute("src")) ?? attrsFromUrl?.embedUrl ?? null,
    provider: stringAttribute(element.getAttribute("data-markweave-video-provider")) ?? attrsFromUrl?.provider ?? null,
  };
}

function isVideoUiEventTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-markweave-video-ui="true"]'));
}

function icon(iconComponent: Component, label: string) {
  return h(iconComponent, { size: 18, strokeWidth: 1.8, "aria-hidden": "true" }, { default: () => label });
}

function createToolButton(label: string, iconComponent: Component, onClick: () => void, options: { active?: boolean; disabled?: boolean } = {}) {
  return h(
    "button",
    {
      type: "button",
      "aria-label": label,
      title: label,
      disabled: options.disabled,
      "data-active": options.active ? "true" : "false",
      onClick,
    },
    [icon(iconComponent, label)],
  );
}

function createUploadPlaceholder(options: {
  messages: MarkweaveMessages["image"] | MarkweaveMessages["video"];
  inputValue: string;
  error: string | null;
  dragActive: boolean;
  accept: string;
  isSubmitting: boolean;
  onInputValue: (value: string) => void;
  onFile: (file: File) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onDragActive: (active: boolean) => void;
}) {
  const fileInputRef = ref<HTMLInputElement | null>(null);

  return h(
    "div",
    {
      class: "markweave-media-placeholder",
      "data-drag-active": options.dragActive ? "true" : "false",
      "data-markweave-image-ui": "true",
      "data-markweave-video-ui": "true",
      onClick: (event: MouseEvent) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) {
          return;
        }
        fileInputRef.value?.click();
      },
      onDragover: (event: DragEvent) => {
        event.preventDefault();
        options.onDragActive(true);
      },
      onDragleave: () => options.onDragActive(false),
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        options.onDragActive(false);
        const file = event.dataTransfer?.files[0];
        if (file) {
          options.onFile(file);
        }
      },
    },
    [
      h("input", {
        ref: fileInputRef,
        type: "file",
        accept: options.accept,
        hidden: true,
        onChange: (event: Event) => {
          const file = (event.target as HTMLInputElement).files?.[0];
          if (file) {
            options.onFile(file);
          }
        },
      }),
      h("div", { class: "markweave-media-placeholder-icon", "aria-hidden": "true" }, [icon(ImageUp, "")]),
      h("div", { class: "markweave-media-placeholder-primary" }, [
        h("button", { type: "button", onClick: () => fileInputRef.value?.click() }, options.messages.clickToUpload),
        h("span", null, ` ${options.messages.dragAndDrop}`),
      ]),
      h("div", { class: "markweave-media-placeholder-note" }, options.messages.uploadNote),
      h("div", { class: "markweave-media-placeholder-form" }, [
        h("input", {
          value: options.inputValue,
          placeholder: options.messages.uploadInputPlaceholder,
          "aria-label": options.messages.uploadInputAriaLabel,
          onInput: (event: Event) => options.onInputValue((event.target as HTMLInputElement).value),
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === "Enter") {
              event.preventDefault();
              options.onSubmit();
            }
          },
        }),
        h("button", { type: "button", disabled: options.isSubmitting, onClick: options.onSubmit }, options.messages === (options.messages as MarkweaveMessages["image"]) ? "Insert" : "Insert"),
        h("button", { type: "button", onClick: options.onCancel }, "Cancel"),
      ]),
      options.error ? h("div", { class: "markweave-media-placeholder-error", role: "alert" }, options.error) : null,
    ],
  );
}

const MarkweaveVueImageNodeView = defineComponent({
  name: "MarkweaveVueImageNodeView",
  props: {
    editor: { type: Object, required: true },
    node: { type: Object, required: true },
    selected: { type: Boolean, required: true },
    extension: { type: Object, required: true },
    getPos: { type: Function, required: true },
    updateAttributes: { type: Function, required: true },
    deleteNode: { type: Function, required: true },
  },
  setup(props) {
    const imageBoxRef = ref<HTMLElement | null>(null);
    const hovered = ref(false);
    const replacing = ref(false);
    const dragActive = ref(false);
    const inputValue = ref("");
    const error = ref<string | null>(null);
    const isSubmitting = ref(false);
    const captionOpen = ref(Boolean(stringAttribute((props.node as { attrs: Record<string, unknown> }).attrs.caption)));
    const captionValue = ref(stringAttribute((props.node as { attrs: Record<string, unknown> }).attrs.caption) ?? "");
    const modeState = computed(() => getMarkweaveEditorModeState(props.editor as never));
    const canEdit = computed(() => isMarkweaveEditorLiveEditable(modeState.value));
    const messages = computed(() => ((props.extension as { options?: MarkweaveVueImageOptions }).options?.messages ?? getMarkweaveMessages("zh")).image);
    const src = computed(() => stringAttribute((props.node as { attrs: Record<string, unknown> }).attrs.src));
    const align = computed(() => normalizeImageAlign((props.node as { attrs: Record<string, unknown> }).attrs.align));
    const width = computed(() => numberAttribute((props.node as { attrs: Record<string, unknown> }).attrs.width));
    const caption = computed(() => stringAttribute((props.node as { attrs: Record<string, unknown> }).attrs.caption));
    const showPlaceholder = computed(() => canEdit.value && (!src.value || replacing.value));

    watch(caption, (nextCaption) => {
      if (!captionOpen.value) {
        captionValue.value = nextCaption ?? "";
      }
    });

    const selectNode = () => {
      if (!canEdit.value) {
        return;
      }

      const pos = props.getPos();
      if (typeof pos === "number") {
        (props.editor as Editor).chain().focus().setNodeSelection(pos).run();
      }
    };

    const closePlaceholder = () => {
      inputValue.value = "";
      error.value = null;
      dragActive.value = false;
      if (src.value) {
        replacing.value = false;
        return;
      }
      props.deleteNode();
    };

    const submitSource = async (source: MarkweaveUploadSource) => {
      if (!canEdit.value) {
        return;
      }

      const options = (props.extension as { options?: MarkweaveVueImageOptions }).options;
      isSubmitting.value = true;
      error.value = null;
      try {
        const request = createImageRequest(source, src.value ? "image-replace" : "image-insert");
        const result = await resolveMarkweaveUploadResult(request, options?.onUpload);
        props.updateAttributes(attrsFromImageUploadResult((props.node as { attrs: Record<string, unknown> }).attrs, result));
        inputValue.value = "";
        replacing.value = false;
      } catch (caught) {
        error.value = caught instanceof Error ? caught.message : messages.value.uploadFailedError;
      } finally {
        isSubmitting.value = false;
      }
    };

    const submitInput = () => {
      const source = detectUploadSource(inputValue.value);
      if (!source) {
        error.value = messages.value.uploadRequiredError;
        return;
      }
      void submitSource(source);
    };

    const submitFile = (file: File) => {
      void submitSource({ type: "file", file, mimeType: file.type || "image/*" });
    };

    const startResize = (side: "left" | "right", event: PointerEvent) => {
      if (!canEdit.value || !src.value) {
        return;
      }

      event.preventDefault();
      const startX = event.clientX;
      const startWidth = width.value ?? imageBoxRef.value?.querySelector("img")?.getBoundingClientRect().width ?? 360;
      const surfaceWidth = ((props.editor as { view: { dom: HTMLElement } }).view.dom as HTMLElement).getBoundingClientRect().width;
      const onMove = (moveEvent: PointerEvent) => {
        const delta = side === "right" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
        props.updateAttributes({ width: clampImageWidth(startWidth + delta, surfaceWidth) });
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    };

    onBeforeUnmount(() => {
      // refinex: pointer listeners are removed on pointerup; this hook documents the ownership boundary.
    });

    return () => {
      if (showPlaceholder.value) {
        return h(NodeViewWrapper, { as: "figure", class: "markweave-image-node", "data-testid": "markweave-image-node", "data-empty": "true" }, () =>
          createUploadPlaceholder({
            messages: messages.value,
            inputValue: inputValue.value,
            error: error.value,
            dragActive: dragActive.value,
            accept: "image/*",
            isSubmitting: isSubmitting.value,
            onInputValue: (value) => {
              inputValue.value = value;
            },
            onFile: submitFile,
            onSubmit: submitInput,
            onCancel: closePlaceholder,
            onDragActive: (active) => {
              dragActive.value = active;
            },
          }),
        );
      }

      return h(
        NodeViewWrapper,
        {
          as: "figure",
          ref: imageBoxRef,
          class: "markweave-image-node",
          "data-testid": "markweave-image-node",
          "data-align": align.value,
          "data-selected": props.selected || hovered.value ? "true" : "false",
          onMouseenter: () => {
            hovered.value = true;
          },
          onMouseleave: () => {
            hovered.value = false;
          },
          onClick: selectNode,
        },
        () => [
          canEdit.value
            ? h("div", { class: "markweave-image-toolbar", "data-markweave-image-ui": "true", "aria-label": messages.value.toolsAriaLabel }, [
                createToolButton(messages.value.alignLeft, AlignLeft, () => props.updateAttributes({ align: "left" }), { active: align.value === "left" }),
                createToolButton(messages.value.alignCenter, AlignCenter, () => props.updateAttributes({ align: "center" }), { active: align.value === "center" }),
                createToolButton(messages.value.alignRight, AlignRight, () => props.updateAttributes({ align: "right" }), { active: align.value === "right" }),
                createToolButton(messages.value.caption, Captions, () => {
                  captionOpen.value = !captionOpen.value;
                }, { active: captionOpen.value }),
                createToolButton(messages.value.download, Download, () => src.value && downloadImage(src.value)),
                createToolButton(messages.value.replace, Replace, () => {
                  replacing.value = true;
                }),
                createToolButton(messages.value.delete, Trash2, () => props.deleteNode()),
              ])
            : null,
          canEdit.value
            ? [
                h("button", {
                  type: "button",
                  class: "markweave-image-resize-handle markweave-image-resize-handle-left",
                  "aria-label": messages.value.resizeLeft,
                  "data-markweave-image-ui": "true",
                  onPointerdown: (event: PointerEvent) => startResize("left", event),
                }),
                h("button", {
                  type: "button",
                  class: "markweave-image-resize-handle markweave-image-resize-handle-right",
                  "aria-label": messages.value.resizeRight,
                  "data-markweave-image-ui": "true",
                  onPointerdown: (event: PointerEvent) => startResize("right", event),
                }),
              ]
            : null,
          h("img", {
            class: "markweave-image",
            src: src.value,
            alt: stringAttribute((props.node as { attrs: Record<string, unknown> }).attrs.alt) ?? "",
            title: stringAttribute((props.node as { attrs: Record<string, unknown> }).attrs.title) ?? undefined,
            width: width.value ? String(Math.round(width.value)) : undefined,
            "data-markweave-image-align": align.value,
          }),
          captionOpen.value || caption.value
            ? h("figcaption", { "data-markweave-image-caption": "true", "data-markweave-image-ui": "true" }, [
                canEdit.value && captionOpen.value
                  ? h("input", {
                      value: captionValue.value,
                      placeholder: messages.value.captionPlaceholder,
                      "aria-label": messages.value.captionAriaLabel,
                      onInput: (event: Event) => {
                        captionValue.value = (event.target as HTMLInputElement).value;
                        props.updateAttributes({ caption: captionValue.value.trim() || null });
                      },
                    })
                  : caption.value,
              ])
            : null,
        ],
      );
    };
  },
});

const MarkweaveVueVideoNodeView = defineComponent({
  name: "MarkweaveVueVideoNodeView",
  props: {
    editor: { type: Object, required: true },
    node: { type: Object, required: true },
    selected: { type: Boolean, required: true },
    extension: { type: Object, required: true },
    getPos: { type: Function, required: true },
    updateAttributes: { type: Function, required: true },
    deleteNode: { type: Function, required: true },
  },
  setup(props) {
    const dragActive = ref(false);
    const inputValue = ref("");
    const error = ref<string | null>(null);
    const isSubmitting = ref(false);
    const modeState = computed(() => getMarkweaveEditorModeState(props.editor as never));
    const canEdit = computed(() => isMarkweaveEditorLiveEditable(modeState.value));
    const messages = computed(() => ((props.extension as { options?: MarkweaveVueVideoOptions }).options?.messages ?? getMarkweaveMessages("zh")).video);
    const attrs = computed(() => (props.node as { attrs: Record<string, unknown> }).attrs);
    const src = computed(() => stringAttribute(attrs.value.src));
    const embedUrl = computed(() => stringAttribute(attrs.value.embedUrl));
    const provider = computed(() => stringAttribute(attrs.value.provider));

    const closePlaceholder = () => {
      if (!src.value) {
        props.deleteNode();
      }
      inputValue.value = "";
      error.value = null;
    };

    const submitSource = async (source: MarkweaveUploadSource) => {
      const options = (props.extension as { options?: MarkweaveVueVideoOptions }).options;
      isSubmitting.value = true;
      error.value = null;
      try {
        const result = await resolveMarkweaveUploadResult(createVideoRequest(source), options?.onUpload);
        props.updateAttributes(attrsFromVideoUploadResult(result));
      } catch (caught) {
        error.value = caught instanceof Error ? caught.message : messages.value.uploadFailedError;
      } finally {
        isSubmitting.value = false;
      }
    };

    const submitInput = () => {
      const attrsFromUrl = attrsFromVideoUrl(inputValue.value);
      if (attrsFromUrl) {
        props.updateAttributes(attrsFromUrl);
        inputValue.value = "";
        return;
      }

      const source = detectUploadSource(inputValue.value);
      if (!source) {
        error.value = messages.value.unsupportedUrlError;
        return;
      }
      void submitSource(source);
    };

    const submitFile = (file: File) => {
      void submitSource({ type: "file", file, mimeType: file.type || "video/*" });
    };

    const selectNode = () => {
      if (!canEdit.value) {
        return;
      }
      const pos = props.getPos();
      if (typeof pos === "number") {
        (props.editor as Editor).chain().focus().setNodeSelection(pos).run();
      }
    };

    return () => {
      if (canEdit.value && !src.value) {
        return h(NodeViewWrapper, { as: "figure", class: "markweave-video-node", "data-testid": "markweave-video-node", "data-empty": "true" }, () =>
          createUploadPlaceholder({
            messages: messages.value,
            inputValue: inputValue.value,
            error: error.value,
            dragActive: dragActive.value,
            accept: "video/*",
            isSubmitting: isSubmitting.value,
            onInputValue: (value) => {
              inputValue.value = value;
            },
            onFile: submitFile,
            onSubmit: submitInput,
            onCancel: closePlaceholder,
            onDragActive: (active) => {
              dragActive.value = active;
            },
          }),
        );
      }

      return h(
        NodeViewWrapper,
        {
          as: "figure",
          class: "markweave-video-node",
          "data-testid": "markweave-video-node",
          "data-empty": src.value ? "false" : "true",
          "data-selected": props.selected ? "true" : "false",
          "aria-label": messages.value.nodeAriaLabel,
          tabindex: canEdit.value ? 0 : undefined,
          onClick: selectNode,
          onKeydown: (event: KeyboardEvent) => {
            if (canEdit.value && (event.key === "Backspace" || event.key === "Delete")) {
              event.preventDefault();
              props.deleteNode();
            }
          },
        },
        () => [
          canEdit.value
            ? h("button", {
                type: "button",
                class: "markweave-video-delete",
                "data-markweave-video-ui": "true",
                "aria-label": messages.value.selectAriaLabel,
                title: messages.value.selectAriaLabel,
                onClick: (event: MouseEvent) => {
                  event.stopPropagation();
                  props.deleteNode();
                },
              }, [icon(Trash2, messages.value.selectAriaLabel)])
            : null,
          embedUrl.value
            ? h("iframe", {
                class: "markweave-video-iframe",
                src: embedUrl.value,
                title: stringAttribute(attrs.value.title) ?? `${provider.value ?? "Video"} embed`,
                "data-markweave-video-embed": "true",
                "data-markweave-video-provider": provider.value,
                "data-markweave-video-src": src.value,
                allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
                allowfullscreen: "true",
              })
            : src.value
              ? h("video", {
                  class: "markweave-video",
                  src: src.value,
                  title: stringAttribute(attrs.value.title) ?? undefined,
                  controls: true,
                  "data-markweave-video": "true",
                  "data-markweave-mime-type": stringAttribute(attrs.value.mimeType) ?? undefined,
                })
              : h("div", { class: "markweave-video-empty" }, [icon(VideoIcon, messages.value.nodeAriaLabel)]),
        ],
      );
    };
  },
});

export const MarkweaveVueImage = Image.extend<MarkweaveVueImageOptions>({
  addOptions() {
    return {
      ...(this.parent?.() as ImageOptions),
      messages: getMarkweaveMessages("zh"),
      onUpload: undefined,
    };
  },

  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      align: {
        default: "center",
        parseHTML: (element: Element) =>
          normalizeImageAlign(element.closest("figure[data-markweave-image]")?.getAttribute("data-markweave-image-align") ?? element.getAttribute("data-markweave-image-align")),
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-markweave-image-align": normalizeImageAlign(attributes.align),
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
          return !attrs || (!this.options.allowBase64 && attrs.src.startsWith("data:")) ? false : attrs;
        },
      },
      {
        tag: this.options.allowBase64 ? "img[src]" : 'img[src]:not([src^="data:"])',
      },
    ];
  },

  renderHTML({ node }) {
    const src = stringAttribute(node.attrs.src);
    const align = normalizeImageAlign(node.attrs.align);
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
      return ["figure", { class: "markweave-image-figure", "data-markweave-image": "true", "data-markweave-image-empty": "true", "data-markweave-image-align": align }];
    }

    if (!caption) {
      return ["img", imageAttributes];
    }

    return ["figure", { class: "markweave-image-figure", "data-markweave-image": "true", "data-markweave-image-align": align }, ["img", imageAttributes], ["figcaption", { "data-markweave-image-caption": "true" }, caption]];
  },

  renderMarkdown: (node) => {
    const src = stringAttribute(node.attrs?.src);
    const alt = stringAttribute(node.attrs?.alt) ?? "";
    const title = stringAttribute(node.attrs?.title);
    const align = normalizeImageAlign(node.attrs?.align);
    const caption = stringAttribute(node.attrs?.caption);
    const width = numberAttribute(node.attrs?.width);
    const height = numberAttribute(node.attrs?.height);

    if (!src) {
      return `<figure class="markweave-image-figure" data-markweave-image="true" data-markweave-image-empty="true" data-markweave-image-align="${align}"></figure>`;
    }

    if (!caption && align === "center" && !width && !height) {
      return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
    }

    const figureAttrs = renderHtmlAttributes({ class: "markweave-image-figure", "data-markweave-image": "true", "data-markweave-image-align": align });
    const imageAttrs = renderHtmlAttributes({
      class: "markweave-image",
      src,
      alt,
      title,
      width: width ? String(Math.round(width)) : null,
      height: height ? String(Math.round(height)) : null,
      "data-markweave-image-align": align,
    });
    const captionHtml = caption ? `<figcaption data-markweave-image-caption="true">${escapeHtmlText(caption)}</figcaption>` : "";
    return `<figure ${figureAttrs}><img ${imageAttrs} />${captionHtml}</figure>`;
  },

  addNodeView() {
    if (typeof document === "undefined") {
      return null;
    }

    return VueNodeViewRenderer(MarkweaveVueImageNodeView as unknown as Component<NodeViewProps>, {
      stopEvent: ({ event }) => isImageUiEventTarget(event.target),
    });
  },

  addInputRules() {
    return [];
  },
});

export const MarkweaveVueVideo = Node.create<MarkweaveVueVideoOptions>({
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
      { tag: "iframe[data-markweave-video-embed]", getAttrs: (element) => (element instanceof Element ? getVideoAttrsFromElement(element) : false) },
      { tag: "video[data-markweave-video]", getAttrs: (element) => (element instanceof Element ? getVideoAttrsFromElement(element) : false) },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const src = stringAttribute(node.attrs.src);
    const embedUrl = stringAttribute(node.attrs.embedUrl);
    const provider = stringAttribute(node.attrs.provider);

    if (!src) {
      return ["figure", { class: "markweave-video-figure", "data-markweave-video-empty": "true" }];
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

    return VueNodeViewRenderer(MarkweaveVueVideoNodeView as unknown as Component<NodeViewProps>, {
      stopEvent: ({ event }) => isVideoUiEventTarget(event.target),
    });
  },
});
