import { describe, it, expect } from "vitest";
import { makeFunction } from "../services/transformEngine";
import { parseDomain, compileExpression } from "../services/expressionParser";
import { createInverse } from "../services/inverseEngine";
import { evaluateFunction } from "../services/functionSampler";
describe("trigonometric inverse branches", () => {
  it("inverts whole monotonic sine and cosine branches including shifted periods", () => {
    for (const [expression, domain, x] of [
      ["sin(x)", "[-pi/2,pi/2]", 0.4],
      ["sin(x)", "[pi/2,3pi/2]", 2],
      ["sin(x)", "[3pi/2,5pi/2]", 7],
      ["cos(x)", "[0,pi]", 2],
      ["cos(x)", "[-pi,0]", -2],
      ["cos(x)", "[2pi,3pi]", 8],
    ] as const) {
      const source = {
          ...makeFunction(expression),
          domain: parseDomain(domain),
        },
        inverse = createInverse(source);
      expect(inverse.valid).toBe(true);
      expect(
        compileExpression(inverse.expression!)(evaluateFunction(source, x)),
      ).toBeCloseTo(x, 10);
    }
  });
  it("swaps exact ranges and excludes tangent poles", () => {
    const sine = createInverse({
      ...makeFunction("sin(x)"),
      domain: parseDomain("[-pi/2,pi/2)"),
    });
    expect(sine.domain).toEqual(parseDomain("[-1,1)"));
    const tangent = createInverse({
      ...makeFunction("tan(x)"),
      domain: parseDomain("(-pi/2,pi/2)"),
    });
    expect(tangent.domain).toEqual(parseDomain("(-∞,∞)"));
    expect(compileExpression(tangent.expression!)(3)).toBeCloseTo(Math.atan(3));
  });
  it("rejects full periodic functions and intervals crossing extrema", () => {
    for (const expression of ["sin(x)", "cos(x)", "tan(x)"])
      expect(createInverse(makeFunction(expression)).valid).toBe(false);
    expect(
      createInverse({
        ...makeFunction("sin(x)"),
        domain: parseDomain("[0,pi]"),
      }).valid,
    ).toBe(false);
    expect(
      createInverse({ ...makeFunction("tan(x)"), domain: parseDomain("[1,2]") })
        .reason,
    ).toMatch(/跨越|连续/);
  });
  it("supports inverse trig and affine transformed branches", () => {
    for (const [expression, domain, x] of [
      ["asin(x)", "[-1,1]", 0.3],
      ["acos(x)", "[-1,1]", -0.4],
      ["2sin(3x-1)+4", "[0,0.5]", 0.2],
    ] as const) {
      const source = {
          ...makeFunction(expression),
          domain: parseDomain(domain),
        },
        inverse = createInverse(source);
      expect(inverse.valid).toBe(true);
      expect(
        compileExpression(inverse.expression!)(evaluateFunction(source, x)),
      ).toBeCloseTo(x, 10);
    }
  });
});
