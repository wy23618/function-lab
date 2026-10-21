import { describe, expect, it } from "vitest";
import { makeFunction, reflect } from "../services/transformEngine";
import { fitGraphViewport } from "../utils/fitViewport";

describe("readable automatic viewport", () => {
  for (const size of [
    { width: 1130, height: 797 },
    { width: 390, height: 338 },
    { width: 565, height: 253 },
  ]) {
    it(`keeps the default curves readable at ${size.width}×${size.height}`, () => {
      const view = fitGraphViewport(
        ["x^2", "sin(x)", "2*x+1"].map((value) => makeFunction(value)),
        size,
      )!;
      expect(view.scale).toBeGreaterThan(20);
      expect(Math.abs(view.cy)).toBeLessThan(10);
    });
  }
  for (const expression of ["1/x", "tan(x)", "exp(100*x)", "1/(x-0.025)^2"]) {
    it(`does not let ${expression} pull the camera into extreme coordinates`, () => {
      const view = fitGraphViewport([makeFunction(expression)], {
        width: 390,
        height: 338,
      })!;
      expect(view.scale).toBeGreaterThan(15);
      expect(Math.abs(view.cy)).toBeLessThan(30);
      expect(Object.values(view).every(Number.isFinite)).toBe(true);
    });
  }
  it("fits reflected relations and preserves distant constants", () => {
    const relation = reflect(makeFunction("x^2"), 1, -1, 0);
    const view = fitGraphViewport([relation], { width: 800, height: 600 })!;
    expect(view.scale).toBeGreaterThan(20);
    expect(view.cx).toBeGreaterThan(0);
    const constant = fitGraphViewport([makeFunction("1000")], {
      width: 800,
      height: 600,
    })!;
    expect(constant.cy).toBe(1000);
    expect(constant.scale).toBeGreaterThan(40);
  });
  it("ignores hidden curves and reports an empty valid sample", () => {
    const hidden = { ...makeFunction("exp(x)"), visible: false };
    expect(fitGraphViewport([hidden], { width: 800, height: 600 })).toBeNull();
    expect(
      fitGraphViewport([makeFunction("sqrt(-1)")], { width: 800, height: 600 }),
    ).toBeNull();
  });
});
