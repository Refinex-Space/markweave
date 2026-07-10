// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { openMarkweaveImagePreview } from "../src/plugins/media/image-preview";

const messages = {
  dialogAriaLabel: "Image preview",
  zoomOut: "Zoom out",
  zoomIn: "Zoom in",
  reset: "Reset zoom",
  close: "Close preview",
};

describe("image preview", () => {
  it("opens a non-mutating lightbox with zoom controls and Escape dismissal", () => {
    openMarkweaveImagePreview({ src: "https://example.com/image.png", alt: "Example image", messages });

    const layer = document.querySelector<HTMLElement>('[data-testid="markweave-image-preview-layer"]');
    expect(layer?.querySelector("img")?.getAttribute("src")).toBe("https://example.com/image.png");
    expect(layer?.querySelector("img")?.getAttribute("alt")).toBe("Example image");
    expect(layer?.querySelector('[data-testid="markweave-image-preview-zoom-label"]')?.textContent).toBe("100%");

    (layer?.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement).click();
    expect(layer?.querySelector('[data-testid="markweave-image-preview-zoom-label"]')?.textContent).toBe("125%");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector('[data-testid="markweave-image-preview-layer"]')).toBeNull();
  });
});
