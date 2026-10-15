import { describe, it, expect } from "vitest";
import { makeFunction } from "../services/transformEngine";
import { sampleFunction } from "../services/functionSampler";
describe("adaptive plotting", () => {
  it("splits reciprocal and tangent at every tested asymptote", () => {
    for (const [expression, poles, min, max] of [
      ["1/x", [0], -1, 1],
      ["tan(x)", [-Math.PI / 2, Math.PI / 2], -4, 4],
    ] as const) {
      const segments = sampleFunction(makeFunction(expression), min, max, 1001);
      for (const pole of poles)
        expect(
          segments.every((s) => !(s[0].x < pole && s.at(-1)!.x > pole)),
        ).toBe(true);
    }
  });
  it("never joins tested simple/even poles at small amplitudes or shifted locations", () => {
    for (const pole of [0.12345, 0.12350001, 0.12300001, 0.7777777])
      for (const amplitude of [1, 1e-6, 1e-12])
        for (const power of [1, 2]) {
          const segments = sampleFunction(
            makeFunction(`${amplitude}/(x-${pole})^${power}`),
            0,
            1,
            1000,
          );
          expect(
            segments.length,
            `${pole}, amplitude=${amplitude}, power=${power}`,
          ).toBeGreaterThan(1);
          expect(
            segments.every((s) => !(s[0].x < pole && s.at(-1)!.x > pole)),
          ).toBe(true);
        }
  });
  it("retains continuous roots and extrema without false discontinuities", () => {
    for (const expression of [
      "x^2",
      "x^3",
      "(x-0.12345)^2",
      "(x-0.12345)^3",
      "sin(100x)",
      "1e-12*sin(100x)",
    ]) {
      const segments = sampleFunction(makeFunction(expression), -1, 1, 1000);
      expect(segments).toHaveLength(1);
      expect(segments[0].length).toBeGreaterThanOrEqual(1001);
      expect(segments[0].every((p) => Number.isFinite(p.y))).toBe(true);
    }
  });
});
