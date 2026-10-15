import { describe, expect, it } from "vitest";
import {
  prepareFunction,
  composeFunctions,
  refreshFunctionBindings,
  withFunctionNames,
} from "../services/functionContext";
import { evaluateFunction } from "../services/functionSampler";
import { derived } from "../services/transformEngine";
import {
  encodeProject,
  decodeProject,
  validateFunctions,
} from "../services/projectStore";

describe("live composition identity and domains", () => {
  it("distinguishes composition order and arbitrary input variables", () => {
    const f = prepareFunction("f(t)=t^2"),
      g = prepareFunction("g(m)=m+1", 1, [f]);
    expect(evaluateFunction(composeFunctions(f, g, [f, g]), 2)).toBe(9);
    expect(evaluateFunction(composeFunctions(g, f, [f, g]), 2)).toBe(5);
  });
  it("updates nested compositions on edits and parameter changes", () => {
    const f = prepareFunction("f(t)=a*t"),
      g = prepareFunction("g(x)=x+1", 1, [f]);
    const h = composeFunctions(f, g, [f, g]);
    const p = composeFunctions(h, g, [f, g, h]);
    const list = refreshFunctionBindings([
      { ...f, parameters: { a: 4 } },
      g,
      h,
      p,
    ]);
    expect(evaluateFunction(list[2], 2)).toBe(12);
    expect(evaluateFunction(list[3], 2)).toBe(16);
  });
  it("freezes deleted sources and does not attach to a reused alias", () => {
    const f = prepareFunction("f(x)=x^2"),
      g = prepareFunction("g(x)=x+1", 1, [f]);
    const h = composeFunctions(f, g, [f, g]);
    const before = refreshFunctionBindings([
      { ...f, currentExpression: "x^3" },
      g,
      h,
    ]);
    const remaining = refreshFunctionBindings(before.slice(1));
    const replacement = prepareFunction("f(x)=100*x", 3, remaining);
    const final = refreshFunctionBindings([...remaining, replacement]);
    expect(evaluateFunction(final[1], 2)).toBe(27);
    expect(final[1].liveBindings?.f).toBeUndefined();
  });
  it("rejects cycles before saving any state", () => {
    const f = prepareFunction("f(x)=x"),
      g = prepareFunction("g(x)=f(x)+1", 1, [f]);
    const edited = prepareFunction("g(x)", 0, [g], f);
    expect(() => refreshFunctionBindings([edited, g])).toThrow(/循环/);
  });
  it("retains both layers' domains after updates and storage round trips", () => {
    const f = {
      ...prepareFunction("f(t)=t^2"),
      domain: { min: 0, max: 3, minInclusive: true, maxInclusive: true },
    };
    const g = prepareFunction("g(x)=x+1", 1, [f]);
    const h = composeFunctions(f, g, [f, g]);
    const restored = refreshFunctionBindings(
      validateFunctions(decodeProject(encodeProject([f, g, h]))),
    );
    expect(evaluateFunction(restored[2], 1)).toBe(4);
    expect(evaluateFunction(restored[2], 3)).toBeNaN();
  });
  it("gives derived functions unique names without renumbering existing ones", () => {
    const f = prepareFunction("x^2"),
      g = prepareFunction("x+1", 1, [f]);
    const h = derived(f, "2*x", "导函数", "", "");
    const named = withFunctionNames([f, g, h]);
    expect(named.map((fn) => fn.alias)).toEqual(["f", "g", "h"]);
    expect(withFunctionNames(named.slice(1)).map((fn) => fn.alias)).toEqual([
      "g",
      "h",
    ]);
  });
});
