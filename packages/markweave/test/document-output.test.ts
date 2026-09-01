// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveDocumentViewportCoordinator } from "../src/core/document-viewport";
import {
  markweavePrepareOutputEvent,
  markweaveResolveVisualResourceEvent,
  prepareMarkweaveEditorForOutput,
  type MarkweavePrepareOutputEventDetail,
  type MarkweaveResolveVisualResourceEventDetail,
} from "../src/editor-core/document-output";

let editor: Editor | null = null;

function createEditor() {
  const element = document.createElement("div");
  document.body.appendChild(element);
  editor = new Editor({
    content: "<p>Body</p>",
    element,
    extensions: [StarterKit],
  });
  editor.view.dom.classList.add("markweave-editor-surface");
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("prepareMarkweaveEditorForOutput", () => {
  it("materializes the editor and waits for plugin-provided output work", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => callback(window.performance.now()), 0),
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => window.clearTimeout(handle));
    const instance = createEditor();
    const media = instance.view.dom;
    media.dataset.mediaState = "pending";
    instance.view.dom.addEventListener(markweavePrepareOutputEvent, (event) => {
      expect(instance.view.dom.dataset.markweaveOutput).toBe("true");
      const detail = (event as CustomEvent<MarkweavePrepareOutputEventDetail>).detail;
      detail.waitUntil(new Promise<void>((resolve) => {
        window.setTimeout(() => {
          media.dataset.mediaState = "resolved";
          resolve();
        }, 5);
      }));
    });

    const report = await prepareMarkweaveEditorForOutput(instance, {
      kind: "dom-snapshot",
      timeoutMs: 200,
    });

    expect(report.status).toBe("ready");
    expect(report.resolved).toBe(1);
    expect(report.timedOut).toBe(0);
    expect(instance.view.dom.hasAttribute("data-markweave-output")).toBe(false);
  });

  it("returns a bounded timeout report when a visual resource never settles", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => callback(window.performance.now()), 0),
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => window.clearTimeout(handle));
    const instance = createEditor();
    const media = instance.view.dom;
    media.dataset.mediaState = "pending";

    const report = await prepareMarkweaveEditorForOutput(instance, {
      kind: "print",
      timeoutMs: 10,
    });

    expect(report.status).toBe("timed-out");
    expect(report.timedOut).toBe(1);
    expect(instance.view.dom.hasAttribute("data-markweave-output")).toBe(false);
  });

  it("forces pending visual resources to begin resolving before waiting", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => callback(window.performance.now()), 0),
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => window.clearTimeout(handle));
    const instance = createEditor();
    const resource = document.createElement("div");
    resource.dataset.mediaState = "pending";
    const beginResolution = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<MarkweaveResolveVisualResourceEventDetail>).detail;
      expect(detail.kind).toBe("dom-snapshot");
      expect(detail.signal.aborted).toBe(false);
      detail.waitUntil(new Promise<void>((resolve) => {
        window.setTimeout(() => {
          resource.dataset.mediaState = "resolved";
          resolve();
        }, 5);
      }));
    });
    resource.addEventListener(markweaveResolveVisualResourceEvent, beginResolution);
    instance.view.dom.appendChild(resource);

    const report = await prepareMarkweaveEditorForOutput(instance, {
      kind: "dom-snapshot",
      timeoutMs: 100,
    });

    expect(report.status).toBe("ready");
    expect(beginResolution).toHaveBeenCalledTimes(1);
    expect(resource.dataset.mediaState).toBe("resolved");
  });

  it.each(["pending", "missing", "unreadable"] as const)(
    "requests recovery for a %s media resource",
    async (initialState) => {
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
        window.setTimeout(() => callback(window.performance.now()), 0),
      );
      vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => window.clearTimeout(handle));
      const instance = createEditor();
      (instance.view as unknown as { domObserver: { stop: () => void } }).domObserver.stop();
      const resource = document.createElement("div");
      resource.dataset.mediaState = initialState;
      const recover = vi.fn((event: Event) => {
        const detail = (event as CustomEvent<MarkweaveResolveVisualResourceEventDetail>).detail;
        detail.waitUntil(Promise.resolve().then(() => {
          resource.dataset.mediaState = "resolved";
        }));
      });
      resource.addEventListener(markweaveResolveVisualResourceEvent, recover);
      instance.view.dom.appendChild(resource);

      const report = await prepareMarkweaveEditorForOutput(instance, {
        kind: "print",
        timeoutMs: 100,
      });

      expect(recover).toHaveBeenCalledTimes(1);
      expect(report.status).toBe("ready");
      expect(report.resolved).toBe(1);
    },
  );

  it("does not request recovery for an already resolved media resource", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => callback(window.performance.now()), 0),
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => window.clearTimeout(handle));
    const instance = createEditor();
    (instance.view as unknown as { domObserver: { stop: () => void } }).domObserver.stop();
    const resource = document.createElement("div");
    resource.dataset.mediaState = "resolved";
    const recover = vi.fn();
    resource.addEventListener(markweaveResolveVisualResourceEvent, recover);
    instance.view.dom.appendChild(resource);

    const report = await prepareMarkweaveEditorForOutput(instance, {
      kind: "dom-snapshot",
      timeoutMs: 100,
    });

    expect(report.status).toBe("ready");
    expect(report.resolved).toBe(1);
    expect(recover).not.toHaveBeenCalled();
  });

  it("aborts visual-resource recovery registered with waitUntil on timeout", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => callback(window.performance.now()), 0),
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => window.clearTimeout(handle));
    const instance = createEditor();
    (instance.view as unknown as { domObserver: { stop: () => void } }).domObserver.stop();
    const resource = document.createElement("div");
    resource.dataset.mediaState = "unreadable";
    const recoverySignals: AbortSignal[] = [];
    resource.addEventListener(markweaveResolveVisualResourceEvent, (event) => {
      const detail = (event as CustomEvent<MarkweaveResolveVisualResourceEventDetail>).detail;
      recoverySignals.push(detail.signal);
      detail.waitUntil(new Promise(() => undefined));
    });
    instance.view.dom.appendChild(resource);

    const report = await prepareMarkweaveEditorForOutput(instance, {
      kind: "print",
      timeoutMs: 10,
    });

    expect(report.status).toBe("timed-out");
    expect(report.timedOut).toBe(1);
    expect(recoverySignals).toHaveLength(1);
    expect(recoverySignals[0]?.aborted).toBe(true);
  });

  it("reports an unresolved Mermaid preview as timed out without marking it missing", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => callback(window.performance.now()), 0),
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => window.clearTimeout(handle));
    const instance = createEditor();
    (instance.view as unknown as { domObserver: { stop: () => void } }).domObserver.stop();
    const preview = document.createElement("div");
    preview.className = "markweave-mermaid-preview markweave-mermaid-preview--inline markweave-mermaid-preview--pending";
    preview.dataset.markweaveVisualPending = "true";
    preview.dataset.state = "pending";
    preview.addEventListener(markweaveResolveVisualResourceEvent, () => {
      delete preview.dataset.markweaveVisualPending;
    });
    instance.view.dom.appendChild(preview);

    const report = await prepareMarkweaveEditorForOutput(instance, {
      kind: "dom-snapshot",
      timeoutMs: 10,
    });

    expect(report.status).toBe("timed-out");
    expect(report.missing).toBe(0);
    expect(report.timedOut).toBe(1);
  });

  it("waits for iframe media and reports it as resolved", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => callback(window.performance.now()), 0),
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => window.clearTimeout(handle));
    const instance = createEditor();
    (instance.view as unknown as { domObserver: { stop: () => void } }).domObserver.stop();
    const iframe = document.createElement("iframe");
    iframe.src = "about:blank";
    iframe.dataset.markweaveIframeState = "pending";
    instance.view.dom.appendChild(iframe);
    window.setTimeout(() => iframe.dispatchEvent(new Event("load")), 5);

    const report = await prepareMarkweaveEditorForOutput(instance, {
      kind: "dom-snapshot",
      timeoutMs: 100,
    });

    expect(report.status).toBe("ready");
    expect(report.resolved).toBe(1);
    expect(report.timedOut).toBe(0);
  });

  it("reports a completed image with no natural pixels as unreadable", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => callback(window.performance.now()), 0),
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => window.clearTimeout(handle));
    const instance = createEditor();
    (instance.view as unknown as { domObserver: { stop: () => void } }).domObserver.stop();
    const image = document.createElement("img");
    image.src = "broken-image.png";
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 0 },
    });
    instance.view.dom.appendChild(image);

    const report = await prepareMarkweaveEditorForOutput(instance, {
      kind: "dom-snapshot",
      timeoutMs: 100,
    });

    expect(report.status).toBe("ready");
    expect(report.unreadable).toBe(1);
  });

  it("exits promptly when the viewport coordinator is destroyed", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => callback(window.performance.now()), 0),
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => window.clearTimeout(handle));
    const instance = createEditor();
    instance.view.dom.dataset.mediaState = "pending";
    const coordinator = createMarkweaveDocumentViewportCoordinator(instance);
    const startedAt = performance.now();
    const output = prepareMarkweaveEditorForOutput(instance, {
      kind: "print",
      timeoutMs: 1_000,
    });
    window.setTimeout(() => coordinator.destroy(), 5);

    const report = await output;

    expect(report.status).toBe("cancelled");
    expect(performance.now() - startedAt).toBeLessThan(200);
  });
});
