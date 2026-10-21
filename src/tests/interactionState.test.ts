import { describe, expect, it } from "vitest";
import { uiLayers, uiAtDepth } from "../utils/useUiHistory";
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
});
