import type { NodeViewRenderer, NodeViewRendererProps } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import type { NodeView } from "@tiptap/pm/view";
import type { MarkweaveMessages } from "../../i18n";
import {
  attrsFromMarkweaveImageUploadResult,
  createMarkweaveImageUploadRequest,
  downloadMarkweaveImage,
  normalizeMarkweaveCoreImageAlign,
  numberAttribute,
  stringAttribute,
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

export interface MarkweaveLightweightImageNodeViewOptions {
  readonly messages: MarkweaveMessages;
  readonly onUpload?: MarkweaveSlashCommandUploadHandler;
  readonly resolveMediaSource: MarkweaveMediaSourceResolver;
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
  private observer: IntersectionObserver | null = null;
  private resolveController: AbortController | null = null;
  private resolvedSrc: string | null = null;
  private toolbar: HTMLElement | null = null;
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
    this.box.append(this.image, this.placeholder);
    this.dom.append(this.box, this.caption);

    this.dom.addEventListener("mousedown", this.handleMouseDown);
    this.dom.addEventListener("dblclick", this.handleDoubleClick);
    this.image.addEventListener("error", this.handleImageError);
    this.renderNodeAttributes();
    this.observeProximity();
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
      this.resolvedSrc = null;
      this.image.removeAttribute("src");
      this.setMediaState("pending");
      this.resolveSource(this.dom.dataset.selected === "true" ? "visible" : "nearby");
    }

    return true;
  }

  selectNode() {
    this.dom.dataset.selected = "true";
    this.mountToolbar();
    this.resolveSource("visible");
  }

  deselectNode() {
    this.dom.dataset.selected = "false";
    this.unmountToolbar();
  }

  stopEvent(event: Event) {
    return Boolean(
      event.target instanceof Node &&
        this.toolbar?.contains(event.target),
    );
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.destroyed = true;
    this.resolveController?.abort();
    this.observer?.disconnect();
    this.unmountToolbar();
    this.dom.removeEventListener("mousedown", this.handleMouseDown);
    this.dom.removeEventListener("dblclick", this.handleDoubleClick);
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
    this.caption.hidden = !caption;
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

  private resolveSource(priority: MarkweaveMediaPriority) {
    const src = stringAttribute(this.node.attrs.src);
    if (!src || (this.resolvedSrc && priority !== "visible")) {
      return;
    }

    this.resolveController?.abort();
    const controller = new AbortController();
    this.resolveController = controller;
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

        this.resolvedSrc = result.src;
        if (result.width && result.height) {
          this.image.width = result.width;
          this.image.height = result.height;
          if (!this.box.style.aspectRatio) {
            this.box.style.aspectRatio = `${result.width} / ${result.height}`;
          }
        }
        this.image.src = result.src;
        this.setMediaState("resolved");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          this.setMediaState("unreadable");
        }
      });
  }

  private setMediaState(state: "pending" | "resolved" | "missing" | "unreadable") {
    this.dom.dataset.mediaState = state;
    const resolved = state === "resolved";
    this.image.hidden = !resolved;
    this.placeholder.hidden = resolved;
  }

  private readonly handleMouseDown = (event: MouseEvent) => {
    if (!this.props.editor.isEditable || event.button !== 0 || this.toolbar?.contains(event.target as Node)) {
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

  private mountToolbar() {
    if (this.toolbar || !this.props.editor.isEditable) {
      return;
    }

    const messages = this.options.messages.image;
    const toolbar = document.createElement("div");
    toolbar.className = "markweave-image-toolbar";
    toolbar.dataset.markweaveImageUi = "true";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", messages.toolsAriaLabel);
    toolbar.append(
      this.createButton(messages.alignLeft, "←", () => this.updateAttributes({ align: "left" })),
      this.createButton(messages.alignCenter, "↔", () => this.updateAttributes({ align: "center" })),
      this.createButton(messages.alignRight, "→", () => this.updateAttributes({ align: "right" })),
      this.createButton(messages.preview, "↗", () => this.handleDoubleClick()),
      this.createButton(messages.download, "↓", () => {
        if (this.resolvedSrc) {
          downloadMarkweaveImage(this.resolvedSrc, this.dom.ownerDocument);
        }
      }),
    );

    const fileInput = document.createElement("input");
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
      this.createButton(messages.replace, "⇄", () => fileInput.click()),
      this.createButton(messages.delete, "×", () => this.deleteNode()),
      fileInput,
    );
    this.toolbar = toolbar;
    this.dom.prepend(toolbar);
  }

  private unmountToolbar() {
    this.toolbar?.remove();
    this.toolbar = null;
  }

  private createButton(label: string, text: string, action: () => void) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.markweaveImageUi = "true";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = text;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", action);
    return button;
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
      this.dom.dataset.mediaState = "unreadable";
    }
  }
}
