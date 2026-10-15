import { describe, expect, it } from "vitest";
import { piTickStep, formatPiTick, piAxisUsage } from "../utils/piTicks";
import { prepareFunction, composeFunctions } from "../services/functionContext";
describe("symbolic π coordinates", () => {
  it("uses exact π fractions while preserving actual world coordinates", () => {
    expect(piTickStep(55).step).toBeCloseTo(Math.PI);
    const step = { step: Math.PI / 2, numerator: 1, denominator: 2 };
    expect(formatPiTick(1, step)).toBe("π/2");
    expect(formatPiTick(2, step)).toBe("π");
    expect(formatPiTick(-3, step)).toBe("−3π/2");
    expect(formatPiTick(0, step)).toBe("0");
  });
  it("keeps π grid spacing legible across large zoom ranges", () => {
    for (const scale of [1e-12, 1, 13, 55, 200, 100000]) {
      const step = piTickStep(scale);
      expect(step.step * scale).toBeGreaterThanOrEqual(69.999);
      expect(step.step * scale).toBeLessThan(200);
      expect(formatPiTick(3, step)).toContain("π");
    }
  });
  it("detects π and trigonometry through composed function bindings", () => {
    const f = prepareFunction("f(t)=sin(t)"),
      g = prepareFunction("g(x)=x^2", 1, [f]);
    const h = composeFunctions(f, g, [f, g]);
    expect(piAxisUsage([h], "auto")).toEqual({ x: true, y: false });
    expect(piAxisUsage([prepareFunction("e^(pi*x)")], "auto").x).toBe(true);
    expect(piAxisUsage([prepareFunction("asin(x)")], "auto")).toEqual({
      x: true,
      y: true,
    });
  });
  it("allows explicit numeric or π modes and ignores hidden curves", () => {
    const f = prepareFunction("sin(x)");
    expect(piAxisUsage([{ ...f, visible: false }], "auto")).toEqual({
      x: false,
      y: false,
    });
    expect(piAxisUsage([f], "numeric")).toEqual({ x: false, y: false });
    expect(piAxisUsage([prepareFunction("x^2")], "pi")).toEqual({
      x: true,
      y: true,
    });
  });
});
