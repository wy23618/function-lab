import { describe, expect, it } from "vitest";
import {
  compileExpression,
  normalizeExpression,
  prepareExpression,
} from "../services/expressionParser";
import {
  prepareFunction,
  composeFunctions,
  refreshFunctionBindings,
} from "../services/functionContext";
import { evaluateFunction } from "../services/functionSampler";
import { transform } from "../services/transformEngine";
import {
  completeUserExpression,
  normalizeMathCharacters,
} from "../utils/userExpression";
import { ALL_DOMAIN } from "../types/function";

describe("comfortable user expression input", () => {
  it("accepts Chinese punctuation and full-width declarations without losing superscript meaning", () => {
    expect(compileExpression("ｆ（ｔ）＝２ｔ＋１")(2)).toBe(5);
    expect(prepareExpression("ｆ（ｔ）＝２ｔ＋１")).toMatchObject({
      name: "f",
      variable: "t",
    });
    expect(compileExpression("２（x＋１）＋x²")(2)).toBe(10);
    expect(normalizeMathCharacters("ｘ²＋１")).toBe("x²+1");
    expect(compileExpression("SIN（x）＋Cos（x）")(0.4)).toBeCloseTo(
      Math.sin(0.4) + Math.cos(0.4),
    );
  });
  it("accepts variable products and ordinary mathematical operator glyphs", () => {
    expect(compileExpression("x(x+1)")(2)).toBe(6);
    expect(compileExpression("t(t+1)")(2)).toBe(6);
    expect(compileExpression("f(m)=m(m+1)")(2)).toBe(6);
    expect(compileExpression("2⋅x−1∕2")(3)).toBe(5.5);
  });
  it("distinguishes a powered function from a powered argument", () => {
    expect(compileExpression("sin²x")(0.4)).toBeCloseTo(Math.sin(0.4) ** 2);
    expect(compileExpression("sinx²")(0.4)).toBeCloseTo(Math.sin(0.4 ** 2));
    expect(compileExpression("sin^2(x+1)")(0.4)).toBeCloseTo(
      Math.sin(1.4) ** 2,
    );
    expect(compileExpression("cos³(x^2+1)")(0.4)).toBeCloseTo(
      Math.cos(1.16) ** 3,
    );
    expect(compileExpression("sin²cosx")(0.4)).toBeCloseTo(
      Math.sin(Math.cos(0.4)) ** 2,
    );
  });
  it("supports common logarithm aliases while preserving the natural-log convention", () => {
    for (const input of ["lg(x)", "log10(x)", "LG x"])
      expect(compileExpression(input)(100)).toBeCloseTo(2);
    expect(compileExpression("log2(x)")(8)).toBeCloseTo(3);
    expect(compileExpression("lg100")(0)).toBeCloseTo(2);
    expect(compileExpression("log(x)")(Math.E)).toBeCloseTo(1);
    expect(compileExpression("ln(x)")(Math.E)).toBeCloseTo(1);
  });
  it("completes missing trailing brackets only at the editor boundary", () => {
    expect(completeUserExpression("sin（x")).toEqual({
      text: "sin(x)",
      completion: ")",
    });
    expect(completeUserExpression("f(g(x")).toEqual({
      text: "f(g(x))",
      completion: "))",
    });
    for (const input of ["sin(", "x+", "sin(x+", "x)+(", "|x"])
      expect(completeUserExpression(input).completion).toBe("");
    expect(() => compileExpression("sin(x")).toThrow(/括号/);
  });
  it("preserves exact registered function names, including names resembling built-ins", () => {
    const custom = prepareFunction("Sin(x)=x+1");
    const fn = prepareFunction("Sin(x)", 1, [custom]);
    expect(fn.currentExpression).toBe("Sin(x)");
    expect(evaluateFunction(fn, 2)).toBe(3);
    expect(evaluateFunction(transform(fn, "translate", 1, 0), 2)).toBe(2);
  });
  it("keeps unsupported and unsafe inputs rejected rather than guessing their meaning", () => {
    for (const input of [
      "[1,2]",
      "f（x）＝x；2",
      "constructor(x)",
      "x.constructor",
      "sinn(x)",
      "sin^-1(x)",
    ])
      expect(() => compileExpression(input)).toThrow();
    expect(normalizeExpression("sin^20(x)")).toContain("^(20)");
  });
});

describe("visible composition rules", () => {
  const f = prepareFunction("f(t)=t^2");
  const g = prepareFunction("g(x)=x+1", 1, [f]);
  it("accepts standard composition notation and preserves right-to-left evaluation", () => {
    for (const input of ["f(g(x))", "f∘g(x)", "(f∘g)(x)"])
      expect(evaluateFunction(prepareFunction(input, 2, [f, g]), 2)).toBe(9);
    expect(evaluateFunction(prepareFunction("(g∘f)(x)", 2, [f, g]), 2)).toBe(5);
    expect(evaluateFunction(prepareFunction("(f∘g∘g)(x)", 2, [f, g]), 2)).toBe(
      16,
    );
    expect(compileExpression("(sin∘cos)(x)")(0.4)).toBeCloseTo(
      Math.sin(Math.cos(0.4)),
    );
  });
  it("allows self-composition as a new function", () => {
    expect(evaluateFunction(composeFunctions(g, g, [f, g]), 2)).toBe(4);
  });
  it("requires the inner input and outer argument to be in their respective domains", () => {
    const restricted = {
      ...f,
      domain: { ...ALL_DOMAIN, min: 0, minInclusive: true },
    };
    const composed = composeFunctions(restricted, g, [restricted, g]);
    expect(evaluateFunction(composed, -2)).toBeNaN();
    expect(evaluateFunction(composed, -1)).toBe(0);
    expect(evaluateFunction(composed, 2)).toBe(9);
  });
  it("keeps a dependent result when a source is deleted and restores its live link on undo", () => {
    const h = composeFunctions(f, g, [f, g]);
    const list = refreshFunctionBindings([f, g, h]);
    const remaining = refreshFunctionBindings(
      list.filter((fn) => fn.id !== f.id),
    );
    expect(evaluateFunction(remaining[1], 2)).toBe(9);
    expect(remaining[1].liveBindings?.f).toBeUndefined();
    const restored = refreshFunctionBindings(list);
    expect(restored[2].liveBindings?.f).toBe(f.id);
  });
});
