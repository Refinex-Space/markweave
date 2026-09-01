// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveDocumentViewportCoordinator } from "../src/core/document-viewport";
import { getActiveMarkweaveTocId, getMarkweaveTocItems } from "../src/core/toc-state";
import { MarkweaveDetails, MarkweaveDetailsSummary } from "../src/plugins/details/details-node";

let editor: Editor | null = null;

function createEditor(content: string, parent = document.body) {
  const element = document.createElement("div");
  parent.appendChild(element);
  editor = new Editor({
    content,
    element,
    extensions: [StarterKit, MarkweaveDetailsSummary, MarkweaveDetails],
  });
  editor.view.dom.classList.add("markweave-editor-surface");
  return editor;
}

function fastFrames() {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
    window.setTimeout(() => callback(window.performance.now()), 0),
  );
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => {
    window.clearTimeout(handle);
  });
}

function rect(top: number, height: number, width = 640): DOMRect {
  return {
    bottom: top + height,
    height,
    left: 0,
    right: width,
    top,
    width,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MarkweaveDocumentViewportCoordinator", () => {
  it("coalesces viewport work into one animation frame and tracks rapid scroll settling", () => {
    vi.useFakeTimers();
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    let time = 0;
    let scrollY = 0;
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = nextFrame++;
      callbacks.set(id, callback);
      return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      callbacks.delete(id);
    });
    vi.spyOn(window.performance, "now").mockImplementation(() => time);
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    const instance = createEditor("<p>Body</p>");
    const coordinator = createMarkweaveDocumentViewportCoordinator(instance);
    const flushFrame = () => {
      const queued = [...callbacks.values()];
      callbacks.clear();
      queued.forEach((callback) => callback(time));
    };

    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("scroll"));
    expect(requestFrame).toHaveBeenCalledTimes(1);
    flushFrame();
    expect(coordinator.snapshot.state).toBe("scrolling");

    time = 10;
    scrollY = 100;
    window.dispatchEvent(new Event("scroll"));
    flushFrame();
    expect(coordinator.snapshot.state).toBe("rapid");
    expect(instance.view.dom.dataset.markweaveViewportState).toBe("rapid");

    vi.advanceTimersByTime(121);
    flushFrame();
    expect(coordinator.snapshot.state).toBe("scrolling");
    vi.advanceTimersByTime(130);
    flushFrame();
    expect(coordinator.snapshot.state).toBe("idle");
    coordinator.destroy();
  });

  it("reveals a position in the nearest scroll container without changing details document state", async () => {
    fastFrames();
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    document.body.appendChild(scroller);
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1_000 },
    });
    let scrollTop = 0;
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(rect(0, 100));
    const instance = createEditor(
      '<div data-markweave-details data-open="false"><div data-markweave-details-summary>Summary</div><p>Hidden</p><h2>Target</h2></div>',
      scroller,
    );
    const details = instance.view.dom.querySelector<HTMLElement>(".markweave-details");
    const heading = instance.view.dom.querySelector<HTMLElement>("h2");
    if (!details || !heading) {
      throw new Error("Expected details and heading DOM.");
    }
    const headingPos = (() => {
      let value = -1;
      instance.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          value = pos + 1;
          return false;
        }
        return true;
      });
      return value;
    })();
    vi.spyOn(heading, "getBoundingClientRect").mockImplementation(() => rect(300 - scrollTop, 40));
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      expect(details.dataset.markweaveRevealOpen).toBe("true");
      scrollTop += Number(top ?? 0);
    });
    Object.defineProperty(scroller, "scrollBy", { configurable: true, value: scrollBy });
    const coordinator = createMarkweaveDocumentViewportCoordinator(instance);

    const result = await coordinator.revealPosition(headingPos, {
      align: "start",
      reason: "toc",
    });

    expect(result.status).toBe("revealed");
    expect(result.finalErrorPx).toBe(0);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(details.hasAttribute("data-markweave-reveal-open")).toBe(false);
    expect(instance.state.doc.nodeAt(0)?.attrs.open).toBe(false);
    coordinator.destroy();
  });

  it("derives the active TOC item from a viewport position without measuring every heading", () => {
    fastFrames();
    const instance = createEditor("<h2>One</h2><p>Body</p><h2>Two</h2><h2>Three</h2>");
    const items = getMarkweaveTocItems(instance.state.doc);
    const headings = [...instance.view.dom.querySelectorAll("h2")];
    const measurements = headings.map((heading) => vi.spyOn(heading, "getBoundingClientRect"));
    vi.spyOn(instance.view, "posAtCoords").mockReturnValue({
      inside: items[1]!.pos,
      pos: items[1]!.pos + 1,
    });
    const coordinator = createMarkweaveDocumentViewportCoordinator(instance);

    expect(getActiveMarkweaveTocId(instance, items)).toBe(items[1]?.id);
    expect(measurements.every((measurement) => measurement.mock.calls.length === 0)).toBe(true);
    coordinator.destroy();
  });

  it("cancels an older reveal when a newer navigation starts", async () => {
    fastFrames();
    const instance = createEditor("<p>Body</p>");
    const paragraph = instance.view.dom.querySelector<HTMLElement>("p");
    if (!paragraph) {
      throw new Error("Expected paragraph DOM.");
    }
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(rect(20, 32));
    vi.spyOn(instance.view, "coordsAtPos").mockReturnValue({ bottom: 52, left: 0, right: 0, top: 20 });
    const coordinator = createMarkweaveDocumentViewportCoordinator(instance);

    const first = coordinator.revealPosition(1, { align: "nearest", reason: "restore" });
    const second = coordinator.revealPosition(1, { align: "nearest", reason: "search" });

    expect((await first).status).toBe("cancelled");
    expect((await second).status).toBe("revealed");
    coordinator.destroy();
  });

  it("cancels the active navigation explicitly", async () => {
    fastFrames();
    const instance = createEditor("<p>Body</p>");
    const coordinator = createMarkweaveDocumentViewportCoordinator(instance);

    const navigation = coordinator.revealPosition(1, { align: "nearest", reason: "search" });
    coordinator.cancelNavigation();

    expect((await navigation).status).toBe("cancelled");
    coordinator.destroy();
  });

  it("scrolls every nested vertical container before reporting a reveal", async () => {
    fastFrames();
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    outer.style.overflowY = "auto";
    inner.style.overflowY = "auto";
    outer.appendChild(inner);
    document.body.appendChild(outer);
    Object.defineProperties(outer, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1_000 },
    });
    Object.defineProperties(inner, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 800 },
    });
    let outerScrollTop = 0;
    let innerScrollTop = 0;
    Object.defineProperty(outer, "scrollTop", {
      configurable: true,
      get: () => outerScrollTop,
      set: (value: number) => { outerScrollTop = value; },
    });
    Object.defineProperty(inner, "scrollTop", {
      configurable: true,
      get: () => innerScrollTop,
      set: (value: number) => { innerScrollTop = value; },
    });
    vi.spyOn(outer, "getBoundingClientRect").mockReturnValue(rect(0, 200));
    vi.spyOn(inner, "getBoundingClientRect").mockImplementation(() => rect(300 - outerScrollTop, 100));
    const outerScrollBy = vi.fn(({ top }: ScrollToOptions) => { outerScrollTop += Number(top ?? 0); });
    const innerScrollBy = vi.fn(({ top }: ScrollToOptions) => { innerScrollTop += Number(top ?? 0); });
    Object.defineProperty(outer, "scrollBy", { configurable: true, value: outerScrollBy });
    Object.defineProperty(inner, "scrollBy", { configurable: true, value: innerScrollBy });
    const instance = createEditor("<h2>Nested target</h2>", inner);
    const heading = instance.view.dom.querySelector<HTMLElement>("h2");
    if (!heading) throw new Error("Expected nested heading.");
    vi.spyOn(heading, "getBoundingClientRect").mockImplementation(
      () => rect(600 - innerScrollTop - outerScrollTop, 40),
    );
    vi.spyOn(instance.view, "coordsAtPos").mockImplementation(() => ({
      bottom: 640 - innerScrollTop - outerScrollTop,
      left: 0,
      right: 0,
      top: 600 - innerScrollTop - outerScrollTop,
    }));
    const coordinator = createMarkweaveDocumentViewportCoordinator(instance);

    const result = await coordinator.revealPosition(1, { align: "start", reason: "search" });

    expect(result.status).toBe("revealed");
    expect(innerScrollBy).toHaveBeenCalled();
    expect(outerScrollBy).toHaveBeenCalled();
    expect(Math.abs(result.finalErrorPx ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(8);
    coordinator.destroy();
  });

  it("reports unresolved when scrolling cannot correct the final position", async () => {
    fastFrames();
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    document.body.appendChild(scroller);
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollBy: { configurable: true, value: vi.fn() },
    });
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(rect(0, 100));
    const instance = createEditor("<h2>Unreachable</h2>", scroller);
    const heading = instance.view.dom.querySelector<HTMLElement>("h2");
    if (!heading) throw new Error("Expected heading.");
    vi.spyOn(heading, "getBoundingClientRect").mockReturnValue(rect(300, 40));
    vi.spyOn(instance.view, "coordsAtPos").mockReturnValue({ bottom: 340, left: 0, right: 0, top: 300 });
    vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    const coordinator = createMarkweaveDocumentViewportCoordinator(instance);

    const result = await coordinator.revealPosition(1, { align: "start", reason: "search" });

    expect(result.status).toBe("unresolved");
    expect(Math.abs(result.finalErrorPx ?? 0)).toBeGreaterThan(8);
    coordinator.destroy();
  });

  it("does not treat a first ordinary scroll past a stale empty-document extent as end anchored", async () => {
    fastFrames();
    let scrollHeight = 1_000;
    let scrollY = 0;
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight,
    });
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: document.documentElement,
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 100 });
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation((options) => {
      scrollY = Number((options as ScrollToOptions).top ?? 0);
    });
    const instance = createEditor("<p>Body</p>");
    const coordinator = createMarkweaveDocumentViewportCoordinator(instance);

    scrollHeight = 10_000;
    scrollY = 1_100;
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => window.setTimeout(resolve, 10));

    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollY).toBe(1_100);
    coordinator.destroy();
  });

  it("keeps a rapid scrollbar jump anchored to the expanding document end", async () => {
    fastFrames();
    let scrollHeight = 1_000;
    let scrollY = 900;
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight,
    });
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: document.documentElement,
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 100 });
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation((options) => {
      scrollY = Number((options as ScrollToOptions).top ?? 0);
    });
    const instance = createEditor("<p>Body</p>");
    const coordinator = createMarkweaveDocumentViewportCoordinator(instance);

    window.dispatchEvent(new Event("scroll"));
    scrollHeight = 1_500;
    await new Promise((resolve) => window.setTimeout(resolve, 10));

    expect(scrollTo).toHaveBeenCalledWith({ behavior: "auto", top: 1_500 });
    coordinator.destroy();
  });
});
