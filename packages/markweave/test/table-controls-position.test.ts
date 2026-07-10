import { describe, expect, it } from "vitest";
import {
  calculateTableControlsPosition,
  calculateTableEdgeHandlePosition,
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
});
