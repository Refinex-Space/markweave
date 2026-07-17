import { describe, expect, it } from "vitest";
import {
  calculateCodeBlockLanguageMenuPosition,
  codeBlockLanguageMenuMaxHeight,
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
