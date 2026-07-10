export interface MarkweaveImagePreviewMessages {
  readonly dialogAriaLabel: string;
  readonly zoomOut: string;
  readonly zoomIn: string;
  readonly reset: string;
  readonly close: string;
}

const minScale = 0.25;
const maxScale = 4;
const zoomStep = 0.25;

function clampScale(value: number) {
  return Math.round(Math.min(maxScale, Math.max(minScale, value)) * 100) / 100;
}

function createButton(label: string, text: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "markweave-image-preview-control";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.textContent = text;
  return button;
}

/**
 * Opens a browser-only image lightbox without mutating the editor document.
 * The source is the image node's existing URL; no network or upload behavior is added here.
 */
export function openMarkweaveImagePreview(options: {
  readonly src: string;
  readonly alt: string;
  readonly messages: MarkweaveImagePreviewMessages;
}) {
  if (typeof document === "undefined" || !options.src) {
    return () => undefined;
  }

  const layer = document.createElement("div");
  layer.className = "markweave-image-preview-layer";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", options.messages.dialogAriaLabel);
  layer.dataset.testid = "markweave-image-preview-layer";

  const toolbar = document.createElement("div");
  toolbar.className = "markweave-image-preview-toolbar";
  const zoomOut = createButton(options.messages.zoomOut, "−");
  const zoomLabel = document.createElement("span");
  zoomLabel.className = "markweave-image-preview-zoom-label";
  zoomLabel.dataset.testid = "markweave-image-preview-zoom-label";
  const zoomIn = createButton(options.messages.zoomIn, "+");
  const reset = createButton(options.messages.reset, "↻");
  toolbar.append(zoomOut, zoomLabel, zoomIn, reset);

  const close = createButton(options.messages.close, "×");
  close.classList.add("markweave-image-preview-close");

  const viewport = document.createElement("div");
  viewport.className = "markweave-image-preview-viewport";
  viewport.dataset.dragging = "false";
  const image = document.createElement("img");
  image.className = "markweave-image-preview-content";
  image.src = options.src;
  image.alt = options.alt;
  image.draggable = false;
  viewport.append(image);
  layer.append(toolbar, close, viewport);
  document.body.append(layer);

  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const sync = () => {
    image.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  };
  const resetPreview = () => {
    scale = 1;
    translateX = 0;
    translateY = 0;
    sync();
  };
  const closePreview = () => {
    document.removeEventListener("keydown", onKeydown);
    layer.remove();
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePreview();
    }
  };

  zoomOut.addEventListener("click", () => {
    scale = clampScale(scale - zoomStep);
    sync();
  });
  zoomIn.addEventListener("click", () => {
    scale = clampScale(scale + zoomStep);
    sync();
  });
  reset.addEventListener("click", resetPreview);
  close.addEventListener("click", closePreview);
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    scale = clampScale(scale + (event.deltaY < 0 ? zoomStep : -zoomStep));
    sync();
  });
  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    viewport.dataset.dragging = "true";
    viewport.setPointerCapture?.(event.pointerId);
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    translateX += event.clientX - lastX;
    translateY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    sync();
  });
  const stopDragging = () => {
    dragging = false;
    viewport.dataset.dragging = "false";
  };
  viewport.addEventListener("pointerup", stopDragging);
  viewport.addEventListener("pointercancel", stopDragging);
  document.addEventListener("keydown", onKeydown);
  sync();
  close.focus();

  return closePreview;
}
