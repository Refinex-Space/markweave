import { describe, expect, it, vi } from "vitest";
import { MarkweaveVisualWorkScheduler } from "../src/core/visual-work-scheduler";

describe("MarkweaveVisualWorkScheduler", () => {
  it("supersedes stale revisions and runs frame work through the shared frame queue", async () => {
    const frames: Array<() => void> = [];
    const firstRun = vi.fn();
    const secondRun = vi.fn();
    const scheduler = new MarkweaveVisualWorkScheduler({
      scheduleFrame: (callback) => {
        frames.push(callback);
        return () => undefined;
      },
    });

    const first = scheduler.schedule({
      key: "code:12",
      lane: "frame",
      pos: 12,
      revision: 1,
      run: firstRun,
      sourceHash: "old",
    });
    const second = scheduler.schedule({
      key: "code:12",
      lane: "frame",
      pos: 12,
      revision: 2,
      run: secondRun,
      sourceHash: "new",
    });

    frames.shift()?.();
    await second.promise;

    expect(await first.promise).toBe("cancelled");
    expect(firstRun).not.toHaveBeenCalled();
    expect(secondRun).toHaveBeenCalledTimes(1);
    expect(scheduler.pendingCount).toBe(0);
    scheduler.destroy();
  });

  it("pauses nearby work during rapid scrolling while critical work remains runnable", async () => {
    const frames: Array<() => void> = [];
    const calls: string[] = [];
    const scheduler = new MarkweaveVisualWorkScheduler({
      scheduleFrame: (callback) => {
        frames.push(callback);
        return () => undefined;
      },
    });

    scheduler.setSuspended(true);
    const nearby = scheduler.schedule({
      key: "mermaid:1",
      lane: "nearby",
      revision: 1,
      run: () => {
        calls.push("nearby");
      },
    });
    const critical = scheduler.schedule({
      key: "selection:1",
      lane: "critical",
      revision: 1,
      run: () => {
        calls.push("critical");
      },
    });

    expect(await critical.promise).toBe("completed");
    expect(calls).toEqual(["critical"]);

    scheduler.setSuspended(false);
    frames.shift()?.();
    expect(await nearby.promise).toBe("completed");
    expect(calls).toEqual(["critical", "nearby"]);
    scheduler.destroy();
  });

  it("promotes a pending task with the same signature to a higher-priority lane", async () => {
    const idleCallbacks: Array<() => void> = [];
    const cancelIdleCallback = vi.fn();
    const ownerWindow = {
      cancelIdleCallback,
      requestIdleCallback: vi.fn((callback: () => void) => {
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      }),
    } as unknown as Window;
    const idleRun = vi.fn();
    const criticalRun = vi.fn();
    const scheduler = new MarkweaveVisualWorkScheduler({
      ownerWindow,
      scheduleFrame: () => () => undefined,
    });

    const idle = scheduler.schedule({
      key: "image:12",
      lane: "idle",
      pos: 12,
      revision: 3,
      run: idleRun,
      sourceHash: "same-source",
    });
    const critical = scheduler.schedule({
      key: "image:12",
      lane: "critical",
      pos: 12,
      revision: 3,
      run: criticalRun,
      sourceHash: "same-source",
    });

    expect(critical.promise).toBe(idle.promise);
    expect(await critical.promise).toBe("completed");
    expect(cancelIdleCallback).toHaveBeenCalledWith(1);
    expect(idleRun).not.toHaveBeenCalled();
    expect(criticalRun).toHaveBeenCalledTimes(1);

    idleCallbacks[0]?.();
    expect(criticalRun).toHaveBeenCalledTimes(1);
    scheduler.destroy();
  });

  it("keeps asynchronous work pending through flush and aborts its task signal on cancellation", async () => {
    const observed: {
      finishRun: (() => void) | null;
      taskSignal: AbortSignal | null;
    } = {
      finishRun: null,
      taskSignal: null,
    };
    const scheduler = new MarkweaveVisualWorkScheduler({
      scheduleFrame: (callback) => {
        callback();
        return () => undefined;
      },
    });
    const handle = scheduler.schedule({
      key: "media:1",
      lane: "critical",
      revision: 1,
      run: (signal) => {
        observed.taskSignal = signal;
        return new Promise<void>((resolve) => {
          observed.finishRun = resolve;
        });
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    let flushed = false;
    const flush = scheduler.flush().then(() => {
      flushed = true;
    });
    await Promise.resolve();
    expect(scheduler.pendingCount).toBe(1);
    expect(flushed).toBe(false);

    handle.cancel();
    expect(observed.taskSignal?.aborted).toBe(true);
    expect(await handle.promise).toBe("cancelled");
    await flush;
    expect(flushed).toBe(true);
    expect(scheduler.pendingCount).toBe(0);

    observed.finishRun?.();
    scheduler.destroy();
  });
});
