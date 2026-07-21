import { describe, expect, it } from "vitest";
import {
  calculateCodeBlockLanguageListScrollTop,
  calculateCodeBlockLanguageMenuPosition,
  codeBlockLanguageMenuMaxHeight,
  getInitialCodeBlockLanguageItemIndex,
  moveCodeBlockLanguageItemIndex,
} from "../src/plugins/codeblock/codeblock-ui-model";

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("code block UI model", () => {
  it("scrolls only the language list enough to reveal the highlighted option", () => {
    const baseMetrics = {
      listBottom: 52,
      listTop: 0,
      scrollTop: 52,
    };

    expect(calculateCodeBlockLanguageListScrollTop({ ...baseMetrics, itemBottom: 104, itemTop: 78 })).toBe(104);
    expect(calculateCodeBlockLanguageListScrollTop({ ...baseMetrics, itemBottom: -26, itemTop: -52 })).toBe(0);
    expect(calculateCodeBlockLanguageListScrollTop({ ...baseMetrics, itemBottom: 42, itemTop: 16 })).toBe(52);
  });

  it("selects the current language when the menu opens and falls back to the first item", () => {
    const items = [
      { language: "bash" as const, label: "Bash" },
      { language: "json" as const, label: "JSON" },
    ];

    expect(getInitialCodeBlockLanguageItemIndex(items, "json")).toBe(1);
    expect(getInitialCodeBlockLanguageItemIndex(items, "typescript")).toBe(0);
    expect(getInitialCodeBlockLanguageItemIndex([], "json")).toBe(-1);
  });

  it("moves the keyboard highlight without crossing the filtered list boundaries", () => {
    expect(moveCodeBlockLanguageItemIndex(-1, 3, "next")).toBe(0);
    expect(moveCodeBlockLanguageItemIndex(-1, 3, "previous")).toBe(2);
    expect(moveCodeBlockLanguageItemIndex(1, 3, "next")).toBe(2);
    expect(moveCodeBlockLanguageItemIndex(2, 3, "next")).toBe(2);
    expect(moveCodeBlockLanguageItemIndex(1, 3, "previous")).toBe(0);
    expect(moveCodeBlockLanguageItemIndex(0, 3, "previous")).toBe(0);
    expect(moveCodeBlockLanguageItemIndex(0, 0, "next")).toBe(-1);
  });

  it("keeps the language menu anchored when its code block scrolls above the viewport", () => {
    const overlayRect = createRect(224, -2607, 1132, 5253);
    const buttonRect = createRect(967, -87, 86, 24);

    const position = calculateCodeBlockLanguageMenuPosition({
      buttonRect,
      overlayRect,
      windowHeight: 1265,
      windowWidth: 1595,
    });

    expect(overlayRect.top + position.top).toBe(buttonRect.bottom + 6);
  });

  it("flips the language menu above a visible button near the viewport bottom", () => {
    const overlayRect = createRect(224, -1807, 1132, 5253);
    const buttonRect = createRect(967, 1180, 86, 24);

    const position = calculateCodeBlockLanguageMenuPosition({
      buttonRect,
      overlayRect,
      windowHeight: 1265,
      windowWidth: 1595,
    });

    expect(overlayRect.top + position.top).toBe(buttonRect.top - codeBlockLanguageMenuMaxHeight - 6);
  });
});
