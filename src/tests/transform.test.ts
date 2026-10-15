import { describe, it, expect } from "vitest";
import { makeFunction, transform, reflect } from "../services/transformEngine";
import { evaluateFunction, sampleFunction } from "../services/functionSampler";
import { parseDomain } from "../services/expressionParser";
import { parseReflectionLine, reflectPoint } from "../services/symmetryEngine";
import {
  encodeProject,
  decodeProject,
  validateFunctions,
} from "../services/projectStore";
describe("transformation invariants", () => {
  it("preserves original and complete history", () => {
    const f = makeFunction("x^2");
    const g = transform(f, "y");
    const h = transform(g, "translate", 2, 3);
    expect(f.currentExpression).toBe("x^2");
    expect(h.originalExpression).toBe("x^2");
    expect(h.parentFunctionId).toBe(g.id);
    expect(h.transformHistory).toHaveLength(2);
    expect(evaluateFunction(h, 4)).toBe(7);
    expect(h.id).not.toBe(g.id);
  });
  it("reflects and scales restricted domains", () => {
    const f = { ...makeFunction("x^3"), domain: parseDomain("0<x≤2") };
    const y = transform(f, "y");
    expect(y.domain).toEqual(parseDomain("-2≤x<0"));
    expect(evaluateFunction(y, -1)).toBe(1);
    expect(evaluateFunction(y, 0)).toBeNaN();
    const scale = transform(f, "scale", -2, -2);
    expect(scale.domain).toEqual(parseDomain("-1≤x<0"));
    expect(evaluateFunction(scale, -1)).toBe(-16);
    expect(() => transform(f, "scale", 1, 0)).toThrow();
  });
  it("keeps f(abs(x)) holes and excluded zero", () => {
    const f = { ...makeFunction("x^3"), domain: parseDomain("1<x≤3") };
    const g = transform(f, "absX");
    expect(evaluateFunction(g, -2)).toBe(8);
    expect(evaluateFunction(g, 0)).toBeNaN();
    expect(evaluateFunction(g, 1)).toBeNaN();
    const shifted = transform(g, "translate", 2, 3);
    expect(evaluateFunction(shifted, 0)).toBe(11);
    expect(evaluateFunction(shifted, 2)).toBeNaN();
    const positive = { ...makeFunction("x"), domain: parseDomain("x>0") };
    expect(evaluateFunction(transform(positive, "absBoth"), 0)).toBeNaN();
  });
  it("implements all absolute value operators", () => {
    const f = makeFunction("x^3");
    expect(evaluateFunction(transform(f, "absY"), -2)).toBe(8);
    expect(evaluateFunction(transform(f, "negAbs"), 2)).toBe(-8);
    expect(evaluateFunction(transform(f, "absX"), -2)).toBe(8);
    expect(evaluateFunction(transform(f, "absBoth"), -2)).toBe(8);
  });
  it("geometric mirror remains a relation", () => {
    const f = makeFunction("x^2");
    const r = reflect(f, 1, -1, 0);
    expect(r.kind).toBe("relation");
    expect(sampleFunction(r, -2, 2, 100).flat()).toContainEqual({ x: 4, y: 2 });
    expect(() => transform(r, "y")).toThrow();
    expect(() => reflect(f, 0, 0, 1)).toThrow();
  });
});
describe("line geometry", () => {
  it("supports vertical horizontal slope and general forms", () => {
    expect(parseReflectionLine("x=2")).toEqual({ a: 1, b: 0, c: -2 });
    expect(parseReflectionLine("y=-2x+π")).toEqual({ a: 2, b: 1, c: -Math.PI });
    expect(parseReflectionLine("2x+3y-4=0")).toEqual({ a: 2, b: 3, c: -4 });
    expect(reflectPoint({ x: 1, y: 3 }, parseReflectionLine("y=x"))).toEqual({
      x: 3,
      y: 1,
    });
    expect(reflectPoint({ x: 1, y: 3 }, parseReflectionLine("x=2"))).toEqual({
      x: 3,
      y: 3,
    });
    expect(() => parseReflectionLine("y=x^2")).toThrow();
  });
});
describe("project persistence", () => {
  it("roundtrips infinite domains and relations", () => {
    const f = makeFunction("x^2");
    const r = reflect(f, 1, -1, 0);
    expect(validateFunctions(decodeProject(encodeProject([f, r])))).toEqual([
      f,
      r,
    ]);
    expect(validateFunctions([])).toEqual([]);
  });
  it("rejects corrupted or unsafe project records", () => {
    const f = makeFunction("x^2");
    expect(() => validateFunctions([f, { ...f }])).toThrow();
    expect(() =>
      validateFunctions([{ ...f, currentExpression: "x.constructor" }]),
    ).toThrow();
    expect(() => validateFunctions([{ ...f, domain: null }])).toThrow();
    expect(() => decodeProject("invalid")).toThrow();
    expect(() => validateFunctions([null])).toThrow(/数据不完整/);
    expect(() =>
      validateFunctions([{ ...f, domainConstraints: [null] }]),
    ).toThrow(/定义域约束无效/);
  });
});
