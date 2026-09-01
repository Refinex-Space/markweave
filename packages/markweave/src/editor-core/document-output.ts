import type { Editor } from "@tiptap/core";
import {
  createMarkweaveDocumentViewportCoordinator,
  getMarkweaveDocumentViewportCoordinator,
} from "../core/document-viewport";

export type MarkweaveOutputKind = "print" | "dom-snapshot";

export interface MarkweavePrepareOutputOptions {
  readonly kind: MarkweaveOutputKind;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface MarkweaveOutputResourceReport {
  readonly resolved: number;
  readonly missing: number;
  readonly unreadable: number;
  readonly timedOut: number;
}

export interface MarkweaveOutputPreparationReport extends MarkweaveOutputResourceReport {
  readonly kind: MarkweaveOutputKind;
  readonly status: "ready" | "timed-out" | "cancelled";
  readonly durationMs: number;
}

export interface MarkweavePrepareOutputEventDetail {
  readonly kind: MarkweaveOutputKind;
  readonly signal: AbortSignal;
  readonly waitUntil: (promise: PromiseLike<unknown>) => void;
}

/**
 * Detail carried by `markweave:resolve-visual-resource` while an output barrier
 * asks an individual NodeView to recover or finish its visual resource.
 *
 * Existing listeners that only react to the event type remain compatible
 * because `CustomEvent` is still an `Event`. New listeners should synchronously
 * register their cancellable recovery promise through `waitUntil`.
 */
export interface MarkweaveResolveVisualResourceEventDetail {
  readonly kind: MarkweaveOutputKind;
  readonly signal: AbortSignal;
  readonly waitUntil: (promise: PromiseLike<unknown>) => void;
}

export const markweavePrepareOutputEvent = "markweave:prepare-output";
export const markweaveResolveVisualResourceEvent = "markweave:resolve-visual-resource";

const recoverableVisualResourceSelector = [
  '[data-media-state="pending"]',
  '[data-media-state="missing"]',
  '[data-media-state="unreadable"]',
  '[data-markweave-visual-pending="true"]',
  ".markweave-mermaid-preview--empty",
  ".markweave-mermaid-preview--error",
  'iframe[data-markweave-iframe-state="pending"]',
  'iframe[data-markweave-iframe-state="unreadable"]',
].join(", ");

function now(ownerWindow: Window) {
  return ownerWindow.performance?.now() ?? Date.now();
}

function isPendingMermaidPreview(element: Element) {
  return !element.classList.contains("markweave-mermaid-preview--empty")
    && !element.classList.contains("markweave-mermaid-preview--error")
    && !element.querySelector("svg");
}

function countMatches(root: HTMLElement, selector: string) {
  return root.querySelectorAll(selector).length + (root.matches(selector) ? 1 : 0);
}

function collectRecoverableVisualResources(root: HTMLElement) {
  const resources = new Set<HTMLElement>();
  if (root.matches(recoverableVisualResourceSelector)) {
    resources.add(root);
  }
  root.querySelectorAll<HTMLElement>(recoverableVisualResourceSelector)
    .forEach((element) => resources.add(element));

  return [...resources].filter(
    (element) =>
      element.dataset.mediaState !== "resolved"
      && element.dataset.markweaveIframeState !== "resolved"
      && !(
        element.classList.contains("markweave-mermaid-preview")
        && Boolean(element.querySelector("svg"))
      ),
  );
}

function iframeState(iframe: HTMLIFrameElement) {
  const explicitState = iframe.dataset.markweaveIframeState;
  if (explicitState === "pending" || explicitState === "resolved" || explicitState === "unreadable") {
    return explicitState;
  }
  if (!iframe.getAttribute("src")) {
    return "missing" as const;
  }
  try {
    if (iframe.contentDocument?.readyState === "complete") {
      return "resolved" as const;
    }
  } catch {
    // Cross-origin frames use the load marker installed by adapter NodeViews.
  }
  return "pending" as const;
}

function countPendingVisualResources(root: HTMLElement) {
  const pending = new Set<Element>();
  root.querySelectorAll('[data-media-state="pending"], [data-markweave-visual-pending="true"]')
    .forEach((element) => pending.add(element));
  if (root.matches('[data-media-state="pending"], [data-markweave-visual-pending="true"]')) {
    pending.add(root);
  }
  root.querySelectorAll(".markweave-mermaid-preview").forEach((element) => {
    if (isPendingMermaidPreview(element)) pending.add(element);
  });
  root.querySelectorAll<HTMLVideoElement>("video").forEach((video) => {
    if (video.readyState < 1 && !video.error) pending.add(video);
  });
  root.querySelectorAll<HTMLIFrameElement>("iframe").forEach((iframe) => {
    if (iframeState(iframe) === "pending") pending.add(iframe);
  });
  return pending.size;
}

function waitForPendingVisualResources(root: HTMLElement, signal: AbortSignal) {
  if (countPendingVisualResources(root) === 0 || signal.aborted) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const MutationObserverCtor = root.ownerDocument.defaultView?.MutationObserver ?? globalThis.MutationObserver;
    let observer: MutationObserver | null = null;
    let fallbackTimer: number | null = null;
    const ownerWindow = root.ownerDocument.defaultView;

    const finish = () => {
      observer?.disconnect();
      if (fallbackTimer !== null) {
        ownerWindow?.clearInterval(fallbackTimer);
      }
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const inspect = () => {
      if (signal.aborted || countPendingVisualResources(root) === 0) {
        finish();
      }
    };

    if (MutationObserverCtor) {
      observer = new MutationObserverCtor(inspect);
      observer.observe(root, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    } else if (ownerWindow) {
      fallbackTimer = ownerWindow.setInterval(inspect, 32);
    }
    signal.addEventListener("abort", finish, { once: true });
    inspect();
  });
}

function waitForImage(image: HTMLImageElement, signal: AbortSignal) {
  if (image.complete || signal.aborted) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const finish = () => {
      image.removeEventListener("load", finish);
      image.removeEventListener("error", finish);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", finish, { once: true });
    signal.addEventListener("abort", finish, { once: true });
  });
}

function waitForVideo(video: HTMLVideoElement, signal: AbortSignal) {
  if (video.readyState >= 1 || video.error || signal.aborted) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const finish = () => {
      video.removeEventListener("loadedmetadata", finish);
      video.removeEventListener("error", finish);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    video.addEventListener("loadedmetadata", finish, { once: true });
    video.addEventListener("error", finish, { once: true });
    signal.addEventListener("abort", finish, { once: true });
  });
}

function waitForIframe(iframe: HTMLIFrameElement, signal: AbortSignal) {
  if (iframeState(iframe) !== "pending" || signal.aborted) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const MutationObserverCtor = iframe.ownerDocument.defaultView?.MutationObserver ?? globalThis.MutationObserver;
    let observer: MutationObserver | null = null;
    const finish = (state?: "resolved" | "unreadable") => {
      if (state) iframe.dataset.markweaveIframeState = state;
      observer?.disconnect();
      iframe.removeEventListener("load", loaded);
      iframe.removeEventListener("error", failed);
      signal.removeEventListener("abort", aborted);
      resolve();
    };
    const loaded = () => finish("resolved");
    const failed = () => finish("unreadable");
    const aborted = () => finish();
    iframe.addEventListener("load", loaded, { once: true });
    iframe.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", aborted, { once: true });
    if (MutationObserverCtor) {
      observer = new MutationObserverCtor(() => {
        const state = iframeState(iframe);
        if (state === "resolved" || state === "unreadable") finish(state);
      });
      observer.observe(iframe, {
        attributeFilter: ["data-markweave-iframe-state"],
        attributes: true,
      });
    }
  });
}

function settleOnAbort(promise: PromiseLike<unknown>, signal: AbortSignal) {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const finish = () => {
      signal.removeEventListener("abort", finish);
      resolve();
    };
    signal.addEventListener("abort", finish, { once: true });
    void Promise.resolve(promise).then(finish, finish);
  });
}

function collectResourceReport(root: HTMLElement, timedOut: boolean): MarkweaveOutputResourceReport {
  const resolvedMedia = countMatches(root, '[data-media-state="resolved"]');
  const missingMedia = countMatches(root, '[data-media-state="missing"]');
  const unreadableMedia = countMatches(root, '[data-media-state="unreadable"]');
  const mermaidPreviews = [...root.querySelectorAll(".markweave-mermaid-preview")];
  const settledMermaidPreviews = mermaidPreviews.filter(
    (element) => element.getAttribute("data-markweave-visual-pending") !== "true",
  );
  const resolvedMermaid = settledMermaidPreviews.filter((element) => Boolean(element.querySelector("svg"))).length;
  const missingMermaid = settledMermaidPreviews.filter((element) => element.classList.contains("markweave-mermaid-preview--empty")).length;
  const unreadableMermaid = settledMermaidPreviews.filter((element) => element.classList.contains("markweave-mermaid-preview--error")).length;
  const resolvedMath = root.querySelectorAll('.tiptap-mathematics-render, [data-type="inline-math"], [data-type="block-math"]').length;
  const videos = [...root.querySelectorAll<HTMLVideoElement>("video")];
  const resolvedVideo = videos.filter((video) => video.readyState >= 1).length;
  const unreadableVideo = videos.filter((video) => Boolean(video.error)).length;
  const genericImages = [...root.querySelectorAll<HTMLImageElement>("img")]
    .filter((image) => !image.closest("[data-media-state]"));
  const resolvedImages = genericImages.filter((image) => image.complete && image.naturalWidth > 0).length;
  const unreadableImages = genericImages.filter(
    (image) => image.complete && image.naturalWidth === 0 && Boolean(image.getAttribute("src")),
  ).length;
  const pendingImages = genericImages.filter(
    (image) => !image.complete && image.dataset.markweaveVisualPending !== "true",
  ).length;
  const iframes = [...root.querySelectorAll<HTMLIFrameElement>("iframe")];
  const resolvedIframes = iframes.filter((iframe) => iframeState(iframe) === "resolved").length;
  const missingIframes = iframes.filter((iframe) => iframeState(iframe) === "missing").length;
  const unreadableIframes = iframes.filter((iframe) => iframeState(iframe) === "unreadable").length;
  const pending = countPendingVisualResources(root) + pendingImages;

  return {
    missing: missingMedia + missingMermaid + missingIframes,
    resolved: resolvedMedia + resolvedMermaid + resolvedMath + resolvedVideo + resolvedImages + resolvedIframes,
    timedOut: timedOut ? Math.max(1, pending) : 0,
    unreadable: unreadableMedia + unreadableMermaid + unreadableVideo + unreadableImages + unreadableIframes,
  };
}

/**
 * Materializes the complete editor DOM and waits for registered visual work.
 * Plugins can extend the barrier with the `markweave:prepare-output` event's
 * `waitUntil` callback without coupling this module to their implementation.
 */
export async function prepareMarkweaveEditorForOutput(
  editor: Editor,
  options: MarkweavePrepareOutputOptions,
): Promise<MarkweaveOutputPreparationReport> {
  if (editor.isDestroyed) {
    return {
      durationMs: 0,
      kind: options.kind,
      missing: 0,
      resolved: 0,
      status: "cancelled",
      timedOut: 0,
      unreadable: 0,
    };
  }
  const root = editor.view.dom;
  const ownerWindow = root.ownerDocument.defaultView;
  if (!ownerWindow) {
    return {
      durationMs: 0,
      kind: options.kind,
      missing: 0,
      resolved: 0,
      status: "cancelled",
      timedOut: 0,
      unreadable: 0,
    };
  }

  const startedAt = now(ownerWindow);
  const existingCoordinator = getMarkweaveDocumentViewportCoordinator(editor);
  const coordinator = existingCoordinator ?? createMarkweaveDocumentViewportCoordinator(editor);
  const releaseOutput = coordinator.beginOutput();
  const controller = new AbortController();
  let didTimeOut = false;
  let didCancel = false;
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(0, options.timeoutMs ?? 5_000)
    : 5_000;
  const timeout = ownerWindow.setTimeout(() => {
    didTimeOut = true;
    controller.abort();
  }, timeoutMs);
  const cancel = () => {
    didCancel = true;
    controller.abort();
  };
  const cancelForViewportDestroy = () => cancel();
  options.signal?.addEventListener("abort", cancel, { once: true });
  coordinator.signal.addEventListener("abort", cancelForViewportDestroy, { once: true });
  if (options.signal?.aborted) {
    cancel();
  }

  const waiters: PromiseLike<unknown>[] = [];
  const detail: MarkweavePrepareOutputEventDetail = {
    kind: options.kind,
    signal: controller.signal,
    waitUntil: (promise) => waiters.push(promise),
  };
  const resolveVisualResourceDetail: MarkweaveResolveVisualResourceEventDetail = {
    kind: options.kind,
    signal: controller.signal,
    waitUntil: detail.waitUntil,
  };

  try {
    collectRecoverableVisualResources(root).forEach((element) => {
      element.dispatchEvent(
        new ownerWindow.CustomEvent<MarkweaveResolveVisualResourceEventDetail>(
          markweaveResolveVisualResourceEvent,
          { detail: resolveVisualResourceDetail },
        ),
      );
    });
    root.querySelectorAll<HTMLIFrameElement>("iframe").forEach((iframe) => {
      if (iframeState(iframe) === "pending") iframe.loading = "eager";
    });
    root.dispatchEvent(new ownerWindow.CustomEvent<MarkweavePrepareOutputEventDetail>(
      markweavePrepareOutputEvent,
      { bubbles: true, detail },
    ));

    const fontsReady = root.ownerDocument.fonts?.ready ?? Promise.resolve();
    const imageWaiters = [...root.querySelectorAll<HTMLImageElement>("img")]
      .map((image) => waitForImage(image, controller.signal));
    const videoWaiters = [...root.querySelectorAll<HTMLVideoElement>("video")]
      .map((video) => waitForVideo(video, controller.signal));
    const iframeWaiters = [...root.querySelectorAll<HTMLIFrameElement>("iframe")]
      .map((iframe) => waitForIframe(iframe, controller.signal));

    await Promise.allSettled([
      coordinator.visualWork.flush({ signal: controller.signal }),
      waitForPendingVisualResources(root, controller.signal),
      settleOnAbort(fontsReady, controller.signal),
      ...imageWaiters,
      ...videoWaiters,
      ...iframeWaiters,
      ...waiters.map((waiter) => settleOnAbort(waiter, controller.signal)),
    ]);

    if (!controller.signal.aborted) {
      await coordinator.nextFrame(controller.signal);
      await coordinator.nextFrame(controller.signal);
    }

    const resources = collectResourceReport(root, didTimeOut);
    return {
      ...resources,
      durationMs: Math.max(0, now(ownerWindow) - startedAt),
      kind: options.kind,
      status: didCancel ? "cancelled" : didTimeOut ? "timed-out" : "ready",
    };
  } finally {
    ownerWindow.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancel);
    coordinator.signal.removeEventListener("abort", cancelForViewportDestroy);
    releaseOutput();
    if (!existingCoordinator) {
      coordinator.destroy();
    }
  }
}
