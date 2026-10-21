import { describe, expect, it } from "vitest";
import { makeFunction } from "../services/transformEngine";
import { curveLabelText } from "../utils/curveLabelText";

describe("curve identification labels", () => {
  it("connects a short formula to its function name", () => {
    expect(curveLabelText(makeFunction("x^2"))).toBe("f(x) = x²");
    expect(curveLabelText(makeFunction("sin(x)"))).toBe("f(x) = sin(x)");
  });
  it("never rewrites larger or fractional exponents as squares", () => {
    expect(curveLabelText(makeFunction("x^20"))).toContain("x^20");
    expect(curveLabelText(makeFunction("x^2.5"))).toContain("x^2.5");
    expect(curveLabelText(makeFunction("x^30"))).toContain("x^30");
  });
  it("only replaces the mathematical pi constant", () => {
    expect(curveLabelText(makeFunction("pi*x"))).toContain("π·x");
    const fn = makeFunction("x");
    expect(curveLabelText({ ...fn, currentExpression: "spin(x)" })).toContain(
      "spin(x)",
    );
  });
  it("keeps long expressions in the selected-function readout rather than crowding the plot", () => {
    const fn = makeFunction("x");
    expect(
      curveLabelText({
        ...fn,
        currentExpression: "sin(x)+cos(x)+tan(x)+x^2+1",
      }),
    ).toBe("f(x)");
  });
});
