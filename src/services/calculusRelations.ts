import type { FunctionDefinition } from "../types/function";
import { ALL_DOMAIN } from "../types/function";
import {
  derivativeChain,
  taylorExpansion,
  functionIntegrand,
  integrate,
  pointBehavior,
} from "./calculusEngine";

export function calculusCoordinates(fn: FunctionDefinition) {
  if (fn.calculusLink?.error) throw new Error(fn.calculusLink.error);
  if (fn.kind === "function") return { body: fn, axis: "x" as const };
  if (fn.inputAxis === "y" && fn.source)
    return {
      axis: "y" as const,
      body: {
        ...fn.source,
        parameters: fn.parameters,
        bindings: fn.bindings,
        liveBindings: fn.liveBindings,
        domain: fn.domain,
        domainConstraints: fn.domainConstraints,
        differentiabilityChecks: fn.differentiabilityChecks,
        calculusLink: undefined,
      },
    };
  throw new Error(
    "这条几何关系没有单一自变量；请选择 y=f(x) 或 x=g(y)，或先限制为一个函数分支。",
  );
}

export function graphInCoordinates(
  body: FunctionDefinition,
  axis: "x" | "y",
): FunctionDefinition {
  if (axis === "x") return body;
  return {
    ...body,
    kind: "relation",
    inputAxis: "y",
    variable: "y",
    currentExpression: `x = ${body.currentExpression}`,
    source: { ...body, calculusLink: undefined },
    reflection: { a: 1, b: -1, c: 0 },
  };
}

export function taylorPolynomial(
  body: FunctionDefinition,
  center: number,
  order: number,
): FunctionDefinition {
  const expansion = taylorExpansion(body, center, order);
  return {
    ...body,
    id: crypto.randomUUID(),
    alias: "T",
    name: `${order} 阶泰勒多项式`,
    originalExpression: expansion.expression,
    currentExpression: expansion.expression,
    domain: { ...ALL_DOMAIN },
    parameters: {},
    bindings: {},
    liveBindings: {},
    domainConstraints: [],
    differentiabilityChecks: [],
    transformHistory: [],
    calculusLink: undefined,
    source: undefined,
  };
}

/** Derived layers follow their source by identity; deletion keeps the last snapshot. */
export function rebuildCalculusLayer(
  fn: FunctionDefinition,
  origin: FunctionDefinition,
): FunctionDefinition {
  const link = fn.calculusLink!;
  const { body, axis } = calculusCoordinates(origin);
  const result = graphInCoordinates(
    link.kind === "derivative"
      ? derivativeChain(body, link.order).at(-1)!
      : taylorPolynomial(body, link.center ?? 0, link.order),
    axis,
  );
  return {
    ...result,
    id: fn.id,
    alias: fn.alias,
    name: fn.name,
    color: fn.color,
    visible: fn.visible,
    locked: fn.locked,
    lineStyle: fn.lineStyle,
    parentFunctionId: origin.id,
    calculusLink: { ...link, frozen: false, error: undefined },
  };
}

export function integralPointRelation(
  body: FunctionDefinition,
  anchor: number,
  x: number,
  breaks: number[],
  constant = 0,
) {
  const f = functionIntegrand(body),
    result = integrate(f, anchor, x, breaks),
    behavior = pointBehavior(f, x);
  let value = result.status === "stable" ? result.value + constant : NaN;
  // A zero-length integral at a pole does not define a local accumulation
  // function if neither adjacent improper integral exists.
  if (anchor === x && behavior.kind !== "连续" && Number.isFinite(x)) {
    const h = 1e-3 * Math.max(1, Math.abs(x));
    if (
      [x - h, x + h].every(
        (end) => integrate(f, x, end, breaks).status !== "stable",
      )
    )
      value = NaN;
  }
  let slope = NaN,
    leftSlope = NaN,
    rightSlope = NaN;
  if (Number.isFinite(value)) {
    if (behavior.kind === "连续") slope = f(x);
    else if (behavior.kind === "可去间断")
      slope = (behavior.left + behavior.right) / 2;
    else if (f.reciprocalSine && x === 0) slope = 0;
    else if (behavior.kind === "跳跃间断") {
      leftSlope = behavior.left;
      rightSlope = behavior.right;
    }
  }
  return {
    result,
    value,
    fValue: f(x),
    slope,
    leftSlope,
    rightSlope,
    behavior,
  };
}
