import type { Editor } from "@tiptap/core";
import { calculateFloatingToolbarPopoverPlacement } from "../../editor-core/selection-state";
import { createMarkweaveFrameScheduler } from "../../editor-core/frame-scheduler";
import type { MarkweaveMessages } from "../../i18n";
import {
  getMarkweaveLinkCardMarkdown,
  normalizeMarkweaveLinkCardHref,
  removeMarkweaveLinkFromTarget,
  replaceMarkweaveLinkWithCard,
  type MarkweaveLinkCardResolver,
  type MarkweaveLinkCardAttrs,
  type MarkweaveLinkCardTarget,
  updateMarkweaveLinkCard,
} from "./link-card";

interface MarkweaveLinkCardComposerOptions {
  readonly anchor: HTMLElement;
  readonly editor: Editor;
  readonly messages: MarkweaveMessages;
  readonly resolver?: MarkweaveLinkCardResolver;
  readonly target?: MarkweaveLinkCardTarget;
  readonly card?: { readonly pos: number; readonly attrs: MarkweaveLinkCardAttrs };
}

const activeComposers = new WeakMap<HTMLElement, () => void>();
const activeResolvers = new WeakMap<Editor, AbortController>();

function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value).catch(() => undefined);
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
  return Promise.resolve();
}

function createLabel(messages: MarkweaveMessages, label: string, placeholder: string, value: string, type = "text") {
  const wrapper = document.createElement("label");
  wrapper.className = "markweave-link-card-composer-field";
  const caption = document.createElement("span");
  caption.textContent = label;
  const input = document.createElement("input");
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.setAttribute("aria-label", label);
  wrapper.append(caption, input);
  return { input, wrapper };
}

type LinkCardActionIcon = "archive" | "copy" | "file" | "trash";

function appendActionIcon(button: HTMLButtonElement, icon: LinkCardActionIcon) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  if (icon === "copy" || icon === "file") {
    const rect = document.createElementNS(namespace, "rect");
    rect.setAttribute("width", "14");
    rect.setAttribute("height", "14");
    rect.setAttribute("x", "8");
    rect.setAttribute("y", "8");
    rect.setAttribute("rx", "2");
    rect.setAttribute("ry", "2");
    svg.append(rect);
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2");
    svg.append(path);
    button.append(svg);
    return;
  }
  const paths = {
    archive: ["M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z", "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12", "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"],
    copy: [],
    file: [],
    trash: ["M10 11v6", "M14 11v6", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M3 6h18", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  } satisfies Record<LinkCardActionIcon, readonly string[]>;
  paths[icon].forEach((path) => {
    const element = document.createElementNS(namespace, "path");
    element.setAttribute("d", path);
    svg.append(element);
  });
  button.append(svg);
}

function createAction(label: string, icon: LinkCardActionIcon, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `markweave-link-card-composer-action ${className}`.trim();
  button.title = label;
  button.dataset.tooltip = label;
  button.setAttribute("aria-label", label);
  appendActionIcon(button, icon);
  return button;
}

/**
 * Opens the shared edit surface for a whole-line external link. This is intentionally
 * DOM based so every framework adapter receives identical geometry and behavior.
 */
export function openMarkweaveLinkCardComposer(options: MarkweaveLinkCardComposerOptions) {
  if (!options.target && !options.card) return false;
  const frame = options.editor.view.dom.closest<HTMLElement>(".markweave-editor-frame");
  if (!frame) return false;
  // Card hover controls are transient; the card itself remains mounted during scroll.
  // Promote the anchor once so geometry never falls back to the viewport origin.
  const anchor = options.anchor.closest<HTMLElement>(".markweave-link-card") ?? options.anchor;

  activeComposers.get(frame)?.();
  activeResolvers.get(options.editor)?.abort();

  const popup = document.createElement("form");
  popup.className = "markweave-link-card-composer";
  popup.dataset.markweaveTheme = frame.dataset.markweaveTheme ?? "light";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", options.messages.linkCard.toolsAriaLabel);

  const { input: titleInput, wrapper: titleField } = createLabel(
    options.messages,
    options.messages.linkCard.titleLabel,
    options.messages.linkCard.titlePlaceholder,
    options.target?.title ?? options.card!.attrs.title,
  );
  const { input: hrefInput, wrapper: hrefField } = createLabel(
    options.messages,
    options.messages.linkCard.addressLabel,
    options.messages.linkCard.addressPlaceholder,
    options.target?.href ?? options.card!.attrs.href,
    "url",
  );
  const copyAddress = createAction(options.messages.linkCard.copyAddress, "copy", "markweave-link-card-composer-icon");
  hrefField.append(copyAddress);

  const actions = document.createElement("div");
  actions.className = "markweave-link-card-composer-actions";
  const embed = createAction(options.messages.linkCard.embedLink, "archive", "is-primary");
  embed.type = "submit";
  const copyMarkdown = createAction(options.messages.linkCard.copyAsMarkdown, "file");
  const remove = createAction(options.messages.linkCard.removeLink, "trash", "is-danger");
  actions.append(embed, copyMarkdown, remove);
  popup.append(titleField, hrefField, actions);
  document.body.append(popup);

  let aborted = false;
  const reposition = () => {
    const anchorRect = anchor.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const placement = calculateFloatingToolbarPopoverPlacement({
      toolbarRect: anchorRect,
      popoverSize: { width: popupRect.width, height: popupRect.height },
      viewport,
      frameRect,
      gap: 8,
    }).placement;
    const padding = 12;
    const minLeft = Math.max(padding, frameRect.left + padding);
    const maxLeft = Math.max(minLeft, Math.min(viewport.width - popupRect.width - padding, frameRect.right - popupRect.width - padding));
    const left = Math.min(maxLeft, Math.max(minLeft, anchorRect.left + anchorRect.width / 2 - popupRect.width / 2));
    const top = placement === "top" ? anchorRect.top - popupRect.height - 8 : anchorRect.bottom + 8;
    popup.dataset.placement = placement;
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(Math.max(padding, Math.min(viewport.height - popupRect.height - padding, top)))}px`;
  };
  const scheduler = createMarkweaveFrameScheduler(reposition);
  const close = () => {
    if (aborted) return;
    aborted = true;
    scheduler.cancel();
    window.removeEventListener("resize", scheduler.schedule);
    window.removeEventListener("scroll", scheduler.schedule, true);
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);
    popup.remove();
    if (activeComposers.get(frame) === close) activeComposers.delete(frame);
  };
  const onOutsidePointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (target instanceof Node && !popup.contains(target) && !anchor.contains(target)) close();
  };
  const stop = (event: Event) => event.stopPropagation();
  popup.addEventListener("pointerdown", stop);
  popup.addEventListener("click", stop);
  window.addEventListener("resize", scheduler.schedule);
  window.addEventListener("scroll", scheduler.schedule, true);
  document.addEventListener("pointerdown", onOutsidePointerDown, true);
  activeComposers.set(frame, close);
  scheduler.schedule();

  copyAddress.addEventListener("click", () => void copyText(hrefInput.value));
  copyMarkdown.addEventListener("click", () => {
    const href = normalizeMarkweaveLinkCardHref(hrefInput.value);
    if (href) void copyText(getMarkweaveLinkCardMarkdown({ href, title: titleInput.value }));
  });
  remove.addEventListener("click", () => {
    if (options.target) {
      removeMarkweaveLinkFromTarget(options.editor, options.target);
    } else if (options.card) {
      const node = options.editor.state.doc.nodeAt(options.card.pos);
      if (node?.type.name === "markweaveLinkCard") options.editor.view.dispatch(options.editor.state.tr.delete(options.card.pos, options.card.pos + node.nodeSize));
    }
    close();
  });
  popup.addEventListener("submit", async (event) => {
    event.preventDefault();
    const href = normalizeMarkweaveLinkCardHref(hrefInput.value);
    const title = titleInput.value.trim().slice(0, 240) || href;
    if (!href || !title) {
      hrefInput.setAttribute("aria-invalid", "true");
      return;
    }

    // The first transaction produces a usable, clickable card immediately. Resolver
    // metadata is a later enhancement and must never block or discard the link.
    const cardPos = options.card?.pos ?? options.target!.from;
    const persisted = options.card
      ? updateMarkweaveLinkCard(options.editor, cardPos, { href, title })
      : replaceMarkweaveLinkWithCard(options.editor, { ...options.target!, href, title });
    if (!persisted) return;
    close();
    if (!options.resolver) return;
    const resolveController = new AbortController();
    activeResolvers.set(options.editor, resolveController);
    const signal = resolveController.signal;

    try {
      const metadata = await options.resolver({ href, title, signal });
      if (signal.aborted || activeResolvers.get(options.editor) !== resolveController || !metadata) return;
      updateMarkweaveLinkCard(options.editor, cardPos, { href, title, ...metadata });
    } catch {
      // Resolution is optional. The fallback card deliberately remains intact.
    } finally {
      if (activeResolvers.get(options.editor) === resolveController) activeResolvers.delete(options.editor);
    }
  });

  titleInput.focus();
  return true;
}
