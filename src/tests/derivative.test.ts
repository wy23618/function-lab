import { describe, it, expect } from "vitest";
import { slope } from "../services/analysisEngine";
import { makeFunction } from "../services/transformEngine";
describe("convergent derivatives", () => {
  it("handles steep smooth points by reducing the step", () => {
    expect(slope(makeFunction("1/x"), 0.0001) / -1e8).toBeCloseTo(1, 5);
    expect(slope(makeFunction("sin(100000x)"), 0)).toBeCloseTo(100000, 0);
  });
  it("rejects cusps, vertical tangents and excluded real points", () => {
    expect(slope(makeFunction("abs(x)"), 0)).toBeNaN();
    expect(slope(makeFunction("sign(x)*abs(x)^(1/3)"), 0)).toBeNaN();
    expect(slope(makeFunction("sqrt(x)"), 0)).toBeNaN();
    expect(slope(makeFunction("log(x)"), -1)).toBeNaN();
  });
});
