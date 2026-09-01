/**
 * Guaranteed idle backstop for media source resolution.
 *
 * The lightweight image NodeView resolves the real source lazily and only when
 * the node is near the viewport (IntersectionObserver + focus/pageshow probes).
 * That fast path never fires for images that stay far from every resting scroll
 * position (long documents navigated by anchor/jump) or that render in an
 * off-screen / hidden / never-focused context (HTML export, print, background
 * measuring container). Those images would otherwise remain unresolved forever.
 *
 * This module drains a per-Document queue during browser idle time and lets each
 * enrolled node force its own resolution, guaranteeing every image eventually
 * loads while keeping first-screen images on the fast path and avoiding a burst
 * of resolver calls on load.
 */

type MarkweaveMediaBackstopJob = () => void;

interface MarkweaveDocumentMediaBackstop {
  readonly pending: Set<MarkweaveMediaBackstopJob>;
  nextDrainToken: number;
  scheduledDrain: MarkweaveScheduledMediaBackstopDrain | null;
}

interface MarkweaveScheduledMediaBackstopDrain {
  readonly token: number;
  idleHandle: number | null;
  watchdogHandle: number | null;
}

interface MarkweaveIdleDeadlineLike {
  readonly didTimeout?: boolean;
  timeRemaining(): number;
}

// Bound how many images we trigger per idle slice so a media-heavy document does
// not fire every resolver call at once; the rest wait for the next idle slice.
const MAX_JOBS_PER_IDLE_SLICE = 12;
// A compliant requestIdleCallback should invoke the callback by this timeout.
// The watchdog below remains necessary because some embedded WebViews expose a
// partial implementation that ignores the timeout or starves the callback.
const IDLE_CALLBACK_TIMEOUT_MS = 250;
const IDLE_WATCHDOG_DELAY_MS = 300;
// Fallback cadence when the environment lacks requestIdleCallback (e.g. jsdom,
// some embedded browsers). Small enough to keep export/print reliable.
const FALLBACK_DRAIN_DELAY_MS = 50;

const documentBackstops = new WeakMap<
  Document,
  MarkweaveDocumentMediaBackstop
>();

/**
 * Enroll a node's "resolve now" job into the shared idle backstop for its
 * document. Returns an unenroll function that must be called once the node has
 * committed to resolving (fast path or backstop) or is destroyed.
 */
export function enrollMarkweaveMediaBackstop(
  ownerDocument: Document,
  job: MarkweaveMediaBackstopJob,
): () => void {
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow) {
    return () => undefined;
  }

  let backstop = documentBackstops.get(ownerDocument);
  if (!backstop) {
    backstop = {
      pending: new Set(),
      nextDrainToken: 0,
      scheduledDrain: null,
    };
    documentBackstops.set(ownerDocument, backstop);
  }

  backstop.pending.add(job);
  scheduleDrain(ownerDocument, backstop);

  return () => {
    const activeBackstop = documentBackstops.get(ownerDocument);
    if (!activeBackstop) {
      return;
    }
    activeBackstop.pending.delete(job);
    if (activeBackstop.pending.size === 0) {
      cancelDrain(ownerDocument, activeBackstop);
      documentBackstops.delete(ownerDocument);
    }
  };
}

function scheduleDrain(
  ownerDocument: Document,
  backstop: MarkweaveDocumentMediaBackstop,
) {
  if (backstop.scheduledDrain) {
    return;
  }
  const ownerWindow = ownerDocument.defaultView as
    | (Window & {
        requestIdleCallback?: (
          callback: (deadline: MarkweaveIdleDeadlineLike) => void,
          options?: { timeout?: number },
        ) => number;
        cancelIdleCallback?: (handle: number) => void;
      })
    | null;
  if (!ownerWindow) {
    return;
  }

  const scheduledDrain: MarkweaveScheduledMediaBackstopDrain = {
    idleHandle: null,
    token: backstop.nextDrainToken + 1,
    watchdogHandle: null,
  };
  backstop.nextDrainToken = scheduledDrain.token;
  backstop.scheduledDrain = scheduledDrain;

  if (typeof ownerWindow.requestIdleCallback === "function") {
    try {
      const idleHandle = ownerWindow.requestIdleCallback((deadline) => {
        runScheduledDrain(
          ownerDocument,
          backstop,
          scheduledDrain.token,
          deadline,
          "idle",
        );
      }, { timeout: IDLE_CALLBACK_TIMEOUT_MS });

      // requestIdleCallback is asynchronous by contract, but this guard keeps
      // a non-conforming WebView from arming a stale watchdog after a sync call.
      if (backstop.scheduledDrain === scheduledDrain) {
        scheduledDrain.idleHandle = idleHandle;
        scheduledDrain.watchdogHandle = ownerWindow.setTimeout(() => {
          runScheduledDrain(
            ownerDocument,
            backstop,
            scheduledDrain.token,
            null,
            "watchdog",
          );
        }, IDLE_WATCHDOG_DELAY_MS);
      } else {
        ownerWindow.cancelIdleCallback?.(idleHandle);
      }
      return;
    } catch {
      // Fall through to a normal timer when a partial WebView implementation
      // exposes requestIdleCallback but throws when options are provided.
    }
  }

  scheduledDrain.watchdogHandle = ownerWindow.setTimeout(() => {
    runScheduledDrain(
      ownerDocument,
      backstop,
      scheduledDrain.token,
      null,
      "watchdog",
    );
  }, FALLBACK_DRAIN_DELAY_MS);
}

function runScheduledDrain(
  ownerDocument: Document,
  backstop: MarkweaveDocumentMediaBackstop,
  token: number,
  deadline: MarkweaveIdleDeadlineLike | null,
  trigger: "idle" | "watchdog",
) {
  const scheduledDrain = backstop.scheduledDrain;
  if (!scheduledDrain || scheduledDrain.token !== token) {
    return;
  }

  backstop.scheduledDrain = null;
  const ownerWindow = ownerDocument.defaultView as
    | (Window & { cancelIdleCallback?: (handle: number) => void })
    | null;
  if (ownerWindow) {
    if (trigger !== "idle" && scheduledDrain.idleHandle !== null) {
      ownerWindow.cancelIdleCallback?.(scheduledDrain.idleHandle);
    }
    if (trigger !== "watchdog" && scheduledDrain.watchdogHandle !== null) {
      ownerWindow.clearTimeout(scheduledDrain.watchdogHandle);
    }
  }

  drain(ownerDocument, backstop, deadline);
}

function cancelDrain(
  ownerDocument: Document,
  backstop: MarkweaveDocumentMediaBackstop,
) {
  const scheduledDrain = backstop.scheduledDrain;
  if (!scheduledDrain) {
    return;
  }
  backstop.scheduledDrain = null;
  const ownerWindow = ownerDocument.defaultView as
    | (Window & { cancelIdleCallback?: (handle: number) => void })
    | null;
  if (ownerWindow) {
    if (scheduledDrain.idleHandle !== null) {
      ownerWindow.cancelIdleCallback?.(scheduledDrain.idleHandle);
    }
    if (scheduledDrain.watchdogHandle !== null) {
      ownerWindow.clearTimeout(scheduledDrain.watchdogHandle);
    }
  }
}

function drain(
  ownerDocument: Document,
  backstop: MarkweaveDocumentMediaBackstop,
  deadline: MarkweaveIdleDeadlineLike | null,
) {
  // Snapshot a bounded batch up front: running a job can synchronously mutate
  // the pending set (the job unenrolls itself and may enroll a replacement).
  const batch: MarkweaveMediaBackstopJob[] = [];
  for (const job of backstop.pending) {
    batch.push(job);
    if (batch.length >= MAX_JOBS_PER_IDLE_SLICE) {
      break;
    }
  }

  for (const job of batch) {
    if (!backstop.pending.has(job)) {
      continue;
    }
    backstop.pending.delete(job);
    try {
      job();
    } catch {
      // Resolution has its own error handling; never let one node break the drain.
    }
    if (deadline && !deadline.didTimeout && deadline.timeRemaining() <= 0) {
      break;
    }
  }

  if (backstop.pending.size > 0) {
    scheduleDrain(ownerDocument, backstop);
    return;
  }
  documentBackstops.delete(ownerDocument);
}
