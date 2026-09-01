export type MarkweaveVisualWorkLane = "critical" | "frame" | "nearby" | "idle";

export interface MarkweaveVisualWorkTask {
  readonly key: string;
  readonly lane: MarkweaveVisualWorkLane;
  readonly revision: number;
  readonly pos?: number;
  readonly sourceHash?: string;
  readonly run: (signal: AbortSignal) => void | Promise<void>;
}

export type MarkweaveVisualWorkResult = "completed" | "cancelled" | "failed";

export interface MarkweaveVisualWorkHandle {
  readonly promise: Promise<MarkweaveVisualWorkResult>;
  readonly cancel: () => void;
}

export interface MarkweaveVisualWorkSchedulerOptions {
  readonly scheduleFrame: (callback: () => void) => () => void;
  readonly ownerWindow?: Window;
  readonly onPendingCountChange?: (pendingCount: number) => void;
}

interface ScheduledVisualWork {
  task: MarkweaveVisualWorkTask;
  readonly signature: string;
  readonly abortController: AbortController;
  readonly promise: Promise<MarkweaveVisualWorkResult>;
  readonly settle: (result: MarkweaveVisualWorkResult) => void;
  status: "pending" | "running" | "settled";
}

interface IdleWindowCapabilities {
  readonly requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  readonly cancelIdleCallback?: (handle: number) => void;
}

const laneOrder: readonly MarkweaveVisualWorkLane[] = [
  "critical",
  "frame",
  "nearby",
  "idle",
];

function taskSignature(task: MarkweaveVisualWorkTask) {
  return `${task.revision}:${task.pos ?? ""}:${task.sourceHash ?? ""}`;
}

function lanePriority(lane: MarkweaveVisualWorkLane) {
  return laneOrder.indexOf(lane);
}

/**
 * Runs display-only work without allowing rapid scrolling to accumulate an
 * unbounded queue. A stable key supersedes stale revisions of the same task.
 */
export class MarkweaveVisualWorkScheduler {
  private readonly jobs = new Map<string, ScheduledVisualWork>();
  private readonly queues = new Map<MarkweaveVisualWorkLane, ScheduledVisualWork[]>(
    laneOrder.map((lane) => [lane, []]),
  );
  private readonly subscribers = new Set<(pendingCount: number) => void>();
  private frameCancel: (() => void) | null = null;
  private idleCancel: (() => void) | null = null;
  private suspended = false;
  private destroyed = false;

  constructor(private readonly options: MarkweaveVisualWorkSchedulerOptions) {}

  get pendingCount() {
    return this.jobs.size;
  }

  schedule(task: MarkweaveVisualWorkTask): MarkweaveVisualWorkHandle {
    if (this.destroyed) {
      return {
        cancel: () => undefined,
        promise: Promise.resolve("cancelled"),
      };
    }

    const signature = taskSignature(task);
    const current = this.jobs.get(task.key);
    if (current?.signature === signature) {
      this.promotePendingJob(current, task);
      return {
        cancel: () => this.cancelJob(current),
        promise: current.promise,
      };
    }

    if (current) {
      this.cancelJob(current);
    }

    let settle: (result: MarkweaveVisualWorkResult) => void = () => undefined;
    const promise = new Promise<MarkweaveVisualWorkResult>((resolve) => {
      settle = resolve;
    });
    const job: ScheduledVisualWork = {
      abortController: new AbortController(),
      promise,
      settle,
      signature,
      status: "pending",
      task,
    };

    this.jobs.set(task.key, job);
    this.queues.get(task.lane)?.push(job);
    this.notifyPendingCount();
    this.scheduleDrain();

    return {
      cancel: () => this.cancelJob(job),
      promise,
    };
  }

  setSuspended(suspended: boolean) {
    if (this.destroyed || this.suspended === suspended) {
      return;
    }

    this.suspended = suspended;
    if (!suspended) {
      this.scheduleDrain();
    }
  }

  subscribe(callback: (pendingCount: number) => void) {
    this.subscribers.add(callback);
    callback(this.pendingCount);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  async flush(options: { readonly signal?: AbortSignal } = {}) {
    if (this.destroyed || this.pendingCount === 0) {
      return;
    }

    this.setSuspended(false);
    this.scheduleDrain();

    await new Promise<void>((resolve) => {
      let unsubscribe: () => void = () => undefined;
      const finish = () => {
        unsubscribe();
        options.signal?.removeEventListener("abort", finish);
        resolve();
      };

      unsubscribe = this.subscribe((pendingCount) => {
        if (pendingCount === 0) {
          finish();
        }
      });
      options.signal?.addEventListener("abort", finish, { once: true });
      if (options.signal?.aborted) {
        finish();
      }
    });
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.frameCancel?.();
    this.frameCancel = null;
    this.idleCancel?.();
    this.idleCancel = null;
    [...this.jobs.values()].forEach((job) => this.cancelJob(job));
    this.subscribers.clear();
  }

  private scheduleDrain() {
    if (this.destroyed || this.jobs.size === 0) {
      return;
    }

    const nextLane = this.nextRunnableLane();
    if (!nextLane) {
      return;
    }

    if (nextLane === "critical") {
      queueMicrotask(() => this.drainOne("critical"));
      return;
    }

    if (nextLane === "idle") {
      this.scheduleIdleDrain();
      return;
    }

    if (!this.frameCancel) {
      this.frameCancel = this.options.scheduleFrame(() => {
        this.frameCancel = null;
        const lane = this.nextRunnableLane();
        if (lane === "frame" || lane === "nearby") {
          this.drainOne(lane);
        } else {
          this.scheduleDrain();
        }
      });
    }
  }

  private promotePendingJob(
    job: ScheduledVisualWork,
    task: MarkweaveVisualWorkTask,
  ) {
    const previousLane = job.task.lane;
    if (
      job.status !== "pending"
      || lanePriority(task.lane) >= lanePriority(previousLane)
    ) {
      return;
    }

    const previousQueue = this.queues.get(previousLane);
    const queueIndex = previousQueue?.indexOf(job) ?? -1;
    if (previousQueue && queueIndex >= 0) {
      previousQueue.splice(queueIndex, 1);
    }
    job.task = task;
    this.queues.get(task.lane)?.push(job);

    if (
      previousLane === "idle"
      && !this.queues.get("idle")?.some((candidate) => candidate.status === "pending")
    ) {
      this.idleCancel?.();
      this.idleCancel = null;
    }
    if (
      (previousLane === "frame" || previousLane === "nearby")
      && !this.queues.get("frame")?.some((candidate) => candidate.status === "pending")
      && !this.queues.get("nearby")?.some((candidate) => candidate.status === "pending")
    ) {
      this.frameCancel?.();
      this.frameCancel = null;
    }

    this.scheduleDrain();
  }

  private scheduleIdleDrain() {
    if (this.idleCancel) {
      return;
    }

    const ownerWindow = this.options.ownerWindow;
    const idleCapabilities = ownerWindow as (Window & IdleWindowCapabilities) | undefined;
    if (idleCapabilities?.requestIdleCallback) {
      const handle = idleCapabilities.requestIdleCallback(() => {
        this.idleCancel = null;
        this.drainOne("idle");
      }, { timeout: 250 });
      this.idleCancel = () => idleCapabilities.cancelIdleCallback?.(handle);
      return;
    }

    const timerHost = ownerWindow ?? globalThis;
    const handle = timerHost.setTimeout(() => {
      this.idleCancel = null;
      this.drainOne("idle");
    }, 32);
    this.idleCancel = () => {
      timerHost.clearTimeout(handle);
    };
  }

  private nextRunnableLane() {
    return laneOrder.find((lane) => {
      if (this.suspended && (lane === "nearby" || lane === "idle")) {
        return false;
      }
      return this.queues.get(lane)?.some((job) => job.status === "pending");
    }) ?? null;
  }

  private drainOne(lane: MarkweaveVisualWorkLane) {
    if (this.destroyed || (this.suspended && (lane === "nearby" || lane === "idle"))) {
      return;
    }

    const queue = this.queues.get(lane);
    const job = queue?.find((candidate) => candidate.status === "pending");
    if (!job) {
      this.scheduleDrain();
      return;
    }

    job.status = "running";
    void Promise.resolve()
      .then(() => job.task.run(job.abortController.signal))
      .then(
        () => this.settleJob(job, job.abortController.signal.aborted ? "cancelled" : "completed"),
        () => this.settleJob(job, job.abortController.signal.aborted ? "cancelled" : "failed"),
      );
  }

  private cancelJob(job: ScheduledVisualWork) {
    if (job.status === "settled") {
      return;
    }
    job.abortController.abort();
    this.settleJob(job, "cancelled");
  }

  private settleJob(job: ScheduledVisualWork, result: MarkweaveVisualWorkResult) {
    if (job.status === "settled") {
      return;
    }
    job.status = "settled";
    if (this.jobs.get(job.task.key) === job) {
      this.jobs.delete(job.task.key);
    }
    const queue = this.queues.get(job.task.lane);
    const queueIndex = queue?.indexOf(job) ?? -1;
    if (queue && queueIndex >= 0) {
      queue.splice(queueIndex, 1);
    }
    job.settle(result);
    this.notifyPendingCount();
    this.scheduleDrain();
  }

  private notifyPendingCount() {
    const pendingCount = this.pendingCount;
    this.options.onPendingCountChange?.(pendingCount);
    this.subscribers.forEach((subscriber) => subscriber(pendingCount));
  }
}
