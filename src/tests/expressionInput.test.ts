import { describe, expect, it } from "vitest";
import {
  compileExpression,
  normalizeExpression,
  parseDomain,
  prepareExpression,
} from "../services/expressionParser";

describe("flexible classroom expression input", () => {
  it("accepts compact function calls while preserving operator precedence", () => {
    for (const input of ["sinx", "sin x", "sin(x)"])
      expect(compileExpression(input)(0.4)).toBeCloseTo(Math.sin(0.4));
    expect(compileExpression("sin2t + 1")(0.4)).toBeCloseTo(Math.sin(0.8) + 1);
    expect(compileExpression("sinx²")(0.4)).toBeCloseTo(Math.sin(0.16));
    expect(compileExpression("sincosx")(0.4)).toBeCloseTo(
      Math.sin(Math.cos(0.4)),
    );
    expect(compileExpression("lnm")(2)).toBeCloseTo(Math.log(2));
    expect(compileExpression("sin cos(t+1)")(0.4)).toBeCloseTo(
      Math.sin(Math.cos(1.4)),
    );
    expect(compileExpression("sinπt")(0.5)).toBeCloseTo(1);
    expect(compileExpression("e^Πn")(1)).toBeCloseTo(Math.exp(Math.PI));
    expect(compileExpression("e^Πt²")(0.5)).toBeCloseTo(
      Math.exp(Math.PI * 0.25),
    );
    expect(compileExpression("sinx*2")(0.4)).toBeCloseTo(2 * Math.sin(0.4));
  });
  it("detects the independent variable and retains other letters as parameters", () => {
    expect(prepareExpression("f(t)=m*t+n")).toEqual({
      expression: "m*t+n",
      variable: "t",
      name: "f",
      parameters: { m: 1, n: 1 },
      usedFunctions: [],
    });
    expect(prepareExpression("m*t+n").variable).toBe("t");
    expect(prepareExpression("sin(m)").variable).toBe("m");
    expect(prepareExpression("n²").variable).toBe("n");
    expect(
      compileExpression("m*t+n", { variable: "t", parameters: { m: 2, n: 3 } })(
        4,
      ),
    ).toBe(11);
    expect(compileExpression("a+1")(4)).toBe(5);
    expect(prepareExpression("f(t)=mt+n").expression).toBe("m*t+n");
    expect(
      compileExpression("m sin t", { variable: "t", parameters: { m: 2 } })(
        0.4,
      ),
    ).toBeCloseTo(2 * Math.sin(0.4));
    expect(
      compileExpression("sinmt", { variable: "t", parameters: { m: 2 } })(0.4),
    ).toBeCloseTo(Math.sin(0.8));
    expect(compileExpression("m*t+n")(4)).toBe(5);
    expect(normalizeExpression("q(n)=n²")).toBe("n^(2)");
  });
  it("evaluates nested built-in and registered custom functions", () => {
    const functions = { f: (x: number) => x * x, g: (x: number) => x + 1 };
    expect(
      prepareExpression("f(g(t))", Object.keys(functions)).usedFunctions,
    ).toEqual(["f", "g"]);
    expect(compileExpression("f(g(t))", { variable: "t", functions })(2)).toBe(
      9,
    );
    expect(compileExpression("sin(t²)+cos(exp(t))")(0.3)).toBeCloseTo(
      Math.sin(0.09) + Math.cos(Math.exp(0.3)),
    );
    expect(() => prepareExpression("f(g(t))")).toThrow();
    expect(() =>
      compileExpression("f(t,2)", { variable: "t", functions }),
    ).toThrow(/参数/);
    expect(
      compileExpression("sinc(t)", {
        variable: "t",
        functions: { sinc: (x) => x + 2 },
      })(1),
    ).toBe(3);
  });
  it("keeps unsafe syntax and unresolved identifiers rejected", () => {
    for (const input of [
      "x=3",
      "foo+1",
      "sinxyz",
      "[1,2]",
      "x.constructor",
      "f(x)=x;2",
      "constructor(t)",
    ])
      expect(() => compileExpression(input)).toThrow();
    expect(() => compileExpression("m*t", { variable: "t" })).toThrow(/符号/);
    expect(() =>
      compileExpression("t", { variable: "t", parameters: { m: Infinity } }),
    ).toThrow(/参数/);
    expect(() => prepareExpression("sin(t)=t")).toThrow();
    expect(() => parseDomain("[a,2]", "t")).toThrow(/常数/);
  });
  it("accepts inequalities using the selected variable", () => {
    expect(parseDomain("-2≤t≤π", "t")).toEqual(parseDomain("[-2,π]"));
    expect(parseDomain("n>0", "n")).toEqual(parseDomain("(0,∞)"));
    expect(() => parseDomain("x>0", "t")).toThrow(/t/);
  });
});
