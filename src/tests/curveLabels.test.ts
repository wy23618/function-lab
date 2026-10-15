import { describe, expect, it } from "vitest";
import { placeCurveLabels, segmentHitsBox } from "../utils/curveLabels";

describe("screen-space name placement", () => {
  it("detects a steep segment crossing a text box even when endpoints are outside", () => {
    expect(
      segmentHitsBox(
        { x: 10, y: 0 },
        { x: 40, y: 200 },
        { x: 20, y: 80, width: 40, height: 30 },
      ),
    ).toBe(true);
    expect(
      segmentHitsBox(
        { x: 0, y: 0 },
        { x: 5, y: 200 },
        { x: 20, y: 80, width: 40, height: 30 },
      ),
    ).toBe(false);
  });
  const curve = {
    id: "f",
    width: 42,
    height: 25,
    segments: [
      Array.from({ length: 81 }, (_, i) => ({ x: 20 + i * 4, y: 150 })),
    ],
  };
  it("places readable names close to their curve and outside controls", () => {
    const [label] = placeCurveLabels([curve], 400, 300, [
      { x: 120, y: 95, width: 160, height: 30 },
    ]);
    expect(label).toBeDefined();
    expect(segmentHitsBox({ x: 20, y: 150 }, { x: 340, y: 150 }, label)).toBe(
      false,
    );
    expect(
      Math.min(Math.abs(label.y - 150), Math.abs(label.y + label.height - 150)),
    ).toBeLessThanOrEqual(24);
  });
  it("preserves a valid previous placement and hides when every space is blocked", () => {
    const [first] = placeCurveLabels([curve], 400, 300, []);
    const [second] = placeCurveLabels(
      [
        {
          ...curve,
          preferred: { anchor: first.anchor, dx: first.dx, dy: first.dy },
        },
      ],
      400,
      300,
      [],
    );
    expect(second).toEqual(first);
    expect(
      placeCurveLabels([curve], 400, 300, [
        { x: 0, y: 0, width: 400, height: 300 },
      ]),
    ).toEqual([]);
  });
  it("does not assign ambiguous names to coincident curves", () => {
    expect(
      placeCurveLabels([curve, { ...curve, id: "g" }], 400, 300, []),
    ).toEqual([]);
  });
});
