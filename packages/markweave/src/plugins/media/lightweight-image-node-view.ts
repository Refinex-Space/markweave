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
import { enrollMarkweaveMediaBackstop } from "./media-idle-backstop";
import {
  markweaveResolveVisualResourceEvent,
  type MarkweaveResolveVisualResourceEventDetail,
} from "../../editor-core/document-output";
import { getMarkweaveDocumentViewportCoordinatorForElement } from "../../core/document-viewport";
import {
  resolveMarkweaveMediaSource,
  type MarkweaveMediaPriority,
  type MarkweaveMediaResolveReason,
  type MarkweaveMediaSourceResolver,
  type MarkweaveMediaSourceResult,
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

const mediaSourceResolveTimeoutMs = 8_000;
const imageLoadTimeoutMs = 12_000;
const automaticRetryDelaysMs = [250, 1_000] as const;
const terminalRecoveryCooldownsMs = [2_000, 5_000, 30_000] as const;
let nextLightweightImageNodeViewId = 1;

type MarkweaveImageAttemptCancellation =
  | "destroy"
  | "output"
  | "scheduler"
  | "source-change"
  | "superseded"
  | "timeout";

interface MarkweaveImageResolutionAttempt {
  readonly id: number;
  readonly generation: number;
  readonly persistedSource: string;
  readonly priority: MarkweaveMediaPriority;
  readonly reason: MarkweaveMediaResolveReason;
  readonly attempt: number;
  readonly controller: AbortController;
  readonly resolverStage: Promise<void>;
  readonly finishResolverStage: () => void;
  cancellation: MarkweaveImageAttemptCancellation | null;
  candidateImage: HTMLImageElement | null;
  candidateSource: string | null;
}

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
  private image: HTMLImageElement;
  private readonly placeholder: HTMLDivElement;
  private readonly caption: HTMLElement;
  private readonly unsubscribeMode: () => void;
  private readonly nodeViewId = nextLightweightImageNodeViewId++;
  private observer: IntersectionObserver | null = null;
  private activeAttempt: MarkweaveImageResolutionAttempt | null = null;
  private sourceGeneration = 0;
  private attemptCount = 0;
  private automaticRetriesUsed = 0;
  private retryTimer: number | null = null;
  private retryPriority: MarkweaveMediaPriority = "background";
  private retryReason: MarkweaveMediaResolveReason = "retry";
  private retryTerminalState: "missing" | "unreadable" = "unreadable";
  private terminalRecoveryCount = 0;
  private recoveryNotBefore = 0;
  private resolvedSource: string | null = null;
  private resolvedSrc: string | null = null;
  private mountCheckScheduled = false;
  private mountCheckTimer: number | null = null;
  private unsubscribeViewportWake: (() => void) | null = null;
  private unenrollBackstop: (() => void) | null = null;
  private cancelVisualWork: (() => void) | null = null;
  private unsubscribeRecoveryLayout: (() => void) | null = null;
  private readonly resolutionWaiters = new Set<() => void>();
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
    const ownerDocument = props.view.dom.ownerDocument;
    this.dom = ownerDocument.createElement("figure");
    this.dom.className = "markweave-image-node";
    this.dom.dataset.testid = "markweave-image-node";
    this.dom.dataset.markweaveLightweightImage = "true";

    this.box = ownerDocument.createElement("div");
    this.box.className = "markweave-image-box";
    this.image = this.createImageElement();
    this.placeholder = ownerDocument.createElement("div");
    this.placeholder.className = "markweave-image-readonly-empty";
    this.placeholder.setAttribute("aria-hidden", "true");
    this.caption = ownerDocument.createElement("figcaption");
    this.caption.className = "markweave-image-caption";
    this.caption.dataset.testid = "markweave-image-caption";
    this.box.append(this.image, this.placeholder);
    this.dom.append(this.box, this.caption);

    this.dom.addEventListener("mousedown", this.handleMouseDown);
    this.dom.addEventListener("dblclick", this.handleDoubleClick);
    this.dom.addEventListener(markweaveResolveVisualResourceEvent, this.handleOutputResolution);
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
    this.enrollResolutionBackstop();
  }

  update(node: NodeViewRendererProps["node"]) {
    if (node.type !== this.node.type) {
      return false;
    }

    const previousSrc = stringAttribute(this.node.attrs.src);
    const nextSrc = stringAttribute(node.attrs.src);
    if (previousSrc && !nextSrc) {
      return false;
    }
    this.node = node;
    this.renderNodeAttributes();

    if (previousSrc !== nextSrc) {
      this.resetForSourceChange();
      this.startViewportWakeListeners();
      this.scheduleMountedProximityCheck();
      this.enrollResolutionBackstop();
    }

    return true;
  }

  selectNode() {
    this.dom.dataset.selected = "true";
    this.mountEditingControls();
    void this.resolveSource("visible", undefined, "viewport", true);
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
    this.clearRetryTimer();
    this.cancelActiveAttempt("destroy", true);
    this.cancelVisualWork?.();
    this.cancelVisualWork = null;
    this.observer?.disconnect();
    this.clearMountedProximityCheck();
    this.stopViewportWakeListeners();
    this.stopRecoveryLayoutSubscription();
    this.dropResolutionBackstop();
    this.unsubscribeMode();
    this.unmountEditingControls();
    this.previewTrigger?.remove();
    this.previewTrigger = null;
    this.dom.removeEventListener("mousedown", this.handleMouseDown);
    this.dom.removeEventListener("dblclick", this.handleDoubleClick);
    this.dom.removeEventListener(markweaveResolveVisualResourceEvent, this.handleOutputResolution);
    this.notifyResolutionStateChanged();
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
    const ownerWindow = this.dom.ownerDocument.defaultView;
    const IntersectionObserverCtor = ownerWindow?.IntersectionObserver ?? globalThis.IntersectionObserver;
    if (!IntersectionObserverCtor) {
      void this.resolveSource("visible", undefined, "initial");
      return;
    }

    this.observer = new IntersectionObserverCtor(
      (entries) => {
        if (!this.canRunAutomaticRecovery()) {
          return;
        }
        const entry = entries[0];
        if (!entry?.isIntersecting) {
          return;
        }

        const viewportHeight = entry.rootBounds?.height ?? ownerWindow?.innerHeight ?? 0;
        const visible =
          entry.boundingClientRect.bottom >= 0 &&
          entry.boundingClientRect.top <= viewportHeight;
        void this.resolveSource(
          visible ? "visible" : "nearby",
          undefined,
          "viewport",
        );
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
    // Check recovery state before any geometry read. A document with many
    // terminal media failures must not force O(N) layout work every frame.
    if (!this.canRunAutomaticRecovery()) {
      return false;
    }

    const ownerWindow = this.dom.ownerDocument.defaultView;
    if (!ownerWindow) {
      void this.resolveSource("visible", undefined, "initial");
      return true;
    }

    const viewportCoordinator = getMarkweaveDocumentViewportCoordinatorForElement(this.dom);
    const coordinatedBounds = viewportCoordinator?.getVisibleBounds();
    const viewportTop = coordinatedBounds?.top ?? 0;
    const viewportBottom = coordinatedBounds?.bottom ?? Math.max(
      this.dom.ownerDocument.documentElement.clientHeight,
      ownerWindow.innerHeight,
    );
    const viewportHeight = Math.max(1, viewportBottom - viewportTop);
    const bounds = this.dom.getBoundingClientRect();
    const nearMargin = viewportHeight * 3;
    if (
      bounds.bottom < viewportTop - nearMargin ||
      bounds.top > viewportBottom + nearMargin
    ) {
      return false;
    }

    const visible = bounds.bottom >= viewportTop && bounds.top <= viewportBottom;
    void this.resolveSource(
      visible ? "visible" : "nearby",
      undefined,
      this.attemptCount === 0 ? "initial" : "viewport",
    );
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

  private enrollResolutionBackstop() {
    if (this.unenrollBackstop || this.destroyed) {
      return;
    }
    if (!stringAttribute(this.node.attrs.src)) {
      return;
    }
    this.unenrollBackstop = enrollMarkweaveMediaBackstop(
      this.dom.ownerDocument,
      () => {
        // The backstop already removed this job before invoking it; drop the
        // stored unenroll handle so resolveSource does not mutate the drain's
        // pending set while it is iterating.
        this.unenrollBackstop = null;
        void this.resolveSource(
          "background",
          undefined,
          this.attemptCount === 0 ? "initial" : "retry",
        );
      },
    );
  }

  private dropResolutionBackstop() {
    this.unenrollBackstop?.();
    this.unenrollBackstop = null;
  }

  /**
   * Resolves only through candidate source assignment. The visual scheduler must
   * not wait for an arbitrary network image to finish before starting the next
   * item. Output callers use resolveForOutput(), which waits for the full state
   * machine including image load, bounded retries, and terminal failure.
   */
  private resolveSource(
    priority: MarkweaveMediaPriority,
    schedulerSignal?: AbortSignal,
    reason: MarkweaveMediaResolveReason = "viewport",
    bypassRecoveryCooldown = false,
  ): Promise<void> {
    const src = stringAttribute(this.node.attrs.src);
    if (!src || this.destroyed || schedulerSignal?.aborted) {
      return Promise.resolve();
    }
    if (
      !bypassRecoveryCooldown &&
      reason !== "output" &&
      !this.canRunAutomaticRecovery()
    ) {
      return Promise.resolve();
    }
    const viewportCoordinator = getMarkweaveDocumentViewportCoordinatorForElement(this.dom);
    if (
      priority !== "visible" &&
      viewportCoordinator?.snapshot.state === "rapid"
    ) {
      this.cancelVisualWork?.();
      let rawPos: number | undefined;
      try {
        const candidatePos = this.props.getPos?.();
        rawPos = typeof candidatePos === "number" ? candidatePos : undefined;
      } catch {
        rawPos = undefined;
      }
      const handle = viewportCoordinator.visualWork.schedule({
        key: `image:${this.nodeViewId}:${rawPos ?? "detached"}`,
        lane: priority === "nearby" ? "nearby" : "idle",
        pos: rawPos,
        revision: this.props.editor.state.doc.content.size,
        sourceHash: src,
        run: (signal) => this.resolveSource(
          priority,
          signal,
          reason,
          bypassRecoveryCooldown,
        ),
      });
      const cancelVisualWork = handle.cancel;
      this.cancelVisualWork = cancelVisualWork;
      void handle.promise.then((result) => {
        if (this.cancelVisualWork === cancelVisualWork) {
          this.cancelVisualWork = null;
          this.notifyResolutionStateChanged();
        }
        if (
          result !== "completed" &&
          !this.destroyed &&
          this.activeAttempt === null &&
          this.retryTimer === null &&
          this.resolvedSource !== src &&
          stringAttribute(this.node.attrs.src) === src
        ) {
          this.enrollResolutionBackstop();
          this.scheduleMountedProximityCheck();
        }
      });
      this.notifyResolutionStateChanged();
      return handle.promise.then(() => undefined);
    }
    if (!schedulerSignal) {
      this.cancelVisualWork?.();
      this.cancelVisualWork = null;
    }
    if (priority === "visible" || reason === "output") {
      this.clearRetryTimer();
    } else if (this.retryTimer !== null) {
      return Promise.resolve();
    }

    if (this.resolvedSource === src && this.dom.dataset.mediaState === "resolved") {
      return Promise.resolve();
    }

    const current = this.activeAttempt;
    if (
      current &&
      current.persistedSource === src &&
      current.generation === this.sourceGeneration &&
      !current.controller.signal.aborted
    ) {
      const candidateAlreadyLoading = Boolean(current.candidateImage);
      if (
        candidateAlreadyLoading ||
        current.priority === "visible" ||
        priority !== "visible"
      ) {
        return current.resolverStage;
      }
      this.cancelActiveAttempt("superseded", true);
    } else if (current) {
      this.cancelActiveAttempt("superseded", true);
    }

    this.dropResolutionBackstop();
    this.stopRecoveryLayoutSubscription();
    this.setMediaState("pending");
    this.startViewportWakeListeners();
    const controller = new AbortController();
    const attemptNumber = this.attemptCount + 1;
    this.attemptCount = attemptNumber;
    let finishResolverStage: () => void = () => undefined;
    const resolverStage = new Promise<void>((resolve) => {
      finishResolverStage = resolve;
    });
    const active: MarkweaveImageResolutionAttempt = {
      attempt: attemptNumber,
      cancellation: null,
      candidateImage: null,
      candidateSource: null,
      controller,
      finishResolverStage,
      generation: this.sourceGeneration,
      id: attemptNumber,
      persistedSource: src,
      priority,
      reason,
      resolverStage,
    };
    this.activeAttempt = active;
    this.notifyResolutionStateChanged();

    const abortFromScheduler = () => {
      if (this.isCurrentAttempt(active)) {
        active.cancellation = "scheduler";
      }
      controller.abort();
    };
    schedulerSignal?.addEventListener("abort", abortFromScheduler, { once: true });
    void resolverStage.finally(() => {
      schedulerSignal?.removeEventListener("abort", abortFromScheduler);
    });
    void this.runResolutionAttempt(active);
    return resolverStage;
  }

  private async runResolutionAttempt(active: MarkweaveImageResolutionAttempt) {
    const sourceOutcome = await this.resolveCandidateSource(active);
    active.finishResolverStage();

    if (!this.isCurrentAttempt(active)) {
      return;
    }
    if (sourceOutcome.type !== "resolved") {
      if (sourceOutcome.type === "aborted") {
        if (active.cancellation === "scheduler" || active.cancellation === "output") {
          this.failAttempt(
            active,
            "unreadable",
            active.reason === "output" ? "output" : "retry",
          );
        }
      } else if (sourceOutcome.type === "missing") {
        this.failAttempt(
          active,
          "missing",
          active.reason === "output" ? "output" : "retry",
        );
      } else {
        this.failAttempt(
          active,
          "unreadable",
          active.reason === "output" ? "output" : "retry",
        );
      }
      return;
    }

    const imageOutcome = await this.loadCandidateImage(active, sourceOutcome.result);
    if (!this.isCurrentAttempt(active)) {
      return;
    }
    if (imageOutcome === "loaded") {
      this.commitResolvedImage(active, sourceOutcome.result);
      return;
    }
    if (imageOutcome === "aborted") {
      if (active.cancellation === "scheduler" || active.cancellation === "output") {
        this.failAttempt(
          active,
          "unreadable",
          active.reason === "output" ? "output" : "retry",
        );
      }
      return;
    }
    this.failAttempt(
      active,
      "unreadable",
      active.reason === "output" ? "output" : "image-error",
    );
  }

  private resolveCandidateSource(active: MarkweaveImageResolutionAttempt) {
    type SourceOutcome =
      | { readonly type: "resolved"; readonly result: MarkweaveMediaSourceResult }
      | { readonly type: "missing" }
      | { readonly type: "error" }
      | { readonly type: "timeout" }
      | { readonly type: "aborted" };

    return new Promise<SourceOutcome>((resolve) => {
      const ownerWindow = this.dom.ownerDocument.defaultView;
      let settled = false;
      let timeout: number | null = null;
      const finish = (outcome: SourceOutcome) => {
        if (settled) return;
        settled = true;
        if (timeout !== null) ownerWindow?.clearTimeout(timeout);
        active.controller.signal.removeEventListener("abort", aborted);
        resolve(outcome);
      };
      const aborted = () => finish({ type: "aborted" });
      active.controller.signal.addEventListener("abort", aborted, { once: true });
      if (ownerWindow) {
        timeout = ownerWindow.setTimeout(() => {
          active.cancellation = "timeout";
          finish({ type: "timeout" });
          active.controller.abort();
        }, mediaSourceResolveTimeoutMs);
      }

      void resolveMarkweaveMediaSource(this.options.resolveMediaSource, {
        attempt: active.attempt,
        kind: "image",
        priority: active.priority,
        reason: active.reason,
        signal: active.controller.signal,
        src: active.persistedSource,
      }).then(
        (result) => finish(result ? { result, type: "resolved" } : { type: "missing" }),
        () => finish({ type: "error" }),
      );

      if (active.controller.signal.aborted) aborted();
    });
  }

  private loadCandidateImage(
    active: MarkweaveImageResolutionAttempt,
    result: MarkweaveMediaSourceResult,
  ) {
    type ImageOutcome = "loaded" | "error" | "timeout" | "aborted";
    const image = this.image.hasAttribute("src")
      ? this.replaceImageElement()
      : this.image;
    active.candidateImage = image;
    active.candidateSource = result.src;
    if (result.width && result.height) {
      image.width = result.width;
      image.height = result.height;
      if (!this.box.style.aspectRatio) {
        this.box.style.aspectRatio = `${result.width} / ${result.height}`;
      }
    }
    this.setMediaState("pending");

    return new Promise<ImageOutcome>((resolve) => {
      const ownerWindow = this.dom.ownerDocument.defaultView;
      let settled = false;
      let timeout: number | null = null;
      const finish = (outcome: ImageOutcome) => {
        if (settled) return;
        settled = true;
        if (timeout !== null) ownerWindow?.clearTimeout(timeout);
        image.removeEventListener("load", loaded);
        image.removeEventListener("error", failed);
        active.controller.signal.removeEventListener("abort", aborted);
        resolve(outcome);
      };
      const loaded = () => finish("loaded");
      const failed = () => finish("error");
      const aborted = () => finish("aborted");
      image.addEventListener("load", loaded, { once: true });
      image.addEventListener("error", failed, { once: true });
      active.controller.signal.addEventListener("abort", aborted, { once: true });
      if (ownerWindow) {
        timeout = ownerWindow.setTimeout(() => {
          active.cancellation = "timeout";
          finish("timeout");
          active.controller.abort();
        }, imageLoadTimeoutMs);
      }
      image.src = result.src;
      if (image.complete) {
        queueMicrotask(() => {
          if (image.naturalWidth > 0) loaded();
        });
      }
      if (active.controller.signal.aborted) aborted();
    });
  }

  private commitResolvedImage(
    active: MarkweaveImageResolutionAttempt,
    result: MarkweaveMediaSourceResult,
  ) {
    if (!this.isCurrentAttempt(active) || active.candidateImage !== this.image) {
      return;
    }
    this.activeAttempt = null;
    this.resolvedSource = active.persistedSource;
    this.resolvedSrc = result.src;
    this.automaticRetriesUsed = 0;
    this.terminalRecoveryCount = 0;
    this.recoveryNotBefore = 0;
    this.retryTerminalState = "unreadable";
    this.clearRetryTimer();
    this.dropResolutionBackstop();
    this.stopRecoveryLayoutSubscription();
    this.setMediaState("resolved");
  }

  private failAttempt(
    active: MarkweaveImageResolutionAttempt,
    terminalState: "missing" | "unreadable",
    retryReason: MarkweaveMediaResolveReason,
  ) {
    if (!this.isCurrentAttempt(active)) return;
    this.activeAttempt = null;
    this.clearResolvedState();
    if (active.candidateImage) {
      this.replaceImageElement();
    }
    this.startViewportWakeListeners();

    const currentSource = stringAttribute(this.node.attrs.src);
    if (
      currentSource === active.persistedSource &&
      this.automaticRetriesUsed < automaticRetryDelaysMs.length &&
      active.cancellation !== "output" &&
      !this.destroyed
    ) {
      const retryIndex = this.automaticRetriesUsed;
      this.automaticRetriesUsed += 1;
      this.retryPriority = active.priority;
      this.retryReason = retryReason;
      this.retryTerminalState = terminalState;
      this.setMediaState("pending");
      const ownerWindow = this.dom.ownerDocument.defaultView;
      if (ownerWindow) {
        this.retryTimer = ownerWindow.setTimeout(() => {
          this.retryTimer = null;
          this.notifyResolutionStateChanged();
          void this.resolveSource(
            this.retryPriority,
            undefined,
            this.retryReason,
            this.retryReason === "output",
          );
        }, automaticRetryDelaysMs[retryIndex]);
        this.notifyResolutionStateChanged();
        return;
      }
    }
    this.enterTerminalState(terminalState);
  }

  private async resolveForOutput(signal?: AbortSignal) {
    if (this.destroyed || signal?.aborted) return;
    const persistedSource = stringAttribute(this.node.attrs.src);
    if (!persistedSource) return;

    const abort = () => {
      this.clearRetryTimer();
      const active = this.activeAttempt;
      if (
        active &&
        active.persistedSource === persistedSource &&
        this.isCurrentAttempt(active)
      ) {
        active.cancellation = "output";
        active.controller.abort();
      } else if (
        stringAttribute(this.node.attrs.src) === persistedSource &&
        this.dom.dataset.mediaState === "pending"
      ) {
        this.clearResolvedState();
        this.enterTerminalState(this.retryTerminalState);
      }
      this.notifyResolutionStateChanged();
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      void this.resolveSource("visible", undefined, "output", true);
      await this.waitForResolutionSettlement(signal);
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  private waitForResolutionSettlement(signal?: AbortSignal) {
    const settled = () =>
      this.destroyed ||
      signal?.aborted ||
      (
        this.activeAttempt === null &&
        this.retryTimer === null &&
        this.cancelVisualWork === null &&
        this.dom.dataset.mediaState !== "pending"
      );
    if (settled()) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const inspect = () => {
        if (!settled()) return;
        this.resolutionWaiters.delete(inspect);
        signal?.removeEventListener("abort", inspect);
        resolve();
      };
      this.resolutionWaiters.add(inspect);
      signal?.addEventListener("abort", inspect, { once: true });
      inspect();
    });
  }

  private isCurrentAttempt(active: MarkweaveImageResolutionAttempt) {
    return !this.destroyed &&
      this.activeAttempt === active &&
      active.generation === this.sourceGeneration &&
      stringAttribute(this.node.attrs.src) === active.persistedSource;
  }

  private cancelActiveAttempt(
    cancellation: MarkweaveImageAttemptCancellation,
    resetCandidate: boolean,
  ) {
    const active = this.activeAttempt;
    if (!active) return;
    active.cancellation = cancellation;
    active.controller.abort();
    if (this.activeAttempt === active) this.activeAttempt = null;
    if (resetCandidate && active.candidateImage) this.replaceImageElement();
    active.finishResolverStage();
    this.notifyResolutionStateChanged();
  }

  private resetForSourceChange() {
    this.sourceGeneration += 1;
    this.clearRetryTimer();
    this.cancelActiveAttempt("source-change", true);
    this.cancelVisualWork?.();
    this.cancelVisualWork = null;
    this.dropResolutionBackstop();
    this.stopRecoveryLayoutSubscription();
    this.clearResolvedState();
    this.attemptCount = 0;
    this.automaticRetriesUsed = 0;
    this.terminalRecoveryCount = 0;
    this.recoveryNotBefore = 0;
    this.retryTerminalState = "unreadable";
    if (this.image.hasAttribute("src")) this.replaceImageElement();
    this.setMediaState("pending");
  }

  private clearResolvedState() {
    this.resolvedSource = null;
    this.resolvedSrc = null;
  }

  private enterTerminalState(state: "missing" | "unreadable") {
    const recoveryIndex = Math.min(
      this.terminalRecoveryCount,
      terminalRecoveryCooldownsMs.length - 1,
    );
    this.terminalRecoveryCount += 1;
    this.recoveryNotBefore = this.now() + terminalRecoveryCooldownsMs[recoveryIndex];
    this.setMediaState(state);
    this.startRecoveryLayoutSubscription();
  }

  private startRecoveryLayoutSubscription() {
    if (this.unsubscribeRecoveryLayout || this.destroyed) return;
    const coordinator = getMarkweaveDocumentViewportCoordinatorForElement(this.dom);
    if (!coordinator) return;
    let initialNotification = true;
    this.unsubscribeRecoveryLayout = coordinator.subscribeLayout(() => {
      if (initialNotification) {
        initialNotification = false;
        return;
      }
      if (this.destroyed || this.dom.dataset.mediaState === "resolved") {
        this.stopRecoveryLayoutSubscription();
        return;
      }
      if (
        coordinator.snapshot.state === "output" ||
        !this.canRunAutomaticRecovery()
      ) {
        return;
      }
      this.resolveSourceIfNearViewport();
    });
  }

  private stopRecoveryLayoutSubscription() {
    this.unsubscribeRecoveryLayout?.();
    this.unsubscribeRecoveryLayout = null;
  }

  private canRunAutomaticRecovery() {
    if (this.destroyed) return false;
    const coordinator = getMarkweaveDocumentViewportCoordinatorForElement(this.dom);
    if (coordinator?.snapshot.state === "output") return false;
    const state = this.dom.dataset.mediaState;
    if (state !== "missing" && state !== "unreadable") return true;
    return this.now() >= this.recoveryNotBefore;
  }

  private now() {
    const ownerWindow = this.dom.ownerDocument.defaultView;
    return ownerWindow?.performance?.now() ?? Date.now();
  }

  private clearRetryTimer() {
    if (this.retryTimer === null) return;
    this.dom.ownerDocument.defaultView?.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.notifyResolutionStateChanged();
  }

  private createImageElement() {
    const image = this.props.view.dom.ownerDocument.createElement("img");
    image.className = "markweave-image";
    image.setAttribute("loading", "eager");
    image.setAttribute("decoding", "async");
    image.draggable = false;
    return image;
  }

  private replaceImageElement() {
    const previous = this.image;
    const next = this.createImageElement();
    previous.removeAttribute("src");
    previous.replaceWith(next);
    this.image = next;
    this.renderNodeAttributes();
    const resolved = this.dom.dataset.mediaState === "resolved";
    this.image.hidden = !resolved;
    return next;
  }

  private notifyResolutionStateChanged() {
    this.resolutionWaiters.forEach((inspect) => inspect());
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
    if (state === "resolved") {
      this.stopViewportWakeListeners();
      this.stopRecoveryLayoutSubscription();
    } else {
      this.startViewportWakeListeners();
    }
    this.syncPreviewTrigger();
    this.notifyResolutionStateChanged();
  }

  private readonly handleViewportWake = () => {
    if (this.dom.ownerDocument.visibilityState === "hidden") {
      return;
    }
    this.resolveSourceIfNearViewport();
  };

  private readonly handleOutputResolution = (event: Event) => {
    const detail = (event as CustomEvent<MarkweaveResolveVisualResourceEventDetail>).detail;
    const promise = this.resolveForOutput(detail?.signal);
    detail?.waitUntil?.(promise);
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
