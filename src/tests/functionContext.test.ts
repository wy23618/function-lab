import { describe, expect, it } from "vitest";
import {
  prepareFunction,
  canonicalExpression,
} from "../services/functionContext";
import { derived, transform } from "../services/transformEngine";
import { evaluateFunction } from "../services/functionSampler";
import {
  derivativeExpression,
  slope,
  parity,
} from "../services/analysisEngine";
import { createInverse } from "../services/inverseEngine";
import {
  decodeProject,
  encodeProject,
  validateFunctions,
} from "../services/projectStore";

describe("function variables and composition", () => {
  it("evaluates arbitrary independent variables and numeric parameters", () => {
    const fn = prepareFunction("f(t)=m*t^2+n");
    expect(fn.variable).toBe("t");
    expect(fn.parameters).toEqual({ m: 1, n: 1 });
    const configured = { ...fn, parameters: { m: 3, n: -2 } };
    expect(evaluateFunction(configured, 2)).toBe(10);
    expect(evaluateFunction(transform(configured, "translate", 2, 5), 4)).toBe(
      15,
    );
    expect(evaluateFunction(transform(configured, "scale", 2, -3), 1)).toBe(50);
    expect(evaluateFunction(transform(configured, "y"), 2)).toBe(10);
  });
  it("differentiates parameters symbolically and preserves current variable", () => {
    const fn = { ...prepareFunction("f(m)=n*m^2"), parameters: { n: 3 } };
    const derivative = derived(fn, derivativeExpression(fn), "导函数", "", "");
    expect(derivative.currentExpression).toContain("m");
    expect(evaluateFunction(derivative, 2)).toBe(12);
    expect(evaluateFunction({ ...derivative, parameters: { n: 4 } }, 2)).toBe(
      16,
    );
    expect(slope(fn, 2)).toBeCloseTo(12);
    expect(parity(fn).kind).toBe("偶函数");
  });
  it("updates derivative source domain when its parameter changes", () => {
    const fn = prepareFunction("f(t)=sqrt(m*t)");
    const derivative = {
      ...derived(fn, derivativeExpression(fn), "导函数", "", ""),
      differentiabilityChecks: [
        { expression: fn.currentExpression, argument: "t", source: fn },
      ],
    };
    expect(evaluateFunction(derivative, 1)).toBeCloseTo(0.5);
    const flipped = { ...derivative, parameters: { m: -1 } };
    expect(evaluateFunction(flipped, -1)).toBeCloseTo(-0.5);
    expect(Number.isNaN(evaluateFunction(flipped, 1))).toBe(true);
  });
  it("does not confuse a parameter named x with an independent t", () => {
    const fn = { ...prepareFunction("f(t)=x*t"), parameters: { x: 2 } };
    const derivative = derived(fn, derivativeExpression(fn), "导函数", "", "");
    expect(evaluateFunction(derivative, 5)).toBe(2);
    expect(evaluateFunction(fn, 5)).toBe(10);
    expect(createInverse(fn).valid).toBe(true);
  });
  it("captures nested named functions, including their input domains", () => {
    const f = prepareFunction("f(t)=t^2");
    const g = {
      ...prepareFunction("g(m)=m+1", 1, [f]),
      domain: { min: 0, max: 4, minInclusive: true, maxInclusive: false },
    };
    const composite = prepareFunction("h(n)=f(g(n))", 2, [f, g]);
    expect(evaluateFunction(composite, 2)).toBe(9);
    expect(Number.isNaN(evaluateFunction(composite, -1))).toBe(true);
    expect(Number.isNaN(evaluateFunction(composite, 4))).toBe(true);
    expect(canonicalExpression(composite)).toContain("x");
    expect(createInverse(composite).valid).toBe(false);
    const restored = validateFunctions(
      decodeProject(encodeProject([composite])),
    )[0];
    expect(evaluateFunction(restored, 2)).toBe(9);
    expect(Number.isNaN(evaluateFunction(restored, -1))).toBe(true);
    expect(evaluateFunction(transform(composite, "translate", 1, 2), 3)).toBe(
      11,
    );
  });
  it("calculates inverse with configured parameters and chosen variable", () => {
    const fn = { ...prepareFunction("f(t)=m*t+n"), parameters: { m: 2, n: 3 } };
    const inverse = createInverse(fn);
    expect(inverse.valid).toBe(true);
    const inverseFn = {
      ...derived(fn, inverse.expression!, "反函数", "", "", inverse.domain),
      parameters: {},
      bindings: {},
    };
    expect(evaluateFunction(inverseFn, 7)).toBe(2);
  });
  it("validates malformed parameter and binding metadata", () => {
    const fn = prepareFunction("sin(t)");
    expect(() =>
      validateFunctions([{ ...fn, parameters: { m: Infinity } }]),
    ).toThrow();
    expect(() =>
      validateFunctions([{ ...fn, bindings: { f: null } }]),
    ).toThrow();
    expect(() =>
      prepareFunction("f(t)=t", 1, [prepareFunction("f(x)=x")]),
    ).toThrow();
  });
});
