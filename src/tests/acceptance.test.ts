import { describe, expect, it } from "vitest";
import type { FunctionDefinition } from "../types/function";
import { compileExpression, parseDomain } from "../services/expressionParser";
import { derivativeExpression } from "../services/analysisEngine";
import { evaluateFunction, sampleFunction } from "../services/functionSampler";
import { createInverse } from "../services/inverseEngine";
import {
  derived,
  makeFunction,
  reflect,
  transform,
} from "../services/transformEngine";

function derivativeFunction(fn: FunctionDefinition): FunctionDefinition {
  const out = derived(
    fn,
    derivativeExpression(fn),
    "导函数",
    "d/dx",
    "保留原函数有效性",
  );
  out.differentiabilityChecks = [
    ...(fn.differentiabilityChecks ?? []),
    { expression: fn.currentExpression, argument: "x" },
  ];
  return out;
}

describe("final mathematical acceptance", () => {
  it("fills only removable symbolic derivative points with a verified finite source derivative", () => {
    const d = derivativeFunction(makeFunction("abs(x^2)"));
    expect(evaluateFunction(d, 0)).toBeCloseTo(0, 8);
    expect(evaluateFunction(transform(d, "translate", 3, 2), 3)).toBeCloseTo(
      2,
      8,
    );
    const hole = derivativeFunction(makeFunction("x/x"));
    expect(evaluateFunction(hole, 0)).toBeNaN();
  });
  it("satisfies basic symmetry and absolute-input acceptance cases", () => {
    for (const x of [-3, -1, 0, 1, 3]) {
      const square = makeFunction("x^2"),
        cube = makeFunction("x^3");
      expect(evaluateFunction(transform(square, "y"), x)).toBe(x * x);
      expect(evaluateFunction(transform(cube, "origin"), x)).toBe(x * x * x);
      expect(evaluateFunction(transform(square, "absX"), x)).toBe(x * x);
      expect(evaluateFunction(transform(cube, "absX"), x)).toBe(
        Math.abs(x) ** 3,
      );
    }
  });
  it("interprets e^πx as exponential classroom notation, including inverse and derivative", () => {
    const fn = makeFunction("e^πx");
    expect(evaluateFunction(fn, 2)).toBeCloseTo(Math.exp(2 * Math.PI));
    expect(compileExpression(derivativeExpression(fn))(1)).toBeCloseTo(
      Math.PI * Math.exp(Math.PI),
    );
    const inverse = createInverse(fn);
    expect(inverse.valid).toBe(true);
    expect(inverse.domain).toEqual(parseDomain("x>0"));
    expect(
      compileExpression(inverse.expression!)(Math.exp(-2 * Math.PI)),
    ).toBeCloseTo(-2);
  });
  it("keeps removable holes excluded from a simplified derivative", () => {
    const derivative = derivativeFunction(makeFunction("x/x"));
    expect(evaluateFunction(derivative, 0)).toBeNaN();
    expect(evaluateFunction(derivative, 1)).toBe(0);
    const translated = transform(derivative, "translate", 3, -2);
    expect(evaluateFunction(translated, 3)).toBeNaN();
    expect(evaluateFunction(translated, 4)).toBe(-2);
  });
  it("keeps the original real domain when derivative simplification removes square roots", () => {
    const derivative = derivativeFunction(makeFunction("sqrt(x)^2"));
    expect(evaluateFunction(derivative, -1)).toBeNaN();
    expect(evaluateFunction(derivative, 0)).toBeNaN();
    expect(evaluateFunction(derivative, 2)).toBeCloseTo(1);
  });
  it("preserves nonzero inherited domains through absolute input and multiple transforms", () => {
    const original = { ...makeFunction("x"), domain: parseDomain("0<x<2") };
    const absolute = transform(original, "absX");
    expect(evaluateFunction(absolute, -1)).toBe(1);
    expect(evaluateFunction(absolute, 0)).toBeNaN();
    expect(evaluateFunction(absolute, 2)).toBeNaN();
    const translated = transform(absolute, "translate", 3, 4);
    const scaled = transform(translated, "scale", -2, -1);
    expect(evaluateFunction(scaled, -3)).toBeNaN();
    expect(evaluateFunction(scaled, -4)).toBe(-10);
    expect(evaluateFunction(scaled, -5)).toBeNaN();
  });
  it("reflects points and inherited holes accurately through an arbitrary line and back", () => {
    const constrained = transform(
      { ...makeFunction("x"), domain: parseDomain("0<x<2") },
      "absX",
    );
    const once = reflect(constrained, 2, -3, 7),
      twice = reflect(once, 2, -3, 7);
    const direct = sampleFunction(constrained, -2, 2, 64),
      back = sampleFunction(twice, -2, 2, 64);
    expect(back.map((s) => s.length)).toEqual(direct.map((s) => s.length));
    direct.forEach((s, i) =>
      s.forEach((p, j) => {
        expect(back[i][j].x).toBeCloseTo(p.x, 10);
        expect(back[i][j].y).toBeCloseTo(p.y, 10);
      }),
    );
    expect(direct.flat().some((p) => p.x === 0)).toBe(false);
  });
  it("maps ranges and endpoint inclusion correctly for decreasing transformed inverse branches", () => {
    const fn = {
        ...makeFunction("-2sqrt(3-x)+7"),
        domain: parseDomain("[1,3]"),
      },
      inverse = createInverse(fn);
    expect(inverse.valid).toBe(true);
    expect(inverse.domain!.min).toBeCloseTo(7 - 2 * Math.sqrt(2));
    expect(inverse.domain!.max).toBe(7);
    expect(inverse.domain!.minInclusive).toBe(true);
    expect(inverse.domain!.maxInclusive).toBe(true);
    for (const x of [1, 2, 3])
      expect(
        compileExpression(inverse.expression!)(evaluateFunction(fn, x)),
      ).toBeCloseTo(x);
  });
  it("splits scaled simple poles even when finite sampled values are visually small", () => {
    const segments = sampleFunction(
      makeFunction("0.000001/(x-0.12345)"),
      0,
      1,
      1001,
    );
    expect(segments.length).toBeGreaterThan(1);
    expect(
      segments.every((s) => !(s[0].x < 0.12345 && s.at(-1)!.x > 0.12345)),
    ).toBe(true);
  });
  it("splits an even order pole almost exactly midway between grid points", () => {
    const pole = 0.12350001,
      segments = sampleFunction(makeFunction(`1/(x-${pole})^2`), 0, 1, 1000);
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((s) => !(s[0].x < pole && s.at(-1)!.x > pole))).toBe(
      true,
    );
  });
});
