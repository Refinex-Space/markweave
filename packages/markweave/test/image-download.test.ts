// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMarkweaveImage } from "../src/plugins/media/core-media-nodes";

async function flushAsyncDownload() {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

afterEach(() => {
  Reflect.deleteProperty(window, "showSaveFilePicker");
  Reflect.deleteProperty(window, "fetch");
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("image download", () => {
  it("uses the system save picker when the browser supports it", async () => {
    const imageBlob = new Blob(["image"], { type: "image/png" });
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable });
    const fetchImage = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(imageBlob) });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: showSaveFilePicker });
    Object.defineProperty(window, "fetch", { configurable: true, value: fetchImage });

    expect(downloadMarkweaveImage("https://example.com/photo.png", document)).toBe(true);
    expect(showSaveFilePicker).toHaveBeenCalledWith({ suggestedName: "photo.png", startIn: "downloads" });

    await flushAsyncDownload();

    expect(fetchImage).toHaveBeenCalledWith("https://example.com/photo.png");
    expect(write).toHaveBeenCalledWith(imageBlob);
    expect(close).toHaveBeenCalledTimes(1);
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it("suggests a safe image filename for Base64 sources", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });
    const fetchImage = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["image"], { type: "image/png" })),
    });

    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: showSaveFilePicker });
    Object.defineProperty(window, "fetch", { configurable: true, value: fetchImage });

    expect(downloadMarkweaveImage("data:image/png;base64,aW1hZ2U=", document)).toBe(true);
    expect(showSaveFilePicker).toHaveBeenCalledWith({ suggestedName: "markweave-image.png", startIn: "downloads" });

    await flushAsyncDownload();

    expect(write).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not fall back to a browser download when the user cancels", async () => {
    const showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    const fetchImage = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: showSaveFilePicker });
    Object.defineProperty(window, "fetch", { configurable: true, value: fetchImage });

    expect(downloadMarkweaveImage("https://example.com/photo.png", document)).toBe(true);
    await flushAsyncDownload();

    expect(fetchImage).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it("falls back to a browser download when the system picker is unavailable", () => {
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    expect(downloadMarkweaveImage("https://example.com/photo.png", document)).toBe(true);

    expect(anchorClick).toHaveBeenCalledTimes(1);
  });

  it("falls back to a browser download when image bytes cannot be fetched", async () => {
    const createWritable = vi.fn();
    const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable });
    const fetchImage = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: showSaveFilePicker });
    Object.defineProperty(window, "fetch", { configurable: true, value: fetchImage });

    expect(downloadMarkweaveImage("https://cdn.example.com/photo.png", document)).toBe(true);
    await flushAsyncDownload();

    expect(createWritable).not.toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalledTimes(1);
  });
});
