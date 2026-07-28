import type { NodeViewRenderer, NodeViewRendererProps } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import type { NodeView } from "@tiptap/pm/view";
import type { MarkweaveMessages } from "../../i18n";
import {
  getMarkweaveEditorModeState,
  isMarkweaveEditorLiveEditable,
  subscribeToMarkweaveEditorMode,
} from "../../core/editor-mode-state";
import {
  attrsFromMarkweaveImageUploadResult,
  clampMarkweaveImageWidth,
  createMarkweaveImageUploadRequest,
  downloadMarkweaveImage,
  normalizeMarkweaveCoreImageAlign,
  numberAttribute,
  stringAttribute,
  type MarkweaveCoreImageAlign,
} from "./core-media-nodes";
import { openMarkweaveImagePreview } from "./image-preview";
import {
  resolveMarkweaveMediaSource,
  type MarkweaveMediaPriority,
  type MarkweaveMediaSourceResolver,
} from "./media-source";
import {
  resolveMarkweaveUploadResult,
  type MarkweaveSlashCommandUploadHandler,
} from "../slash-command/upload";

type LightweightImageToolbarIcon =
  | "alignCenter"
  | "alignLeft"
  | "alignRight"
  | "caption"
  | "delete"
  | "download"
  | "preview"
  | "replace";

type LightweightImageToolbarIconNode = readonly [
  "circle" | "path" | "rect",
  Readonly<Record<string, string>>,
];

const lightweightImageToolbarIcons = {
  alignCenter: [
    ["path", { d: "M21 5H3" }],
    ["path", { d: "M17 12H7" }],
    ["path", { d: "M19 19H5" }],
  ],
  alignLeft: [
    ["path", { d: "M21 5H3" }],
    ["path", { d: "M15 12H3" }],
    ["path", { d: "M17 19H3" }],
  ],
  alignRight: [
    ["path", { d: "M21 5H3" }],
    ["path", { d: "M21 12H9" }],
    ["path", { d: "M21 19H7" }],
  ],
  caption: [
    ["rect", { height: "14", rx: "2", ry: "2", width: "18", x: "3", y: "5" }],
    ["path", { d: "M7 15h4M15 15h2M7 11h2M13 11h4" }],
  ],
  delete: [
    ["path", { d: "M10 11v6" }],
    ["path", { d: "M14 11v6" }],
    ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" }],
    ["path", { d: "M3 6h18" }],
    ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }],
  ],
  download: [
    ["path", { d: "M12 15V3" }],
    ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }],
    ["path", { d: "m7 10 5 5 5-5" }],
  ],
  preview: [
    ["path", { d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" }],
    ["circle", { cx: "12", cy: "12", r: "3" }],
  ],
  replace: [
    ["path", { d: "M14 4a1 1 0 0 1 1-1" }],
    ["path", { d: "M15 10a1 1 0 0 1-1-1" }],
    ["path", { d: "M21 4a1 1 0 0 0-1-1" }],
    ["path", { d: "M21 9a1 1 0 0 1-1 1" }],
    ["path", { d: "m3 7 3 3 3-3" }],
    ["path", { d: "M6 10V5a2 2 0 0 1 2-2h2" }],
    ["rect", { height: "7", rx: "1", width: "7", x: "3", y: "14" }],
  ],
} satisfies Record<
  LightweightImageToolbarIcon,
  readonly LightweightImageToolbarIconNode[]
>;

export interface MarkweaveLightweightImageNodeViewOptions {
  readonly messages: MarkweaveMessages;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
  readonly resolveMediaSource: MarkweaveMediaSourceResolver;
}

interface MarkweaveViewportWakeCoordinator {
  readonly callbacks: Set<() => void>;
  readonly ownerWindow: Window;
  readonly wake: () => void;
}

const viewportWakeCoordinators = new WeakMap<
  Document,
  MarkweaveViewportWakeCoordinator
>();

function subscribeToMarkweaveViewportWake(
  ownerDocument: Document,
  callback: () => void,
) {
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow) {
    return () => undefined;
  }

  let coordinator = viewportWakeCoordinators.get(ownerDocument);
  if (!coordinator) {
    const callbacks = new Set<() => void>();
    const wake = () => callbacks.forEach((subscriber) => subscriber());
    coordinator = { callbacks, ownerWindow, wake };
    viewportWakeCoordinators.set(ownerDocument, coordinator);
    ownerWindow.addEventListener("focus", wake);
    ownerWindow.addEventListener("pageshow", wake);
    ownerDocument.addEventListener("visibilitychange", wake);
  }

  coordinator.callbacks.add(callback);
  return () => {
    const activeCoordinator = viewportWakeCoordinators.get(ownerDocument);
    if (!activeCoordinator) {
      return;
    }
    activeCoordinator.callbacks.delete(callback);
    if (activeCoordinator.callbacks.size) {
      return;
    }
    activeCoordinator.ownerWindow.removeEventListener(
      "focus",
      activeCoordinator.wake,
    );
    activeCoordinator.ownerWindow.removeEventListener(
      "pageshow",
      activeCoordinator.wake,
    );
    ownerDocument.removeEventListener(
      "visibilitychange",
      activeCoordinator.wake,
    );
    viewportWakeCoordinators.delete(ownerDocument);
  };
}

export function createMarkweaveLightweightImageNodeViewRenderer(
  options: MarkweaveLightweightImageNodeViewOptions,
): NodeViewRenderer {
  return (props) => new MarkweaveLightweightImageNodeView(props, options);
}

class MarkweaveLightweightImageNodeView implements NodeView {
  readonly dom: HTMLElement;

  private node: NodeViewRendererProps["node"];
  private readonly props: NodeViewRendererProps;
  private readonly options: MarkweaveLightweightImageNodeViewOptions;
  private readonly box: HTMLDivElement;
  private readonly image: HTMLImageElement;
  private readonly placeholder: HTMLDivElement;
  private readonly caption: HTMLElement;
  private readonly unsubscribeMode: () => void;
  private observer: IntersectionObserver | null = null;
  private resolveController: AbortController | null = null;
  private resolvingSource: string | null = null;
  private resolvingPriority: MarkweaveMediaPriority | null = null;
  private resolvedSource: string | null = null;
  private resolvedPriority: MarkweaveMediaPriority | null = null;
  private resolvedSrc: string | null = null;
  private mountCheckScheduled = false;
  private mountCheckTimer: number | null = null;
  private unsubscribeViewportWake: (() => void) | null = null;
  private previewTrigger: HTMLButtonElement | null = null;
  private toolbar: HTMLElement | null = null;
  private captionInput: HTMLInputElement | null = null;
  private captionButton: HTMLButtonElement | null = null;
  private captionOpen = false;
  private alignButtons: Partial<
    Record<MarkweaveCoreImageAlign, HTMLButtonElement>
  > = {};
  private resizeHandles: HTMLButtonElement[] = [];
  private stopResize: (() => void) | null = null;
  private destroyed = false;

  constructor(
    props: NodeViewRendererProps,
    options: MarkweaveLightweightImageNodeViewOptions,
  ) {
    this.props = props;
    this.node = props.node;
    this.options = options;
    this.dom = document.createElement("figure");
    this.dom.className = "markweave-image-node";
    this.dom.dataset.testid = "markweave-image-node";
    this.dom.dataset.markweaveLightweightImage = "true";

    this.box = document.createElement("div");
    this.box.className = "markweave-image-box";
    this.image = document.createElement("img");
    this.image.className = "markweave-image";
    this.image.setAttribute("loading", "lazy");
    this.image.setAttribute("decoding", "async");
    this.image.draggable = false;
    this.placeholder = document.createElement("div");
    this.placeholder.className = "markweave-image-readonly-empty";
    this.placeholder.setAttribute("aria-hidden", "true");
    this.caption = document.createElement("figcaption");
    this.caption.className = "markweave-image-caption";
    this.caption.dataset.testid = "markweave-image-caption";
    this.box.append(this.image, this.placeholder);
    this.dom.append(this.box, this.caption);

    this.dom.addEventListener("mousedown", this.handleMouseDown);
    this.dom.addEventListener("dblclick", this.handleDoubleClick);
    this.image.addEventListener("load", this.handleImageLoad);
    this.image.addEventListener("error", this.handleImageError);
    this.unsubscribeMode = subscribeToMarkweaveEditorMode(
      this.props.editor,
      () => this.syncPreviewTrigger(),
    );
    this.renderNodeAttributes();
    this.setMediaState("pending");
    this.captionOpen = Boolean(stringAttribute(this.node.attrs.caption));
    this.observeProximity();
    this.startViewportWakeListeners();
    this.scheduleMountedProximityCheck();
  }

  update(node: NodeViewRendererProps["node"]) {
    if (node.type !== this.node.type) {
      return false;
    }

    const previousSrc = stringAttribute(this.node.attrs.src);
    this.node = node;
    const nextSrc = stringAttribute(node.attrs.src);
    this.renderNodeAttributes();

    if (previousSrc !== nextSrc) {
      this.resolveController?.abort();
      this.resolvingSource = null;
      this.resolvingPriority = null;
      this.resolvedSource = null;
      this.resolvedPriority = null;
      this.resolvedSrc = null;
      this.image.removeAttribute("src");
      this.setMediaState("pending");
      this.startViewportWakeListeners();
      this.scheduleMountedProximityCheck();
    }

    return true;
  }

  selectNode() {
    this.dom.dataset.selected = "true";
    this.mountEditingControls();
    this.resolveSource("visible");
  }

  deselectNode() {
    this.dom.dataset.selected = "false";
    this.unmountEditingControls();
  }

  stopEvent(event: Event) {
    return (
      event.target instanceof Element &&
      Boolean(event.target.closest('[data-markweave-image-ui="true"]'))
    );
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.destroyed = true;
    this.resolveController?.abort();
    this.observer?.disconnect();
    this.clearMountedProximityCheck();
    this.stopViewportWakeListeners();
    this.unsubscribeMode();
    this.unmountEditingControls();
    this.previewTrigger?.remove();
    this.previewTrigger = null;
    this.dom.removeEventListener("mousedown", this.handleMouseDown);
    this.dom.removeEventListener("dblclick", this.handleDoubleClick);
    this.image.removeEventListener("load", this.handleImageLoad);
    this.image.removeEventListener("error", this.handleImageError);
  }

  private renderNodeAttributes() {
    const align = normalizeMarkweaveCoreImageAlign(this.node.attrs.align);
    const width = numberAttribute(this.node.attrs.width);
    const height = numberAttribute(this.node.attrs.height);
    const caption = stringAttribute(this.node.attrs.caption);
    this.dom.dataset.align = align;
    this.box.style.width = width ? `${width}px` : "";
    if (width && height) {
      this.box.style.aspectRatio = `${width} / ${height}`;
    }
    this.image.alt = stringAttribute(this.node.attrs.alt) ?? "";
    this.image.title = stringAttribute(this.node.attrs.title) ?? "";
    this.caption.textContent = caption ?? "";
    this.caption.hidden = !caption || Boolean(this.captionInput);
    if (this.captionInput && this.captionInput.value !== (caption ?? "")) {
      this.captionInput.value = caption ?? "";
    }
    for (const [buttonAlign, button] of Object.entries(this.alignButtons)) {
      button.dataset.active = buttonAlign === align ? "true" : "false";
    }
    if (this.captionButton) {
      this.captionButton.dataset.active =
        this.captionOpen || Boolean(caption) ? "true" : "false";
    }
  }

  private observeProximity() {
    if (typeof IntersectionObserver === "undefined") {
      this.resolveSource("visible");
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) {
          return;
        }

        const viewportHeight = entry.rootBounds?.height ?? window.innerHeight;
        const visible =
          entry.boundingClientRect.bottom >= 0 &&
          entry.boundingClientRect.top <= viewportHeight;
        this.resolveSource(visible ? "visible" : "nearby");
      },
      { rootMargin: "300% 0px" },
    );
    this.observer.observe(this.dom);
  }

  private scheduleMountedProximityCheck() {
    if (this.mountCheckScheduled || this.destroyed) {
      return;
    }

    this.mountCheckScheduled = true;
    void Promise.resolve().then(() => {
      this.mountCheckScheduled = false;
      if (this.destroyed) {
        return;
      }
      if (this.dom.isConnected) {
        this.resolveSourceIfNearViewport();
        return;
      }

      const ownerWindow = this.dom.ownerDocument.defaultView;
      if (ownerWindow) {
        this.mountCheckTimer = ownerWindow.setTimeout(() => {
          this.mountCheckTimer = null;
          this.resolveSourceIfNearViewport();
        }, 0);
      }
    });
  }

  private clearMountedProximityCheck() {
    if (this.mountCheckTimer === null) {
      return;
    }
    this.dom.ownerDocument.defaultView?.clearTimeout(this.mountCheckTimer);
    this.mountCheckTimer = null;
  }

  private resolveSourceIfNearViewport() {
    if (this.destroyed || !this.dom.isConnected) {
      return false;
    }

    const ownerWindow = this.dom.ownerDocument.defaultView;
    if (!ownerWindow) {
      this.resolveSource("visible");
      return true;
    }

    const viewportHeight = Math.max(
      this.dom.ownerDocument.documentElement.clientHeight,
      ownerWindow.innerHeight,
    );
    const bounds = this.dom.getBoundingClientRect();
    const nearMargin = viewportHeight * 3;
    if (
      bounds.bottom < -nearMargin ||
      bounds.top > viewportHeight + nearMargin
    ) {
      return false;
    }

    const visible = bounds.bottom >= 0 && bounds.top <= viewportHeight;
    this.resolveSource(visible ? "visible" : "nearby");
    return true;
  }

  private startViewportWakeListeners() {
    if (this.unsubscribeViewportWake) {
      return;
    }
    this.unsubscribeViewportWake = subscribeToMarkweaveViewportWake(
      this.dom.ownerDocument,
      this.handleViewportWake,
    );
  }

  private stopViewportWakeListeners() {
    this.unsubscribeViewportWake?.();
    this.unsubscribeViewportWake = null;
  }

  private resolveSource(priority: MarkweaveMediaPriority) {
    const src = stringAttribute(this.node.attrs.src);
    if (!src) {
      return;
    }
    if (
      this.resolvingSource === src &&
      this.resolveController &&
      !this.resolveController.signal.aborted &&
      (this.resolvingPriority === "visible" || priority === "nearby")
    ) {
      return;
    }
    if (
      this.resolvedSource === src &&
      (this.resolvedPriority === "visible" || priority === "nearby")
    ) {
      return;
    }

    this.resolveController?.abort();
    const controller = new AbortController();
    this.resolveController = controller;
    this.resolvingSource = src;
    this.resolvingPriority = priority;
    void resolveMarkweaveMediaSource(this.options.resolveMediaSource, {
      kind: "image",
      src,
      priority,
      signal: controller.signal,
    })
      .then((result) => {
        if (this.destroyed || controller.signal.aborted) {
          return;
        }
        if (!result) {
          this.setMediaState("missing");
          return;
        }

        this.resolvedSource = src;
        this.resolvedPriority = priority;
        this.resolvedSrc = result.src;
        if (result.width && result.height) {
          this.image.width = result.width;
          this.image.height = result.height;
          if (!this.box.style.aspectRatio) {
            this.box.style.aspectRatio = `${result.width} / ${result.height}`;
          }
        }
        this.setMediaState("pending");
        this.image.src = result.src;
        if (this.image.complete && this.image.naturalWidth > 0) {
          this.handleImageLoad();
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          this.setMediaState("unreadable");
        }
      })
      .finally(() => {
        if (this.resolveController === controller) {
          this.resolveController = null;
          this.resolvingSource = null;
          this.resolvingPriority = null;
        }
      });
  }

  private setMediaState(state: "pending" | "resolved" | "missing" | "unreadable") {
    this.dom.dataset.mediaState = state;
    if (state === "pending") {
      this.dom.setAttribute("aria-busy", "true");
    } else {
      this.dom.removeAttribute("aria-busy");
    }
    const resolved = state === "resolved";
    this.image.hidden = !resolved;
    this.placeholder.hidden = resolved;
    if (state !== "pending") {
      this.stopViewportWakeListeners();
    }
    this.syncPreviewTrigger();
  }

  private readonly handleViewportWake = () => {
    if (this.dom.ownerDocument.visibilityState === "hidden") {
      return;
    }
    this.resolveSourceIfNearViewport();
  };

  private readonly handleImageLoad = () => {
    if (
      this.resolvedSrc &&
      this.image.getAttribute("src") === this.resolvedSrc
    ) {
      this.setMediaState("resolved");
    }
  };

  private syncPreviewTrigger() {
    const modeState = getMarkweaveEditorModeState(this.props.editor);
    const shouldMount =
      this.dom.dataset.mediaState === "resolved" &&
      Boolean(this.resolvedSrc) &&
      !isMarkweaveEditorLiveEditable(modeState);

    if (!shouldMount) {
      this.previewTrigger?.remove();
      this.previewTrigger = null;
      return;
    }

    if (this.previewTrigger) {
      return;
    }

    const messages = this.options.messages.image;
    const previewTrigger = this.createButton(
      messages.preview,
      "preview",
      "markweave-image-preview",
      () => this.handleDoubleClick(),
    );
    previewTrigger.className = "markweave-image-preview-trigger";
    this.box.append(previewTrigger);
    this.previewTrigger = previewTrigger;
  }

  private readonly handleMouseDown = (event: MouseEvent) => {
    if (
      !this.props.editor.isEditable ||
      event.button !== 0 ||
      (event.target instanceof Element &&
        Boolean(event.target.closest('[data-markweave-image-ui="true"]')))
    ) {
      return;
    }
    const pos = this.props.getPos();
    if (typeof pos !== "number") {
      return;
    }
    event.preventDefault();
    this.props.view.dispatch(
      this.props.view.state.tr.setSelection(
        NodeSelection.create(this.props.view.state.doc, pos),
      ),
    );
    this.props.view.focus();
  };

  private readonly handleDoubleClick = () => {
    if (!this.resolvedSrc) {
      return;
    }
    const imageMessages = this.options.messages.image;
    openMarkweaveImagePreview({
      src: this.resolvedSrc,
      alt: this.image.alt,
      messages: {
        dialogAriaLabel: imageMessages.previewDialogAriaLabel,
        zoomOut: imageMessages.previewZoomOut,
        zoomIn: imageMessages.previewZoomIn,
        reset: imageMessages.previewReset,
        close: imageMessages.previewClose,
      },
    });
  };

  private readonly handleImageError = () => {
    this.setMediaState("unreadable");
  };

  private mountEditingControls() {
    this.mountToolbar();
    this.mountResizeHandles();
    if (this.captionOpen || stringAttribute(this.node.attrs.caption)) {
      this.mountCaptionInput();
    }
  }

  private unmountEditingControls() {
    this.stopResize?.();
    this.toolbar?.remove();
    this.toolbar = null;
    this.captionButton = null;
    this.alignButtons = {};
    this.resizeHandles.forEach((handle) => handle.remove());
    this.resizeHandles = [];
    this.unmountCaptionInput();
  }

  private mountToolbar() {
    if (this.toolbar || !this.props.editor.isEditable) {
      return;
    }

    const messages = this.options.messages.image;
    const toolbar = this.dom.ownerDocument.createElement("div");
    toolbar.className = "markweave-image-toolbar";
    toolbar.dataset.testid = "markweave-image-toolbar";
    toolbar.dataset.markweaveImageUi = "true";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", messages.toolsAriaLabel);
    const align = normalizeMarkweaveCoreImageAlign(this.node.attrs.align);
    const alignLeft = this.createButton(
      messages.alignLeft,
      "alignLeft",
      "markweave-image-align-left",
      () => this.updateAttributes({ align: "left" }),
      align === "left",
    );
    const alignCenter = this.createButton(
      messages.alignCenter,
      "alignCenter",
      "markweave-image-align-center",
      () => this.updateAttributes({ align: "center" }),
      align === "center",
    );
    const alignRight = this.createButton(
      messages.alignRight,
      "alignRight",
      "markweave-image-align-right",
      () => this.updateAttributes({ align: "right" }),
      align === "right",
    );
    this.alignButtons = {
      center: alignCenter,
      left: alignLeft,
      right: alignRight,
    };
    const caption = stringAttribute(this.node.attrs.caption);
    this.captionButton = this.createButton(
      messages.caption,
      "caption",
      "markweave-image-caption",
      () => this.toggleCaption(),
      this.captionOpen || Boolean(caption),
    );
    toolbar.append(
      alignLeft,
      alignCenter,
      alignRight,
      this.createToolbarDivider(),
      this.captionButton,
      this.createButton(
        messages.preview,
        "preview",
        "markweave-image-preview",
        () => this.handleDoubleClick(),
      ),
      this.createButton(
        messages.download,
        "download",
        "markweave-image-download",
        () => {
          if (this.resolvedSrc) {
            downloadMarkweaveImage(this.resolvedSrc, this.dom.ownerDocument);
          }
        },
      ),
    );

    const fileInput = this.dom.ownerDocument.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.hidden = true;
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (file) {
        void this.replaceImage(file);
      }
    });
    toolbar.append(
      this.createButton(
        messages.replace,
        "replace",
        "markweave-image-replace",
        () => fileInput.click(),
      ),
      this.createToolbarDivider(),
      this.createButton(
        messages.delete,
        "delete",
        "markweave-image-delete",
        () => this.deleteNode(),
      ),
      fileInput,
    );
    this.toolbar = toolbar;
    this.dom.prepend(toolbar);
  }

  private createToolbarDivider() {
    const divider = this.dom.ownerDocument.createElement("span");
    divider.className = "markweave-image-toolbar-divider";
    divider.setAttribute("aria-hidden", "true");
    return divider;
  }

  private createButton(
    label: string,
    icon: LightweightImageToolbarIcon,
    testId: string,
    action: () => void,
    active = false,
  ) {
    const button = this.dom.ownerDocument.createElement("button");
    button.type = "button";
    button.dataset.markweaveImageUi = "true";
    button.dataset.testid = testId;
    button.dataset.active = active ? "true" : "false";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.append(this.createToolbarIcon(icon));
    const tooltip = this.dom.ownerDocument.createElement("span");
    tooltip.className = "markweave-image-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = label;
    button.append(tooltip);
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", action);
    return button;
  }

  private createToolbarIcon(icon: LightweightImageToolbarIcon) {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = this.dom.ownerDocument.createElementNS(namespace, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    lightweightImageToolbarIcons[icon].forEach(([tagName, attributes]) => {
      const child = this.dom.ownerDocument.createElementNS(namespace, tagName);
      Object.entries(attributes).forEach(([name, value]) => {
        child.setAttribute(name, value);
      });
      svg.append(child);
    });
    return svg;
  }

  private toggleCaption() {
    if (this.captionInput) {
      this.captionOpen = false;
      this.unmountCaptionInput();
      return;
    }

    this.captionOpen = true;
    this.mountCaptionInput();
  }

  private mountCaptionInput() {
    if (this.captionInput || !this.props.editor.isEditable) {
      return;
    }

    const messages = this.options.messages.image;
    const input = this.dom.ownerDocument.createElement("input");
    input.className = "markweave-image-caption-input";
    input.dataset.testid = "markweave-image-caption-input";
    input.dataset.markweaveImageUi = "true";
    input.value = stringAttribute(this.node.attrs.caption) ?? "";
    input.placeholder = messages.captionPlaceholder;
    input.setAttribute("aria-label", messages.captionAriaLabel);
    input.addEventListener("input", () => {
      this.updateAttributes({ caption: input.value.trim() ? input.value : null });
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.captionOpen = false;
        this.unmountCaptionInput();
      }
    });
    this.captionInput = input;
    this.caption.hidden = true;
    this.dom.insertBefore(input, this.caption);
    if (this.captionButton) {
      this.captionButton.dataset.active = "true";
    }
  }

  private unmountCaptionInput() {
    this.captionInput?.remove();
    this.captionInput = null;
    const caption = stringAttribute(this.node.attrs.caption);
    this.caption.hidden = !caption;
    if (this.captionButton) {
      this.captionButton.dataset.active =
        this.captionOpen || Boolean(caption) ? "true" : "false";
    }
  }

  private mountResizeHandles() {
    if (this.resizeHandles.length || !this.props.editor.isEditable) {
      return;
    }

    this.resizeHandles = (["left", "right"] as const).map((side) => {
      const handle = this.dom.ownerDocument.createElement("button");
      handle.type = "button";
      handle.className = "markweave-image-resize-handle";
      handle.dataset.testid = `markweave-image-resize-${side}`;
      handle.dataset.side = side;
      handle.dataset.markweaveImageUi = "true";
      handle.setAttribute(
        "aria-label",
        side === "left"
          ? this.options.messages.image.resizeLeft
          : this.options.messages.image.resizeRight,
      );
      handle.addEventListener("pointerdown", (event) => {
        this.beginResize(side, event);
      });
      this.box.append(handle);
      return handle;
    });
  }

  private beginResize(side: "left" | "right", event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    const ownerWindow = this.dom.ownerDocument.defaultView;
    if (!ownerWindow) {
      return;
    }

    this.stopResize?.();
    const startX = event.clientX;
    const startWidth =
      this.box.getBoundingClientRect().width ||
      numberAttribute(this.node.attrs.width) ||
      320;
    const surfaceWidth =
      this.box
        .closest(".markweave-editor-surface")
        ?.getBoundingClientRect().width ??
      this.box.parentElement?.getBoundingClientRect().width ??
      startWidth;
    const move = (moveEvent: PointerEvent) => {
      const delta =
        side === "right"
          ? moveEvent.clientX - startX
          : startX - moveEvent.clientX;
      this.updateAttributes({
        width: clampMarkweaveImageWidth(startWidth + delta, surfaceWidth),
      });
    };
    const stop = () => {
      ownerWindow.removeEventListener("pointermove", move);
      ownerWindow.removeEventListener("pointerup", stop);
      if (this.stopResize === stop) {
        this.stopResize = null;
      }
    };
    this.stopResize = stop;
    ownerWindow.addEventListener("pointermove", move);
    ownerWindow.addEventListener("pointerup", stop, { once: true });
  }

  private updateAttributes(attributes: Record<string, unknown>) {
    const pos = this.props.getPos();
    if (typeof pos !== "number") {
      return;
    }
    this.props.view.dispatch(
      this.props.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        ...attributes,
      }),
    );
  }

  private deleteNode() {
    const pos = this.props.getPos();
    if (typeof pos !== "number") {
      return;
    }
    const transaction = this.props.view.state.tr.setSelection(
      NodeSelection.create(this.props.view.state.doc, pos),
    );
    this.props.view.dispatch(transaction.deleteSelection());
  }

  private async replaceImage(file: File) {
    if (!this.options.onUpload) {
      return;
    }
    try {
      const result = await resolveMarkweaveUploadResult(
        createMarkweaveImageUploadRequest(
          { type: "file", file, mimeType: file.type },
          "image-replace",
        ),
        this.options.onUpload,
      );
      this.updateAttributes(attrsFromMarkweaveImageUploadResult(this.node.attrs, result));
    } catch {
      this.setMediaState("unreadable");
    }
  }
}
