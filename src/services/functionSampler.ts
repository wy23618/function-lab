import type { FunctionDefinition, GraphPoint } from "../types/function";
import { compileExpression, domainContains } from "./expressionParser";
import { expressionContext } from "./functionContext";
import { estimateSlope } from "./numericalDerivative";

const cache = new WeakMap<
  FunctionDefinition,
  Map<string, (x: number) => number>
>();
function compiledExpression(
  expression: string,
  fn: FunctionDefinition,
): (x: number) => number {
  let entries = cache.get(fn);
  if (!entries) {
    entries = new Map();
    cache.set(fn, entries);
  }
  let compiled = entries.get(expression);
  if (!compiled) {
    compiled = compileExpression(expression, expressionContext(fn));
    entries.set(expression, compiled);
  }
  return compiled;
}
const derivativeSources = new WeakMap<
  FunctionDefinition,
  Map<FunctionDefinition, FunctionDefinition>
>();
function contextualDerivativeSource(
  fn: FunctionDefinition,
  source: FunctionDefinition,
): FunctionDefinition {
  let sources = derivativeSources.get(fn);
  if (!sources) {
    sources = new Map();
    derivativeSources.set(fn, sources);
  }
  const found = sources.get(source);
  if (found) return found;
  const parameters = { ...source.parameters };
  for (const name of Object.keys(parameters))
    if (fn.parameters?.[name] !== undefined)
      parameters[name] = fn.parameters[name];
  const contextual = {
    ...source,
    parameters,
    differentiabilityChecks: source.differentiabilityChecks?.map((check) => ({
      ...check,
      source: check.source
        ? contextualDerivativeSource(fn, check.source)
        : undefined,
    })),
  };
  sources.set(source, contextual);
  return contextual;
}
export function evaluateFunction(fn: FunctionDefinition, x: number): number {
  if (fn.kind !== "function" || !domainContains(fn.domain, x)) return NaN;
  const constraints = (
    fn as FunctionDefinition & {
      domainConstraints?: {
        expression: string;
        domain: FunctionDefinition["domain"];
      }[];
    }
  ).domainConstraints;
  try {
    for (const constraint of constraints ?? []) {
      if (
        !domainContains(
          constraint.domain,
          compiledExpression(constraint.expression, fn)(x),
        )
      )
        return NaN;
    }
    for (const check of fn.differentiabilityChecks ?? []) {
      const z = compiledExpression(check.argument, fn)(x);
      if (!Number.isFinite(z)) return NaN;
      if (
        !Number.isFinite(
          estimateSlope(
            check.source
              ? (value) =>
                  evaluateFunction(
                    contextualDerivativeSource(fn, check.source!),
                    value,
                  )
              : compiledExpression(check.expression, fn),
            z,
          ),
        )
      )
        return NaN;
    }
    const evaluate = compiledExpression(fn.currentExpression, fn),
      value = evaluate(x);
    if (Number.isFinite(value) || !fn.differentiabilityChecks?.length)
      return value;
    // A symbolic derivative can introduce 0/0 at a removable point (e.g.
    // d(abs(x^2))/dx). Its source differentiability was checked above.
    let h = Math.max(1, Math.abs(x)) * 1e-5,
      previous = NaN;
    for (let i = 0; i < 24; i++, h /= 2) {
      const left = evaluate(x - h),
        right = evaluate(x + h),
        mean = left / 2 + right / 2;
      if (![left, right, mean].every(Number.isFinite)) continue;
      const tolerance = 1e-8 * (1 + Math.abs(mean));
      if (
        Math.abs(left - right) <= tolerance &&
        Number.isFinite(previous) &&
        Math.abs(mean - previous) <= tolerance
      )
        return mean;
      previous = mean;
    }
    return NaN;
  } catch {
    return NaN;
  }
}

export function sampleFunction(
  fn: FunctionDefinition,
  min: number,
  max: number,
  count = 1600,
): GraphPoint[][] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  count = Math.max(16, Math.min(20000, Math.floor(count)));
  if (fn.kind === "relation" && fn.source && fn.reflection) {
    const { a, b, c } = fn.reflection,
      norm = a * a + b * b;
    if (!Number.isFinite(norm) || norm === 0) return [];
    return sampleFunction(fn.source, min, max, count).map((segment) =>
      segment.map((p) => {
        const distance = (a * p.x + b * p.y + c) / norm;
        return { x: p.x - 2 * a * distance, y: p.y - 2 * b * distance };
      }),
    );
  }
  min = Math.max(min, fn.domain.min);
  max = Math.min(max, fn.domain.max);
  if (max < min) return [];
  if (max === min) {
    const y = evaluateFunction(fn, min);
    return Number.isFinite(y) ? [[{ x: min, y }]] : [];
  }
  const segments: GraphPoint[][] = [];
  let current: GraphPoint[] = [];
  const flush = () => {
    if (current.length) segments.push(current);
    current = [];
  };
  let previous: GraphPoint | undefined;
  let evaluations = 0;
  const budget = Math.max(12000, count * 30);
  // Subdivide curvature relative to its own amplitude. Absolute thresholds miss
  // scaled poles, while an endpoint jump alone misses even-order poles.
  const connect = (
    left: GraphPoint,
    right: GraphPoint,
    depth = 0,
    originalMagnitude = Math.max(Math.abs(left.y), Math.abs(right.y), 1e-300),
  ): void => {
    const x = (left.x + right.x) / 2;
    if (x === left.x || x === right.x) {
      current.push(right);
      return;
    }
    const y = evaluateFunction(fn, x);
    const q1 = evaluateFunction(fn, (left.x + x) / 2),
      q3 = evaluateFunction(fn, (x + right.x) / 2);
    evaluations += 3;
    const mid = { x, y };
    const values = [left.y, q1, y, q3, right.y];
    const finite = values.every(Number.isFinite);
    const magnitude = Math.max(...values.map(Math.abs), 1e-300);
    const spread = Math.max(...values) - Math.min(...values);
    const error = Math.max(
      Math.abs(y - (left.y / 2 + right.y / 2)),
      Math.abs(q1 - (left.y * 0.75 + right.y * 0.25)),
      Math.abs(q3 - (left.y * 0.25 + right.y * 0.75)),
    );
    const needsRefinement =
      !finite || error > 0.15 * Math.max(spread, magnitude * 0.001);
    if (needsRefinement) {
      if (depth >= 24 || evaluations >= budget) {
        const overshoot = [q1, y, q3].some(
          (v) => v < Math.min(left.y, right.y) || v > Math.max(left.y, right.y),
        );
        const peak =
          magnitude >
          1.01 * Math.max(Math.abs(left.y), Math.abs(right.y), 1e-300);
        if (
          !finite ||
          peak ||
          magnitude > originalMagnitude * 16 ||
          (left.y * right.y < 0 && overshoot)
        )
          flush();
        current.push(right);
        return;
      }
      if (Number.isFinite(y)) {
        connect(left, mid, depth + 1, originalMagnitude);
        connect(mid, right, depth + 1, originalMagnitude);
      } else {
        flush();
        current.push(right);
      }
    } else current.push(right);
  };
  for (let i = 0; i <= count; i++) {
    const x = min + ((max - min) * i) / count,
      y = evaluateFunction(fn, x);
    if (!Number.isFinite(y)) {
      flush();
      previous = undefined;
      continue;
    }
    const point = { x, y };
    if (previous) connect(previous, point);
    else current.push(point);
    previous = point;
  }
  flush();
  return segments;
}
