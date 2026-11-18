import { describe, expect, it } from "vitest";
import { makeFunction } from "../services/transformEngine";
import {
  prepareFunction,
  refreshFunctionBindings,
} from "../services/functionContext";
import { evaluateFunction, sampleFunction } from "../services/functionSampler";
import {
  constantValue,
  derivativeChain,
  integrate,
  integralCurve,
  pointBehavior,
  taylorExpansion,
  functionIntegrand,
  taylorAgreement,
} from "../services/calculusEngine";
import {
  calculusCoordinates,
  graphInCoordinates,
  integralPointRelation,
  taylorPolynomial,
} from "../services/calculusRelations";
import {
  decodeProject,
  encodeProject,
  validateFunctions,
} from "../services/projectStore";
import { sourceParameterRange } from "../components/GraphCanvas";
import { fitSampledViewport, fitGraphViewport } from "../utils/fitViewport";

describe("connected calculus workspace", () => {
  it("uses the real branch of a cube root for plotting, derivatives and integration", () => {
    const source = prepareFunction("x^(1/3)");
    expect(evaluateFunction(source, -8)).toBe(-2);
    expect(evaluateFunction(source, 0)).toBe(0);
    expect(evaluateFunction(derivativeChain(source, 1)[0], -8)).toBeCloseTo(
      1 / 12,
    );
    expect(sampleFunction(source, -4, 4, 100)).toHaveLength(1);
    expect(integralPointRelation(source, -2, 0, []).slope).toBe(0);

    const lower = -2.94604;
    const upper = 2.58608;
    const result = integrate(functionIntegrand(source), lower, upper);
    expect(result.status).toBe("stable");
    expect(result.improper).toBe(false);
    expect(result.value).toBeCloseTo(
      (3 / 4) * (upper ** (4 / 3) - (-lower) ** (4 / 3)),
      6,
    );
  });

  it("checks the parity of the reduced denominator and numerator", () => {
    expect(evaluateFunction(prepareFunction("x^(2/6)"), -8)).toBe(-2);
    expect(evaluateFunction(prepareFunction("x^(2/3)"), -8)).toBeCloseTo(4);
    expect(evaluateFunction(prepareFunction("x^(-(1/3))"), -8)).toBe(-0.5);
    expect(evaluateFunction(prepareFunction("x^(1/3)"), 8)).toBe(2);
    expect(evaluateFunction(prepareFunction("x^(1/2)"), -8)).toBeNaN();
  });

  it("fits Taylor studies around their chosen expansion center", () => {
    const source = prepareFunction("sin(x)");
    const view = fitGraphViewport(
      [source, taylorPolynomial(source, 10, 5)],
      { width: 800, height: 500 },
      10,
    )!;
    expect(Math.abs((10 - view.cx) * view.scale)).toBeLessThan(400);
    expect(Math.abs((Math.sin(10) - view.cy) * view.scale)).toBeLessThan(250);
  });
  it("fits both the integrand and a vertically shifted primitive, also with swapped axes", () => {
    const curves = [
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      [
        { x: 0, y: 100 },
        { x: 1, y: 102 },
      ],
    ];
    for (const swapped of [false, true]) {
      const points = curves.map((curve) =>
        curve.map((p) => (swapped ? { x: p.y, y: p.x } : p)),
      );
      const view = fitSampledViewport(points, { width: 400, height: 300 })!;
      expect(
        points
          .flat()
          .every(
            (p) =>
              Math.abs((p.x - view.cx) * view.scale) < 200 &&
              Math.abs((p.y - view.cy) * view.scale) < 150,
          ),
      ).toBe(true);
    }
  });
  it("differentiates reverse coordinates with respect to y and retains source parameters", () => {
    const reverse = {
      ...prepareFunction("x=k*y^3+b"),
      parameters: { k: 2, b: 5 },
    };
    const { body, axis } = calculusCoordinates(reverse);
    expect(axis).toBe("y");
    expect(evaluateFunction(body, 2)).toBe(21);
    const derivative = graphInCoordinates(derivativeChain(body, 2)[1], axis);
    expect(sampleFunction(derivative, 0, 2, 20).flat().at(-1)).toEqual({
      x: 24,
      y: 2,
    });
    const polynomial = graphInCoordinates(taylorPolynomial(body, 1, 3), axis);
    expect(sampleFunction(polynomial, 0, 2, 20).flat().at(-1)?.x).toBeCloseTo(
      21,
    );
  });
  it("updates linked derivatives and Taylor layers, freezes on deletion, and survives export", () => {
    const source = prepareFunction("a*x^3");
    const derivative = {
      ...derivativeChain(source, 2)[1],
      calculusLink: {
        kind: "derivative" as const,
        sourceId: source.id,
        order: 2,
      },
    };
    const polynomial = {
      ...taylorPolynomial(source, 1, 2),
      calculusLink: {
        kind: "taylor" as const,
        sourceId: source.id,
        order: 2,
        center: 1,
      },
    };
    const updated = refreshFunctionBindings([
      { ...source, parameters: { a: 3 } },
      derivative,
      polynomial,
    ]);
    expect(evaluateFunction(updated[1], 2)).toBeCloseTo(36);
    expect(evaluateFunction(updated[2], 2)).toBeCloseTo(21);
    const restored = validateFunctions(decodeProject(encodeProject(updated)));
    const frozen = refreshFunctionBindings(restored.slice(1));
    expect(frozen.every((f) => f.calculusLink?.frozen)).toBe(true);
    expect(evaluateFunction(frozen[0], 2)).toBeCloseTo(36);
  });
  it("allows source edits that invalidate a saved Taylor layer, and recovers when valid again", () => {
    const source = prepareFunction("x^2");
    const layer = {
      ...taylorPolynomial(source, 0, 2),
      calculusLink: {
        kind: "taylor" as const,
        sourceId: source.id,
        order: 2,
        center: 0,
      },
    };
    const invalid = refreshFunctionBindings([
      { ...source, currentExpression: "abs(x)" },
      layer,
    ]);
    expect(invalid[1].calculusLink?.error).toBeTruthy();
    expect(evaluateFunction(invalid[1], 2)).toBeNaN();
    expect(sampleFunction(invalid[1], -2, 2)).toEqual([]);
    const recovered = refreshFunctionBindings([source, invalid[1]])[1];
    expect(recovered.calculusLink?.error).toBeUndefined();
    expect(evaluateFunction(recovered, 2)).toBeCloseTo(4);
    expect(() =>
      refreshFunctionBindings([
        {
          ...source,
          calculusLink: { kind: "derivative", sourceId: layer.id, order: 1 },
        },
        layer,
      ]),
    ).toThrow(/循环/);
  });
  it("separates actual integrand values, removable limits and one-sided integral slopes", () => {
    const removable = integralPointRelation(
      prepareFunction("x==0 ? 7 : sin(x)/x"),
      -1,
      0,
      [],
    );
    expect(removable.fValue).toBe(7);
    expect(removable.slope).toBeCloseTo(1);
    const jump = integralPointRelation(
      prepareFunction("x<0 ? -1 : 2"),
      -1,
      0,
      [],
    );
    expect(jump.value).toBeCloseTo(-1);
    expect(jump.slope).toBeNaN();
    expect(jump.leftSlope).toBe(-1);
    expect(jump.rightSlope).toBe(2);
    expect(
      integralPointRelation(prepareFunction("1/x"), 0, 0, []).value,
    ).toBeNaN();
    expect(
      integralPointRelation(prepareFunction("sin(1/x)"), 0, 0, []).slope,
    ).toBe(0);
    const continuous = integralPointRelation(
      prepareFunction("2*x"),
      1,
      3,
      [],
      4,
    );
    expect(continuous.value).toBeCloseTo(12);
    expect(continuous.slope).toBeCloseTo(6);
  });
  it("draws a cumulative function from an infinite lower bound and stops at poles", () => {
    const gaussian = integralCurve(
      (x) => Math.exp(-x * x),
      -Infinity,
      -2,
      2,
      [],
    );
    expect(gaussian.flat().find((p) => p.x === 0)?.y).toBeCloseTo(
      Math.sqrt(Math.PI) / 2,
      4,
    );
    const pole = integralCurve((x) => 1 / x, 1, -2, 2, [0]);
    expect(pole.flat().every((p) => p.x > 0)).toBe(true);
  });
  it("estimates a connected sampled agreement band and expands it with more Taylor terms", () => {
    const source = prepareFunction("sin(x)");
    const cubic = taylorAgreement(
      Math.sin,
      taylorExpansion(source, 0, 3).evaluate,
      0,
      -5,
      5,
      0.001,
    )!;
    const seventh = taylorAgreement(
      Math.sin,
      taylorExpansion(source, 0, 7).evaluate,
      0,
      -5,
      5,
      0.001,
    )!;
    expect(cubic.min).toBeCloseTo(-cubic.max);
    expect(seventh.max).toBeGreaterThan(cubic.max);
    expect(
      Math.abs(
        Math.sin(cubic.max) - taylorExpansion(source, 0, 3).evaluate(cubic.max),
      ),
    ).toBeCloseTo(0.001, 7);
    expect(taylorAgreement(Math.sin, (x) => x, 0, -5, 5, -1)).toBeNull();
  });
});

describe("reverse-axis equations", () => {
  it("draws vertical constants across the y viewport and rejects circular implicit input", () => {
    const fn = prepareFunction("x = 2");
    expect(fn.kind).toBe("relation");
    expect(
      sourceParameterRange(fn, [
        { x: -5, y: 10 },
        { x: 5, y: 20 },
      ]),
    ).toEqual([10, 20]);
    const points = sampleFunction(fn, 10, 20, 20).flat();
    expect(points.every((p) => Math.abs(p.x - 2) < 1e-12)).toBe(true);
    expect(points.at(-1)?.y).toBe(20);
    expect(() => prepareFunction("x=x+1")).toThrow();
  });
  it("uses y as variable, k and b as parameters, and persists editable relations", () => {
    let fn = prepareFunction("x=ky+b");
    expect(fn.variable).toBe("y");
    expect(fn.parameters).toEqual({ k: 1, b: 1 });
    fn = { ...fn, parameters: { k: 2, b: 3 } };
    expect(sampleFunction(fn, 0, 1, 16).flat().at(-1)).toEqual({ x: 5, y: 1 });
    const restored = validateFunctions(decodeProject(encodeProject([fn])))[0];
    expect(restored.inputAxis).toBe("y");
    const edited = prepareFunction("x=y^2", 0, [], fn);
    expect(edited.parameters).toEqual({});
    expect(
      sampleFunction(edited, -2, 2, 16)
        .flat()
        .some((p) => p.x === 4 && p.y === -2),
    ).toBe(true);
  });
  it("keeps named function dependencies live when the input axis is reversed", () => {
    const f = prepareFunction("f(x)=x^2");
    const relation = prepareFunction("x=f(y)", 1, [f]);
    const updated = refreshFunctionBindings([
      { ...f, currentExpression: "x^3" },
      relation,
    ])[1];
    expect(sampleFunction(updated, 0, 2, 16).flat().at(-1)).toEqual({
      x: 8,
      y: 2,
    });
    const frozen = refreshFunctionBindings([updated])[0];
    expect(frozen.currentExpression).toMatch(/^x = y\s*\^\s*3$/);
    const restored = validateFunctions(
      decodeProject(encodeProject([frozen])),
    )[0];
    expect(sampleFunction(restored, 0, 2, 16).flat().at(-1)).toEqual({
      x: 8,
      y: 2,
    });
  });
});
describe("higher derivatives and Taylor approximations", () => {
  it("calculates the 8th derivative and preserves cusps as undefined", () => {
    expect(
      evaluateFunction(derivativeChain(makeFunction("x^8"), 8)[7], 1),
    ).toBeCloseTo(40320, 5);
    expect(
      evaluateFunction(derivativeChain(makeFunction("abs(x)"), 2)[1], 0),
    ).toBeNaN();
    const jumpDerivative = derivativeChain(makeFunction("x<0 ? -1 : 2"), 2)[1];
    expect(evaluateFunction(jumpDerivative, 1)).toBe(0);
    expect(evaluateFunction(jumpDerivative, 0)).toBeNaN();
  });
  it("evaluates arbitrary centers, multiple points, zero order and approximation error", () => {
    const expansion = taylorExpansion(makeFunction("x^3"), 2, 3);
    expect(expansion.coefficients).toEqual([8, 12, 6, 1]);
    for (const x of [-1, 0, 1, 4])
      expect(expansion.evaluate(x)).toBeCloseTo(x ** 3, 10);
    expect(taylorExpansion(makeFunction("floor(x)"), 0.5, 0).evaluate(5)).toBe(
      0,
    );
    const sine = taylorExpansion(makeFunction("sin(x)"), 0, 9);
    expect(sine.evaluate(1)).toBeCloseTo(Math.sin(1), 7);
    expect(() => taylorExpansion(makeFunction("abs(x)"), 0, 3)).toThrow();
  });
});
describe("integral and discontinuity semantics", () => {
  it("recognizes jumps, isolated assignments and oscillation without confusing values and limits", () => {
    const jump = makeFunction("x<0 ? -1 : 2"),
      removable = makeFunction("x==0 ? 2 : sin(x)/x");
    expect(pointBehavior((x) => evaluateFunction(jump, x), 0).kind).toBe(
      "跳跃间断",
    );
    expect(pointBehavior((x) => evaluateFunction(removable, x), 0).kind).toBe(
      "可去间断",
    );
    expect(
      pointBehavior((x) => (x === 0 ? NaN : Math.sin(1 / x)), 0).kind,
    ).toBe("振荡或未确定");
    expect(pointBehavior((x) => 1 / Math.sqrt(Math.abs(x)), 0).kind).toBe(
      "无穷间断",
    );
    expect(pointBehavior((x) => Math.log(x), 0).kind).toBe("无穷间断");
    expect(
      sampleFunction(jump, -1, 1, 100).some(
        (segment) =>
          segment.some((p) => p.y < 0) && segment.some((p) => p.y > 0),
      ),
    ).toBe(false);
  });
  it("computes oriented integrals and cumulative values through a jump", () => {
    expect(integrate((x) => x * x, 2, 0).value).toBeCloseTo(-8 / 3, 8);
    const jump = (x: number) => (x < 0 ? -1 : 2);
    expect(integrate(jump, -2, 2, [0]).value).toBeCloseTo(2, 8);
    const curve = integralCurve(jump, -2, -3, 2, [0]);
    expect(curve[1].at(-1)?.y).toBeCloseTo(2, 5);
  });
  it("handles integrable unbounded endpoints and convergent infinite tails", () => {
    const singular = integrate((x) => 1 / Math.sqrt(x), 0, 1);
    expect(singular.status).toBe("stable");
    expect(singular.value).toBeCloseTo(2, 3);
    const tail = integrate((x) => Math.exp(-x), 0, Infinity);
    expect(tail.status).toBe("stable");
    expect(tail.value).toBeCloseTo(1, 7);
    expect(integrate((x) => 1 / (1 + x * x), 0, Infinity).value).toBeCloseTo(
      Math.PI / 2,
      4,
    );
    expect(
      integrate((x) => Math.exp(-x * x), -Infinity, Infinity).value,
    ).toBeCloseTo(Math.sqrt(Math.PI), 6);
  });
  it("does not return a Cauchy principal value as an ordinary improper integral", () => {
    for (const result of [
      integrate((x) => 1 / x, -1, 1, [0]),
      integrate((x) => 1 / x, 1, Infinity),
      integrate(() => 1, 0, Infinity),
    ]) {
      expect(result.status).toBe("unresolved");
      expect(result.value).toBeNaN();
    }
    expect(integrate((x) => 1 / x, -1, 1).pieces).toHaveLength(2);
    expect(integrate((x) => (x === 1 ? 0 : 1e-6 / (x - 1)), 0, 2).status).toBe(
      "unresolved",
    );
  });
  it("uses a controlled tail for sin(1/x), retaining an integral through the oscillatory point", () => {
    const f = functionIntegrand(makeFunction("sin(1/x)"));
    expect(integrate(f, 0, 1).value).toBeCloseTo(0.5040670619, 8);
    expect(integrate(f, -1, 1).value).toBeCloseTo(0, 10);
    expect(integrate(f, 0, 1e-4).value / 1e-4).toBeCloseTo(0, 3);
    expect(integrate(f, 0, -1).value).toBeCloseTo(0.5040670619, 8);
  });
  it("accepts constant expressions but excludes variables from bound fields", () => {
    expect(constantValue("pi/2")).toBe(Math.PI / 2);
    expect(constantValue("-∞", true)).toBe(-Infinity);
    expect(() => constantValue("x+1")).toThrow();
  });
});
