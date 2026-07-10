export interface MarkweaveFrameScheduler {
  readonly schedule: () => void;
  readonly cancel: () => void;
}

/** Coalesces layout reads from scroll and resize events into a single frame. */
export function createMarkweaveFrameScheduler(callback: () => void): MarkweaveFrameScheduler {
  let frameId: number | null = null;

  const cancel = () => {
    if (frameId === null) {
      return;
    }
    window.cancelAnimationFrame(frameId);
    frameId = null;
  };

  return {
    schedule: () => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        callback();
      });
    },
    cancel,
  };
}
