// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { saveMarkweaveBrowserFile } from "../src/core/browser-file-save";

async function flushAsyncSave() {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

afterEach(() => {
  Reflect.deleteProperty(window, "showSaveFilePicker");
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("browser file save", () => {
  it("writes a Blob through the system save picker", async () => {
    const blob = new Blob(["<svg></svg>"], { type: "image/svg+xml" });
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const onSettled = vi.fn();

    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: showSaveFilePicker });

    expect(
      saveMarkweaveBrowserFile({
        data: blob,
        fileName: "markweave-mermaid.svg",
        onSettled,
        ownerDocument: document,
      }),
    ).toBe(true);
    expect(showSaveFilePicker).toHaveBeenCalledWith({ suggestedName: "markweave-mermaid.svg", startIn: "downloads" });

    await flushAsyncSave();

    expect(write).toHaveBeenCalledWith(blob);
    expect(close).toHaveBeenCalledTimes(1);
    expect(anchorClick).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("does not download when the user cancels the system picker", async () => {
    const showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const onSettled = vi.fn();

    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: showSaveFilePicker });

    expect(
      saveMarkweaveBrowserFile({
        data: new Blob(["svg"], { type: "image/svg+xml" }),
        fileName: "markweave-mermaid.svg",
        onSettled,
        ownerDocument: document,
      }),
    ).toBe(true);

    await flushAsyncSave();

    expect(anchorClick).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("uses an object URL when the system picker is unavailable", () => {
    const blob = new Blob(["svg"], { type: "image/svg+xml" });
    const createObjectUrl = vi.fn(() => "blob:markweave-mermaid");
    const revokeObjectUrl = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const onSettled = vi.fn();

    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });

    expect(
      saveMarkweaveBrowserFile({
        data: blob,
        fileName: "markweave-mermaid.svg",
        onSettled,
        ownerDocument: document,
      }),
    ).toBe(true);

    expect(createObjectUrl).toHaveBeenCalledWith(blob);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:markweave-mermaid");
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("uses the supplied fallback URL when Blob resolution fails", async () => {
    const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable: vi.fn() });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const onSettled = vi.fn();

    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: showSaveFilePicker });

    expect(
      saveMarkweaveBrowserFile({
        data: () => Promise.reject(new TypeError("Failed to fetch")),
        fallbackHref: "https://cdn.example.com/image.png",
        fileName: "image.png",
        onSettled,
        ownerDocument: document,
      }),
    ).toBe(true);

    await flushAsyncSave();

    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
