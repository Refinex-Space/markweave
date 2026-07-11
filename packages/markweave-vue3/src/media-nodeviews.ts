import { type Editor, type NodeViewProps } from "@tiptap/core";
import type { ImageOptions } from "@tiptap/extension-image";
import { NodeViewWrapper, VueNodeViewRenderer } from "@tiptap/vue-3";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Captions,
  Download,
  Eye,
  ImageUp,
  Replace,
  Link2,
  PencilLine,
  Trash2,
  Upload,
  Video as VideoIcon,
} from "lucide-vue-next";
import { computed, defineComponent, h, onBeforeUnmount, ref, watch, type Component } from "vue";
import { getMarkweaveEditorModeState, isMarkweaveEditorLiveEditable, subscribeToMarkweaveEditorMode } from "markweave/internal/core/editor-mode-state";
import { getMarkweaveMessages, type MarkweaveMessages } from "markweave/internal/i18n";
import { MarkweaveLinkCard, type MarkweaveLinkCardExtensionOptions } from "markweave/internal/plugins/link-card/link-card-node";
import { openMarkweaveLinkCardComposer } from "markweave/internal/plugins/link-card/link-card-composer";
import { normalizeMarkweaveLinkCardAttrs, normalizeMarkweaveLinkCardHref, replaceMarkweaveLinkCardWithLink, type MarkweaveLinkCardResolver } from "markweave/internal/plugins/link-card/link-card";
import { openMarkweaveImagePreview } from "markweave/internal/plugins/media/image-preview";
import {
  attrsFromMarkweaveImageUploadResult,
  attrsFromMarkweaveVideoUploadResult,
  attrsFromMarkweaveVideoUrl,
  clampMarkweaveImageWidth,
  createMarkweaveImageUploadRequest,
  createMarkweaveVideoUploadRequest,
  downloadMarkweaveImage,
  markweaveVideoIframeAllow,
  MarkweaveCoreImage,
  MarkweaveCoreVideo,
  normalizeMarkweaveVideoEmbedUrl,
  normalizeMarkweaveCoreImageAlign,
  numberAttribute,
  stringAttribute,
  type MarkweaveCoreImageAlign,
  type MarkweaveCoreVideoOptions,
  type MarkweaveCoreVideoProvider,
} from "markweave/internal/plugins/media/core-media-nodes";
import {
  detectUploadSource,
  resolveMarkweaveUploadResult,
  type MarkweaveSlashCommandUploadHandler,
  type MarkweaveUploadSource,
} from "markweave/internal/plugins/slash-command/upload";

export type MarkweaveVueImageAlign = MarkweaveCoreImageAlign;
export type MarkweaveVueVideoProvider = MarkweaveCoreVideoProvider;

export interface MarkweaveVueImageOptions extends ImageOptions {
  readonly messages?: MarkweaveMessages;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
}

export interface MarkweaveVueVideoOptions extends MarkweaveCoreVideoOptions {
  readonly messages?: MarkweaveMessages;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
}

export interface MarkweaveVueLinkCardOptions extends MarkweaveLinkCardExtensionOptions {
  readonly messages?: MarkweaveMessages;
  readonly resolver?: MarkweaveLinkCardResolver;
}

const normalizeImageAlign = normalizeMarkweaveCoreImageAlign;

function useVueEditorModeState(editor: Editor) {
  const frame = editor.view.dom.closest<HTMLElement>(".markweave-editor-frame");
  const readModeState = () => {
    const frameMode = frame?.getAttribute("data-markweave-mode");

    if (frameMode === "view") {
      return { mode: "view", editable: false } as const;
    }

    if (frameMode === "live") {
      return { mode: "live", editable: editor.isEditable } as const;
    }

    return getMarkweaveEditorModeState(editor);
  };
  const modeState = ref(readModeState());
  const unsubscribe = subscribeToMarkweaveEditorMode(editor, () => {
    modeState.value = readModeState();
  });
  const observer =
    typeof MutationObserver === "undefined" || !frame
      ? null
      : new MutationObserver(() => {
          modeState.value = readModeState();
        });

  if (observer && frame) {
    observer.observe(frame, { attributes: true, attributeFilter: ["data-markweave-mode"] });
  }

  onBeforeUnmount(() => {
    unsubscribe();
    observer?.disconnect();
  });

  return modeState;
}

function isImageUiEventTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-markweave-image-ui="true"]'));
}

function isVideoUiEventTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-markweave-video-ui="true"], iframe[data-markweave-video-embed], video[data-markweave-video]'));
}

function isLinkCardUiEventTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-markweave-link-card-ui="true"]'));
}

function icon(iconComponent: Component, label: string) {
  return h(iconComponent, { size: 18, strokeWidth: 1.8, "aria-hidden": "true" }, { default: () => label });
}

function createToolbarButton(options: {
  readonly testId: string;
  readonly label: string;
  readonly icon: Component;
  readonly onClick: () => void;
  readonly active?: boolean;
}) {
  return h(
    "button",
    {
      type: "button",
      "aria-label": options.label,
      title: options.label,
      "data-testid": options.testId,
      "data-active": options.active ? "true" : "false",
      onMousedown: (event: MouseEvent) => event.preventDefault(),
      onClick: options.onClick,
    },
    [icon(options.icon, options.label), h("span", { class: "markweave-image-tooltip", role: "tooltip" }, options.label)],
  );
}

function createImageUploadPlaceholder(options: {
  readonly messages: MarkweaveMessages;
  readonly inputValue: string;
  readonly error: string | null;
  readonly dragActive: boolean;
  readonly isSubmitting: boolean;
  readonly onInputValue: (value: string) => void;
  readonly onFile: (file: File) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly onDragActive: (active: boolean) => void;
}) {
  const fileInputRef = ref<HTMLInputElement | null>(null);
  const imageMessages = options.messages.image;

  return h(
    "section",
    {
      class: "markweave-image-upload-placeholder",
      "data-testid": "markweave-image-upload-placeholder",
      "data-drag-active": options.dragActive ? "true" : "false",
      "data-markweave-image-ui": "true",
      onDragenter: (event: DragEvent) => {
        event.preventDefault();
        options.onDragActive(true);
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
        "data-testid": "markweave-image-file-input",
        type: "file",
        accept: "image/*",
        hidden: true,
        onChange: (event: Event) => {
          const input = event.target as HTMLInputElement;
          const file = input.files?.[0];
          if (file) {
            options.onFile(file);
          }
          input.value = "";
        },
      }),
      h("div", { class: "markweave-image-upload-icon", "aria-hidden": "true" }, [h(ImageUp, { size: 46, strokeWidth: 1.6 })]),
      h("div", { class: "markweave-image-upload-copy" }, [
        h("button", { type: "button", onClick: () => fileInputRef.value?.click() }, imageMessages.clickToUpload),
        h("span", null, imageMessages.dragAndDrop),
      ]),
      h("div", { class: "markweave-image-upload-note" }, imageMessages.uploadNote),
      h("div", { class: "markweave-image-upload-row" }, [
        h("input", {
          "data-testid": "markweave-image-url-input",
          value: options.inputValue,
          placeholder: imageMessages.uploadInputPlaceholder,
          "aria-label": imageMessages.uploadInputAriaLabel,
          onInput: (event: Event) => options.onInputValue((event.target as HTMLInputElement).value),
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === "Enter") {
              event.preventDefault();
              options.onSubmit();
            }
          },
        }),
        h(
          "button",
          {
            type: "button",
            "data-testid": "markweave-image-upload-submit",
            disabled: options.isSubmitting || !options.inputValue.trim(),
            onClick: options.onSubmit,
          },
          [h(ImageUp, { size: 16, strokeWidth: 1.8 }), options.messages.common.insert],
        ),
        h("button", { type: "button", "data-testid": "markweave-image-upload-cancel", onClick: options.onCancel }, options.messages.common.cancel),
      ]),
      options.error ? h("div", { class: "markweave-image-upload-error", role: "alert" }, options.error) : null,
    ],
  );
}

function createVideoUploadPlaceholder(options: {
  readonly messages: MarkweaveMessages;
  readonly inputValue: string;
  readonly error: string | null;
  readonly dragActive: boolean;
  readonly isSubmitting: boolean;
  readonly onInputValue: (value: string) => void;
  readonly onFile: (file: File) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly onDragActive: (active: boolean) => void;
}) {
  const fileInputRef = ref<HTMLInputElement | null>(null);
  const videoMessages = options.messages.video;

  return h(
    "section",
    {
      class: "markweave-video-upload-placeholder",
      "data-testid": "markweave-video-upload-placeholder",
      "data-drag-active": options.dragActive ? "true" : "false",
      "data-markweave-video-ui": "true",
      onDragenter: (event: DragEvent) => {
        event.preventDefault();
        options.onDragActive(true);
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
        "data-testid": "markweave-video-file-input",
        type: "file",
        accept: "video/*",
        hidden: true,
        onChange: (event: Event) => {
          const input = event.target as HTMLInputElement;
          const file = input.files?.[0];
          if (file) {
            options.onFile(file);
          }
          input.value = "";
        },
      }),
      h("div", { class: "markweave-video-upload-icon", "aria-hidden": "true" }, [h(VideoIcon, { size: 46, strokeWidth: 1.6 })]),
      h("div", { class: "markweave-video-upload-copy" }, [
        h("button", { type: "button", onClick: () => fileInputRef.value?.click() }, videoMessages.clickToUpload),
        h("span", null, videoMessages.dragAndDrop),
      ]),
      h("div", { class: "markweave-video-upload-note" }, videoMessages.uploadNote),
      h("div", { class: "markweave-video-upload-row" }, [
        h("input", {
          "data-testid": "markweave-video-url-input",
          value: options.inputValue,
          placeholder: videoMessages.uploadInputPlaceholder,
          "aria-label": videoMessages.uploadInputAriaLabel,
          onInput: (event: Event) => options.onInputValue((event.target as HTMLInputElement).value),
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === "Enter") {
              event.preventDefault();
              options.onSubmit();
            }
          },
        }),
        h(
          "button",
          {
            type: "button",
            "data-testid": "markweave-video-upload-submit",
            disabled: options.isSubmitting || !options.inputValue.trim(),
            onClick: options.onSubmit,
          },
          [h(Upload, { size: 16, strokeWidth: 1.8 }), options.messages.common.insert],
        ),
        h("button", { type: "button", "data-testid": "markweave-video-upload-cancel", onClick: options.onCancel }, options.messages.common.cancel),
      ]),
      options.error ? h("div", { class: "markweave-video-upload-error", role: "alert" }, options.error) : null,
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
    const attrs = computed(() => (props.node as { attrs: Record<string, unknown> }).attrs);
    const captionOpen = ref(Boolean(stringAttribute(attrs.value.caption)));
    const captionValue = ref(stringAttribute(attrs.value.caption) ?? "");
    const modeState = useVueEditorModeState(props.editor as Editor);
    const canEdit = computed(() => isMarkweaveEditorLiveEditable(modeState.value));
    const allMessages = computed(() => (props.extension as { options?: MarkweaveVueImageOptions }).options?.messages ?? getMarkweaveMessages("zh"));
    const messages = computed(() => allMessages.value.image);
    const src = computed(() => stringAttribute(attrs.value.src));
    const align = computed(() => normalizeImageAlign(attrs.value.align));
    const width = computed(() => numberAttribute(attrs.value.width));
    const caption = computed(() => stringAttribute(attrs.value.caption));
    const showPlaceholder = computed(() => canEdit.value && (!src.value || replacing.value));
    const openPreview = () => {
      if (!src.value) return;
      openMarkweaveImagePreview({
        src: src.value,
        alt: stringAttribute(attrs.value.alt) ?? "",
        messages: {
          dialogAriaLabel: messages.value.previewDialogAriaLabel,
          zoomOut: messages.value.previewZoomOut,
          zoomIn: messages.value.previewZoomIn,
          reset: messages.value.previewReset,
          close: messages.value.previewClose,
        },
      });
    };

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
        const request = createMarkweaveImageUploadRequest(source, src.value && replacing.value ? "image-replace" : "image-insert");
        const result = await resolveMarkweaveUploadResult(request, options?.onUpload);
        props.updateAttributes(attrsFromMarkweaveImageUploadResult(attrs.value, result));
        inputValue.value = "";
        replacing.value = false;
      } catch (caught) {
        error.value = caught instanceof Error ? caught.message : messages.value.uploadFailedError;
      } finally {
        isSubmitting.value = false;
        dragActive.value = false;
      }
    };

    const submitInput = () => {
      if (!inputValue.value.trim()) {
        error.value = messages.value.uploadRequiredError;
        return;
      }
      void submitSource(detectUploadSource(inputValue.value));
    };

    const submitFile = (file: File) => {
      void submitSource({ type: "file", file, mimeType: file.type || "image/*" });
    };

    const toggleCaption = () => {
      captionOpen.value = !captionOpen.value;
      if (captionOpen.value) {
        captionValue.value = caption.value ?? "";
      }
    };

    const startResize = (side: "left" | "right", event: PointerEvent) => {
      if (!canEdit.value || !src.value) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      selectNode();

      const box = imageBoxRef.value;
      if (!box) {
        return;
      }

      const startX = event.clientX;
      const startWidth = box.getBoundingClientRect().width || width.value || 320;
      const surfaceWidth = box.closest(".markweave-editor-surface")?.getBoundingClientRect().width ?? box.parentElement?.getBoundingClientRect().width ?? startWidth;

      const onMove = (moveEvent: PointerEvent) => {
        const delta = side === "right" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
        props.updateAttributes({ width: clampMarkweaveImageWidth(startWidth + delta, surfaceWidth) });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    };

    return () => {
      if (showPlaceholder.value) {
        return h(
          NodeViewWrapper,
          {
            as: "figure",
            class: "markweave-image-node",
            "data-testid": "markweave-image-node",
            "data-align": align.value,
            "data-selected": "false",
            "data-hovered": "false",
            "data-empty": "true",
          },
          () =>
            createImageUploadPlaceholder({
              messages: allMessages.value,
              inputValue: inputValue.value,
              error: error.value,
              dragActive: dragActive.value,
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
          class: "markweave-image-node",
          "data-testid": "markweave-image-node",
          "data-align": align.value,
          "data-selected": canEdit.value && props.selected ? "true" : "false",
          "data-hovered": hovered.value ? "true" : "false",
          "data-empty": "false",
          onMouseenter: () => {
            hovered.value = true;
          },
          onMouseleave: () => {
            hovered.value = false;
          },
          onMousedown: (event: MouseEvent) => {
            if (canEdit.value && !isImageUiEventTarget(event.target)) {
              selectNode();
            }
          },
        },
        () => [
          canEdit.value
            ? h("div", { class: "markweave-image-toolbar", "data-testid": "markweave-image-toolbar", "data-markweave-image-ui": "true", "aria-label": messages.value.toolsAriaLabel }, [
                createToolbarButton({
                  testId: "markweave-image-align-left",
                  label: messages.value.alignLeft,
                  icon: AlignLeft,
                  active: align.value === "left",
                  onClick: () => props.updateAttributes({ align: "left" }),
                }),
                createToolbarButton({
                  testId: "markweave-image-align-center",
                  label: messages.value.alignCenter,
                  icon: AlignCenter,
                  active: align.value === "center",
                  onClick: () => props.updateAttributes({ align: "center" }),
                }),
                createToolbarButton({
                  testId: "markweave-image-align-right",
                  label: messages.value.alignRight,
                  icon: AlignRight,
                  active: align.value === "right",
                  onClick: () => props.updateAttributes({ align: "right" }),
                }),
                h("span", { class: "markweave-image-toolbar-divider", "aria-hidden": "true" }),
                createToolbarButton({
                  testId: "markweave-image-caption",
                  label: messages.value.caption,
                  icon: Captions,
                  active: captionOpen.value || Boolean(caption.value),
                  onClick: toggleCaption,
                }),
                createToolbarButton({ testId: "markweave-image-preview", label: messages.value.preview, icon: Eye, onClick: openPreview }),
                createToolbarButton({
                  testId: "markweave-image-download",
                  label: messages.value.download,
                  icon: Download,
                  onClick: () => {
                    if (src.value) {
                      downloadMarkweaveImage(src.value);
                    }
                  },
                }),
                createToolbarButton({
                  testId: "markweave-image-replace",
                  label: messages.value.replace,
                  icon: Replace,
                  onClick: () => {
                    inputValue.value = "";
                    error.value = null;
                    replacing.value = true;
                  },
                }),
                h("span", { class: "markweave-image-toolbar-divider", "aria-hidden": "true" }),
                createToolbarButton({ testId: "markweave-image-delete", label: messages.value.delete, icon: Trash2, onClick: () => props.deleteNode() }),
              ])
            : null,
          h(
            "div",
            {
              ref: imageBoxRef,
              class: "markweave-image-box",
              style: width.value ? { width: `${Math.round(width.value)}px` } : undefined,
            },
            [
              src.value
                ? h("img", {
                    class: "markweave-image",
                    src: src.value,
                    alt: stringAttribute(attrs.value.alt) ?? "",
                    title: stringAttribute(attrs.value.title) ?? undefined,
                    draggable: false,
                  })
                : h("div", { class: "markweave-image-readonly-empty", "data-testid": "markweave-image-readonly-empty", "aria-hidden": "true" }),
              !canEdit.value && src.value
                ? h(
                    "button",
                    {
                      type: "button",
                      class: "markweave-image-preview-trigger",
                      "data-testid": "markweave-image-preview",
                      "data-markweave-image-ui": "true",
                      "aria-label": messages.value.preview,
                      title: messages.value.preview,
                      onMousedown: (event: MouseEvent) => event.preventDefault(),
                      onClick: openPreview,
                    },
                    [h(Eye, { size: 16, strokeWidth: 1.8 }), h("span", { class: "markweave-image-tooltip", role: "tooltip" }, messages.value.preview)],
                  )
                : null,
              canEdit.value
                ? h("button", {
                    type: "button",
                    class: "markweave-image-resize-handle",
                    "data-testid": "markweave-image-resize-left",
                    "data-side": "left",
                    "aria-label": messages.value.resizeLeft,
                    "data-markweave-image-ui": "true",
                    onPointerdown: (event: PointerEvent) => startResize("left", event),
                  })
                : null,
              canEdit.value
                ? h("button", {
                    type: "button",
                    class: "markweave-image-resize-handle",
                    "data-testid": "markweave-image-resize-right",
                    "data-side": "right",
                    "aria-label": messages.value.resizeRight,
                    "data-markweave-image-ui": "true",
                    onPointerdown: (event: PointerEvent) => startResize("right", event),
                  })
                : null,
            ],
          ),
          canEdit.value && (captionOpen.value || caption.value)
            ? h("input", {
                class: "markweave-image-caption-input",
                "data-testid": "markweave-image-caption-input",
                "data-markweave-image-ui": "true",
                value: captionValue.value,
                placeholder: messages.value.captionPlaceholder,
                "aria-label": messages.value.captionAriaLabel,
                onInput: (event: Event) => {
                  captionValue.value = (event.target as HTMLInputElement).value;
                  props.updateAttributes({ caption: captionValue.value.trim() ? captionValue.value : null });
                },
                onKeydown: (event: KeyboardEvent) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    captionOpen.value = false;
                  }
                },
              })
            : caption.value
              ? h("figcaption", { class: "markweave-image-caption", "data-testid": "markweave-image-caption" }, caption.value)
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
    const modeState = useVueEditorModeState(props.editor as Editor);
    const canEdit = computed(() => isMarkweaveEditorLiveEditable(modeState.value));
    const allMessages = computed(() => (props.extension as { options?: MarkweaveVueVideoOptions }).options?.messages ?? getMarkweaveMessages("zh"));
    const messages = computed(() => allMessages.value.video);
    const attrs = computed(() => (props.node as { attrs: Record<string, unknown> }).attrs);
    const src = computed(() => stringAttribute(attrs.value.src));
    const embedUrl = computed(() => stringAttribute(attrs.value.embedUrl));
    const provider = computed(() => stringAttribute(attrs.value.provider));
    const safeEmbedUrl = computed(() => (embedUrl.value ? normalizeMarkweaveVideoEmbedUrl(embedUrl.value, provider.value) : null));
    const mimeType = computed(() => stringAttribute(attrs.value.mimeType));
    const title = computed(() => stringAttribute(attrs.value.title));

    const closePlaceholder = () => {
      if (!src.value) {
        props.deleteNode();
      }
      inputValue.value = "";
      error.value = null;
      dragActive.value = false;
    };

    const submitSource = async (source: MarkweaveUploadSource) => {
      if (!canEdit.value) {
        return;
      }

      const options = (props.extension as { options?: MarkweaveVueVideoOptions }).options;
      isSubmitting.value = true;
      error.value = null;
      try {
        const result = await resolveMarkweaveUploadResult(createMarkweaveVideoUploadRequest(source), options?.onUpload);
        props.updateAttributes(attrsFromMarkweaveVideoUploadResult(result));
        inputValue.value = "";
      } catch (caught) {
        error.value = caught instanceof Error ? caught.message : messages.value.uploadFailedError;
      } finally {
        isSubmitting.value = false;
        dragActive.value = false;
      }
    };

    const submitInput = () => {
      if (!canEdit.value) {
        return;
      }

      const attrsFromUrl = attrsFromMarkweaveVideoUrl(inputValue.value);
      if (!attrsFromUrl) {
        error.value = messages.value.unsupportedUrlError;
        return;
      }

      error.value = null;
      props.updateAttributes(attrsFromUrl);
      inputValue.value = "";
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

    const deleteSelectedVideo = (event: KeyboardEvent) => {
      if (canEdit.value && props.selected && (event.key === "Backspace" || event.key === "Delete")) {
        event.preventDefault();
        props.deleteNode();
      }
    };

    return () => {
      if (canEdit.value && !src.value) {
        return h(
          NodeViewWrapper,
          {
            as: "figure",
            class: "markweave-video-node",
            "data-testid": "markweave-video-node",
            "data-empty": "true",
            "data-selected": "false",
          },
          () =>
            createVideoUploadPlaceholder({
              messages: allMessages.value,
              inputValue: inputValue.value,
              error: error.value,
              dragActive: dragActive.value,
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
          "data-provider": provider.value ?? "file",
          "data-empty": src.value ? "false" : "true",
          "data-selected": canEdit.value && props.selected ? "true" : "false",
          "aria-label": messages.value.nodeAriaLabel,
          tabindex: canEdit.value ? 0 : undefined,
          onFocus: selectNode,
          onKeydown: deleteSelectedVideo,
          onMousedown: (event: MouseEvent) => {
            if (canEdit.value && !isVideoUiEventTarget(event.target)) {
              event.preventDefault();
              selectNode();
            }
          },
        },
        () => [
          safeEmbedUrl.value
            ? h("div", { class: "markweave-video-embed" }, [
                h("iframe", {
                  class: "markweave-video-iframe",
                  src: safeEmbedUrl.value,
                  title: title.value ?? `${provider.value ?? "Video"} embed`,
                  "data-markweave-video-embed": "true",
                  "data-markweave-video-provider": provider.value ?? undefined,
                  "data-markweave-video-src": src.value ?? undefined,
                  allow: markweaveVideoIframeAllow,
                  loading: "lazy",
                  allowfullscreen: "true",
                }),
                canEdit.value
                  ? h("button", {
                      type: "button",
                      class: "markweave-video-selection-layer",
                      "data-testid": "markweave-video-selection-layer",
                      tabindex: -1,
                      "aria-label": messages.value.selectAriaLabel,
                    })
                  : null,
              ])
            : src.value
              ? h("div", { class: "markweave-video-box" }, [
                  h("video", {
                    class: "markweave-video",
                    src: src.value,
                    title: title.value ?? undefined,
                    preload: "metadata",
                    controls: true,
                    "data-markweave-video": "true",
                    "data-markweave-mime-type": mimeType.value ?? undefined,
                  }),
                  canEdit.value
                    ? h("button", {
                        type: "button",
                        class: "markweave-video-selection-layer",
                        "data-testid": "markweave-video-selection-layer",
                        tabindex: -1,
                        "aria-label": messages.value.selectAriaLabel,
                      })
                    : null,
                ])
              : h("div", { class: "markweave-video-readonly-empty", "data-testid": "markweave-video-readonly-empty", "aria-hidden": "true" }),
        ],
      );
    };
  },
});

export const MarkweaveVueImage = MarkweaveCoreImage.extend<MarkweaveVueImageOptions>({
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

    return VueNodeViewRenderer(MarkweaveVueImageNodeView as unknown as Component<NodeViewProps>, {
      stopEvent: ({ event }) => isImageUiEventTarget(event.target),
    });
  },
});

export const MarkweaveVueVideo = MarkweaveCoreVideo.extend<MarkweaveVueVideoOptions>({
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

    return VueNodeViewRenderer(MarkweaveVueVideoNodeView as unknown as Component<NodeViewProps>, {
      stopEvent: ({ event }) => isVideoUiEventTarget(event.target),
    });
  },
});

const MarkweaveVueLinkCardNodeView = defineComponent({
  name: "MarkweaveVueLinkCardNodeView",
  props: { editor: { type: Object, required: true }, extension: { type: Object, required: true }, node: { type: Object, required: true }, getPos: { type: Function, required: true }, deleteNode: { type: Function, required: true }, updateAttributes: { type: Function, required: true }, selected: { type: Boolean, required: true } },
  setup(props) {
    const options = (props as unknown as { extension: { options: MarkweaveVueLinkCardOptions } }).extension?.options;
    const messages = options?.messages ?? getMarkweaveMessages("zh");
    const modeState = useVueEditorModeState(props.editor as Editor);
    const hovered = ref(false);
    const editing = ref(false);
    const imageFailed = ref(false);
    const attrs = computed(() => normalizeMarkweaveLinkCardAttrs((props.node as NodeViewProps["node"]).attrs ?? {}));
    const title = ref(attrs.value?.title ?? "");
    const href = ref(attrs.value?.href ?? "");
    watch(attrs, (value) => {
      title.value = value?.title ?? "";
      href.value = value?.href ?? "";
      imageFailed.value = false;
    });
    const editable = computed(() => isMarkweaveEditorLiveEditable(modeState.value));
    const host = computed(() => {
      try { return new URL(attrs.value?.href ?? "").host; } catch { return attrs.value?.href ?? ""; }
    });
    const prevent = (event: MouseEvent) => event.preventDefault();
    const open = (event: MouseEvent) => {
      if (isLinkCardUiEventTarget(event.target)) return;
      event.preventDefault();
      if (attrs.value?.href) window.open(attrs.value.href, "_blank", "noopener,noreferrer");
    };
    const copyText = (value: string) => void navigator.clipboard?.writeText?.(value);
    const convert = () => {
      const pos = (props.getPos as () => number)();
      replaceMarkweaveLinkCardWithLink(props.editor as Editor, pos);
    };
    const submit = async (event: Event) => {
      event.preventDefault();
      const next = normalizeMarkweaveLinkCardAttrs({ ...attrs.value, title: title.value, href: href.value });
      if (!next) return;
      (props.updateAttributes as (attrs: object) => void)(next);
      editing.value = false;
      const metadata = await options?.resolver?.({ href: next.href, title: next.title, signal: new AbortController().signal }).catch(() => null);
      if (metadata) (props.updateAttributes as (attrs: object) => void)(normalizeMarkweaveLinkCardAttrs({ ...next, ...metadata }) ?? next);
    };
    const cardButton = (label: string, iconComponent: Component, testId: string, action: (event: MouseEvent) => void) => h("button", { type: "button", title: label, "aria-label": label, "data-testid": testId, onMousedown: prevent, onClick: action }, [icon(iconComponent, label), h("span", { role: "tooltip" }, label)]);
    return () => {
      const value = attrs.value;
      if (!value) return null;
      const media = !imageFailed.value && value.imageUrl ? h("img", { src: value.imageUrl, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onError: () => { imageFailed.value = true; } }) : !imageFailed.value && value.faviconUrl ? h("img", { class: "markweave-link-card-favicon", src: value.faviconUrl, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onError: () => { imageFailed.value = true; } }) : h("b", null, host.value.slice(0, 1).toUpperCase());
      return h(NodeViewWrapper, { as: "article", class: "markweave-link-card", "data-testid": "markweave-link-card", "data-markweave-link-card": "true", "data-hovered": hovered.value ? "true" : "false", "data-selected": props.selected ? "true" : "false", onMouseenter: () => { hovered.value = true; }, onMouseleave: () => { hovered.value = false; }, onMousedown: (event: MouseEvent) => { if (!isLinkCardUiEventTarget(event.target)) event.preventDefault(); }, onClick: open }, () => [
        h("a", { class: "markweave-link-card-main", href: value.href, "aria-label": messages.linkCard.open }, [h("span", { class: "markweave-link-card-copy" }, [h("strong", null, value.title), value.description ? h("span", null, value.description) : null, h("small", null, value.siteName ?? host.value)]), h("span", { class: "markweave-link-card-media", "aria-hidden": "true" }, [media])]),
        editable.value && hovered.value ? h("div", { class: "markweave-link-card-tools", "data-markweave-link-card-ui": "true", "aria-label": messages.linkCard.toolsAriaLabel }, [cardButton(messages.linkCard.convertToLink, Link2, "markweave-link-card-convert", convert), cardButton(messages.linkCard.copyAddress, Download, "markweave-link-card-copy", () => copyText(value.href)), cardButton(messages.linkCard.edit, PencilLine, "markweave-link-card-edit", (event) => openMarkweaveLinkCardComposer({ anchor: event.currentTarget as HTMLElement, editor: props.editor as Editor, messages, resolver: options?.resolver, card: { pos: (props.getPos as () => number)(), attrs: value } })), cardButton(messages.linkCard.delete, Trash2, "markweave-link-card-delete", () => (props.deleteNode as () => void)())]) : null,
        editable.value && editing.value ? h("form", { class: "markweave-link-card-editor", "data-markweave-link-card-ui": "true", "data-testid": "markweave-link-card-editor", onSubmit: submit }, [h("label", null, [h("span", null, messages.linkCard.titleLabel), h("input", { value: title.value, placeholder: messages.linkCard.titlePlaceholder, "aria-label": messages.linkCard.titleLabel, onInput: (event: Event) => { title.value = (event.target as HTMLInputElement).value; } })]), h("label", null, [h("span", null, messages.linkCard.addressLabel), h("input", { value: href.value, placeholder: messages.linkCard.addressPlaceholder, "aria-label": messages.linkCard.addressLabel, onInput: (event: Event) => { href.value = (event.target as HTMLInputElement).value; } })]), h("button", { type: "submit", disabled: !normalizeMarkweaveLinkCardHref(href.value), "aria-label": messages.linkCard.edit }, [icon(Link2, messages.linkCard.edit)])]) : null,
      ]);
    };
  },
});

export const MarkweaveVueLinkCard = MarkweaveLinkCard.extend<MarkweaveVueLinkCardOptions>({
  addOptions() { return { ...(this.parent?.() as object), messages: getMarkweaveMessages("zh"), resolver: undefined }; },
  addNodeView() { return typeof document === "undefined" ? null : VueNodeViewRenderer(MarkweaveVueLinkCardNodeView as unknown as Component<NodeViewProps>, { stopEvent: ({ event }) => isLinkCardUiEventTarget(event.target) }); },
});
