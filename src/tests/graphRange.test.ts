import { describe, expect, it } from "vitest";
import { sourceParameterRange } from "../components/GraphCanvas";
import { makeFunction, reflect } from "../services/transformEngine";
import { sampleFunction } from "../services/functionSampler";

describe("relation sampling follows the complete viewport", () => {
  const corners = [
    { x: 90, y: 8 },
    { x: 90, y: 12 },
    { x: 110, y: 8 },
    { x: 110, y: 12 },
  ];
  it("keeps the x=y² branch visible after panning to (100,10)", () => {
    const relation = reflect(makeFunction("x^2"), 1, -1, 0);
    const range = sourceParameterRange(relation, corners);
    expect(range).toEqual([8, 12]);
    const points = sampleFunction(relation, ...range, 100).flat();
    expect(
      points.some(
        (point) =>
          Math.abs(point.x - 100) < 1e-8 && Math.abs(point.y - 10) < 1e-8,
      ),
    ).toBe(true);
  });
  it("reverses nested reflections in outside-to-inside order", () => {
    const relation = reflect(reflect(makeFunction("x^2"), 1, -1, 0), 0, 1, 0);
    const range = sourceParameterRange(relation, corners);
    expect(range).toEqual([-12, -8]);
    expect(
      sampleFunction(relation, ...range, 100)
        .flat()
        .some(
          (point) =>
            Math.abs(point.x - 100) < 1e-8 && Math.abs(point.y - 10) < 1e-8,
        ),
    ).toBe(true);
  });
  it("retains horizontal viewport bounds for ordinary functions", () => {
    expect(sourceParameterRange(makeFunction("x^2"), corners)).toEqual([
      90, 110,
    ]);
  });
});
