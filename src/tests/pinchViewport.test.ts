import { describe, expect, it } from "vitest";
import { beginPinch, movePinch } from "../utils/pinchViewport";

describe("pinch zoom and pan", () => {
  it.each([
    [390, 280],
    [768, 700],
    [1024, 600],
  ])(
    "keeps the touched world point under moving fingers at %s × %s",
    (width, height) => {
      const start = beginPinch(
        { cx: 7, cy: -3, scale: 55 },
        { x: 80, y: 120 },
        { x: 180, y: 120 },
        width,
        height,
      );
      const next = movePinch(
        start,
        { x: 60, y: 160 },
        { x: 260, y: 160 },
        width,
        height,
      );
      expect(next.scale).toBe(110);
      expect(next.cx + (160 - width / 2) / next.scale).toBeCloseTo(
        start.anchor.x,
      );
      expect(next.cy - (160 - height / 2) / next.scale).toBeCloseTo(
        start.anchor.y,
      );
    },
  );
  it("pans without changing scale when both fingers move together", () => {
    const start = beginPinch(
      { cx: 0, cy: 0, scale: 50 },
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      400,
      400,
    );
    expect(
      movePinch(start, { x: 150, y: 150 }, { x: 250, y: 150 }, 400, 400),
    ).toEqual({ cx: -1, cy: 1, scale: 50 });
  });
  it("rebases a new gesture without a jump after a finger is replaced", () => {
    const view = { cx: 9, cy: -4, scale: 130 };
    const first = { x: 82, y: 47 },
      second = { x: 235, y: 211 };
    const start = beginPinch(view, first, second, 390, 400);
    const next = movePinch(start, first, second, 390, 400);
    expect(next.cx).toBeCloseTo(view.cx);
    expect(next.cy).toBeCloseTo(view.cy);
    expect(next.scale).toBeCloseTo(view.scale);
  });
  it("keeps the viewport finite when the fingers meet", () => {
    const point = { x: 200, y: 100 };
    const start = beginPinch(
      { cx: 0, cy: 0, scale: 55 },
      point,
      point,
      400,
      400,
    );
    const next = movePinch(start, point, point, 400, 400);
    expect(Object.values(next).every(Number.isFinite)).toBe(true);
    expect(next.scale).toBeGreaterThan(0);
  });
});
