import { describe, it, expect } from "vitest";
import { ALL_DOMAIN } from "../types/function";
import type { FunctionDefinition } from "../types/function";
import {
  compileExpression,
  normalizeExpression,
  parseDomain,
  domainContains,
} from "../services/expressionParser";
import { evaluateFunction, sampleFunction } from "../services/functionSampler";
import {
  roots,
  intersections,
  parity,
  slope,
  derivativeExpression,
  coincidentFunctions,
} from "../services/analysisEngine";
import { createInverse } from "../services/inverseEngine";
const fn = (
  expression: string,
  domain = { ...ALL_DOMAIN },
): FunctionDefinition => ({
  id: "test",
  name: "f",
  originalExpression: expression,
  currentExpression: expression,
  color: "#fff",
  visible: true,
  locked: false,
  domain,
  lineStyle: "solid",
  kind: "function",
  transformHistory: [],
});
describe("safe expression parsing", () => {
  it("accepts pi adjacent to x in exponential input", () => {
    for (const expression of [
      "e^(πx)",
      "e^(Πx)",
      "e^(pix)",
      "e^πx",
      "e^Πx",
      "e^(pi*x)",
      "exp(πx)",
    ]) {
      expect(compileExpression(expression)(1)).toBeCloseTo(
        Math.exp(Math.PI),
        10,
      );
      expect(compileExpression(expression)(-1)).toBeCloseTo(
        Math.exp(-Math.PI),
        10,
      );
    }
    expect(compileExpression("e^π*x")(2)).toBeCloseTo(
      Math.exp(Math.PI) * 2,
      10,
    );
    expect(compileExpression("πx")(2)).toBeCloseTo(2 * Math.PI, 10);
    expect(compileExpression("e^(2πx)")(0.5)).toBeCloseTo(
      Math.exp(Math.PI),
      10,
    );
    expect(compileExpression("sin(2πx)")(0.25)).toBeCloseTo(1, 10);
  });
  it("normalizes classroom notation", () => {
    expect(compileExpression("y = 2x² + sin x")(2)).toBeCloseTo(
      8 + Math.sin(2),
    );
    expect(compileExpression("f(x)=√x+|x|")(4)).toBe(6);
    expect(compileExpression("π x")(2)).toBeCloseTo(Math.PI * 2);
    expect(normalizeExpression("x³")).toBe("x^(3)");
  });
  it("rejects programming constructs and nonreal values", () => {
    for (const expression of [
      "x=3",
      "unknown+1",
      "[1,2]",
      "x.constructor",
      'import("x")',
      "f(x)=x;2",
    ])
      expect(() => compileExpression(expression)).toThrow();
    expect(compileExpression("sqrt(x)")(-1)).toBeNaN();
    expect(compileExpression("1/x")(0)).toBeNaN();
  });
  it("honors domain endpoints", () => {
    const d = parseDomain("(-∞,π]");
    expect(d.max).toBeCloseTo(Math.PI);
    expect(domainContains(d, Math.PI)).toBe(true);
    expect(domainContains(parseDomain("(0,1)"), 0)).toBe(false);
    expect(() => parseDomain("[2,1]")).toThrow();
  });
  it("accepts all specified inequality forms and named assignments", () => {
    for (const name of ["f", "g", "h"])
      expect(compileExpression(`${name}(x)=x²`)(3)).toBe(9);
    expect(parseDomain("x>0")).toEqual(parseDomain("(0,∞)"));
    expect(parseDomain("x≥0")).toEqual(parseDomain("[0,∞)"));
    expect(parseDomain("-2≤x≤5")).toEqual(parseDomain("[-2,5]"));
    expect(parseDomain("-pi < x <= pi")).toEqual(parseDomain("(-pi,pi]"));
    expect(parseDomain("5 > x >= -2")).toEqual(parseDomain("[-2,5)"));
    expect(parseDomain("0<x<2")).toEqual(parseDomain("(0,2)"));
    expect(() => parseDomain("2<x<1")).toThrow();
  });
  it("reports parse failures in readable Chinese", () => {
    expect(() => compileExpression("sin(x")).toThrow(/括号/);
    expect(() => compileExpression("x+")).toThrow(/表达式格式错误/);
    expect(() => compileExpression("sin()")).toThrow(/参数个数/);
    expect(() => compileExpression("sin(x,2)")).toThrow(/参数个数/);
  });
});
describe("numerical services", () => {
  it("breaks discontinuities without reporting poles as roots", () => {
    expect(sampleFunction(fn("1/(x-2)"), -1, 5, 1001).length).toBeGreaterThan(
      1,
    );
    expect(roots(fn("1/(x-2)"), -1, 5)).toHaveLength(0);
    expect(sampleFunction(fn("tan(x)"), -4, 4, 1600).length).toBeGreaterThan(1);
    const r = roots(fn("tan(x)"), -4, 4);
    expect(r).toHaveLength(3);
  });
  it("finds tangent roots and curve intersections", () => {
    expect(roots(fn("(x-0.123)^2"), -1, 1)[0].x).toBeCloseTo(0.123, 5);
    expect(intersections(fn("x^2"), fn("1"), -3, 3).map((p) => p.x)).toEqual(
      expect.arrayContaining([expect.closeTo(-1, 5), expect.closeTo(1, 5)]),
    );
    expect(slope(fn("x^2"), 2)).toBeCloseTo(4, 5);
    expect(parity(fn("x^2")).kind).toBe("偶函数");
    expect(parity(fn("x^3")).kind).toBe("奇函数");
    expect(evaluateFunction(fn("x", parseDomain("(0,1)")), 0)).toBeNaN();
  });
  it("reflects a relation geometrically", () => {
    const source = fn("2x");
    const relation = {
      ...source,
      kind: "relation" as const,
      source,
      reflection: { a: 1, b: -1, c: 0 },
    };
    const segment = sampleFunction(relation, 0, 1, 16)[0];
    expect(segment.at(-1)).toEqual({ x: 2, y: 1 });
  });
  it("does not claim a derivative at cusps or excluded endpoints", () => {
    expect(slope(fn("abs(x)"), 0)).toBeNaN();
    expect(slope(fn("sqrt(x)"), 0)).toBeNaN();
    expect(slope(fn("x", parseDomain("(0,1)")), 0)).toBeNaN();
  });
  it("excludes coincident curves and continuum roots", () => {
    expect(coincidentFunctions(fn("2x-x"), fn("x"))).toBe(true);
    expect(intersections(fn("2x-x"), fn("x"), -5, 5)).toEqual([]);
    expect(roots(fn("0"), -5, 5)).toEqual([]);
    expect(intersections(fn("max(x,0)"), fn("0"), -5, 5)).toEqual([]);
  });
  it("samples high frequency curves and narrow/open domains", () => {
    const segment = sampleFunction(fn("sin(100x)"), -3, 3)[0];
    expect(segment.length).toBeGreaterThanOrEqual(1601);
    expect(
      segment.every((p) => Number.isFinite(p.y) && Math.abs(p.y) <= 1),
    ).toBe(true);
    const narrow = sampleFunction(fn("x", parseDomain("[2,2.0001]")), -8, 8)[0];
    expect(narrow[0].x).toBe(2);
    expect(narrow.at(-1)!.x).toBe(2.0001);
    const open = sampleFunction(fn("x", parseDomain("(0,1)")), -8, 8)[0];
    expect(open.every((p) => p.x > 0 && p.x < 1)).toBe(true);
  });
  it("honors all inherited domain constraints", () => {
    const constrained = {
      ...fn("log(abs(x))"),
      domainConstraints: [{ expression: "abs(x)", domain: parseDomain("x>0") }],
    };
    expect(evaluateFunction(constrained, -2)).toBeCloseTo(Math.log(2));
    expect(evaluateFunction(constrained, 0)).toBeNaN();
    const shifted = {
      ...fn("x"),
      domainConstraints: [{ expression: "x-3", domain: parseDomain("x>0") }],
    };
    expect(evaluateFunction(shifted, 2)).toBeNaN();
    expect(evaluateFunction(shifted, 4)).toBe(4);
  });
  it("generates safe symbolic derivative expressions", () => {
    expect(
      compileExpression(derivativeExpression(fn("x^3+sin(x)")))(2),
    ).toBeCloseTo(12 + Math.cos(2));
    expect(
      compileExpression(derivativeExpression(fn("log(x)")))(2),
    ).toBeCloseTo(0.5);
    expect(compileExpression(derivativeExpression(fn("7")))(2)).toBe(0);
  });
  it("uses symbolic parity rules without claiming asymmetric domains", () => {
    expect(parity(fn("sin(400pi*x)")).kind).toBe("奇函数");
    expect(parity(fn("cos(x)+x²")).kind).toBe("偶函数");
    expect(parity(fn("x+1")).kind).toBe("非奇非偶");
    expect(parity(fn("x^2", parseDomain("x>=0"))).kind).toBe("非奇非偶");
    expect(parity(fn("log(x)")).kind).toBe("非奇非偶");
  });
});
describe("conservative inverse generation", () => {
  it("requires an entire monotonic branch", () => {
    expect(createInverse(fn("x^2")).valid).toBe(false);
    const inv = createInverse(fn("x^2", parseDomain("[-3,0]")));
    expect(inv.expression).toBe("-sqrt(x)");
    expect(inv.domain).toEqual(parseDomain("[0,9]"));
    expect(createInverse(fn("sin(x)")).valid).toBe(false);
  });
  it("propagates ranges and open endpoints", () => {
    expect(createInverse(fn("exp(x)")).domain).toEqual(parseDomain("(0,∞)"));
    expect(createInverse(fn("log(x)")).domain).toEqual(ALL_DOMAIN);
    expect(createInverse(fn("sqrt(x)")).domain).toEqual(parseDomain("[0,∞)"));
    const inverse = createInverse(fn("-2x+3", parseDomain("[1,4)")));
    expect(inverse.domain).toEqual(parseDomain("(-5,1]"));
    expect(compileExpression(inverse.expression!)(1)).toBe(1);
    expect(
      compileExpression(createInverse(fn("x^3")).expression!)(-8),
    ).toBeCloseTo(-2);
  });
  it("inverts sinh and atan with exact unbounded ranges", () => {
    const hyper = createInverse(fn("sinh(x)"));
    expect(hyper.domain).toEqual(ALL_DOMAIN);
    expect(compileExpression(hyper.expression!)(Math.sinh(-2))).toBeCloseTo(-2);
    const arctan = createInverse(fn("atan(x)"));
    expect(arctan.domain).toEqual(parseDomain("(-pi/2,pi/2)"));
    expect(compileExpression(arctan.expression!)(Math.atan(3))).toBeCloseTo(3);
  });
  it("inverts affine transformed base functions conservatively", () => {
    for (const expression of [
      "2exp(3x-1)+4",
      "-3atan(-2x+1)+7",
      "2(x-3)^3-4",
    ]) {
      const source = fn(expression),
        inverse = createInverse(source);
      expect(inverse.valid).toBe(true);
      for (const x of [-1, 0, 2])
        expect(
          compileExpression(inverse.expression!)(evaluateFunction(source, x)),
        ).toBeCloseTo(x, 6);
    }
    const square = createInverse(fn("(x-3)^2", parseDomain("x>=3")));
    expect(square.valid).toBe(true);
    expect(compileExpression(square.expression!)(4)).toBeCloseTo(5);
    expect(createInverse(fn("(x-3)^2")).valid).toBe(false);
    expect(createInverse(fn("1/x")).valid).toBe(false);
  });
});
