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
  drainHandle: number | null;
  usesIdleCallback: boolean;
}

interface MarkweaveIdleDeadlineLike {
  readonly didTimeout?: boolean;
  timeRemaining(): number;
}

// Bound how many images we trigger per idle slice so a media-heavy document does
// not fire every resolver call at once; the rest wait for the next idle slice.
const MAX_JOBS_PER_IDLE_SLICE = 3;
// Fallback cadence when the environment lacks requestIdleCallback (e.g. jsdom,
// some embedded browsers). Small enough to keep export/print reliable.
const FALLBACK_DRAIN_DELAY_MS = 200;

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
      drainHandle: null,
      usesIdleCallback: false,
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
  if (backstop.drainHandle !== null) {
    return;
  }
  const ownerWindow = ownerDocument.defaultView as
    | (Window & {
        requestIdleCallback?: (
          callback: (deadline: MarkweaveIdleDeadlineLike) => void,
        ) => number;
      })
    | null;
  if (!ownerWindow) {
    return;
  }

  if (typeof ownerWindow.requestIdleCallback === "function") {
    backstop.usesIdleCallback = true;
    backstop.drainHandle = ownerWindow.requestIdleCallback((deadline) => {
      backstop.drainHandle = null;
      drain(ownerDocument, backstop, deadline);
    });
    return;
  }

  backstop.usesIdleCallback = false;
  backstop.drainHandle = ownerWindow.setTimeout(() => {
    backstop.drainHandle = null;
    drain(ownerDocument, backstop, null);
  }, FALLBACK_DRAIN_DELAY_MS);
}

function cancelDrain(
  ownerDocument: Document,
  backstop: MarkweaveDocumentMediaBackstop,
) {
  if (backstop.drainHandle === null) {
    return;
  }
  const ownerWindow = ownerDocument.defaultView as
    | (Window & { cancelIdleCallback?: (handle: number) => void })
    | null;
  if (ownerWindow) {
    if (backstop.usesIdleCallback && typeof ownerWindow.cancelIdleCallback === "function") {
      ownerWindow.cancelIdleCallback(backstop.drainHandle);
    } else {
      ownerWindow.clearTimeout(backstop.drainHandle);
    }
  }
  backstop.drainHandle = null;
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
    if (deadline && deadline.timeRemaining() <= 0) {
      break;
    }
  }

  if (backstop.pending.size > 0) {
    scheduleDrain(ownerDocument, backstop);
    return;
  }
  documentBackstops.delete(ownerDocument);
}
