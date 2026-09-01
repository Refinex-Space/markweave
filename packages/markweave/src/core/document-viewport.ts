import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { MarkweaveVisualWorkScheduler } from "./visual-work-scheduler";

export type MarkweaveDocumentViewportState =
  | "idle"
  | "scrolling"
  | "rapid"
  | "navigating"
  | "output";

export type MarkweaveRevealReason =
  | "search"
  | "toc"
  | "ai-hunk"
  | "restore"
  | "host";

export interface MarkweaveRevealPositionOptions {
  readonly reason: MarkweaveRevealReason;
  readonly align?: "start" | "center" | "nearest";
  readonly focus?: boolean;
  readonly behavior?: ScrollBehavior;
  readonly signal?: AbortSignal;
}

export interface MarkweaveRevealPositionResult {
  readonly status: "revealed" | "unresolved" | "cancelled" | "missing" | "destroyed";
  readonly pos: number;
  readonly correctionCount: number;
  readonly finalErrorPx: number | null;
}

export interface MarkweaveDocumentViewportSnapshot {
  readonly state: MarkweaveDocumentViewportState;
  readonly pendingVisualWork: number;
}

interface ScrollSample {
  readonly x: number;
  readonly y: number;
  readonly time: number;
}

type FrameCallback = () => void;

const rapidScrollVelocity = 1.5;
const rapidExitDelayMs = 120;
const idleDelayMs = 250;
const revealTolerancePx = 8;
const revealCorrectionLimit = 6;
const revealCorrectionWindowMs = 500;

const coordinatorByEditor = new WeakMap<Editor, MarkweaveDocumentViewportCoordinator>();
const coordinatorBySurface = new WeakMap<HTMLElement, MarkweaveDocumentViewportCoordinator>();
const coordinatorSubscribersBySurface = new WeakMap<
  HTMLElement,
  Set<(coordinator: MarkweaveDocumentViewportCoordinator | null) => void>
>();

function asElement(node: Node | null): Element | null {
  if (node?.nodeType === 1) {
    return node as Element;
  }
  return node?.parentElement ?? null;
}

function isHtmlElement(value: unknown): value is HTMLElement {
  const node = value as Node | null;
  return node?.nodeType === 1
    && (node as Element).namespaceURI === "http://www.w3.org/1999/xhtml";
}

function asHtmlElement(node: Node | null): HTMLElement | null {
  const element = asElement(node);
  return isHtmlElement(element) ? element : null;
}

function getScrollOffset(target: EventTarget, ownerWindow: Window): { x: number; y: number } {
  if (target === ownerWindow) {
    return { x: ownerWindow.scrollX, y: ownerWindow.scrollY };
  }

  if (isHtmlElement(target)) {
    return { x: target.scrollLeft, y: target.scrollTop };
  }

  const viewport = target as VisualViewport;
  return {
    x: viewport.pageLeft ?? viewport.offsetLeft ?? 0,
    y: viewport.pageTop ?? viewport.offsetTop ?? 0,
  };
}

function hasScrollableOverflow(element: HTMLElement, ownerWindow: Window) {
  const style = ownerWindow.getComputedStyle(element);
  const overflowY = style.overflowY || style.overflow;
  return /(?:auto|scroll|overlay)/.test(overflowY)
    || (
      /(?:hidden)/.test(overflowY)
      && element.scrollHeight > element.clientHeight + 1
    );
}

function findScrollAncestors(surface: HTMLElement, ownerWindow: Window) {
  const ancestors: HTMLElement[] = [];
  let current = surface.parentElement;

  while (current) {
    if (hasScrollableOverflow(current, ownerWindow)) {
      ancestors.push(current);
    }
    current = current.parentElement;
  }

  return ancestors;
}

function getEditorSurfaceForElement(element: Element) {
  const surface = element.matches(".markweave-editor-surface")
    ? element
    : element.closest(".markweave-editor-frame")?.querySelector(".markweave-editor-surface")
      ?? element.closest(".markweave-editor-surface");
  return isHtmlElement(surface) ? surface : null;
}

function publishCoordinator(surface: HTMLElement, coordinator: MarkweaveDocumentViewportCoordinator | null) {
  coordinatorSubscribersBySurface.get(surface)?.forEach((subscriber) => subscriber(coordinator));
}

function topLevelPosition(editor: Editor, pos: number) {
  const doc = editor.state.doc;
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  const resolved = doc.resolve(clamped);
  if (resolved.depth > 0) {
    return resolved.before(1);
  }

  const after = doc.childAfter(clamped);
  if (after.node) {
    return after.offset;
  }
  const before = doc.childBefore(clamped);
  return before.node ? before.offset : 0;
}

function getPositionElement(editor: Editor, pos: number) {
  const clamped = Math.max(0, Math.min(pos, editor.state.doc.content.size));
  const topLevelElement = asHtmlElement(editor.view.nodeDOM(topLevelPosition(editor, clamped)));
  try {
    const { node } = editor.view.domAtPos(clamped);
    const element = asHtmlElement(node);
    if (element && element !== editor.view.dom && editor.view.dom.contains(element)) {
      return element;
    }
  } catch {
    // Fall through to the stable top-level DOM lookup.
  }

  return topLevelElement;
}

function getPositionRect(editor: Editor, pos: number, fallback: HTMLElement) {
  try {
    const coords = editor.view.coordsAtPos(pos);
    if (
      [coords.top, coords.right, coords.bottom, coords.left].every(Number.isFinite)
      && coords.bottom > coords.top
      && (coords.top !== 0 || coords.right !== 0 || coords.bottom !== 0 || coords.left !== 0)
    ) {
      return {
        bottom: coords.bottom,
        height: Math.max(0, coords.bottom - coords.top),
        left: coords.left,
        right: coords.right,
        top: coords.top,
        width: Math.max(0, coords.right - coords.left),
        x: coords.left,
        y: coords.top,
        toJSON: () => ({}),
      } as DOMRect;
    }
  } catch {
    // The pinned top-level block remains a safe fallback in older WebViews.
  }
  return fallback.getBoundingClientRect();
}

function rectIntersection(rects: readonly DOMRect[]) {
  const left = Math.max(...rects.map((rect) => rect.left));
  const right = Math.min(...rects.map((rect) => rect.right));
  const top = Math.max(...rects.map((rect) => rect.top));
  const bottom = Math.min(...rects.map((rect) => rect.bottom));

  return {
    bottom,
    height: Math.max(0, bottom - top),
    left,
    right,
    top,
    width: Math.max(0, right - left),
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function windowRect(ownerWindow: Window) {
  const viewport = ownerWindow.visualViewport;
  const width = viewport?.width ?? ownerWindow.innerWidth;
  const height = viewport?.height ?? ownerWindow.innerHeight;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;

  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function getAlignmentError(target: DOMRect, viewport: DOMRect, align: NonNullable<MarkweaveRevealPositionOptions["align"]>) {
  if (align === "start") {
    return target.top - viewport.top;
  }
  if (align === "center") {
    return (target.top + target.bottom) / 2 - (viewport.top + viewport.bottom) / 2;
  }
  if (target.top < viewport.top) {
    return target.top - viewport.top;
  }
  if (target.bottom > viewport.bottom) {
    return target.bottom - viewport.bottom;
  }
  return 0;
}

function isNonEmptyRect(rect: DOMRect) {
  return Number.isFinite(rect.top)
    && Number.isFinite(rect.right)
    && Number.isFinite(rect.bottom)
    && Number.isFinite(rect.left)
    && rect.bottom > rect.top
    && rect.right >= rect.left;
}

function isRectVisibleWithin(target: DOMRect, viewport: DOMRect) {
  return isNonEmptyRect(target)
    && viewport.bottom > viewport.top
    && viewport.right > viewport.left
    && target.bottom > viewport.top
    && target.top < viewport.bottom
    && target.right >= viewport.left
    && target.left <= viewport.right;
}

function focusEditorPosition(editor: Editor, pos: number) {
  try {
    const clamped = Math.max(0, Math.min(pos, editor.state.doc.content.size));
    const selection = TextSelection.near(editor.state.doc.resolve(clamped), 1);
    editor.view.dispatch(editor.state.tr.setSelection(selection));
    editor.view.dom.focus({ preventScroll: true });
  } catch {
    editor.view.focus();
  }
}

export class MarkweaveDocumentViewportCoordinator {
  readonly visualWork: MarkweaveVisualWorkScheduler;
  readonly signal: AbortSignal;

  private readonly ownerWindow: Window;
  private readonly surface: HTMLElement;
  private readonly scrollAncestors: readonly HTMLElement[];
  private readonly cleanupCallbacks: Array<() => void> = [];
  private readonly frameCallbacks = new Set<FrameCallback>();
  private readonly layoutSubscribers = new Set<FrameCallback>();
  private readonly subscribers = new Set<(snapshot: MarkweaveDocumentViewportSnapshot) => void>();
  private readonly scrollSamples = new Map<EventTarget, ScrollSample>();
  private readonly scrollExtents = new Map<EventTarget, number>();
  private readonly endAnchoredScrollTargets = new Set<EventTarget>();
  private readonly pinnedElements = new Map<HTMLElement, number>();
  private readonly expandedDetails = new Map<HTMLElement, number>();
  private readonly lifetimeController = new AbortController();
  private frameId: number | null = null;
  private frameFallbackId: number | null = null;
  private rapidTimer: number | null = null;
  private idleTimer: number | null = null;
  private scrollState: "idle" | "scrolling" | "rapid" = "idle";
  private navigationController: AbortController | null = null;
  private navigating = false;
  private outputDepth = 0;
  private endAnchorCorrectionFrames = 0;
  private destroyed = false;
  private snapshotDirty = true;

  constructor(readonly editor: Editor) {
    this.surface = editor.view.dom;
    const ownerWindow = this.surface.ownerDocument.defaultView;
    if (!ownerWindow) {
      throw new Error("Markweave viewport coordination requires a Window-backed editor DOM.");
    }
    this.ownerWindow = ownerWindow;
    this.signal = this.lifetimeController.signal;
    this.scrollAncestors = findScrollAncestors(this.surface, ownerWindow);
    this.visualWork = new MarkweaveVisualWorkScheduler({
      ownerWindow,
      scheduleFrame: (callback) => this.scheduleFrameTask(callback),
      onPendingCountChange: () => this.markSnapshotDirty(),
    });

    this.listenForViewportChanges();
    const handleEditorDestroy = () => this.destroy();
    editor.on("destroy", handleEditorDestroy);
    this.cleanupCallbacks.push(() => editor.off("destroy", handleEditorDestroy));
    coordinatorByEditor.set(editor, this);
    coordinatorBySurface.set(this.surface, this);
    publishCoordinator(this.surface, this);
    this.scheduleFrame();
  }

  get snapshot(): MarkweaveDocumentViewportSnapshot {
    return {
      pendingVisualWork: this.visualWork.pendingCount,
      state: this.currentState(),
    };
  }

  subscribe(callback: (snapshot: MarkweaveDocumentViewportSnapshot) => void) {
    this.subscribers.add(callback);
    callback(this.snapshot);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  subscribeLayout(callback: FrameCallback) {
    this.layoutSubscribers.add(callback);
    callback();
    return () => {
      this.layoutSubscribers.delete(callback);
    };
  }

  scheduleFrameTask(callback: FrameCallback) {
    if (this.destroyed) {
      return () => undefined;
    }
    this.frameCallbacks.add(callback);
    this.scheduleFrame();
    return () => {
      this.frameCallbacks.delete(callback);
    };
  }

  nextFrame(signal?: AbortSignal) {
    return new Promise<boolean>((resolve) => {
      if (this.destroyed || this.signal.aborted || signal?.aborted) {
        resolve(false);
        return;
      }

      let cancelFrame: () => void = () => undefined;
      const finish = (completed: boolean) => {
        cancelFrame();
        signal?.removeEventListener("abort", abort);
        this.signal.removeEventListener("abort", abort);
        resolve(completed);
      };
      const abort = () => finish(false);
      cancelFrame = this.scheduleFrameTask(() => finish(true));
      signal?.addEventListener("abort", abort, { once: true });
      this.signal.addEventListener("abort", abort, { once: true });
    });
  }

  getVisibleBounds() {
    const rects = [windowRect(this.ownerWindow)];
    this.scrollAncestors.forEach((ancestor) => rects.push(ancestor.getBoundingClientRect()));
    return rectIntersection(rects);
  }

  positionAtViewportOffset(offset = 96) {
    const bounds = this.getVisibleBounds();
    const surfaceRect = this.surface.getBoundingClientRect();
    const left = Math.max(bounds.left + 1, Math.min(surfaceRect.left + 16, bounds.right - 1));
    const top = Math.max(bounds.top + 1, Math.min(bounds.top + offset, bounds.bottom - 1));

    try {
      return this.editor.view.posAtCoords({ left, top })?.pos ?? null;
    } catch {
      return null;
    }
  }

  pinPosition(pos: number) {
    const releases: Array<() => void> = [];
    const topLevelDom = asHtmlElement(this.editor.view.nodeDOM(topLevelPosition(this.editor, pos)));
    if (topLevelDom) {
      releases.push(this.retainAttribute(topLevelDom, this.pinnedElements, "data-markweave-viewport-pinned"));
    }
    releases.push(...this.expandContainingDetails(pos));

    return () => releases.splice(0).reverse().forEach((release) => release());
  }

  beginOutput() {
    if (this.destroyed) {
      return () => undefined;
    }
    this.outputDepth += 1;
    this.surface.setAttribute("data-markweave-output", "true");
    this.syncVisualWorkSuspension();
    this.markSnapshotDirty();

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.outputDepth = Math.max(0, this.outputDepth - 1);
      if (this.outputDepth === 0) {
        this.surface.removeAttribute("data-markweave-output");
      }
      this.syncVisualWorkSuspension();
      this.markSnapshotDirty();
    };
  }

  async revealPosition(pos: number, options: MarkweaveRevealPositionOptions): Promise<MarkweaveRevealPositionResult> {
    const clampedPos = Math.max(0, Math.min(pos, this.editor.state.doc.content.size));
    if (this.destroyed) {
      return { correctionCount: 0, finalErrorPx: null, pos: clampedPos, status: "destroyed" };
    }

    this.navigationController?.abort();
    const controller = new AbortController();
    this.navigationController = controller;
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) {
      controller.abort();
    }

    this.navigating = true;
    this.markSnapshotDirty();
    let releasePin: () => void = () => undefined;
    let correctionCount = 0;
    let correctionRound = 0;
    let finalErrorPx: number | null = null;

    try {
      releasePin = this.pinPosition(clampedPos);
      if (!await this.nextFrame(controller.signal) || !await this.nextFrame(controller.signal)) {
        return { correctionCount, finalErrorPx, pos: clampedPos, status: "cancelled" };
      }

      const target = getPositionElement(this.editor, clampedPos);
      if (!target) {
        return { correctionCount, finalErrorPx, pos: clampedPos, status: "missing" };
      }

      if (options.focus) {
        focusEditorPosition(this.editor, clampedPos);
      }

      const align = options.align ?? (options.reason === "toc" ? "start" : "center");
      const scrollContainers = this.getScrollContainerChain(target);
      const startedAt = this.now();
      let behavior = this.normalizeScrollBehavior(options.behavior ?? (options.reason === "toc" ? "smooth" : "auto"));

      while (!controller.signal.aborted && correctionRound < revealCorrectionLimit && this.now() - startedAt <= revealCorrectionWindowMs) {
        let targetRect = getPositionRect(this.editor, clampedPos, target);
        const viewport = this.getVisibleBounds();
        finalErrorPx = getAlignmentError(targetRect, viewport, align);
        if (
          Math.abs(finalErrorPx) <= revealTolerancePx
          && isRectVisibleWithin(targetRect, viewport)
          && scrollContainers.every((container) => isRectVisibleWithin(targetRect, this.getScrollContainerBounds(container)))
        ) {
          break;
        }

        let scrolled = false;
        for (const container of scrollContainers) {
          const containerBounds = this.getScrollContainerBounds(container);
          const containerError = getAlignmentError(targetRect, containerBounds, align);
          if (Math.abs(containerError) <= revealTolerancePx && isRectVisibleWithin(targetRect, containerBounds)) {
            continue;
          }
          const nextBehavior = Math.abs(containerError) > Math.max(1, containerBounds.height) * 2 || options.reason === "search"
            ? "auto"
            : behavior;
          this.scrollBy(container, containerError, nextBehavior);
          behavior = "auto";
          correctionCount += 1;
          scrolled = true;
          targetRect = getPositionRect(this.editor, clampedPos, target);
        }

        correctionRound += 1;
        if (!scrolled || !await this.nextFrame(controller.signal)) {
          break;
        }
      }

      const finalTargetRect = getPositionRect(this.editor, clampedPos, target);
      const finalViewport = this.getVisibleBounds();
      finalErrorPx = getAlignmentError(finalTargetRect, finalViewport, align);
      const revealed = Math.abs(finalErrorPx) <= revealTolerancePx
        && isRectVisibleWithin(finalTargetRect, finalViewport)
        && scrollContainers.every((container) => isRectVisibleWithin(finalTargetRect, this.getScrollContainerBounds(container)));

      return {
        correctionCount,
        finalErrorPx,
        pos: clampedPos,
        status: controller.signal.aborted ? "cancelled" : revealed ? "revealed" : "unresolved",
      };
    } finally {
      options.signal?.removeEventListener("abort", abort);
      releasePin();
      if (this.navigationController === controller) {
        this.navigationController = null;
        this.navigating = false;
        this.markSnapshotDirty();
      }
    }
  }

  cancelNavigation() {
    this.navigationController?.abort();
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.lifetimeController.abort();
    this.cancelNavigation();
    this.navigationController = null;
    this.visualWork.destroy();
    this.cleanupCallbacks.splice(0).reverse().forEach((cleanup) => cleanup());
    this.cancelFrame();
    if (this.rapidTimer !== null) {
      this.ownerWindow.clearTimeout(this.rapidTimer);
    }
    if (this.idleTimer !== null) {
      this.ownerWindow.clearTimeout(this.idleTimer);
    }
    this.pinnedElements.forEach((_count, element) => element.removeAttribute("data-markweave-viewport-pinned"));
    this.expandedDetails.forEach((_count, element) => element.removeAttribute("data-markweave-reveal-open"));
    this.pinnedElements.clear();
    this.expandedDetails.clear();
    this.surface.removeAttribute("data-markweave-output");
    this.surface.removeAttribute("data-markweave-viewport-state");
    this.subscribers.clear();
    this.layoutSubscribers.clear();
    if (coordinatorByEditor.get(this.editor) === this) {
      coordinatorByEditor.delete(this.editor);
    }
    if (coordinatorBySurface.get(this.surface) === this) {
      coordinatorBySurface.delete(this.surface);
      publishCoordinator(this.surface, null);
    }
  }

  private listenForViewportChanges() {
    const scrollTargets: EventTarget[] = [this.ownerWindow, ...this.scrollAncestors];
    if (this.ownerWindow.visualViewport) {
      scrollTargets.push(this.ownerWindow.visualViewport);
    }

    scrollTargets.forEach((target) => {
      this.scrollExtents.set(target, this.getScrollExtent(target));
      const listener = () => this.handleScroll(target);
      target.addEventListener("scroll", listener, { passive: true });
      this.cleanupCallbacks.push(() => target.removeEventListener("scroll", listener));
    });

    const resize = () => {
      this.refreshScrollExtents();
      this.scheduleFrame();
    };
    this.ownerWindow.addEventListener("resize", resize, { passive: true });
    this.cleanupCallbacks.push(() => this.ownerWindow.removeEventListener("resize", resize));
    this.ownerWindow.visualViewport?.addEventListener("resize", resize, { passive: true });
    this.cleanupCallbacks.push(() => this.ownerWindow.visualViewport?.removeEventListener("resize", resize));

    const ResizeObserverCtor = (this.ownerWindow as Window & {
      readonly ResizeObserver?: typeof ResizeObserver;
    }).ResizeObserver ?? globalThis.ResizeObserver;
    if (ResizeObserverCtor) {
      const observer = new ResizeObserverCtor(() => {
        this.refreshScrollExtents();
        this.scheduleFrame();
      });
      observer.observe(this.surface);
      this.scrollAncestors.forEach((ancestor) => observer.observe(ancestor));
      this.cleanupCallbacks.push(() => observer.disconnect());
    }
  }

  private handleScroll(target: EventTarget) {
    const time = this.now();
    const offset = getScrollOffset(target, this.ownerWindow);
    const previous = this.scrollSamples.get(target);
    const previousExtent = this.scrollExtents.get(target) ?? this.getScrollExtent(target);
    const viewportSize = this.getScrollViewportSize(target);
    const previouslyAtEnd = Boolean(
      previous
      && previousExtent > viewportSize + 1
      && previous.y + viewportSize >= previousExtent - 8
    );
    this.scrollExtents.set(target, this.getScrollExtent(target));
    this.scrollSamples.set(target, { ...offset, time });
    const elapsed = previous ? Math.max(1, time - previous.time) : Number.POSITIVE_INFINITY;
    const distance = previous ? Math.hypot(offset.x - previous.x, offset.y - previous.y) : 0;
    const velocity = distance / elapsed;
    if (this.isAtScrollEnd(target) || previouslyAtEnd) {
      this.endAnchoredScrollTargets.add(target);
      this.endAnchorCorrectionFrames = revealCorrectionLimit;
    } else {
      this.endAnchoredScrollTargets.delete(target);
    }

    if (velocity >= rapidScrollVelocity) {
      this.scrollState = "rapid";
    } else if (this.scrollState !== "rapid") {
      this.scrollState = "scrolling";
    }

    if (this.rapidTimer !== null) {
      this.ownerWindow.clearTimeout(this.rapidTimer);
    }
    this.rapidTimer = this.ownerWindow.setTimeout(() => {
      this.rapidTimer = null;
      if (this.scrollState === "rapid") {
        this.scrollState = "scrolling";
        this.syncVisualWorkSuspension();
        this.markSnapshotDirty();
      }
    }, rapidExitDelayMs);

    if (this.idleTimer !== null) {
      this.ownerWindow.clearTimeout(this.idleTimer);
    }
    this.idleTimer = this.ownerWindow.setTimeout(() => {
      this.idleTimer = null;
      this.scrollState = "idle";
      this.syncVisualWorkSuspension();
      this.markSnapshotDirty();
    }, idleDelayMs);

    this.syncVisualWorkSuspension();
    this.markSnapshotDirty();
  }

  private scheduleFrame() {
    if (this.destroyed || this.frameId !== null || this.frameFallbackId !== null) {
      return;
    }
    if (typeof this.ownerWindow.requestAnimationFrame === "function") {
      this.frameId = this.ownerWindow.requestAnimationFrame(() => {
        this.frameId = null;
        this.flushFrame();
      });
      return;
    }
    this.frameFallbackId = this.ownerWindow.setTimeout(() => {
      this.frameFallbackId = null;
      this.flushFrame();
    }, 16);
  }

  private cancelFrame() {
    if (this.frameId !== null) {
      this.ownerWindow.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    if (this.frameFallbackId !== null) {
      this.ownerWindow.clearTimeout(this.frameFallbackId);
      this.frameFallbackId = null;
    }
  }

  private flushFrame() {
    if (this.destroyed) {
      return;
    }
    const callbacks = [...this.frameCallbacks];
    this.frameCallbacks.clear();
    callbacks.forEach((callback) => callback());
    this.layoutSubscribers.forEach((subscriber) => subscriber());
    if (this.endAnchorCorrectionFrames > 0 && this.endAnchoredScrollTargets.size > 0) {
      this.restoreEndAnchors();
      this.endAnchorCorrectionFrames -= 1;
      if (this.endAnchorCorrectionFrames > 0) this.scheduleFrame();
    }

    if (this.snapshotDirty) {
      this.snapshotDirty = false;
      const snapshot = this.snapshot;
      this.surface.dataset.markweaveViewportState = snapshot.state;
      this.subscribers.forEach((subscriber) => subscriber(snapshot));
    }
  }

  private markSnapshotDirty() {
    this.snapshotDirty = true;
    this.scheduleFrame();
  }

  private currentState(): MarkweaveDocumentViewportState {
    if (this.outputDepth > 0) {
      return "output";
    }
    if (this.navigating) {
      return "navigating";
    }
    return this.scrollState;
  }

  private isAtScrollEnd(target: EventTarget) {
    if (target === this.ownerWindow || target === this.ownerWindow.visualViewport) {
      const scrollingElement = this.surface.ownerDocument.scrollingElement;
      if (!scrollingElement) return false;
      if (scrollingElement.scrollHeight <= this.ownerWindow.innerHeight + 1) return false;
      return this.ownerWindow.scrollY + this.ownerWindow.innerHeight
        >= scrollingElement.scrollHeight - 8;
    }
    return isHtmlElement(target)
      && target.scrollHeight > target.clientHeight + 1
      && target.scrollTop + target.clientHeight >= target.scrollHeight - 8;
  }

  private getScrollExtent(target: EventTarget) {
    if (target === this.ownerWindow || target === this.ownerWindow.visualViewport) {
      return this.surface.ownerDocument.scrollingElement?.scrollHeight ?? 0;
    }
    return isHtmlElement(target) ? target.scrollHeight : 0;
  }

  private getScrollViewportSize(target: EventTarget) {
    if (target === this.ownerWindow || target === this.ownerWindow.visualViewport) {
      return this.ownerWindow.innerHeight;
    }
    return isHtmlElement(target) ? target.clientHeight : 0;
  }

  private refreshScrollExtents() {
    this.scrollExtents.forEach((previousExtent, target) => {
      const nextExtent = this.getScrollExtent(target);
      this.scrollExtents.set(target, nextExtent);
      if (
        nextExtent > previousExtent + 1
        && this.endAnchoredScrollTargets.has(target)
      ) {
        this.endAnchorCorrectionFrames = revealCorrectionLimit;
      }
    });
  }

  private restoreEndAnchors() {
    this.endAnchoredScrollTargets.forEach((target) => {
      if (target === this.ownerWindow || target === this.ownerWindow.visualViewport) {
        const scrollingElement = this.surface.ownerDocument.scrollingElement;
        if (scrollingElement) {
          this.ownerWindow.scrollTo({ behavior: "auto", top: scrollingElement.scrollHeight });
        }
      } else if (isHtmlElement(target)) {
        target.scrollTop = target.scrollHeight;
      }
    });
  }

  private syncVisualWorkSuspension() {
    this.visualWork.setSuspended(this.outputDepth === 0 && this.scrollState === "rapid");
  }

  private expandContainingDetails(pos: number) {
    const releases: Array<() => void> = [];
    const clamped = Math.max(0, Math.min(pos, this.editor.state.doc.content.size));
    const resolved = this.editor.state.doc.resolve(clamped);
    for (let depth = 1; depth <= resolved.depth; depth += 1) {
      if (resolved.node(depth).type.name !== "markweaveDetails") {
        continue;
      }
      const detailsDom = asHtmlElement(this.editor.view.nodeDOM(resolved.before(depth)));
      if (detailsDom) {
        releases.push(this.retainAttribute(detailsDom, this.expandedDetails, "data-markweave-reveal-open"));
      }
    }
    return releases;
  }

  private retainAttribute(element: HTMLElement, counts: Map<HTMLElement, number>, attribute: string) {
    counts.set(element, (counts.get(element) ?? 0) + 1);
    element.setAttribute(attribute, "true");
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      const nextCount = (counts.get(element) ?? 1) - 1;
      if (nextCount <= 0) {
        counts.delete(element);
        element.removeAttribute(attribute);
      } else {
        counts.set(element, nextCount);
      }
    };
  }

  private getScrollContainerChain(target: HTMLElement): readonly (HTMLElement | Window)[] {
    return [
      ...this.scrollAncestors.filter((ancestor) => ancestor.contains(target)),
      this.ownerWindow,
    ];
  }

  private getScrollContainerBounds(container: HTMLElement | Window) {
    return isHtmlElement(container)
      ? container.getBoundingClientRect()
      : windowRect(this.ownerWindow);
  }

  private scrollBy(container: HTMLElement | Window, top: number, behavior: ScrollBehavior) {
    if (isHtmlElement(container)) {
      if (typeof container.scrollBy === "function") {
        container.scrollBy({ behavior, left: 0, top });
      } else {
        container.scrollTop += top;
      }
      return;
    }

    container.scrollBy({ behavior, left: 0, top });
  }

  private normalizeScrollBehavior(behavior: ScrollBehavior) {
    return this.ownerWindow.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : behavior;
  }

  private now() {
    return this.ownerWindow.performance?.now() ?? Date.now();
  }
}

export function createMarkweaveDocumentViewportCoordinator(editor: Editor) {
  return coordinatorByEditor.get(editor) ?? new MarkweaveDocumentViewportCoordinator(editor);
}

export function getMarkweaveDocumentViewportCoordinator(editor: Editor) {
  return coordinatorByEditor.get(editor) ?? null;
}

export function getMarkweaveDocumentViewportCoordinatorForElement(element: Element) {
  const surface = getEditorSurfaceForElement(element);
  return surface ? coordinatorBySurface.get(surface) ?? null : null;
}

export function subscribeToMarkweaveDocumentViewportCoordinatorForElement(
  element: Element,
  subscriber: (coordinator: MarkweaveDocumentViewportCoordinator | null) => void,
) {
  const surface = getEditorSurfaceForElement(element);
  if (!surface) {
    subscriber(null);
    return () => undefined;
  }

  const subscribers = coordinatorSubscribersBySurface.get(surface) ?? new Set();
  subscribers.add(subscriber);
  coordinatorSubscribersBySurface.set(surface, subscribers);
  subscriber(coordinatorBySurface.get(surface) ?? null);

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      coordinatorSubscribersBySurface.delete(surface);
    }
  };
}
