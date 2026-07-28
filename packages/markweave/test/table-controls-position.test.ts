import { describe, expect, it } from "vitest";
import {
  calculateAnchoredTableMenuPosition,
  calculateAnchoredTableSubmenuPosition,
  calculateTableControlsPosition,
  calculateTableAxisHandleLayout,
  calculateTableEdgeHandlePosition,
  calculateTableExtendButtonLayout,
  calculateTableMenuPosition,
} from "../src/plugins/table/table-ui-model";

describe("table controls positioning", () => {
  it("places controls above the active cell inside the editor frame", () => {
    expect(
      calculateTableControlsPosition({
        cellRect: { left: 180, top: 240, width: 160, height: 36 },
        frameRect: { left: 100, top: 120, width: 720, height: 480 },
        controlsSize: { width: 78, height: 26 },
      }),
    ).toEqual({ left: 80, top: 88 });
  });

  it("clamps controls inside the editor frame boundaries", () => {
    expect(
      calculateTableControlsPosition({
        cellRect: { left: 102, top: 124, width: 160, height: 36 },
        frameRect: { left: 100, top: 120, width: 180, height: 120 },
        controlsSize: { width: 78, height: 26 },
      }),
    ).toEqual({ left: 8, top: 8 });

    expect(
      calculateTableControlsPosition({
        cellRect: { left: 360, top: 300, width: 160, height: 36 },
        frameRect: { left: 100, top: 120, width: 220, height: 150 },
        controlsSize: { width: 90, height: 26 },
      }),
    ).toEqual({ left: 122, top: 116 });
  });

  it("places an open table menu below the handles when there is room", () => {
    expect(
      calculateTableMenuPosition({
        controlsRect: { left: 180, top: 240, width: 78, height: 26 },
        frameRect: { left: 100, top: 120, width: 720, height: 480 },
        menuSize: { width: 180, height: 260 },
      }),
    ).toEqual({ left: 0, top: 32 });
  });

  it("flips and clamps an open table menu inside the editor frame near boundaries", () => {
    expect(
      calculateTableMenuPosition({
        controlsRect: { left: 760, top: 500, width: 78, height: 26 },
        frameRect: { left: 100, top: 120, width: 720, height: 480 },
        menuSize: { width: 180, height: 180 },
      }),
    ).toEqual({ left: -128, top: -186 });

    expect(
      calculateTableMenuPosition({
        controlsRect: { left: 104, top: 124, width: 78, height: 26 },
        frameRect: { left: 100, top: 120, width: 180, height: 120 },
        menuSize: { width: 180, height: 180 },
      }),
    ).toEqual({ left: 4, top: 4 });
  });

  it("keeps anchored menus inside the visible frame and exposes an internal scroll height", () => {
    expect(
      calculateAnchoredTableMenuPosition({
        anchorRect: { left: 170, top: 420, width: 160, height: 12 },
        frameRect: { left: 100, top: 80, width: 300, height: 760 },
        boundaryRect: { left: 100, top: 80, width: 300, height: 480 },
        menuSize: { width: 232, height: 520 },
        kind: "column",
      }),
    ).toEqual({ left: 60, top: 8, placement: "top", maxHeight: 326 });
  });

  it("flips row menus to the left when the right edge has insufficient room", () => {
    expect(
      calculateAnchoredTableMenuPosition({
        anchorRect: { left: 786, top: 220, width: 12, height: 120 },
        frameRect: { left: 100, top: 80, width: 720, height: 600 },
        boundaryRect: { left: 100, top: 80, width: 720, height: 600 },
        menuSize: { width: 232, height: 360 },
        kind: "row",
      }),
    ).toEqual({ left: 448, top: 138, placement: "left", maxHeight: 360 });
  });

  it("places submenus on the visible side and clamps them vertically", () => {
    expect(
      calculateAnchoredTableSubmenuPosition({
        triggerRect: { left: 650, top: 410, width: 220, height: 30 },
        parentMenuRect: { left: 640, top: 180, width: 232, height: 300 },
        boundaryRect: { left: 80, top: 60, width: 840, height: 440 },
        submenuSize: { width: 228, height: 620 },
      }),
    ).toEqual({ left: -234, top: -112, placement: "left", maxHeight: 424 });

    expect(
      calculateAnchoredTableSubmenuPosition({
        triggerRect: { left: 250, top: 120, width: 220, height: 30 },
        parentMenuRect: { left: 240, top: 100, width: 232, height: 300 },
        boundaryRect: { left: 80, top: 60, width: 840, height: 440 },
        submenuSize: { width: 228, height: 180 },
      }),
    ).toEqual({ left: 238, top: 15, placement: "right", maxHeight: 180 });
  });

  it("positions hover row and column edge handles inside the editor frame", () => {
    const targetRect = { left: 180, top: 240, width: 160, height: 36 };
    const frameRect = { left: 100, top: 120, width: 720, height: 480 };

    expect(
      calculateTableEdgeHandlePosition({
        targetRect,
        frameRect,
        kind: "row",
      }),
    ).toEqual({ left: 80, top: 116 });

    expect(
      calculateTableEdgeHandlePosition({
        targetRect,
        frameRect,
        kind: "column",
      }),
    ).toEqual({ left: 138, top: 109 });
  });

  it("keeps the hover row handle inside the frame near left-edge tables", () => {
    expect(
      calculateTableEdgeHandlePosition({
        targetRect: { left: 104, top: 240, width: 160, height: 36 },
        frameRect: { left: 100, top: 120, width: 720, height: 480 },
        kind: "row",
      }),
    ).toEqual({ left: 4, top: 116 });
  });

  it("sizes axis handles to the complete active row or column", () => {
    const targetRect = { left: 180, top: 240, width: 160, height: 36 };
    const frameRect = { left: 100, top: 120, width: 720, height: 480 };

    expect(calculateTableAxisHandleLayout({ targetRect, frameRect, kind: "row" })).toEqual({ left: 64, top: 120, width: 12, height: 36 });
    expect(calculateTableAxisHandleLayout({ targetRect, frameRect, kind: "column" })).toEqual({ left: 80, top: 104, width: 160, height: 12 });
  });

  it("places add-row and add-column strips flush with the table edge", () => {
    const tableRect = { left: 120, top: 120, width: 720, height: 120 };
    const frameRect = { left: 0, top: 0, width: 1000, height: 600 };

    expect(calculateTableExtendButtonLayout({ tableRect, frameRect, kind: "row" })).toEqual({ left: 120, top: 248, width: 720, height: 12 });
    expect(calculateTableExtendButtonLayout({ tableRect, frameRect, kind: "column" })).toEqual({ left: 848, top: 120, width: 12, height: 120 });
  });
});
