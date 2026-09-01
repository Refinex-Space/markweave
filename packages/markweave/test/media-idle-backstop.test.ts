// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrollMarkweaveMediaBackstop } from "../src/plugins/media/media-idle-backstop";

interface IdleDeadlineLike {
  readonly didTimeout: boolean;
  timeRemaining(): number;
}

type IdleCallback = (deadline: IdleDeadlineLike) => void;

const idleWindow = window as unknown as Record<string, unknown>;
let previousRequestIdleCallback: unknown;
let previousCancelIdleCallback: unknown;

beforeEach(() => {
  vi.useFakeTimers();
  previousRequestIdleCallback = idleWindow.requestIdleCallback;
  previousCancelIdleCallback = idleWindow.cancelIdleCallback;
});

afterEach(() => {
  if (previousRequestIdleCallback === undefined) {
    delete idleWindow.requestIdleCallback;
  } else {
    idleWindow.requestIdleCallback = previousRequestIdleCallback;
  }
  if (previousCancelIdleCallback === undefined) {
    delete idleWindow.cancelIdleCallback;
  } else {
    idleWindow.cancelIdleCallback = previousCancelIdleCallback;
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("media idle backstop", () => {
  it("uses a hard watchdog when requestIdleCallback never calls back", () => {
    const idleCallbacks: IdleCallback[] = [];
    const requestIdleCallback = vi.fn(
      (callback: IdleCallback, _options?: { timeout?: number }) => {
        idleCallbacks.push(callback);
        return 17;
      },
    );
    const cancelIdleCallback = vi.fn();
    idleWindow.requestIdleCallback = requestIdleCallback;
    idleWindow.cancelIdleCallback = cancelIdleCallback;
    const job = vi.fn();

    enrollMarkweaveMediaBackstop(document, job);

    expect(requestIdleCallback).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    vi.advanceTimersByTime(1_000);
    expect(job).toHaveBeenCalledTimes(1);
    expect(cancelIdleCallback).toHaveBeenCalledWith(17);

    idleCallbacks[0]?.({ didTimeout: false, timeRemaining: () => 50 });
    expect(job).toHaveBeenCalledTimes(1);
  });

  it("drains a bounded batch and reschedules the remaining jobs", () => {
    const idleCallbacks: IdleCallback[] = [];
    idleWindow.requestIdleCallback = vi.fn((callback: IdleCallback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    });
    idleWindow.cancelIdleCallback = vi.fn();
    const calls: number[] = [];

    Array.from({ length: 15 }, (_, index) =>
      enrollMarkweaveMediaBackstop(document, () => calls.push(index)),
    );

    expect(idleCallbacks).toHaveLength(1);
    idleCallbacks[0]?.({ didTimeout: false, timeRemaining: () => 50 });
    expect(calls).toEqual(Array.from({ length: 12 }, (_, index) => index));
    expect(idleCallbacks).toHaveLength(2);

    idleCallbacks[1]?.({ didTimeout: false, timeRemaining: () => 50 });
    expect(calls).toEqual(Array.from({ length: 15 }, (_, index) => index));
  });

  it("cancels both scheduled paths and ignores a late idle callback", () => {
    const idleCallbacks: IdleCallback[] = [];
    idleWindow.requestIdleCallback = vi.fn((callback: IdleCallback) => {
      idleCallbacks.push(callback);
      return 23;
    });
    const cancelIdleCallback = vi.fn();
    idleWindow.cancelIdleCallback = cancelIdleCallback;
    const job = vi.fn();

    const unenroll = enrollMarkweaveMediaBackstop(document, job);
    unenroll();
    vi.advanceTimersByTime(1_000);
    idleCallbacks[0]?.({ didTimeout: true, timeRemaining: () => 0 });

    expect(cancelIdleCallback).toHaveBeenCalledWith(23);
    expect(job).not.toHaveBeenCalled();
  });

  it("falls back to a timer when an old WebView idle implementation throws", () => {
    idleWindow.requestIdleCallback = vi.fn(() => {
      throw new TypeError("requestIdleCallback options are unsupported");
    });
    const job = vi.fn();

    enrollMarkweaveMediaBackstop(document, job);
    vi.advanceTimersByTime(1_000);

    expect(job).toHaveBeenCalledTimes(1);
  });
});
