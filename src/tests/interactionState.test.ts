import { describe, expect, it } from "vitest";
import { uiLayers, uiAtDepth } from "../utils/useUiHistory";
import { viewportAfterHeightResize } from "../utils/resizeViewport";
describe("interaction frame state", () => {
  const snapshot = {
    landscape: true,
    panel: true,
    mode: "domain",
    keyboard: true,
    settings: false,
    help: false,
    palette: false,
  };
  it("backs out of one layer at a time while retaining the underlying workbench", () => {
    expect(uiLayers(snapshot)).toEqual([
      "landscape",
      "panel",
      "subtool",
      "keyboard",
    ]);
    expect(uiAtDepth(snapshot, 3)).toEqual({ ...snapshot, keyboard: false });
    expect(uiAtDepth(snapshot, 2)).toEqual({
      ...snapshot,
      keyboard: false,
      mode: "more",
    });
    expect(uiAtDepth(snapshot, 1).landscape).toBe(true);
    expect(uiAtDepth(snapshot, 1).panel).toBe(false);
  });
  it("holds world points at the same screen position when a keyboard changes graph height", () => {
    const view = { cx: 1, cy: 2, scale: 55 };
    const next = viewportAfterHeightResize(
      view,
      { width: 390, height: 500 },
      { width: 390, height: 330 },
    );
    const y = 4;
    expect(330 / 2 - (y - next.cy) * next.scale).toBeCloseTo(
      500 / 2 - (y - view.cy) * view.scale,
    );
    expect(next.cx).toBe(view.cx);
    expect(next.scale).toBe(view.scale);
    expect(
      viewportAfterHeightResize(
        view,
        { width: 390, height: 500 },
        { width: 844, height: 330 },
      ),
    ).toBe(view);
  });
});
